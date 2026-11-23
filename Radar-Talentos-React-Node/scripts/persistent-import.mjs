import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, existsSync, writeFileSync, unlinkSync, rmdirSync, mkdtempSync, rmSync, linkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {backupDatabase} from '../server/src/backup.mjs';
import {pathToFileURL} from 'node:url';
// Uso offline: origem deve estar sem escritores durante a migração dos dois bancos.
export function importPair(source, destination){
  const src=resolve(source), dest=resolve(destination);if(src===dest)throw Error('Origem e destino iguais');
  mkdirSync(dest,{recursive:true});const lock=join(dest,'.import-lock');mkdirSync(lock);
  let stage;const published=[];let completed=false;
  try{
    const names=['radar.sqlite','discovery.sqlite'], marker=join(dest,'.radar-persistent-v1');
    if([marker,...names.flatMap(n=>[join(dest,n),join(dest,n+'-wal'),join(dest,n+'-shm')])].some(existsSync))throw Error('Destino já contém dados; não será sobrescrito');
    stage=mkdtempSync(join(dest,'.stage-'));
    for(const [name,table] of [['radar.sqlite','talents'],['discovery.sqlite','candidates']]){
      const file=join(src,name);if(!existsSync(file))throw Error('Origem ausente: '+name);
      const db=new DatabaseSync(file,{readOnly:true});try{db.exec('PRAGMA busy_timeout=5000');if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('Banco incompatível: '+name);backupDatabase(db,join(stage,name));}finally{db.close();}
    }
    for(const name of names){const out=join(dest,name);linkSync(join(stage,name),out);published.push(out);}
    writeFileSync(marker,'radar persistent v1\n',{flag:'wx',mode:0o600});completed=true;
    return names;
  }finally{if(!completed)for(const f of published)unlinkSync(f);if(stage)rmSync(stage,{recursive:true,force:true});rmdirSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(!process.argv[2]||!process.argv[3])throw Error('Uso: persistent-import.mjs ORIGEM DESTINO');console.log('Importados: '+importPair(process.argv[2],process.argv[3]).join(', '));}
