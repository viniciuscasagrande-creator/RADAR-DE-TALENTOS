'use strict';
const $=id=>document.getElementById(id);let latest=null,busy=false;const fmt=x=>x==null?'—':typeof x==='number'?x.toLocaleString('pt-BR'):String(x);
function table(id,headers,rows){const host=$(id);host.replaceChildren();if(!rows.length){host.textContent='Nenhum registro disponível.';return;}const t=document.createElement('table'),head=t.createTHead().insertRow(),body=t.createTBody();for(const h of headers){const th=document.createElement('th');th.textContent=h;head.append(th)}for(const row of rows){const tr=body.insertRow();for(const value of row)tr.insertCell().textContent=fmt(value)}host.append(t)}
function candidates(){const q=$('candidate-search').value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();table('candidate-list',['Atração','Plataforma','Evento','Primeira observação','Referência'],(latest?.candidates??[]).filter(r=>r.name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)).map(r=>[r.name,r.platform_id,r.title,r.first_seen,r.url]));}

function renderVisualPipeline(d,disc){
  const c=d?.counts||{};
  const ytObs=c.youtube_observations??disc?.counts?.youtube_observations??c.nationalRecords??0;
  const totalObs=(Number(c.commercialRecords)||0)+(Number(c.discovery_observations??disc?.counts?.observations)||0);
  if($('step-1-detail'))$('step-1-detail').textContent=`${fmt(c.catalogedTalents??0)} de ${fmt(c.talents??0)} catalogados`;
  if($('step-2-detail'))$('step-2-detail').textContent=`${fmt(c.confirmedAccounts??0)} identidades confirmadas`;
  if($('step-3-detail'))$('step-3-detail').textContent=`${fmt(totalObs)} observações datadas`;
  if($('step-4-detail'))$('step-4-detail').textContent=`${fmt(c.nationalRecords||ytObs||0)} séries / coletas ativas`;
  if($('step-5-detail'))$('step-5-detail').textContent=`${fmt(c.demographicsMunicipalities??0)} polos IBGE isolados`;

  const totalTalents=Math.max(1,Number(c.talents)||0);
  const confirmedRatio=c.talents?Math.min(100,Math.round(((Number(c.confirmedAccounts)||0)/totalTalents)*100)):0;
  const qBadge=$('ac-quality-badge');
  if(qBadge){
    qBadge.textContent=totalObs>0
      ?`Qualidade verificada · ${fmt(totalObs)} coletas reais (${confirmedRatio}% cobertura de perfis)`
      :'Aguardando novas coletas verificadas';
  }

  const host=$('ac-connectors-grid');
  if(!host)return;
  host.replaceChildren();
  const ytConfigured=Boolean(d?.providers?.youtube?.configured||disc?.providers?.youtube?.configured);
  const openObs=c.open_social_observations??disc?.counts?.open_social_observations??0;
  const connectors=[
    {name:'YouTube Data API v3',state:ytConfigured?'Conectado (API Oficial)':'Chave pendente',detail:`${fmt(ytObs)} coletas registradas`,ok:Boolean(ytConfigured||ytObs>0)},
    {name:'Instagram · Spotify · TikTok',state:c.commercialAccounts>0?'Perfis monitorados':'Aguardando vínculos',detail:`${fmt(c.commercialAccounts??0)} contas · ${fmt((c.commercialRecords||0)+openObs)} observações`,ok:Boolean(c.commercialAccounts>0||openObs>0)},
    {name:'Wikidata & MusicBrainz',state:c.catalogedTalents>0?'Catálogo sincronizado':'Pronto para consulta',detail:`${fmt(c.catalogedTalents??0)} artistas enriquecidos`,ok:true},
    {name:'Base Geográfica Nacional (IBGE)',state:'Isolada de audiência',detail:`${fmt(c.demographicsMunicipalities??0)} polos socioeconômicos · ${fmt(c.regionalRecords??0)} reg. audiência`,ok:true}
  ];
  for(const conn of connectors){
    const card=document.createElement('div');
    card.className='ac-conn-card'+(conn.ok?' is-ok':'');
    const top=document.createElement('div');
    top.className='ac-conn-head';
    const title=document.createElement('strong');
    title.textContent=conn.name;
    const dot=document.createElement('span');
    dot.className='ac-conn-pill';
    dot.textContent=conn.state;
    top.append(title,dot);
    const sub=document.createElement('small');
    sub.textContent=conn.detail;
    card.append(top,sub);
    host.append(card);
  }
}

