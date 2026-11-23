import { distributeArtistStats } from './indicator-distribution.mjs';
import { currentDashboard } from './discovery/current-dashboard.mjs';
import { acquisitionStatus } from './acquisition.mjs';
import { getCrossMenuSummary, getDemographicsSummary, getArtistMediaStats } from './menu-integration.mjs';
import { handleDiscovery } from './discovery/http.mjs';
import { openDiscovery, listCandidates } from './discovery/engine.mjs';
import {discoveryStatus,discoverTalentsFromSources} from './discovery.mjs';
import {commercialCompatibility} from './commercial-compatibility.mjs';
import {commercialInsights} from './commercial-insights.mjs';
import {commercialQuery} from './commercial.mjs';
import {regionalDashboard} from './regional-dashboard.mjs';
import { operationsStatus, runOperations } from './operations.mjs';
import { readEventConfig } from './event-config.mjs';
import { authenticate } from './security.mjs';
import { opportunityQuery } from './opportunities.mjs';
import { audienceStatus } from './audience.mjs';
import { eventQuery } from './events.mjs';
import { radarQuery, FilterError } from './radar.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const dist = fileURLToPath(new URL('../../dashboard', import.meta.url));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export function createRadarServer({ database, security = null, eventsOnly = false, combinedDashboard = false, syncConfig = readEventConfig, syncOptions = {} } = {}) {
  const requests=new Map();let syncing=false;let lastSync=null;
  return createServer({requestTimeout:30000,headersTimeout:15000,maxHeaderSize:16384},async (req, res) => {
    res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("Cache-Control","no-store");
    if(security)res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const now=Date.now(),ip=req.socket.remoteAddress;
    if(requests.size>10000)for(const [k,v] of requests)if(now-v.start>=60000)requests.delete(k);
    let rate=requests.get(ip);if(!rate||now-rate.start>=60000){rate={start:now,count:0};if(requests.size<10000||requests.has(ip))requests.set(ip,rate);else{res.writeHead(429).end();return;}}
    if(++rate.count>300){res.writeHead(429,{"Retry-After":"60"}).end();return;}
    if ((security || req.url !== '/api/discovery/status') && await handleDiscovery(req,res,{radar:database,security})) return;
    if (!['GET','HEAD'].includes(req.method)&&!(eventsOnly&&req.method==='POST'&&req.url==='/api/operations/sync')) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path === '/api/health') {
        if (database) {
          try { database.prepare('SELECT 1').get(); } catch {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: false }));
            return;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }));
        return;
      }
      if (!authenticate(req,security)) {res.writeHead(401,{'WWW-Authenticate':'Basic realm="Radar", charset="UTF-8"'}).end();return;}
      if(eventsOnly&&(['/api/opportunities','/api/audience/status','/api/radar/ranking','/api/radar/reports'].includes(path))){res.writeHead(404).end();return;}
      if(eventsOnly&&path==='/api/operations/sync'&&req.method==='POST'){
        const origin=req.headers.origin;let same=false;try{same=['http:','https:'].includes(new URL(origin).protocol)&&new URL(origin).host===req.headers.host;}catch{}
        if(!same||req.headers['x-radar-action']!=='sync'){res.writeHead(403).end();return;}if(!database){res.writeHead(503).end();return;}
        if(syncing){res.writeHead(409,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Sincronização já em execução'}));return;}
        let config;try{config=await syncConfig();}catch{res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Configure as fontes antes de sincronizar (config/operations.json)'}));return;}
        if(!config.jobs.some(j=>j.enabled&&(j.kind==='events'||combinedDashboard&&['audience','metrics'].includes(j.kind)))){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Nenhuma fonte de eventos, audiência ou oportunidade comercial habilitada'}));return;}
        if(syncing){res.writeHead(409).end();return;}syncing=true;lastSync=null;
        res.writeHead(202,{'Content-Type':'application/json'}).end(JSON.stringify({accepted:true}));
        runOperations(database,config,{...syncOptions,ignoreSchedule:true,inbox:syncOptions.inbox??process.env.RADAR_INBOX??'data/inbox',secretsDir:syncOptions.secretsDir??process.env.RADAR_SECRETS_DIR??'data/secrets'}).then(r=>{lastSync={runs:r};}).catch(()=>{lastSync={error:'Falha operacional; verifique banco e configuração'};}).finally(()=>{syncing=false;});return;
      }
      if (path === '/api/indicators/artist') {
        if (!database) { res.writeHead(503).end(); return; }
        const p = new URL(req.url, 'http://localhost').searchParams;
        const talent = p.get('talent') || '';
        const end = p.get('end') || new Date().toISOString().slice(0,10);
        if (!talent || talent.length > 150 || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
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
      if (path === '/api/current-media') {
        if(!database){res.writeHead(503).end();return;}
        const params=new URL(req.url,'http://localhost').searchParams;
        const q=params.get('q')??'',talent=params.get('talent')??'';
        if(q.length>120||talent.length>150){res.writeHead(400).end();return;}
        let ddb;try {ddb=openDiscovery();const data=currentDashboard(ddb,database,{q,talent});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(data));}catch{res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Indicadores atuais indisponíveis'}));}finally{ddb?.close();}return;
      }
      if (path === '/api/acquisition/status') {
        if (!database) {res.writeHead(503).end();return;}
        const result=await acquisitionStatus(database,syncConfig);
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify({...result,syncing}));return;
      }
      if (path === '/api/operations/status') {
        if (!database) {res.writeHead(503).end();return;}
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify((()=>{const state=operationsStatus(database);if(eventsOnly){const ids=new Set(state.jobs.filter(j=>(['events','alerts'].includes(j.kind)||combinedDashboard&&['audience','metrics'].includes(j.kind))).map(j=>j.id));state.jobs=state.jobs.filter(j=>ids.has(j.id));state.history=state.history.filter(j=>ids.has(j.job_id));state.alerts=state.alerts.filter(a=>a.kind==='trend'||a.kind==='collection'&&ids.has(a.subject));}return {...state,syncing,lastSync};})()));return;
      }
      if (path === '/api/opportunities') {
        if (!database) { res.writeHead(503).end(); return; }
        const result=opportunityQuery(database,new URL(req.url,'http://localhost').searchParams);
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result)); return;
      }
      if (path === '/api/audience/status') {
        if (!database) { res.writeHead(503).end(); return; }
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(audienceStatus(database))); return;
      }
      if(path==='/api/discovery/status'){if(!database){res.writeHead(503).end();return;}const result=discoveryStatus(database);let extra={sources:[],candidates:[],logs:[],providers:{youtube:{configured:Boolean(process.env.YOUTUBE_API_KEY&&String(process.env.YOUTUBE_API_KEY).trim())},brave:{configured:Boolean(process.env.BRAVE_SEARCH_API_KEY&&String(process.env.BRAVE_SEARCH_API_KEY).trim())},wikidata:{configured:true},musicbrainz:{configured:true}},counts:{candidates:0,profiles:0,observations:0,youtube_observations:0,open_social_observations:0}};try{const ddb=openDiscovery();try{const dc=(t,w='')=>ddb.prepare(`SELECT count(*) n FROM ${t} ${w}`).get().n;extra={sources:ddb.prepare('SELECT id,kind,enabled,history_allowed FROM sources').all(),candidates:listCandidates(ddb),logs:ddb.prepare('SELECT * FROM collection_logs ORDER BY at DESC LIMIT 30').all(),providers:extra.providers,counts:{candidates:dc('candidates'),profiles:dc('profiles'),observations:dc('observations'),youtube_observations:dc('observations o JOIN profiles p ON p.id=o.profile_id',"WHERE p.network='YouTube'"),open_social_observations:dc('observations',"WHERE source_id='open-social-current'")}};}finally{ddb.close();}}catch{}res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify({...result,...extra}));return;}
      if(path==='/api/commercial/compatibility'){if(!database){res.writeHead(503).end();return;}const result=commercialCompatibility(database,new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}
      if(path==='/api/commercial/insights'){if(!database){res.writeHead(503).end();return;}const result=commercialInsights(database,new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}
      if(path==='/api/commercial'){if(!database){res.writeHead(503).end();return;}const result=commercialQuery(database,new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}
      if(path==='/api/radar/cross-summary'){if(!database){res.writeHead(503).end();return;}const result=getCrossMenuSummary(database,new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}
      if(path==='/api/radar/media-stats'){if(!database){res.writeHead(503).end();return;}const sp=new URL(req.url,'http://localhost').searchParams;const tId=sp.get('talent')||'';if(!tId){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'Informe o parâmetro talent'}));return;}let ddb=null;try{ddb=openDiscovery();}catch{}let result=null;try{result=getArtistMediaStats(database,tId,{end:sp.get('end')||new Date().toISOString().slice(0,10),discoveryDb:ddb});}finally{ddb?.close();}if(!result){res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'Artista não encontrado'}));return;}res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}
      if(path==='/api/radar/demographics'){if(!database){res.writeHead(503).end();return;}const result=getDemographicsSummary(database,new URL(req.url,'http://localhost').searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}
      if(path.startsWith('/api/regional/')){if(!database){res.writeHead(503).end();return;}const result=regionalDashboard(database,path,new URL(req.url,'http://localhost').searchParams);if(result!==undefined){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify(result));return;}}
      if (path.startsWith('/api/radar/') || path.startsWith('/api/events/')) {
        if (!database) { res.writeHead(503).end(); return; }
        const params = new URL(req.url,'http://localhost').searchParams; const result = path.startsWith('/api/events/') ? eventQuery(database,path,params) : radarQuery(database,path,params);
        if (result !== undefined) { res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(result)); return; }
      }
      if (path === '/api' || path.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(req.method === 'HEAD' ? undefined : '{"error":"Rota não encontrada"}');
        return;
      }
      if (path.includes('\\') || path.includes('\0')) {
        res.writeHead(400).end();
        return;
      }
      const file = resolve(dist, path === '/' ? (eventsOnly&&!combinedDashboard?'events.html':'index.html') : '.' + path);
      if (!file.startsWith(dist + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if(error instanceof FilterError){ res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'}).end(req.method==='HEAD'?undefined:JSON.stringify({error:error.message})); return; }
      const code = error instanceof URIError ? 400 : ['ENOENT','EISDIR','ENOTDIR'].includes(error.code) ? 404 : 500;
      res.writeHead(code).end();
    }
  });
}
