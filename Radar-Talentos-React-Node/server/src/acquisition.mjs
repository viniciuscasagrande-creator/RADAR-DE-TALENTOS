import { operationsStatus } from './operations.mjs';
import { EXECUTION_PLAN_8_STEPS } from './menu-integration.mjs';
import { openDiscovery } from './discovery/engine.mjs';
// Read-only inventory: a recorded source or authorization reference is not proof of provenance.
export async function acquisitionStatus(db, readConfig) {
 const count=(table,where='')=>db.prepare(`SELECT count(*) n FROM ${table} ${where}`).get().n;
 const state=operationsStatus(db);
 let config=null;try{config=await readConfig()}catch{}
 const kinds=['metrics','audience','events'];
 const configured=(config?.jobs??[]).filter(j=>kinds.includes(j.kind));
 const jobs=configured.map(j=>{const r=state.jobs.find(x=>x.id===j.id&&x.kind===j.kind&&x.provider===j.provider);return {id:j.id,kind:j.kind,provider:j.provider,adapter:j.adapter,enabled:j.enabled,runAfter:j.runAfter??null,lastState:r?.state??null,lastRun:r?.finished_at??null,records:r?.records??null,stale:r?.stale??true};});
 const candidates=db.prepare(`SELECT a.name,a.platform_id,a.external_id,a.origin,l.url,e.title,l.first_seen FROM event_listing_artists a JOIN event_listings l ON l.platform_id=a.platform_id AND l.external_id=a.external_id JOIN events e ON e.id=l.event_id ORDER BY l.first_seen DESC,a.name LIMIT 100`).all();
 let discoveryCounts={candidates:0,profiles:0,observations:0,youtubeProfiles:0,youtubeObservations:0,openSocialObservations:0,recent24h:0,verifiedWithEvidence:0};
 let recentLogs=[];
 try{
  const ddb=openDiscovery();
  try{
   const dc=(t,w='')=>ddb.prepare(`SELECT count(*) n FROM ${t} ${w}`).get().n;
   const since24h=new Date(Date.now()-86400000).toISOString();
   discoveryCounts={
    candidates:dc('candidates'),
    profiles:dc('profiles'),
    observations:dc('observations'),
    youtubeProfiles:dc('profiles',"WHERE network='YouTube'"),
    youtubeObservations:dc('observations o JOIN profiles p ON p.id=o.profile_id',"WHERE p.network='YouTube'"),
    openSocialObservations:dc('observations',"WHERE source_id='open-social-current'"),
    recent24h:dc('observations',`WHERE observed_at >= '${since24h}'`),
    verifiedWithEvidence:dc('observations',"WHERE evidence_url LIKE 'https://%'")
   };
   recentLogs=ddb.prepare('SELECT id,job_id,at,status,count,message FROM collection_logs ORDER BY at DESC LIMIT 20').all();
  }finally{ddb.close();}
 }catch{}
 const youtubeConfigured=Boolean(process.env.YOUTUBE_API_KEY&&String(process.env.YOUTUBE_API_KEY).trim());
 const braveConfigured=Boolean(process.env.BRAVE_SEARCH_API_KEY&&String(process.env.BRAVE_SEARCH_API_KEY).trim());
 const connectedSourcesCount=[youtubeConfigured,braveConfigured,true,true,true].filter(Boolean).length;
 const day24h=new Date(Date.now()-86400000).toISOString().slice(0,10);
 const radarRecent24h=count('metric_current',`WHERE value IS NOT NULL AND (collected_at >= '${day24h}' OR observed_on >= '${day24h}')`);
 const radarEvidenceCount=count('media_metric_series',"WHERE evidence_url LIKE 'https://%'");
 return {
  configAvailable:!!config,
  canSync:jobs.some(j=>j.enabled),
  providers:{
   youtube:{configured:youtubeConfigured},
   brave:{configured:braveConfigured},
   wikidata:{configured:true},
   musicbrainz:{configured:true}
  },
  counts:{
   talents:count('talents','WHERE blocked=0'),
   socialAccounts:count('social_accounts'),
   confirmedAccounts:count('social_accounts','WHERE identity_confirmed=1'),
   commercialAccounts:count('commercial_accounts'),
   nationalRecords:count('metric_snapshots'),
   commercialRecords:count('commercial_snapshots'),
   regionalRecords:count('regional_audience'),
   events:count('events'),
   catalogedTalents:count('talent_metadata'),
   demographicsMunicipalities:count('municipality_demographics'),
   youtube_observations:Math.max(discoveryCounts.youtubeObservations,count('metric_snapshots',"WHERE network='YouTube'")),
   discovery_observations:discoveryCounts.observations,
   discovery_candidates:discoveryCounts.candidates,
   discovery_profiles:discoveryCounts.profiles,
   open_social_observations:discoveryCounts.openSocialObservations,
   connected_sources:connectedSourcesCount,
   collections_24h:Math.max(discoveryCounts.recent24h,radarRecent24h),
   evidence_records:Math.max(discoveryCounts.verifiedWithEvidence,radarEvidenceCount)
  },
  discoveryLogs:recentLogs,
  executionPlan:EXECUTION_PLAN_8_STEPS,
  jobs,
  candidates,
  history:state.history.filter(r=>configured.some(j=>j.id===r.job_id)).map(({job_id,day,state,records,finished_at})=>({job_id,day,state,records,finished_at})),
  notice:'Contagens de registros, não certificação de origem. Atrações observadas não são identidades homologadas.'
 };
}
