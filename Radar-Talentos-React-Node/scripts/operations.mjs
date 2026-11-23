import {purgeOpen} from '../server/src/discovery/open-social.mjs';
import {prospectYoutubeBulk,purgeBulkSuggestions} from '../server/src/discovery/youtube-bulk.mjs';
import {openDiscovery} from '../server/src/discovery/engine.mjs';
import {collectYoutube} from '../server/src/discovery/youtube-current.mjs';
import {distributeVerifiedDiscoveryToRadar} from '../server/src/menu-integration.mjs';
import {backupBoth} from '../server/src/persistent-backup.mjs';
import {readDashboardConfig} from '../server/src/event-config.mjs';
import {openDatabase} from '../server/src/database/index.mjs';
import {runOperations,localDay} from '../server/src/operations.mjs';
const mode=process.argv[2]??'once',file=process.argv[3]??process.env.RADAR_OPERATIONS_CONFIG??'config/operations.json';
if(!['once','worker','check'].includes(mode))throw Error('Modo inválido');
const config=await readDashboardConfig(file);
if(mode==='check'){console.log('Configuração válida');process.exit(0);}
let stopped=false;let wake;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopped=true;wake?.();});
let failed=false;do{const db=openDatabase();try{const r=await runOperations(db,config,{ignoreSchedule:mode==='once',inbox:process.env.RADAR_INBOX??'data/inbox',secretsDir:process.env.RADAR_SECRETS_DIR??'data/secrets'});if(r.length||mode==='once')console.log(JSON.stringify({at:new Date().toISOString(),runs:r}));failed=r.some(x=>x.state==='failed');if(mode==='worker'||mode==='once'){const discovery=openDiscovery();try{purgeBulkSuggestions(discovery);purgeOpen(discovery);if(process.env.RADAR_YOUTUBE_BULK==='1'){try{const bulk=await prospectYoutubeBulk(discovery,db,{limit:5});if(bulk.attempted)console.log(JSON.stringify({youtubeBulk:bulk}));}catch{console.error('Falha na prospecção em lote; coleta atual continua');}}const yt=await collectYoutube(discovery);if(!['skipped','disabled','no_confirmed'].includes(yt.status)){console.log(JSON.stringify({youtube:yt}));distributeVerifiedDiscoveryToRadar(db,discovery);}}catch{console.error('Falha na coleta pública YouTube');}finally{discovery.close();}}if(process.env.RADAR_AUTO_BACKUP==='1'){const snapshot=backupBoth(db,process.env.RADAR_BACKUP_DIR??'data/backups',localDay(),Number(process.env.RADAR_BACKUP_KEEP_DAYS??14));if(snapshot.length)console.log('Backup diário verificado');}}catch{console.error('Falha operacional: verificar banco e configuração');failed=true;}finally{db.close();}if(mode==='worker'&&!stopped)await new Promise(resolve=>{const t=setTimeout(resolve,60000);wake=()=>{clearTimeout(t);resolve();};});}while(mode==='worker'&&!stopped);
if(mode==='once'&&failed)process.exitCode=1;
