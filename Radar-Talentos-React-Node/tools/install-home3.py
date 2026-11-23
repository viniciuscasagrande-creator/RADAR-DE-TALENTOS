#!/usr/bin/env python3
"""Safe, idempotent UI-only installer for Radar Home 3.0."""
import argparse
import datetime
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = ('index.html', 'home3.js', 'home3.css')
CSS = '<link rel="stylesheet" href="/home3.css" />'
JS = '<script defer src="/home3.js"></script>'


def _source_file(name: str) -> pathlib.Path:
    for candidate in (ROOT / 'home3' / name, ROOT / 'dashboard' / name):
        if candidate.is_file():
            return candidate
    raise RuntimeError(f'Arquivo fonte não encontrado: {name}')


def apply(target: pathlib.Path, backup_root: pathlib.Path, check_only: bool):
    dashboard = target / 'dashboard'
    html_path = dashboard / 'index.html'
    if not html_path.is_file():
        raise RuntimeError(f'Home não encontrada: {html_path}')
    html = html_path.read_text(encoding='utf-8')
    if 'intelligence-studio.js' not in html or 'id="overview"' not in html:
        raise RuntimeError('A instalação exige a Home V2 com intelligence-studio.js e #overview; nenhuma alteração realizada.')
    if '</head>' not in html:
        raise RuntimeError('HTML incompatível: </head> ausente.')
    new_html = html
    if CSS not in new_html:
        new_html = new_html.replace('</head>', CSS + '</head>', 1)
    if JS not in new_html:
        new_html = new_html.replace('</head>', JS + '</head>', 1)
    assert new_html.count(CSS) == 1 and new_html.count(JS) == 1
    if check_only:
        print('COMPATÍVEL: Home V2 encontrada; nenhuma alteração feita.')
        return None
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup = backup_root / f'home3-{stamp}'
    backup.mkdir(parents=True, exist_ok=False)
    for name in FILES:
        src = dashboard / name
        if src.exists():
            shutil.copy2(src, backup / name)
    (backup / 'MANIFEST.txt').write_text('\n'.join(name for name in FILES if (backup / name).exists()), encoding='utf-8')
    try:
        for name in ('home3.js', 'home3.css'):
            src = _source_file(name)
            dst = dashboard / name
            if src.resolve() != dst.resolve():
                shutil.copy2(src, dst)
        html_path.write_text(new_html, encoding='utf-8')
    except Exception:
        rollback(target, backup)
        raise
    print(f'INSTALADO: {dashboard}\nBACKUP: {backup}\nSem alterações nos bancos, APIs ou credenciais.')
    return backup


def rollback(target: pathlib.Path, backup: pathlib.Path):
    dashboard = target / 'dashboard'
    if not (backup / 'MANIFEST.txt').is_file():
        raise RuntimeError('Manifesto de backup não encontrado; rollback interrompido.')
    originals = set((backup / 'MANIFEST.txt').read_text(encoding='utf-8').splitlines())
    for name in FILES:
        dst = dashboard / name
        if name in originals:
            shutil.copy2(backup / name, dst)
        elif dst.exists():
            dst.unlink()
    print(f'REVERTIDO: {dashboard} a partir de {backup}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Radar — instalador seguro Home 3.0')
    ap.add_argument('--target', required=True, type=pathlib.Path, help='Pasta do projeto que contém dashboard/')
    ap.add_argument('--backup-root', type=pathlib.Path, default=pathlib.Path.home() / 'radar-ui-backups')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--rollback', type=pathlib.Path)
    args = ap.parse_args()
    try:
        if args.rollback:
            rollback(args.target, args.rollback)
        else:
            apply(args.target, args.backup_root, args.check)
    except Exception as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        raise SystemExit(1)
