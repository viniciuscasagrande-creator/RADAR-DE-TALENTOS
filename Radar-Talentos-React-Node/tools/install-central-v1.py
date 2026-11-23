#!/usr/bin/env python3
"""Instala integração central apenas em app.mjs, com backup e dry-run."""
import argparse, pathlib, shutil, datetime, subprocess
p=argparse.ArgumentParser();p.add_argument('--target',required=True);p.add_argument('--check',action='store_true');a=p.parse_args()
root=pathlib.Path(a.target).resolve(); package=pathlib.Path(__file__).resolve().parents[1]
app=root/'server/src/app.mjs'; new=root/'server/src/indicator-distribution.mjs'; test=root/'tests/indicator-distribution.test.mjs'
assert app.is_file(),f'app.mjs ausente: {app}'
s=app.read_text(encoding='utf-8')
imp="import { distributeArtistStats } from './indicator-distribution.mjs';\n"
anchor="import { currentDashboard } from './discovery/current-dashboard.mjs';\n"
route="""      if (path === '/api/indicators/artist') {
        if (!database) { res.writeHead(503).end(); return; }
        const p = new URL(req.url, 'http://localhost').searchParams;
        const talent = p.get('talent') || '';
        const end = p.get('end') || new Date().toISOString().slice(0,10);
        if (!talent || talent.length > 150 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(end)) {
          res.writeHead(400, {'Content-Type':'application/json'}).end(JSON.stringify({error:'Parâmetros inválidos'})); return;
        }
        let ddb = null;
        try {
          try { ddb=openDiscovery(); } catch { /* O motor deve continuar consultável sem Discovery */ }
          const source=getArtistMediaStats(database,talent,{end,discoveryDb:ddb});
          if (!source) { res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Artista não encontrado'})); return; }
          const data=distributeArtistStats(source,{end});
          res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(data));
        } finally { ddb?.close(); }
        return;
      }
"""
anchor_route="      if (path === '/api/current-media') {"
if imp not in s:
 assert s.count(anchor)==1,'Âncora de importação mudou'
 s=s.replace(anchor,imp+anchor,1)
if "if (path === '/api/indicators/artist')" not in s:
 assert s.count(anchor_route)==1,'Âncora de rota mudou'
 s=s.replace(anchor_route,route+anchor_route,1)
if a.check:
 print('COMPATÍVEL: instalação não executada');quit()
for file in [app,new,test]:
 if file.exists():
  backup=file.with_suffix(file.suffix+'.backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'))
  shutil.copy2(file,backup)
new.parent.mkdir(parents=True,exist_ok=True);test.parent.mkdir(parents=True,exist_ok=True)
src_new=package/'server/src/indicator-distribution.mjs'
src_test=package/'tests/indicator-distribution.test.mjs'
if src_new.resolve()!=new.resolve():shutil.copy2(src_new,new)
if src_test.resolve()!=test.resolve():shutil.copy2(src_test,test)
app.write_text(s,encoding='utf-8')
for f in [app,new,test]:subprocess.run(['node','--check',str(f)],check=True)
print('INTEGRAÇÃO INSTALADA: /api/indicators/artist. Backups disponíveis.')
