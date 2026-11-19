import {createHash} from 'node:crypto';
import {configureSource,ingest,detail,profileUrl} from './engine.mjs';
const WIKI='wikidata-cc0', MB='musicbrainz-cc0', BRAVE='brave-search';
const license={ [WIKI]:'https://www.wikidata.org/wiki/Wikidata:Licensing', [MB]:'https://musicbrainz.org/doc/About/Data_License', [BRAVE]:'https://api.search.brave.com/app/documentation/web-search/get-started' };
export const FREE_MOTOR_CAPABILITIES={
 Instagram:{locate_profile:true,identify_artist:true,official_link:true,followers:'Parcial (observação ou importação autorizada)',monthly_listeners:'—',automated_collection:'Limitada',municipal_audience:'Não (exige relatório fornecido pelo artista)'},
 YouTube:{locate_profile:true,identify_artist:true,official_link:true,subscribers:'Automático (YouTube Data API v3)',monthly_listeners:'—',automated_collection:'Operacional (inscritos e visualizações públicas)',municipal_audience:'Apenas com YouTube Analytics autorizado ou relatório do artista'},
 Spotify:{locate_profile:true,identify_artist:true,official_link:true,followers:'Limitado (observação ou importação autorizada)',monthly_listeners:'Parcial (observação ou relatório Spotify for Artists)',automated_collection:'Limitada',municipal_audience:'Não (exige relatório fornecido pelo artista)'},
 TikTok:{locate_profile:true,identify_artist:true,official_link:true,followers:'Parcial (observação ou importação autorizada)',monthly_listeners:'—',automated_collection:'Limitada',municipal_audience:'Não (exige relatório fornecido pelo artista)'}
};
const norm=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/^@/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hash=(source,id)=>createHash('sha256').update(source+'\0'+id).digest('hex');
const qid=id=>typeof id==='string'&&/^Q[1-9]\d{0,14}$/.test(id);
const mbid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function source(db,id){const old=db.prepare('SELECT * FROM sources WHERE id=?').get(id);if(old){if(!old.enabled||old.kind!=='licensed-file'||old.authorization!==license[id]||old.history_allowed)throw Error('Fonte aberta desabilitada ou divergente');return;}configureSource(db,{id,kind:'licensed-file',authorization:license[id],enabled:true,history_allowed:false});}
function queryText(q){if(typeof q!=='string'||q.trim().length<2||q.length>100||!norm(q))throw Error('Informe um nome entre 2 e 100 caracteres');return q.trim();}
function rank(name,q){const n=norm(name),s=norm(q);return n===s?0:n.startsWith(s)?1:n.includes(s)?2:99;}
function local(db,sql,q){if(!db)return [];let results=[];for(const r of db.prepare(sql).iterate()){const score=rank(r.name,q);if(score<99){results.push({...r,score});if(results.length>100)results.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name)).splice(40);}}return results.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name)).slice(0,40).map(({score,...r})=>r);}
async function api(params,fetcher){const u=new URL('https://www.wikidata.org/w/api.php');u.search=new URLSearchParams({format:'json',formatversion:'2',...params});const r=await fetcher(u,{headers:{'User-Agent':process.env.RADAR_WIKIDATA_USER_AGENT||'RadarDeTalentos/1.0 (https://radar-de-talentos-nu.vercel.app/)','Accept':'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('Wikidata HTTP '+r.status);const data=await r.json();if(data.error)throw Error('Wikidata indisponível');return data;}
function vals(e,p){return (e.claims?.[p]??[]).filter(c=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value').map(c=>c.mainsnak.datavalue?.value);}
function profileHints(e){const out=[];const fields=[['Instagram','P2003',/^[A-Za-z0-9_.]{1,30}$/,'https://instagram.com/'],['YouTube','P2397',/^UC[A-Za-z0-9_-]{22}$/,'https://youtube.com/channel/'],['Spotify','P1902',/^[A-Za-z0-9]{22}$/,'https://open.spotify.com/artist/'],['TikTok','P7085',/^[A-Za-z0-9_.]{1,24}$/,'https://tiktok.com/@']];for(const [network,p,re,base] of fields){for(const v of vals(e,p)){if(typeof v==='string'&&re.test(v))out.push({network,url:base+v,observations:[]});}}return [...new Map(out.map(x=>[x.url,x])).values()];}
function officialWebsite(e){for(const v of vals(e,'P856')){if(typeof v==='string'){try{const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}}}return null;}
function entity(e){if(!e||e.missing||!qid(e.id))return null;const types=vals(e,'P31').map(x=>x?.id);const occupations=vals(e,'P106');if(!types.some(x=>['Q5','Q215380','Q2088357','Q5741069','Q216337','Q43229'].includes(x))||types.includes('Q5')&&!occupations.length)return null;const name=e.labels?.pt?.value??e.labels?.en?.value??Object.values(e.labels??{})[0]?.value;if(typeof name!=='string'||!name.trim()||name.length>500)return null;const site=officialWebsite(e);const mbids=vals(e,'P434').filter(mbid);return {external_id:e.id,name,description:e.descriptions?.pt?.value??e.descriptions?.en?.value??'',evidence_url:'https://www.wikidata.org/wiki/'+e.id,official_website:site,musicbrainz_id:mbids[0]??null,profiles:profileHints(e),state:'pending_identity',source:WIKI};}
async function entities(ids,fetcher){if(!ids.length)return [];const data=await api({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|claims',languages:'pt|en',languagefallback:'1'},fetcher);if(!data.entities||typeof data.entities!=='object')throw Error('Resposta inválida');return ids.map(id=>entity(data.entities[id])).filter(Boolean);}

export function extractSocialProfileFromUrl(rawUrl){
 if(typeof rawUrl!=='string')return null;
 let u;try{u=new URL(rawUrl);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.replace(/^www\./,'').toLowerCase();
 const segs=u.pathname.split('/').filter(Boolean);
 if(host==='instagram.com'&&segs.length===1&&/^[A-Za-z0-9_.]{1,30}$/.test(segs[0])&&!['p','reel','reels','stories','explore','accounts','about','legal'].includes(segs[0].toLowerCase())){
  return {network:'Instagram',url:`https://instagram.com/${segs[0]}`,observations:[]};
 }
 if(host==='youtube.com'){
  if(segs[0]==='channel'&&/^UC[A-Za-z0-9_-]{22}$/.test(segs[1]??''))return {network:'YouTube',url:`https://youtube.com/channel/${segs[1]}`,observations:[]};
  if(segs.length===1&&/^@[A-Za-z0-9_.-]{2,40}$/.test(segs[0]))return {network:'YouTube',url:`https://youtube.com/${segs[0]}`,observations:[]};
 }
 if(host==='open.spotify.com'&&segs[0]==='artist'&&/^[A-Za-z0-9]{22}$/.test(segs[1]??'')){
  return {network:'Spotify',url:`https://open.spotify.com/artist/${segs[1]}`,observations:[]};
 }
 if(host==='tiktok.com'&&segs.length===1&&/^@[A-Za-z0-9_.]{1,24}$/.test(segs[0])){
  return {network:'TikTok',url:`https://tiktok.com/${segs[0]}`,observations:[]};
 }
 return null;
}

function mbProfilesFromRelations(relations){
 const out=[];let officialSite=null;
 for(const rel of relations??[]){
  const target=rel?.url?.resource;if(typeof target!=='string')continue;
  const social=extractSocialProfileFromUrl(target);
  if(social)out.push(social);
  else if(rel.type==='official homepage'){
   try{const u=new URL(target);if(u.protocol==='https:'&&!u.username&&!u.password)officialSite=u.href;}catch{}
  }
 }
 return {profiles:[...new Map(out.map(x=>[x.url,x])).values()],officialSite};
}

export async function searchMusicBrainzLive(query,{fetcher=fetch,includeRelations=true}={}){
 const q=queryText(query);
 const u=new URL('https://musicbrainz.org/ws/2/artist/');
 u.search=new URLSearchParams({query:`artist:"${q}"`,fmt:'json',limit:'8'});
 const headers={'User-Agent':process.env.RADAR_MUSICBRAINZ_USER_AGENT||process.env.RADAR_WIKIDATA_USER_AGENT||'RadarDeTalentos/1.0 (https://radar-de-talentos-nu.vercel.app/)','Accept':'application/json'};
 const r=await fetcher(u,{headers,signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw Error('MusicBrainz HTTP '+r.status);
 const data=await r.json();
 if(!Array.isArray(data.artists))throw Error('Resposta MusicBrainz inválida');
 const items=[];
 for(const a of data.artists.slice(0,5)){
  if(!mbid(a.id)||typeof a.name!=='string'||!a.name.trim())continue;
  const id=a.id.toLowerCase();
  let profiles=[],official_website=null;
  if(includeRelations&&Array.isArray(a.relations)){
   const parsed=mbProfilesFromRelations(a.relations);
   profiles=parsed.profiles;official_website=parsed.officialSite;
  }
  const descParts=[a.type,a.country,a.disambiguation].filter(Boolean);
  items.push({external_id:id,name:a.name.trim(),country:a.country||null,description:descParts.join(' · ')||'Artista musical (MusicBrainz)',evidence_url:'https://musicbrainz.org/artist/'+id,official_website,profiles,state:'pending_identity',source:MB});
 }
 return items;
}

export async function lookupMusicBrainzArtist(id,{fetcher=fetch}={}){
 if(!mbid(id))throw Error('Identificador MusicBrainz inválido');
 const cleanId=id.toLowerCase();
 const u=new URL(`https://musicbrainz.org/ws/2/artist/${cleanId}`);
 u.search=new URLSearchParams({inc:'url-rels',fmt:'json'});
 const headers={'User-Agent':process.env.RADAR_MUSICBRAINZ_USER_AGENT||process.env.RADAR_WIKIDATA_USER_AGENT||'RadarDeTalentos/1.0 (https://radar-de-talentos-nu.vercel.app/)','Accept':'application/json'};
 const r=await fetcher(u,{headers,signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw Error('MusicBrainz HTTP '+r.status);
 const a=await r.json();
 if(!mbid(a?.id)||typeof a.name!=='string'||!a.name.trim())throw Error('Artista MusicBrainz inválido');
 const {profiles,officialSite}=mbProfilesFromRelations(a.relations);
 const descParts=[a.type,a.country,a.disambiguation].filter(Boolean);
 return {external_id:cleanId,name:a.name.trim(),country:a.country||null,description:descParts.join(' · ')||'Artista musical (MusicBrainz)',evidence_url:'https://musicbrainz.org/artist/'+cleanId,official_website:officialSite,profiles,state:'pending_identity',source:MB};
}

export async function searchBraveProfiles(query,{key=process.env.BRAVE_SEARCH_API_KEY,fetcher=fetch}={}){
 const q=queryText(query);
 if(!key||typeof key!=='string'||!key.trim())return {status:'not_configured',profiles:[],web_results:[]};
 const u=new URL('https://api.search.brave.com/res/v1/web/search');
 u.search=new URLSearchParams({q:`"${q}" (site:instagram.com OR site:youtube.com OR site:open.spotify.com/artist OR site:tiktok.com)`,count:'15',country:'BR'});
 const r=await fetcher(u,{headers:{'Accept':'application/json','X-Subscription-Token':key.trim()},signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw Error('Brave Search HTTP '+r.status);
 const data=await r.json();
 const webResults=data?.web?.results;
 if(!Array.isArray(webResults))throw Error('Resposta Brave Search inválida');
 const profiles=[],items=[];
 for(const item of webResults){
  if(typeof item?.url!=='string')continue;
  const social=extractSocialProfileFromUrl(item.url);
  if(social){
   profiles.push({...social,title:String(item.title??'').slice(0,200),description:String(item.description??'').slice(0,300),evidence_url:social.url});
  }else{
   try{const parsed=new URL(item.url);if(parsed.protocol==='https:')items.push({title:String(item.title??'').slice(0,200),url:parsed.href,description:String(item.description??'').slice(0,300)});}catch{}
  }
 }
 return {status:'ok',profiles:[...new Map(profiles.map(x=>[x.url,x])).values()],web_results:items.slice(0,8)};
}

export function crossValidateIdentity({name,wikidata=[],musicbrainz=[],braveProfiles=[]}={}){
 const byNet=new Map();
 const add=(network,url,origin)=>{
  const k=`${network}|${url.toLowerCase()}`;
  const cur=byNet.get(k)??{network,url,sources:[],confidence:'single_source',verified_cross_source:false};
  if(!cur.sources.includes(origin))cur.sources.push(origin);
  cur.verified_cross_source=cur.sources.length>=2;
  cur.confidence=cur.sources.length>=2?'high_cross_validated':origin==='wikidata-cc0'||origin==='musicbrainz-cc0'?'catalog_indexed':'search_indexed';
  byNet.set(k,cur);
 };
 for(const w of wikidata)for(const p of w.profiles??[])add(p.network,p.url,WIKI);
 for(const m of musicbrainz)for(const p of m.profiles??[])add(p.network,p.url,MB);
 for(const b of braveProfiles)add(b.network,b.url,BRAVE);
 const profiles=[...byNet.values()];
 const networksCovered=['Instagram','YouTube','Spotify','TikTok'].map(net=>({
  network:net,
  located:profiles.some(p=>p.network===net),
  profiles:profiles.filter(p=>p.network===net),
  capabilities:FREE_MOTOR_CAPABILITIES[net]
 }));
 return {artist:name,profiles,networks:networksCovered,crossValidatedCount:profiles.filter(p=>p.verified_cross_source).length};
}

export async function globalSearch(db,radar,query,{fetcher=fetch,includeMusicBrainzLive=false,braveKey=process.env.BRAVE_SEARCH_API_KEY}={}){
 const q=queryText(query);const candidates=local(db,"SELECT id,name,status FROM candidates WHERE status!='rejected'",q);const registered=local(radar,'SELECT id,name FROM talents WHERE blocked=0',q);
 const result={query:q,registered,candidates,external:[],musicbrainz:[],brave:{status:'not_configured',profiles:[],web_results:[]},crossValidation:null,capabilities:FREE_MOTOR_CAPABILITIES,sources:{local:'ok',wikidata:'not_run',musicbrainz:'not_imported',brave:'not_configured'},coverage:'partial'};
 const configured=db.prepare('SELECT enabled FROM sources WHERE id=?').get(WIKI);
 if(db.prepare('SELECT 1 FROM sources WHERE id=? AND enabled=1').get(MB))result.sources.musicbrainz='local_index';
 if(configured&&!configured.enabled){result.sources.wikidata='disabled';return result;}
 try{const ids=[];for(const language of ['pt','en']){const d=await api({action:'wbsearchentities',search:q,language,uselang:language,type:'item',limit:'15'},fetcher);if(!Array.isArray(d.search))throw Error('Resposta inválida');ids.push(...d.search.map(x=>x.id).filter(qid));}const list=await entities([...new Set(ids)],fetcher);result.external=list.map(x=>({...x,candidate_id:db.prepare('SELECT id FROM candidates WHERE id=?').get(hash(WIKI,x.external_id))?.id??null}));result.sources.wikidata='ok';}catch{result.sources.wikidata='unavailable';}
 if(includeMusicBrainzLive){
  try{
   const mbList=await searchMusicBrainzLive(q,{fetcher});
   result.musicbrainz=mbList.map(x=>({...x,candidate_id:db.prepare('SELECT id FROM candidates WHERE id=?').get(hash(MB,x.external_id))?.id??null}));
   result.sources.musicbrainz=result.sources.musicbrainz==='local_index'?'local_and_api':'api_ok';
  }catch{
   if(result.sources.musicbrainz!=='local_index')result.sources.musicbrainz='unavailable';
  }
 }
 if(braveKey&&typeof braveKey==='string'&&braveKey.trim()){
  try{
   result.brave=await searchBraveProfiles(q,{key:braveKey,fetcher});
   result.sources.brave='ok';
  }catch{
   result.sources.brave='unavailable';
  }
 }
 result.crossValidation=crossValidateIdentity({name:q,wikidata:result.external,musicbrainz:result.musicbrainz,braveProfiles:result.brave.profiles});
 return result;
}
export async function saveWikidata(db,id,{fetcher=fetch}={}){if(!qid(id))throw Error('Identificador Wikidata inválido');const [row]=await entities([id],fetcher);if(!row)throw Error('Entidade não elegível');source(db,WIKI);const candidateId=hash(WIKI,id);const prior=db.prepare('SELECT id FROM candidates WHERE id=?').get(candidateId);if(prior)return detail(db,candidateId); // não alterar perfil anterior sem revisão
// Perfis são apenas vínculos observados e continuam pendentes. Não registrar métricas.
ingest(db,WIKI,[row]);return detail(db,candidateId);}
export async function saveMusicBrainz(db,id,{fetcher=fetch}={}){if(!mbid(id))throw Error('Identificador MusicBrainz inválido');const row=await lookupMusicBrainzArtist(id,{fetcher});source(db,MB);const candidateId=hash(MB,row.external_id);const prior=db.prepare('SELECT id FROM candidates WHERE id=?').get(candidateId);if(prior)return detail(db,candidateId);ingest(db,MB,[row]);return detail(db,candidateId);}
export async function importMusicBrainz(db,lines,{country='BR',limit=100000}={}){if(country!==''&&!/^[A-Z]{2}$/.test(country))throw Error('País inválido');if(!Number.isInteger(limit)||limit<1||limit>1000000)throw Error('Limite inválido');source(db,MB);let scanned=0,matched=0,created=0,skipped=0,batch=[];const flush=()=>{if(batch.length){created+=ingest(db,MB,batch);batch=[];}};for await(const line of lines){if(!line.trim())continue;scanned++;if(line.length>8_000_000){skipped++;continue;}let a;try{a=JSON.parse(line)}catch{skipped++;continue;}if(!mbid(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>500){skipped++;continue;}if(country&&a.country!==country)continue;matched++;const id=a.id.toLowerCase();if(!db.prepare('SELECT id FROM candidates WHERE id=?').get(hash(MB,id)))batch.push({external_id:id,name:a.name,evidence_url:'https://musicbrainz.org/artist/'+id});if(batch.length>=500)flush();if(matched>=limit)break;}flush();return {scanned,matched,created,skipped,country:country||'all',limit,coverage:'partial'};}
