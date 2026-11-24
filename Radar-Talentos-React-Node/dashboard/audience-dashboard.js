'use strict';
const $=id=>document.getElementById(id),form=$('filters'),field=n=>form.elements.namedItem(n),fmt=n=>Number(n).toLocaleString('pt-BR');
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
async function get(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||`Consulta indisponível (HTTP ${r.status})`);return r.json()}
function options(select,rows,blank){const old=select.value;select.replaceChildren(new Option(blank,''),...rows.map(r=>new Option(r.name,r.id)));if([...select.options].some(o=>o.value===old))select.value=old}
function table(id,headers,rows){const target=$(id);if(!rows.length){target.replaceChildren(el('p','Nenhum registro neste recorte.'));return}const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');for(const row of rows){const tr=el('tr');for(const v of row){const td=el('td');td.append(v instanceof Node?v:document.createTextNode(String(v??'—')));tr.append(td)}body.append(tr)}t.append(body);target.replaceChildren(t)}
function bars(id,rows,onClickRow=null,suffix=''){const target=$(id);if(!target)return;target.replaceChildren();if(!rows.length){target.append(el('p','Sem registros.'));return}const max=Math.max(1,...rows.map(r=>r.value));for(const r of rows){const line=el('div');line.className=onClickRow?'bar interactive-bar':'bar';const p=el('progress');p.max=max;p.value=r.value;line.append(el('span',r.name),p,el('span',fmt(r.value)+suffix));if(onClickRow){line.title='Clique para focar no mapa: '+r.name;line.addEventListener('click',()=>onClickRow(r));}target.append(line)}}
let geo=null,mods=[],catalog=[],categoryCatalog=[],catalogTotal=null,demographicsData={items:[],byRegion:[]},lastCrossItems=[],mapLayerMode='operational',inspectorSeq=0,selected=new Set(),request=0,offset=0,total=0;const regions=['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'];
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
function chooseCity(code,autoActivateRadius=true){
 const wasSelected=selected.has(code);
 if(wasSelected){
  selected.delete(code);
  if(field('center').value===code&&!selected.size){
   field('center').value='';
   $('center-search').value='';
   field('radius').value='';
   if($('radius-slider'))$('radius-slider').value='0';
  }
 }else if(selected.size<100){
  selected.add(code);
  const cityObj=catalog.find(c=>c.code===code);
  if(autoActivateRadius&&cityObj?.lat!=null){
   $('center-search').value=`${cityObj.name} / ${cityObj.uf}`;
   filterCenters();
   field('center').value=cityObj.code;
   if(!field('radius').value||Number(field('radius').value)<=0){
    field('radius').value='100';
    if($('radius-slider'))$('radius-slider').value='100';
   }
  }
 }else{
  $('message').textContent='Selecione até 100 municípios ou use região, estado ou raio.';
  field('city').value='';
  return;
 }
 field('city').value='';
 selectedChips();
 updateQuickHubsHighlight();
 search();
}
function focusCommercialHub(code,radiusKm=100){
 const cityObj=catalog.find(c=>c.code===String(code));
 if(!cityObj)return;
 selected.clear();
 selected.add(cityObj.code);
 field('region').value=cityObj.region||'';
 updateUF();
 field('uf').value=cityObj.uf||'';
 filterCities();
 $('center-search').value=`${cityObj.name} / ${cityObj.uf}`;
 filterCenters();
 field('center').value=cityObj.code;
 field('radius').value=String(radiusKm);
 if($('radius-slider'))$('radius-slider').value=String(radiusKm);
 selectedChips();
 updateQuickHubsHighlight();
 search();
}
function renderQuickHubsBar(){
 const host=$('map-quick-hubs');
 if(!host)return;
 host.replaceChildren();
 const topHubs=(demographicsData?.items||[]).slice(0,8);
 for(const h of topHubs){
  const btn=el('button',`📍 ${h.name}/${h.uf}`);
  btn.type='button';
  btn.className='hub-quick-pill';
  btn.dataset.hubCode=String(h.code);
  btn.setAttribute('aria-pressed',String(field('center').value===String(h.code)||selected.has(String(h.code))));
  btn.title=`Ativar bacia comercial de 100 km em ${h.name}/${h.uf} (Pop.: ${fmt(h.population)} · PIB/hab: R$ ${fmt(Math.round(h.pib_per_capita||0))})`;
  btn.addEventListener('click',()=>focusCommercialHub(h.code,100));
  host.append(btn);
 }
}
function updateQuickHubsHighlight(){
 for(const btn of document.querySelectorAll('.hub-quick-pill[data-hub-code]')){
  const code=btn.dataset.hubCode;
  btn.setAttribute('aria-pressed',String(field('center').value===code||selected.has(code)));
 }
}
for(const btn of document.querySelectorAll('.map-mode-btn[data-map-layer]')){
 btn.addEventListener('click',()=>{
  mapLayerMode=btn.dataset.mapLayer||'operational';
  for(const b of document.querySelectorAll('.map-mode-btn[data-map-layer]')){
   b.setAttribute('aria-pressed',String(b===btn));
  }
  search(true);
 });
}
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
$('clear-territory').addEventListener('click',()=>{field('region').value='';updateUF();field('uf').value='';field('center').value='';$('center-search').value='';field('radius').value='';$('radius-slider').value=0;clearCities();filterCities();filterCenters();updateQuickHubsHighlight();search()});
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
function useArtistMapAutoMode(){
 // A busca simples do artista deve ignorar a seleção anterior de relatório.
 const select=field('report');
 if(![...select.options].some(o=>o.value==='')){
  select.add(new Option('Automático: relatório por artista',''),0);
 }
 select.value='';
}
async function applyQuickArtistSearch(){
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
  useArtistMapAutoMode();
  search();
  return;
 }
 // A busca global não deve depender de um relatório regional já selecionado.
 try{
  const cp=new URLSearchParams({q:input.value.trim(),limit:'200'});
  const results=await get('/api/radar/cross-summary?'+cp);
  if(normalize(input.value)!==q)return;
  const artist=results.items?.find(a=>normalize(a.name)===q||normalize(a.id)===q)
    ||results.items?.find(a=>normalize(a.name).includes(q));
  if(!artist){
   $('message').textContent=`Artista "${input.value.trim()}" não encontrado no cadastro do Radar.`;
   return;
  }
  if(![...field('talent').options].some(o=>o.value===artist.id)){
   field('talent').add(new Option(artist.name,artist.id));
  }
  field('talent').value=artist.id;
  input.value=artist.name;
  useArtistMapAutoMode();
  search();
 }catch(e){
  $('message').textContent='Não foi possível pesquisar o artista: '+e.message;
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

function categoryCards(rows,scope,grand=null){
 const k=$('kpis');k.replaceChildren();$('category-scope').textContent=scope;
 const byId=new Map(rows.map(r=>[String(r.id),r.value]));
 const all=el('button');all.className='kpi';all.type='button';all.setAttribute('aria-pressed',String(!field('category').value));
 all.append(
  el('span','Total de talentos'),
  el('strong',grand==null?'—':fmt(grand)),
  el('small',scope.startsWith('Talentos com')&&catalogTotal!=null?'Cadastro nacional: '+fmt(catalogTotal):'Catálogo nacional ativo')
 );
 all.addEventListener('click',()=>{field('category').value='';search()});
 k.append(all);
 for(const c of categoryCatalog){
  const b=el('button');b.type='button';b.className='kpi';b.setAttribute('aria-pressed',String(field('category').value===String(c.id)));
  const countVal=byId.has(String(c.id))?byId.get(String(c.id)):0;
  const pct=grand&&grand>0?Math.round(countVal/grand*100):0;
  b.append(
   el('span',c.name),
   el('strong',byId.has(String(c.id))?fmt(countVal):'—'),
   el('small',scope.startsWith('Talentos com')?'Cadastro nacional: '+fmt(c.value):`${pct}% do catálogo · Filtrar`)
  );
  b.addEventListener('click',()=>{field('category').value=field('category').value===String(c.id)?'':String(c.id);search()});
  k.append(b);
 }
}
function svg(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}
const project=([lon,lat])=>[20+(lon+75)*15,20+(6-lat)*13];

function buildOperationalMapPayload(baseR){
 const hasVerifiedPlaces=Boolean(baseR?.places?.length);
 const centerCode=field('center')?.value||'';
 const radiusKm=Number(field('radius')?.value||0);
 const centerCity=centerCode?catalog.find(c=>String(c.code)===String(centerCode)&&c.lat!=null):null;
 const origin=baseR?.origin||(centerCity&&radiusKm>0?{code:centerCity.code,name:centerCity.name,uf:centerCity.uf,region:centerCity.region,lat:centerCity.lat,lon:centerCity.lon}:null);
 const radius=baseR?.radius||(origin&&radiusKm>0?radiusKm:null);
 if(hasVerifiedPlaces||mapLayerMode==='verified'){
  return {...baseR,origin,radius,isOperationalFallback:false,hubs:[]};
 }
 const rFilter=field('region')?.value||'';
 const ufFilter=field('uf')?.value||'';
 const hubs=(demographicsData?.items||[]).filter(h=>(!rFilter||h.region===rFilter)&&(!ufFilter||h.uf===ufFilter));
 const stateTotals=new Map();
 for(const h of hubs){
  stateTotals.set(h.uf,(stateTotals.get(h.uf)||0)+(Number(h.population)||0));
 }
 const byState=[...stateTotals.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
 return {
  ...baseR,
  byState:baseR?.byState?.length?baseR.byState:byState,
  places:baseR?.places||[],
  origin,
  radius,
  isOperationalFallback:true,
  hubs
 };
}

function map(r){
 const enriched=buildOperationalMapPayload(r);
 const target=$('map');target.replaceChildren();
 const note=el('p',geo?.states?'Mapa da Base Geográfica Nacional com divisas municipais (use o scroll do mouse para zoom e clique em qualquer cidade para simular o raio comercial).':'Malha territorial não carregada. Execute a sincronização geográfica.');
 note.textContent+=` ${fmt(geo?.total??0)} municípios cadastrados; ${fmt(geo?.coordinates??0)} com coordenadas.`;
 target.append(note);
 const s=svg('svg',{viewBox:'0 0 680 570',role:'img','aria-label':'Mapa nacional de audiência'});
 if(typeof window.renderRadarMunicipalMesh==='function'&&geo?.municipalities?.length){
  window.renderRadarMunicipalMesh(s,target,geo,{...enriched,uf:field('uf').value,explicitCities:[...selected]},m=>chooseCity(m.code,true),uf=>chooseState(uf));
 }else{
  const values=new Map(enriched.byState.map(x=>[x.name,x.value])),max=Math.max(1,...values.values());
  for(const f of geo?.states?.features??[]){
   const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
   const d=polys.flatMap(poly=>poly.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(' ')).join(' ')+'Z')).join(' '),uf=f.properties.uf,v=values.get(uf);
   const p=svg('path',{d,tabindex:'0',role:'button','aria-label':'Selecionar estado '+uf,fill:v?`rgba(168,85,247,${.18+.72*v/max})`:'#303036',stroke:'#71717a','fill-rule':'evenodd'});
   p.addEventListener('click',()=>chooseState(uf));
   p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseState(uf)}});
   s.append(p);
  }
  const chosen=geo?.states?.features?.find(f=>f.properties.uf===field('uf').value);
  if(chosen){
   const rings=chosen.geometry.type==='Polygon'?chosen.geometry.coordinates:chosen.geometry.coordinates.flat();
   const points=rings.flat().map(project);
   if(points.length){
    const [x,y,maxX,maxY]=points.reduce(([x,y,X,Y],[a,b])=>[Math.min(x,a),Math.min(y,b),Math.max(X,a),Math.max(Y,b)],[Infinity,Infinity,-Infinity,-Infinity]),w=maxX-x,h=maxY-y,pad=8;
    s.setAttribute('viewBox',[x-pad,y-pad,Math.max(20,w+pad*2),Math.max(20,h+pad*2)].join(' '));
   }
  }
  if(enriched.origin){
   const a=enriched.origin.lat*Math.PI/180,b=enriched.origin.lon*Math.PI/180,d=enriched.radius/6371;
   const points=Array.from({length:97},(_,i)=>{const t=i/96*2*Math.PI,lat=Math.asin(Math.sin(a)*Math.cos(d)+Math.cos(a)*Math.sin(d)*Math.cos(t)),lon=b+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(a),Math.cos(d)-Math.sin(a)*Math.sin(lat));return project([lon*180/Math.PI,lat*180/Math.PI]).join(',')}).join(' ');
   s.append(svg('polygon',{points,fill:'#a855f722',stroke:'#d8b4fe','stroke-dasharray':'5 4'}));
  }
 }
 if(enriched.isOperationalFallback&&enriched.hubs?.length){
  const maxPop=Math.max(1,...enriched.hubs.map(h=>Number(h.population)||0));
  for(const h of enriched.hubs){
   if(h.lat==null||h.lon==null)continue;
   const [cx,cy]=project([h.lon,h.lat]);
   const isSelectedHub=selected.has(String(h.code))||field('center').value===String(h.code);
   const rad=isSelectedHub?7.5:3.8+6.5*Math.sqrt((Number(h.population)||0)/maxPop);
   const hubCircle=svg('circle',{
    cx,
    cy,
    r:rad.toFixed(1),
    fill:isSelectedHub?'#d946ef':'#00f0ff',
    stroke:isSelectedHub?'#ffffff':'#a855f7',
    'stroke-width':isSelectedHub?'2':'1.3',
    'fill-opacity':isSelectedHub?'0.92':'0.78',
    class:'ibge-hub-point',
    tabindex:'0',
    role:'button',
    'aria-label':`Polo comercial ${h.name} / ${h.uf}`
   });
   const t=svg('title');
   t.textContent=`Polo Comercial IBGE: ${h.name} / ${h.uf} (${h.region}) · População: ${fmt(h.population)} · PIB per capita: R$ ${fmt(Math.round(h.pib_per_capita||0))} · ${h.economic_profile||'Polo regional'} (clique para simular bacia de 100 km)`;
   hubCircle.append(t);
   hubCircle.addEventListener('click',e=>{e.stopPropagation();focusCommercialHub(h.code,100);});
   s.append(hubCircle);
  }
 }
 const maxCity=Math.max(1,...r.places.map(p=>p.value)),valuesByCity=new Map(r.places.map(p=>[p.code,p]));
 const uf=field('uf').value,region=field('region').value;
 const pointRows=new Map(r.places.map(p=>[p.code,p]));
 for(const c of catalog){if(c.lat!=null&&(selected.has(c.code)||uf&&c.uf===uf||!uf&&region&&c.region===region))pointRows.set(c.code,valuesByCity.get(c.code)||c);}
 for(const p of pointRows.values()){
  if(p.lat==null)continue;
  const [cx,cy]=project([p.lon,p.lat]),value=valuesByCity.get(p.code)?.value,c=svg('circle',{cx,cy,r:value==null?2.5:3+12*Math.sqrt(value/maxCity),fill:value==null?'#71717a':'#eab308',stroke:selected.has(p.code)?'#fff':value==null?'#a1a1aa':'#fef08a','fill-opacity':value==null?.65:.75,class:'municipality-point',tabindex:'0',role:'button','aria-pressed':String(selected.has(p.code)),'aria-label':p.name+' / '+p.uf});
  const t=svg('title');t.textContent=p.name+' / '+p.uf+': '+(value==null?'Sem registro':fmt(value));
  c.append(t);
  c.addEventListener('click',()=>chooseCity(p.code));
  c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseCity(p.code)}});
  s.append(c);
 }
 target.insertBefore(s,target.querySelector('.radius-summary'));
 renderTerritoryInspector(enriched);
}