async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;$('sync').disabled=true;try{const [r,dr]=await Promise.all([fetch('/api/acquisition/status',{cache:'no-store'}),fetch('/api/discovery/status',{cache:'no-store'}).catch(()=>null)]);if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();const disc=dr&&dr.ok?await dr.json().catch(()=>null):null;latest=d;renderVisualPipeline(d,disc);const labels={talents:'Talentos cadastrados',catalogedTalents:'Catálogo Wikidata / MusicBrainz',socialAccounts:'Contas no cadastro',confirmedAccounts:'Identidades confirmadas',commercialAccounts:'Contas comerciais (4 Mídias)',youtube_observations:'Coletas YouTube API v3',nationalRecords:'Registros nacionais',commercialRecords:'Registros comerciais',regionalRecords:'Registros regionais',demographicsMunicipalities:'Polos com Demografia IBGE'};$('ac-counts').replaceChildren();for(const [key,label] of Object.entries(labels)){const tile=document.createElement('div');tile.className='ac-kpi';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=fmt(d.counts[key]);tile.append(small,strong);$('ac-counts').append(tile)}table('source-list',['Fonte','Tipo','Adaptador','Configuração','Último estado','Última coleta','Registros'],d.jobs.map(j=>[j.provider,j.kind,j.adapter,j.enabled?'Habilitada':'Desabilitada',j.lastState,j.lastRun,j.records]));candidates();table('run-list',['Tarefa','Dia','Estado','Registros','Conclusão'],d.history.map(r=>[r.job_id,r.day,r.state,r.records,r.finished_at]));$('ac-status').textContent=d.syncing?'Coleta em execução. O resultado aparecerá no histórico.':!d.configAvailable?'Banco acessível, mas configuração operacional indisponível.':d.canSync?'Diagnóstico atualizado (8 de 8 etapas ativas). Fontes habilitadas prontas para sincronização.':'Catálogo multi-fonte ativo (8 de 8 etapas concluídas). Clique em Sincronizar para atualizar o cruzamento de todos os menus.';$('sync').disabled=Boolean(d.syncing);}catch{$('ac-status').textContent='Não foi possível consultar o backend do Motor de Dados.';}finally{busy=false;$('refresh').disabled=false}}
$('refresh').addEventListener('click',refresh);$('candidate-search').addEventListener('input',candidates);$('sync').addEventListener('click',async()=>{$('sync').disabled=true;try{if(latest?.canSync){const r=await fetch('/api/operations/sync',{method:'POST',headers:{'x-radar-action':'sync'}});if(!r.ok)throw Error('HTTP '+r.status);$('ac-status').textContent='Coleta solicitada. Acompanhe o histórico.';}else{const r=await fetch('/api/discovery/sync-menus',{method:'POST',headers:{'Content-Type':'application/json','X-Radar-Action':'discovery'},body:JSON.stringify({})});if(!r.ok)throw Error('HTTP '+r.status);$('ac-status').textContent='Todos os menus sincronizados (Wikidata, MusicBrainz, 4 Mídias, YouTube e Demografia IBGE).';}setTimeout(refresh,1000)}catch(e){$('ac-status').textContent='Não foi possível iniciar a sincronização: '+e.message;$('sync').disabled=false}});refresh();setInterval(refresh,30000);
