import {createHash,randomUUID} from 'node:crypto';
import {configureSource,detail,ingest,profileUrl} from './engine.mjs';
import {globalSearch,saveWikidata} from './global-search.mjs';
import {confirmedYoutube,searchYoutube} from './youtube-current.mjs';
const SOURCE='youtube-bulk-discovery-v2', DIRECT='youtube-bulk-direct-review', DAY=86400000;
const POLICY='https://developers.google.com/youtube/terms/developer-policies';
const AUTH='https://www.wikidata.org/wiki/Wikidata:Licensing';
const hash=s=>createHash('sha256').update(s).digest('hex');
const norm=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hasYoutube=c=>c.profiles.some(p=>p.network==='YouTube'&&/^https:\/\/youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/.test(p.url));
// Ranking is only a review aid; no match is verified by its title.
export function shortlistYoutube(name,channels){
 const aliases=[name,name.replace(/\s*\([^)]*\)\s*/g,' ').trim(),...Array.from(name.matchAll(/\(([^)]+)\)/g),m=>m[1])].map(norm).filter(Boolean);
 const ranked=[];for(const c of channels){const title=norm(c.title),bare=title.replace(/^(canal|official) /,'').replace(/ (oficial|official|canal|vevo)$/,'');if(!aliases.some(a=>a===title||a===bare))continue;
  if(/ (cortes|fans|fan club|cover|karaoke|topic|topico)( |$)/.test(' '+title))continue;
  if(!/^UC[A-Za-z0-9_-]{22}$/.test(c.id))continue;
  ranked.push({network:'YouTube',url:'https://youtube.com/channel/'+c.id});}
 return [...new Map(ranked.map(p=>[p.url,p])).values()].slice(0,5);
}
// Only locally known names and channel URLs are retained, not search titles/statistics.
// Expire unconfirmed API suggestions after seven days; leave independent evidence intact.
export function purgeBulkSuggestions(db,clock=()=>new Date()){
 const cutoff=new Date(+clock()-7*DAY).toISOString();db.exec('BEGIN IMMEDIATE');try{
 const rows=db.prepare("SELECT p.*, c.status FROM profiles p JOIN candidates c ON c.id=p.candidate_id WHERE p.source_id=? AND c.created_at<?").all(DIRECT,cutoff);
 for(const p of rows){if(confirmedYoutube(db,p)||db.prepare('SELECT 1 FROM observations WHERE profile_id=?').get(p.id))continue;
  db.prepare('DELETE FROM profiles WHERE id=?').run(p.id);
  db.prepare('DELETE FROM evidence WHERE candidate_id=? AND source_id=? AND url=?').run(p.candidate_id,DIRECT,p.url);}
 for(const id of new Set(rows.map(p=>p.candidate_id)))db.prepare("DELETE FROM candidates WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM profiles WHERE candidate_id=candidates.id) AND NOT EXISTS(SELECT 1 FROM evidence WHERE candidate_id=candidates.id) AND NOT EXISTS(SELECT 1 FROM approved_imports WHERE candidate_id=candidates.id)").run(id);
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
async function fallback(db,t,{fetcher,key}){
 if(!key)return {count:0,message:'Sem correspondência no Wikidata; chave YouTube ausente'};
 const existing=db.prepare("SELECT id,status,radar_id FROM candidates WHERE name=?").all(t.name);
 if(existing.length)return {review:true,count:0,message:'Já existe candidato com esse nome; revisar sem duplicar'};
 const source=db.prepare('SELECT enabled FROM sources WHERE id=?').get(DIRECT);if(source&&!source.enabled)return {count:0,message:'Fonte direta desabilitada'};
 const channels=await searchYoutube(t.name,{fetcher,key});const shortlisted=shortlistYoutube(t.name,channels);
 const profiles=shortlisted.filter(p=>!db.prepare('SELECT 1 FROM profiles WHERE network=? AND url=?').get(p.network,profileUrl(p.network,p.url)));
 if(!profiles.length)return {review:shortlisted.length>0,count:0,message:'Sem canal elegível ou canal já associado; revisar manualmente'};
 if(!source)configureSource(db,{id:DIRECT,kind:'licensed-file',authorization:POLICY,history_allowed:false,enabled:true});
 // Unique per local talent. All suggestions remain pending until operator checks independent evidence.
 ingest(db,DIRECT,[{external_id:t.id,name:t.name,evidence_url:profiles[0].url,profiles}]);
 return {count:1,message:`YouTube: ${profiles.length} canal(is) sugerido(s); confirmar identidade e canal individualmente`};
}
export function suggestRadarId(radar,name){const matches=radar.prepare('SELECT id,name FROM talents WHERE blocked=0 ORDER BY id').all().filter(t=>t.name===name);return matches.length===1?matches[0].id:null;}
export async function prospectYoutubeBulk(db,radar,{limit=10,dailyLimit=20,fetcher=fetch,key=process.env.YOUTUBE_API_KEY,clock=()=>new Date(),progress=()=>{}}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>100)throw Error('Limite inválido');
 purgeBulkSuggestions(db,clock);
 const oldSource=db.prepare('SELECT enabled FROM sources WHERE id=?').get('youtube-bulk-discovery');if(oldSource&&!oldSource.enabled)return {status:'disabled',attempted:0};
 const source=db.prepare('SELECT * FROM sources WHERE id=?').get(SOURCE);if(source&&!source.enabled)return {status:'disabled',attempted:0};
 if(!source)configureSource(db,{id:SOURCE,kind:'licensed-file',authorization:AUTH,history_allowed:false,enabled:true});
 const at=clock().toISOString(),cutoff=new Date(+clock()-DAY).toISOString(),week=new Date(+clock()-7*DAY).toISOString();
 const totals={status:'success',attempted:0,queued:0,review:0,unmatched:0,failed:0,already:0};
 // Reserve each attempt in SQLite before the network call: shared quota across worker and CLI.
 for(const t of radar.prepare('SELECT id,name FROM talents WHERE blocked=0 ORDER BY id').all()){
  if(totals.attempted>=limit)break;
  const linked=db.prepare("SELECT id FROM candidates WHERE radar_id=? AND status IN ('approved','published')").all(t.id);
  if(linked.some(x=>detail(db,x.id).profiles.some(p=>p.network==='YouTube'&&confirmedYoutube(db,p)))){totals.already++;continue;}
  if(suggestRadarId(radar,t.name)!==t.id){totals.review++;continue;}
  const job=hash(SOURCE+'\0'+t.id+'\0'+at.slice(0,10));let reserved=false;
  db.exec('BEGIN IMMEDIATE');try{
   const n=db.prepare('SELECT count(*) n FROM collection_jobs WHERE source_id=? AND created_at>=?').get(SOURCE,cutoff).n;
   const recent=db.prepare('SELECT 1 FROM collection_jobs WHERE source_id=? AND query=? AND created_at>=?').get(SOURCE,t.id,week);
   if(n<dailyLimit&&!recent)reserved=!!db.prepare('INSERT OR IGNORE INTO collection_jobs VALUES(?,?,?,?,?)').run(job,SOURCE,t.id,at,'running').changes;
   db.exec('COMMIT');if(n>=dailyLimit)break;
  }catch(e){db.exec('ROLLBACK');throw e;}
  if(!reserved)continue;totals.attempted++;let state='success',message='',count=0;
  try{
   const found=await globalSearch(db,radar,t.name,{fetcher});
   const exact=found.external.filter(x=>norm(x.name)===norm(t.name));
   if(exact.length!==1||!exact[0].profiles.some(p=>p.network==='YouTube')){const direct=await fallback(db,t,{fetcher,key});count=direct.count;message=direct.message;if(count)totals.queued++;else if(direct.review)totals.review++;else totals.unmatched++;}
   else {const x=await saveWikidata(db,exact[0].external_id,{fetcher});
    if(x.status==='rejected'||(x.radar_id&&x.radar_id!==t.id)||!hasYoutube(x)||x.name!==t.name){totals.review++;message='Divergência ou revisão anterior; não vinculado';}
    else{totals.queued++;count=1;message='Candidato disponível para revisão de identidade e canal; sem aprovação automática';}
   }
  }catch{state='failed';totals.failed++;message='Falha na fonte ou conflito de perfil; revisar';}
  db.prepare('UPDATE collection_jobs SET status=? WHERE id=?').run(state,job);
  db.prepare('INSERT INTO collection_logs VALUES(?,?,?,?,?,?)').run(randomUUID(),job,clock().toISOString(),state,count,t.name+': '+message);
  progress({artist:t.name,status:state,message});
 }
 if(totals.failed)totals.status='partial';return totals;
}