function renderOperationalSidebars(artistMap){
 const hasVerified=Boolean(artistMap?.places?.length);
 if($('side-regions-title'))$('side-regions-title').textContent=hasVerified?'Audiência por região':'Potencial demográfico por região (Polos IBGE)';
 if($('side-artists-title'))$('side-artists-title').textContent=hasVerified?'Artistas por região':'PIB per capita médio por região (R$ · IBGE)';
 if($('side-states-title'))$('side-states-title').textContent=hasVerified?'Audiência por estado':'Polos comerciais por estado (População IBGE)';
 if($('detail-cities-title'))$('detail-cities-title').textContent=hasVerified?'Cidades com maior concentração':'Principais polos comerciais & capitais (IBGE · Clique para simular)';
 if(hasVerified||mapLayerMode==='verified'){
  bars('regions',artistMap?.byRegion||[]);
  bars('region-artists',artistMap?.byRegionTalent||[]);
  bars('states',artistMap?.byState||[]);
  bars('cities',(artistMap?.places||[]).slice(0,30).map(x=>({name:x.name+' / '+x.uf,value:x.value,code:x.code})),row=>{if(row.code)focusCommercialHub(row.code,100);});
  return;
 }
 const rFilter=field('region')?.value||'';
 const ufFilter=field('uf')?.value||'';
 const hubs=(demographicsData?.items||[]).filter(h=>(!rFilter||h.region===rFilter)&&(!ufFilter||h.uf===ufFilter));
 const regPop=(demographicsData?.byRegion||[]).filter(r=>!rFilter||r.region===rFilter).map(r=>({name:r.region,value:Number(r.population)||0}));
 const regPib=(demographicsData?.byRegion||[]).filter(r=>!rFilter||r.region===rFilter).map(r=>({name:r.region,value:Math.round(Number(r.avg_pib_per_capita)||0)}));
 const stMap=new Map();
 for(const h of hubs){stMap.set(h.uf,(stMap.get(h.uf)||0)+(Number(h.population)||0));}
 const stRows=[...stMap.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
 const cityRows=hubs.slice(0,30).map(h=>({name:`${h.name} / ${h.uf}`,value:Number(h.population)||0,code:h.code}));
 bars('regions',regPop,row=>{field('region').value=field('region').value===row.name?'':row.name;updateUF();clearCities();filterCities();search();},' hab');
 bars('region-artists',regPib,row=>{field('region').value=field('region').value===row.name?'':row.name;updateUF();clearCities();filterCities();search();});
 bars('states',stRows,row=>chooseState(row.name),' hab');
 bars('cities',cityRows,row=>{if(row.code)focusCommercialHub(row.code,100);},' hab');
}

function selectionSummary(r){
 const demByCode=new Map((demographicsData?.items||[]).map(d=>[String(d.code),d]));
 const rows=[...selected].map(code=>{
  const c=catalog.find(x=>x.code===code);
  const place=r?.places?.find(x=>x.code===code);
  const dem=demByCode.get(String(code));
  const label=c?`${c.name} / ${c.uf} (${c.region})`:code;
  const valText=place
   ?fmt(place.value)
   :dem
     ?`Pop. IBGE: ${fmt(dem.population)} · PIB/hab: R$ ${fmt(Math.round(dem.pib_per_capita||0))}`
     :`Bacia Regional (${c?.region||'Brasil'})`;
  const simBtn=el('button','⚡ Simular Show');
  simBtn.type='button';
  simBtn.className='secondary-button';
  simBtn.addEventListener('click',()=>focusCommercialHub(code,100));
  return [label,valText,simBtn];
 });
 const known=r?.places?.filter(p=>selected.has(p.code))??[];
 if(selected.size&&known.length){
  rows.push(['Total observado ('+known.length+' de '+selected.size+' cidades)',fmt(known.reduce((a,b)=>a+b.value,0)),'—']);
 }
 table('selection-summary',['Município / UF','Audiência / Potencial IBGE','Ação no Mapa'],rows);
}

async function renderTerritoryInspector(enrichedMap){
 const host=$('map-territory-inspector');
 if(!host)return;
 const seq=++inspectorSeq;
 const centerCode=field('center')?.value||([...selected][0]||'');
 const ufFilter=field('uf')?.value||'';
 const rFilter=field('region')?.value||'';
 const demItems=demographicsData?.items||[];
 const activeHub=
  (centerCode&&(demItems.find(d=>String(d.code)===String(centerCode))||catalog.find(c=>String(c.code)===String(centerCode))))||
  (ufFilter&&demItems.find(d=>d.uf===ufFilter))||
  (rFilter&&demItems.find(d=>d.region===rFilter))||
  demItems[0]||
  null;
 if(!activeHub){
  host.replaceChildren(el('p','Clique em qualquer estado ou município no mapa para inspecionar o potencial da praça e simular a viabilidade comercial.'));
  return;
 }
 const radiusKm=Number(field('radius')?.value)||100;
 const chosenTalentId=field('talent')?.value||'';
 const activeArtist=
  lastCrossItems.find(a=>a.id===chosenTalentId)||
  active360Artist||
  lastCrossItems.find(a=>Object.values(a.media||{}).some(m=>m?.value!=null))||
  lastCrossItems[0]||
  null;
 const demInfo=demItems.find(d=>String(d.code)===String(activeHub.code))||activeHub;
 host.replaceChildren();
 const head=el('div');head.className='inspector-head';
 const titleGroup=el('div');titleGroup.className='inspector-title-group';
 titleGroup.append(
  el('strong',`⌖ Praça em Foco no Mapa: ${activeHub.name} / ${activeHub.uf} (${activeHub.region||'Brasil'}) · Bacia de ${radiusKm} km`),
  el('small',demInfo.population?`Base Oficial IBGE · População: ${fmt(demInfo.population)} hab · PIB per capita: R$ ${fmt(Math.round(demInfo.pib_per_capita||0))} · Perfil: ${demInfo.economic_profile||'Polo comercial'}`:`Município oficial IBGE (${activeHub.name}/${activeHub.uf}) · Clique em "Ativar Raio 100 km" ou simule a compatibilidade comercial`)
 );
 const scoreBadge=el('div','Calculando viabilidade artista × praça…');
 scoreBadge.className='inspector-score-badge';
 head.append(titleGroup,scoreBadge);
 host.append(head);

 const metricsGrid=el('div');metricsGrid.className='inspector-metrics-grid';
 const addMetricBox=(label,val,sub)=>{
  const box=el('div');box.className='inspector-metric-box';
  box.append(el('span',label),el('strong',val),el('small',sub));
  metricsGrid.append(box);
 };
 addMetricBox(
  'População do Polo (IBGE)',
  demInfo.population?`${fmt(demInfo.population)} hab`:'Catálogo Municipal',
  demInfo.economic_profile||`UF: ${activeHub.uf} · Região ${activeHub.region||'Brasil'}`
 );
 addMetricBox(
  'PIB per Capita / Renda',
  demInfo.pib_per_capita?`R$ ${fmt(Math.round(demInfo.pib_per_capita))}`:'Base Territorial IBGE',
  demInfo.avg_income?`Renda média est.: R$ ${fmt(Math.round(demInfo.avg_income))}/mês`:'Indicador econômico municipal'
 );
 addMetricBox(
  'Artista em Simulação',
  activeArtist?activeArtist.name:'Catálogo Nacional',
  activeArtist?`YouTube: ${activeArtist.media?.YouTube?.formatted||'—'} · Spotify: ${activeArtist.media?.Spotify?.formatted||'—'}`:'Selecione um artista'
 );
 addMetricBox(
  'Raio Comercial no Mapa',
  `${radiusKm} km`,
  field('center')?.value===String(activeHub.code)?'Anel de bacia regional ativo no mapa':'Clique abaixo para traçar o raio no mapa'
 );
 host.append(metricsGrid);

 const actionsRow=el('div');actionsRow.className='inspector-actions';
 const topArtistsBar=el('div');topArtistsBar.className='inspector-top-artists';
 topArtistsBar.append(el('span','Simular outro artista nesta praça:'));
 for(const a of lastCrossItems.slice(0,6)){
  const pill=el('button',a.name);
  pill.type='button';
  pill.className='inspector-artist-pill';
  pill.addEventListener('click',()=>{
   field('talent').value=a.id;
   if($('artist-quick-search'))$('artist-quick-search').value=a.name;
   search(true);
  });
  topArtistsBar.append(pill);
 }
 const btnGroup=el('div');btnGroup.style.display='flex';btnGroup.style.gap='6px';btnGroup.style.flexWrap='wrap';
 if(field('center')?.value!==String(activeHub.code)){
  const radiusBtn=el('button',`📍 Traçar Bacia de 100 km em ${activeHub.name}`);
  radiusBtn.type='button';
  radiusBtn.addEventListener('click',()=>focusCommercialHub(activeHub.code,100));
  btnGroup.append(radiusBtn);
 }
 const commLink=el('a',`↗ Abrir Simulador Comercial (${activeArtist?.name||'Artista'} × ${activeHub.name})`);
 commLink.className='secondary-button';
 commLink.style.textDecoration='none';
 commLink.style.padding='4px 10px';
 commLink.style.borderRadius='6px';
 commLink.style.fontSize='11.5px';
 const simParams=new URLSearchParams({
  q:activeArtist?.name||'',
  city:String(activeHub.code),
  cityQuery:`${activeHub.name} / ${activeHub.uf}`,
  radius:String(radiusKm)
 });
 commLink.href='/commercial.html?'+simParams.toString()+'#compatibility-simulator';
 btnGroup.append(commLink);
 actionsRow.append(topArtistsBar,btnGroup);
 host.append(actionsRow);

 if(activeArtist){
  try{
   const cp=new URLSearchParams({talent:activeArtist.id,city:String(activeHub.code),radius:String(radiusKm)});
   const compat=await get('/api/commercial/compatibility?'+cp);
   if(seq!==inspectorSeq)return;
   const sc=compat?.compatibility?.score;
   const cls=compat?.compatibility?.classification||'Potencial calculado';
   scoreBadge.textContent=sc!=null
    ?`⚡ Compatibilidade Comercial (${activeArtist.name} × ${activeHub.name}/${activeHub.uf}): ${sc}/100 · ${cls}`
    :`⚡ Praça pronta para simulação comercial (${activeHub.name}/${activeHub.uf})`;
   if(compat?.territory?.basin?.municipalitiesCount){
    const basinBox=metricsGrid.children[3];
    if(basinBox){
     basinBox.replaceChildren(
      el('span',`Bacia Regional (${radiusKm} km)`),
      el('strong',`${fmt(compat.territory.basin.municipalitiesCount)} municípios`),
      el('small',compat.territory.basin.coveredPopulation?`População nos polos do raio: ${fmt(compat.territory.basin.coveredPopulation)} hab`:`Alcance territorial a partir de ${activeHub.name}`)
     );
    }
   }
  }catch{
   if(seq===inspectorSeq){
    scoreBadge.textContent=`⚡ Praça monitorada: ${activeHub.name} / ${activeHub.uf}`;
   }
  }
 }else{
  scoreBadge.textContent=`⚡ Praça monitorada: ${activeHub.name} / ${activeHub.uf}`;
 }
}

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
  $('message').textContent='Consultando indicadores nacionais e camada operacional de polos comerciais (IBGE)…';
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
   lastCrossItems=cross.items||[];
   if(field('talent').options.length<=1&&cross.items?.length){
    options(field('talent'),cross.items.map(t=>({id:t.id,name:t.name})),'Todos com dados');
    const dl=$('talent-datalist');
    if(dl)dl.replaceChildren(...cross.items.map(r=>{const o=document.createElement('option');o.value=r.name;return o;}));
   }
   for(const [label,value,sub] of [
    ['Talentos no recorte',cross.total,'Catálogo ativo filtrado'],
    ['Com estatísticas verificadas',cross.counts?.withCollectedMetrics??0,'Métricas reais auditadas'],
    ['Perfis oficiais vinculados',cross.counts?.withOfficialProfiles??0,'Instagram, Spotify, YouTube e TikTok'],
    ['Polos Comerciais IBGE / Registros',cross.counts?.regionalRecords||demographicsData?.items?.length||0,cross.counts?.regionalRecords?'Registros de audiência municipal':'Capitais e polos IBGE ativos no mapa']
   ]){
    const box=el('div');box.className='kpi';box.append(el('span',label),el('strong',fmt(value)),el('small',sub));k.append(box);
   }
   const pageItems=(cross.items||[]).slice(offset,offset+100);
   renderOverview20(cross);
   table('artists',['Artista','Instagram','Spotify','YouTube','TikTok','Audiência por Cidade'],pageItems.map(a=>{
    const b=el('button',a.name);b.type='button';b.className='link';
    b.addEventListener('click',()=>{
     field('talent').value=a.id;
     if($('artist-quick-search'))$('artist-quick-search').value=a.name;
     if($('artist-360-body'))selectOverviewArtist360(a);
     search(true);
    });
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
    return [b,cellFor('Instagram'),cellFor('Spotify'),cellFor('YouTube'),cellFor('TikTok'),a.regionalAudience?.hasData?a.regionalAudience.statusLabel:'Simulador de Praça IBGE ativo'];
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
   // Se o artista foi escolhido, localizar automaticamente seu relatório municipal
   // verificado mais recente. Nunca inferir localização a partir de seguidores nacionais.
   let artistMap=null,artistReport=null;
   const selectedId=field('talent').value;
   const selectedArtist=(cross.items||[]).find(a=>a.id===selectedId);
   if(selectedArtist?.regionalAudience?.hasData){
    const entries=selectedArtist.regionalAudience.reports||[];
    const choices=reports.filter(rep=>rep.quality==='verified'&&entries.some(e=>
      e.network===rep.network&&e.metric===rep.metric&&e.source===rep.source&&
      e.quality===rep.quality&&e.latest_end===rep.period_end
    ));
    // Prioriza mídia selecionada e depois o relatório mais recente; mantém métricas separadas.
    const chosenNetwork=field('network').value;
    choices.sort((a,b)=>
      Number(b.network===chosenNetwork)-Number(a.network===chosenNetwork)||
      b.period_end.localeCompare(a.period_end)||
      a.network.localeCompare(b.network)
    );
    for(const rep of choices){
     const rp=new URLSearchParams({network:rep.network,metric:rep.metric,
       start:rep.period_start,end:rep.period_end,source:rep.source,
       quality:rep.quality,talent:selectedArtist.id});
     let candidate;
     try{candidate=await get('/api/regional/ranking?'+rp);}catch{continue;}
     if(n!==request)return;
     if(candidate.items?.some(item=>item.id===selectedArtist.id)&&candidate.places?.length){
      artistMap=candidate;artistReport=rep;break;
     }
    }
   }
   renderOperationalSidebars(artistMap);
   total=cross.total||0;
   $('page').textContent=total?`${offset+1}–${Math.min(offset+100,total)} de ${total}`:'Sem dados';
   $('prev').disabled=offset===0;
   $('next').disabled=offset+100>=total;
   map(artistMap||{byState:[],places:[]});
   $('message').textContent=artistMap
     ?`Bolinhas amarelas: audiência por município de ${selectedArtist.name}. ${artistReport.network} / ${artistReport.metric}, relatório verificado de ${artistReport.period_start} a ${artistReport.period_end}. Círculos maiores = maior volume observado.`
     :selectedArtist
       ?`Modo Operacional IBGE ativo para ${selectedArtist.name}: clique em qualquer polo ou cidade no mapa para simular a bacia regional (100 km) e a compatibilidade comercial. Bolinhas amarelas acendem automaticamente quando há relatório municipal verificado.`
       :'Mapa Operacional ativo com Polos Comerciais IBGE e Simulador de Bacia Regional (100 km). Clique em qualquer estado, polo ou município no mapa para simular a viabilidade comercial.';
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
  for(const [label,value,sub] of [[names[r.metric]??r.metric,count,'Volume verificado no recorte'],['Artistas com dados',r.total,'Talentos com audiência regional'],['Municípios com dados',r.places.length,'Cidades com registro positivo']]){
   const box=el('div');box.className='kpi';box.append(el('span',label),el('strong',r.total?fmt(value):'—'),el('small',sub));k.append(box);
  }
  renderOperationalSidebars(r);
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

let active360Artist=null,active360Stats=null,activeEvoDays=30,evoReqSeq=0;
const evoPalette={Instagram:'#ff2bd6',Spotify:'#00ff88',YouTube:'#00f0ff',TikTok:'#facc15'};
const evoClassLabel={oficial:'API Oficial',relatorio_autorizado:'Relatório Autorizado',observado:'Observação Pública',calculado:'Calculado'};

function renderOverview20(cross){
 if(!$('executive-kpis'))return;
 const eo=cross?.executiveOverview;
 if(eo){
  if($('exec-monitored'))$('exec-monitored').textContent=fmt(eo.monitoredTalents?.value??cross.total??0);
  if($('exec-monitored-sub'))$('exec-monitored-sub').textContent=eo.monitoredTalents?.subtitle||'Cadastro atualizado';
  if($('exec-profiles'))$('exec-profiles').textContent=fmt(eo.confirmedProfiles?.value??0);
  if($('exec-profiles-sub'))$('exec-profiles-sub').textContent=eo.confirmedProfiles?.subtitle||'Quatro mídias';
  if($('exec-recent'))$('exec-recent').textContent=fmt(eo.recentCollections?.value??0);
  if($('exec-recent-sub'))$('exec-recent-sub').textContent=eo.recentCollections?.subtitle||'Últimos 7 dias';
  if($('exec-quality'))$('exec-quality').textContent=eo.dataQuality?.label||'Sem coleta';
  if($('exec-quality-sub'))$('exec-quality-sub').textContent=eo.dataQuality?.subtitle||'Confiabilidade';
 }
 const items=cross?.items||[];
 const chosenId=field('talent')?.value;
 const target=items.find(x=>x.id===chosenId)||items.find(x=>active360Artist&&x.id===active360Artist.id)||items.find(x=>Object.values(x.media||{}).some(m=>m?.value!=null))||items[0]||null;
 if(target)selectOverviewArtist360(target,false);
}

async function selectOverviewArtist360(artist,scrollInto=false){
 if(!artist||!$('artist-360-body'))return;
 active360Artist=artist;
 const seq=++evoReqSeq;
 if($('artist-360-comm-link'))$('artist-360-comm-link').href='/commercial.html?q='+encodeURIComponent(artist.name);
 if($('artist-360-subtitle'))$('artist-360-subtitle').textContent=`${artist.name} — indicadores verificados nas 4 mídias e presença territorial.`;
 if($('evolution-subtitle'))$('evolution-subtitle').textContent=`${artist.name} — evolução verificada nas mídias (janela de ${activeEvoDays} dias).`;
 try{
  const stats=await get('/api/radar/media-stats?talent='+encodeURIComponent(artist.id));
  if(seq!==evoReqSeq)return;
  active360Stats=stats;
  drawArtist360Card(artist,stats);
  drawOverviewEvolutionChart(artist,stats,activeEvoDays);
  if(scrollInto)$('artist-360-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch{
  if(seq!==evoReqSeq)return;
  drawArtist360Card(artist,null);
 }
}

function drawArtist360Card(artist,stats){
 const host=$('artist-360-body');
 if(!host)return;
 host.replaceChildren();
 const grid=el('div');grid.className='artist-360-grid';
 const netDefs=[
  ['Instagram','followers','Seguidores'],
  ['Spotify','monthly_listeners','Ouvintes mensais'],
  ['YouTube','subscribers','Inscritos'],
  ['TikTok','followers','Seguidores']
 ];
 for(const [net,metricKey,metricLabel] of netDefs){
  const card=el('div');card.className='artist-360-net';
  const head=el('div');head.className='artist-360-net-head';
  const titleSpan=el('span',net);
  titleSpan.style.color=evoPalette[net]||'#e9d5ff';
  head.append(titleSpan);
  const netStats=stats?.[net];
  const primary=netStats?.[metricKey];
  const crossMedia=artist.media?.[net];
  const valFormatted=primary?.value!=null?primary.formatted:(crossMedia?.value!=null?crossMedia.formatted:null);
  const cls=primary?.classification;
  const badge=el('span',valFormatted?(evoClassLabel[cls]||'Verificado'):'Sem coleta');
  badge.className='quality-tag';
  head.append(badge);
  card.append(head);
  card.append(el('strong',valFormatted?`${valFormatted} ${metricLabel.toLowerCase()}`:'Sem coleta'));
  const gKey=`growth_${activeEvoDays}d`;
  const gObj=netStats?.[gKey]||netStats?.growth_30d;
  if(gObj?.value!=null){
   card.append(el('small',`Variação (${gObj.days}d): ${gObj.formatted}`));
  }else if(valFormatted){
   card.append(el('small',`Variação (${activeEvoDays}d): aguardando 2ª coleta datada`));
  }else{
   card.append(el('small','Perfil aguardando coleta verificada'));
  }
  if(net==='Instagram'&&netStats?.engagement?.rate_pct!=null){
   card.append(el('small',`Engajamento: ${netStats.engagement.formatted}`));
  }else if(net==='Spotify'&&netStats?.repertoire?.formatted&&netStats.repertoire.formatted!=='—'){
   card.append(el('small',`Repertório: ${netStats.repertoire.formatted}`));
  }else if(net==='YouTube'&&netStats?.views?.value!=null){
   card.append(el('small',`Visualizações: ${netStats.views.formatted}`));
  }
  const obsDate=primary?.observed_on||crossMedia?.observed_on;
  const srcName=primary?.source||crossMedia?.source;
  if(obsDate||srcName){
   card.append(el('small',`Fonte: ${srcName||'Observado'} · Ref.: ${obsDate||'—'}`));
  }
  const topCities=netStats?.top_cities;
  if(topCities?.hasData){
   card.append(el('small',`Cidades: ${topCities.statusLabel}`));
  }
  const profileUrl=netStats?.profile_url||crossMedia?.url;
  if(profileUrl){
   const a=el('a','Abrir perfil oficial ↗');a.href=profileUrl;a.target='_blank';a.rel='noopener noreferrer';
   a.style.fontSize='10.5px';
   card.append(a);
  }
  grid.append(card);
 }
 host.append(grid);
}

function drawOverviewEvolutionChart(artist,stats,days=30){
 const host=$('overview-evolution-chart');
 if(!host)return;
 host.replaceChildren();
 if($('evolution-subtitle')&&artist){
  $('evolution-subtitle').textContent=`${artist.name} — evolução verificada nas mídias (janela de ${days} dias).`;
 }
 const seriesList=[];
 const singlePointNets=[];
 for(const net of ['Instagram','Spotify','YouTube','TikTok']){
  const h=stats?.[net]?.history||[];
  if(h.length>=2){
   const latestMs=Date.parse(h.at(-1).date);
   const cutoffMs=latestMs-(days+5)*86400000;
   const filtered=h.filter(pt=>Date.parse(pt.date)>=cutoffMs);
   const usePts=filtered.length>=2?filtered:h.slice(-Math.min(h.length,4));
   seriesList.push({network:net,history:usePts});
  }else if(h.length===1){
   singlePointNets.push(`${net} (${fmt(h[0].value)} em ${h[0].date})`);
  }
 }
 if(!seriesList.length){
  const msg=singlePointNets.length
   ?`1ª observação registrada para ${artist?.name||'o artista'}: ${singlePointNets.join(' · ')}. A curva de evolução (${days}d) será exibida a partir da 2ª coleta datada.`
   :`Sem série histórica com 2 ou mais coletas para ${artist?.name||'este recorte'}. O Radar não interpola curvas sem observações reais.`;
  host.append(el('p',msg));
  return;
 }
 const legend=el('div');legend.className='evo-legend-row';
 for(const s of seriesList){
  const pill=el('span');pill.className='evo-legend-pill';
  const dot=el('i');dot.className='evo-dot';dot.style.background=evoPalette[s.network];
  const first=s.history[0].value,last=s.history.at(-1).value;
  const pct=first>0?((last-first)/first*100):null;
  const sign=pct>0?'+':'';
  pill.append(dot,el('span',`${s.network}: ${fmt(last)}${pct!=null?` (${sign}${pct.toFixed(1)}%)`:''}`));
  legend.append(pill);
 }
 host.append(legend);
 const allDates=[...new Set(seriesList.flatMap(s=>s.history.map(p=>p.date)))].sort();
 const lo=Date.parse(allDates[0]),hi=Math.max(lo+86400000,Date.parse(allDates.at(-1)));
 const multi=seriesList.length>1;
 const mapped=seriesList.map(s=>{
  const base=Math.max(1,s.history[0].value);
  return {
   ...s,
   pts:s.history.map(p=>({date:p.date,raw:p.value,yVal:multi?((p.value-base)/base*100):p.value}))
  };
 });
 const allY=mapped.flatMap(s=>s.pts.map(p=>p.yVal));
 const minY=Math.min(multi?0:Infinity,...allY),maxY=Math.max(...allY,minY+1);
 const W=520,H=155,padL=46,padR=44,padT=14,padB=24,plotW=W-padL-padR,plotH=H-padT-padB;
 const sEl=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':`Evolução das mídias em ${days} dias`});
 for(let g=0;g<=3;g++){
  const ratio=g/3,y=padT+plotH*(1-ratio),val=minY+(maxY-minY)*ratio;
  sEl.append(svg('line',{x1:padL,x2:padL+plotW,y1:y.toFixed(1),y2:y.toFixed(1),stroke:'#27272a','stroke-dasharray':'3 3'}));
  const t=svg('text',{x:padL-6,y:(y+3).toFixed(1),'text-anchor':'end',fill:'#a1a1aa','font-size':'9.5'});
  t.textContent=multi?`${val>=0?'+':''}${val.toFixed(1)}%`:fmt(Math.round(val));
  sEl.append(t);
 }
 for(const dStr of allDates){
  const x=padL+plotW*(Date.parse(dStr)-lo)/(hi-lo);
  const dt=svg('text',{x:x.toFixed(1),y:H-5,'text-anchor':'middle',fill:'#a1a1aa','font-size':'9.5'});
  dt.textContent=dStr.slice(8,10)+'/'+dStr.slice(5,7);
  sEl.append(dt);
 }
 for(const s of mapped){
  const col=evoPalette[s.network]||'#a855f7';
  const coords=s.pts.map(p=>[
   padL+plotW*(Date.parse(p.date)-lo)/(hi-lo),
   padT+plotH*(1-(p.yVal-minY)/Math.max(0.001,maxY-minY)),
   p
  ]);
  const dPath=coords.map((c,i)=>`${i?'L':'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  sEl.append(svg('path',{d:dPath,fill:'none',stroke:col,'stroke-width':'2.4','stroke-linecap':'round'}));
  for(const [cx,cy,pt] of coords){
   const c=svg('circle',{cx:cx.toFixed(1),cy:cy.toFixed(1),r:'3.2',fill:'#fff',stroke:col,'stroke-width':'1.6'});
   const title=svg('title');
   title.textContent=`${s.network} · ${pt.date}: ${fmt(pt.raw)}`;
   c.append(title);
   sEl.append(c);
  }
 }
 host.append(sEl);
}

for(const btn of document.querySelectorAll('.win-switch[data-evo-days]')){
 btn.addEventListener('click',()=>{
  activeEvoDays=Number(btn.dataset.evoDays)||30;
  for(const b of document.querySelectorAll('.win-switch[data-evo-days]')){
   b.setAttribute('aria-pressed',String(b===btn));
  }
  if(active360Artist&&active360Stats){
   drawArtist360Card(active360Artist,active360Stats);
   drawOverviewEvolutionChart(active360Artist,active360Stats,activeEvoDays);
  }
 });
}
form.addEventListener('submit',e=>{e.preventDefault();search()});field('network').addEventListener('change',networkChanged);field('report').addEventListener('change',reportChanged);field('days').addEventListener('change',metricChanged);field('metric').addEventListener('change',metricChanged);$('radius-slider').addEventListener('input',()=>{const v=Number($('radius-slider').value);field('radius').value=v>0?String(v):'';});field('radius').addEventListener('input',()=>{const v=Number(field('radius').value);$('radius-slider').value=Number.isFinite(v)&&v>0?String(v):'0';});$('reload').addEventListener('click',()=>loadReports().catch(e=>$('message').textContent=e.message));$('prev').addEventListener('click',()=>{offset=Math.max(0,offset-100);search(true)});$('next').addEventListener('click',()=>{if(offset+100<total){offset+=100;search(true)}});
(async()=>{try{let cats,municipal,demog;[mods,geo,cats,municipal,demog]=await Promise.all([get('/api/radar/modalities'),get('/api/radar/geography'),get('/api/regional/categories'),get('/api/radar/municipalities'),get('/api/radar/demographics').catch(()=>({items:[],byRegion:[]}))]);categoryCatalog=cats.categories;catalogTotal=cats.total;catalog=municipal.items;demographicsData=demog||{items:[],byRegion:[]};renderQuickHubsBar();options(field('category'),categoryCatalog.map(c=>({id:String(c.id),name:c.name})),'Todas');options(field('modality'),mods,'Todas');subs();filterCities();filterCenters();categoryCards(categoryCatalog,'Cadastro nacional de talentos',catalogTotal);await loadReports()}catch(e){$('message').textContent=e.message}})();
