// Estatísticas observacionais para Instagram e Spotify.
// Não coleta dados, não estima audiência e não escreve no banco.
const ALLOWED = Object.freeze({
  Instagram: new Set(['followers', 'posts', 'likes', 'comments', 'views']),
  Spotify: new Set(['followers', 'monthly_listeners', 'streams'])
});
const DAY = 86_400_000;
const finiteInt = v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(d) && Number.isFinite(Date.parse(d));

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !ALLOWED[raw.network]?.has(raw.metric) ||
      typeof raw.talent_id !== 'string' || !raw.talent_id.trim() ||
      !finiteInt(raw.value) || !validDate(raw.observed_at) ||
      typeof raw.source !== 'string' || !raw.source.trim() ||
      typeof raw.evidence_url !== 'string') return null;
  let u;
  try { u = new URL(raw.evidence_url); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  return {talent_id:raw.talent_id,network:raw.network,metric:raw.metric,value:raw.value,
    observed_at:new Date(raw.observed_at).toISOString(),source:raw.source,evidence_url:u.href};
}

function comparison(items, latest, days, toleranceDays) {
  const target = Date.parse(latest.observed_at) - days * DAY;
  const matches = items.filter(p => Date.parse(p.observed_at) < Date.parse(latest.observed_at) &&
    Math.abs(Date.parse(p.observed_at) - target) <= toleranceDays * DAY);
  if (!matches.length) return null;
  // Prefer the nearest reference date. Stable tie-breaker: earlier measurement.
  matches.sort((a,b) => Math.abs(Date.parse(a.observed_at)-target)-Math.abs(Date.parse(b.observed_at)-target) || a.observed_at.localeCompare(b.observed_at));
  const prior=matches[0], elapsedDays=(Date.parse(latest.observed_at)-Date.parse(prior.observed_at))/DAY;
  return {value_before:prior.value,value_now:latest.value,absolute:latest.value-prior.value,
    percent:prior.value===0?null:Math.round(((latest.value-prior.value)/prior.value)*10000)/100,
    previous_observed_at:prior.observed_at,current_observed_at:latest.observed_at,
    elapsed_days:Math.round(elapsedDays*10)/10,source_before:prior.source,source_now:latest.source};
}

/**
 * Aggregate only verified snapshots. Missing periods return null, not fabricated values.
 * 7-day comparison uses observations 5..9 days apart; 30-day uses 27..33 days.
 * Ensure snapshots have undergone source/identity approval BEFORE calling this helper.
 */
export function socialStatistics(rows,{now=new Date(),maxAgeDays=30}={}) {
  const clock = now instanceof Date ? +now : Date.parse(now);
  if (!Number.isFinite(clock) || !Number.isFinite(maxAgeDays) || maxAgeDays<0 || maxAgeDays>365) throw new Error('Parâmetros inválidos');
  if (!Array.isArray(rows) || rows.length>100_000) throw new Error('Amostra inválida');
  const groups = new Map();
  for (const raw of rows) {
    const item=normalize(raw); if(!item)continue;
    const stamp=Date.parse(item.observed_at);
    if(stamp>clock || stamp<clock-366*DAY)continue;
    const key=JSON.stringify([item.talent_id,item.network,item.metric]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  return [...groups].map(([key,items])=>{
    // Two conflicting observations on the same timestamp are not resolved by guessing.
    items.sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
    const unique=[];
    for(const item of items){const prev=unique.at(-1);
      if(prev?.observed_at===item.observed_at){
        if(prev.value!==item.value || prev.source!==item.source || prev.evidence_url!==item.evidence_url)
          throw new Error('Observações divergentes no mesmo instante');
      } else unique.push(item);
    }
    const latest=unique.at(-1);const ageDays=(clock-Date.parse(latest.observed_at))/DAY;
    return {talent_id:latest.talent_id,network:latest.network,metric:latest.metric,
      current:ageDays<=maxAgeDays?{value:latest.value,observed_at:latest.observed_at,
        source:latest.source,evidence_url:latest.evidence_url,age_days:Math.floor(ageDays)}:null,
      status:ageDays<=maxAgeDays?'observed':'stale',
      change_7d:comparison(unique,latest,7,2),change_30d:comparison(unique,latest,30,3),
      observations:unique.length};
  }).sort((a,b)=>a.talent_id.localeCompare(b.talent_id)||a.network.localeCompare(b.network)||a.metric.localeCompare(b.metric));
}
