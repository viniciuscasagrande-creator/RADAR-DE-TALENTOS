import {attachTalentCategories} from './talent-taxonomy.mjs';
import {upsertMetricCurrent} from './registry.mjs';
import {FilterError} from './radar.mjs';
export const metrics={Instagram:['followers','views','likes','comments'],YouTube:['subscribers','views','likes','comments'],Spotify:['monthly_listeners','followers','streams'],TikTok:['followers','views','likes','comments']};
const primary={Instagram:'followers',YouTube:'subscribers',Spotify:'monthly_listeners',TikTok:'followers'};
const allNetworks=Object.keys(metrics);
const consolidatedMetrics=['consolidated_growth'];
const hosts={Instagram:['instagram.com'],YouTube:['youtube.com'],Spotify:['open.spotify.com','spotify.com'],TikTok:['tiktok.com']};
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const str=(v,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Campo obrigatório ou inválido');return v.trim()};
const shift=(d,n)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
const normQ=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
const cmpNumDesc=(a,b)=>a==null&&b==null?0:a==null?1:b==null?-1:b-a;
export function importCommercial(db,batch,{network=null,day=new Date().toISOString().slice(0,10),allowIntradayUpdate=false}={},onCommit=null){
 if(!batch||!Array.isArray(batch.artists)||batch.artists.length>20000||typeof batch.authorization_ref!=='string'||!batch.authorization_ref.trim()||batch.authorization_ref.length>500)throw Error('Lote ou autorização inválida');
 db.exec('BEGIN IMMEDIATE');try{let count=0;for(const t of batch.artists){const id=str(t.id),name=str(t.name);const old=db.prepare('SELECT name,blocked FROM talents WHERE id=?').get(id);if(old&&(old.name!==name||old.blocked))throw Error('Identidade divergente ou bloqueada');if(!old)db.prepare('INSERT INTO talents(id,name) VALUES(?,?)').run(id,name);attachTalentCategories(db,id,t.categories??[]);for(const m of t.modalities??[])db.prepare('INSERT OR IGNORE INTO talent_modalities VALUES(?,?)').run(id,m);
 if(!Array.isArray(t.accounts))throw Error('Contas obrigatórias');for(const a of t.accounts){const aid=str(a.id),n=a.network,u=new URL(str(a.url,2000)),evidence=str(a.identity_source);if(!metrics[n]||network&&network!==n||u.protocol!=='https:'||u.username||u.password||u.port||!hosts[n].some(h=>u.hostname===h||u.hostname==='www.'+h||u.hostname==='m.'+h))throw Error('Rede ou endereço incompatível');const url=u.origin+u.pathname.replace(/\/$/,'');const prev=db.prepare('SELECT * FROM commercial_accounts WHERE id=?').get(aid);if(prev&&(prev.talent_id!==id||prev.network!==n||prev.url!==url))throw Error('Conta divergente');const legacy=db.prepare('SELECT talent_id FROM social_accounts WHERE network=? AND rtrim(url,\'/\')=?').get(n,url);if(legacy&&legacy.talent_id!==id)throw Error('Conta vinculada a outro talento');if(!prev)db.prepare('INSERT INTO commercial_accounts VALUES(?,?,?,?,?)').run(aid,id,n,url,evidence);if(!Array.isArray(a.snapshots)||a.snapshots.length>10000)throw Error('Histórico inválido');for(const s of a.snapshots){if(!metrics[n].includes(s.metric)||!validDate(s.observed_on)||s.observed_on>day||!Number.isSafeInteger(s.value)||s.value<0)throw Error('Observação inválida');const source=str(s.source);const past=db.prepare('SELECT value,source,authorization_ref FROM commercial_snapshots WHERE account_id=? AND metric=? AND observed_on=?').get(aid,s.metric,s.observed_on);if(past){if(past.source!==source||past.authorization_ref!==batch.authorization_ref)throw Error('Histórico divergente');if(past.value!==s.value){if(!allowIntradayUpdate&&!s.intraday)throw Error('Histórico divergente');db.prepare('UPDATE commercial_snapshots SET value=? WHERE account_id=? AND metric=? AND observed_on=?').run(s.value,aid,s.metric,s.observed_on);upsertMetricCurrent(db,{account_id:aid,talent_id:id,network:n,metric:s.metric,value:s.value,observed_on:s.observed_on,collected_at:s.collected_at??new Date().toISOString(),source,status:'available',status_detail:'Atualizado'});count++;}continue;}db.prepare('INSERT INTO commercial_snapshots VALUES(?,?,?,?,?,?)').run(aid,s.metric,s.observed_on,s.value,source,batch.authorization_ref);upsertMetricCurrent(db,{account_id:aid,talent_id:id,network:n,metric:s.metric,value:s.value,observed_on:s.observed_on,collected_at:s.collected_at??new Date().toISOString(),source,status:'available',status_detail:'Atualizado'});count++;}}}onCommit?.(count);db.exec('COMMIT');return count;}catch(e){db.exec('ROLLBACK');throw e;}
}
function querySingleNetworkItems(db,{network,metric,days,start,end,modality,q,talent}){
 const qNorm=normQ(q);
 const rows=db.prepare(`SELECT o.*,t.name FROM commercial_observations o JOIN talents t ON t.id=o.talent_id WHERE t.blocked=0 AND o.network=? AND o.observed_on<=? AND (?='' OR EXISTS(SELECT 1 FROM talent_modalities m WHERE m.talent_id=t.id AND m.modality_id=?)) AND (?='' OR t.id=?) ORDER BY o.observed_on DESC`).all(network,end,modality,modality,talent,talent);
 const groups=new Map();for(const r of rows){if(qNorm&&!normQ(r.name).includes(qNorm)&&!normQ(r.talent_id).includes(qNorm))continue;const key=JSON.stringify([r.talent_id,r.url,r.metric,r.source]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const best=new Map(),sizes=new Map();for(const g of groups.values()){const latest=g[0];if(latest.metric===primary[network]&&latest.observed_on>=start){const prior=sizes.get(latest.talent_id);if(!prior||latest.observed_on>prior.observed_on||latest.observed_on===prior.observed_on&&latest.value>prior.value)sizes.set(latest.talent_id,latest);}if(latest.metric!==metric||latest.observed_on<start)continue;const baseline=g.find(r=>r.observed_on<=start);const comparable=baseline&&baseline.observed_on!==latest.observed_on&&baseline.observed_on>=shift(start,-Math.min(7,days))&&latest.observed_on>=shift(end,-Math.min(7,days));const delta=comparable?latest.value-baseline.value:null;const item={id:latest.talent_id,name:latest.name,url:latest.url,source:latest.source,value:latest.value,observed_on:latest.observed_on,baseline_on:comparable?baseline.observed_on:null,growth:delta,growth_pct:delta!==null&&baseline.value>0?delta/baseline.value*100:null,history:g.filter(r=>r.observed_on>=shift(start,-7)).reverse().map(r=>({date:r.observed_on,value:r.value}))};const old=best.get(item.id);if(!old||item.observed_on>old.observed_on||item.observed_on===old.observed_on&&item.value>old.value)best.set(item.id,item);}
 const findAccount=db.prepare('SELECT id,collection_state FROM social_accounts WHERE talent_id=? AND network=? ORDER BY identity_confirmed DESC LIMIT 1');
 const findSnap=db.prepare('SELECT collected_at FROM metric_snapshots WHERE account_id=? AND metric=? AND observed_on=?');
 const findFail=db.prepare("SELECT finished_at,error_message FROM collection_runs WHERE account_id=? AND status='failed' ORDER BY finished_at DESC LIMIT 1");
 const findModalities=db.prepare('SELECT m.name FROM modalities m JOIN talent_modalities t ON t.modality_id=m.id WHERE t.talent_id=?');
 return [...best.values()].map(r=>{
  const v=sizes.get(r.id)?.value;
  const acc=findAccount.get(r.id,network);
  const snap=acc?findSnap.get(acc.id,metric,r.observed_on):null;
  const collected_at=snap?.collected_at??null;
  const collection_state=acc?.collection_state??'collected';
  const failRun=collection_state==='error'&&acc?findFail.get(acc.id):null;
  const unavailable_since=collection_state==='error'?(failRun?.finished_at?.slice(0,10)??r.observed_on):null;
  const freshness_label=collection_state==='error'
   ?`Indisponível desde ${unavailable_since} (última coleta válida em ${r.observed_on} · ${r.source})`
   :`${r.source} · atualizado em ${collected_at?collected_at.slice(0,16).replace('T',' '):r.observed_on}`;
  return {...r,network,metric,collected_at,collection_state,unavailable_since,freshness_label,size_value:v??null,size:v==null?'unknown':v<10000?'small':v<100000?'medium':'large',modalities:findModalities.all(r.id).map(x=>x.name)};
 });
}
export function commercialQuery(db,p){
 const rawNet=p.get('network')||'all',isAll=rawNet==='all'||rawNet==='Todas as mídias',network=isAll?'all':rawNet,metric=p.get('metric')||(isAll?'consolidated_growth':primary[network]),days=Number(p.get('days')||30),end=p.get('end')||new Date().toISOString().slice(0,10),order=p.get('order')||'growth_pct',size=p.get('size')||'',modality=p.get('modality')||'',q=(p.get('q')||'').toLowerCase(),talent=p.get('talent')||'',trend=p.get('trend')||'';
 const validMetric=isAll?consolidatedMetrics.includes(metric):Boolean(metrics[network]?.includes(metric));
 if(!validMetric||![7,15,30,90].includes(days)||!validDate(end)||!['growth_pct','growth','value'].includes(order)||!['','small','medium','large','unknown'].includes(size)||!['','growing','unknown','declining'].includes(trend))throw new FilterError('Filtro comercial inválido');
 const start=shift(end,-days);
 let items;
 if(!isAll){
  items=querySingleNetworkItems(db,{network,metric,days,start,end,modality,q,talent}).filter(r=>(!size||r.size===size)&&(!trend||trend==='growing'&&r.growth>0||trend==='unknown'&&r.growth===null||trend==='declining'&&r.growth<0));
 }else{
  const byNet=new Map();
  for(const net of allNetworks){
   const list=querySingleNetworkItems(db,{network:net,metric:primary[net],days,start,end,modality,q,talent});
   byNet.set(net,new Map(list.map(it=>[it.id,it])));
  }
  const artistIds=new Set();
  for(const netMap of byNet.values())for(const id of netMap.keys())artistIds.add(id);
  items=[...artistIds].map(artistId=>{
   const networksMap={},available=[];
   for(const net of allNetworks){
    const it=byNet.get(net).get(artistId)||null;
    networksMap[net]=it?{network:net,metric:primary[net],value:it.value,growth:it.growth,growth_pct:it.growth_pct,observed_on:it.observed_on,baseline_on:it.baseline_on,source:it.source,url:it.url,size:it.size,size_value:it.size_value,collection_state:it.collection_state,freshness_label:it.freshness_label,history:it.history}:null;
    if(it)available.push({network:net,metric:primary[net],item:it});
   }
   const comparableList=available.filter(x=>x.item.growth_pct!==null).sort((a,b)=>b.item.growth_pct-a.item.growth_pct||cmpNumDesc(a.item.growth,b.item.growth)||b.item.value-a.item.value);
   const fallbackList=[...available].sort((a,b)=>cmpNumDesc(a.item.growth,b.item.growth)||b.item.value-a.item.value||b.item.observed_on.localeCompare(a.item.observed_on));
   const topEntry=comparableList[0]??fallbackList[0],topItem=topEntry.item;
   const consolidatedPct=comparableList.length>0?comparableList.reduce((s,x)=>s+x.item.growth_pct,0)/comparableList.length:null;
   const sizeValues=available.map(x=>x.item.size_value).filter(v=>v!=null);
   const maxSizeVal=sizeValues.length?Math.max(...sizeValues):null;
   const artistSize=maxSizeVal==null?'unknown':maxSizeVal<10000?'small':maxSizeVal<100000?'medium':'large';
   const latestObserved=available.map(x=>x.item.observed_on).filter(Boolean).sort().at(-1)??topItem.observed_on;
   const latestCollected=available.map(x=>x.item.collected_at).filter(Boolean).sort().at(-1)??topItem.collected_at;
   const leadGrowth=comparableList.length>0?topItem.growth:null;
   return {
    id:topItem.id,
    name:topItem.name,
    url:topItem.url,
    source:`${available.length} mídias (${available.map(x=>x.network).join(', ')})`,
    value:topItem.value,
    observed_on:latestObserved,
    baseline_on:topItem.baseline_on,
    growth:leadGrowth,
    growth_pct:consolidatedPct,
    consolidated_growth_pct:consolidatedPct,
    top_network:topEntry.network,
    top_network_metric:topEntry.metric,
    top_network_value:topItem.value,
    top_network_growth:topItem.growth,
    top_network_growth_pct:topItem.growth_pct,
    active_networks_count:available.length,
    comparable_networks_count:comparableList.length,
    networks:networksMap,
    history:topItem.history,
    collected_at:latestCollected,
    collection_state:available.some(x=>x.item.collection_state==='collected')?'collected':topItem.collection_state,
    unavailable_since:null,
    freshness_label:`${available.length}/4 mídias · Maior alta: ${topEntry.network}${topItem.growth_pct!=null?` (${topItem.growth_pct>=0?'+':''}${topItem.growth_pct.toFixed(1)}%)`:''} · atualizado em ${latestObserved}`,
    size_value:maxSizeVal,
    size:artistSize,
    modalities:topItem.modalities
   };
  }).filter(r=>(!size||r.size===size)&&(!trend||trend==='growing'&&r.growth_pct!==null&&r.growth_pct>0||trend==='unknown'&&r.growth_pct===null||trend==='declining'&&r.growth_pct!==null&&r.growth_pct<0));
 }
 items.sort((a,b)=>cmpNumDesc(a[order],b[order])||cmpNumDesc(a.value,b.value)||a.name.localeCompare(b.name));
 const growing=items.filter(r=>isAll?(r.growth_pct??0)>0:r.growth>0).length;
 const total=items.length;
 const comparable=items.filter(r=>isAll?r.growth_pct!==null:r.growth!==null).length;
 const included_networks=isAll?[...allNetworks]:[network];
 const networks_status=allNetworks.map(n=>({network:n,metric:primary[n],included:isAll||n===network,status:isAll||n===network?'Incluído na consulta':'Filtro individual'}));
 return {network,network_label:isAll?'Todas as mídias':network,included_networks,networks_status,metric,start,end,total,growing,comparable,items:items.slice(0,200),modalities:db.prepare('SELECT id,name FROM modalities ORDER BY name').all()};
}
