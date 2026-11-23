'use strict';
const form=document.querySelector('#commercial-filters'),msg=document.querySelector('#message'),rows=document.querySelector('#commercial-rows'),profile=document.querySelector('#commercial-profile'),chart=document.querySelector('#commercial-chart'),other=document.querySelector('#commercial-other'),strategic=document.querySelector('#strategic-strip');
const platformMetrics={Instagram:['followers','views','likes','comments'],YouTube:['subscribers','views','likes','comments'],Spotify:['monthly_listeners','followers','streams'],TikTok:['followers','views','likes','comments']};
const metrics={all:['consolidated_growth'],...platformMetrics};
const labels={consolidated_growth:'Crescimento consolidado',subscribers:'Inscritos',views:'Visualizações',likes:'Curtidas',comments:'Comentários',followers:'Seguidores',monthly_listeners:'Ouvintes mensais',streams:'Reproduções'};
const sizes={small:'Pequeno porte',medium:'Médio porte',large:'Grande porte',unknown:'Indisponível'};
const neonPalette={
  Instagram:{color:'#ff2bd6',glow:'rgba(255,43,214,0.55)',fillTop:'rgba(255,43,214,0.28)'},
  YouTube:{color:'#00f0ff',glow:'rgba(0,240,255,0.55)',fillTop:'rgba(0,240,255,0.25)'},
  Spotify:{color:'#00ff88',glow:'rgba(0,255,136,0.55)',fillTop:'rgba(0,255,136,0.25)'},
  TikTok:{color:'#facc15',glow:'rgba(250,204,21,0.55)',fillTop:'rgba(250,204,21,0.26)'}
};
const number=v=>v==null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1});
const signed=v=>v==null?'—':(v>0?'+':'')+number(v);
const fmtPct=v=>v==null?'—':`${signed(v)}%`;
let token=0,detailToken=0,activeParams=null,selectedArtist=null,cityToken=0,lastResponse=null;

function el(tag,text,parent){const x=document.createElement(tag);if(text!=null)x.textContent=text;if(parent)parent.append(x);return x;}
function updateMetrics(){
  form.elements.metric.replaceChildren();
  const netVal=form.elements.network.value||'all';
  for(const m of (metrics[netVal]||metrics.all)){
    const o=el('option',labels[m]||m,form.elements.metric);
    o.value=m;
  }
}
async function get(params){const r=await fetch('/api/commercial?'+params,{cache:'no-store'});if(!r.ok)throw Error('API indisponível');return r.json();}

function kpis(d,extra={}){
  const root=document.querySelector('#commercial-kpis');root.replaceChildren();
  const lastObs=extra.lastCollected??d.items.map(x=>x.observed_on).filter(Boolean).sort().at(-1)??null;
  const isAll=d.network==='all';
  const leadItem=d.items[0];
  const topNetLabel=extra.topNetwork
    ?`${extra.topNetwork.network} (${signed(extra.topNetwork.growth_pct)}%)`
    :(isAll&&leadItem?.top_network
      ?`${leadItem.top_network}${leadItem.top_network_growth_pct!=null?` (${signed(leadItem.top_network_growth_pct)}%)`:''}`
      :(d.network_label||d.network));
  const cards=[
    ['Artistas com coleta ativa',number(d.total),d.growing>0?`${d.growing} em crescimento no período`:'Indicadores verificados no recorte'],
    ['Líder no recorte atual',leadItem?leadItem.name:'—',leadItem?`${number(leadItem.value)} · ${topNetLabel} (${sizes[leadItem.size]})`:'Nenhum artista no filtro'],
    ['Histórico comparável',number(d.comparable),d.comparable>0?'Com 2+ observações na janela':`${d.total} artista(s) com 1ª coleta registrada`],
    ['Última coleta verificada',lastObs??'—',lastObs?'Sincronizado com o Motor de Dados':'Sem histórico disponível']
  ];
  for(const [title,val,sub] of cards){
    const x=el('div',null,root);x.className='kpi';
    el('span',title,x);el('strong',String(val),x);
    if(sub)el('small',sub,x);
  }
}

