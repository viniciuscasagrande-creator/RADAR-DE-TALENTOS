'use strict';
/* RADAR — Intelligence Studio V2: Ficha 360° do Artista + Estatísticas Avançadas de Instagram, Spotify, YouTube e TikTok.
   Interface de leitura: não persiste nem altera indicadores, não inventa métricas e nunca utiliza população IBGE ou ticketeiras. */
(()=>{
  const main=document.querySelector('main.dashboard-main, main');
  const overview=document.getElementById('overview');
  if(!main||!overview||document.getElementById('radar-intelligence-studio'))return;
  const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
  const section=el('section','radar-studio');section.id='radar-intelligence-studio';
  section.setAttribute('aria-label','Painel de inteligência das mídias e Ficha 360 do Artista');
  const header=el('header','studio-header');
  const heading=el('div');heading.append(el('span','studio-eyebrow','PAINEL DE INTELIGÊNCIA · ETAPA 2 / V2'),el('h2',null,'Desempenho das mídias & Ficha 360°'),el('p',null,'Compare artistas com indicadores verificados, inspecione a Ficha 360° com Instagram, Spotify, YouTube e TikTok, e acompanhe a evolução 7d/30d apenas com observações reais e datadas.'));
  const toolbar=el('div','studio-toolbar');const network=el('select');network.setAttribute('aria-label','Filtrar por mídia');
  for(const x of ['Todas as mídias','Instagram','Spotify','YouTube','TikTok']){const o=document.createElement('option');o.value=x==='Todas as mídias'?'':x;o.textContent=x;network.append(o)}
  const metric=el('select');metric.setAttribute('aria-label','Selecionar indicador');
  const artistPicker=el('select');artistPicker.setAttribute('aria-label','Selecionar artista para Ficha 360°');
  const comparePicker=el('select');comparePicker.setAttribute('aria-label','Comparar com segundo artista');
  const refresh=el('button','studio-button','Atualizar');refresh.type='button';
  toolbar.append(network,metric,artistPicker,comparePicker,refresh);header.append(heading,toolbar);

  const cards=el('div','studio-stats');
  const names=[['Artistas com indicadores','artists'],['Perfis com indicadores','profiles'],['Mídias com coleta','networks'],['Última observação','latest']];
  const statValues={};for(const [title,id] of names){const box=el('div','studio-stat');box.append(el('span',null,title));const v=el('strong',null,'—');statValues[id]=v;box.append(v);cards.append(box)}

  const content=el('div','studio-content');
  const chartCard=el('article','studio-panel studio-chart');
  const chartTitle=el('div','studio-panel-title');chartTitle.append(el('h3',null,'Comparação de artistas'),el('span','studio-source','Por indicador e mídia'));
  const chartInfo=el('p','studio-note','Selecione uma mídia e um indicador para comparar valores da mesma unidade.');
  const chart=el('div','studio-bars');chart.setAttribute('role','region');chart.setAttribute('aria-label','Gráfico de comparação por artista');
  chartCard.append(chartTitle,chartInfo,chart);

  const tableCard=el('article','studio-panel studio-table-panel');
  const tt=el('div','studio-panel-title');tt.append(el('h3',null,'Perfis, evolução (7d/30d) e evidências'));
  const tableWrap=el('div','studio-table-scroll');tableCard.append(tt,tableWrap);
  content.append(chartCard,tableCard);

  const fichaPanel=el('article','studio-panel studio-ficha-360');
  fichaPanel.id='studio-ficha-360';
  const fichaHead=el('div','studio-panel-title');
  const fichaHeadLeft=el('div');
  fichaHeadLeft.append(el('span','studio-eyebrow','FICHA 360° DO ARTISTA · ESTATÍSTICAS AVANÇADAS'),el('h3',null,'Instagram · Spotify · YouTube · TikTok'));
  const fichaHeadRight=el('div','studio-ficha-actions');
  const fichaCommLink=el('a','studio-link-btn','Ver Oportunidade Comercial ↗');
  fichaCommLink.href='/commercial.html';
  fichaHeadRight.append(fichaCommLink);
  fichaHead.append(fichaHeadLeft,fichaHeadRight);
  const fichaBody=el('div','studio-ficha-body');
  const compareHost=el('div','studio-compare-host');
  compareHost.hidden=true;
  fichaPanel.append(fichaHead,fichaBody,compareHost);

  const foot=el('p','studio-footnote','Valores de mídias diferentes não são somados. Instagram, Spotify e TikTok dependem de registro autorizado ou API oficial; dados municipais exigem relatórios regionais verificados. População do IBGE e ticketeiras nunca entram nestes indicadores.');
  const status=el('p','studio-status','Carregando dados observados...');status.setAttribute('role','status');
  section.append(header,cards,content,fichaPanel,status,foot);
  const subbar=overview.querySelector('.subbar');if(subbar)subbar.after(section);else overview.prepend(section);

  const displayNames={followers:'Seguidores',subscribers:'Inscritos',monthly_listeners:'Ouvintes mensais',posts:'Publicações',views:'Visualizações',video_count:'Vídeos',likes:'Curtidas',streams:'Streams'};
  const palette={Instagram:'#ff2bd6',Spotify:'#00ff88',YouTube:'#00f0ff',TikTok:'#facc15'};
  const classLabels={oficial:'API Oficial',relatorio_autorizado:'Relatório Autorizado',observado:'Observação Verificada',calculado:'Calculado (Série Real)'};
  const format=n=>Number(n).toLocaleString('pt-BR');
  const signed=n=>(n>0?'+':'')+format(n);
  const fmtDelta=c=>c&&Number.isFinite(c.absolute)?`${signed(c.absolute)}${c.percent!=null?` (${c.percent>0?'+':''}${c.percent.toFixed(1)}%)`:''}`:null;
  const date=s=>{const d=new Date(s);return Number.isFinite(+d)?d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Data indisponível';};
  let items=[],catalogTalents=[],loadingId=0,fichaReqId=0,activeTalentId='';

  function metricsForNetwork(){const rows=items.filter(x=>!network.value||x.network===network.value);return [...new Set(rows.flatMap(x=>Object.keys(x.metrics||{})))].sort((a,b)=>(displayNames[a]||a).localeCompare(displayNames[b]||b,'pt-BR'));}

  const normQ=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
  function populateArtistPickers(searchQuery=''){
    const byId=new Map();
    for(const a of items)if(a.talent_id&&a.name)byId.set(a.talent_id,{id:a.talent_id,name:a.name,hasCurrent:true});
    for(const t of catalogTalents)if(t.id&&t.name&&!byId.has(t.id))byId.set(t.id,{id:t.id,name:t.name,hasCurrent:false});
    const list=[...byId.values()].sort((a,b)=>(b.hasCurrent?1:0)-(a.hasCurrent?1:0)||a.name.localeCompare(b.name,'pt-BR'));
    const prevA=artistPicker.value||activeTalentId;
    const prevC=comparePicker.value;
    artistPicker.replaceChildren();
    const o0=document.createElement('option');o0.value='';o0.textContent='Ficha 360°: escolher artista';artistPicker.append(o0);
    comparePicker.replaceChildren();
    const c0=document.createElement('option');c0.value='';c0.textContent='Comparar: sem 2º artista';comparePicker.append(c0);
    for(const item of list){
      const oa=document.createElement('option');oa.value=item.id;oa.textContent=item.hasCurrent?`★ ${item.name} (com coleta)`:item.name;artistPicker.append(oa);
      const oc=document.createElement('option');oc.value=item.id;oc.textContent=item.hasCurrent?`★ ${item.name}`:item.name;comparePicker.append(oc);
    }
    const qNorm=normQ(searchQuery);
    const matchedByQuery=qNorm?(items[0]?.talent_id||list.find(x=>normQ(x.name).includes(qNorm)||normQ(x.id).includes(qNorm))?.id||''):'';
    if(matchedByQuery&&byId.has(matchedByQuery))artistPicker.value=matchedByQuery;
    else if(prevA&&byId.has(prevA))artistPicker.value=prevA;
    else if(items[0]?.talent_id)artistPicker.value=items[0].talent_id;
    else if(list[0]?.id)artistPicker.value=list[0].id;
    if(prevC&&byId.has(prevC))comparePicker.value=prevC;
    activeTalentId=artistPicker.value;
  }

  function buildHistorySparkline(history,net){
    if(!Array.isArray(history)||history.length<2)return null;
    const pts=history.slice(-12);
    const vals=pts.map(p=>Number(p.value)||0);
    const min=Math.min(...vals),max=Math.max(...vals,min+1);
    const W=200,H=46,pad=6;
    const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');
    s.setAttribute('viewBox',`0 0 ${W} ${H}`);
    s.setAttribute('class','studio-spark-svg');
    s.setAttribute('aria-label',`Série histórica de ${net} (${pts.length} observações)`);
    const coords=vals.map((v,i)=>[
      pad+(W-pad*2)*(i/Math.max(1,vals.length-1)),
      pad+(H-pad*2)*(1-(v-min)/Math.max(1,max-min)),
      pts[i]
    ]);
    const col=palette[net]||'#c084fc';
    const d=coords.map((c,i)=>`${i?'L':'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke',col);path.setAttribute('stroke-width','2.2');path.setAttribute('stroke-linecap','round');
    s.append(path);
    for(const [cx,cy,pt] of coords){
      const dot=document.createElementNS(ns,'circle');
      dot.setAttribute('cx',cx.toFixed(1));dot.setAttribute('cy',cy.toFixed(1));dot.setAttribute('r','2.7');
      dot.setAttribute('fill','#fff');dot.setAttribute('stroke',col);dot.setAttribute('stroke-width','1.4');
      const title=document.createElementNS(ns,'title');
      title.textContent=`${pt.date}: ${format(pt.value)} (${pt.source||'Verificado'})`;
      dot.append(title);s.append(dot);
    }
    return s;
  }

  async function loadFicha360(){
    const tId=artistPicker.value;
    activeTalentId=tId;
    if(!tId){
      fichaBody.replaceChildren(el('p','studio-empty','Selecione um artista para abrir a Ficha 360° e as estatísticas detalhadas das 4 mídias.'));
      compareHost.hidden=true;
      return;
    }
    const reqId=++fichaReqId;
    fichaBody.replaceChildren(el('p','studio-note','Consultando Ficha 360° e séries verificadas do artista...'));
    try{
      const cmpId=comparePicker.value&&comparePicker.value!==tId?comparePicker.value:'';
      const [stats,cmpStats]=await Promise.all([
        fetch('/api/radar/media-stats?talent='+encodeURIComponent(tId),{cache:'no-store'}).then(r=>r.ok?r.json():null),
        cmpId?fetch('/api/radar/media-stats?talent='+encodeURIComponent(cmpId),{cache:'no-store'}).then(r=>r.ok?r.json():null):Promise.resolve(null)
      ]);
      if(reqId!==fichaReqId)return;
      if(!stats){
        fichaBody.replaceChildren(el('p','studio-empty','Não foi possível carregar a Ficha 360° deste artista.'));
        return;
      }
      fichaCommLink.href='/commercial.html?q='+encodeURIComponent(stats.name);
      const currentForArtist=items.filter(x=>x.talent_id===tId);
      renderFicha360Cards(stats,currentForArtist);
      renderFichaComparison(stats,cmpStats);
    }catch{
      if(reqId===fichaReqId)fichaBody.replaceChildren(el('p','studio-empty','Erro ao consultar a Ficha 360° do artista.'));
    }
  }

  function renderFicha360Cards(stats,currentRows){
    fichaBody.replaceChildren();
    const banner=el('div','studio-artist-banner');
    const verifiedNets=['Instagram','Spotify','YouTube','TikTok'].filter(n=>stats[n]?.has_verified_data||currentRows.some(r=>r.network===n));
    banner.append(
      el('strong',null,stats.name),
      el('span','studio-badge-pill',`${verifiedNets.length} de 4 mídias com coleta verificada`),
      el('small',null,`Data de referência: ${stats.reference_end||'Atual'} · Dados ausentes permanecem identificados como Sem coleta`)
    );
    fichaBody.append(banner);

    const grid=el('div','studio-ficha-grid');
    const specs=[
      {net:'Instagram',primaryKey:'followers',primaryLabel:'Seguidores',secondary:[['posts','Publicações','recent_posts'],['engagement','Engajamento','engagement'],['reels_views','Reels / Views','reels_views']]},
      {net:'Spotify',primaryKey:'monthly_listeners',primaryLabel:'Ouvintes mensais',secondary:[['followers','Seguidores Spotify','followers'],['streams_30d','Streams','streams_30d'],['repertoire','Repertório','repertoire']]},
      {net:'YouTube',primaryKey:'subscribers',primaryLabel:'Inscritos',secondary:[['views','Visualizações acumuladas','views'],['video_count','Vídeos públicos',null]]},
      {net:'TikTok',primaryKey:'followers',primaryLabel:'Seguidores',secondary:[['likes','Curtidas totais','likes'],['video_count','Vídeos',null]]}
    ];

    for(const sp of specs){
      const net=sp.net;
      const ns=stats[net]||{};
      const curRow=currentRows.find(r=>r.network===net);
      const curPrimary=curRow?.metrics?.[sp.primaryKey];
      const primaryObj=ns[sp.primaryKey]||{};
      const val=primaryObj.value??curPrimary?.value??null;
      const obsDate=primaryObj.observed_on||(curPrimary?.observed_at?date(curPrimary.observed_at):null);
      const sourceText=primaryObj.source||curRow?.source||(val!=null?'Observação verificada':null);
      const evidenceUrl=primaryObj.evidence_url||curPrimary?.evidence_url||ns.profile_url||curRow?.url||null;
      const cls=primaryObj.classification||(curRow?.source?.includes('API')?'oficial':val!=null?'observado':null);

      const card=el('div','studio-net-card');
      card.dataset.net=net;
      const top=el('div','studio-net-head');
      const netTitle=el('strong',null,net);
      netTitle.style.color=palette[net];
      const badge=el('span','studio-quality-badge',val!=null?(classLabels[cls]||'Verificado'):'Sem coleta');
      top.append(netTitle,badge);
      card.append(top);

      const mainMetric=el('div','studio-net-main');
      mainMetric.append(
        el('span','studio-net-label',sp.primaryLabel),
        el('strong','studio-net-val',val!=null?format(val):'Sem coleta')
      );
      card.append(mainMetric);

      const g7=ns.growth_7d?.value!=null?ns.growth_7d.formatted:(curPrimary?.change_7d?fmtDelta(curPrimary.change_7d):null);
      const g30=ns.growth_30d?.value!=null?ns.growth_30d.formatted:(curPrimary?.change_30d?fmtDelta(curPrimary.change_30d):null);
      const evoRow=el('div','studio-net-evo');
      evoRow.append(
        el('span','studio-evo-chip',`7d: ${g7||'Aguardando 2ª coleta'}`),
        el('span','studio-evo-chip',`30d: ${g30||'Aguardando série 30d'}`)
      );
      card.append(evoRow);

      const spark=buildHistorySparkline(ns.history,net);
      if(spark){
        card.append(spark);
      }else{
        const histCount=(ns.history?.length||0)||(curPrimary?.observations||0);
        card.append(el('small','studio-no-spark',histCount===1?'1 observação datada registrada — gráfico histórico exige 2+ coletas.':'Sem série histórica registrada para esta mídia.'));
      }

      const secList=el('div','studio-net-secondary');
      for(const [mKey,mLabel,statsField] of sp.secondary){
        let secText=null;
        if(statsField&&ns[statsField]?.formatted&&ns[statsField].formatted!=='—'){
          secText=ns[statsField].formatted;
        }else if(curRow?.metrics?.[mKey]?.value!=null){
          secText=format(curRow.metrics[mKey].value);
        }
        if(secText){
          secList.append(el('small',null,`${mLabel}: ${secText}`));
        }
      }
      if(secList.children.length)card.append(secList);

      if(ns.top_cities?.hasData){
        card.append(el('small','studio-net-cities',`Principais cidades (${ns.top_cities.report?.source||'Relatório verificado'}): ${ns.top_cities.statusLabel}`));
      }else{
        card.append(el('small','studio-net-cities','Cidades por mídia: sem relatório regional autorizado.'));
      }

      const metaFoot=el('div','studio-net-foot');
      metaFoot.append(el('small',null,val!=null?`Fonte: ${sourceText} · Data: ${obsDate||'—'}`:'Nenhum perfil ou coleta confirmada nesta rede.'));
      const linksWrap=el('div','studio-net-links');
      if(ns.profile_url||curRow?.url){
        const pl=el('a',null,'Perfil oficial ↗');
        pl.href=ns.profile_url||curRow.url;pl.target='_blank';pl.rel='noopener noreferrer';
        linksWrap.append(pl);
      }
      if(evidenceUrl&&evidenceUrl!==(ns.profile_url||curRow?.url)){
        const elink=el('a',null,'Evidência ↗');
        elink.href=evidenceUrl;elink.target='_blank';elink.rel='noopener noreferrer';
        linksWrap.append(elink);
      }
      if(linksWrap.children.length)metaFoot.append(linksWrap);
      card.append(metaFoot);
      grid.append(card);
    }
    fichaBody.append(grid);
  }

  function renderFichaComparison(s1,s2){
    if(!s2||s1.talent_id===s2.talent_id){
      compareHost.hidden=true;
      compareHost.replaceChildren();
      return;
    }
    compareHost.hidden=false;
    compareHost.replaceChildren();
    compareHost.append(el('h4',null,`Comparação Direta: ${s1.name} vs. ${s2.name} (dados verificados)`));
    const tbl=el('table','studio-table');
    const thead=el('thead'),trH=el('tr');
    for(const h of ['Mídia / Indicador',s1.name,s2.name,'Evolução 7d / 30d'])trH.append(el('th',null,h));
    thead.append(trH);tbl.append(thead);
    const tb=el('tbody');
    for(const [net,k,label] of [
      ['Instagram','followers','Seguidores'],
      ['Spotify','monthly_listeners','Ouvintes mensais'],
      ['YouTube','subscribers','Inscritos'],
      ['TikTok','followers','Seguidores']
    ]){
      const tr=el('tr');
      const tdN=el('td',null,`${net} · ${label}`);
      tdN.style.color=palette[net];
      const v1=s1[net]?.[k]?.value!=null?format(s1[net][k].value):'Sem coleta';
      const v2=s2[net]?.[k]?.value!=null?format(s2[net][k].value):'Sem coleta';
      const g1=s1[net]?.growth_30d?.value!=null?s1[net].growth_30d.formatted:(s1[net]?.growth_7d?.value!=null?s1[net].growth_7d.formatted:'—');
      const g2=s2[net]?.growth_30d?.value!=null?s2[net].growth_30d.formatted:(s2[net]?.growth_7d?.value!=null?s2[net].growth_7d.formatted:'—');
      tr.append(tdN,el('td',null,v1),el('td',null,v2),el('td',null,`${s1.name}: ${g1} | ${s2.name}: ${g2}`));
      tb.append(tr);
    }
    tbl.append(tb);
    compareHost.append(tbl);
  }

  function render(){
    const subset=items.filter(x=>!network.value||x.network===network.value);
    const keys=metricsForNetwork();const old=metric.value;metric.replaceChildren();for(const k of keys){const o=document.createElement('option');o.value=k;o.textContent=displayNames[k]||k;metric.append(o)}
    if(keys.includes(old))metric.value=old;else if(keys.includes(network.value==='Spotify'?'monthly_listeners':'followers'))metric.value=network.value==='Spotify'?'monthly_listeners':'followers';else if(keys.includes('subscribers'))metric.value='subscribers';
    const valid=subset.flatMap(a=>Object.entries(a.metrics||{}).map(([key,m])=>({...a,metric:key,value:m.value,observed_at:m.observed_at,change_7d:m.change_7d||null,change_30d:m.change_30d||null,observations:m.observations||1,metric_source:m.evidence_url||'',collected_source:a.source||'youtube-public-current'}))).filter(x=>Number.isFinite(x.value)&&x.value>=0);
    const unique=new Set(valid.map(x=>x.talent_id));const latest=valid.map(x=>Date.parse(x.observed_at)).filter(Number.isFinite);
    statValues.artists.textContent=unique.size?format(unique.size):'—';statValues.profiles.textContent=valid.length?format(new Set(valid.map(x=>x.url)).size):'—';statValues.networks.textContent=valid.length?String(new Set(valid.map(x=>x.network)).size):'—';statValues.latest.textContent=latest.length?date(new Date(Math.max(...latest)).toISOString()):'—';
    chart.replaceChildren();tableWrap.replaceChildren();
    const selected=valid.filter(x=>x.metric===metric.value).sort((a,b)=>b.value-a.value);
    if(!network.value){chart.append(el('p','studio-empty','Selecione uma mídia para comparar o mesmo indicador entre artistas.'));}
    else if(!selected.length){chart.append(el('p','studio-empty',`Sem valores observados para ${network.value}. A coleta ainda não está disponível.`));}
    else{
      const max=Math.max(1,...selected.map(x=>x.value));
      for(const x of selected.slice(0,12)){
        const row=el('div','studio-barrow');
        const label=el('div','studio-bar-label');
        const d30=fmtDelta(x.change_30d),d7=fmtDelta(x.change_7d);
        const subText=d30?`${date(x.observed_at)} · 30d: ${d30}`:(d7?`${date(x.observed_at)} · 7d: ${d7}`:date(x.observed_at));
        label.append(el('strong',null,x.name),el('span',null,subText));
        const track=el('div','studio-track');const fill=el('span','studio-fill');fill.style.width=Math.max(2,x.value/max*100)+'%';track.append(fill);
        row.append(label,track,el('b','studio-amount',format(x.value)));
        row.style.cursor='pointer';
        row.addEventListener('click',()=>{
          if(x.talent_id){
            artistPicker.value=x.talent_id;
            loadFicha360();
          }
        });
        chart.append(row);
      }
      if(selected.length>12)chart.append(el('p','studio-note',`Exibindo os 12 primeiros de ${selected.length} registros. Use a busca para refinar.`));
    }
    if(!subset.length){tableWrap.append(el('p','studio-empty','Nenhum perfil com indicadores observados neste recorte.'));}
    else{
      const t=el('table','studio-table'),head=el('thead'),tr=el('tr');
      for(const h of ['Artista','Mídia','Indicadores & Evolução','Coleta'])tr.append(el('th',null,h));head.append(tr);t.append(head);
      const body=el('tbody');for(const a of subset.slice(0,30)){
        const tr=el('tr');const name=el('td');
        const btn=el('button','studio-artist-btn',a.name);btn.type='button';
        btn.addEventListener('click',()=>{if(a.talent_id){artistPicker.value=a.talent_id;loadFicha360();}});
        const link=el('a',null,' ↗');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';
        name.append(btn,link);tr.append(name,el('td',null,a.network));
        const vals=el('td');for(const [k,v] of Object.entries(a.metrics||{})){
          const d7=fmtDelta(v.change_7d),d30=fmtDelta(v.change_30d);
          const evoParts=[];
          if(d7)evoParts.push(`7d: ${d7}`);
          if(d30)evoParts.push(`30d: ${d30}`);
          const lineText=`${displayNames[k]||k}: ${format(v.value)}`+(evoParts.length?` (${evoParts.join(' · ')})`:'');
          vals.append(el('div',null,lineText));
        }tr.append(vals);
        const prov=el('td');for(const v of Object.values(a.metrics||{})){const div=el('div',null,`${date(v.observed_at)} · ${a.source||'youtube-public-current'}`);if(v.evidence_url){const l=el('a',null,' Evidência');l.href=v.evidence_url;l.target='_blank';l.rel='noopener noreferrer';div.append(l)}prov.append(div)}tr.append(prov);body.append(tr);
      }t.append(body);tableWrap.append(t);
    }
    chartInfo.textContent=network.value?`${displayNames[metric.value]||metric.value||'Sem indicador'} · ${network.value} · última observação disponível`:'Selecione uma mídia: unidades diferentes não são comparáveis.';
    status.textContent=valid.length?`${valid.length} indicadores observados no recorte. Valores não devem ser interpretados como audiência municipal ou estimativa de vendas.`:'Sem indicadores observados no recorte. Nenhum valor foi estimado.';
  }

  async function load(){const id=++loadingId;status.textContent='Consultando dados reais do Radar...';refresh.disabled=true;
    try{
      const q=document.getElementById('artist-quick-search')?.value?.trim()||'';
      const [response,crossRes]=await Promise.all([
        fetch('/api/current-media?'+new URLSearchParams({q}),{cache:'no-store'}),
        catalogTalents.length?Promise.resolve(null):fetch('/api/radar/cross-summary?limit=200',{cache:'no-store'}).catch(()=>null)
      ]);
      if(!response.ok)throw Error(`API ${response.status}`);
      const data=await response.json();
      if(crossRes&&crossRes.ok){
        const crossData=await crossRes.json().catch(()=>null);
        if(Array.isArray(crossData?.items))catalogTalents=crossData.items.map(t=>({id:t.id,name:t.name}));
      }
      if(id!==loadingId)return;
      items=Array.isArray(data.items)?data.items.filter(x=>x&&typeof x.name==='string'&&typeof x.network==='string'&&typeof x.url==='string'):[];
      populateArtistPickers(q);
      render();
      loadFicha360();
      if(data.truncated)status.textContent+=' A consulta foi limitada no servidor: refine a pesquisa.';
    }catch(e){if(id===loadingId){items=[];render();status.textContent='Não foi possível consultar a API. Os dados antigos não foram reutilizados: '+e.message}}
    finally{if(id===loadingId)refresh.disabled=false}
  }
  network.addEventListener('change',render);metric.addEventListener('change',render);
  artistPicker.addEventListener('change',loadFicha360);
  comparePicker.addEventListener('change',loadFicha360);
  refresh.addEventListener('click',load);
  document.getElementById('artist-quick-btn')?.addEventListener('click',load);
  document.getElementById('artist-quick-search')?.addEventListener('keydown',e=>{if(e.key==='Enter')load()});
  load();
})();
