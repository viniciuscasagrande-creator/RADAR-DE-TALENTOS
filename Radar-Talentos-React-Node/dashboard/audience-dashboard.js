'use strict';
const $=id=>document.getElementById(id),form=$('filters'),field=n=>form.elements.namedItem(n),fmt=n=>Number(n).toLocaleString('pt-BR');
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
async function get(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||`Consulta indisponível (HTTP ${r.status})`);return r.json()}
function options(select,rows,blank){const old=select.value;select.replaceChildren(new Option(blank,''),...rows.map(r=>new Option(r.name,r.id)));if([...select.options].some(o=>o.value===old))select.value=old}
function table(id,headers,rows){const target=$(id);if(!rows.length){target.replaceChildren(el('p','Nenhum registro neste recorte.'));return}const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');for(const row of rows){const tr=el('tr');for(const v of row){const td=el('td');td.append(v instanceof Node?v:document.createTextNode(String(v??'—')));tr.append(td)}body.append(tr)}t.append(body);target.replaceChildren(t)}
function bars(id,rows){const target=$(id);target.replaceChildren();if(!rows.length){target.append(el('p','Sem registros.'));return}const max=Math.max(1,...rows.map(r=>r.value));for(const r of rows){const line=el('div');line.className='bar';const p=el('progress');p.max=max;p.value=r.value;line.append(el('span',r.name),p,el('span',fmt(r.value)));target.append(line)}}
let geo=null,mods=[],catalog=[],categoryCatalog=[],catalogTotal=null,selected=new Set(),request=0,offset=0,total=0;const regions=['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'];
const regionUF={Norte:'AC AM AP PA RO RR TO',Nordeste:'AL BA CE MA PB PE PI RN SE','Centro-Oeste':'DF GO MS MT',Sudeste:'ES MG RJ SP',Sul:'PR RS SC'};
const allUF=Object.values(regionUF).join(' ').split(' ').sort();
options(field('region'),regions.map(name=>({name,id:name})),'Brasil inteiro');
function updateUF(){const list=regionUF[field('region').value]?.split(' ')??allUF;options(field('uf'),list.map(name=>({name,id:name})),'Todos');}
updateUF();
function subs(){options(field('submodality'),mods.filter(m=>!field('modality').value||field('modality').value===m.id).flatMap(m=>m.submodalities.map(s=>({id:String(s.id),name:m.name+' / '+s.name}))),'Todas')}
const normalize=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();

function matchCityByText(raw,requireCoords=false){
 const q=normalize(raw).replace(/[\/,-]+/g,' ').replace(/\s+/g,' ').trim();
 if(!q)return null;
 const r=field('region').value,u=field('uf').value;
 const pool=catalog.filter(c=>(!requireCoords||c.lat!=null)&&(!r||c.region===r)&&(!u||c.uf===u));
 const exactFull=pool.find(c=>normalize(`${c.name} / ${c.uf}`).replace(/[\/,-]+/g,' ').replace(/\s+/g,' ')===q||normalize(`${c.name} ${c.uf}`)===q||c.code===q);
 if(exactFull)return exactFull;
 const exactName=pool.find(c=>normalize(c.name)===q);
 if(exactName)return exactName;
 const globalExact=catalog.find(c=>(!requireCoords||c.lat!=null)&&(normalize(`${c.name} / ${c.uf}`).replace(/[\/,-]+/g,' ').replace(/\s+/g,' ')===q||normalize(`${c.name} ${c.uf}`)===q||normalize(c.name)===q));
 if(globalExact)return globalExact;
 return pool.find(c=>normalize(c.name).startsWith(q))||pool.find(c=>normalize(c.name).includes(q))||null;
}

function updateMunicipalityDatalist(queryText=''){
 const dl=$('municipality-datalist');
 if(!dl)return;
 const q=normalize(queryText).replace(/[\/,-]+/g,' ').trim();
 const r=field('region').value,u=field('uf').value;
 const matches=catalog.filter(c=>(!r||c.region===r)&&(!u||c.uf===u)&&(!q||normalize(`${c.name} ${c.uf}`).includes(q)||c.code===q)).slice(0,250);
 dl.replaceChildren(...matches.map(c=>{const o=document.createElement('option');o.value=`${c.name} / ${c.uf}`;return o;}));
}

function filterCities(){
 const raw=$('city-search').value.trim();
 const q=normalize(raw),r=field('region').value,u=field('uf').value;
 const rows=catalog.filter(c=>(!r||c.region===r)&&(!u||c.uf===u)&&(!q||normalize(`${c.name} / ${c.uf}`).includes(q)||normalize(c.name).includes(q)||c.code===q));
 options(field('city'),rows.map(c=>({id:c.code,name:c.name+' / '+c.uf})),'Todos');
 updateMunicipalityDatalist(raw);
 const exact=catalog.find(c=>normalize(`${c.name} / ${c.uf}`)===q);
 if(exact){
  $('city-search').value='';
  filterCities();
  chooseCity(exact.code);
 }
}

function filterCenters(){
 const raw=$('center-search').value.trim();
 const q=normalize(raw);
 const rows=catalog.filter(c=>c.lat!=null&&(!q||normalize(`${c.name} / ${c.uf}`).includes(q)||normalize(c.name).includes(q)||c.code===q||selected.has(c.code)));
 options(field('center'),rows.map(c=>({id:c.code,name:c.name+' / '+c.uf})),'Sem raio');
 updateMunicipalityDatalist(raw);
 const exact=catalog.find(c=>c.lat!=null&&normalize(`${c.name} / ${c.uf}`)===q);
 if(exact){
  field('center').value=exact.code;
  if(!field('radius').value||Number(field('radius').value)<=0){
   field('radius').value='100';
   $('radius-slider').value='100';
  }
  search();
 }
}

function selectedChips(){const box=$('selected-cities');box.replaceChildren();for(const code of selected){const c=catalog.find(x=>x.code===code);const b=el('button',(c?c.name+' / '+c.uf:code)+' ×');b.type='button';b.setAttribute('aria-label','Remover '+(c?.name??code));b.addEventListener('click',()=>{selected.delete(code);selectedChips();search()});box.append(b);}}
function clearCities(){selected.clear();field('city').value='';$('city-search').value='';selectedChips();}
function chooseState(uf){const r=Object.keys(regionUF).find(r=>regionUF[r].split(' ').includes(uf))??'';field('region').value=r;updateUF();field('uf').value=uf;clearCities();filterCities();search()}
function chooseCity(code){if(selected.has(code))selected.delete(code);else if(selected.size<100)selected.add(code);else{ $('message').textContent='Selecione até 100 municípios ou use região, estado ou raio.';field('city').value='';return;}field('city').value='';selectedChips();search()}
field('region').addEventListener('change',()=>{updateUF();clearCities();filterCities();search()});field('uf').addEventListener('change',()=>{clearCities();filterCities();search()});
field('city').addEventListener('change',()=>{if(field('city').value)chooseCity(field('city').value)});
$('city-search').addEventListener('input',filterCities);
$('city-search').addEventListener('keydown',e=>{
 if(e.key==='Enter'){
  e.preventDefault();
  const m=matchCityByText($('city-search').value,false);
  if(m){$('city-search').value='';filterCities();chooseCity(m.code);}
 }
});
$('center-search').addEventListener('input',filterCenters);
$('center-search').addEventListener('keydown',e=>{
 if(e.key==='Enter'){
  e.preventDefault();
  const m=matchCityByText($('center-search').value,true);
  if(m){
   $('center-search').value=`${m.name} / ${m.uf}`;
   filterCenters();
   field('center').value=m.code;
   if(!field('radius').value||Number(field('radius').value)<=0){field('radius').value='100';$('radius-slider').value='100';}
   search();
  }
 }
});
$('clear-territory').addEventListener('click',()=>{field('region').value='';updateUF();field('uf').value='';field('center').value='';$('center-search').value='';field('radius').value='';$('radius-slider').value=0;clearCities();filterCities();filterCenters();search()});
field('modality').addEventListener('change',()=>{field('submodality').value='';subs();search()});
for(const key of ['submodality','category','talent'])field(key).addEventListener('change',searchOnChange);
function searchOnChange(){
 if($('artist-quick-search')){
  const opt=field('talent').selectedOptions?.[0];
  $('artist-quick-search').value=field('talent').value&&opt?opt.textContent:'';
 }
 search();
}

// Busca rápida de artistas no topo do painel
function applyQuickArtistSearch(){
 const input=$('artist-quick-search');
 if(!input)return;
 const q=normalize(input.value);
 if(!q){
  field('talent').value='';
  search();
  return;
 }
 const opts=[...field('talent').options].filter(o=>o.value);
 const exact=opts.find(o=>normalize(o.textContent)===q||normalize(o.value)===q);
 const starts=exact||opts.find(o=>normalize(o.textContent).startsWith(q));
 const tokens=q.split(/\s+/).filter(Boolean);
 const partial=starts||opts.find(o=>normalize(o.textContent).includes(q))||opts.find(o=>{const tn=normalize(o.textContent);return tokens.length>1&&tokens.every(t=>tn.includes(t));});
 if(partial){
  field('talent').value=partial.value;
  input.value=partial.textContent;
  search();
 }else{
  $('message').textContent=`Artista "${input.value.trim()}" sem registros neste relatório; tente outra mídia ou período.`;
 }
}
$('artist-quick-btn')?.addEventListener('click',applyQuickArtistSearch);
$('artist-quick-search')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyQuickArtistSearch();}});
$('artist-quick-search')?.addEventListener('change',()=>{
 const q=normalize($('artist-quick-search').value);
 if(!q&&field('talent').value){
  applyQuickArtistSearch();
  return;
 }
 if([...field('talent').options].some(o=>o.value&&normalize(o.textContent)===q)){
  applyQuickArtistSearch();
 }
});

