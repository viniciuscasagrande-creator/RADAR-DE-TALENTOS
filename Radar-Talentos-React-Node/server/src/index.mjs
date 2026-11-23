import {openDiscovery} from './discovery/engine.mjs';
import {readDashboardConfig} from './event-config.mjs';
import { productionSecurity } from './security.mjs';
import { createRadarServer } from './app.mjs';
import { openDatabase } from './database/index.mjs';
import { seedPilotDatabaseIfEmpty } from './seed-pilot.mjs';
import { syncAllMenusData } from './menu-integration.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const security = process.env.RADAR_REQUIRE_LOGIN === '1' ? productionSecurity() : null;
if (process.env.RADAR_REQUIRE_LOGIN === '1' && !security && !['127.0.0.1','::1','localhost'].includes(host)) {
  throw Error('Acesso externo exige autenticação');
}
const database = openDatabase();
seedPilotDatabaseIfEmpty(database);
let discoveryDb = null;
try {
  discoveryDb = openDiscovery();
  if (process.env.RADAR_PERSISTENT_REQUIRED === '1' && discoveryDb.prepare('PRAGMA quick_check').get().quick_check !== 'ok') {
    throw Error('Discovery inconsistente');
  }
  syncAllMenusData(database, discoveryDb);
} finally {
  discoveryDb?.close();
}
const server = createRadarServer({ database,security,eventsOnly:true,combinedDashboard:true,syncConfig:readDashboardConfig });
server.once('close', () => database.close());
server.listen(port, host, () => {
  console.log('Radar Node.js em http://' + host + ':' + port);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close());
}
