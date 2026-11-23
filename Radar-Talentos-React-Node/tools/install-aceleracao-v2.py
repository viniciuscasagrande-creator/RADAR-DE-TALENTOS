#!/usr/bin/env python3
"""V2 standalone with V1, additive deployment; never touches databases/config/secrets."""
import argparse,datetime,pathlib,shutil,sys
P=argparse.ArgumentParser();P.add_argument('--target',required=True);P.add_argument('--check',action='store_true');a=P.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];t=pathlib.Path(a.target).resolve();app=t/'server/src/app.mjs';dash=t/'dashboard'
if not app.is_file() or not (dash/'index.html').is_file():sys.exit('ERRO: target deve ser raiz Radar-Talentos-React-Node')
s=app.read_text(encoding='utf-8');anchor="      if (path === '/api/current-media') {"
if anchor not in s:sys.exit('ERRO: app.mjs mudou; revisar manualmente a ancora')
imports="import { risingDiscoveries } from './rising-discoveries.mjs';\nimport { accelerationDiscoveries } from './acceleration-discoveries.mjs';\n"
for line in imports.splitlines(keepends=True):
 if line not in s:s=line+s
routes=[("'/api/discoveries/rising'","""      if (path === '/api/discoveries/rising') {
        if(!database){res.writeHead(503).end();return;}
        const raw=new URL(req.url,'http://localhost').searchParams.get('limit');const limit=raw===null?50:Number(raw);
        if(!Number.isInteger(limit)||limit<1||limit>100){res.writeHead(400).end();return;}
        const result=risingDiscoveries(database,{limit});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;
      }
"""),("'/api/discoveries/acceleration'","""      if (path === '/api/discoveries/acceleration') {
        if(!database){res.writeHead(503).end();return;}
        const raw=new URL(req.url,'http://localhost').searchParams.get('limit');const limit=raw===null?50:Number(raw);
        if(!Number.isInteger(limit)||limit<1||limit>100){res.writeHead(400).end();return;}
        const result=accelerationDiscoveries(database,{limit});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;
      }
""")]
for needle,route in routes:
 if needle not in s:s=s.replace(anchor,route+anchor,1)
changes={app:s.encode()}
for f in ['rising-discoveries.mjs','acceleration-discoveries.mjs']:
 changes[t/'server/src'/f]=(root/'server/src'/f).read_bytes()
for f in ['rising.html','rising.js','rising.css','rising-notifications.js','acceleration.js']:
 changes[dash/f]=(root/'dashboard'/f).read_bytes()
for f in ['rising-discoveries.test.mjs','acceleration-discoveries.test.mjs']:
 changes[t/'tests'/f]=(root/'tests'/f).read_bytes()
for html in dash.glob('*.html'):
 if html.name=='rising.html':continue
 original=html.read_text(encoding='utf-8');modified=original
 if '</head>' not in modified or '</nav>' not in modified:continue
 if '/rising.css' not in modified:modified=modified.replace('</head>','<link rel="stylesheet" href="/rising.css"><script defer src="/rising-notifications.js"></script></head>',1)
 if 'href="/rising.html"' not in modified:modified=modified.replace('</nav>','<a href="/rising.html">↗ Novas descobertas</a></nav>',1)
 changes[html]=modified.encode()
changed=[(p,b) for p,b in changes.items() if not p.exists() or p.read_bytes()!=b]
for p,_ in changed:print('ALTERAR',p.relative_to(t))
print('Arquivos alterados:',len(changed))
if a.check:sys.exit(0)
if not changed:print('Sem alterações.');sys.exit(0)
backup=t/('.radar-acceleracao-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f'));backup.mkdir();manifest=[]
for p,b in changed:
 rel=p.relative_to(t)
 if p.exists():dst=backup/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst);manifest.append('EXISTIA '+str(rel))
 else:manifest.append('NOVO '+str(rel))
 p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
(backup/'MANIFESTO.txt').write_text('\n'.join(manifest)+'\n',encoding='utf-8')
print('Backup:',backup)
