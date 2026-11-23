import {openDatabase} from '../server/src/database/index.mjs';
import {openDiscovery} from '../server/src/discovery/engine.mjs';
import {prospectYoutubeBulk} from '../server/src/discovery/youtube-bulk.mjs';
const radar=openDatabase(),db=openDiscovery();try{const result=await prospectYoutubeBulk(db,radar,{limit:Number(process.argv[2]||10),progress:r=>console.log(JSON.stringify(r))});console.log(JSON.stringify(result));}finally{db.close();radar.close();}
