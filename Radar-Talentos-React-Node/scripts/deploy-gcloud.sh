#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-deploy}"
TARGET_BACKUP="${2:-}"
REPO_DIR="${RADAR_REPO_DIR:-$HOME/radar-github-sync}"
APP_DIR="${RADAR_APP_DIR:-/opt/radar}"
BACKUP_ROOT="${RADAR_RELEASE_BACKUP_DIR:-$HOME/radar-backups}"
BRANCH="${RADAR_BRANCH:-main}"
HEALTH_URL="${RADAR_HEALTH_URL:-http://127.0.0.1:3000/api/health}"

mkdir -p "$BACKUP_ROOT"

wait_for_health() {
  local attempts=20
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if curl -fsS "$HEALTH_URL" | grep -q '"ok":true'; then
      echo "[OK] Healthcheck aprovado em $HEALTH_URL (tentativa $i/$attempts)."
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo "[ERRO] Healthcheck falhou apos $attempts tentativas."
  return 1
}

restore_backup() {
  local backup_dir="$1"
  if [ -z "$backup_dir" ] || [ ! -d "$backup_dir/code" ]; then
    echo "[ERRO] Backup invalido ou inexistente: $backup_dir"
    exit 1
  fi
  echo "[ROLLBACK] Restaurando codigo a partir de $backup_dir/code ..."
  for dir in dashboard server/src scripts tests database; do
    if [ -d "$backup_dir/code/$dir" ]; then
      mkdir -p "$APP_DIR/$dir"
      rsync -rc --delete "$backup_dir/code/$dir/" "$APP_DIR/$dir/"
    fi
  done
  for file in package.json package-lock.json Dockerfile index.html vite.config.mjs; do
    if [ -f "$backup_dir/code/$file" ]; then
      cp -f "$backup_dir/code/$file" "$APP_DIR/$file"
    fi
  done
  cd "$APP_DIR"
  sudo docker compose --env-file .env.worker build radar worker
  sudo docker compose --env-file .env.worker up -d radar worker
  wait_for_health
  echo "[ROLLBACK] Concluido com sucesso."
}

if [ "$ACTION" = "rollback" ]; then
  if [ -z "$TARGET_BACKUP" ]; then
    if [ -f "$BACKUP_ROOT/LATEST" ]; then
      TARGET_BACKUP="$(cat "$BACKUP_ROOT/LATEST")"
    else
      echo "[ERRO] Nenhum backup anterior registrado em $BACKUP_ROOT/LATEST."
      exit 1
    fi
  fi
  restore_backup "$TARGET_BACKUP"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/release-$STAMP"
mkdir -p "$BACKUP_DIR/code"

echo "[1/5] Criando backup do codigo atual de $APP_DIR em $BACKUP_DIR/code ..."
for dir in dashboard server/src scripts tests database; do
  if [ -d "$APP_DIR/$dir" ]; then
    mkdir -p "$BACKUP_DIR/code/$dir"
    rsync -rc "$APP_DIR/$dir/" "$BACKUP_DIR/code/$dir/"
  fi
done
for file in package.json package-lock.json Dockerfile index.html vite.config.mjs compose.yaml; do
  if [ -f "$APP_DIR/$file" ]; then
    cp -f "$APP_DIR/$file" "$BACKUP_DIR/code/$file"
  fi
done
echo "$BACKUP_DIR" > "$BACKUP_ROOT/LATEST"

echo "[2/5] Criando snapshot consistente dos bancos SQLite persistentes no volume ..."
sudo docker exec radar-talentos-radar-1 node --experimental-sqlite -e "
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {backupDatabase} from '/app/server/src/backup.mjs';
const dir = '/app/backups/pre-deploy-$STAMP';
mkdirSync(dir, {recursive: true});
for (const name of ['radar.sqlite', 'discovery.sqlite']) {
  const db = new DatabaseSync('/app/data/' + name, {readOnly: true});
  try { backupDatabase(db, dir + '/' + name); } finally { db.close(); }
}
console.log('Backups SQLite gravados em ' + dir);
" || echo "[AVISO] Container nao estava ativo para backup online; volumes externos preservados."

echo "[3/5] Atualizando repositorio Git em $REPO_DIR (branch $BRANCH) ..."
cd "$REPO_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
git rev-parse --short HEAD > "$BACKUP_DIR/deployed-commit.txt"

echo "[4/5] Sincronizando arquivos para $APP_DIR (preservando .env.worker, config e volumes) ..."
SRC_DIR="$REPO_DIR/Radar-Talentos-React-Node"
for dir in dashboard server/src scripts tests database; do
  mkdir -p "$APP_DIR/$dir"
  rsync -rc --delete \
    --exclude='.env*' \
    --exclude='*.sqlite*' \
    --exclude='*.db*' \
    --exclude='*.pem' \
    --exclude='*.key' \
    "$SRC_DIR/$dir/" "$APP_DIR/$dir/"
done
for file in package.json package-lock.json Dockerfile index.html vite.config.mjs; do
  if [ -f "$SRC_DIR/$file" ]; then
    cp -f "$SRC_DIR/$file" "$APP_DIR/$file"
  fi
done

echo "[5/5] Reconstruindo e reiniciando containers Docker (radar + worker) ..."
cd "$APP_DIR"
sudo docker exec -u 0 radar-talentos-radar-1 chown -R node:node /app/data /app/backups 2>/dev/null || true
sudo docker compose --env-file .env.worker build radar worker
sudo docker compose --env-file .env.worker up -d radar worker

if ! wait_for_health; then
  echo "[ALERTA] Falha no healthcheck apos deploy! Iniciando rollback automatico..."
  restore_backup "$BACKUP_DIR"
  exit 1
fi

echo "[SUCESSO] Deploy concluido! Commit: $(cat "$BACKUP_DIR/deployed-commit.txt") | Backup: $BACKUP_DIR"