function smoothPath(pts){
  if(!pts.length)return '';
  if(pts.length===1)return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    const cp1x=p1[0]+(p2[0]-p0[0])/6,cp1y=p1[1]+(p2[1]-p0[1])/6;
    const cp2x=p2[0]-(p3[0]-p1[0])/6,cp2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function draw(history,nationalList=null){
  chart.replaceChildren();
  const seriesList=[];
  const activeNet=activeParams?.get('network')||form.elements.network.value||'all';
  const activeMetric=activeParams?.get('metric')||form.elements.metric.value||'consolidated_growth';
  const winDays=Number(activeParams?.get('days')||form.elements.days.value||30);

  if(Array.isArray(nationalList)&&nationalList.length){
    for(const n of nationalList){
      const winItem=n.windows?.[winDays]??n.item;
      const h=winItem?.history?.length>=2
        ?winItem.history
        :(n.item?.history?.length>=2?n.item.history:n.windows?.[90]?.history);
      if(h&&h.length>=2){
        seriesList.push({network:n.network,metric:n.metric,history:h,item:winItem??n.item});
      }
    }
  }else if(selectedArtist?.networks){
    for(const net of Object.keys(platformMetrics)){
      const netObj=selectedArtist.networks[net];
      if(netObj?.history?.length>=2){
        seriesList.push({network:net,metric:netObj.metric,history:netObj.history,item:netObj});
      }
    }
  }

  if(activeNet!=='all'&&history&&history.length>=2){
    const idx=seriesList.findIndex(s=>s.network===activeNet);
    const entry={network:activeNet,metric:activeMetric,history,item:selectedArtist};
    if(idx>=0)seriesList[idx]=entry;
    else seriesList.push(entry);
  }

  if(!seriesList.length&&history&&history.length>=2){
    const netName=activeNet==='all'?(selectedArtist?.top_network||'YouTube'):activeNet;
    seriesList.push({network:netName,metric:activeMetric,history,item:selectedArtist});
  }
  if(!seriesList.length){
    chart.hidden=true;
    return;
  }
  chart.hidden=false;

  const head=el('div',null,chart);head.className='neon-chart-head';
  el('span',seriesList.length>1?`Curva de Aceleração nas 4 Mídias (% acumulado em ${winDays}d)`:'Evolução histórica do indicador',head).className='neon-chart-title';
  const legend=el('div',null,head);legend.className='neon-legend';
  for(const s of seriesList){
    const pal=neonPalette[s.network]||neonPalette.YouTube;
    const pill=el('span',null,legend);pill.className='neon-pill';
    pill.style.borderColor=pal.color+'66';
    const dot=el('i',null,pill);dot.className='neon-dot';
    dot.style.background=pal.color;dot.style.boxShadow=`0 0 8px ${pal.color}`;
    const baseVal=s.history[0].value,lastVal=s.history.at(-1).value;
    const pct=s.item?.growth_pct??(baseVal>0?(lastVal-baseVal)/baseVal*100:null);
    el('span',s.network+' ',pill);
    const b=el('b',pct!=null?`${signed(pct)}%`:number(lastVal),pill);
    b.style.color=pal.color;
  }

  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 560 175');svg.setAttribute('role','img');svg.setAttribute('aria-label','Evolução histórica comparativa nas mídias');
  const defs=document.createElementNS(ns,'defs');
  const filter=document.createElementNS(ns,'filter');
  filter.setAttribute('id','neon-glow');filter.setAttribute('x','-20%');filter.setAttribute('y','-20%');filter.setAttribute('width','140%');filter.setAttribute('height','140%');
  const blur=document.createElementNS(ns,'feGaussianBlur');blur.setAttribute('stdDeviation','2.6');blur.setAttribute('result','coloredBlur');
  const merge=document.createElementNS(ns,'feMerge');
  const mn1=document.createElementNS(ns,'feMergeNode');mn1.setAttribute('in','coloredBlur');
  const mn2=document.createElementNS(ns,'feMergeNode');mn2.setAttribute('in','SourceGraphic');
  merge.append(mn1,mn2);filter.append(blur,merge);defs.append(filter);

  for(const [net,pal] of Object.entries(neonPalette)){
    const lg=document.createElementNS(ns,'linearGradient');
    lg.setAttribute('id','grad-'+net);lg.setAttribute('x1','0');lg.setAttribute('y1','0');lg.setAttribute('x2','0');lg.setAttribute('y2','1');
    const st1=document.createElementNS(ns,'stop');st1.setAttribute('offset','0%');st1.setAttribute('stop-color',pal.color);st1.setAttribute('stop-opacity','0.30');
    const st2=document.createElementNS(ns,'stop');st2.setAttribute('offset','100%');st2.setAttribute('stop-color',pal.color);st2.setAttribute('stop-opacity','0.0');
    lg.append(st1,st2);defs.append(lg);
  }
  svg.append(defs);

  const allDates=[...new Set(seriesList.flatMap(s=>s.history.map(h=>h.date)))].sort();
  const lo=Date.parse(allDates[0]),hi=Date.parse(allDates.at(-1));
  const multi=seriesList.length>1;
  const mappedSeries=seriesList.map(s=>{
    const base0=Math.max(1,s.history[0].value);
    const pts=s.history.map(h=>({
      date:h.date,
      raw:h.value,
      plotVal:multi?(h.value-base0)/base0*100:h.value
    }));
    return {...s,pts};
  });
  const allPlotVals=mappedSeries.flatMap(s=>s.pts.map(p=>p.plotVal));
  const minVal=Math.min(multi?0:Infinity,...allPlotVals),maxVal=Math.max(...allPlotVals,minVal+1);
  const padL=44,padR=54,padT=14,padB=24,W=560-padL-padR,H=175-padT-padB;

  for(let g=0;g<=3;g++){
    const ratio=g/3,y=padT+H*(1-ratio),v=minVal+(maxVal-minVal)*ratio;
    const line=document.createElementNS(ns,'line');
    line.setAttribute('x1',String(padL));line.setAttribute('x2',String(padL+W));
    line.setAttribute('y1',y.toFixed(1));line.setAttribute('y2',y.toFixed(1));
    line.setAttribute('stroke','#2a253a');line.setAttribute('stroke-width','1');line.setAttribute('stroke-dasharray','3 3');
    svg.append(line);
    const txt=document.createElementNS(ns,'text');
    txt.setAttribute('x',String(padL-6));txt.setAttribute('y',(y+3).toFixed(1));
    txt.setAttribute('text-anchor','end');txt.setAttribute('fill','#8b8698');txt.setAttribute('font-size','9.5');
    txt.textContent=multi?`${v>=0?'+':''}${v.toFixed(0)}%`:number(Math.round(v));
    svg.append(txt);
  }

  for(let i=0;i<allDates.length;i++){
    if(allDates.length>6&&i%2===1&&i!==allDates.length-1)continue;
    const dStr=allDates[i],x=padL+W*(Date.parse(dStr)-lo)/Math.max(1,hi-lo);
    const vline=document.createElementNS(ns,'line');
    vline.setAttribute('x1',x.toFixed(1));vline.setAttribute('x2',x.toFixed(1));
    vline.setAttribute('y1',String(padT));vline.setAttribute('y2',String(padT+H));
    vline.setAttribute('stroke','#1f1b2c');vline.setAttribute('stroke-width','1');
    svg.append(vline);
    const dTxt=document.createElementNS(ns,'text');
    dTxt.setAttribute('x',x.toFixed(1));dTxt.setAttribute('y',String(padT+H+15));
    dTxt.setAttribute('text-anchor','middle');dTxt.setAttribute('fill','#a1a1aa');dTxt.setAttribute('font-size','9.5');
    dTxt.textContent=dStr.slice(8,10)+'/'+dStr.slice(5,7);
    svg.append(dTxt);
  }

  for(const s of mappedSeries){
    const pal=neonPalette[s.network]||neonPalette.YouTube;
    const isPrimary=!multi||activeNet==='all'||s.network===activeNet;
    const isTopLead=activeNet==='all'&&selectedArtist?.top_network===s.network;
    const coords=s.pts.map(p=>[
      padL+W*(Date.parse(p.date)-lo)/Math.max(1,hi-lo),
      padT+H*(1-(p.plotVal-minVal)/Math.max(0.001,maxVal-minVal)),
      p
    ]);
    const curveD=smoothPath(coords);
    const areaD=`${curveD} L${coords.at(-1)[0].toFixed(1)},${(padT+H).toFixed(1)} L${coords[0][0].toFixed(1)},${(padT+H).toFixed(1)} Z`;
    const area=document.createElementNS(ns,'path');
    area.setAttribute('d',areaD);
    area.setAttribute('fill',`url(#grad-${s.network})`);
    area.setAttribute('opacity',isTopLead?'0.95':isPrimary?'0.72':'0.45');
    svg.append(area);

    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',curveD);
    path.setAttribute('fill','none');
    path.setAttribute('stroke',pal.color);
    path.setAttribute('stroke-width',isTopLead?'2.9':isPrimary?'2.5':'2.0');
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('filter','url(#neon-glow)');
    svg.append(path);

    for(const [cx,cy,pt] of coords){
      const halo=document.createElementNS(ns,'circle');
      halo.setAttribute('cx',cx.toFixed(1));halo.setAttribute('cy',cy.toFixed(1));
      halo.setAttribute('r',isPrimary?'4.3':'3.5');
      halo.setAttribute('fill',pal.color);halo.setAttribute('fill-opacity','0.28');
      svg.append(halo);

      const dot=document.createElementNS(ns,'circle');
      dot.setAttribute('cx',cx.toFixed(1));dot.setAttribute('cy',cy.toFixed(1));
      dot.setAttribute('r',isPrimary?'2.6':'2.1');
      dot.setAttribute('fill','#ffffff');dot.setAttribute('stroke',pal.color);dot.setAttribute('stroke-width','1.4');
      const title=document.createElementNS(ns,'title');
      title.textContent=`${s.network} (${labels[s.metric]??s.metric}) · ${pt.date}: ${number(pt.raw)}`+(multi?` (${signed(pt.plotVal)}%)`:'');
      dot.append(title);
      svg.append(dot);
    }

    const lastPt=coords.at(-1);
    if(lastPt){
      const tag=document.createElementNS(ns,'text');
      tag.setAttribute('x',(lastPt[0]+6).toFixed(1));
      tag.setAttribute('y',(lastPt[1]+3).toFixed(1));
      tag.setAttribute('fill',pal.color);
      tag.setAttribute('font-size','9.5');
      tag.setAttribute('font-weight','700');
      tag.textContent=multi?`${signed(lastPt[2].plotVal)}%`:number(lastPt[2].raw);
      svg.append(tag);
    }
  }

  chart.append(svg);
}

function renderStrategicStrip(d,a){
  if(!strategic)return;
  strategic.replaceChildren();
  const isAll=(activeParams?.get('network')||'all')==='all';
  let w7Text=null,w15Text=null,w30Text=null;
  if(isAll&&d.consolidatedWindows){
    const fmtC=w=>w&&w.growth_pct!=null?`${signed(w.growth_pct)}% (${w.top_network} ${signed(w.top_growth_pct)}%)`:null;
    w7Text=fmtC(d.consolidatedWindows[7]);
    w15Text=fmtC(d.consolidatedWindows[15]);
    w30Text=fmtC(d.consolidatedWindows[30]);
  }else{
    const activeNet=d.national.find(x=>x.network===activeParams?.get('network'))??d.national.find(x=>x.item);
    const fmtWin=w=>w&&w.growth_pct!=null?`${signed(w.growth_pct)}% (${signed(w.growth)})`:null;
    w7Text=fmtWin(activeNet?.windows?.[7]);
    w15Text=fmtWin(activeNet?.windows?.[15]);
    w30Text=fmtWin(activeNet?.windows?.[30]);
  }
  const hasAnyGrowth=Boolean(w7Text||w15Text||w30Text||d.topNetwork||d.risingCity);
  if(!hasAnyGrowth){
    strategic.hidden=true;
    return;
  }
  strategic.hidden=false;
  const pills=[
    ['Crescimento 7 dias',w7Text||'—'],
    ['Crescimento 15 dias',w15Text||'—'],
    ['Crescimento 30 dias',w30Text||'—'],
    ['Mídia em destaque',d.topNetwork?`${d.topNetwork.network} (${signed(d.topNetwork.growth_pct)}%)`:'—'],
    ['Cidade em ascensão',d.risingCity?`${d.risingCity.name}/${d.risingCity.uf} (${signed(d.risingCity.growth_pct)}%)`:'—'],
    ['Última coleta',d.lastCollected??a.observed_on??'—']
  ];
  for(const [k,v] of pills){
    const box=el('div',null,strategic);box.className='strategic-pill';
    el('span',k,box);el('strong',v,box);
  }
}

async function selectArtist(a,userInitiated=false){
  const id=++detailToken;selectedArtist=a;
  const compatArtistInput=document.querySelector('#compat-artist');
  const compatCityInput=document.querySelector('#compat-city');
  if(compatArtistInput&&userInitiated)compatArtistInput.value=a.name;
  if(compatArtistInput?.value?.trim()&&compatCityInput?.value?.trim()){
    runCompatibilitySimulator(a.id);
  }else if(compatStatus&&!compatResult?.children?.length){
    compatStatus.textContent='Selecione um artista e digite qualquer município brasileiro no campo Cidade / Praça para simular a viabilidade.';
  }
  document.querySelector('#city-scope option[value="artist"]').disabled=false;
  for(const tr of rows.children)tr.setAttribute('aria-selected',String(tr.dataset.artist===a.id));
  loadArtistCards(a,id);
  if(document.querySelector('#city-scope').value==='artist')loadCities();
  profile.replaceChildren();other.replaceChildren();
  const box=el('div',null,profile);box.className='profile-header-box';
  const left=el('div',null,box),right=el('div',null,box);
  const isAll=(activeParams?.get('network')||'all')==='all';
  const winDays=activeParams?.get('days')||'30';
  el('h3',a.name,left);
  const subParts=[sizes[a.size],...(a.modalities?.length?a.modalities:['Modalidade geral'])];
  if(isAll&&a.top_network)subParts.push(`Rede em que mais cresceu: ${a.top_network}${a.top_network_growth_pct!=null?` (${signed(a.top_network_growth_pct)}%)`:''}`);
  el('p',subParts.join(' · '),left);
  if(isAll){
    const activeNets=Object.values(a.networks||{}).filter(Boolean).length;
    el('small',`${activeNets} de 4 mídias com coleta ativa · Janela (${winDays}d): ${a.baseline_on?`base em ${a.baseline_on}`:'aguardando 2ª coleta para calcular evolução'}`,left);
    el('strong',`${number(a.top_network_value??a.value)} ${labels[a.top_network_metric]||'Inscritos'} (${a.top_network||'YouTube'})`,right);
    const deltaP=el('p',a.growth_pct!=null?`Crescimento consolidado (${winDays}d): ${signed(a.growth_pct)}%`:`1ª coleta verificada em ${a.observed_on} · Sem histórico anterior`,right);
    deltaP.className=(a.growth_pct??0)>0?'positive':(a.growth_pct??0)<0?'negative':'';
  }else{
    el('small',a.freshness_label?`${a.freshness_label} · Base (${winDays}d): ${a.baseline_on??'indisponível (1 coleta)'}`:`Última coleta: ${a.observed_on} · Base (${winDays}d): ${a.baseline_on??'indisponível (1 coleta)'} · Fonte: ${a.source}`,left);
    el('strong',`${number(a.value)} ${labels[activeParams.get('metric')]}`,right);
    const deltaP=el('p',a.growth==null?`Variação (${winDays}d): Sem histórico comparável (1 coleta)`:`Variação (${winDays}d): ${signed(a.growth)} (${a.growth_pct==null?'—':signed(a.growth_pct)+'%'})`,right);
    deltaP.className=a.growth>0?'positive':a.growth<0?'negative':'';
  }
  try{
    const u=new URL(a.url);
    if(u.protocol==='https:'){const link=el('a','Abrir perfil oficial ↗',right);link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';link.className='profile-ext-btn';}
  }catch{}
  draw(a.history);
  other.hidden=true;
  const otherHeading=other.previousElementSibling;
  if(otherHeading&&otherHeading.tagName==='H3')otherHeading.hidden=true;
  renderArtistComparison();
}

function buildMiniSparkline(a,isAll){
  let hist=Array.isArray(a?.history)&&a.history.length>=2?a.history:null;
  let netName=isAll?(a?.top_network||'YouTube'):(activeParams?.get('network')||'YouTube');
  if(!hist&&a?.networks){
    for(const [net,obj] of Object.entries(a.networks)){
      if(obj?.history?.length>=2){hist=obj.history;netName=net;break;}
    }
  }
  const wrap=document.createElement('div');
  wrap.className='mini-spark-cell';
  if(!hist||hist.length<2){
    const s=el('span','1 coleta',wrap);
    s.className='spark-empty';
    return wrap;
  }
  const vals=hist.map(p=>Number(p.value)||0);
  const min=Math.min(...vals),max=Math.max(...vals,min+1);
  const W=74,H=22,pad=3;
  const ns='http://www.w3.org/2000/svg',sEl=document.createElementNS(ns,'svg');
  sEl.setAttribute('viewBox',`0 0 ${W} ${H}`);
  sEl.setAttribute('class','mini-spark-svg');
  sEl.setAttribute('aria-label',`Série histórica (${hist.length} coletas)`);
  const pts=vals.map((v,i)=>[
    pad+(W-pad*2)*(i/Math.max(1,vals.length-1)),
    pad+(H-pad*2)*(1-(v-min)/Math.max(1,max-min))
  ]);
  const col=(neonPalette[netName]?.color)||((vals.at(-1)>=vals[0])?'#4ade80':'#fca5a5');
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d',smoothPath(pts));
  path.setAttribute('fill','none');
  path.setAttribute('stroke',col);
  path.setAttribute('stroke-width','1.8');
  path.setAttribute('stroke-linecap','round');
  sEl.append(path);
  const last=pts.at(-1);
  if(last){
    const c=document.createElementNS(ns,'circle');
    c.setAttribute('cx',last[0].toFixed(1));
    c.setAttribute('cy',last[1].toFixed(1));
    c.setAttribute('r','2.1');
    c.setAttribute('fill',col);
    sEl.append(c);
  }
  wrap.append(sEl);
  return wrap;
}

let compareReqSeq=0;
async function renderArtistComparison(){
  const panel=document.querySelector('#artist-comparison-panel');
  const select=document.querySelector('#compare-artist-select');
  if(!panel||!select)return;
  const secondId=select.value;
  if(!selectedArtist||!secondId||secondId===selectedArtist.id){
    panel.hidden=true;
    panel.replaceChildren();
    return;
  }
  const seq=++compareReqSeq;
  panel.hidden=false;
  panel.replaceChildren();
  el('small','Comparando indicadores verificados nas 4 mídias...',panel);
  try{
    const [r1,r2]=await Promise.all([
      fetch('/api/radar/media-stats?talent='+encodeURIComponent(selectedArtist.id),{cache:'no-store'}).then(r=>r.ok?r.json():null),
      fetch('/api/radar/media-stats?talent='+encodeURIComponent(secondId),{cache:'no-store'}).then(r=>r.ok?r.json():null)
    ]);
    if(seq!==compareReqSeq||!r1||!r2)return;
    panel.replaceChildren();
    const head=el('div',null,panel);head.className='compare-head';
    el('strong',`Comparativo Direto: ${r1.name} vs. ${r2.name}`,head);
    const tbl=el('table',null,panel);tbl.className='compare-table';
    const thRow=el('tr',null,el('thead',null,tbl));
    for(const h of ['Mídia / Indicador',r1.name,r2.name,'Variação 30d'])el('th',h,thRow);
    const tb=el('tbody',null,tbl);
    for(const [net,mKey,mLabel] of [
      ['Instagram','followers','Seguidores'],
      ['Spotify','monthly_listeners','Ouvintes mensais'],
      ['YouTube','subscribers','Inscritos'],
      ['TikTok','followers','Seguidores']
    ]){
      const tr=el('tr',null,tb);
      const tdN=el('td',`${net} (${mLabel})`,tr);
      if(neonPalette[net])tdN.style.color=neonPalette[net].color;
      const v1=r1[net]?.[mKey]?.formatted||'Sem coleta';
      const v2=r2[net]?.[mKey]?.formatted||'Sem coleta';
      el('td',v1,tr);
      el('td',v2,tr);
      const g1=r1[net]?.growth_30d?.formatted||'—';
      const g2=r2[net]?.growth_30d?.formatted||'—';
      el('td',`${g1}  |  ${g2}`,tr);
    }
  }catch{
    if(seq===compareReqSeq){panel.replaceChildren();el('small','Não foi possível carregar o comparativo.',panel);}
  }
}
document.querySelector('#compare-artist-select')?.addEventListener('change',()=>renderArtistComparison());

async function load(){
  const current=++token;++detailToken;++cityToken;selectedArtist=null;activeParams=null;
  document.querySelector('#city-scope').value='all';
  document.querySelector('#city-scope option[value="artist"]').disabled=true;
  document.querySelector('#network-cards').replaceChildren();
  document.querySelector('#city-cards').replaceChildren();
  if(strategic)strategic.replaceChildren();
  document.querySelector('#city-status').textContent='Aguardando consulta...';
  rows.replaceChildren();profile.replaceChildren();chart.replaceChildren();other.replaceChildren();
  el('p','Selecione um artista no ranking.',profile);
  msg.textContent='Consultando dados...';
  try{
    const p=new URLSearchParams(new FormData(form));
    const d=await get(p);
    if(current!==token)return;
    p.set('end',d.end);activeParams=p;lastResponse=d;
    const isAll=d.network==='all';
    kpis(d);loadCities();
    if(form.elements.modality.options.length===1)for(const m of d.modalities){const o=el('option',m.name,form.elements.modality);o.value=m.id;}
    const artistList=document.querySelector('#compat-artists-list');
    if(artistList){
      artistList.replaceChildren();
      for(const item of d.items){const o=el('option',null,artistList);o.value=item.name;}
    }
    const cmpSel=document.querySelector('#compare-artist-select');
    if(cmpSel){
      const prevCmp=cmpSel.value;
      cmpSel.replaceChildren(new Option('Sem comparação',''),...d.items.map(item=>new Option(item.name,item.id)));
      if([...cmpSel.options].some(o=>o.value===prevCmp))cmpSel.value=prevCmp;
    }
    msg.textContent=d.total
      ?(isAll
        ?`${d.total} artistas monitorados em Todas as mídias — Instagram: Incluído na consulta · YouTube: Incluído na consulta · Spotify: Incluído na consulta · TikTok: Incluído na consulta (${d.start} a ${d.end}). ${d.comparable} com histórico comparável.`
        :`${d.total} artistas monitorados em ${d.network} (${d.start} a ${d.end}). ${d.comparable} com histórico comparável.`)
      :'Nenhum dado disponível para estes filtros.';
    for(const [idx,a] of d.items.entries()){
      const tr=el('tr',null,rows),td=el('td',null,tr),b=el('button',`${idx+1}. ${a.name}`,td);
      tr.dataset.artist=a.id;b.type='button';b.className='artist-link';b.onclick=()=>selectArtist(a,true);
      if(isAll){
        const netBreakdown=['Instagram','YouTube','Spotify','TikTok'].map(n=>{
          const tag=n==='Instagram'?'IG':n==='YouTube'?'YT':n==='Spotify'?'SP':'TK';
          const netObj=a.networks?.[n];
          if(netObj?.growth_pct!=null)return `${tag} ${fmtPct(netObj.growth_pct)}`;
          if(netObj?.value!=null)return `${tag} coletado (1 obs.)`;
          return `${tag} sem coleta`;
        }).join(' · ');
        const leadLabel=a.top_network_growth_pct!=null
          ?`Maior alta: ${a.top_network||'—'} (${signed(a.top_network_growth_pct)}%)`
          :`Mídia coletada: ${a.top_network||'—'} (sem histórico comparável)`;
        el('small',`${sizes[a.size]} · ${leadLabel} · ${netBreakdown}`,td);
        el('td',a.top_network?`${number(a.value)} (${a.top_network})`:number(a.value),tr);
        const tdDelta=el('td',a.growth==null?'Sem histórico':`${signed(a.growth)} (${a.top_network})`,tr);
        const tdPct=el('td',a.growth_pct==null?'1 coleta':signed(a.growth_pct)+'%',tr);
        if((a.growth_pct??0)>0){tdDelta.className='positive';tdPct.className='positive';}
        else if((a.growth_pct??0)<0){tdDelta.className='negative';tdPct.className='negative';}
      }else{
        el('small',[sizes[a.size],...(a.modalities??[])].join(' · '),td);
        el('td',number(a.value),tr);
        const tdDelta=el('td',signed(a.growth),tr);
        const tdPct=el('td',a.growth_pct==null?'—':signed(a.growth_pct)+'%',tr);
        if(a.growth>0){tdDelta.className='positive';tdPct.className='positive';}
        else if(a.growth<0){tdDelta.className='negative';tdPct.className='negative';}
      }
      const tdSpark=el('td',null,tr);
      tdSpark.append(buildMiniSparkline(a,isAll));
    }
    if(d.items.length)selectArtist(d.items[0]);
    if(!d.items.length){const td=el('td','Sem registros.',el('tr',null,rows));td.colSpan=5;}
  }catch{
    if(current===token){
      document.querySelector('#commercial-kpis').replaceChildren();
      msg.textContent='Backend indisponível. Não foi possível consultar o banco.';
      document.querySelector('#city-status').textContent='Consulta indisponível.';
    }
  }
}

const regionalLabels={...labels,reach:'Alcance',listeners:'Ouvintes'};
const choices={};
function card(root,title){
  const x=el('article',null,root);x.className='insight-card';x.dataset.net=title;
  const h=el('h4',null,x);
  const span=el('span',title,h);
  const pal=neonPalette[title];
  if(pal){
    const dot=el('i',null,h);dot.className='neon-dot';
    dot.style.background=pal.color;dot.style.boxShadow=`0 0 8px ${pal.color}`;
    span.style.color=pal.color;
  }
  return x;
}
async function insights(p){const r=await fetch('/api/commercial/insights?'+p,{cache:'no-store'});if(!r.ok)throw Error('Consulta de detalhes indisponível');return r.json();}
function paramsFor(scope,artist){const p=new URLSearchParams(activeParams);p.set('scope',scope);if(artist)p.set('talent',artist.id);return p;}

async function loadArtistCards(a,id){
  const root=document.querySelector('#network-cards');root.replaceChildren();
  el('p','Consultando quatro mídias...',root);
  try{
    const d=await insights(paramsFor('artist',a));
    if(id!==detailToken)return;
    if(lastResponse)kpis(lastResponse,d);
    renderStrategicStrip(d,a);
    draw(a.history,d.national);
    root.replaceChildren();
    const isAll=(activeParams?.get('network')||'all')==='all';
    const classBadgeLabel={oficial:'API Oficial',relatorio_autorizado:'Relatório Autorizado',observado:'Observação Pública',calculado:'Calculado (Série Real)'};
    const ms=d.mediaStats||null;
    for(const n of d.national){
      const x=card(root,n.network),v=n.item,geo=d.regional.find(g=>g.network===n.network);
      if(!v)x.classList.add('is-empty');
      const netMs=ms?.[n.network]||null;
      const primaryMeta=netMs?.[n.metric];
      const badgeText=v?(classBadgeLabel[primaryMeta?.classification]||'Coleta Verificada'):'Sem coleta';
      const headEl=x.querySelector('h4');
      if(headEl){
        const stBadge=el('span',badgeText,headEl);
        stBadge.className='net-card-status'+(v?' is-active':'');
      }
      el('small',labels[n.metric]||n.metric,x);
      el('strong',v?(n.formatted&&n.formatted!==number(v.value)?`${n.formatted} (${number(v.value)})`:number(v.value)):'Sem coleta ativa',x);
      if(v){
        const delta=el('p',v.growth==null?`1ª coleta em ${v.observed_on} · variação disponível após 2ª coleta`:`Crescimento 30d: ${signed(v.growth)} (${v.growth_pct==null?'—':signed(v.growth_pct)+'%'})`,x);
        delta.className=v.growth>0?'positive':v.growth<0?'negative':'';
        const secChips=el('div',null,x);secChips.className='win-badges';
        if(n.network==='YouTube'&&netMs?.views?.value!=null){
          el('span',`Views: ${netMs.views.formatted}`,secChips).className='win-badge';
        }
        if(n.network==='Instagram'&&netMs?.engagement?.formatted&&netMs.engagement.formatted!=='—'){
          el('span',`Engajamento: ${netMs.engagement.formatted}`,secChips).className='win-badge';
        }
        if(n.network==='Spotify'&&netMs?.repertoire?.formatted&&netMs.repertoire.formatted!=='—'){
          el('span',netMs.repertoire.formatted,secChips).className='win-badge';
        }
        if(n.windows){
          for(const w of [7,15,30,90]){
            const wi=n.windows[w];
            if(wi&&wi.growth_pct!=null)el('span',`${w}d: ${signed(wi.growth_pct)}%`,secChips).className='win-badge';
          }
        }
        if(!secChips.children.length)secChips.remove();
        el('small',`Fonte: ${v.source} · Data: ${v.observed_on}`,x);
      }else{
        el('p','Perfil catalogado · aguardando fonte autorizada ou coleta verificada.',x);
      }
      if(geo?.report){
        const r=geo.report;
        const top3=geo.cities.slice(0,3).map(c=>`${c.name}/${c.uf} (${number(c.value)})`).join(' · ');
        if(top3)el('small',`Principais praças (${regionalLabels[r.metric]}): ${top3}`,x);
      }
      if(n.profileUrl){
        try{
          const u=new URL(n.profileUrl);
          if(u.protocol==='https:'){
            const pl=el('a',v?`Abrir canal/perfil oficial (${n.network}) ↗`:`Verificar perfil catalogado (${n.network}) ↗`,x);
            pl.href=u.href;pl.target='_blank';pl.rel='noopener noreferrer';
            pl.className='net-card-link';
          }
        }catch{}
      }
    }
    if(d.catalog?.genres?.length){
      const leftHead=profile.querySelector('.profile-header-box > div:first-child');
      if(leftHead&&!leftHead.querySelector('.catalog-genres-tag')){
        const gTag=el('small',`Gêneros (Catálogo): ${d.catalog.genres.join(', ')}`,leftHead);
        gTag.className='catalog-genres-tag';
      }
    }
  }catch{
    if(id===detailToken){root.replaceChildren();el('p','Não foi possível carregar os cards.',root);}
  }
}

async function loadCities(){
  if(!activeParams)return;
  const seq=++cityToken,root=document.querySelector('#city-cards'),status=document.querySelector('#city-status'),scope=document.querySelector('#city-scope').value,p=paramsFor(scope,scope==='artist'?selectedArtist:null);
  p.set('region',document.querySelector('#city-region').value);
  for(const [n,m] of Object.entries(choices))if(m)p.set('metric_'+n,m);
  root.replaceChildren();status.textContent='Consultando cidades...';
  try{
    const d=await insights(p);
    if(seq!==cityToken)return;
    status.textContent=(d.scope==='artist'?d.artist.name:'Todos os artistas com dados')+' · '+d.start+' a '+d.end+' · soma entre artistas não representa pessoas únicas.';
    if(!d.regional.some(g=>g.report)){
      const emptyBox=el('div',null,root);emptyBox.className='city-empty-banner';
      el('strong','Sem relatórios municipais importados para este recorte',emptyBox);
      el('p','Indicadores nacionais de seguidores e inscritos não são distribuídos por município. Para ativar o ranking municipal por mídia, importe um relatório regional autorizado (Spotify for Artists, Instagram Insights ou YouTube Analytics) em Prospecção e Aprovação.',emptyBox);
      return;
    }
    for(const g of d.regional){
      const x=card(root,g.network),r=g.report;
      const select=el('select',null,x);select.setAttribute('aria-label','Indicador municipal '+g.network);
      const opt=el('option','Indicador automático',select);opt.value='';
      for(const m of g.choices){const o=el('option',regionalLabels[m]??m,select);o.value=m;}
      if(choices[g.network]&&!g.choices.includes(choices[g.network])){
        const o=el('option',(regionalLabels[choices[g.network]]??choices[g.network])+' (sem dados)',select);o.value=choices[g.network];
      }
      select.value=choices[g.network]??'';
      select.onchange=()=>{choices[g.network]=select.value;loadCities();};
      if(!r){el('p','Nenhum relatório municipal disponível no recorte.',x);continue;}
      el('small',regionalLabels[r.metric]+' · '+r.period_start+' a '+r.period_end,x);
      el('strong',number(g.total),x);
      el('small',g.municipalities+' cidades · '+g.talents+' artistas · '+(r.quality==='verified'?'Verificado':'Estimado')+' · '+r.source,x);
      const list=el('ol',null,x);list.className='city-list';
      for(const c of g.cities){
        const li=el('li',null,list),line=el('div',null,li);line.className='city-line';
        el('span',c.name+' / '+c.uf,line);
        el('span',number(c.value)+(g.total>0?' ('+number(c.value/g.total*100)+'%)':''),line);
        const bar=el('progress',null,li);bar.max=Math.max(1,g.cities[0].value);bar.value=c.value;bar.setAttribute('aria-label',c.name+' '+number(c.value));
      }
      if(g.regions.length)el('small','Região líder: '+g.regions[0].name+' · '+number(g.regions[0].value),x);
      if(d.scope==='artist'){
        if(g.cityGrowth){
          el('h4','Cidades com aumento observado',x);
          el('small','Base: '+g.cityGrowth.previousStart+' a '+g.cityGrowth.previousEnd+' · '+g.cityGrowth.comparable+' cidades comparáveis',x);
          for(const c of g.cityGrowth.leaders){
            const gp=el('p',c.name+' / '+c.uf+' · '+signed(c.growth)+(c.growth_pct==null?'':' ('+signed(c.growth_pct)+'%)'),x);
            gp.className='positive';
          }
          if(!g.cityGrowth.leaders.length)el('small','Nenhum aumento nas cidades comparáveis.',x);
        }else el('small','Sem histórico municipal comparável.',x);
      }
    }
  }catch{
    if(seq===cityToken)status.textContent='Não foi possível consultar as cidades.';
  }
}

document.querySelector('#city-scope').onchange=loadCities;
document.querySelector('#city-region').onchange=loadCities;
form.elements.network.onchange=()=>{updateMetrics();load();};
for(const fieldName of ['metric','days','size','modality','order','trend']){
  if(form.elements[fieldName])form.elements[fieldName].onchange=()=>load();
}
form.onsubmit=e=>{e.preventDefault();load();};
form.addEventListener('radar:sync-filter',()=>load());

let compatToken=0,cachedMunicipalities=null,municipalitiesPromise=null;
const compatForm=document.querySelector('#compatibility-form');
const compatResult=document.querySelector('#compatibility-result');
const compatStatus=document.querySelector('#compat-status');
const normStr=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();

async function ensureMunicipalitiesCatalog(){
  if(cachedMunicipalities)return cachedMunicipalities;
  if(municipalitiesPromise)return municipalitiesPromise;
  municipalitiesPromise=fetch('/api/radar/municipalities',{cache:'no-store'})
    .then(r=>r.ok?r.json():{items:[]})
    .then(d=>{
      cachedMunicipalities=(d.items||[]).map(m=>({
        ...m,
        _normName:normStr(m.name),
        _normUf:normStr(m.uf),
        _label:`${m.name} / ${m.uf}`
      }));
      return cachedMunicipalities;
    })
    .catch(()=>[])
    .finally(()=>{municipalitiesPromise=null;});
  return municipalitiesPromise;
}

function renderCityDatalist(items){
  const list=document.querySelector('#compat-cities-list');
  if(!list)return;
  list.replaceChildren();
  for(const m of items.slice(0,80)){
    const o=el('option',null,list);
    o.value=m._label||`${m.name} / ${m.uf}`;
  }
}

async function loadCitySuggestions(q=''){
  const list=document.querySelector('#compat-cities-list');
  if(!list)return;
  const rawQ=normStr(q);
  const qClean=rawQ.replace(/[\/,-]+/g,' ').replace(/\s+/g,' ').trim();
  const qParts=qClean?qClean.split(' '):[];
  const maybeUf=qParts.length>1&&/^[a-z]{2}$/.test(qParts.at(-1))?qParts.at(-1):'';
  const nameQuery=maybeUf?qParts.slice(0,-1).join(' '):qClean;

  if(cachedMunicipalities?.length){
    if(!rawQ){
      renderCityDatalist(cachedMunicipalities);
      return;
    }
    const target=nameQuery||qClean;
    const matches=cachedMunicipalities.filter(m=>{
      if(m.code===rawQ||m._normName.includes(rawQ)||m._normName.includes(qClean))return true;
      if(maybeUf&&m._normUf===maybeUf&&m._normName.includes(nameQuery))return true;
      return `${m._normName} / ${m._normUf}`.includes(rawQ)||`${m._normName} ${m._normUf}`.includes(qClean);
    }).sort((a,b)=>{
      const aScore=a._normName===target?0:a._normName.startsWith(target)?1:2;
      const bScore=b._normName===target?0:b._normName.startsWith(target)?1:2;
      return aScore-bScore||a.name.localeCompare(b.name)||a.uf.localeCompare(b.uf);
    });
    renderCityDatalist(matches);
    return;
  }

  try{
    const r=await fetch('/api/radar/municipalities?'+new URLSearchParams({q}),{cache:'no-store'});
    if(!r.ok)return;
    const d=await r.json();
    renderCityDatalist(d.items||[]);
  }catch{}
}

async function runCompatibilitySimulator(explicitTalentId=''){
  if(!compatForm||!compatResult)return;
  const seq=++compatToken;
  const artistQ=document.querySelector('#compat-artist')?.value?.trim()||'';
  const cityQ=document.querySelector('#compat-city')?.value?.trim()||'';
  const radius=document.querySelector('#compat-radius')?.value??'80';
  const days=document.querySelector('#compat-days')?.value??'30';
  if(!artistQ&&!explicitTalentId){
    compatResult.replaceChildren();
    if(compatStatus)compatStatus.textContent='Selecione um artista válido para simular a compatibilidade comercial.';
    return;
  }
  if(!cityQ){
    compatResult.replaceChildren();
    if(compatStatus)compatStatus.textContent='Informe e selecione um município brasileiro no campo Cidade / Praça para simular a viabilidade.';
    return;
  }
  if(compatStatus)compatStatus.textContent=`Calculando compatibilidade comercial de ${artistQ||explicitTalentId} em ${cityQ} (raio ${radius} km)...`;
  try{
    const params=new URLSearchParams({cityQuery:cityQ,radius,days});
    if(explicitTalentId&&(!artistQ||selectedArtist?.name===artistQ))params.set('talent',explicitTalentId);
    if(artistQ)params.set('q',artistQ);
    if(activeParams?.get('end'))params.set('end',activeParams.get('end'));
    const r=await fetch('/api/commercial/compatibility?'+params,{cache:'no-store'});
    const d=await r.json();
    if(seq!==compatToken)return;
    if(!r.ok)throw Error(d.error||'Não foi possível simular a compatibilidade');
    renderCompatibilityResult(d);
    if(compatStatus)compatStatus.textContent=`Análise concluída: ${d.artist.name} × ${d.city.name}/${d.city.uf} (bacia regional de ${d.radiusKm} km com ${d.catchment.totalMunicipalities} municípios).`;
  }catch(e){
    if(seq===compatToken){
      compatResult.replaceChildren();
      if(compatStatus)compatStatus.textContent=e.message;
    }
  }
}

function renderCompatibilityResult(d){
  compatResult.replaceChildren();
  const banner=el('div',null,compatResult);
  banner.className='compat-verdict-banner';
  banner.dataset.level=d.verdict.level;

  const left=el('div',null,banner);
  const cats=[...(d.artist.categories||[]),...(d.artist.modalities||[])];
  el('small',`Simulação de Viabilidade Comercial · ${d.city.name} / ${d.city.uf} (${d.city.region}) · Raio ${d.radiusKm} km (${d.catchment.totalMunicipalities} municípios)`+(cats.length?` · ${[...new Set(cats)].join(' / ')}`:''),left);
  el('h3',`${d.artist.name} × ${d.city.name} / ${d.city.uf} — ${d.verdict.label}`,left);
  el('p',d.verdict.recommendation,left);

  const badge=el('div',null,banner);
  badge.className='compat-score-badge';
  el('strong',d.score!=null?`${d.score}/100`:'—',badge);
  el('small','Score Comercial',badge);

  const execGrid=el('div',null,compatResult);
  execGrid.className='compat-exec-grid';

  // Coluna Esquerda: 7 Variáveis de Decisão para Vendas (Compactas)
  const leftBox=el('div',null,execGrid);
  leftBox.className='compat-panel-box';
  el('h4','7 Variáveis de Viabilidade para Vendas',leftBox);
  const varsList=el('div',null,leftBox);
  varsList.className='compat-vars-list';
  for(const v of d.variables||[]){
    const vr=el('div',null,varsList);
    vr.className='compat-var-row';
    const vh=el('div',null,vr);
    vh.className='compat-var-head';
    el('span',v.label,vh);
    el('b',v.score!=null?`${v.score}/100`:'—',vh);
    const bar=el('div',null,vr);
    bar.className='compat-var-bar';
    const fill=el('div',null,bar);
    fill.className='compat-var-fill';
    fill.style.width=`${v.score!=null?Math.max(4,v.score):0}%`;
    el('small',v.summary,vr);
  }

  // Coluna Direita: Tabela Compacta das 4 Mídias na Cidade e no Raio + Polos Vizinhos + Argumentário
  const rightBox=el('div',null,execGrid);
  rightBox.className='compat-panel-box';
  el('h4',`Desempenho nas 4 Mídias em ${d.city.name}/${d.city.uf} e no Raio de ${d.radiusKm} km`,rightBox);

  const tbl=el('table',null,rightBox);
  tbl.className='compat-media-table';
  const thead=el('thead',null,tbl),trH=el('tr',null,thead);
  for(const h of ['Mídia','Nacional',`Em ${d.city.name}/${d.city.uf}`,`Raio ${d.radiusKm} km`,`Tração (${d.days}d)`])el('th',h,trH);
  const tbody=el('tbody',null,tbl);

  let topCatchmentCities=[];
  for(const m of d.media||[]){
    const tr=el('tr',null,tbody);
    const nat=m.national,ca=m.cityAudience,ra=m.radiusAudience;
    const tdNet=el('td',m.network,tr);
    if(neonPalette[m.network])tdNet.style.color=neonPalette[m.network].color;
    tdNet.style.fontWeight='700';
    el('td',nat?`${nat.formatted||number(nat.value)} (${labels[m.nationalMetric]??m.nationalMetric})`:(m.statusLabel||'Sem coleta'),tr);
    el('td',ca?.present?`${number(ca.value)} (#${ca.rank} · ${ca.sharePct}%)`:'Sem dados',tr);
    el('td',ra?.totalValue!=null?`${number(ra.totalValue)} (${ra.municipalitiesWithData} cid.)`:'Sem dados',tr);
    const growthVal=ca?.growthPct??ra?.growthPct??nat?.growth_pct;
    const tdG=el('td',growthVal!=null?`${signed(growthVal)}%`:'—',tr);
    if(growthVal>0)tdG.className='positive';
    else if(growthVal<0)tdG.className='negative';
    if(ra?.cities?.length>topCatchmentCities.length)topCatchmentCities=ra.cities;
  }

  if(d.city?.demographics||d.territorialPresence){
    const demoText=[];
    if(d.city?.demographics?.population)demoText.push(`População ${d.city.name}/${d.city.uf}: ${number(d.city.demographics.population)} hab. (IBGE)`);
    if(d.city?.demographics?.gdp_per_capita)demoText.push(`PIB per capita: R$ ${number(Math.round(d.city.demographics.gdp_per_capita))}`);
    if(d.catchment?.knownPopulation)demoText.push(`População polos no raio (${d.radiusKm} km): ${number(d.catchment.knownPopulation)} hab.`);
    if(d.territorialPresence)demoText.push(`Eventos publicados: ${d.territorialPresence.statusLabel}`);
    if(demoText.length)el('small',demoText.join(' · '),rightBox);
  }

  if(topCatchmentCities.length>1){
    el('small',`Cidades-polo na bacia de ${d.radiusKm} km (clique para simular individualmente):`,rightBox);
    const chips=el('div',null,rightBox);
    chips.className='compat-catchment-chips';
    for(const c of topCatchmentCities.slice(0,8)){
      const ch=el('button',`${c.name}/${c.uf}: ${number(c.value)}${c.distance_km>0?` (${c.distance_km}km)`:''}`,chips);
      ch.type='button';
      ch.className='compat-city-chip';
      ch.onclick=()=>{
        document.querySelector('#compat-city').value=`${c.name} / ${c.uf}`;
        runCompatibilitySimulator(d.artist.id);
      };
    }
  }

  if(d.salesPitch?.length){
    const pitchBox=el('div',null,rightBox);
    pitchBox.className='compat-pitch-box';
    const head=el('div',null,pitchBox);
    head.className='city-header';
    el('strong',`Argumentário Comercial para Vendas`,head);
    const copyBtn=el('button','Copiar Argumentário',head);
    copyBtn.type='button';
    copyBtn.onclick=async()=>{
      const text=[
        `VIABILIDADE COMERCIAL: ${d.artist.name} em ${d.city.name}/${d.city.uf} (Raio ${d.radiusKm} km)`,
        `Score de Compatibilidade: ${d.score??'—'}/100 — ${d.verdict.label}`,
        `Recomendação: ${d.verdict.recommendation}`,
        ...d.salesPitch.map(line=>`• ${line}`)
      ].join('\n');
      try{await navigator.clipboard.writeText(text);copyBtn.textContent='Copiado!';setTimeout(()=>copyBtn.textContent='Copiar Argumentário',2000);}catch{}
    };
    const ul=el('ul',null,pitchBox);
    for(const item of d.salesPitch){
      el('li',item,ul);
    }
  }
}

if(compatForm){
  compatForm.onsubmit=e=>{e.preventDefault();runCompatibilitySimulator();};
  const cityInput=document.querySelector('#compat-city');
  if(cityInput){
    cityInput.value='';
    cityInput.addEventListener('focus',()=>{
      ensureMunicipalitiesCatalog().then(()=>loadCitySuggestions(cityInput.value));
    });
    cityInput.addEventListener('input',()=>{
      loadCitySuggestions(cityInput.value);
    });
  }
  ensureMunicipalitiesCatalog().then(()=>loadCitySuggestions(''));
}

window.runRadarCompatibility=(artistQuery,cityQuery,radiusKm)=>{
  const aIn=document.querySelector('#compat-artist');
  const cIn=document.querySelector('#compat-city');
  const rIn=document.querySelector('#compat-radius');
  if(aIn&&artistQuery)aIn.value=artistQuery;
  if(cIn&&cityQuery!=null)cIn.value=cityQuery;
  if(rIn&&radiusKm!=null)rIn.value=String(radiusKm);
  if(artistQuery&&form?.elements?.q){form.elements.q.value=artistQuery;load();}
  if((aIn?.value?.trim()||artistQuery)&&(cIn?.value?.trim()||cityQuery)){
    runCompatibilitySimulator();
  }else if(compatStatus){
    compatResult?.replaceChildren();
    compatStatus.textContent='Informe um município brasileiro no campo Cidade / Praça para simular a viabilidade.';
    cIn?.focus();
  }
  document.querySelector('#compatibility-simulator')?.scrollIntoView({behavior:'smooth'});
};

const urlParams=new URLSearchParams(location.search);
if(urlParams.get('network')&&form.elements.network&&[...form.elements.network.options].some(o=>o.value===urlParams.get('network')))form.elements.network.value=urlParams.get('network');
updateMetrics();
if(urlParams.get('metric')&&form.elements.metric&&[...form.elements.metric.options].some(o=>o.value===urlParams.get('metric')))form.elements.metric.value=urlParams.get('metric');
if(urlParams.get('q')&&form.elements.q)form.elements.q.value=urlParams.get('q');
if(urlParams.get('q')&&document.querySelector('#compat-artist'))document.querySelector('#compat-artist').value=urlParams.get('q');
if(urlParams.get('cityQuery')&&document.querySelector('#compat-city'))document.querySelector('#compat-city').value=urlParams.get('cityQuery');
if(urlParams.get('radius')&&document.querySelector('#compat-radius'))document.querySelector('#compat-radius').value=urlParams.get('radius');

load().then(()=>{
  if((urlParams.get('q')||urlParams.get('talent'))&&urlParams.get('cityQuery')){
    runCompatibilitySimulator(urlParams.get('talent')||'');
  }
});
