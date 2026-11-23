/** Aceleração observacional, somente leitura: NÃO certifica fonte nem identidade. */
const DAY=86400000;
const PRIMARY=Object.freeze({Instagram:'followers',Spotify:'monthly_listeners',YouTube:'subscribers',TikTok:'followers'});
function https(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
function date(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s}
const rounded=n=>Math.round(n*100)/100;
const near=(rows,ref,days)=>rows.filter(x=>{const diff=(Date.parse(ref.observed_on)-Date.parse(x.observed_on))/DAY;return diff>=days-3&&diff<=days+3}).sort((a,b)=>Math.abs(Date.parse(ref.observed_on)-Date.parse(a.observed_on)-days*DAY)-Math.abs(Date.parse(ref.observed_on)-Date.parse(b.observed_on)-days*DAY)||b.observed_on.localeCompare(a.observed_on))[0];
/** Três pontos (~60, ~30, atual); crescimento em % das duas janelas; categorias declaradas no cadastro. */
export function accelerationDiscoveries(db,{now=new Date(),limit=50,minRecentPct=5,minAccelerationPp=5,minRecentAbsolute=20,maxAgeDays=10}={}){
 const clock=now instanceof Date?+now:Date.parse(now);
 if(!Number.isFinite(clock)||!Number.isInteger(limit)||limit<1||limit>100||![minRecentPct,minAccelerationPp,minRecentAbsolute,maxAgeDays].every(x=>Number.isFinite(x)&&x>=0))throw Error('Parâmetros inválidos');
 const rows=db.prepare(`SELECT s.talent_id,t.name,s.network,s.metric,s.observed_on,s.value,s.source,s.source_type,s.evidence_url FROM media_metric_series s JOIN talents t ON t.id=s.talent_id AND t.blocked=0 WHERE s.source_type IN ('oficial','relatorio_autorizado','observado') ORDER BY s.talent_id,s.network,s.metric,s.source,s.observed_on`).all();
 const cats=db.prepare('SELECT tc.talent_id,c.name FROM talent_categories tc JOIN categories c ON c.id=tc.category_id').all();
 const byCat=new Map();for(const c of cats){if(!byCat.has(c.talent_id))byCat.set(c.talent_id,[]);byCat.get(c.talent_id).push(c.name)}
 const groups=new Map();
 for(const r of rows){if(PRIMARY[r.network]!==r.metric||!date(r.observed_on)||!Number.isSafeInteger(r.value)||r.value<0||!https(r.evidence_url)||!r.source?.trim())continue;
  const stamp=Date.parse(r.observed_on);if(stamp>clock||stamp<clock-75*DAY)continue;
  const key=JSON.stringify([r.talent_id,r.network,r.metric,r.source]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 const candidates=[];
 for(const list of groups.values()){
  // Ambiguous observations for one day must not be resolved arbitrarily.
  const dates=new Map(),conflicting=new Set();for(const p of list){const old=dates.get(p.observed_on);if(old&&(old.value!==p.value||old.evidence_url!==p.evidence_url))conflicting.add(p.observed_on);else dates.set(p.observed_on,p)}
  for(const d of conflicting)dates.delete(d);
  const series=[...dates.values()].sort((a,b)=>a.observed_on.localeCompare(b.observed_on));const last=series.at(-1);if(!last||(clock-Date.parse(last.observed_on))/DAY>maxAgeDays)continue;
  const middle=near(series.slice(0,-1),last,30);if(!middle)continue;
  const first=near(series.filter(x=>x.observed_on<middle.observed_on),middle,30);if(!first||first.value<100||middle.value<=0)continue;
  const recentDelta=last.value-middle.value,oldDelta=middle.value-first.value;
  const recentPct=recentDelta/middle.value*100,previousPct=oldDelta/first.value*100,accelerationPp=recentPct-previousPct;
  if(recentDelta<minRecentAbsolute||recentPct<minRecentPct||accelerationPp<minAccelerationPp)continue;
  candidates.push({talent_id:last.talent_id,name:last.name,categories:byCat.get(last.talent_id)||['Sem categoria'],network:last.network,metric:last.metric,source:last.source,source_type:last.source_type,evidence_url:last.evidence_url,source_verification:'referencia_registrada_na_base_nao_auditada',first_on:first.observed_on,mid_on:middle.observed_on,last_on:last.observed_on,first_value:first.value,mid_value:middle.value,last_value:last.value,previous_growth_pct:rounded(previousPct),recent_growth_pct:rounded(recentPct),acceleration_pp:rounded(accelerationPp),recent_absolute:recentDelta,signal:'aceleracao_observada'});
 }
 candidates.sort((a,b)=>b.acceleration_pp-a.acceleration_pp||b.recent_growth_pct-a.recent_growth_pct||b.recent_absolute-a.recent_absolute||a.name.localeCompare(b.name,'pt-BR'));
 const unique=new Map();for(const c of candidates)if(!unique.has(c.talent_id))unique.set(c.talent_id,c);
 const result=[...unique.values()];return {generated_at:new Date(clock).toISOString(),total:result.length,items:result.slice(0,limit),criteria:{periods:2,window_days:30,tolerance_days:3,max_age_days:maxAgeDays,minimum_recent_growth_pct:minRecentPct,minimum_acceleration_pp:minAccelerationPp,minimum_absolute_growth:minRecentAbsolute,minimum_baseline:100,one_artists_best_network:true},notice:'Sinal estatístico preliminar. Referências no banco não garantem autenticidade; requer auditoria externa. Sem IBGE, dados regionais ou ticketeiras.'};
}
