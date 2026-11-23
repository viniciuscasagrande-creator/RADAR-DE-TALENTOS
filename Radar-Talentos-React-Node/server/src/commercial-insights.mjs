import { commercialQuery, metrics } from './commercial.mjs';
import { PLATFORM_POLICIES } from './discovery.mjs';
import { radarQuery, FilterError } from './radar.mjs';
import { formatCompactPtBr, getArtistMediaStats } from './menu-integration.mjs';
const networks=Object.keys(metrics);
const norm=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
const regionalPreferred={YouTube:['views','subscribers'],Instagram:['views','reach','followers'],Spotify:['streams','listeners'],TikTok:['views','reach','followers']};
const primary={YouTube:'subscribers',Instagram:'followers',Spotify:'monthly_listeners',TikTok:'followers'};
export function commercialInsights(db,p){
 const talent=p.get('talent')||'', rawNet=p.get('network')||'all', isAll=rawNet==='all'||rawNet==='Todas as mídias', network=isAll?'all':rawNet, days=p.get('days')||'30', modality=p.get('modality')||'',region=p.get('region')||'',scope=p.get('scope')||'all';
 if((!isAll&&!networks.includes(network))||!['all','artist'].includes(scope)||scope==='artist'&&!talent||!['','Norte','Nordeste','Centro-Oeste','Sudeste','Sul'].includes(region))throw new FilterError('Filtro de detalhes inválido');
 if(modality&&!db.prepare('SELECT 1 FROM modalities WHERE id=?').get(modality))throw new FilterError('Modalidade inválida');
 const base=new URLSearchParams({network,days});if(p.get('end'))base.set('end',p.get('end'));const {start,end}=commercialQuery(db,new URLSearchParams({...Object.fromEntries(base),talent:'__period_validation__'}));
 const artist=talent?db.prepare('SELECT id,name FROM talents WHERE id=? AND blocked=0').get(talent):null;if(talent&&!artist)throw new FilterError('Artista não encontrado');
 const findCurrent=db.prepare('SELECT status,status_detail,collected_at,source FROM metric_current WHERE talent_id=? AND network=? AND metric=? LIMIT 1');
 const findAcct=db.prepare('SELECT url,identity_source FROM commercial_accounts WHERE talent_id=? AND network=? LIMIT 1');
 const findSoc=db.prepare('SELECT url,identity_source FROM social_accounts WHERE talent_id=? AND network=? LIMIT 1');
 const national=artist?networks.map(n=>{
  const queryWin=d=>commercialQuery(db,new URLSearchParams({network:n,metric:primary[n],days:String(d),end,talent})).items[0]??null;
  const item=queryWin(days);
  const windows={7:Number(days)===7?item:queryWin(7),15:Number(days)===15?item:queryWin(15),30:Number(days)===30?item:queryWin(30),90:Number(days)===90?item:queryWin(90)};
  const cur=findCurrent.get(talent,n,primary[n]);
  const acct=findAcct.get(talent,n)||findSoc.get(talent,n)||null;
  const policy=PLATFORM_POLICIES[n]??{};
  const currentStatus=cur??(item?{status:'available',status_detail:'Atualizado',collected_at:item.collected_at??item.observed_on,source:item.source}:{status:policy.fallbackStatus??'pending_source',status_detail:policy.fallbackLabel??'Sem coleta · Aguardando fonte autorizada',collected_at:null,source:acct?.identity_source??null});
  const profileUrl=item?.url??acct?.url??null;
  const formatted=item?formatCompactPtBr(item.value):'Sem coleta';
  const statusLabel=item?formatted:'Sem coleta';
  return {network:n,metric:primary[n],item,windows,currentStatus,profileUrl,formatted,statusLabel};
 }):[];
 const consolidatedWindows=artist?[7,15,30,90].reduce((acc,w)=>{
  const comp=national.filter(n=>n.windows?.[w]?.growth_pct!=null).sort((a,b)=>b.windows[w].growth_pct-a.windows[w].growth_pct);
  const avgPct=comp.length?comp.reduce((s,n)=>s+n.windows[w].growth_pct,0)/comp.length:null;
  const topW=comp[0]??null;
  acc[w]={days:w,growth_pct:avgPct,comparable_networks:comp.length,top_network:topW?topW.network:null,top_growth_pct:topW?topW.windows[w].growth_pct:null,top_growth:topW?topW.windows[w].growth:null};
  return acc;
 },{}):null;
 const subject=scope==='artist'?talent:'';
 const reports=db.prepare(`SELECT a.network,a.metric,a.period_start,a.period_end,a.source,a.quality,count(DISTINCT a.talent_id) talents FROM regional_audience a JOIN talents t ON t.id=a.talent_id JOIN municipalities m ON m.code=a.municipality_code WHERE t.blocked=0 AND a.period_start>=? AND a.period_end<=? AND (?='' OR a.talent_id=?) AND (?='' OR m.region=?) AND (?='' OR EXISTS(SELECT 1 FROM talent_modalities tm WHERE tm.talent_id=t.id AND tm.modality_id=?)) GROUP BY a.network,a.metric,a.period_start,a.period_end,a.source,a.quality ORDER BY a.period_end DESC,a.period_start ASC, a.source`).all(start,end,subject,subject,region,region,modality,modality);
 const regional=networks.map(n=>{const preferred=regionalPreferred[n],selected=p.get('metric_'+n)||'';if(selected&&!preferred.includes(selected))throw new FilterError('Indicador regional inválido');const available=reports.filter(r=>r.network===n&&preferred.includes(r.metric));const choices=[...new Set(available.map(r=>r.metric))].sort((a,b)=>preferred.indexOf(a)-preferred.indexOf(b));const candidates=available.filter(r=>!selected||r.metric===selected).sort((a,b)=>b.period_end.localeCompare(a.period_end)||Number(b.quality==='verified')-Number(a.quality==='verified')||preferred.indexOf(a.metric)-preferred.indexOf(b.metric)||a.period_start.localeCompare(b.period_start)||a.source.localeCompare(b.source));const report=candidates[0];if(!report)return {network:n,choices,report:null,cities:[],regions:[],total:null};const params=new URLSearchParams({mode:'regional',order:'audience',network:n,metric:report.metric,start:report.period_start,end:report.period_end,source:report.source,quality:report.quality,talent:subject,modality,region});const r=radarQuery(db,'/api/radar/ranking',params);const total=r.places.reduce((s,c)=>s+c.value,0);
 // Comparação municipal só para um artista, em janelas adjacentes de igual duração e fonte/qualidade idênticas.
 let cityGrowth=null;
 if(subject){const day=86400000,previousEnd=new Date(Date.parse(report.period_start)-day).toISOString().slice(0,10),previousStart=new Date(Date.parse(previousEnd)-(Date.parse(report.period_end)-Date.parse(report.period_start))).toISOString().slice(0,10);const priorParams=new URLSearchParams(params);priorParams.set('start',previousStart);priorParams.set('end',previousEnd);const prior=radarQuery(db,'/api/radar/ranking',priorParams);const before=new Map(prior.places.map(c=>[c.code,c.value]));const comparable=r.places.filter(c=>before.has(c.code)).map(c=>({...c,previous:before.get(c.code),growth:c.value-before.get(c.code),growth_pct:before.get(c.code)>0?(c.value-before.get(c.code))/before.get(c.code)*100:null})).sort((a,b)=>b.growth-a.growth||a.code.localeCompare(b.code));if(comparable.length)cityGrowth={previousStart,previousEnd,comparable:comparable.length,leaders:comparable.filter(c=>c.growth>0).slice(0,5)};}
 return {network:n,choices,report,cities:r.places.slice(0,5),regions:r.byRegion,total,municipalities:r.places.length,talents:r.total,cityGrowth};});
 const topNet=national.filter(x=>x.item?.growth_pct!=null).sort((a,b)=>b.item.growth_pct-a.item.growth_pct)[0]??null;
 const allRising=regional.flatMap(g=>(g.cityGrowth?.leaders??[]).map(c=>({...c,network:g.network}))).sort((a,b)=>(b.growth_pct??0)-(a.growth_pct??0)||b.growth-a.growth);
 const lastCollected=national.map(x=>x.item?.observed_on).filter(Boolean).sort().at(-1)??null;
 let eventsPresence=null,regionalSummary=null,catalog=null;
 if(artist){
  const aKey=norm(artist.name);
  const rawEvs=db.prepare(`SELECT e.id,e.title,e.venue,e.event_date,m.name AS city_name,m.uf,m.region,l.platform_id,l.url,a.artist_key FROM event_listing_artists a JOIN event_listings l ON l.platform_id=a.platform_id AND l.external_id=a.external_id JOIN events e ON e.id=l.event_id JOIN municipalities m ON m.code=e.municipality_code WHERE l.status!='cancelled' ORDER BY e.event_date ASC`).all().filter(r=>r.artist_key===aKey||(aKey.length>=4&&(r.artist_key.includes(aKey)||aKey.includes(r.artist_key))));
  const evs=[...new Map(rawEvs.map(e=>[e.id,e])).values()];
  const cities=[...new Set(evs.map(e=>`${e.city_name}/${e.uf}`))];
  const platforms=[...new Set(evs.map(e=>e.platform_id))];
  eventsPresence={count:evs.length,citiesCount:cities.length,cities,platforms,statusLabel:evs.length>0?`${evs.length} evento(s) em ${cities.length} cidade(s)`:'A integrar',items:evs.slice(0,8),notice:'Os eventos permitem identificar presença territorial do artista, mas não devem ser confundidos com audiência digital ou ingressos vendidos.'};
  const regWithData=regional.filter(g=>g.report!=null);
  const maxMunis=regWithData.reduce((m,g)=>Math.max(m,g.municipalities||0),0);
  regionalSummary={hasData:regWithData.length>0,networksCount:regWithData.length,municipalitiesCount:maxMunis,statusLabel:regWithData.length>0?`${maxMunis} município(s)`:'Sem dados'};
  const meta=db.prepare('SELECT * FROM talent_metadata WHERE talent_id=?').get(artist.id);
  let genres=[];try{genres=JSON.parse(meta?.genres||'[]');}catch{}
  catalog={wikidata_id:meta?.wikidata_id??null,musicbrainz_id:meta?.musicbrainz_id??null,official_website:meta?.official_website??null,agenda_url:meta?.agenda_url??null,genres,description:meta?.description??''};
 }
 const mediaStats=artist?getArtistMediaStats(db,artist.id,{end}):null;
 return {artist,network,start,end,scope,national,consolidatedWindows,regional,eventsPresence,regionalSummary,catalog,mediaStats,topNetwork:topNet?{network:topNet.network,metric:topNet.metric,growth:topNet.item.growth,growth_pct:topNet.item.growth_pct}:null,risingCity:allRising[0]??null,lastCollected};
}
