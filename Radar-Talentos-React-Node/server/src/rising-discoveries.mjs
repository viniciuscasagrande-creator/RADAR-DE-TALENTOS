// Read-only, conservative growth signals. A stored source label is NOT independent certification.
const DAY=86400000;
const PRIMARY={Instagram:'followers',Spotify:'monthly_listeners',YouTube:'subscribers',TikTok:'followers'};
const secure=(s)=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}};
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s));
export function risingDiscoveries(db,{now=new Date(),limit=50,thresholdPct=5,minAbsolute=20}={}){
 const clock=now instanceof Date?+now:Date.parse(now);
 if(!Number.isFinite(clock)||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Parametros invalidos');
 const rows=db.prepare(`SELECT s.talent_id,t.name,s.network,s.metric,s.observed_on,s.value,s.source,s.source_type,s.evidence_url
   FROM media_metric_series s JOIN talents t ON t.id=s.talent_id AND t.blocked=0
   WHERE s.source_type IN ('oficial','relatorio_autorizado','observado')
   ORDER BY s.talent_id,s.network,s.metric,s.source,s.observed_on`).all();
 const groups=new Map();
 for(const r of rows){
  if(PRIMARY[r.network]!==r.metric||!validDay(r.observed_on)||!Number.isSafeInteger(r.value)||r.value<0||!secure(r.evidence_url)||!r.source?.trim())continue;
  const at=Date.parse(r.observed_on);if(at>clock||at<clock-65*DAY)continue;
  const key=JSON.stringify([r.talent_id,r.network,r.metric,r.source]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 const candidates=[];
 for(const items of groups.values()){
  const last=items.at(-1);if(clock-Date.parse(last.observed_on)>7*DAY)continue;
  const target=Date.parse(last.observed_on)-30*DAY;
  const prev=items.slice(0,-1).filter(x=>{const d=Date.parse(last.observed_on)-Date.parse(x.observed_on);return d>=27*DAY&&d<=33*DAY;}).sort((a,b)=>Math.abs(Date.parse(a.observed_on)-target)-Math.abs(Date.parse(b.observed_on)-target)||a.observed_on.localeCompare(b.observed_on))[0];
  if(!prev||prev.value<=0)continue;
  const delta=last.value-prev.value,pct=100*delta/prev.value;
  if(delta<minAbsolute||pct<thresholdPct)continue;
  candidates.push({talent_id:last.talent_id,name:last.name,network:last.network,metric:last.metric,value:last.value,baseline_value:prev.value,delta,change_pct:Math.round(pct*100)/100,observed_on:last.observed_on,baseline_on:prev.observed_on,source:last.source,source_type:last.source_type,evidence_url:last.evidence_url,source_verification:'referencia_declarada_na_base',category:'growth_signal'});
 }
 // Never count one artist more than once in the global signal, even if several media rise.
 candidates.sort((a,b)=>b.change_pct-a.change_pct||b.delta-a.delta||a.name.localeCompare(b.name,'pt-BR'));
 const byTalent=new Map();for(const x of candidates)if(!byTalent.has(x.talent_id))byTalent.set(x.talent_id,x);
 const sorted=[...byTalent.values()];
 return {generated_at:new Date(clock).toISOString(),criteria:{window_days:30,tolerance_days:3,max_age_days:7,minimum_growth_pct:thresholdPct,minimum_absolute_growth:minAbsolute,require_same_source:true,scope:'historico nacional; sem dados regionais, populacao IBGE ou ticketeiras'},total:sorted.length,items:sorted.slice(0,limit),notice:'Sinais calculados com observacoes datadas e fontes declaradas no banco. A fonte e a evidencia precisam de auditoria externa antes de uso comercial definitivo.'};
}