// Lógica opcional de raio: "Sem raio" (vazio ou 0) nunca bloqueia a consulta
field('center').addEventListener('change',()=>{
 if(!field('center').value){
  field('radius').value='';
  $('radius-slider').value=0;
  $('center-search').value='';
 }else if(!field('radius').value||Number(field('radius').value)<=0){
  field('radius').value='100';
  $('radius-slider').value=100;
 }
 search();
});
field('radius').addEventListener('change',()=>{
 const num=Number(field('radius').value);
 if(field('radius').value===''||!Number.isFinite(num)||num<=0){
  field('radius').value='';
  $('radius-slider').value=0;
  field('center').value='';
  search();
  return;
 }
 if(!field('center').value){
  const m=matchCityByText($('center-search').value,true)||(selected.size===1?catalog.find(c=>c.code===[...selected][0]&&c.lat!=null):null);
  if(m)field('center').value=m.code;
 }
 if(field('center').value)search();
 else $('message').textContent='Digite ou escolha a cidade centro do raio (ou deixe Raio vazio para Sem raio).';
});
$('radius-slider').addEventListener('change',()=>{
 const num=Number($('radius-slider').value);
 if(!num||num<=0){
  field('radius').value='';
  field('center').value='';
  search();
  return;
 }
 field('radius').value=String(num);
 if(!field('center').value){
  const m=matchCityByText($('center-search').value,true)||(selected.size===1?catalog.find(c=>c.code===[...selected][0]&&c.lat!=null):null);
  if(m)field('center').value=m.code;
 }
 if(field('center').value)search();
 else $('message').textContent='Digite ou escolha a cidade centro do raio (ou volte o controle para 0 / Sem raio).';
});

