#!/usr/bin/env python3
"""Enable safe, scheduled YouTube prospecting in existing Radar worker.
No DB migration, no changes to credentials, no autonomous channel approval.
"""
import argparse
from pathlib import Path
from datetime import datetime, timezone
import shutil

OLD="if(process.env.RADAR_YOUTUBE_BULK==='1'){try{const bulk=await prospectYoutubeBulk(discovery,db,{limit:5});"
NEW="if(process.env.RADAR_YOUTUBE_BULK!=='0'){try{const bulk=await prospectYoutubeBulk(discovery,db,{limit:5,dailyLimit:20});"

parser=argparse.ArgumentParser()
parser.add_argument('--target',required=True)
parser.add_argument('--check',action='store_true')
parser.add_argument('--rollback',help='Backup file produced by installation')
args=parser.parse_args()
path=Path(args.target).resolve()/'scripts/operations.mjs'
if not path.is_file(): raise SystemExit(f'ERRO: Arquivo não encontrado: {path}')
if args.rollback:
    backup=Path(args.rollback).resolve()
    if backup.parent!=path.parent or not backup.name.startswith('operations.mjs.backup-') or not backup.is_file():
        raise SystemExit('ERRO: backup deve pertencer à pasta scripts')
    if args.check: print('Backup apto para reversão:',backup);raise SystemExit(0)
    shutil.copy2(backup,path)
    print('Reversão concluída:',path)
    raise SystemExit(0)
content=path.read_text(encoding='utf-8')
if content.count(NEW)==1 and OLD not in content:
    print('JÁ INSTALADO: nenhuma alteração necessária')
    raise SystemExit(0)
if content.count(OLD)!=1:
    raise SystemExit('ERRO: versão não compatível, nenhuma alteração aplicada')
print('COMPATÍVEL:',path)
if args.check: raise SystemExit(0)
backup=path.with_name('operations.mjs.backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
shutil.copy2(path,backup)
path.write_text(content.replace(OLD,NEW),encoding='utf-8')
print('INSTALADO:',path)
print('BACKUP:',backup)
print('DESATIVAR: variável RADAR_YOUTUBE_BULK=0 no worker')
