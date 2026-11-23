#!/usr/bin/env python3
"""Idempotent installer for Radar's Home-only Intelligence Studio.
Usage: python3 install-redesign.py --target /opt/radar
       python3 install-redesign.py --target /opt/radar --check
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,shutil,subprocess,sys

p=argparse.ArgumentParser();p.add_argument('--target',required=True);p.add_argument('--check',action='store_true');args=p.parse_args()
root=Path(args.target).resolve();dashboard=root/'dashboard';html=dashboard/'index.html';src=Path(__file__).resolve().parent.parent/'dashboard'
if not html.is_file() or not (dashboard/'audience-dashboard.js').is_file() or not (dashboard/'talent-home.css').is_file():
    sys.exit('ERRO: esta pasta não contém a Home esperada do Radar.')
needle='<script defer src="/intelligence-studio.js"></script>'
style='<link href="/intelligence-studio.css" rel="stylesheet"/>'
old=html.read_text(encoding='utf-8')
if '<main' not in old or '<head>' not in old or '<body' not in old:sys.exit('ERRO: HTML incompatível.')
updated=old
if style not in updated:updated=updated.replace('</head>',style+'</head>',1)
if needle not in updated:updated=updated.replace('</head>',needle+'</head>',1)
if args.check:
    print('Arquivo HTML:',html)
    print('Atualização HTML necessária:',updated!=old)
    for name in ['intelligence-studio.css','intelligence-studio.js']:
        print(name,'existe:',(dashboard/name).exists())
    sys.exit(0)
backup=root/'.redesign-backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup.mkdir(parents=True,exist_ok=True)
for file in [html,dashboard/'intelligence-studio.css',dashboard/'intelligence-studio.js']:
    if file.is_file():shutil.copy2(file,backup/file.name)
for name in ['intelligence-studio.css','intelligence-studio.js']:
    shutil.copy2(src/name,dashboard/name)
html.write_text(updated,encoding='utf-8')
try:subprocess.run(['node','--check',str(dashboard/'intelligence-studio.js')],check=True)
except Exception as e:
    shutil.copy2(backup/html.name,html)
    sys.exit('Falha no teste JavaScript. HTML restaurado: '+str(e))
print('INSTALADO: Home Intelligence Studio; backup:',backup)
print('Nenhum banco, credencial ou API foi modificado.')