function categoryCards(rows,scope,grand=null){const k=$('kpis');k.replaceChildren();$('category-scope').textContent=scope;const byId=new Map(rows.map(r=>[String(r.id),r.value]));const all=el('button');all.className='kpi';all.type='button';all.setAttribute('aria-pressed',String(!field('category').value));all.append(el('span','Total de talentos'),el('strong',grand==null?'—':fmt(grand)));if(scope.startsWith('Talentos com')&&catalogTotal!=null)all.append(el('small','Cadastro nacional: '+fmt(catalogTotal)));all.addEventListener('click',()=>{field('category').value='';search()});k.append(all);for(const c of categoryCatalog){const b=el('button');b.type='button';b.className='kpi';b.setAttribute('aria-pressed',String(field('category').value===String(c.id)));b.append(el('span',c.name),el('strong',byId.has(String(c.id))?fmt(byId.get(String(c.id))):'—'));if(scope.startsWith('Talentos com'))b.append(el('small','Cadastro nacional: '+fmt(c.value)));b.addEventListener('click',()=>{field('category').value=field('category').value===String(c.id)?'':String(c.id);search()});k.append(b);}}
function svg(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}
const project=([lon,lat])=>[20+(lon+75)*15,20+(6-lat)*13];
function map(r){const target=$('map');target.replaceChildren();const note=el('p',geo?.states?'Mapa da Base Geográfica Nacional com divisas municipais (use o scroll do mouse para zoom).':'Malha territorial não carregada. Execute a sincronização geográfica.');note.textContent+=` ${fmt(geo?.total??0)} municípios cadastrados; ${fmt(geo?.coordinates??0)} com coordenadas.`;target.append(note);const s=svg('svg',{viewBox:'0 0 680 570',role:'img','aria-label':'Mapa nacional de audiência'});if(typeof window.renderRadarMunicipalMesh==='function'&&geo?.municipalities?.length){window.renderRadarMunicipalMesh(s,target,geo,{...r,uf:field('uf').value,explicitCities:[...selected]},m=>chooseCity(m.code),uf=>chooseState(uf));}else{const values=new Map(r.byState.map(x=>[x.name,x.value])),max=Math.max(1,...values.values());for(const f of geo?.states?.features??[]){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;const d=polys.flatMap(poly=>poly.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(' ')).join(' ')+'Z')).join(' '),uf=f.properties.uf,v=values.get(uf);const p=svg('path',{d,tabindex:'0',role:'button','aria-label':'Selecionar estado '+uf,fill:v?`rgba(168,85,247,${.18+.72*v/max})`:'#303036',stroke:'#71717a','fill-rule':'evenodd'});p.addEventListener('click',()=>chooseState(uf));p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseState(uf)}});s.append(p)}const chosen=geo?.states?.features?.find(f=>f.properties.uf===field('uf').value);if(chosen){const rings=chosen.geometry.type==='Polygon'?chosen.geometry.coordinates:chosen.geometry.coordinates.flat();const points=rings.flat().map(project);if(points.length){const [x,y,maxX,maxY]=points.reduce(([x,y,X,Y],[a,b])=>[Math.min(x,a),Math.min(y,b),Math.max(X,a),Math.max(Y,b)],[Infinity,Infinity,-Infinity,-Infinity]),w=maxX-x,h=maxY-y,pad=8;s.setAttribute('viewBox',[x-pad,y-pad,Math.max(20,w+pad*2),Math.max(20,h+pad*2)].join(' '));}}if(r.origin){const a=r.origin.lat*Math.PI/180,b=r.origin.lon*Math.PI/180,d=r.radius/6371;const points=Array.from({length:97},(_,i)=>{const t=i/96*2*Math.PI,lat=Math.asin(Math.sin(a)*Math.cos(d)+Math.cos(a)*Math.sin(d)*Math.cos(t)),lon=b+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(a),Math.cos(d)-Math.sin(a)*Math.sin(lat));return project([lon*180/Math.PI,lat*180/Math.PI]).join(',')}).join(' ');s.append(svg('polygon',{points,fill:'#a855f722',stroke:'#d8b4fe','stroke-dasharray':'5 4'}));}}const maxCity=Math.max(1,...r.places.map(p=>p.value)),valuesByCity=new Map(r.places.map(p=>[p.code,p]));const uf=field('uf').value,region=field('region').value;const pointRows=new Map(r.places.map(p=>[p.code,p]));for(const c of catalog){if(c.lat!=null&&(selected.has(c.code)||uf&&c.uf===uf||!uf&&region&&c.region===region))pointRows.set(c.code,valuesByCity.get(c.code)||c);}for(const p of pointRows.values()){if(p.lat==null)continue;const [cx,cy]=project([p.lon,p.lat]),value=valuesByCity.get(p.code)?.value,c=svg('circle',{cx,cy,r:value==null?2.5:3+12*Math.sqrt(value/maxCity),fill:value==null?'#71717a':'#eab308',stroke:selected.has(p.code)?'#fff':value==null?'#a1a1aa':'#fef08a','fill-opacity':value==null?.65:.75,class:'municipality-point',tabindex:'0',role:'button','aria-pressed':String(selected.has(p.code)),'aria-label':p.name+' / '+p.uf});const t=svg('title');t.textContent=p.name+' / '+p.uf+': '+(value==null?'Sem registro':fmt(value));c.append(t);c.addEventListener('click',()=>chooseCity(p.code));c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseCity(p.code)}});s.append(c)}target.insertBefore(s,target.querySelector('.radius-summary'))}
function selectionSummary(r){const rows=[...selected].map(code=>{const c=catalog.find(x=>x.code===code);const place=r?.places.find(x=>x.code===code);return [c?c.name+' / '+c.uf:code,place?fmt(place.value):'Sem dados']});const known=r?.places.filter(p=>selected.has(p.code))??[];if(selected.size)rows.push(['Total observado ('+known.length+' de '+selected.size+' cidades)',known.length?fmt(known.reduce((a,b)=>a+b.value,0)):'Sem dados']);table('selection-summary',['Município','Valor observado'],rows);}

