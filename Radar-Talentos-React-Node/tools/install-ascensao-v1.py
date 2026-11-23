#!/usr/bin/env python3
"""Idempotent deployment. Never touches SQLite, .env, Docker or worker config."""
import argparse, shutil, datetime, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--target',required=True);parser.add_argument('--check',action='store_true');args=parser.parse_args()
target=pathlib.Path(args.target).resolve();app=target/'server/src/app.mjs';dash=target/'dashboard'
if not app.exists() or not (dash/'index.html').exists():sys.exit('ERRO: informe a raiz de Radar-Talentos-React-Node')
original=app.read_text(encoding='utf-8');imp="import { risingDiscoveries } from './rising-discoveries.mjs';\n"
route="""      if (path === '/api/discoveries/rising') {
        if (!database) { res.writeHead(503).end(); return; }
        const raw=new URL(req.url,'http://localhost').searchParams.get('limit');
        const limit=raw===null?50:Number(raw);
        if (!Number.isInteger(limit)||limit<1||limit>100) {res.writeHead(400).end();return;}
        const result=risingDiscoveries(database,{limit});
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;
      }
"""
anchor="      if (path === '/api/current-media') {"
if anchor not in original:sys.exit('ERRO: app.mjs mudou; revisar âncora antes de aplicar')
if "'/api/discoveries/rising'" not in original:
    original=(imp+original if imp not in original else original).replace(anchor,route+anchor,1)
changes={app:original}
for html in dash.glob('*.html'):
    if html.name=='rising.html':continue
    s=html.read_text(encoding='utf-8')
    if '</head>' not in s or '</nav>' not in s:continue
    if '/rising.css' not in s:s=s.replace('</head>','<link rel="stylesheet" href="/rising.css"><script defer src="/rising-notifications.js"></script></head>',1)
    if 'href="/rising.html"' not in s:
        s=s.replace('</nav>','<a href="/rising.html">↗ Novas descobertas</a></nav>',1)
    changes[html]=s
for f in ['rising.html','rising.js','rising.css','rising-notifications.js']:
    changes[dash/f]=(ROOT/'dashboard'/f).read_bytes()
changes[target/'server/src/rising-discoveries.mjs']=(ROOT/'server/src/rising-discoveries.mjs').read_bytes()
changes[target/'tests/rising-discoveries.test.mjs']=(ROOT/'tests/rising-discoveries.test.mjs').read_bytes()
print('Arquivos preparados:',len(changes))
for p,c in changes.items():
    cur=p.read_bytes() if p.exists() else None
    data=c.encode() if isinstance(c,str) else c
    if cur!=data:print('ALTERAR',p.relative_to(target))
if args.check:sys.exit(0)
backup=target/('.radar-ascensao-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
backup.mkdir();manifest=[]
for p,c in changes.items():
    data=c.encode() if isinstance(c,str) else c
    if p.exists() and p.read_bytes()==data:continue
    relative=p.relative_to(target)
    if p.exists():
        dst=backup/relative;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst);manifest.append('EXISTIA '+str(relative))
    else:manifest.append('NOVO '+str(relative))
    p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
(backup/'MANIFESTO.txt').write_text('\n'.join(manifest)+'\n',encoding='utf-8')
print('Instalação aplicada. Backup:',backup)
