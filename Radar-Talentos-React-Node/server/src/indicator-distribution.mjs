/**
 * Radar: camada central de leitura para os diferentes painéis.
 * Não escreve nos bancos, não consulta ticketeiras ou IBGE e não certifica
 * automaticamente a procedência das observações legadas.
 */
const PRIMARY = Object.freeze({Instagram:'followers',Spotify:'monthly_listeners',YouTube:'subscribers',TikTok:'followers'});
const DAY=86400000;
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const number=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const evidence=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
function normalizePoint(p,ref){
 if(!p||!validDate(p.date)||!number(p.value)||!p.source||typeof p.source!=='string')return null;
 return {date:p.date,value:p.value,source:p.source,evidence_url:evidence(p.evidence_url),source_type:p.source_type||'não classificado',collected_at:p.collected_at||null,reference_end:ref};
}
function delta(history,days){
 const current=history.at(-1);if(!current)return null;
 const target=Date.parse(current.date)-days*DAY;
 const candidates=history.slice(0,-1).filter(p=>p.source===current.source&&p.evidence_url&&current.evidence_url&&Math.abs(Date.parse(p.date)-target)<=(days===7?2:3)*DAY);
 candidates.sort((a,b)=>Math.abs(Date.parse(a.date)-target)-Math.abs(Date.parse(b.date)-target)||a.date.localeCompare(b.date));
 const before=candidates[0];if(!before)return null;
 return {days,absolute:current.value-before.value,percent:before.value>0?Number(((current.value-before.value)*100/before.value).toFixed(2)):null,baseline_on:before.date,observed_on:current.date,source:current.source};
}
/** A origem reportada não constitui prova independente da autenticidade. */
export function distributeArtistStats(raw,{end=new Date().toISOString().slice(0,10)}={}){
 if(!raw||!raw.talent_id||!validDate(end))throw Error('Consulta central inválida');
 const networks={};
 for(const [name,metric] of Object.entries(PRIMARY)){
  const origin=raw[name]||{};
  const byDate=new Map();const conflicts=new Set();
  for(const item of Array.isArray(origin.history)?origin.history:[]){
   const p=normalizePoint(item,end);if(!p||p.date>end)continue;
   const old=byDate.get(p.date);
   if(old&&(old.value!==p.value||old.source!==p.source||old.evidence_url!==p.evidence_url))conflicts.add(p.date);
   else byDate.set(p.date,p);
  }
  for(const d of conflicts)byDate.delete(d);
  const history=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const current=history.at(-1)||null;
  networks[name]={network:name,metric,profile_url:evidence(origin.profile_url),
    current:current?{value:current.value,observed_on:current.date,source:current.source,evidence_url:current.evidence_url,source_type:current.source_type,collection_status:current.evidence_url?'evidencia_registrada':'procedencia_pendente'}:null,
    growth_7d:delta(history,7),growth_30d:delta(history,30),
    history:history.slice(-100).map(({date,value,source,evidence_url})=>({date,value,source,evidence_url})),
    conflicts:conflicts.size,
    status:current?(current.evidence_url?'observado_com_referencia':'revisao_necessaria'):(origin.profile_url?'perfil_sem_coleta':'perfil_nao_identificado')};
 }
 return {schema_version:1,talent_id:raw.talent_id,name:raw.name,reference_end:end,networks,
  distribution:['visao_geral','ficha_360','oportunidade_comercial'],
  regional_audience:'rota_regional_separada_exige_auditoria',
  notice:'Fonte e evidência registradas não equivalem a autenticação externa. Não soma métricas de redes distintas; não usa IBGE ou eventos.'};
}