const names={views:'Visualizações',followers:'Seguidores',reach:'Alcance',listeners:'Ouvintes',streams:'Reproduções',subscribers:'Inscritos'};let reports=[],activeReports=[],reportSeq=0;
function params(){const r=activeReports[Number(field('report').value)];if(!r||field('report').value==='')return null;return new URLSearchParams({network:r.network,metric:r.metric,start:r.period_start,end:r.period_end,source:r.source,quality:r.quality});}
async function reportChanged(){
 const seq=++reportSeq;request++;const p=params();field('talent').replaceChildren(new Option('Todos com dados',''));
 if(p){
  try{
   const rows=await get('/api/regional/talents?'+p);
   if(seq!==reportSeq)return;
   options(field('talent'),rows,'Todos com dados');
   const dl=$('talent-datalist');
   if(dl)dl.replaceChildren(...rows.map(r=>{const o=document.createElement('option');o.value=r.name;return o;}));
  }catch(e){
   if(seq===reportSeq)$('message').textContent=e.message;
   return;
  }
 }
 if(seq===reportSeq)await search();
}
function metricChanged(){activeReports=reports.filter(r=>r.network===field('network').value&&(!field('metric').value||r.metric===field('metric').value)&&(!field('days').value||(Date.parse(r.period_end)-Date.parse(r.period_start))/86400000+1===Number(field('days').value)));field('report').replaceChildren(...activeReports.map((r,i)=>new Option(`${names[r.metric]??r.metric} · ${r.period_start} a ${r.period_end} · ${r.source} · ${r.quality==='verified'?'Verificado':'Estimado'}`,String(i))));if(!activeReports.length)field('report').append(new Option('Nenhum relatório disponível',''));return reportChanged();}
function networkChanged(){const keys=[...new Set(reports.filter(r=>r.network===field('network').value).map(r=>r.metric))];options(field('metric'),keys.map(id=>({id,name:names[id]??id})),'Todos disponíveis');if(keys.includes('views'))field('metric').value='views';else if(field('network').value==='Spotify'&&keys.includes('listeners'))field('metric').value='listeners';else if(field('network').value==='Spotify'&&keys.includes('streams'))field('metric').value='streams';else if(field('network').value==='Instagram'&&keys.includes('followers'))field('metric').value='followers';else if(keys[0])field('metric').value=keys[0];return metricChanged();}
async function loadReports(){reports=await get('/api/regional/reports');table('coverage',['Mídia','Métrica','Início','Fim','Fonte','Qualidade','Registros','Artistas'],reports.map(r=>[r.network,names[r.metric]??r.metric,r.period_start,r.period_end,r.source,r.quality==='verified'?'Verificado':'Estimado',r.records,r.talents]));await networkChanged();}

