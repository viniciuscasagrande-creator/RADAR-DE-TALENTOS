import {openDiscovery} from './discovery/engine.mjs';
import {readDashboardConfig} from './event-config.mjs';
import { productionSecurity } from './security.mjs';
import { createRadarServer } from './app.mjs';
import { openDatabase } from './database/index.mjs';
import { seedPilotDatabaseIfEmpty } from './seed-pilot.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const security=productionSecurity();
if(!security && !['127.0.0.1','::1','localhost'].includes(host))throw Error('Acesso externo exige autenticação');
const database = openDatabase();
if(process.env.RADAR_PERSISTENT_REQUIRED==='1'){const discovery=openDiscovery();try{if(discovery.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Discovery inconsistente');}finally{discovery.close();}}
seedPilotDatabaseIfEmpty(database);
const server = createRadarServer({ database,security,eventsOnly:true,combinedDashboard:true,syncConfig:readDashboardConfig });
server.once('close', () => database.close());
server.listen(port, host, () => {
  console.log('Radar Node.js em http://' + host + ':' + port);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close());
}
