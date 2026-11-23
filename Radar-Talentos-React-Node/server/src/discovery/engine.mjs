import {ensurePersistentPath} from '../persistence.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
const defaultDiscoveryDb=()=>{const cfg=process.env.DISCOVERY_DB||'data/discovery.sqlite';return cfg===':memory:'?cfg:resolve(projectRoot,cfg);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const now=()=>new Date().toISOString();
const need=(v,label,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Inválido: '+label);return v.trim()};
const nets={Instagram:['followers','views','likes','comments'],YouTube:['subscribers','views','likes','comments'],Spotify:['monthly_listeners','followers','streams'],TikTok:['followers','views','likes','comments']};
const hosts={Instagram:'instagram.com',YouTube:'youtube.com',Spotify:'open.spotify.com',TikTok:'tiktok.com'};
export function profileUrl(network,raw){const u=new URL(need(raw,'URL',2000));if(!hosts[network]||u.protocol!=='https:'||u.username||u.password||u.port||![hosts[network],'www.'+hosts[network]].includes(u.hostname))throw Error('URL de perfil inválida');const p=u.pathname.replace(/\/$/,'');if(!p||p==='/')throw Error('Perfil sem identificador');return 'https://'+hosts[network]+p;}
function evidenceUrl(raw){const u=new URL(need(raw,'evidência',2000));if(u.protocol!=='https:'||u.username||u.password)throw Error('Evidência HTTPS obrigatória');return u.href;}
export function isIdentityCatalogUrl(raw){try{const h=new URL(raw).hostname.toLowerCase();return ['wikidata.org','musicbrainz.org','wikipedia.org'].some(d=>h===d||h.endsWith('.'+d));}catch{return false;}}
export function validateObservation(network,o,fallbackEvidence){if(!o||!nets[network]?.includes(o.metric)||!Number.isSafeInteger(o.value)||o.value<0)throw Error('Métrica inválida');const dt=new Date(o.observed_at);if(!Number.isFinite(+dt)||+dt>Date.now())throw Error('Data inválida');return {metric:o.metric,value:o.value,observed_at:dt.toISOString(),evidence_url:evidenceUrl(o.evidence_url??fallbackEvidence)};}
export function openDiscovery(path=defaultDiscoveryDb()){ensurePersistentPath(path,'DISCOVERY_DB');if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, kind TEXT NOT NULL, authorization TEXT NOT NULL, history_allowed INTEGER NOT NULL CHECK(history_allowed IN(0,1)), enabled INTEGER NOT NULL CHECK(enabled IN(0,1)));
CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','published')), created_at TEXT NOT NULL, reviewed_at TEXT, reviewer TEXT, identity_evidence TEXT, radar_id TEXT);
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL REFERENCES candidates(id),network TEXT NOT NULL,url TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES sources(id),UNIQUE(network,url));
CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),metric TEXT NOT NULL,value INTEGER NOT NULL CHECK(value>=0),observed_at TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES sources(id),evidence_url TEXT NOT NULL,UNIQUE(profile_id,metric,observed_at,source_id));
CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL REFERENCES candidates(id),source_id TEXT NOT NULL REFERENCES sources(id),url TEXT NOT NULL,observed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS collection_jobs(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),query TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS collection_logs(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES collection_jobs(id),at TEXT NOT NULL,status TEXT NOT NULL,count INTEGER NOT NULL,message TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approved_imports(candidate_id TEXT PRIMARY KEY REFERENCES candidates(id),radar_id TEXT NOT NULL,published_at TEXT NOT NULL,observation_count INTEGER NOT NULL);
PRAGMA user_version=1;`);return db;}
function tx(db,fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
export function configureSource(db,s){const id=need(s.id,'fonte');if(!['youtube','ticketmaster','licensed-file'].includes(s.kind))throw Error('Tipo não suportado');const auth=need(s.authorization,'referência de autorização');const old=db.prepare('SELECT * FROM sources WHERE id=?').get(id);if(old&&(old.kind!==s.kind||old.authorization!==auth||old.history_allowed!==Number(s.history_allowed===true)))throw Error('Fonte divergente: use novo identificador');db.prepare('INSERT INTO sources VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled').run(id,s.kind,auth,Number(s.history_allowed===true),Number(s.enabled===true));}
function source(db,id){const s=db.prepare('SELECT * FROM sources WHERE id=? AND enabled=1').get(id);if(!s)throw Error('Fonte não habilitada');return s;}
export function ingest(db,sourceId,rows){const s=source(db,sourceId);if(!Array.isArray(rows)||rows.length>5000)throw Error('Lote inválido');return tx(db,()=>{let count=0;for(const r of rows){const external=need(r.external_id,'identificador');const name=need(r.name,'nome');const ev=evidenceUrl(r.evidence_url);const id=hash(sourceId+'\0'+external);const at=now();const prev=db.prepare('SELECT * FROM candidates WHERE id=?').get(id);if(prev&&prev.name!==name)throw Error('Nome divergente: revisar identidade');if(prev&&['approved','published'].includes(prev.status)&& (r.profiles??[]).some(p=>!db.prepare('SELECT 1 FROM profiles WHERE candidate_id=? AND network=? AND url=?').get(id,p.network,profileUrl(p.network,p.url))))throw Error('Novo perfil requer revisão antes de associação');if(!prev){db.prepare('INSERT INTO candidates(id,name,created_at) VALUES(?,?,?)').run(id,name,at);count++;}db.prepare('INSERT OR IGNORE INTO evidence VALUES(?,?,?,?,?)').run(hash(id+ev),id,sourceId,ev,at);if(prev?.status==='rejected')continue;for(const p of r.profiles??[]){const url=profileUrl(p.network,p.url);const pid=hash(p.network+'\0'+url);const old=db.prepare('SELECT * FROM profiles WHERE id=?').get(pid);if(old&&old.candidate_id!==id)throw Error('Perfil já vinculado a outro candidato; revisão necessária');db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?)').run(pid,id,p.network,url,sourceId);for(const o of p.observations??[]){if(!nets[p.network].includes(o.metric)||!Number.isSafeInteger(o.value)||o.value<0)throw Error('Métrica inválida');const dt=new Date(o.observed_at);if(!Number.isFinite(+dt)||+dt>Date.now())throw Error('Data inválida');const stamp=dt.toISOString();const evidence=evidenceUrl(o.evidence_url??ev);const oid=hash([pid,o.metric,stamp,sourceId].join('\0'));const prior=db.prepare('SELECT value,evidence_url FROM observations WHERE id=?').get(oid);if(prior&&(prior.value!==o.value||prior.evidence_url!==evidence))throw Error('Observação divergente');db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)').run(oid,pid,o.metric,o.value,stamp,sourceId,evidence);}}}return count;});}
export function listCandidates(db){
 const rows=db.prepare('SELECT id,name,status,created_at,radar_id,identity_evidence FROM candidates ORDER BY created_at DESC LIMIT 500').all();
 const profStmt=db.prepare('SELECT network,url,source_id FROM profiles WHERE candidate_id=?');
 const evStmt=db.prepare('SELECT url,source_id FROM evidence WHERE candidate_id=?');
 const obsStmt=db.prepare('SELECT count(*) n FROM observations o JOIN profiles p ON p.id=o.profile_id WHERE p.candidate_id=?');
 return rows.map(c=>{
  const profiles=profStmt.all(c.id);
  const evidence=evStmt.all(c.id);
  const obsCount=obsStmt.get(c.id).n;
  const ytProfiles=profiles.filter(p=>p.network==='YouTube');
  const nets=[...new Set(profiles.map(p=>p.network))];
  const sources=[...new Set([...profiles.map(p=>p.source_id),...evidence.map(e=>e.source_id)])];
  const hasWikidata=sources.includes('wikidata-cc0')||evidence.some(e=>e.url?.includes('wikidata.org'));
  const hasMusicBrainz=sources.includes('musicbrainz-cc0')||evidence.some(e=>e.url?.includes('musicbrainz.org'));
  const isAmbiguousYoutube=ytProfiles.length>1;
  let priority_tier='P2_evidencia_unica',priority_order=2,priority_label='Evidência única — validar perfil';
  if(c.status==='published'||(c.status==='approved'&&obsCount>0)){
   priority_tier='P4_coletado_publicado';priority_order=4;priority_label=`Validado (${obsCount} obs.)`;
  }else if(isAmbiguousYoutube){
   priority_tier='P1_excecao_ambigua';priority_order=1;priority_label=`Exceção: ${ytProfiles.length} canais YouTube sugeridos`;
  }else if((hasWikidata||hasMusicBrainz)&&profiles.length>=2){
   priority_tier='P0_alta_evidencia';priority_order=0;priority_label=`Alta confiança (${nets.join(' + ')})`;
  }else if(hasWikidata||hasMusicBrainz){
   priority_tier='P2_evidencia_unica';priority_order=2;priority_label=`Catálogo aberto (${nets.join(', ')||'sem perfil'})`;
  }else{
   priority_tier='P3_revisao_manual';priority_order=3;priority_label='Revisão manual obrigatória';
  }
  return {...c,profiles_count:profiles.length,youtube_candidates_count:ytProfiles.length,networks:nets,observations_count:obsCount,has_wikidata:hasWikidata,has_musicbrainz:hasMusicBrainz,priority_tier,priority_order,priority_label};
 });
}
export function detail(db,id){const c=db.prepare('SELECT * FROM candidates WHERE id=?').get(id);if(!c)throw Error('Candidato inexistente');return {...c,profiles:db.prepare('SELECT * FROM profiles WHERE candidate_id=?').all(id),evidence:db.prepare('SELECT * FROM evidence WHERE candidate_id=?').all(id),observations:db.prepare('SELECT o.* FROM observations o JOIN profiles p ON p.id=o.profile_id WHERE p.candidate_id=? ORDER BY observed_at DESC').all(id)};}
export function review(db,id,{approve,reviewer,evidence,radarId=null}){if(typeof approve!=='boolean')throw Error('Decisão inválida');const c=detail(db,id);if(c.status==='published')throw Error('Já publicado');if(approve&&!c.profiles.length)throw Error('Sem perfil para validar');const ev=approve?evidenceUrl(evidence):need(evidence,'motivo');db.prepare('UPDATE candidates SET status=?,reviewer=?,identity_evidence=?,reviewed_at=?,radar_id=? WHERE id=?').run(approve?'approved':'rejected',need(reviewer,'responsável'),ev,now(),radarId===null?null:need(radarId,'ID Radar'),id);}
// Chamada externa limitada, URLs fixas, sem expor chaves no log.
async function getJSON(url,fetcher){let r;try{r=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Error('Falha de conexão externa');}if(!r.ok)throw Error('Fonte retornou HTTP '+r.status);return r.json();}
export async function discover(db,sourceId,query,{key,fetcher=fetch}={}){const s=source(db,sourceId);query=need(query,'pesquisa',100);if(!key)throw Error('Credencial ausente');if(s.kind==='licensed-file')throw Error('Use ingest para arquivos');const job=randomUUID();db.prepare('INSERT INTO collection_jobs VALUES(?,?,?,?,?)').run(job,sourceId,query,now(),'running');let count=0;try{let rows=[];if(s.kind==='youtube'){const u=new URL('https://www.googleapis.com/youtube/v3/search');u.search=new URLSearchParams({part:'snippet',type:'channel',q:query,relevanceLanguage:'pt',maxResults:'25',key});const result=await getJSON(u,fetcher);if(!Array.isArray(result.items))throw Error('Resposta inválida');const ids=[...new Set(result.items.map(i=>i.id?.channelId).filter(i=>typeof i==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(i)))];if(ids.length){const c=new URL('https://www.googleapis.com/youtube/v3/channels');c.search=new URLSearchParams({part:'snippet,statistics',id:ids.join(','),key});const data=await getJSON(c,fetcher);if(!Array.isArray(data.items))throw Error('Resposta inválida');rows=data.items.filter(i=>ids.includes(i.id)).map(i=>{const url='https://www.youtube.com/channel/'+i.id;const v=i.statistics?.subscriberCount;return {external_id:i.id,name:i.snippet.title,evidence_url:url,profiles:[{network:'YouTube',url,observations:!i.statistics?.hiddenSubscriberCount&&typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?[{metric:'subscribers',value:Number(v),observed_at:now()}]:[]}]};});}}else{const u=new URL('https://app.ticketmaster.com/discovery/v2/events.json');u.search=new URLSearchParams({countryCode:'BR',keyword:query,size:'50',apikey:key});const data=await getJSON(u,fetcher);if(!data.page)throw Error('Resposta inválida');const seen=new Set();for(const e of data._embedded?.events??[])for(const a of e._embedded?.attractions??[]){if(!a.id||!a.name||!e.url||seen.has(a.id))continue;seen.add(a.id);rows.push({external_id:a.id,name:a.name,evidence_url:e.url});}}count=ingest(db,sourceId,rows);db.prepare('UPDATE collection_jobs SET status=? WHERE id=?').run('success',job);db.prepare('INSERT INTO collection_logs VALUES(?,?,?,?,?,?)').run(randomUUID(),job,now(),'success',count,'Primeira página; cobertura parcial');return {newCandidates:count,observed:rows.length,coverage:'partial'};}catch(e){db.prepare('UPDATE collection_jobs SET status=? WHERE id=?').run('failed',job);db.prepare('INSERT INTO collection_logs VALUES(?,?,?,?,?,?)').run(randomUUID(),job,now(),'failed',0,'Falha de coleta; verificar configuração e resposta');throw Error('Coleta falhou; consulte configuração e logs');}}
// Somente dados de fontes com autorização explícita de histórico comercial, ou vínculo estrutural de perfis homologados sem inventar números.
export function publish(db,radar,id,importCommercial){const c=detail(db,id);if(!['approved','published'].includes(c.status))throw Error('Aprovação obrigatória');const target=c.radar_id??'discovery-'+id.slice(0,32);const existing=radar.prepare('SELECT id,name,blocked FROM talents WHERE id=?').get(target);if(c.radar_id&&!existing)throw Error('ID Radar informado não existe');if(existing&&(existing.name!==c.name||existing.blocked))throw Error('Talento divergente');if(!existing&&radar.prepare('SELECT id FROM talents WHERE lower(trim(name))=lower(trim(?))').get(c.name))throw Error('Nome já cadastrado; revise e vincule o ID existente');const imported=[];for(const p of c.profiles){const os=c.observations.filter(o=>o.profile_id===p.id);const bySource=new Map();for(const o of os){if(['youtube-public-current','open-social-current'].includes(o.source_id)||isIdentityCatalogUrl(o.evidence_url))continue;const s=source(db,o.source_id);if(!s.history_allowed)continue;const old=bySource.get(s.id)??[];old.push(o);bySource.set(s.id,old);}for(const [sid,items] of bySource){const s=source(db,sid);const latest=new Map();for(const o of items){const k=o.metric+'|'+o.observed_at.slice(0,10);if(!latest.has(k))latest.set(k,o);}const acct=radar.prepare('SELECT id,talent_id,url FROM commercial_accounts WHERE network=? AND rtrim(url,\'/\') IN (?,?)').get(p.network,p.url,p.url.replace('https://','https://www.'));if(acct&&acct.talent_id!==target)throw Error('Perfil já associado no Radar');const aid=acct?.id??'discovery-'+p.id.slice(0,32);const snapshots=[...latest.values()].map(o=>({metric:o.metric,value:o.value,observed_on:o.observed_at.slice(0,10),source:sid}));imported.push({authorization_ref:s.authorization,artists:[{id:target,name:c.name,accounts:[{id:aid,network:p.network,url:acct?.url??p.url,identity_source:c.identity_evidence,snapshots}]}]});}}
if(!imported.length){
// Integração apenas da identidade: não cria contas sociais nem snapshots.
// Mantém o candidato aprovado para permitir enriquecimento posterior.
if(!existing)radar.prepare('INSERT INTO talents(id,name) VALUES(?,?)').run(target,c.name);
db.prepare('INSERT INTO approved_imports VALUES(?,?,?,0) ON CONFLICT(candidate_id) DO UPDATE SET published_at=excluded.published_at').run(id,target,now());
db.prepare('UPDATE candidates SET radar_id=? WHERE id=?').run(target,id);
return {radarId:target,inserted:0,identityOnly:true};
}if(new Set(imported.map(b=>b.authorization_ref)).size!==1)throw Error('Autorizações diferentes: publicação conjunta não permitida');const accounts=imported.flatMap(b=>b.artists[0].accounts);if(new Set(accounts.map(a=>a.id)).size!==accounts.length)throw Error('Fontes concorrentes para um perfil: revisão obrigatória');const n=importCommercial(radar,{authorization_ref:imported[0].authorization_ref,artists:[{id:target,name:c.name,accounts}]});db.prepare('INSERT INTO approved_imports VALUES(?,?,?,?) ON CONFLICT(candidate_id) DO UPDATE SET published_at=excluded.published_at,observation_count=approved_imports.observation_count+excluded.observation_count').run(id,target,now(),n);db.prepare('UPDATE candidates SET status=?,radar_id=? WHERE id=?').run('published',target,id);return {radarId:target,inserted:n};}

export function publishIdentityOnly(db,radar,id){
 const c=detail(db,id);if(!['approved','published'].includes(c.status))throw Error('Aprovação obrigatória');if(!c.profiles.length)throw Error('Sem perfil para publicar');
 const target=c.radar_id??'discovery-'+id.slice(0,32);const existing=radar.prepare('SELECT id,name,blocked FROM talents WHERE id=?').get(target);
 if(c.radar_id&&!existing)throw Error('ID Radar informado não existe');if(existing&&(existing.name!==c.name||existing.blocked))throw Error('Talento divergente');
 if(!existing&&radar.prepare('SELECT id FROM talents WHERE lower(trim(name))=lower(trim(?))').get(c.name))throw Error('Nome já cadastrado; revise e vincule o ID existente');
 const primaryMetric={Instagram:'followers',YouTube:'subscribers',Spotify:'monthly_listeners',TikTok:'followers'};
 const fallbackStatus={Instagram:'pending_source',YouTube:'pending_source',Spotify:'pending_source',TikTok:'pending_auth'};
 const fallbackLabel={Instagram:'Coleta automática restrita · Aguardando observação ou CSV autorizado',YouTube:'Canal vinculado · Aguardando coleta YouTube Data API v3',Spotify:'Fonte pendente · Ouvintes mensais exigem observação ou relatório autorizado',TikTok:'Autorização pendente · Métrica exige observação ou relatório autorizado'};
 const stamp=now();let linked=0;
 radar.exec('BEGIN IMMEDIATE');try{
  if(!existing)radar.prepare('INSERT INTO talents(id,name,entity_type,blocked) VALUES(?,?,?,0)').run(target,c.name,'person');
  for(const p of c.profiles){
   const acct=radar.prepare('SELECT id,talent_id,url FROM commercial_accounts WHERE network=? AND rtrim(url,\'/\') IN (?,?)').get(p.network,p.url,p.url.replace('https://','https://www.'));
   if(acct&&acct.talent_id!==target)throw Error('Perfil já associado no Radar');
   const aid=acct?.id??'discovery-'+p.id.slice(0,32);const cleanUrl=(acct?.url??p.url).replace(/\/$/,'');
   const ev=c.identity_evidence||c.evidence[0]?.url||'Identidade homologada';
   if(!acct){radar.prepare('INSERT INTO commercial_accounts(id,talent_id,network,url,identity_source) VALUES(?,?,?,?,?)').run(aid,target,p.network,cleanUrl,ev);linked++;}
   if(['Instagram','YouTube','Spotify'].includes(p.network)){
    const extId=cleanUrl.split('/').filter(Boolean).at(-1)?.replace(/^@/,'')||aid;
    const prevSoc=radar.prepare('SELECT id,talent_id FROM social_accounts WHERE network=? AND (id=? OR url=? OR external_id=?)').get(p.network,aid,cleanUrl,extId);
    if(prevSoc&&prevSoc.talent_id!==target)throw Error('Conta social já associada a outro talento');
    if(!prevSoc)radar.prepare('INSERT INTO social_accounts(id,talent_id,network,external_id,url,identity_confirmed,identity_source,collection_state) VALUES(?,?,?,?,?,1,?,?)').run(aid,target,p.network,extId,cleanUrl,ev,'queued');
   }
   const metric=primaryMetric[p.network];
   const cur=radar.prepare('SELECT value,status FROM metric_current WHERE account_id=? AND metric=?').get(aid,metric);
   if(!cur){
    radar.prepare('INSERT INTO metric_current(account_id,talent_id,network,metric,value,observed_on,collected_at,source,status,status_detail) VALUES(?,?,?,?,NULL,NULL,?,?,?,?)').run(aid,target,p.network,metric,stamp,ev,fallbackStatus[p.network],fallbackLabel[p.network]);
   }
  }
  radar.exec('COMMIT');
 }catch(e){radar.exec('ROLLBACK');throw e;}
 db.prepare('INSERT INTO approved_imports VALUES(?,?,?,0) ON CONFLICT(candidate_id) DO UPDATE SET published_at=excluded.published_at').run(id,target,stamp);
 db.prepare('UPDATE candidates SET status=?,radar_id=? WHERE id=?').run('published',target,id);
 return {radarId:target,inserted:0,accountsLinked:linked,mode:'identity_only',notice:'Perfis oficiais homologados sem métricas inventadas. Indicadores sem coleta automática permanecem sinalizados como pendentes.'};
}

export function recordAuthorizedObservation(db,id,{network,url,metric,value,observed_at=now(),evidence_url,authorization_ref='Observação autorizada / Relatório do artista',source_id='authorized-observation'}={}){
 const c=detail(db,id);if(c.status==='rejected')throw Error('Candidato rejeitado');
 if(isIdentityCatalogUrl(evidence_url))throw Error('Evidência de identidade (Wikidata/MusicBrainz) não comprova métrica; informe a URL da fonte da métrica');
 const auth=need(authorization_ref,'referência de autorização',300);
 configureSource(db,{id:source_id,kind:'licensed-file',authorization:auth,history_allowed:true,enabled:true});
 const cleanUrl=profileUrl(network,url);
 const obs=validateObservation(network,{metric,value:Number(value),observed_at,evidence_url},evidence_url);
 return tx(db,()=>{
  const pid=hash(network+'\0'+cleanUrl);
  const old=db.prepare('SELECT candidate_id FROM profiles WHERE id=?').get(pid);
  if(old&&old.candidate_id!==id)throw Error('Perfil pertence a outro candidato');
  db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?)').run(pid,id,network,cleanUrl,source_id);
  db.prepare('INSERT OR IGNORE INTO evidence VALUES(?,?,?,?,?)').run(hash(id+obs.evidence_url),id,source_id,obs.evidence_url,now());
  const oid=hash([pid,obs.metric,obs.observed_at,source_id].join('\0'));
  const prior=db.prepare('SELECT value,evidence_url FROM observations WHERE id=?').get(oid);
  if(prior&&(prior.value!==obs.value||prior.evidence_url!==obs.evidence_url))throw Error('Observação divergente');
  db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)').run(oid,pid,obs.metric,obs.value,obs.observed_at,source_id,obs.evidence_url);
  return {profile_id:pid,observation_id:oid,network,url:cleanUrl,metric:obs.metric,value:obs.value,observed_at:obs.observed_at};
 });
}

export function enrich(db,id,sourceId,p){const c=detail(db,id);if(c.status==='published'||c.status==='rejected')throw Error('Candidato encerrado; revisão administrativa necessária');source(db,sourceId);const url=profileUrl(p.network,p.url),ev=evidenceUrl(p.evidence_url);return tx(db,()=>{const pid=hash(p.network+'\0'+url);const old=db.prepare('SELECT candidate_id FROM profiles WHERE id=?').get(pid);if(old&&old.candidate_id!==id)throw Error('Perfil pertence a outro candidato');db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?)').run(pid,id,p.network,url,sourceId);db.prepare('INSERT OR IGNORE INTO evidence VALUES(?,?,?,?,?)').run(hash(id+ev),id,sourceId,ev,now());db.prepare("UPDATE candidates SET status='pending',reviewed_at=NULL,reviewer=NULL,identity_evidence=NULL WHERE id=?").run(id);return pid;});}
