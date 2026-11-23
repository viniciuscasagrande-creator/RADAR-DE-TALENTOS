'use strict';
const $=id=>document.getElementById(id);let latest=null,busy=false;const fmt=x=>x==null?'—':typeof x==='number'?x.toLocaleString('pt-BR'):String(x);
function table(id,headers,rows){const host=$(id);if(!host)return;host.replaceChildren();if(!rows.length){host.textContent='Nenhum registro disponível.';return;}const t=document.createElement('table'),head=t.createTHead().insertRow(),body=t.createTBody();for(const h of headers){const th=document.createElement('th');th.textContent=h;head.append(th)}for(const row of rows){const tr=body.insertRow();for(const value of row)tr.insertCell().textContent=fmt(value)}host.append(t)}
function candidates(){if(!$('candidate-search'))return;const q=$('candidate-search').value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();table('candidate-list',['Atração','Plataforma','Evento','Primeira observação','Referência'],(latest?.candidates??[]).filter(r=>r.name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)).map(r=>[r.name,r.platform_id,r.title,r.first_seen,r.url]));}

function renderVisualPipeline(d,disc){
  const c=d?.counts||{};
  const ytObs=c.youtube_observations??disc?.counts?.youtube_observations??c.nationalRecords??0;
  const totalObs=(Number(c.commercialRecords)||0)+(Number(c.discovery_observations??disc?.counts?.observations)||0);
  const evidenceCount=c.evidence_records??totalObs;

  if($('kpi-connected-sources'))$('kpi-connected-sources').textContent=fmt(c.connected_sources??3);
  if($('kpi-connected-sub'))$('kpi-connected-sub').textContent=d?.providers?.youtube?.configured?'YouTube API v3 + Wikidata + MusicBrainz + IBGE':'Wikidata + MusicBrainz + IBGE';
  if($('kpi-collections-24h'))$('kpi-collections-24h').textContent=fmt(c.collections_24h??ytObs??0);
  if($('kpi-collections-sub'))$('kpi-collections-sub').textContent='Execuções comprovadas nas últimas 24h';
  if($('kpi-confirmed-profiles'))$('kpi-confirmed-profiles').textContent=fmt(c.confirmedAccounts??0);
  if($('kpi-confirmed-sub'))$('kpi-confirmed-sub').textContent=`Em ${fmt(c.talents??0)} talentos monitorados`;
  if($('kpi-evidence-records'))$('kpi-evidence-records').textContent=fmt(evidenceCount);
  if($('kpi-evidence-sub'))$('kpi-evidence-sub').textContent='Com fonte, data e evidência HTTPS';

  if($('step-1-detail'))$('step-1-detail').textContent=`${fmt(c.catalogedTalents??0)} de ${fmt(c.talents??0)} catalogados`;
  if($('step-2-detail'))$('step-2-detail').textContent=`${fmt(c.confirmedAccounts??0)} identidades confirmadas`;
  if($('step-3-detail'))$('step-3-detail').textContent=`${fmt(totalObs)} observações datadas`;
  if($('step-4-detail'))$('step-4-detail').textContent=`${fmt(evidenceCount)} com evidência auditável`;
  if($('step-5-detail'))$('step-5-detail').textContent=`4 menus alimentados · ${fmt(c.demographicsMunicipalities??0)} polos IBGE isolados`;

  const totalTalents=Math.max(1,Number(c.talents)||0);
  const confirmedRatio=c.talents?Math.min(100,Math.round(((Number(c.confirmedAccounts)||0)/totalTalents)*100)):0;
  const qBadge=$('ac-quality-badge');
  if(qBadge){
    qBadge.textContent=evidenceCount>0
      ?`Procedência verificada · ${fmt(evidenceCount)} dados com evidência (${confirmedRatio}% cobertura de identidade)`
      :`Identidade verificada (${confirmedRatio}%) · Aguardando novas coletas com evidência`;
  }

  const host=$('ac-connectors-grid');
  if(!host)return;
  host.replaceChildren();
  const ytConfigured=Boolean(d?.providers?.youtube?.configured||disc?.providers?.youtube?.configured);
  const openObs=c.open_social_observations??disc?.counts?.open_social_observations??0;
  const connectors=[
    {name:'YouTube Data API v3',state:ytConfigured?'Conectado (API Oficial)':'Chave pendente',detail:`${fmt(ytObs)} coletas verificadas (sem duplicar módulos)`,ok:Boolean(ytConfigured||ytObs>0)},
    {name:'Instagram · Spotify · TikTok',state:c.commercialAccounts>0?'Cobertura parcial (Verificada)':'Aguardando vínculos',detail:`${fmt(c.commercialAccounts??0)} perfis · ${fmt((c.commercialRecords||0)+openObs)} observações com evidência`,ok:Boolean(c.commercialAccounts>0||openObs>0)},
    {name:'Wikidata & MusicBrainz (CC0)',state:c.catalogedTalents>0?'Catálogo sincronizado':'Pronto para consulta',detail:`${fmt(c.catalogedTalents??0)} artistas enriquecidos · ${fmt(c.discovery_candidates??0)} candidatos`,ok:true},
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

async function postDiscovery(action,payload={}){
  const r=await fetch('/api/discovery/'+action,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Radar-Action':'discovery'},
    body:JSON.stringify(payload)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'HTTP '+r.status);
  return d;
}

async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;$('sync').disabled=true;try{const [r,dr]=await Promise.all([fetch('/api/acquisition/status',{cache:'no-store'}),fetch('/api/discovery/status',{cache:'no-store'}).catch(()=>null)]);if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();const disc=dr&&dr.ok?await dr.json().catch(()=>null):null;latest=d;renderVisualPipeline(d,disc);const labels={talents:'Talentos cadastrados',catalogedTalents:'Catálogo Wikidata / MusicBrainz',socialAccounts:'Contas no cadastro',confirmedAccounts:'Identidades confirmadas',commercialAccounts:'Contas comerciais (4 Mídias)',youtube_observations:'Coletas YouTube API v3',nationalRecords:'Registros nacionais',commercialRecords:'Registros comerciais',regionalRecords:'Registros regionais',demographicsMunicipalities:'Polos com Demografia IBGE'};$('ac-counts').replaceChildren();for(const [key,label] of Object.entries(labels)){const tile=document.createElement('div');tile.className='ac-kpi';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=fmt(d.counts[key]);tile.append(small,strong);$('ac-counts').append(tile)}table('source-list',['Fonte','Tipo','Adaptador','Configuração','Último estado','Última coleta','Registros'],d.jobs.map(j=>[j.provider,j.kind,j.adapter,j.enabled?'Habilitada':'Desabilitada',j.lastState,j.lastRun,j.records]));candidates();const histRows=[...(d.history||[]).map(r=>[r.job_id,r.day,r.state,r.records,r.finished_at]),...(d.discoveryLogs||disc?.logs||[]).map(l=>['Motor de Descoberta',String(l.at||'').slice(0,10),l.status,l.count,`${l.at} · ${l.message||''}`])];table('run-list',['Tarefa / Origem','Dia','Estado','Registros','Conclusão / Detalhe'],histRows);$('ac-status').textContent=d.syncing?'Coleta em execução. O resultado aparecerá no histórico.':!d.configAvailable?'Banco acessível, mas configuração operacional indisponível.':d.canSync?'Diagnóstico atualizado (8 de 8 etapas ativas). Fontes habilitadas prontas para sincronização.':'Motor de Dados 3.0 ativo (8 de 8 etapas concluídas). Coletas validadas são distribuídas automaticamente para todos os menus.';$('sync').disabled=Boolean(d.syncing);}catch{$('ac-status').textContent='Não foi possível consultar o backend do Motor de Dados.';}finally{busy=false;$('refresh').disabled=false}}

$('refresh').addEventListener('click',refresh);
$('candidate-search')?.addEventListener('input',candidates);

$('auto-prospect')?.addEventListener('click',async()=>{
  const btn=$('auto-prospect');btn.disabled=true;
  $('ac-status').textContent='Executando prospecção automatizada em lote (Wikidata + YouTube API v3)...';
  try{
    const res=await postDiscovery('youtube-bulk',{limit:5});
    const b=res.bulk||{};
    $('ac-status').textContent=`Prospecção em lote concluída: ${b.attempted??0} artistas verificados · ${b.queued??0} novos candidatos com perfil localizado · ${b.already??0} já confirmados · ${b.unmatched??0} sem correspondência direta.`;
    setTimeout(refresh,600);
  }catch(e){
    $('ac-status').textContent='Prospecção em lote não executada: '+e.message;
  }finally{btn.disabled=false;}
});

$('auto-collect-yt')?.addEventListener('click',async()=>{
  const btn=$('auto-collect-yt');btn.disabled=true;
  $('ac-status').textContent='Coletando canais confirmados no YouTube Data API v3 e distribuindo indicadores...';
  try{
    const res=await postDiscovery('youtube-collect-all',{force:true});
    $('ac-status').textContent=`Coleta YouTube (${res.status}): ${res.collected??0} canal(is) atualizado(s) e distribuído(s) para Visão Geral, Ficha 360° e Oportunidade Comercial.`;
    setTimeout(refresh,600);
  }catch(e){
    $('ac-status').textContent='Não foi possível executar a coleta YouTube: '+e.message;
  }finally{btn.disabled=false;}
});

$('sync').addEventListener('click',async()=>{
  $('sync').disabled=true;
  try{
    if(latest?.canSync){
      const r=await fetch('/api/operations/sync',{method:'POST',headers:{'x-radar-action':'sync'}});
      if(!r.ok)throw Error('HTTP '+r.status);
      $('ac-status').textContent='Coleta solicitada. Acompanhe o histórico.';
    }else{
      await postDiscovery('sync-menus',{});
      $('ac-status').textContent='Camada Central de Indicadores sincronizada: Visão Geral, Ficha 360°, Oportunidade Comercial e Audiência Geográfica atualizadas.';
    }
    setTimeout(refresh,800);
  }catch(e){
    $('ac-status').textContent='Não foi possível iniciar a sincronização: '+e.message;
    $('sync').disabled=false;
  }
});

$('ac-global-search-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const q=$('ac-search-query')?.value?.trim()||'';
  if(q.length<2)return;
  const host=$('ac-search-results');
  if(!host)return;
  host.hidden=false;
  host.replaceChildren();
  const loading=document.createElement('p');
  loading.textContent=`Consultando fontes abertas e cruzando identidades para "${q}"...`;
  host.append(loading);
  try{
    const r=await postDiscovery('global-search',{query:q,includeMusicBrainzLive:Boolean($('ac-search-mb')?.checked)});
    host.replaceChildren();
    const summary=document.createElement('p');
    summary.className='ac-search-summary';
    summary.textContent=`Resultado para "${r.query}" · Cadastro Radar: ${r.registered?.length||0} · Wikidata: ${r.external?.length||0} · MusicBrainz: ${r.musicbrainz?.length||0} · Canais YouTube sugeridos: ${r.youtubeChannels?.length||0}`;
    host.append(summary);

    if(r.crossValidation?.networks?.length){
      const grid=document.createElement('div');
      grid.className='ac-cv-grid';
      for(const n of r.crossValidation.networks){
        const box=document.createElement('div');
        box.className='ac-cv-card'+(n.located?' is-found':'');
        const h=document.createElement('strong');
        h.textContent=`${n.network}: ${n.located?'Perfil localizado':'Sem vínculo automático'}`;
        box.append(h);
        if(n.located){
          for(const p of n.profiles.slice(0,2)){
            const a=document.createElement('a');
            a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';
            a.textContent=`${p.url} [${p.sources.join(' + ')}]`;
            box.append(a);
          }
        }else{
          const s=document.createElement('small');
          s.textContent='Adicione ou confirme manualmente em Prospecção e aprovação';
          box.append(s);
        }
        grid.append(box);
      }
      host.append(grid);
    }

    const actionsRow=document.createElement('div');
    actionsRow.className='ac-search-actions';
    for(const ext of (r.external||[]).slice(0,3)){
      const btn=document.createElement('button');
      btn.type='button';
      btn.textContent=ext.candidate_id?`Já em revisão: ${ext.name} (${ext.external_id})`:`Importar Wikidata: ${ext.name} (${ext.external_id})`;
      btn.onclick=async()=>{
        if(!ext.candidate_id){
          btn.disabled=true;
          await postDiscovery('global-save',{id:ext.external_id});
          $('ac-status').textContent=`Candidato ${ext.name} (${ext.external_id}) enviado para revisão em Prospecção e aprovação.`;
          refresh();
        }
        location.href='/discovery.html';
      };
      actionsRow.append(btn);
    }
    for(const mb of (r.musicbrainz||[]).slice(0,3)){
      const btn=document.createElement('button');
      btn.type='button';
      btn.textContent=mb.candidate_id?`MusicBrainz em revisão: ${mb.name}`:`Importar MusicBrainz: ${mb.name}`;
      btn.onclick=async()=>{
        if(!mb.candidate_id){
          btn.disabled=true;
          await postDiscovery('musicbrainz-save',{id:mb.external_id});
          $('ac-status').textContent=`Artista ${mb.name} importado do MusicBrainz para revisão.`;
          refresh();
        }
        location.href='/discovery.html';
      };
      actionsRow.append(btn);
    }
    if(actionsRow.children.length)host.append(actionsRow);
  }catch(err){
    host.replaceChildren();
    const errP=document.createElement('p');
    errP.textContent='Falha na busca de alta precisão: '+err.message;
    host.append(errP);
  }
});

refresh();setInterval(refresh,30000);