async function search(keepPage=false){
 if(!keepPage)offset=0;
 const n=++request,p=params();
 // Se o usuário digitou um município em #city-search e clicou em Consultar, aplica-o automaticamente
 if($('city-search')?.value.trim()){
  const typedCity=matchCityByText($('city-search').value,false);
  if(typedCity){
   selected.add(typedCity.code);
   $('city-search').value='';
   selectedChips();
  }
 }
 const rawRadius=field('radius').value.trim();
 const numRadius=rawRadius===''?0:Number(rawRadius);
 const hasActiveRadius=Number.isFinite(numRadius)&&numRadius>0;
 if(!hasActiveRadius){
  // "Sem raio": limpa qualquer valor 0 ou centro pendente sem jamais bloquear a consulta
  field('radius').value='';
  if($('radius-slider'))$('radius-slider').value='0';
  if(!field('center').value)$('center-search').value='';
 }else if(!field('center').value){
  const autoCenter=matchCityByText($('center-search').value,true)||(selected.size===1?catalog.find(c=>c.code===[...selected][0]&&c.lat!=null):null);
  if(autoCenter){
   field('center').value=autoCenter.code;
  }else{
   // Se "Sem raio" estiver selecionado no select de centro e não houver cidade centro digitada, realiza a consulta sem restrição de raio
   field('radius').value='';
   if($('radius-slider'))$('radius-slider').value='0';
  }
 }
 const k=$('audience-kpis');
 if(!p){
  $('message').textContent='Consultando indicadores nacionais. Audiência por município exige relatório regional verificado…';
  k.replaceChildren();
  categoryCards(categoryCatalog,'Cadastro nacional de talentos — indicadores consolidados das 4 mídias e presença territorial',catalogTotal);
  selectionSummary(null);
  try{
   const cp=new URLSearchParams({limit:'200'});
   for(const key of ['talent','category','modality'])if(field(key)?.value)cp.set(key,field(key).value);
   const qInput=$('artist-quick-search')?.value?.trim()||'';
   if(qInput&&!field('talent').value)cp.set('q',qInput);
   const cross=await get('/api/radar/cross-summary?'+cp);
   if(n!==request)return;
   if(field('talent').options.length<=1&&cross.items?.length){
    options(field('talent'),cross.items.map(t=>({id:t.id,name:t.name})),'Todos com dados');
    const dl=$('talent-datalist');
    if(dl)dl.replaceChildren(...cross.items.map(r=>{const o=document.createElement('option');o.value=r.name;return o;}));
   }
   for(const [label,value] of [
    ['Talentos no recorte',cross.total],
    ['Com estatísticas verificadas',cross.counts?.withCollectedMetrics??0],
    ['Perfis oficiais vinculados',cross.counts?.withOfficialProfiles??0],
    ['Registros de Audiência por Cidade',cross.counts?.regionalRecords??0]
   ]){
    const box=el('div');box.className='kpi';box.append(el('span',label),el('strong',fmt(value)));k.append(box);
   }
   const pageItems=(cross.items||[]).slice(offset,offset+100);
   table('artists',['Artista','Instagram','Spotify','YouTube','TikTok','Audiência por Cidade'],pageItems.map(a=>{
    const b=el('button',a.name);b.type='button';b.className='link';
    b.addEventListener('click',()=>{location.href='/commercial.html?q='+encodeURIComponent(a.name);});
    const cellFor=net=>{
     const m=a.media?.[net];
     if(!m||m.value==null)return '—';
     if(m.url){
      const link=el('a',m.statusLabel);link.href=m.url;link.target='_blank';link.rel='noopener noreferrer';
      link.title=m.detailLabel||m.url;
      return link;
     }
     return m.statusLabel;
    };
    return [b,cellFor('Instagram'),cellFor('Spotify'),cellFor('YouTube'),cellFor('TikTok'),a.regionalAudience?.hasData?a.regionalAudience.statusLabel:'Aguardando dados verificados'];
   }));
   const growingRows=[];
   for(const a of (cross.items||[])){
    for(const net of ['Instagram','Spotify','YouTube','TikTok']){
     const m=a.media?.[net];
     if(m?.growth!=null){
      growingRows.push([a.name,net,m.growth_pct!=null?`+${m.growth_pct.toFixed(1)}% (+${fmt(m.growth)})`:`+${fmt(m.growth)}`,m.formatted]);
     }
    }
   }
   $('growth-period').textContent=growingRows.length?'Evolução verificada nas mídias (Instagram, Spotify, YouTube e TikTok · janela de 30 dias):':'Aguardando relatório regional ou segunda coleta para cálculo de evolução.';
   table('growth',['Artista','Mídia','Variação (30d)','Atual'],growingRows.slice(0,50));
   // Sem relatório regional selecionado não há base válida para um mapa de audiência.
   // A demografia IBGE é contexto externo e nunca pode ocupar este gráfico.
   bars('regions',[]);
   bars('states',[]);
   bars('cities',[]);
   bars('region-artists',[]);
   total=cross.total||0;
   $('page').textContent=total?`${offset+1}–${Math.min(offset+100,total)} de ${total}`:'Sem dados';
   $('prev').disabled=offset===0;
   $('next').disabled=offset+100>=total;
   map({byState:[],places:[]});
   $('message').textContent='Audiência municipal ainda não disponível neste recorte. Selecione um relatório regional verificado para mostrar cidades, regiões e mapa de audiência. Os indicadores nacionais de mídia acima não representam distribuição municipal. Dados demográficos do IBGE não são audiência.';
  }catch{
   $('message').textContent='Nenhum relatório municipal disponível para esta mídia. Importe uma fonte autorizada.';
   table('artists',[],[]);
   map({byState:[],places:[]});
  }
  return;
 }
 $('message').textContent='Consultando…';
 try{
  for(const key of ['talent','category','modality','submodality','region','uf'])if(field(key).value!=='')p.set(key,field(key).value);
  if(field('center').value&&field('radius').value&&Number(field('radius').value)>0){
   p.set('center',field('center').value);
   p.set('radius',field('radius').value);
  }
  for(const code of selected)p.append('cities',code);
  p.set('limit','100');
  p.set('offset',String(offset));
  const r=await get('/api/regional/ranking?'+p);
  if(n!==request)return;
  const count=r.places.reduce((a,b)=>a+b.value,0);
  categoryCards(r.categories||[],'Talentos com registros no recorte / relatório selecionado (antes da categoria selecionada)',r.scopeTotal);
  selectionSummary(r);
  table('growth',['Artista','Variação','Anterior','Atual'],(r.growthLeaders||[]).map(a=>[a.name,a.growth_pct==null?`${fmt(a.growth)} (variação absoluta)`: `${a.growth_pct.toFixed(1)}%`,fmt(a.previous_value),fmt(a.value)]));
  $('growth-period').textContent=r.growthLeaders?.length?`Comparação com ${r.growthLeaders[0].previous_start} a ${r.growthLeaders[0].previous_end}; ${r.comparableCount} artistas com municípios comparáveis.`:'Sem período anterior comparável nesta fonte, métrica e território.';
  const radiusLabel=(field('center').value&&field('radius').value&&Number(field('radius').value)>0)?`Raio de ${field('radius').value} km aplicado. `:'Consulta sem restrição de raio. ';
  $('message').textContent=(r.total?'Dados do relatório selecionado. ':'Nenhum registro neste recorte. ')+radiusLabel+r.notice+(r.excludedCoordinates?` ${r.excludedCoordinates} registros sem coordenadas foram excluídos do raio.`:'');
  k.replaceChildren();
  for(const [label,value] of [[names[r.metric]??r.metric,count],['Artistas com dados',r.total],['Municípios com dados',r.places.length]]){
   const box=el('div');box.className='kpi';box.append(el('span',label),el('strong',r.total?fmt(value):'—'));k.append(box);
  }
  bars('regions',r.byRegion);
  bars('region-artists',r.byRegionTalent||[]);
  bars('states',r.byState);
  bars('cities',r.places.slice(0,30).map(x=>({name:x.name+' / '+x.uf,value:x.value})));
  table('artists',['Posição','Artista','Valor','Municípios'],r.items.map(a=>{
   const b=el('button',a.name);b.type='button';b.className='link';
   b.addEventListener('click',()=>{field('talent').value=a.id;if($('artist-quick-search'))$('artist-quick-search').value=a.name;search()});
   return[a.rank,b,fmt(a.value),a.cities];
  }));
  total=r.total;
  $('page').textContent=total?`${offset+1}–${Math.min(offset+100,total)} de ${total}`:'Sem dados';
  $('prev').disabled=offset===0;
  $('next').disabled=offset+100>=total;
  map(r);
 }catch(e){
  if(n===request)$('message').textContent=e.message+' — resultados anteriores não atualizados.';
 }
}
form.addEventListener('submit',e=>{e.preventDefault();search()});field('network').addEventListener('change',networkChanged);field('report').addEventListener('change',reportChanged);field('days').addEventListener('change',metricChanged);field('metric').addEventListener('change',metricChanged);$('radius-slider').addEventListener('input',()=>{const v=Number($('radius-slider').value);field('radius').value=v>0?String(v):'';});field('radius').addEventListener('input',()=>{const v=Number(field('radius').value);$('radius-slider').value=Number.isFinite(v)&&v>0?String(v):'0';});$('reload').addEventListener('click',()=>loadReports().catch(e=>$('message').textContent=e.message));$('prev').addEventListener('click',()=>{offset=Math.max(0,offset-100);search(true)});$('next').addEventListener('click',()=>{if(offset+100<total){offset+=100;search(true)}});
(async()=>{try{let cats,municipal;[mods,geo,cats,municipal]=await Promise.all([get('/api/radar/modalities'),get('/api/radar/geography'),get('/api/regional/categories'),get('/api/radar/municipalities')]);categoryCatalog=cats.categories;catalogTotal=cats.total;catalog=municipal.items;options(field('category'),categoryCatalog.map(c=>({id:String(c.id),name:c.name})),'Todas');options(field('modality'),mods,'Todas');subs();filterCities();filterCenters();categoryCards(categoryCatalog,'Cadastro nacional de talentos',catalogTotal);await loadReports()}catch(e){$('message').textContent=e.message}})();
