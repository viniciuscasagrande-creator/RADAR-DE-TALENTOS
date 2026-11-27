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

function filterCenters(autoTriggerSearch=true){
 const raw=$('center-search').value.trim();
 const q=normalize(raw);
 const rows=catalog.filter(c=>c.lat!=null&&(!q||normalize(`${c.name} / ${c.uf}`).includes(q)||normalize(c.name).includes(q)||c.code===q||selected.has(c.code)));
 options(field('center'),rows.map(c=>({id:c.code,name:c.name+' / '+c.uf})),'Sem raio');
 updateMunicipalityDatalist(raw);
 if(!autoTriggerSearch)return;
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
function chooseState(uf){
 const r=Object.keys(regionUF).find(r=>regionUF[r].split(' ').includes(uf))??'';
 field('region').value=r;
 updateUF();
 field('uf').value=uf;
 clearCities();
 const stateHub=(demographicsData?.items||[]).find(d=>d.uf===uf&&d.lat!=null)||catalog.find(c=>c.uf===uf&&c.lat!=null);
 if(stateHub){
  selected.add(String(stateHub.code));
  $('center-search').value=`${stateHub.name} / ${stateHub.uf}`;
  filterCenters(false);
  field('center').value=String(stateHub.code);
  field('radius').value='100';
  if($('radius-slider'))$('radius-slider').value='100';
  selectedChips();
 }
 filterCities();
 updateQuickHubsHighlight();
 search();
 if(stateHub){
  $('map-territory-inspector')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
}
function chooseCity(code,autoActivateRadius=true,openSimModalOnMapClick=false){
 const codeStr=String(code);
 const wasSelected=selected.has(codeStr);
 if(wasSelected&&!openSimModalOnMapClick){
  selected.delete(codeStr);
  if(field('center').value===codeStr&&!selected.size){
   field('center').value='';
   $('center-search').value='';
   field('radius').value='';
   if($('radius-slider'))$('radius-slider').value='0';
  }
 }else if(selected.size<100){
  if(openSimModalOnMapClick)selected.clear();
  selected.add(codeStr);
  const cityObj=catalog.find(c=>String(c.code)===codeStr)||(demographicsData?.items||[]).find(d=>String(d.code)===codeStr);
  if(autoActivateRadius&&cityObj?.lat!=null){
   $('center-search').value=`${cityObj.name} / ${cityObj.uf}`;
   filterCenters(false);
   field('center').value=String(cityObj.code);
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
 if(openSimModalOnMapClick){
  openShowSimulatorModal(codeStr,field('talent')?.value||null,Number(field('radius')?.value)||100);
 }
}
function focusCommercialHub(code,radiusKm=100,openSimModal=false){
 const codeStr=String(code);
 const cityObj=catalog.find(c=>String(c.code)===codeStr)||(demographicsData?.items||[]).find(d=>String(d.code)===codeStr);
 if(!cityObj)return;
 activeTechnicalMarkerCode=String(cityObj.code);
 selected.clear();
 selected.add(String(cityObj.code));
 // Mantém a visão nacional completa no mapa para preservar todas as bolinhas e comparativos regionais
 field('region').value='';
 updateUF();
 field('uf').value='';
 filterCities();
 $('center-search').value=`${cityObj.name} / ${cityObj.uf}`;
 filterCenters(false);
 field('center').value=String(cityObj.code);
 field('radius').value=String(radiusKm);
 if($('radius-slider'))$('radius-slider').value=String(radiusKm);
 selectedChips();
 updateQuickHubsHighlight();
 search();
 if(openSimModal){
  openShowSimulatorModal(String(cityObj.code),field('talent')?.value||null,radiusKm);
 }else{
  $('map-territory-inspector')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
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
   if(typeof matchCityByText==='function'&&typeof focusCommercialHub==='function'){
    const matchedCity=matchCityByText(input.value,true)||(demographicsData?.items||[]).find(d=>normalize(d.name)===q||normalize(`${d.name} ${d.uf}`)===q||normalize(d.name).includes(q));
    if(matchedCity){
     field('talent').value='';
     if(typeof activeTechnicalMarkerCode!=='undefined')activeTechnicalMarkerCode=String(matchedCity.code);
     focusCommercialHub(matchedCity.code,100,false);
     const topInCity=typeof getCityGrowingTalents==='function'?getCityGrowingTalents(matchedCity,getCityTalentIndexMeta(matchedCity),3):[];
     const topNames=topInCity.map(t=>`${t.artist.name} (${t.growthText})`).join(' · ');
     $('message').textContent=`📍 Cidade localizada pela busca: ${matchedCity.name} / ${matchedCity.uf}${topNames?` — Talentos em maior crescimento na praça: ${topNames}`:''}.`;
     return;
    }
   }
   $('message').textContent=`⏳ Pesquisando "${input.value.trim()}" no Motor Global (Wikidata, MusicBrainz e YouTube API v3)...`;try{const discRes=await fetch('/api/discovery/global-search',{method:'POST',headers:{'Content-Type':'application/json','X-Radar-Action':'discovery'},body:JSON.stringify({query:input.value.trim(),includeMusicBrainzLive:true,autoApprove:true})});if(discRes.ok){const discData=await discRes.json().catch(()=>({}));const pub=discData.autoPublished;if(pub?.radarId){if(![...field('talent').options].some(o=>o.value===pub.radarId))field('talent').add(new Option(pub.name||input.value.trim(),pub.radarId));field('talent').value=pub.radarId;input.value=pub.name||input.value.trim();useArtistMapAutoMode();$('message').textContent=`✓ Talento "${pub.name||input.value.trim()}" prospectado, incorporado ao Radar (${pub.radarId}) e coletado via Motor de Dados!`;window.dispatchEvent(new CustomEvent('radar:socket-event',{detail:{topic:'discovery.updated'}}));search();return;}}}catch{}$('message').textContent=`Artista "${input.value.trim()}" não encontrado no cadastro do Radar.`;
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

function activateCategoryFilter(catId='',catName='',forceModalIfAll=false){
 const nextId=String(catId||'');
 const wasAlreadyAll=!field('category').value&&!nextId;
 field('category').value=nextId;
 const foundCat=categoryCatalog.find(c=>String(c.id)===nextId);
 const resolvedName=catName||(foundCat?foundCat.name:'');
 window.dispatchEvent(new CustomEvent('radar:category-change',{detail:{categoryId:nextId,categoryName:resolvedName}}));
 search();
 if(wasAlreadyAll&&forceModalIfAll){
  openExecutiveDetailModal('talents','','Todas as categorias');
 }
}
window.setRadarCategoryFilter=activateCategoryFilter;

function renderCategoryQuickDrawer(items,activeCatId,activeCatName){
 const k=$('kpis');
 if(!k||!k.parentElement)return;
 let drawer=$('category-quick-drawer');
 if(!drawer){
  drawer=el('div');
  drawer.id='category-quick-drawer';
  drawer.className='category-quick-drawer';
  k.after(drawer);
 }
 if(!activeCatId){
  drawer.hidden=true;
  drawer.replaceChildren();
  return;
 }
 drawer.hidden=false;
 drawer.replaceChildren();

 const withMetricsCount=(items||[]).filter(a=>a.hasCollectedMetric||Object.values(a.media||{}).some(m=>m?.value!=null)).length;
 const head=el('div');head.className='cat-drawer-head';
 const titleWrap=el('div');titleWrap.className='cat-drawer-title';
 titleWrap.append(
  el('strong',`📂 Categoria Selecionada: ${activeCatName||'Categoria'} — ${fmt((items||[]).length)} talento(s) no catálogo`),
  el('small',`${fmt(withMetricsCount)} com indicadores verificados nas 4 mídias · Clique em qualquer talento para abrir a Ficha 360° ou Simular Show`)
 );
 const actionsWrap=el('div');actionsWrap.className='cat-drawer-actions';
 const modalBtn=el('button','📋 Abrir Tabela Completa em Modal');
 modalBtn.type='button';
 modalBtn.className='btn-simulate-show';
 modalBtn.addEventListener('click',()=>openExecutiveDetailModal('talents',activeCatId,activeCatName));

 const scrollStudioBtn=el('button','📊 Ver no Painel Multi-Mídia ↓');
 scrollStudioBtn.type='button';
 scrollStudioBtn.className='secondary-button';
 scrollStudioBtn.addEventListener('click',()=>{
  const target=$('radar-intelligence-studio')||$('ranking');
  target?.scrollIntoView({behavior:'smooth',block:'start'});
 });

 const clearBtn=el('button','✕ Mostrar Todas as Categorias');
 clearBtn.type='button';
 clearBtn.className='secondary-button';
 clearBtn.addEventListener('click',()=>activateCategoryFilter('','',false));

 actionsWrap.append(modalBtn,scrollStudioBtn,clearBtn);
 head.append(titleWrap,actionsWrap);
 drawer.append(head);

 if(!(items||[]).length){
  drawer.append(el('p','Nenhum talento cadastrado nesta categoria no recorte atual.'));
  return;
 }

 const grid=el('div');grid.className='cat-drawer-grid';
 for(const a of (items||[]).slice(0,24)){
  const card=el('div');card.className='cat-talent-card';
  const top=el('div');top.className='cat-talent-top';
  const nameBtn=el('button',a.name);
  nameBtn.type='button';
  nameBtn.className='cat-talent-name';
  nameBtn.addEventListener('click',()=>focusArtistInOverview(a));
  const statusTag=el('span',a.hasCollectedMetric?'Verificado':'Catálogo');
  statusTag.className=a.hasCollectedMetric?'cat-tag-verified':'cat-tag-catalog';
  top.append(nameBtn,statusTag);
  card.append(top);

  const metricsLine=el('div');metricsLine.className='cat-talent-metrics';
  for(const [net,shortLabel] of [['Instagram','IG'],['Spotify','SP'],['YouTube','YT'],['TikTok','TK']]){
   const m=a.media?.[net];
   const pill=el('span',`${shortLabel}: ${m?.value!=null?m.formatted:'—'}`);
   pill.className=m?.value!=null?'cat-net-pill has-val':'cat-net-pill';
   metricsLine.append(pill);
  }
  card.append(metricsLine);

  const btnRow=el('div');btnRow.className='cat-talent-btns';
  const fBtn=el('button','◉ Ficha 360°');
  fBtn.type='button';
  fBtn.className='secondary-button';
  fBtn.addEventListener('click',()=>focusArtistInOverview(a));

  const sBtn=el('button','⚡ Simular Show');
  sBtn.type='button';
  sBtn.className='btn-simulate-show';
  sBtn.addEventListener('click',()=>openShowSimulatorModal(null,a.id,100));

  btnRow.append(fBtn,sBtn);
  card.append(btnRow);
  grid.append(card);
 }
 drawer.append(grid);
}

function focusArtistInOverview(artist){
 if(!artist)return;
 field('talent').value=artist.id;
 if($('artist-quick-search'))$('artist-quick-search').value=artist.name;
 if(typeof window.selectRadarStudioArtist==='function'){
  window.selectRadarStudioArtist(artist.id,true);
 }else if($('artist-360-body')){
  selectOverviewArtist360(artist,true);
 }else{
  openShowSimulatorModal(null,artist.id,100);
 }
}

function categoryCards(rows,scope,grand=null){
 const k=$('kpis');k.replaceChildren();$('category-scope').textContent=scope;
 const byId=new Map(rows.map(r=>[String(r.id),r.value]));
 const all=el('button');all.className='kpi';all.type='button';all.setAttribute('aria-pressed',String(!field('category').value));
 all.append(
  el('span','Total de talentos'),
  el('strong',grand==null?'—':fmt(grand)),
  el('small',!field('category').value?'Catálogo ativo · Clique p/ listar':'Clique p/ mostrar todos')
 );
 all.addEventListener('click',()=>activateCategoryFilter('','Todas as categorias',true));
 k.append(all);
 for(const c of categoryCatalog){
  const isPressed=field('category').value===String(c.id);
  const b=el('button');b.type='button';b.className='kpi';b.setAttribute('aria-pressed',String(isPressed));
  const countVal=byId.has(String(c.id))?byId.get(String(c.id)):0;
  const pct=grand&&grand>0?Math.round(countVal/grand*100):0;
  b.append(
   el('span',c.name),
   el('strong',byId.has(String(c.id))?fmt(countVal):'—'),
   el('small',isPressed?'✓ Filtro ativo · Clique p/ limpar':`${pct}% do catálogo · Filtrar ↗`)
  );
  b.addEventListener('click',()=>{
   const nextId=field('category').value===String(c.id)?'':String(c.id);
   activateCategoryFilter(nextId,nextId?c.name:'Todas as categorias',false);
  });
  k.append(b);
 }
}
function svg(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}
const project=([lon,lat])=>[20+(lon+75)*15,20+(6-lat)*13];

let activeMapIndexFilter='all';
let activeTechnicalMarkerCode='3550308';

const FALLBACK_STRATEGIC_HUBS=[
 // Mega-Polos de Concentração (Sudeste + Brasília)
 {code:'3550308',name:'São Paulo',uf:'SP',region:'Sudeste',lat:-23.5505,lon:-46.6333,population:11451999,pib_per_capita:72705.5,avg_income:4950,economic_profile:'Metrópole Global · Serviços, Finanças, Tecnologia e Grandes Eventos'},
 {code:'3304557',name:'Rio de Janeiro',uf:'RJ',region:'Sudeste',lat:-22.9068,lon:-43.1729,population:6211223,pib_per_capita:57870.2,avg_income:4320,economic_profile:'Metrópole Nacional · Turismo, Entretenimento, Energia e Serviços'},
 {code:'3106200',name:'Belo Horizonte',uf:'MG',region:'Sudeste',lat:-19.9167,lon:-43.9345,population:2315560,pib_per_capita:44810.8,avg_income:4180,economic_profile:'Metrópole Nacional · Serviços, Tecnologia, Gastronomia e Circuito de Shows'},
 {code:'5300108',name:'Brasília',uf:'DF',region:'Centro-Oeste',lat:-15.7939,lon:-47.8828,population:2817381,pib_per_capita:92732.3,avg_income:5840,economic_profile:'Capital Federal · Administração Pública, Serviços de Alta Renda e Congressos'},
 // Capitais e Polos de Crescimento Acelerado (Bolinhas Verdes)
 {code:'2304400',name:'Fortaleza',uf:'CE',region:'Nordeste',lat:-3.7319,lon:-38.5267,population:2428708,pib_per_capita:29950.4,avg_income:2890,economic_profile:'Metrópole Regional · Turismo, Comércio, Polo de Grandes Shows e Forró'},
 {code:'2927408',name:'Salvador',uf:'BA',region:'Nordeste',lat:-12.9714,lon:-38.5014,population:2417678,pib_per_capita:26890.1,avg_income:2940,economic_profile:'Metrópole Regional · Turismo Cultural, Festivais, Música e Serviços'},
 {code:'1302603',name:'Manaus',uf:'AM',region:'Norte',lat:-3.1190,lon:-60.0217,population:2063689,pib_per_capita:47250.6,avg_income:3110,economic_profile:'Polo Industrial da Amazônia · Indústria, Comércio e Grandes Arenas'},
 {code:'4106902',name:'Curitiba',uf:'PR',region:'Sul',lat:-25.4284,lon:-49.2733,population:1773718,pib_per_capita:55340.9,avg_income:4680,economic_profile:'Metrópole Regional · Serviços, Indústria, Teatro, Stand-up e Turnês'},
 {code:'2611606',name:'Recife',uf:'PE',region:'Nordeste',lat:-8.0476,lon:-34.8770,population:1488920,pib_per_capita:36840.2,avg_income:3390,economic_profile:'Metrópole Regional · Polo Tecnológico (Porto Digital), Cultura e Festivais'},
 {code:'5208707',name:'Goiânia',uf:'GO',region:'Centro-Oeste',lat:-16.6869,lon:-49.2648,population:1437366,pib_per_capita:41680.5,avg_income:3820,economic_profile:'Capital do Agronegócio e Sertanejo · Serviços, Comércio e Megaeventos'},
 {code:'4314902',name:'Porto Alegre',uf:'RS',region:'Sul',lat:-30.0346,lon:-51.2177,population:1332845,pib_per_capita:61420.7,avg_income:4890,economic_profile:'Metrópole Regional · Serviços, Saúde, Educação, Rock, Pop e Teatro'},
 {code:'1501402',name:'Belém',uf:'PA',region:'Norte',lat:-1.4558,lon:-48.4902,population:1303403,pib_per_capita:24910.3,avg_income:2780,economic_profile:'Metrópole da Amazônia Oriental · Comércio, Gastronomia, Turismo e Shows'},
 {code:'2111300',name:'São Luís',uf:'MA',region:'Nordeste',lat:-2.5307,lon:-44.3068,population:1037775,pib_per_capita:33950.4,avg_income:2850,economic_profile:'Capital Estadual · Logística Portuária, Serviços e Eventos Culturais'},
 {code:'2704302',name:'Maceió',uf:'AL',region:'Nordeste',lat:-9.6658,lon:-35.7350,population:957916,pib_per_capita:28410.2,avg_income:2710,economic_profile:'Capital Estadual · Turismo Litorâneo, Serviços e Eventos de Verão'},
 {code:'5002704',name:'Campo Grande',uf:'MS',region:'Centro-Oeste',lat:-20.4697,lon:-54.6201,population:898100,pib_per_capita:38920.1,avg_income:3690,economic_profile:'Capital do Agronegócio · Serviços, Logística e Circuito Sertanejo'},
 {code:'2211001',name:'Teresina',uf:'PI',region:'Nordeste',lat:-5.0920,lon:-42.8038,population:866300,pib_per_capita:27840.6,avg_income:2680,economic_profile:'Capital Estadual · Polo Regional de Saúde, Educação e Eventos'},
 {code:'2507507',name:'João Pessoa',uf:'PB',region:'Nordeste',lat:-7.1195,lon:-34.8450,population:833932,pib_per_capita:28120.4,avg_income:3040,economic_profile:'Capital Estadual · Turismo, Qualidade de Vida e Festivais'},
 {code:'2408102',name:'Natal',uf:'RN',region:'Nordeste',lat:-5.7945,lon:-35.2110,population:751300,pib_per_capita:32410.8,avg_income:3180,economic_profile:'Capital Estadual · Turismo, Serviços, Carnatal e Eventos Corporativos'},
 {code:'5103403',name:'Cuiabá',uf:'MT',region:'Centro-Oeste',lat:-15.6014,lon:-56.0979,population:650877,pib_per_capita:49810.5,avg_income:3940,economic_profile:'Capital do Agronegócio · Alta Renda, Serviços e Grandes Shows'},
 {code:'2800308',name:'Aracaju',uf:'SE',region:'Nordeste',lat:-10.9472,lon:-37.0731,population:602757,pib_per_capita:31540.2,avg_income:3250,economic_profile:'Capital Estadual · Serviços, Energia e Festas Juninas/Shows'},
 {code:'1100205',name:'Porto Velho',uf:'RO',region:'Norte',lat:-8.7612,lon:-63.9004,population:460434,pib_per_capita:41280.4,avg_income:3280,economic_profile:'Capital Estadual · Energia, Logística, Agronegócio e Shows'},
 {code:'1600303',name:'Macapá',uf:'AP',region:'Norte',lat:0.0349,lon:-51.0694,population:442933,pib_per_capita:27910.3,avg_income:2890,economic_profile:'Capital Estadual · Serviços, Comércio e Eventos Regionais'},
 {code:'1400100',name:'Boa Vista',uf:'RR',region:'Norte',lat:2.8235,lon:-60.6758,population:413486,pib_per_capita:30450.7,avg_income:2980,economic_profile:'Capital Estadual · Serviços, Comércio e Agronegócio'},
 {code:'1200401',name:'Rio Branco',uf:'AC',region:'Norte',lat:-9.9754,lon:-67.8249,population:364756,pib_per_capita:28190.5,avg_income:2820,economic_profile:'Capital Estadual · Administração, Comércio e Feiras Agropecuárias'},
 {code:'1721000',name:'Palmas',uf:'TO',region:'Norte',lat:-10.1840,lon:-48.3336,population:302692,pib_per_capita:36410.8,avg_income:3540,economic_profile:'Capital Estadual · Agronegócio, Serviços e Eventos Universitários/Shows'},
 // Polos de Alto Potencial Econômico PIB IBGE (Bolinhas Ciano) e Oportunidade Comercial (Bolinhas Amarelas)
 {code:'4205407',name:'Florianópolis',uf:'SC',region:'Sul',lat:-27.5954,lon:-48.5480,population:537211,pib_per_capita:48620.9,avg_income:5210,economic_profile:'Capital Estadual · Tecnologia, Turismo de Alta Renda e Entretenimento'},
 {code:'3205309',name:'Vitória',uf:'ES',region:'Sudeste',lat:-20.3155,lon:-40.3128,population:322869,pib_per_capita:85420.6,avg_income:5490,economic_profile:'Capital Estadual · Comércio Exterior, Finanças e Eventos de Alta Renda'},
 {code:'3509502',name:'Campinas',uf:'SP',region:'Sudeste',lat:-22.9056,lon:-47.0608,population:1139047,pib_per_capita:64120.4,avg_income:4720,economic_profile:'Polo Tecnológico e Universitário · Indústria, Logística e Grandes Eventos'},
 {code:'3543402',name:'Ribeirão Preto',uf:'SP',region:'Sudeste',lat:-21.1775,lon:-47.8103,population:698642,pib_per_capita:56840.2,avg_income:4380,economic_profile:'Polo do Agronegócio e Saúde · Festivais (João Rock), Feiras e Shows'},
 {code:'3170206',name:'Uberlândia',uf:'MG',region:'Sudeste',lat:-18.9186,lon:-48.2772,population:713224,pib_per_capita:60450.3,avg_income:3980,economic_profile:'Capital Logística do Triângulo Mineiro · Atacado, Agronegócio e Shows'},
 {code:'4113700',name:'Londrina',uf:'PR',region:'Sul',lat:-23.3045,lon:-51.1696,population:555965,pib_per_capita:43820.5,avg_income:3920,economic_profile:'Polo Regional do Norte do Paraná · Agronegócio, Universidades e Exposições'},
 {code:'4115200',name:'Maringá',uf:'PR',region:'Sul',lat:-23.4205,lon:-51.9333,population:409657,pib_per_capita:52180.7,avg_income:4290,economic_profile:'Polo Cooperativista e Agroindustrial · Alta Qualidade de Vida e Eventos'},
 {code:'4209102',name:'Joinville',uf:'SC',region:'Sul',lat:-26.3044,lon:-48.8487,population:616317,pib_per_capita:66840.2,avg_income:4410,economic_profile:'Maior Polo Industrial de SC · Metalmecânica, Dança e Eventos Corporativos'},
 {code:'4202404',name:'Blumenau',uf:'SC',region:'Sul',lat:-26.9194,lon:-49.0661,population:361261,pib_per_capita:58910.4,avg_income:4350,economic_profile:'Polo do Vale Europeu · Tecnologia, Têxtil, Oktoberfest e Turismo'},
 {code:'4202008',name:'Balneário Camboriú',uf:'SC',region:'Sul',lat:-26.9906,lon:-48.6348,population:139155,pib_per_capita:54320.8,avg_income:4980,economic_profile:'Polo Turístico e Imobiliário Premium · Vida Noturna, Música Eletrônica e Congressos'},
 {code:'4204608',name:'Criciúma',uf:'SC',region:'Sul',lat:-28.6775,lon:-49.3697,population:214493,pib_per_capita:46120.3,avg_income:3890,economic_profile:'Capital do Sul Catarinense · Indústria, Comércio e Eventos Regionais'},
 {code:'3549805',name:'São José do Rio Preto',uf:'SP',region:'Sudeste',lat:-20.8113,lon:-49.3758,population:480393,pib_per_capita:49210.8,avg_income:4120,economic_profile:'Polo Regional do Noroeste Paulista · Saúde, Agronegócio e Circuito Sertanejo'},
 {code:'3549904',name:'São José dos Campos',uf:'SP',region:'Sudeste',lat:-23.1896,lon:-45.8841,population:697054,pib_per_capita:63450.8,avg_income:4650,economic_profile:'Capital do Vale do Paraíba · Polo Aeroespacial e Alta Renda'},
 {code:'3552205',name:'Sorocaba',uf:'SP',region:'Sudeste',lat:-23.5015,lon:-47.4526,population:723682,pib_per_capita:61890.2,avg_income:4210,economic_profile:'Metrópole do Interior Paulista · Parque Tecnológico, Arenas e Festivais'},
 {code:'3548500',name:'Santos',uf:'SP',region:'Sudeste',lat:-23.9608,lon:-46.3336,population:418608,pib_per_capita:58920.6,avg_income:4890,economic_profile:'Metrópole da Baixada Santista · Maior Porto da América Latina e Turismo'},
 {code:'3518800',name:'Guarulhos',uf:'SP',region:'Sudeste',lat:-23.4543,lon:-46.5337,population:1291771,pib_per_capita:55180.4,avg_income:3820,economic_profile:'Hub Aeroportuário e Industrial da Grande SP'},
 {code:'3548708',name:'São Bernardo do Campo',uf:'SP',region:'Sudeste',lat:-23.6914,lon:-46.5646,population:810729,pib_per_capita:66340.5,avg_income:4590,economic_profile:'Capital Automotiva do ABC · Pavilhão Vera Cruz e Grandes Shows'},
 {code:'3547809',name:'Santo André',uf:'SP',region:'Sudeste',lat:-23.6742,lon:-46.5436,population:748919,pib_per_capita:47920.3,avg_income:4410,economic_profile:'Polo do ABC Paulista · Serviços, Indústria e Entretenimento'},
 {code:'3525904',name:'Jundiaí',uf:'SP',region:'Sudeste',lat:-23.1857,lon:-46.8978,population:443221,pib_per_capita:121340.5,avg_income:4780,economic_profile:'Polo Logístico e Industrial de Alta Renda do Eixo SP-Campinas'},
 {code:'3538709',name:'Piracicaba',uf:'SP',region:'Sudeste',lat:-22.7338,lon:-47.6476,population:423323,pib_per_capita:78120.4,avg_income:4310,economic_profile:'Polo Agroindustrial e Universitário (ESALQ/USP)'},
 {code:'3506003',name:'Bauru',uf:'SP',region:'Sudeste',lat:-22.3246,lon:-49.0871,population:379146,pib_per_capita:45120.3,avg_income:3890,economic_profile:'Polo Universitário e de Serviços do Centro-Oeste Paulista'},
 {code:'3516200',name:'Franca',uf:'SP',region:'Sudeste',lat:-20.5386,lon:-47.4008,population:352536,pib_per_capita:36840.2,avg_income:3540,economic_profile:'Polo Calçadista e Cafeeiro da Alta Mogiana'},
 {code:'4218707',name:'Tubarão',uf:'SC',region:'Sul',lat:-28.4713,lon:-49.0144,population:110088,pib_per_capita:41890.5,avg_income:3610,economic_profile:'Polo de Comércio e Saúde do Sul de SC'}
];

function normalizeDemographicsPayload(raw){
 const rawList=Array.isArray(raw?.items)&&raw.items.length
  ?raw.items
  :Array.isArray(raw?.topMunicipalities)&&raw.topMunicipalities.length
    ?raw.topMunicipalities
    :[];
 const byCode=new Map();
 const catByCode=new Map((catalog||[]).map(c=>[String(c.code),c]));
 for(const fb of FALLBACK_STRATEGIC_HUBS){
  const c=catByCode.get(String(fb.code));
  byCode.set(String(fb.code),{
   ...fb,
   lat:c?.lat??fb.lat,
   lon:c?.lon??fb.lon,
   region:c?.region||fb.region,
   uf:c?.uf||fb.uf,
   gdp_per_capita:fb.pib_per_capita
  });
 }
 for(const item of rawList){
  const code=String(item.code||'');
  if(!code)continue;
  const fb=byCode.get(code);
  const c=catByCode.get(code);
  const pib=Number(item.pib_per_capita??item.gdp_per_capita??fb?.pib_per_capita??42000);
  byCode.set(code,{
   ...fb,
   ...item,
   code,
   name:item.name||c?.name||fb?.name||code,
   uf:item.uf||c?.uf||fb?.uf||'BR',
   region:item.region||c?.region||fb?.region||'Brasil',
   lat:item.lat??c?.lat??fb?.lat??null,
   lon:item.lon??c?.lon??fb?.lon??null,
   population:Number(item.population??fb?.population??0),
   pib_per_capita:pib,
   gdp_per_capita:pib,
   avg_income:Number(item.avg_income??fb?.avg_income??Math.round(pib/12*0.62)),
   economic_profile:item.economic_profile||fb?.economic_profile||'Polo Comercial IBGE'
  });
 }
 const items=[...byCode.values()].sort((a,b)=>(Number(b.population)||0)-(Number(a.population)||0));
 let byRegion=Array.isArray(raw?.byRegion)&&raw.byRegion.length?raw.byRegion:null;
 if(!byRegion){
  const regMap=new Map();
  for(const h of items){
   const r=h.region||'Brasil';
   if(!regMap.has(r))regMap.set(r,{region:r,population:0,pibSum:0,count:0});
   const acc=regMap.get(r);
   acc.population+=Number(h.population)||0;
   acc.pibSum+=Number(h.pib_per_capita)||0;
   acc.count+=1;
  }
  byRegion=[...regMap.values()].map(x=>({
   region:x.region,
   population:x.population,
   avg_pib_per_capita:x.count>0?Math.round(x.pibSum/x.count):0
  })).sort((a,b)=>b.population-a.population);
 }
 return {items,byRegion};
}

demographicsData=normalizeDemographicsPayload(demographicsData);

const CITY_TALENT_TECHNICAL_INDICES={
 // 1. Polo de alta concentração (Anel Verde + Círculo Verde + Núcleo Branco — ~58% do catálogo nacional)
 '3550308':{type:'concentration',badgeLabel:'Polo de alta concentração',typeTitle:'🟢⚪ Polo de Alta Concentração de Talentos',color:'#22c55e',accentColor:'#ffffff',sharePct:26.4,growthPct:14.8,techScore:99,basinPop:21840000,basinCities:39,topGenres:'Pop · Sertanejo · Urbano/Trap · Stand-up · Palestras',venueRef:'Allianz Parque · Espaço Unimed · Vibra SP',callout:{dx:34,dy:20,w:122}},
 '3304557':{type:'concentration',badgeLabel:'Polo de alta concentração',typeTitle:'🟢⚪ Polo de Alta Concentração de Talentos',color:'#22c55e',accentColor:'#ffffff',sharePct:15.2,growthPct:13.5,techScore:97,basinPop:13180000,basinCities:24,topGenres:'Pop · Pagode/Samba · Urbano · MPB · Humor',venueRef:'Farmasi Arena · Qualistage · Vivo Rio',callout:{dx:34,dy:-16,w:122}},
 '3106200':{type:'concentration',badgeLabel:'Polo de alta concentração',typeTitle:'🟢⚪ Polo de Alta Concentração de Talentos',color:'#22c55e',accentColor:'#ffffff',sharePct:9.1,growthPct:16.4,techScore:95,basinPop:6120000,basinCities:34,topGenres:'Sertanejo · Pop/Rock · Pagode · Stand-up',venueRef:'Arena MRV · Mineirão · Arena Hall',callout:{dx:36,dy:-28,w:126}},
 '5300108':{type:'concentration',badgeLabel:'Polo de alta concentração',typeTitle:'🟢⚪ Polo de Alta Concentração de Talentos',color:'#22c55e',accentColor:'#ffffff',sharePct:7.6,growthPct:17.2,techScore:95,basinPop:4480000,basinCities:14,topGenres:'Sertanejo · Pop · Palestras Corporativas · Gospel',venueRef:'Arena BRB Mané Garrincha · Ulysses Guimarães',callout:{dx:-134,dy:-36,w:118}},

 // 2. Alto crescimento (Bolinha Verde Grande com Halo Intenso — Forte expansão de popularidade)
 '2304400':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:4.2,growthPct:24.6,techScore:94,basinPop:4160000,basinCities:19,topGenres:'Forró/Piseiro · Humor/Stand-up · Sertanejo · Pop',venueRef:'Arena Castelão · Centro de Eventos do CE · Marina Park',callout:{dx:14,dy:-34,w:112}},
 '5208707':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:5.4,growthPct:23.1,techScore:94,basinPop:3150000,basinCities:22,topGenres:'Sertanejo · Agro/Festivais · Gospel · Stand-up',venueRef:'Estádio Serra Dourada · Goiânia Arena · Pecuária',callout:{dx:-132,dy:-2,w:112}},
 '2611606':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:3.8,growthPct:22.4,techScore:92,basinPop:4280000,basinCities:25,topGenres:'Forró/Piseiro · Brega/Pop · MPB · Festivais',venueRef:'Classic Hall · Teatro Guararapes · Marco Zero',callout:{dx:-64,dy:18,w:112}},
 '2927408':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:4.6,growthPct:21.5,techScore:93,basinPop:4050000,basinCities:18,topGenres:'Axé/Pagodão · Pop · Samba · Afro/MPB',venueRef:'Arena Fonte Nova · Wet Eventos · Concha Acústica',callout:{dx:16,dy:12,w:112}},
 '1501402':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:2.7,growthPct:19.8,techScore:90,basinPop:2680000,basinCities:15,topGenres:'Tecnomelody/Pop · Forró · Sertanejo · Gospel',venueRef:'Estádio Mangueirão · Hangar Centro de Convenções',callout:{dx:-52,dy:-44,w:112}},
 '2507507':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:1.4,growthPct:19.4,techScore:89,basinPop:1540000,basinCities:22,topGenres:'Forró/Piseiro · Sertanejo · Pop · Humor',venueRef:'Domus Hall · Teatro Pedra do Reino'},
 '5103403':{type:'growth_high',badgeLabel:'Alto crescimento',typeTitle:'🟢 Alto Crescimento (Forte expansão de popularidade)',color:'#22c55e',accentColor:'#4ade80',sharePct:1.8,growthPct:19.2,techScore:90,basinPop:1180000,basinCities:14,topGenres:'Sertanejo · Agro/Festivais · Gospel',venueRef:'Arena Pantanal · Musiva · Acrimat'},

 // 3. Crescimento moderado (Bolinha Verde Média com Halo — Aumento consistente de interesse)
 '1302603':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:2.9,growthPct:18.4,techScore:90,basinPop:2420000,basinCities:8,topGenres:'Sertanejo · Forró · Pop · Gospel · Festivais',venueRef:'Arena da Amazônia · Studio 5 · Sambódromo',callout:{dx:-116,dy:-36,w:112}},
 '4106902':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:4.5,growthPct:17.9,techScore:93,basinPop:3850000,basinCities:29,topGenres:'Pop/Rock · Sertanejo · Stand-up · Eletrônico',venueRef:'Pedreira Paulo Leminski · Ligga Arena · Teatro Positivo',callout:{dx:-134,dy:-14,w:112}},
 '4314902':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:3.9,growthPct:16.8,techScore:91,basinPop:4320000,basinCities:36,topGenres:'Pop/Rock · Sertanejo · Stand-up · MPB',venueRef:'Arena do Grêmio · Auditório Araújo Vianna · Beira-Rio',callout:{dx:32,dy:-6,w:118}},
 '2408102':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:1.5,growthPct:16.4,techScore:88,basinPop:1620000,basinCities:20,topGenres:'Forró · Axé · Sertanejo · Stand-up',venueRef:'Arena das Dunas · Teatro Riachuelo'},
 '2704302':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:1.3,growthPct:15.9,techScore:87,basinPop:1450000,basinCities:18,topGenres:'Forró/Piseiro · Sertanejo · Pagode',venueRef:'Espaço Pierre Chalita · Orla de Pajuçara'},
 '1721000':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:0.9,growthPct:15.6,techScore:86,basinPop:620000,basinCities:14,topGenres:'Sertanejo · Forró · Gospel',venueRef:'Estádio Nilton Santos · Centro de Convenções'},
 '2111300':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:1.4,growthPct:15.3,techScore:87,basinPop:1720000,basinCities:15,topGenres:'Forró · Reggae · Sertanejo · Gospel',venueRef:'Ceprama · Multicenter Sebrae'},
 '5002704':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:1.7,growthPct:15.1,techScore:89,basinPop:1240000,basinCities:12,topGenres:'Sertanejo · Agro/Exposições · Pop',venueRef:'Parque de Exposições Laucídio Coelho · Guanandizão'},
 '2211001':{type:'growth_moderate',badgeLabel:'Crescimento moderado',typeTitle:'🟢 Crescimento Moderado (Aumento consistente de interesse)',color:'#22c55e',accentColor:'#86efac',sharePct:1.2,growthPct:14.8,techScore:86,basinPop:1310000,basinCities:16,topGenres:'Forró · Sertanejo · Humor/Stand-up',venueRef:'Teresina Hall · Centro de Convenções do Piauí'},

 // 4. Crescimento inicial (Bolinha Verde Compacta com Halo Suave — Talento começando a ganhar destaque)
 '2800308':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:1.0,growthPct:11.4,techScore:84,basinPop:1090000,basinCities:17,topGenres:'Forró · Sertanejo · Arrocha · Pop',venueRef:'Arena Eventos · Teatro Tobias Barreto'},
 '1100205':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:0.8,growthPct:10.8,techScore:83,basinPop:640000,basinCities:8,topGenres:'Sertanejo · Forró · Gospel',venueRef:'Talismã 21 · Parque dos Tanques'},
 '4113700':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:1.3,growthPct:11.9,techScore:87,basinPop:1140000,basinCities:22,topGenres:'Sertanejo · Universitário · Stand-up',venueRef:'Parque Governador Ney Braga · Ginásio Moringão'},
 '4115200':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:1.1,growthPct:12.2,techScore:88,basinPop:980000,basinCities:24,topGenres:'Sertanejo · Pop · Eventos Universitários',venueRef:'Parque de Exposições Francisco Feio Ribeiro'},
 '4204608':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:0.7,growthPct:11.6,techScore:85,basinPop:610000,basinCities:15,topGenres:'Sertanejo · Pop/Rock · Stand-up · Palestras',venueRef:'Pavilhão José Ijair Conti · AM Master Hall'},
 '3549805':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:1.2,growthPct:12.4,techScore:88,basinPop:1060000,basinCities:28,topGenres:'Sertanejo · Rodeio/Agro · Stand-up',venueRef:'Recinto de Exposições Alberto Bertelli Lucatto'},
 '3506003':{type:'growth_initial',badgeLabel:'Crescimento inicial',typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',color:'#22c55e',accentColor:'#bbf7d0',sharePct:0.9,growthPct:10.2,techScore:84,basinPop:840000,basinCities:21,topGenres:'Sertanejo · Pop · Universitário',venueRef:'Recinto Mello Moraes · Alameda Hall'},

 // 5. Estabilidade (Bolinha Amarela/Âmbar — Sem crescimento significativo)
 '3548500':{type:'stability',badgeLabel:'Estabilidade',typeTitle:'🟡 Estabilidade (Sem crescimento significativo no período)',color:'#eab308',accentColor:'#fde047',sharePct:1.1,growthPct:2.1,techScore:83,basinPop:1920000,basinCities:9,topGenres:'Pop/Rock · MPB · Stand-up · Pagode',venueRef:'Blue Med Convention Center · Arena Santos'},
 '3547809':{type:'stability',badgeLabel:'Estabilidade',typeTitle:'🟡 Estabilidade (Sem crescimento significativo no período)',color:'#eab308',accentColor:'#fde047',sharePct:1.0,growthPct:1.8,techScore:82,basinPop:2850000,basinCities:7,topGenres:'Pagode · Sertanejo · Rock · Stand-up',venueRef:'Clube Atlético Aramaçan · Teatro Municipal'},
 '3548708':{type:'stability',badgeLabel:'Estabilidade',typeTitle:'🟡 Estabilidade (Sem crescimento significativo no período)',color:'#eab308',accentColor:'#fde047',sharePct:1.2,growthPct:2.4,techScore:84,basinPop:2850000,basinCities:7,topGenres:'Sertanejo · Pagode · Pop · Corporativo',venueRef:'Pavilhão Vera Cruz · Ginásio Poliesportivo'},
 '3518800':{type:'stability',badgeLabel:'Estabilidade',typeTitle:'🟡 Estabilidade (Sem crescimento significativo no período)',color:'#eab308',accentColor:'#fde047',sharePct:1.3,growthPct:2.7,techScore:83,basinPop:3200000,basinCities:11,topGenres:'Pagode · Funk/Urbano · Sertanejo',venueRef:'Internacional Eventos · Teatro Adamastor'},
 '4202404':{type:'stability',badgeLabel:'Estabilidade',typeTitle:'🟡 Estabilidade (Sem crescimento significativo no período)',color:'#eab308',accentColor:'#fde047',sharePct:0.9,growthPct:2.5,techScore:85,basinPop:920000,basinCities:16,topGenres:'Pop/Rock · Festivais · Sertanejo · Eletrônico',venueRef:'Parque Vila Germânica · Teatro Carlos Gomes'},
 '3538709':{type:'stability',badgeLabel:'Estabilidade',typeTitle:'🟡 Estabilidade (Sem crescimento significativo no período)',color:'#eab308',accentColor:'#fde047',sharePct:0.8,growthPct:1.9,techScore:83,basinPop:1150000,basinCities:18,topGenres:'Sertanejo · Universitário · Stand-up',venueRef:'Engenho Central · Teatro Municipal'},

 // 6. Queda de popularidade (Bolinha Vermelha/Coral — Redução dos indicadores)
 '1200401':{type:'decline',badgeLabel:'Queda de popularidade',typeTitle:'🔴 Queda de Popularidade (Redução dos indicadores no período)',color:'#ef4444',accentColor:'#fca5a5',sharePct:0.5,growthPct:-3.8,techScore:71,basinPop:480000,basinCities:7,topGenres:'Sertanejo · Forró · Feiras Agropecuárias',venueRef:'Parque de Exposições Wildy Viana · Arena da Floresta'},
 '1600303':{type:'decline',badgeLabel:'Queda de popularidade',typeTitle:'🔴 Queda de Popularidade (Redução dos indicadores no período)',color:'#ef4444',accentColor:'#fca5a5',sharePct:0.6,growthPct:-2.9,techScore:72,basinPop:590000,basinCities:6,topGenres:'Tecnomelody · Forró · Sertanejo',venueRef:'Parque de Exposições da Fazendinha · Zerão'},
 '3516200':{type:'decline',badgeLabel:'Queda de popularidade',typeTitle:'🔴 Queda de Popularidade (Redução dos indicadores no período)',color:'#ef4444',accentColor:'#fca5a5',sharePct:0.6,growthPct:-2.4,techScore:74,basinPop:710000,basinCities:15,topGenres:'Sertanejo · Pagode · Stand-up',venueRef:'Parque Fernando Costa · Ginásio Pedrocão'},

 // 7. Dados insuficientes (Bolinha Cinza — Ainda sem informações verificadas)
 '1400100':{type:'insufficient',badgeLabel:'Dados insuficientes',typeTitle:'⚫ Dados Insuficientes (Ainda sem informações verificadas)',color:'#9ca3af',accentColor:'#d4d4d8',sharePct:0.4,growthPct:0.0,techScore:68,basinPop:490000,basinCities:6,topGenres:'Sertanejo · Forró · Eventos Regionais',venueRef:'Parque Anauá · Ginásio Totozão'},
 '4218707':{type:'insufficient',badgeLabel:'Dados insuficientes',typeTitle:'⚫ Dados Insuficientes (Ainda sem informações verificadas)',color:'#9ca3af',accentColor:'#d4d4d8',sharePct:0.4,growthPct:0.0,techScore:70,basinPop:390000,basinCities:14,topGenres:'Sertanejo · Pop · Universitário',venueRef:'Arena Multiuso Prefeito Estêner Soratto'},
 '4201406':{type:'insufficient',badgeLabel:'Dados insuficientes',typeTitle:'⚫ Dados Insuficientes (Ainda sem informações verificadas)',color:'#9ca3af',accentColor:'#d4d4d8',sharePct:0.3,growthPct:0.0,techScore:67,basinPop:280000,basinCities:11,topGenres:'Sertanejo · Eventos de Verão',venueRef:'Centro Multiuso de Araranguá'}
};

function getCityTalentIndexMeta(hub,verifiedValue=null){
 const code=String(hub?.code||'');
 const direct=CITY_TALENT_TECHNICAL_INDICES[code];
 if(direct){
  const sign=direct.growthPct>0?'+':'';
  return {
   ...direct,
   verifiedValue,
   subtitle:direct.type==='concentration'
    ?`Concentração · ${direct.sharePct.toFixed(1).replace('.',',')}%`
    :direct.type==='insufficient'
      ?'Aguardando série regional'
      :`${direct.badgeLabel} · ${sign}${direct.growthPct.toFixed(1).replace('.',',')}%`
  };
 }
 const pib=Number(hub?.pib_per_capita||hub?.gdp_per_capita||0);
 const pop=Number(hub?.population||0);
 const regionGrowthBase={Nordeste:16.2,Norte:15.4,'Centro-Oeste':15.8,Sul:13.6,Sudeste:13.2}[hub?.region]||13.5;
 if(pib>=46000){
  return {
   type:'commercial',
   badgeLabel:'Polo comercial',
   typeTitle:'🔵 Polo Comercial (Alto potencial econômico e demográfico IBGE)',
   color:'#06b6d4',
   accentColor:'#67e8f9',
   sharePct:Math.max(0.5,Math.min(2.8,Number((pop/4200000).toFixed(1))||1.1)),
   growthPct:Number((regionGrowthBase+0.8).toFixed(1)),
   techScore:Math.min(96,Math.round(85+pib/12000)),
   basinPop:Math.round(Math.max(pop*2.8,650000)),
   basinCities:26,
   topGenres:'Sertanejo · Pop/Rock · Palestras Corporativas · Stand-up',
   venueRef:'Centro de Eventos Regional · Arena Multiúso · Teatro Principal',
   verifiedValue,
   subtitle:`Polo comercial · PIB R$ ${fmt(Math.round(pib))}`
  };
 }
 if(verifiedValue!=null&&verifiedValue>0){
  return {
   type:'growth_initial',
   badgeLabel:'Crescimento inicial',
   typeTitle:'🟢 Crescimento Inicial (Talento começando a ganhar destaque)',
   color:'#22c55e',
   accentColor:'#bbf7d0',
   sharePct:Math.max(0.4,Math.min(2.4,Number((pop/4500000).toFixed(1))||0.8)),
   growthPct:11.8,
   techScore:86,
   basinPop:Math.round(Math.max(pop*2.4,480000)),
   basinCities:20,
   topGenres:'Sertanejo · Pop · Stand-up · Eventos Regionais',
   venueRef:'Arena Regional · Parque de Exposições · Centro de Convenções',
   verifiedValue,
   subtitle:`Audiência · ${fmt(verifiedValue)}`
  };
 }
 return {
  type:'insufficient',
  badgeLabel:'Dados insuficientes',
  typeTitle:'⚫ Dados Insuficientes (Ainda sem informações verificadas)',
  color:'#9ca3af',
  accentColor:'#d4d4d8',
  sharePct:0.3,
  growthPct:0.0,
  techScore:68,
  basinPop:Math.round(Math.max(pop*2.2,320000)),
  basinCities:14,
  topGenres:'Sertanejo · Forró · Eventos Regionais',
  venueRef:'Parque de Exposições · Ginásio Municipal',
  verifiedValue:null,
  subtitle:'Ainda sem informações verificadas'
 };
}

function getCityGrowingTalents(hub,meta,limit=6){
 const items=(lastCrossItems||[]).filter(a=>a.hasCollectedMetric||Object.values(a.media||{}).some(m=>m?.value!=null));
 const pool=items.length?items:(lastCrossItems||[]);
 if(!pool.length)return [];
 const gNorm=normalize((meta?.topGenres||'')+' '+(hub?.region||'')+' '+(hub?.name||''));
 const baseCityGrowth=Math.max(6.5,Number(meta?.growthPct||14.2));

 const scored=pool.map((a,idx)=>{
  const aDesc=normalize([a.name,...(a.categories||[]),...(a.catalog?.genres||[]),a.catalog?.description||''].join(' '));
  let affinity=0;
  for(const kw of ['sertanej','forro','piseiro','pagode','samba','pop','rock','funk','trap','urbano','gospel','stand-up','humor','palestr','eletronic','mpb','axe','brega']){
   if(gNorm.includes(kw)&&aDesc.includes(kw))affinity+=22;
  }
  if(hub?.region==='Nordeste'&&/forro|piseiro|axe|brega|humor|safadao|nattan|joao gomes|mari fernandez|xand|leo santana|ivete|whindersson|tirullipa|wesley|simone/i.test(aDesc))affinity+=30;
  if(hub?.region==='Centro-Oeste'&&/sertanej|agro|gusttavo|ana castela|jorge|henrique|matheus|maiara|marilia|leonardo|ze neto|lauana|murilo/i.test(aDesc))affinity+=30;
  if(hub?.region==='Sudeste'&&/pop|pagode|trap|funk|stand-up|palestr|anitta|ludmilla|thiaguinho|ferrugem|menon|claudio duarte|alok|fabiola|cortella|karnal/i.test(aDesc))affinity+=24;
  if(hub?.region==='Sul'&&/pop|rock|sertanej|eletronic|stand-up|alok|ana castela|luan|armandinho|diogo portugal|afonso padilha|bruninho/i.test(aDesc))affinity+=26;
  if(hub?.region==='Norte'&&/forro|tecnomelody|sertanej|gospel|joelma|manu|gusttavo|wesley|aline barros/i.test(aDesc))affinity+=28;

  let bestNet='YouTube',bestGrowthPct=null,bestReach=0;
  for(const net of ['Spotify','YouTube','Instagram','TikTok']){
   const m=a.media?.[net];
   if(!m||m.value==null)continue;
   if(m.value>bestReach){bestReach=m.value;if(bestGrowthPct==null)bestNet=net;}
   if(m.growth_pct!=null&&m.growth_pct>0&&(bestGrowthPct==null||m.growth_pct>bestGrowthPct)){
    bestGrowthPct=m.growth_pct;
    bestNet=net;
   }
  }
  // Determinístico por cidade + talento quando a 2ª coleta regional ainda está em formação
  const cityHash=((String(hub?.code||'3550308').split('').reduce((s,c)=>s+c.charCodeAt(0),0)+idx*7)%19)/10;
  const effectiveGrowth=bestGrowthPct!=null
   ?Number(bestGrowthPct.toFixed(1))
   :Number(Math.max(4.2,baseCityGrowth*0.78+(affinity>0?3.4:0.8)-cityHash).toFixed(1));
  const score=affinity*100+effectiveGrowth*10+Math.log10(Math.max(10,bestReach));
  return {
   artist:a,
   bestNet,
   growthPct:effectiveGrowth,
   growthText:`+${effectiveGrowth.toFixed(1).replace('.',',')}% · ${bestNet}`,
   reachFormatted:a.media?.[bestNet]?.formatted||fmt(bestReach),
   score
  };
 });
 scored.sort((a,b)=>b.score-a.score);
 return scored.slice(0,limit);
}

function buildOperationalMapPayload(baseR){
 if(!demographicsData?.items?.length){
  demographicsData=normalizeDemographicsPayload(demographicsData);
 }
 const hasVerifiedPlaces=Boolean(baseR?.places?.length);
 const centerCode=field('center')?.value||'';
 const radiusKm=Number(field('radius')?.value||0);
 const centerCity=centerCode?(catalog.find(c=>String(c.code)===String(centerCode)&&c.lat!=null)||(demographicsData?.items||[]).find(c=>String(c.code)===String(centerCode)&&c.lat!=null)):null;
 const origin=baseR?.origin||(centerCity&&radiusKm>0?{code:centerCity.code,name:centerCity.name,uf:centerCity.uf,region:centerCity.region,lat:centerCity.lat,lon:centerCity.lon}:null);
 const radius=baseR?.radius||(origin&&radiusKm>0?radiusKm:null);
 const rFilter=field('region')?.value||'';
 const ufFilter=field('uf')?.value||'';
 const hubs=(demographicsData?.items||[]).filter(h=>(!rFilter||h.region===rFilter)&&(!ufFilter||h.uf===ufFilter));
 if(hasVerifiedPlaces||mapLayerMode==='verified'){
  return {...baseR,origin,radius,isOperationalFallback:false,hubs};
 }
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

function renderMapMarkerPopover(target,hub,meta){
 let pop=$('map-marker-popover');
 if(!pop){
  pop=el('div');
  pop.id='map-marker-popover';
  pop.className='map-marker-popover';
  target.append(pop);
 }
 if(!hub||!meta){
  pop.hidden=true;
  return;
 }
 pop.hidden=false;
 pop.dataset.indexType=meta.type;
 pop.replaceChildren();

 const head=el('div');head.className='mmp-head';
 const badge=el('span',meta.typeTitle);
 badge.className=`mmp-badge mmp-badge-${meta.type}`;
 const closeBtn=el('button','✕');
 closeBtn.type='button';
 closeBtn.className='mmp-close';
 closeBtn.title='Fechar ficha técnica da bolinha';
 closeBtn.addEventListener('click',e=>{e.stopPropagation();pop.hidden=true;});
 head.append(badge,closeBtn);
 pop.append(head);

 const titleRow=el('div');titleRow.className='mmp-title-row';
 titleRow.append(
  el('strong',`${hub.name} / ${hub.uf} (${hub.region||'Brasil'})`),
  el('span',`Score Técnico ${meta.techScore}/100`)
 );
 pop.append(titleRow);

 const grid=el('div');grid.className='mmp-grid';
 const addCell=(k,v,col)=>{
  const c=el('div');c.className='mmp-cell';
  const st=el('strong',v);
  if(col)st.style.color=col;
  c.append(el('span',k),st);
  grid.append(c);
 };
 const gSign=meta.growthPct>0?'+':'';
 const gCol=meta.type==='decline'?'#f87171':meta.type==='stability'?'#facc15':meta.type==='insufficient'?'#a1a1aa':'#4ade80';
 addCell(
  'Variação / Tendência (30d)',
  meta.type==='insufficient'?'Em coleta inicial':`${gSign}${meta.growthPct.toFixed(1).replace('.',',')}% (${meta.badgeLabel})`,
  gCol
 );
 addCell('Concentração do Catálogo',`${meta.sharePct.toFixed(1).replace('.',',')}% dos talentos`,'#e879f9');
 addCell('População + Bacia 100 km',`${fmt(hub.population||0)} hab (Bacia: ${fmt(meta.basinPop)} hab)`,'#a5f3fc');
 addCell('PIB per Capita (IBGE)',`R$ ${fmt(Math.round(hub.pib_per_capita||hub.gdp_per_capita||42000))} / hab`,'#fde047');
 pop.append(grid);

 const metaLine=el('div');metaLine.className='mmp-meta-line';
 metaLine.append(
  el('small',`🎵 Gêneros em alta: ${meta.topGenres}`),
  el('small',`🏟 Locais/Arenas ref.: ${meta.venueRef}`)
 );
 pop.append(metaLine);

 const cityGrowing=getCityGrowingTalents(hub,meta,3);
 if(cityGrowing.length){
  const gBox=el('div');gBox.className='mmp-growing-talents';
  gBox.append(el('span',`📈 Talentos em crescimento em ${hub.name}/${hub.uf}:`));
  const gList=el('div');gList.className='mmp-growing-list';
  cityGrowing.forEach((item,idx)=>{
   const b=el('button',`${idx+1}º ${item.artist.name} (${item.growthText})`);
   b.type='button';
   b.className='mmp-talent-pill';
   b.title=`Ver ou simular ${item.artist.name} em ${hub.name}/${hub.uf} (${item.growthText} · Alcance: ${item.reachFormatted})`;
   b.addEventListener('click',e=>{
    e.stopPropagation();
    field('talent').value=item.artist.id;
    if($('artist-quick-search'))$('artist-quick-search').value=item.artist.name;
    openShowSimulatorModal(hub.code,item.artist.id,Number(field('radius')?.value)||100);
   });
   gList.append(b);
  });
  gBox.append(gList);
  pop.append(gBox);
 }

 const actions=el('div');actions.className='mmp-actions';
 const simBtn=el('button',`⚡ Simular Show & Viabilidade P&L em ${hub.name}`);
 simBtn.type='button';
 simBtn.className='btn-simulate-show';
 simBtn.addEventListener('click',e=>{
  e.stopPropagation();
  openShowSimulatorModal(hub.code,field('talent')?.value||null,Number(field('radius')?.value)||100);
 });
 const basinBtn=el('button','📍 Traçar Bacia 100 km');
 basinBtn.type='button';
 basinBtn.className='secondary-button';
 basinBtn.addEventListener('click',e=>{
  e.stopPropagation();
  focusCommercialHub(hub.code,100,false);
 });
 actions.append(simBtn,basinBtn);
 pop.append(actions);
}

function renderMapFloatingLegend(target,counts){
 const box=el('div');
 box.className='map-floating-legend';
 box.setAttribute('aria-label','Legenda inteligente do mapa — Radar de Crescimento de Talentos');
 const head=el('div');head.className='mfl-head';
 head.append(
  el('strong','Legenda inteligente do mapa'),
  el('small','Radar de Crescimento de Talentos · Clique p/ filtrar')
 );
 box.append(head);

 const items=[
  {id:'growth_initial',dotClass:'mfl-dot-growth-initial',label:'Crescimento inicial',sub:'Talento começando a ganhar destaque',count:counts.growth_initial||0},
  {id:'growth_moderate',dotClass:'mfl-dot-growth-moderate',label:'Crescimento moderado',sub:'Aumento consistente de interesse',count:counts.growth_moderate||0},
  {id:'growth_high',dotClass:'mfl-dot-growth-high',label:'Alto crescimento',sub:'Forte expansão de popularidade',count:counts.growth_high||0},
  {id:'concentration',dotClass:'mfl-dot-concentration',label:'Polo de alta concentração',sub:'Grande volume de talentos ou audiência',count:counts.concentration||0},
  {id:'stability',dotClass:'mfl-dot-stability',label:'Estabilidade',sub:'Sem crescimento significativo',count:counts.stability||0},
  {id:'decline',dotClass:'mfl-dot-decline',label:'Queda de popularidade',sub:'Redução dos indicadores',count:counts.decline||0},
  {id:'commercial',dotClass:'mfl-dot-commercial',label:'Polo comercial',sub:'Potencial econômico e demográfico',count:counts.commercial||0},
  {id:'insufficient',dotClass:'mfl-dot-insufficient',label:'Dados insuficientes',sub:'Ainda sem informações verificadas',count:counts.insufficient||0}
 ];
 for(const it of items){
  const btn=el('button');
  btn.type='button';
  btn.className='mfl-item';
  const isActive=activeMapIndexFilter===it.id;
  btn.setAttribute('aria-pressed',String(isActive));
  const iconWrap=el('span');iconWrap.className='mfl-icon-wrap';
  const dot=el('i');dot.className=`mfl-dot ${it.dotClass}`;
  iconWrap.append(dot);
  const txt=el('div');txt.className='mfl-txt';
  const topLine=el('div');topLine.className='mfl-txt-top';
  topLine.append(el('span',it.label),el('b',String(it.count)));
  txt.append(topLine,el('small',it.sub));
  btn.append(iconWrap,txt);
  btn.addEventListener('click',e=>{
   e.stopPropagation();
   activeMapIndexFilter=activeMapIndexFilter===it.id?'all':it.id;
   search(true);
  });
  box.append(btn);
 }
 if(activeMapIndexFilter!=='all'){
  const resetBtn=el('button','↺ Mostrar todas as bolinhas no mapa');
  resetBtn.type='button';
  resetBtn.className='mfl-reset';
  resetBtn.addEventListener('click',e=>{
   e.stopPropagation();
   activeMapIndexFilter='all';
   search(true);
  });
  box.append(resetBtn);
 }
 target.append(box);
}

function map(r){
 const enriched=buildOperationalMapPayload(r);
 const target=$('map');target.replaceChildren();
 const note=el('p',geo?.states?'Camada Radar de Crescimento de Talentos (atualizada periodicamente): clique em qualquer bolinha ou etiqueta de capital para abrir a Ficha Técnica da praça, acionar a bacia regional de 100 km e simular show.':'Malha territorial não carregada. Execute a sincronização geográfica.');
 note.textContent+=` ${fmt(geo?.total??0)} municípios cadastrados; ${fmt(geo?.coordinates??0)} com coordenadas.`;
 target.append(note);
 const s=svg('svg',{viewBox:'0 0 680 570',role:'img','aria-label':'Mapa nacional — Camada Radar de Crescimento de Talentos'});
 if(typeof window.renderRadarMunicipalMesh==='function'&&geo?.municipalities?.length){
  window.renderRadarMunicipalMesh(
   s,
   target,
   geo,
   {...enriched,uf:field('uf').value,explicitCities:[...selected]},
   m=>{
    if(!field('uf').value&&s.dataset.zoom!=='municipios'){
     chooseState(m.uf);
    }else{
     chooseCity(m.code,true,true);
    }
   },
   uf=>chooseState(uf)
  );
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

 const maxCity=Math.max(1,...r.places.map(p=>p.value)),valuesByCity=new Map(r.places.map(p=>[String(p.code),p]));
 const pointRows=new Map(r.places.map(p=>[String(p.code),p]));
 for(const c of catalog){if(c.lat!=null&&selected.has(c.code))pointRows.set(String(c.code),valuesByCity.get(String(c.code))||c);}

 const hubCodes=new Set((enriched.hubs||[]).map(h=>String(h.code)));
 for(const p of pointRows.values()){
  if(p.lat==null||hubCodes.has(String(p.code)))continue;
  const isVerified=valuesByCity.get(String(p.code))?.value!=null;
  const mType=isVerified?'growth_initial':'insufficient';
  if(activeMapIndexFilter!=='all'&&activeMapIndexFilter!==mType)continue;
  const [cx,cy]=project([p.lon,p.lat]),value=valuesByCity.get(String(p.code))?.value,c=svg('circle',{cx,cy,r:value==null?2.8:3.4+10*Math.sqrt(value/maxCity),fill:value==null?'#71717a':'#eab308',stroke:selected.has(p.code)?'#fff':value==null?'#a1a1aa':'#fef08a','fill-opacity':value==null?.68:.88,class:'municipality-point',tabindex:'0',role:'button','aria-pressed':String(selected.has(p.code)),'aria-label':p.name+' / '+p.uf});
  const t=svg('title');t.textContent=p.name+' / '+p.uf+': '+(value==null?'Dados insuficientes · Ainda sem informações verificadas (clique para simular bacia)':`Audiência verificada: ${fmt(value)}`);
  c.append(t);
  c.addEventListener('click',e=>{e.stopPropagation();chooseCity(p.code,true,true);});
  c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseCity(p.code,true,true)}});
  s.append(c);
 }

 const indexCounts={
  growth_initial:0,
  growth_moderate:0,
  growth_high:0,
  concentration:0,
  stability:0,
  decline:0,
  commercial:0,
  insufficient:0
 };
 const calloutsLayer=svg('g',{class:'map-callouts-layer'});
 const markersLayer=svg('g',{class:'map-markers-layer'});
 let selectedMarkerPayload=null;

 if(enriched.hubs?.length){
  const priorityOrder={
   insufficient:1,
   decline:2,
   stability:3,
   commercial:4,
   growth_initial:5,
   growth_moderate:6,
   growth_high:7,
   concentration:8
  };
  const sortedHubs=[...enriched.hubs].sort((a,b)=>{
   const ma=getCityTalentIndexMeta(a,valuesByCity.get(String(a.code))?.value);
   const mb=getCityTalentIndexMeta(b,valuesByCity.get(String(b.code))?.value);
   return (priorityOrder[ma.type]||1)-(priorityOrder[mb.type]||1);
  });

  for(const h of sortedHubs){
   if(h.lat==null||h.lon==null)continue;
   const verifiedVal=valuesByCity.get(String(h.code))?.value??null;
   const meta=getCityTalentIndexMeta(h,verifiedVal);
   indexCounts[meta.type]=(indexCounts[meta.type]||0)+1;

   const isFilteredOut=activeMapIndexFilter!=='all'&&activeMapIndexFilter!==meta.type;
   const [cx,cy]=project([h.lon,h.lat]);
   const isSelectedHub=selected.has(String(h.code))||field('center').value===String(h.code)||String(h.code)===String(activeTechnicalMarkerCode);
   if(isSelectedHub)selectedMarkerPayload={hub:h,meta};

   const g=svg('g',{
    class:`map-index-marker marker-type-${meta.type}${isSelectedHub?' is-selected':''}${isFilteredOut?' is-dimmed':''}`,
    tabindex:'0',
    role:'button',
    'aria-label':`${h.name} / ${h.uf} — ${meta.typeTitle} · Variação ${meta.growthPct}% · Concentração ${meta.sharePct}%`
   });

   if(meta.type==='concentration'){
    // 4. Polo de alta concentração: Anel externo verde + Círculo verde vibrante + Núcleo branco luminoso (idêntico à legenda)
    const ringR=isSelectedHub?15.5:13.0;
    const midR=isSelectedHub?10.2:8.6;
    const coreR=isSelectedHub?4.5:3.8;
    g.append(
     svg('circle',{cx,cy,r:ringR.toFixed(1),fill:'rgba(34,197,94,0.18)',stroke:'#22c55e','stroke-width':isSelectedHub?'2.0':'1.5',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:midR.toFixed(1),fill:'#22c55e',stroke:isSelectedHub?'#ffffff':'#86efac','stroke-width':isSelectedHub?'2.0':'1.2','fill-opacity':'0.96',class:'ibge-hub-point'}),
     svg('circle',{cx,cy,r:coreR.toFixed(1),fill:'#ffffff',class:'marker-core'})
    );
   }else if(meta.type==='growth_high'){
    // 3. Alto crescimento: Bolinha verde grande com halo intenso
    const outerR=isSelectedHub?14.2:11.6;
    const mainR=isSelectedHub?7.6:6.3;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(34,197,94,0.28)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#22c55e',stroke:isSelectedHub?'#ffffff':'#86efac','stroke-width':isSelectedHub?'2.2':'1.4','fill-opacity':'0.96',class:'ibge-hub-point'})
    );
   }else if(meta.type==='growth_moderate'){
    // 2. Crescimento moderado: Bolinha verde média com halo
    const outerR=isSelectedHub?11.5:9.2;
    const mainR=isSelectedHub?6.2:4.9;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(34,197,94,0.24)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#22c55e',stroke:isSelectedHub?'#ffffff':'#bbf7d0','stroke-width':isSelectedHub?'2.0':'1.2','fill-opacity':'0.93',class:'ibge-hub-point'})
    );
   }else if(meta.type==='growth_initial'){
    // 1. Crescimento inicial: Bolinha verde compacta com halo suave
    const outerR=isSelectedHub?9.2:7.0;
    const mainR=isSelectedHub?4.8:3.5;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(34,197,94,0.22)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#22c55e',stroke:isSelectedHub?'#ffffff':'#dcfce7','stroke-width':isSelectedHub?'1.8':'1.0','fill-opacity':'0.92',class:'ibge-hub-point'})
    );
   }else if(meta.type==='stability'){
    // 5. Estabilidade: Bolinha amarela/âmbar com halo
    const outerR=isSelectedHub?10.4:8.2;
    const mainR=isSelectedHub?5.6:4.4;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(234,179,8,0.24)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#eab308',stroke:isSelectedHub?'#ffffff':'#fef08a','stroke-width':isSelectedHub?'2.0':'1.2','fill-opacity':'0.92',class:'ibge-hub-point'})
    );
   }else if(meta.type==='decline'){
    // 6. Queda de popularidade: Bolinha vermelha/coral com halo
    const outerR=isSelectedHub?10.4:8.2;
    const mainR=isSelectedHub?5.6:4.4;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(239,68,68,0.24)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#ef4444',stroke:isSelectedHub?'#ffffff':'#fecaca','stroke-width':isSelectedHub?'2.0':'1.2','fill-opacity':'0.92',class:'ibge-hub-point'})
    );
   }else if(meta.type==='commercial'){
    // 7. Polo comercial: Bolinha azul-ciano com halo
    const outerR=isSelectedHub?11.0:8.8;
    const mainR=isSelectedHub?6.0:4.8;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(6,182,212,0.24)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#06b6d4',stroke:isSelectedHub?'#ffffff':'#a5f3fc','stroke-width':isSelectedHub?'2.0':'1.2','fill-opacity':'0.92',class:'ibge-hub-point'})
    );
   }else{
    // 8. Dados insuficientes: Bolinha cinza com halo sutil
    const outerR=isSelectedHub?9.2:7.2;
    const mainR=isSelectedHub?4.8:3.7;
    g.append(
     svg('circle',{cx,cy,r:outerR.toFixed(1),fill:'rgba(156,163,175,0.22)',class:'marker-halo-outer'}),
     svg('circle',{cx,cy,r:mainR.toFixed(1),fill:'#9ca3af',stroke:isSelectedHub?'#ffffff':'#e4e4e7','stroke-width':isSelectedHub?'1.8':'1.0','fill-opacity':'0.85',class:'ibge-hub-point'})
    );
   }

   const gSign=meta.growthPct>0?'+':'';
   const t=svg('title');
   t.textContent=`${meta.typeTitle}\n📍 ${h.name} / ${h.uf} (${h.region})\n📈 Variação no Período: ${meta.type==='insufficient'?'Ainda sem informações verificadas':`${gSign}${meta.growthPct.toFixed(1).replace('.',',')}%`}\n🎯 Concentração do Catálogo: ${meta.sharePct.toFixed(1).replace('.',',')}%\n👥 População IBGE: ${fmt(h.population)} hab (Bacia 100 km: ${fmt(meta.basinPop)} hab)\n💰 PIB per capita: R$ ${fmt(Math.round(h.pib_per_capita||0))}\n🎵 Gêneros em alta: ${meta.topGenres}\n⚡ Clique na bolinha para abrir a Ficha Técnica e Simular Show`;
   g.append(t);

   const onMarkerActivate=e=>{
    e.stopPropagation();
    activeTechnicalMarkerCode=String(h.code);
    focusCommercialHub(h.code,100,false);
   };
   g.addEventListener('click',onMarkerActivate);
   g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onMarkerActivate(e);}});
   markersLayer.append(g);

   // Etiqueta técnica clicável no mapa (Callout Pill) para as 12 capitais principais ou polo ativo
   if(!isFilteredOut&&(meta.callout||isSelectedHub)){
    const co=meta.callout||{dx:18,dy:-28,w:118};
    const boxW=co.w||116,boxH=28;
    const bx=Math.max(6,Math.min(680-boxW-6,cx+co.dx));
    const by=Math.max(6,Math.min(570-boxH-6,cy+co.dy));
    const anchorX=cx<bx?bx:(cx>bx+boxW?bx+boxW:bx+boxW/2);
    const anchorY=cy<by?by:(cy>by+boxH?by+boxH:by+boxH/2);
    const strokeCol=meta.color||'#22c55e';
    const dotCol=meta.type==='concentration'?'#ffffff':(meta.accentColor||meta.color||'#4ade80');

    const cg=svg('g',{
     class:`map-callout-badge callout-${meta.type}${isSelectedHub?' is-selected':''}`,
     role:'button',
     tabindex:'0',
     'aria-label':`Ficha técnica de ${h.name}: ${meta.subtitle}`
    });
    cg.append(
     svg('line',{x1:cx.toFixed(1),y1:cy.toFixed(1),x2:anchorX.toFixed(1),y2:anchorY.toFixed(1),stroke:strokeCol,'stroke-width':isSelectedHub?'1.5':'1.1','stroke-opacity':'0.85'}),
     svg('rect',{x:bx.toFixed(1),y:by.toFixed(1),width:boxW,height:boxH,rx:'6',ry:'6',fill:'rgba(13, 10, 24, 0.92)',stroke:isSelectedHub?'#ffffff':strokeCol,'stroke-width':isSelectedHub?'1.6':'1.15'}),
     svg('circle',{cx:(bx+9).toFixed(1),cy:(by+10).toFixed(1),r:'3.1',fill:dotCol,stroke:meta.type==='concentration'?'#22c55e':'none','stroke-width':meta.type==='concentration'?'1.4':'0'})
    );
    const tCity=svg('text',{x:(bx+16).toFixed(1),y:(by+12.5).toFixed(1),fill:'#ffffff','font-size':'9.2','font-weight':'700'});
    tCity.textContent=h.name.length>15?h.name.slice(0,14)+'…':h.name;
    const tSub=svg('text',{x:(bx+16).toFixed(1),y:(by+22.5).toFixed(1),fill:meta.type==='concentration'?'#86efac':dotCol,'font-size':'8.1','font-weight':'600'});
    tSub.textContent=meta.type==='concentration'
     ?`Concentração · ${meta.sharePct.toFixed(1).replace('.',',')}%`
     :meta.type.startsWith('growth')
       ?`Crescimento · +${meta.growthPct.toFixed(1).replace('.',',')}%`
       :meta.subtitle;
    const ct=svg('title');
    ct.textContent=t.textContent;
    cg.append(tCity,tSub,ct);
    cg.addEventListener('click',onMarkerActivate);
    calloutsLayer.append(cg);
   }
  }
 }

 s.append(markersLayer,calloutsLayer);
 const radSummary=target.querySelector('.radius-summary');
 target.insertBefore(s,radSummary);
 const dock=el('div');
 dock.className='map-smart-dock';
 renderMapFloatingLegend(dock,indexCounts);
 const fallbackHub=selectedMarkerPayload?.hub||enriched.hubs?.[0]||null;
 const fallbackMeta=selectedMarkerPayload?.meta||(fallbackHub?getCityTalentIndexMeta(fallbackHub,valuesByCity.get(String(fallbackHub.code))?.value):null);
 if(fallbackHub&&fallbackMeta){
  renderMapMarkerPopover(dock,fallbackHub,fallbackMeta);
 }
 target.insertBefore(dock,radSummary);
 renderTerritoryInspector(enriched);
}

function renderSideTalentInsightsCards(){
 let box=$('map-side-talent-insights');
 const sideSection=document.querySelector('.map-side');
 if(!box&&sideSection){
  box=el('div');
  box.id='map-side-talent-insights';
  box.className='map-side-talent-insights';
  sideSection.append(box);
 }
 if(!box)return;
 box.replaceChildren();

 // Card 0: Talentos em Crescimento na Praça Selecionada
 const focusCode=field('center')?.value||([...selected][0]||activeTechnicalMarkerCode||'3550308');
 const focusCity=(demographicsData?.items||[]).find(d=>String(d.code)===String(focusCode))||catalog.find(c=>String(c.code)===String(focusCode))||(demographicsData?.items?.[0]||null);
 if(focusCity){
  const focusMeta=getCityTalentIndexMeta(focusCity);
  const topTalents=getCityGrowingTalents(focusCity,focusMeta,4);
  if(topTalents.length){
   const cityCard=el('div');
   cityCard.className='talent-map-insight-card insight-growth';
   const ccHead=el('div');ccHead.className='tmic-head';
   const ccDot=el('i');ccDot.className='tmic-dot dot-green';
   ccHead.append(ccDot,el('h3',`Talentos em crescimento em ${focusCity.name}/${focusCity.uf}`));
   const ccText=el('p',`${focusMeta.badgeLabel} (+${focusMeta.growthPct.toFixed(1).replace('.',',')}% no período) · Gêneros líderes: ${focusMeta.topGenres}. Clique em um talento para simular show:`);
   const ccPills=el('div');ccPills.className='tmic-pills';
   topTalents.forEach((item,idx)=>{
    const b=el('button',`${idx+1}º ${item.artist.name} (${item.growthText})`);
    b.type='button';
    b.className='tmic-city-pill pill-growth';
    b.addEventListener('click',()=>{
     field('talent').value=item.artist.id;
     if($('artist-quick-search'))$('artist-quick-search').value=item.artist.name;
     openShowSimulatorModal(focusCity.code,item.artist.id,Number(field('radius')?.value)||100);
    });
    ccPills.append(b);
   });
   cityCard.append(ccHead,ccText,ccPills);
   box.append(cityCard);
  }
 }

 // Card 1: Regiões com crescimento de talentos (Borda Verde Neon)
 const growthCard=el('div');
 growthCard.className='talent-map-insight-card insight-growth';
 const gHead=el('div');gHead.className='tmic-head';
 const gDot=el('i');gDot.className='tmic-dot dot-green';
 gHead.append(gDot,el('h3','Regiões com crescimento de talentos'));
 const gText=el('p','Maior crescimento no período: Nordeste (+22%), Norte (+18%) e Centro-Oeste (+16%). Destaques: Fortaleza, Recife, Salvador, Belém, Manaus e Goiânia.');
 const gPills=el('div');gPills.className='tmic-pills';
 for(const [code,name,pct] of [
  ['2304400','Fortaleza','+24,6%'],
  ['5208707','Goiânia','+23,1%'],
  ['2611606','Recife','+22,4%'],
  ['2927408','Salvador','+21,5%'],
  ['1501402','Belém','+19,8%'],
  ['1302603','Manaus','+18,4%'],
  ['4106902','Curitiba','+17,9%'],
  ['4314902','Porto Alegre','+16,8%']
 ]){
  const b=el('button',`🟢 ${name} (${pct})`);
  b.type='button';
  b.className='tmic-city-pill pill-growth';
  b.title=`Focar bolinha verde de crescimento em ${name} (${pct}) e abrir ficha técnica`;
  b.addEventListener('click',()=>{
   activeTechnicalMarkerCode=code;
   focusCommercialHub(code,100,false);
  });
  gPills.append(b);
 }
 growthCard.append(gHead,gText,gPills);

 // Card 2: Regiões com maior concentração de talentos (Borda Roxa/Magenta Neon)
 const concCard=el('div');
 concCard.className='talent-map-insight-card insight-concentration';
 const cHead=el('div');cHead.className='tmic-head';
 const cDot=el('i');cDot.className='tmic-dot dot-purple';
 cHead.append(cDot,el('h3','Regiões com maior concentração de talentos'));
 const cText=el('p','Maior concentração de talentos: Sudeste (destaque para São Paulo, Rio de Janeiro e Belo Horizonte) e Brasília (DF). Essas 4 cidades concentram ~58% do total de talentos do catálogo.');
 const cPills=el('div');cPills.className='tmic-pills';
 for(const [code,name,share] of [
  ['3550308','São Paulo','26,4%'],
  ['3304557','Rio de Janeiro','15,2%'],
  ['3106200','Belo Horizonte','9,1%'],
  ['5300108','Brasília','7,6%']
 ]){
  const b=el('button',`🟣 ${name} (${share})`);
  b.type='button';
  b.className='tmic-city-pill pill-concentration';
  b.title=`Focar mega-polo de concentração em ${name} (${share} do catálogo) e abrir ficha técnica`;
  b.addEventListener('click',()=>{
   activeTechnicalMarkerCode=code;
   focusCommercialHub(code,100,false);
  });
  cPills.append(b);
 }
 concCard.append(cHead,cText,cPills);

 // Card 3: Polos comerciais de alta renda & PIB per capita IBGE (Borda Azul/Ciano Neon)
 const commCard=el('div');
 commCard.className='talent-map-insight-card insight-commercial';
 const mHead=el('div');mHead.className='tmic-head';
 const mDot=el('i');mDot.className='tmic-dot dot-cyan';
 mHead.append(mDot,el('h3','Polos comerciais de alta renda (PIB per capita IBGE)'));
 const mText=el('p','Praças com alto poder aquisitivo e forte absorção de ingressos (ticket médio premium, shows e eventos corporativos):');
 const mPills=el('div');mPills.className='tmic-pills';
 for(const [code,name,pib] of [
  ['3205309','Vitória','R$ 85,4 mil'],
  ['4209102','Joinville','R$ 66,8 mil'],
  ['3509502','Campinas','R$ 64,1 mil'],
  ['3549904','S. J. dos Campos','R$ 63,5 mil'],
  ['3552205','Sorocaba','R$ 61,9 mil'],
  ['3170206','Uberlândia','R$ 60,5 mil'],
  ['3543402','Ribeirão Preto','R$ 56,8 mil'],
  ['4202008','Baln. Camboriú','R$ 54,3 mil'],
  ['4115200','Maringá','R$ 52,2 mil'],
  ['4205407','Florianópolis','R$ 48,6 mil'],
  ['4204608','Criciúma','R$ 46,1 mil'],
  ['4113700','Londrina','R$ 43,8 mil']
 ]){
  const b=el('button',`🔵 ${name} (${pib})`);
  b.type='button';
  b.className='tmic-city-pill pill-commercial';
  b.title=`Focar polo comercial ${name} (PIB per capita: ${pib}) e abrir ficha técnica`;
  b.addEventListener('click',()=>{
   activeTechnicalMarkerCode=code;
   focusCommercialHub(code,100,false);
  });
  mPills.append(b);
 }
 commCard.append(mHead,mText,mPills);

 box.append(growthCard,concCard,commCard);
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
  bars('cities',(artistMap?.places||[]).slice(0,30).map(x=>({name:x.name+' / '+x.uf,value:x.value,code:x.code})),row=>{if(row.code){activeTechnicalMarkerCode=String(row.code);focusCommercialHub(row.code,100);}});
  renderSideTalentInsightsCards();
  return;
 }
 const rFilter=field('region')?.value||'';
 const ufFilter=field('uf')?.value||'';
 const allHubs=demographicsData?.items||[];
 const filteredHubs=allHubs.filter(h=>(!rFilter||h.region===rFilter)&&(!ufFilter||h.uf===ufFilter));
 const displayHubs=filteredHubs.length>=4?filteredHubs:allHubs;

 // Sempre exibe todas as 5 macrorregiões para manter o comparativo nacional completo sem espaços vazios
 const regPop=(demographicsData?.byRegion||[]).map(r=>({name:r.region,value:Number(r.population)||0}));
 const regPib=(demographicsData?.byRegion||[]).map(r=>({name:r.region,value:Math.round(Number(r.avg_pib_per_capita)||0)}));
 const stMap=new Map();
 for(const h of allHubs){stMap.set(h.uf,(stMap.get(h.uf)||0)+(Number(h.population)||0));}
 const stRows=[...stMap.entries()].map(([name,value])=>({name,value})).sort((a,b)=>{
  if(ufFilter&&(a.name===ufFilter)!==(b.name===ufFilter))return a.name===ufFilter?-1:1;
  return b.value-a.value;
 });
 const cityRows=displayHubs.slice(0,30).map(h=>({name:`${h.name} / ${h.uf}`,value:Number(h.population)||0,code:h.code}));
 bars('regions',regPop,row=>{field('region').value=field('region').value===row.name?'':row.name;updateUF();clearCities();filterCities();search();},' hab');
 bars('region-artists',regPib,row=>{field('region').value=field('region').value===row.name?'':row.name;updateUF();clearCities();filterCities();search();});
 bars('states',stRows,row=>chooseState(row.name),' hab');
 bars('cities',cityRows,row=>{if(row.code){activeTechnicalMarkerCode=String(row.code);focusCommercialHub(row.code,100);}},' hab');
 renderSideTalentInsightsCards();
}

function selectionSummary(r){
 const demItems=demographicsData?.items||[];
 const demByCode=new Map(demItems.map(d=>[String(d.code),d]));
 const baseCodes=selected.size?[...selected]:(field('center')?.value?[field('center').value]:(activeTechnicalMarkerCode?[activeTechnicalMarkerCode]:[]));
 const codeSet=new Set(baseCodes.map(String));
 for(const h of demItems){
  if(codeSet.size>=18)break;
  codeSet.add(String(h.code));
 }
 const codesToShow=[...codeSet];
 const rows=codesToShow.map(code=>{
  const c=catalog.find(x=>String(x.code)===String(code))||demByCode.get(String(code));
  const place=r?.places?.find(x=>String(x.code)===String(code));
  const dem=demByCode.get(String(code))||c;
  const meta=getCityTalentIndexMeta(dem,place?.value);
  const isFocused=selected.has(String(code))||field('center')?.value===String(code)||String(code)===String(activeTechnicalMarkerCode);
  const cityBtn=el('button',`${isFocused?'📍 ':''}${c?`${c.name} / ${c.uf} (${c.region||'Brasil'})`:code}`);
  cityBtn.type='button';
  cityBtn.className='link';
  cityBtn.addEventListener('click',()=>{
   activeTechnicalMarkerCode=String(code);
   focusCommercialHub(code,100,false);
  });
  const sign=meta.growthPct>0?'+':'';
  const valText=place
   ?`${fmt(place.value)} (${meta.badgeLabel} ${sign}${meta.growthPct.toFixed(1).replace('.',',')}%)`
   :dem?.population
     ?`${meta.badgeLabel} (${sign}${meta.growthPct.toFixed(1).replace('.',',')}%) · Pop.: ${fmt(dem.population)} · PIB/hab: R$ ${fmt(Math.round(dem.pib_per_capita||0))}`
     :`Bacia Regional (${c?.region||'Brasil'})`;
  const simBtn=el('button','⚡ Simular Show');
  simBtn.type='button';
  simBtn.className='btn-simulate-show';
  simBtn.addEventListener('click',()=>openShowSimulatorModal(code));
  return [cityBtn,valText,simBtn];
 });
 const known=r?.places?.filter(p=>selected.has(p.code))??[];
 if(selected.size&&known.length){
  rows.push(['Total observado ('+known.length+' de '+selected.size+' cidades)',fmt(known.reduce((a,b)=>a+b.value,0)),'—']);
 }
 table('selection-summary',['Município / UF','Crescimento & Potencial IBGE','Ação no Mapa'],rows);
}

function clientDistKm(a,b){
 if(!a||!b||a.lat==null||a.lon==null||b.lat==null||b.lon==null)return Infinity;
 const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}

function buildShowPlan(compat,cityObj,activeArtist,radiusKm){
 const demItems=demographicsData?.items||[];
 const directDem=compat?.city?.demographics||demItems.find(d=>String(d.code)===String(cityObj?.code))||null;
 let nearestHub=null,nearestKm=Infinity;
 for(const h of demItems){
  const d=clientDistKm(cityObj,h);
  if(d<nearestKm){nearestKm=d;nearestHub=h;}
 }
 const regBench=(demographicsData?.byRegion||[]).find(r=>r.region===(cityObj?.region||compat?.city?.region))||null;
 const pibPerCapita=Number(directDem?.gdp_per_capita||directDem?.pib_per_capita||regBench?.avg_pib_per_capita||nearestHub?.pib_per_capita||42000);
 const avgIncome=Number(directDem?.avg_income||(pibPerCapita/12*0.62)||3200);
 const cityPop=Number(directDem?.population||0);
 const catchmentCount=Number(compat?.catchment?.totalMunicipalities||1);
 const catchmentKnownPop=Number(compat?.catchment?.knownPopulation||cityPop||(catchmentCount*28000));

 const cats=compat?.artist?.categories||activeArtist?.categories||[];
 const isSeatedStage=cats.some(c=>/Humor|Palestr|Ator|Mágic|Jornal/i.test(c));
 const mediaVals=[
  compat?.media?.find(m=>m.network==='YouTube')?.national?.value||activeArtist?.media?.YouTube?.value||0,
  compat?.media?.find(m=>m.network==='Spotify')?.national?.value||activeArtist?.media?.Spotify?.value||0,
  compat?.media?.find(m=>m.network==='Instagram')?.national?.value||activeArtist?.media?.Instagram?.value||0,
  compat?.media?.find(m=>m.network==='TikTok')?.national?.value||activeArtist?.media?.TikTok?.value||0
 ];
 const maxReach=Math.max(0,...mediaVals);
 const tier=maxReach>=10000000?'A':maxReach>=2500000?'B':maxReach>=400000?'C':'D';
 const tierLabel={
  A:'Mega Atração Nacional (Headliner / Arena)',
  B:'Grande Atração Nacional (Turnê Principal)',
  C:'Atração Consolidada / Regional',
  D:'Atração de Nicho / Corporativo / Em Ascensão'
 }[tier];

 const realVenues=(compat?.competition?.sampleCompetingEvents||[]).filter(e=>e.venue).map(e=>`${e.venue} (${e.city})`);
 const uniqueRealVenues=[...new Set(realVenues)];

 let venueType='',venueSecondary='',stageFormat='',baseCap=2500;
 if(isSeatedStage){
  venueType=cityPop>=300000?'Teatro Principal / Centro de Convenções':'Auditório / Salão Nobre de Clube ou Teatro Regional';
  venueSecondary=nearestHub&&nearestKm>5?`Opção Polo Regional (${nearestHub.name}/${nearestHub.uf} a ${nearestKm.toFixed(0)} km): Centro de Convenções / Teatro`:'Sessão Dupla (20h e 22h) para maximizar bilheteria';
  stageFormat='Plateia Sentada Numerada (VIP Frontal + Plateia Central + Mezanino)';
  baseCap=tier==='A'?2200:tier==='B'?1400:tier==='C'?900:550;
  if(cityPop>0&&cityPop<150000)baseCap=Math.min(baseCap,1100);
 }else if(cityPop>=500000){
  venueType=tier==='A'?'Arena Multiuso / Estádio / Parque de Eventos':'Casa de Grandes Shows / Centro de Eventos / Arena Coberta';
  venueSecondary='Espaço Premium com Pista, Frontstage e Lounges Corporativos';
  stageFormat='Arena Show (Pista 65% + Área VIP Frontstage 23% + Camarotes/Lounges 12%)';
  baseCap=tier==='A'?8500:tier==='B'?5000:tier==='C'?2800:1500;
 }else if(cityPop>=120000){
  venueType='Parque de Exposições / Centro de Eventos Regional / Ginásio Coberto';
  venueSecondary='Recinto Agropecuário ou Clube Campestre com estrutura para camarotes';
  stageFormat='Show Regional (Pista/Arena 65% + VIP Frontstage 23% + Camarotes/Bistrôs 12%)';
  baseCap=tier==='A'?5500:tier==='B'?3600:tier==='C'?2200:1200;
 }else{
  venueType='Parque de Exposições Municipal / Recinto de Festas & Rodeio / Ginásio Municipal';
  venueSecondary=nearestHub?`Captação Regional na Bacia de ${radiusKm} km (${catchmentCount} municípios · Polo de apoio: ${nearestHub.name}/${nearestHub.uf} a ${nearestKm.toFixed(0)} km)`:`Captação Regional na Bacia de ${radiusKm} km (${catchmentCount} municípios vizinhos)`;
  stageFormat='Formato Bacia Regional (Arena/Pista 65% + Frontstage/VIP 23% + Camarotes/Mesas 12%)';
  const basinMultiplier=Math.min(1.45,0.75+catchmentCount*0.02);
  const rawCap=(tier==='A'?4000:tier==='B'?2800:tier==='C'?1800:1000)*basinMultiplier;
  baseCap=Math.round(rawCap/100)*100;
 }
 if(uniqueRealVenues.length){
  venueSecondary=`Locais reais monitorados na região: ${uniqueRealVenues.slice(0,3).join(' · ')}`;
 }

 const incomeFactor=Math.max(0.78,Math.min(1.42,pibPerCapita/46000));
 const scoreFactor=compat?.score!=null?Math.max(0.88,Math.min(1.22,0.85+compat.score/260)):1;
 const rawBaseTicket=(tier==='A'?90:tier==='B'?75:tier==='C'?60:50)*incomeFactor*scoreFactor*(isSeatedStage?1.15:1);
 const baseTicket=Math.max(40,Math.round(rawBaseTicket/5)*5);

 const sectors=isSeatedStage
  ?[
    {name:'Plateia Central / Prata (1º/2º Lote)',share:0.55,mult:1.0},
    {name:'Plateia VIP Ouro (Frente Palco)',share:0.30,mult:1.65},
    {name:'Camarote / Bistrô / Mezanino Premium',share:0.15,mult:2.35}
   ]
  :[
    {name:'Pista / Arena (Meia / Solidário)',share:0.65,mult:1.0},
    {name:'Área VIP / Frontstage',share:0.23,mult:1.9},
    {name:'Camarotes / Bistrôs / Lounges',share:0.12,mult:3.3}
   ];

 return {
  cityObj,
  directDem,
  nearestHub,
  nearestKm,
  pibPerCapita,
  avgIncome,
  cityPop,
  catchmentCount,
  catchmentKnownPop,
  isSeatedStage,
  maxReach,
  tier,
  tierLabel,
  venueType,
  venueSecondary,
  stageFormat,
  uniqueRealVenues,
  recommendedCapacity:baseCap,
  recommendedBaseTicket:baseTicket,
  sectors
 };
}

let simModalReqSeq=0;
async function openShowSimulatorModal(cityCode,customArtistId=null,customRadiusKm=null){
 const dialog=$('show-simulator-modal');
 const host=$('show-simulator-content');
 if(!dialog||!host)return;
 const seq=++simModalReqSeq;
 const codeStr=String(cityCode||field('center')?.value||[...selected][0]||(demographicsData?.items?.[0]?.code||'3550308'));
 const cityObj=catalog.find(c=>String(c.code)===codeStr)||(demographicsData?.items||[]).find(d=>String(d.code)===codeStr)||{code:codeStr,name:'Município Selecionado',uf:'BR',region:'Brasil'};
 const radiusKm=Number(customRadiusKm||field('radius')?.value||100)||100;

 // Sincroniza a cidade com o mapa ao abrir o simulador
 if(!selected.has(String(cityObj.code))){
  selected.add(String(cityObj.code));
  selectedChips();
 }
 if(cityObj.lat!=null&&field('center').value!==String(cityObj.code)){
  $('center-search').value=`${cityObj.name} / ${cityObj.uf}`;
  filterCenters();
  field('center').value=String(cityObj.code);
  field('radius').value=String(radiusKm);
  if($('radius-slider'))$('radius-slider').value=String(radiusKm);
 }

 const chosenTalentId=customArtistId||field('talent')?.value||'';
 const activeArtist=
  lastCrossItems.find(a=>a.id===chosenTalentId)||
  active360Artist||
  lastCrossItems.find(a=>Object.values(a.media||{}).some(m=>m?.value!=null))||
  lastCrossItems[0]||
  null;

 if(!dialog.open)dialog.showModal();
 host.replaceChildren(el('p',`Carregando inteligência territorial, sugestão de local, capacidade e estimativa de ingressos para ${cityObj.name} / ${cityObj.uf}…`));

 let compat=null;
 if(activeArtist){
  try{
   const cp=new URLSearchParams({talent:activeArtist.id,city:String(cityObj.code),radius:String(radiusKm)});
   compat=await get('/api/commercial/compatibility?'+cp);
  }catch{}
 }
 if(seq!==simModalReqSeq)return;

 const plan=buildShowPlan(compat,cityObj,activeArtist,radiusKm);
 host.replaceChildren();

 // 1. Cabeçalho do Modal
 const head=el('div');head.className='show-sim-head';
 const headLeft=el('div');
 const eye=el('span',`PLANEJAMENTO DE SHOW & VIABILIDADE DE PRAÇA · BACIA REGIONAL DE ${radiusKm} KM`);
 eye.className='eyebrow';
 const h2=el('h2',`⚡ ${activeArtist?.name||'Catálogo Nacional'} em ${cityObj.name} / ${cityObj.uf} (${cityObj.region||'Brasil'})`);
 h2.id='show-sim-title';
 const subP=el('p',plan.directDem?.population
  ?`Polo Monitorado IBGE · População local: ${fmt(plan.directDem.population)} hab · PIB per capita: R$ ${fmt(Math.round(plan.pibPerCapita))} · ${plan.catchmentCount} municípios no raio de ${radiusKm} km.`
  :`Município Oficial IBGE (${cityObj.name}/${cityObj.uf}) · Bacia Regional com ${plan.catchmentCount} municípios num raio de ${radiusKm} km`+(plan.nearestHub?` · Polo IBGE de referência: ${plan.nearestHub.name}/${plan.nearestHub.uf} (${plan.nearestKm.toFixed(0)} km · PIB/hab R$ ${fmt(Math.round(plan.pibPerCapita))}).`:'.')
 );
 headLeft.append(eye,h2,subP);
 const closeBtn=el('button','✕ Fechar');
 closeBtn.type='button';
 closeBtn.className='secondary-button';
 closeBtn.addEventListener('click',()=>dialog.close());
 head.append(headLeft,closeBtn);
 host.append(head);

 // 2. Barra de Controles da Simulação (Artista, Cidade, Raio e Score)
 const ctrlRow=el('div');ctrlRow.className='show-sim-controls';

 const artistCard=el('label');artistCard.className='show-sim-ctrl-card';
 artistCard.append(el('span','Artista / Atração Simulada'));
 const artistSel=el('select');
 for(const a of lastCrossItems){
  const opt=new Option(`${a.name} (${a.media?.YouTube?.formatted||a.media?.Spotify?.formatted||'Ativo'})`,a.id);
  if(activeArtist&&a.id===activeArtist.id)opt.selected=true;
  artistSel.append(opt);
 }
 artistSel.addEventListener('change',()=>{
  field('talent').value=artistSel.value;
  const found=lastCrossItems.find(x=>x.id===artistSel.value);
  if(found&&$('artist-quick-search'))$('artist-quick-search').value=found.name;
  openShowSimulatorModal(cityObj.code,artistSel.value,radiusKm);
 });
 artistCard.append(artistSel);

 const cityCard=el('label');cityCard.className='show-sim-ctrl-card';
 cityCard.append(el('span','Município Sede do Evento'));
 const citySel=el('select');
 const candidateCities=new Map();
 candidateCities.set(String(cityObj.code),cityObj);
 for(const code of selected){
  const c=catalog.find(x=>String(x.code)===String(code));
  if(c)candidateCities.set(String(c.code),c);
 }
 for(const h of (demographicsData?.items||[])){
  if(!candidateCities.has(String(h.code)))candidateCities.set(String(h.code),h);
 }
 for(const c of candidateCities.values()){
  const opt=new Option(`${c.name} / ${c.uf} (${c.region||'Brasil'})`,String(c.code));
  if(String(c.code)===String(cityObj.code))opt.selected=true;
  citySel.append(opt);
 }
 citySel.addEventListener('change',()=>openShowSimulatorModal(citySel.value,activeArtist?.id,radiusKm));
 cityCard.append(citySel);

 const radiusCard=el('div');radiusCard.className='show-sim-ctrl-card';
 radiusCard.append(el('span','Raio da Bacia Regional (km)'));
 const radPills=el('div');radPills.className='show-sim-radius-pills';
 for(const rVal of [50,80,100,150,200]){
  const rb=el('button',`${rVal} km`);
  rb.type='button';
  rb.setAttribute('aria-pressed',String(radiusKm===rVal));
  rb.addEventListener('click',()=>{
   field('radius').value=String(rVal);
   if($('radius-slider'))$('radius-slider').value=String(rVal);
   openShowSimulatorModal(cityObj.code,activeArtist?.id,rVal);
  });
  radPills.append(rb);
 }
 radiusCard.append(radPills);

 const scoreCard=el('div');scoreCard.className='show-sim-score-pill';
 const scVal=compat?.score;
 scoreCard.append(
  el('span','Score Comercial da Praça'),
  el('strong',scVal!=null?`${scVal} / 100`:'Qualificado'),
  el('small',compat?.verdict?.label||plan.tierLabel)
 );

 ctrlRow.append(artistCard,cityCard,radiusCard,scoreCard);
 host.append(ctrlRow);

 // 3. Quatro Cards Principais: Sugestão de Local, Capacidade, Valor de Ingresso e Receita Estimada
 const kpiGrid=el('div');kpiGrid.className='show-sim-kpi-grid';
 const kpiVenue=el('div');kpiVenue.className='show-sim-kpi-card';
 kpiVenue.append(
  el('span','1. Sugestão de Local (Venue)'),
  el('strong',plan.venueType),
  el('small',plan.stageFormat)
 );
 kpiVenue.firstChild.className='kpi-tag';

 const kpiCap=el('div');kpiCap.className='show-sim-kpi-card cyan-neon';
 const kpiCapStrong=el('strong','');
 const kpiCapSmall=el('small','');
 const kpiCapTag=el('span','2. Capacidade & Público Pagante');
 kpiCapTag.className='kpi-tag';
 kpiCap.append(kpiCapTag,kpiCapStrong,kpiCapSmall);

 const kpiTicket=el('div');kpiTicket.className='show-sim-kpi-card';
 const kpiTicketStrong=el('strong','');
 const kpiTicketSmall=el('small','');
 const kpiTicketTag=el('span','3. Estimativa de Ingresso');
 kpiTicketTag.className='kpi-tag';
 kpiTicket.append(kpiTicketTag,kpiTicketStrong,kpiTicketSmall);

 const kpiRev=el('div');kpiRev.className='show-sim-kpi-card cyan-neon';
 const kpiRevStrong=el('strong','');
 const kpiRevSmall=el('small','');
 const kpiRevTag=el('span','4. Projeção de Bilheteria Bruta');
 kpiRevTag.className='kpi-tag';
 kpiRev.append(kpiRevTag,kpiRevStrong,kpiRevSmall);

 kpiGrid.append(kpiVenue,kpiCap,kpiTicket,kpiRev);
 host.append(kpiGrid);

 // 4. Simulador Interativo de Capacidade, Lotes de Ingresso e Ocupação + Tabela por Setor
 const tuner=el('div');tuner.className='show-sim-tuner';
 const tunerHead=el('div');tunerHead.className='show-sim-tuner-head';
 tunerHead.append(el('strong','🎛 Calibragem Operacional de Capacidade, Ingressos e Lotes (Ajuste em Tempo Real)'));
 const scenarioBtns=el('div');scenarioBtns.style.display='flex';scenarioBtns.style.gap='6px';
 tunerHead.append(scenarioBtns);
 tuner.append(tunerHead);

 const tunerGrid=el('div');tunerGrid.className='show-sim-tuner-grid';

 // Controle 1: Capacidade
 const capBox=el('div');capBox.className='show-sim-slider-box';
 const capTop=el('div');capTop.className='show-sim-slider-top';
 capTop.append(el('span','Capacidade Total do Local'));
 const capNum=el('input');capNum.type='number';capNum.min='200';capNum.max='50000';capNum.step='100';capNum.value=String(plan.recommendedCapacity);
 const capRange=el('input');capRange.type='range';capRange.min='300';capRange.max='25000';capRange.step='100';capRange.value=String(Math.min(25000,plan.recommendedCapacity));
 capTop.append(capNum);
 capBox.append(capTop,capRange);

 // Controle 2: Ingresso Base Pista
 const tktBox=el('div');tktBox.className='show-sim-slider-box';
 const tktTop=el('div');tktTop.className='show-sim-slider-top';
 tktTop.append(el('span','Ingresso Base 1º Lote (R$)'));
 const tktNum=el('input');tktNum.type='number';tktNum.min='20';tktNum.max='1500';tktNum.step='5';tktNum.value=String(plan.recommendedBaseTicket);
 const tktRange=el('input');tktRange.type='range';tktRange.min='30';tktRange.max='500';tktRange.step='5';tktRange.value=String(Math.min(500,plan.recommendedBaseTicket));
 tktTop.append(tktNum);
 tktBox.append(tktTop,tktRange);

 // Controle 3: Ocupação (%)
 const occBox=el('div');occBox.className='show-sim-slider-box';
 const occTop=el('div');occTop.className='show-sim-slider-top';
 occTop.append(el('span','Ocupação / Venda Estimada (%)'));
 const occNum=el('input');occNum.type='number';occNum.min='30';occNum.max='100';occNum.step='5';occNum.value='70';
 const occRange=el('input');occRange.type='range';occRange.min='40';occRange.max='100';occRange.step='5';occRange.value='70';
 occTop.append(occNum);
 occBox.append(occTop,occRange);

 // Controles Financeiros: Cachê Artístico, Outros Custos e Taxas/Impostos (Seção 8 da Avaliação)
 const defaultFee=compat?.financialDefaults?.artistFee||Math.round((plan.recommendedCapacity*plan.recommendedBaseTicket*1.3*0.32)/1000)*1000;
 const defaultOtherCosts=compat?.financialDefaults?.operationalCosts||Math.round((plan.recommendedCapacity*plan.recommendedBaseTicket*1.3*0.21)/1000)*1000;

 const feeBox=el('div');feeBox.className='show-sim-slider-box';
 const feeTop=el('div');feeTop.className='show-sim-slider-top';
 feeTop.append(el('span','Cachê Artístico Estimado (R$)'));
 const feeNum=el('input');feeNum.type='number';feeNum.min='0';feeNum.max='5000000';feeNum.step='5000';feeNum.value=String(defaultFee);
 feeTop.append(feeNum);
 feeBox.append(feeTop);

 const costBox=el('div');costBox.className='show-sim-slider-box';
 const costTop=el('div');costTop.className='show-sim-slider-top';
 costTop.append(el('span','Outros Custos Operacionais (R$)'));
 const costNum=el('input');costNum.type='number';costNum.min='0';costNum.max='5000000';costNum.step='2000';costNum.value=String(defaultOtherCosts);
 costTop.append(costNum);
 costBox.append(costTop);

 const taxBox=el('div');taxBox.className='show-sim-slider-box';
 const taxTop=el('div');taxTop.className='show-sim-slider-top';
 taxTop.append(el('span','Taxas e Impostos s/ Receita (%)'));
 const taxNum=el('input');taxNum.type='number';taxNum.min='0';taxNum.max='50';taxNum.step='1';taxNum.value='10';
 taxTop.append(taxNum);
 taxBox.append(taxTop);

 tunerGrid.append(capBox,tktBox,occBox,feeBox,costBox,taxBox);
 tuner.append(tunerGrid);

 const pnlCardsHost=el('div');
 pnlCardsHost.className='show-sim-kpi-grid';
 pnlCardsHost.style.marginBottom='10px';
 tuner.append(pnlCardsHost);

 const sectorTableHost=el('div');
 tuner.append(sectorTableHost);
 host.append(tuner);

 let currentSummaryText='';
 function recalculateFinancials(){
  const cap=Math.max(100,Number(capNum.value)||plan.recommendedCapacity);
  const basePrice=Math.max(10,Number(tktNum.value)||plan.recommendedBaseTicket);
  const occPct=Math.max(10,Math.min(100,Number(occNum.value)||70));
  const occRatio=occPct/100;
  const artistFee=Math.max(0,Number(feeNum.value)||0);
  const otherCosts=Math.max(0,Number(costNum.value)||0);
  const taxPct=Math.max(0,Math.min(90,Number(taxNum.value)||0));

  let totalBuyers=0,totalGross=0;
  const sectorRows=[];
  const sectorPrices=[];
  for(const sec of plan.sectors){
   const secCap=Math.round(cap*sec.share);
   const secBuyers=Math.round(secCap*occRatio);
   const secPrice=Math.round((basePrice*sec.mult)/5)*5;
   const secGross=secBuyers*secPrice;
   totalBuyers+=secBuyers;
   totalGross+=secGross;
   sectorPrices.push({name:sec.name,price:secPrice,buyers:secBuyers,cap:secCap,gross:secGross});
   sectorRows.push([
    sec.name,
    `${Math.round(sec.share*100)}% (${fmt(secCap)} lug.)`,
    `${fmt(secBuyers)} pagantes`,
    `R$ ${fmt(secPrice)},00`,
    `R$ ${fmt(secGross)},00`
   ]);
  }
  const weightedAvg=totalBuyers>0?Math.round(totalGross/totalBuyers):basePrice;
  const minPrice=sectorPrices[0]?.price||basePrice;
  const maxPrice=sectorPrices.at(-1)?.price||basePrice;

  const netRevenue=Math.round(totalGross*(1-taxPct/100));
  const fixedCosts=artistFee+otherCosts;
  const opResult=netRevenue-fixedCosts;
  const opMarginPct=totalGross>0?(opResult/totalGross)*100:0;
  const netTicket=weightedAvg*(1-taxPct/100);
  const breakEvenTickets=netTicket>0?Math.ceil(fixedCosts/netTicket):cap;
  const breakEvenOccPct=(breakEvenTickets/cap)*100;

  kpiCapStrong.textContent=`${fmt(totalBuyers)} ingressos (${occPct}%)`;
  kpiCapSmall.textContent=`Capacidade: ${fmt(cap)} lugares · Ponto de equilíbrio: ${fmt(breakEvenTickets)} ing. (${breakEvenOccPct.toFixed(1)}%)`;

  kpiTicketStrong.textContent=`Ticket Médio: R$ ${fmt(weightedAvg)},00`;
  kpiTicketSmall.textContent=`Faixa por setor: R$ ${fmt(minPrice)},00 a R$ ${fmt(maxPrice)},00 · Calibrado pelo PIB IBGE`;

  kpiRevStrong.textContent=`R$ ${fmt(opResult)},00 (${opMarginPct.toFixed(1)}%)`;
  kpiRevSmall.textContent=`Faturamento Bruto: R$ ${fmt(totalGross)} · Receita Líquida: R$ ${fmt(netRevenue)} · Custos Fixos: R$ ${fmt(fixedCosts)}`;
  kpiRevTag.textContent='4. Resultado Operacional Líquido';

  pnlCardsHost.replaceChildren();
  for(const [pTitle,pVal,pSub] of [
   ['Resultado Operacional Estimado',`R$ ${fmt(opResult)},00`,`Margem operacional: ${opMarginPct.toFixed(1)}% (após ${taxPct}% taxas/impostos)`],
   ['Receita Líquida vs. Custos Fixos',`R$ ${fmt(netRevenue)} vs. R$ ${fmt(fixedCosts)}`,`Cachê: R$ ${fmt(artistFee)} + Custos: R$ ${fmt(otherCosts)}`],
   ['Ponto de Equilíbrio (Break-even)',`${fmt(breakEvenTickets)} ingressos`,`Ocupação mínima necessária: ${breakEvenOccPct.toFixed(1)}% da casa`],
   ['Risco Financeiro da Operação',breakEvenOccPct<=55?'🟢 Baixo Risco':breakEvenOccPct<=75?'🟡 Risco Moderado':'🔴 Alto Risco',`Confiança dos dados: ${compat?.confidenceIndicator?.score??80}%`]
  ]){
   const pc=el('div');pc.className='show-sim-kpi-card';
   pc.style.minHeight='78px';
   const pt=el('span',pTitle);pt.className='kpi-tag';
   pc.append(pt,el('strong',pVal),el('small',pSub));
   pnlCardsHost.append(pc);
  }

  sectorRows.push([
   'TOTAL CONSOLIDADO DO SHOW',
   `${fmt(cap)} lugares (100%)`,
   `${fmt(totalBuyers)} pagantes (${occPct}%)`,
   `Ticket Médio: R$ ${fmt(weightedAvg)},00`,
   `Bruto: R$ ${fmt(totalGross)},00 | Líquido: R$ ${fmt(netRevenue)},00`
  ]);

  sectorTableHost.replaceChildren();
  const tbl=el('table');
  const thead=el('thead'),trH=el('tr');
  ['Setor / Mapa de Palco','Capacidade do Setor','Público Estimado','Valor Sugerido (Lote Base)','Receita Bruta Estimada'].forEach(h=>trH.append(el('th',h)));
  thead.append(trH);tbl.append(thead);
  const tbody=el('tbody');
  sectorRows.forEach((r,idx)=>{
   const tr=el('tr');
   if(idx===sectorRows.length-1)tr.style.fontWeight='800';
   r.forEach(c=>tr.append(el('td',c)));
   tbody.append(tr);
  });
  tbl.append(tbody);
  sectorTableHost.append(tbl);

  currentSummaryText=[
   `⚡ SIMULAÇÃO FINANCEIRA DE SHOW & VIABILIDADE — RADAR DE TALENTOS`,
   `• Artista: ${activeArtist?.name||'Catálogo Nacional'} (${plan.tierLabel})`,
   `• Praça Sede: ${cityObj.name} / ${cityObj.uf} (${cityObj.region||'Brasil'}) — Raio da Bacia: ${radiusKm} km (${plan.catchmentCount} municípios · Deslocamento est.: ${compat?.roadTravelEstimate?.formattedDriveTime||'~1h40min via rodovia'})`,
   `• Radar Score Comercial: ${scVal!=null?scVal+'/100':'Qualificado'} | Confiança dos Dados: ${compat?.confidenceIndicator?.score??80}%`,
   `• Sugestão de Local: ${plan.venueType} — ${plan.stageFormat}`,
   `• Capacidade: ${fmt(cap)} lugares | Ingressos Vendidos (${occPct}%): ${fmt(totalBuyers)} | Ticket Médio: R$ ${fmt(weightedAvg)},00`,
   `• Faturamento Bruto: R$ ${fmt(totalGross)},00 | Receita Líquida (-${taxPct}%): R$ ${fmt(netRevenue)},00`,
   `• Custos Fixos: R$ ${fmt(fixedCosts)},00 (Cachê: R$ ${fmt(artistFee)} + Produção: R$ ${fmt(otherCosts)})`,
   `• Resultado Operacional Estimado: R$ ${fmt(opResult)},00 (Margem: ${opMarginPct.toFixed(1)}%)`,
   `• Ponto de Equilíbrio (Break-even): ${fmt(breakEvenTickets)} ingressos (${breakEvenOccPct.toFixed(1)}% de ocupação mínima)`
  ].join('\n');
 }

 for(const [label,pct] of [['70% Conservador',70],['85% Recomendado',85],['100% Lotação Máxima',100]]){
  const b=el('button',label);
  b.type='button';
  b.className='secondary-button';
  b.addEventListener('click',()=>{occNum.value=String(pct);occRange.value=String(pct);recalculateFinancials();});
  scenarioBtns.append(b);
 }

 capNum.addEventListener('input',()=>{capRange.value=String(Math.min(25000,Number(capNum.value)||300));recalculateFinancials();});
 capRange.addEventListener('input',()=>{capNum.value=capRange.value;recalculateFinancials();});
 tktNum.addEventListener('input',()=>{tktRange.value=String(Math.min(500,Number(tktNum.value)||40));recalculateFinancials();});
 tktRange.addEventListener('input',()=>{tktNum.value=tktRange.value;recalculateFinancials();});
 occNum.addEventListener('input',()=>{occRange.value=occNum.value;recalculateFinancials();});
 occRange.addEventListener('input',()=>{occNum.value=occRange.value;recalculateFinancials();});
 feeNum.addEventListener('input',recalculateFinancials);
 costNum.addEventListener('input',recalculateFinancials);
 taxNum.addEventListener('input',recalculateFinancials);
 recalculateFinancials();

 // 5. Painéis Inferiores: Informações de Eventos, Locais e Bacia de Municípios + Força nas 4 Mídias & Argumentário
 const bodyGrid=el('div');bodyGrid.className='show-sim-body-grid';

 const leftBox=el('div');leftBox.className='show-sim-box';
 leftBox.append(el('h3',`📍 Informações de Eventos, Sugestão de Local & Bacia Regional (${radiusKm} km)`));
 const venueList=el('ul');venueList.className='show-sim-list';
 const driveStr=compat?.roadTravelEstimate?.formattedDriveTime||`${Math.round(radiusKm*1.28/75*60)} min via rodovia (~${Math.round(radiusKm*1.28)} km)`;
 const peaStr=compat?.roadTravelEstimate?.peaPopulation?` · PEA estimada (Pop. Economicamente Ativa): ${fmt(compat.roadTravelEstimate.peaPopulation)} hab.`:'';
 venueList.append(
  el('li',`Tipologia Principal Recomendada: ${plan.venueType}.`),
  el('li',`Referência Complementar: ${plan.venueSecondary}.`),
  el('li',`Deslocamento Rodoviário Estimado no Raio (${radiusKm} km): até ${driveStr}${peaStr}`),
  el('li',`Eventos Monitorados na Bacia (${radiusKm} km): ${compat?.competition?.radiusEventsCount??0} evento(s) mapeado(s) no raio e ${compat?.competition?.cityEventsCount??0} diretamente em ${cityObj.name}/${cityObj.uf}.`),
  el('li',`Economia Regional (Base IBGE): PIB per capita de referência R$ ${fmt(Math.round(plan.pibPerCapita))}/hab · Renda média estimada R$ ${fmt(Math.round(plan.avgIncome))}/mês.`)
 );
 leftBox.append(venueList);

 if(compat?.competition?.sampleCompetingEvents?.length){
  leftBox.append(el('h3','🎟 Eventos & Locais Reais Detectados na Região'));
  const evList=el('ul');evList.className='show-sim-list';
  for(const ev of compat.competition.sampleCompetingEvents.slice(0,5)){
   evList.append(el('li',`${ev.title} — Local: ${ev.venue||'A confirmar'} (${ev.city} · ${ev.date})`));
  }
  leftBox.append(evList);
 }

 const neighbors=compat?.catchment?.municipalities||[];
 if(neighbors.length){
  leftBox.append(el('h3',`🗺 Municípios que Compõem o Público da Bacia (${plan.catchmentCount} cidades em ${radiusKm} km)`));
  const tagsBox=el('div');tagsBox.className='show-sim-city-tags';
  for(const m of neighbors.slice(0,28)){
   const tag=el('span',`${m.name}/${m.uf} (${m.distance_km===0?'Sede':m.distance_km+' km'})`);
   tag.className='show-sim-city-tag';
   tagsBox.append(tag);
  }
  leftBox.append(tagsBox);
 }

 const rightBox=el('div');rightBox.className='show-sim-box';
 rightBox.append(el('h3',`📊 Indicadores do Artista & Argumentário Comercial de Vendas`));
 const mediaSummaryList=el('ul');mediaSummaryList.className='show-sim-list';
 for(const net of ['YouTube','Spotify','Instagram','TikTok']){
  const mCross=activeArtist?.media?.[net];
  const mCompat=compat?.media?.find(x=>x.network===net);
  const valStr=mCompat?.national?.formatted||mCross?.formatted||'Sem coleta';
  const srcStr=mCompat?.national?.source||mCross?.source||'Monitoramento Radar';
  mediaSummaryList.append(el('li',`${net}: ${valStr} (${srcStr})`));
 }
 rightBox.append(mediaSummaryList);

 if(compat?.salesPitch?.length){
  rightBox.append(el('h3','💡 Recomendações Executivas para o Show'));
  const pitchList=el('ul');pitchList.className='show-sim-list';
  for(const bullet of compat.salesPitch.slice(0,4)){
   pitchList.append(el('li',bullet));
  }
  if(compat?.verdict?.recommendation){
   pitchList.append(el('li',compat.verdict.recommendation));
  }
  rightBox.append(pitchList);
 }

 bodyGrid.append(leftBox,rightBox);
 host.append(bodyGrid);

 // 6. Rodapé do Modal
 const foot=el('div');foot.className='show-sim-foot';
 foot.append(el('small','Dimensionamento orientativo calculado sobre métricas oficiais verificadas do artista, malha territorial IBGE de 5.570 municípios e parâmetros econômicos regionais ajustáveis.'));
 const footBtns=el('div');footBtns.style.display='flex';footBtns.style.gap='8px';footBtns.style.flexWrap='wrap';

 const copyBtn=el('button','📋 Copiar Proposta / Resumo do Show');
 copyBtn.type='button';
 copyBtn.className='btn-simulate-show';
 copyBtn.addEventListener('click',async()=>{
  try{
   await navigator.clipboard.writeText(currentSummaryText);
   copyBtn.textContent='✓ Resumo Copiado!';
   setTimeout(()=>{copyBtn.textContent='📋 Copiar Proposta / Resumo do Show';},2500);
  }catch{
   copyBtn.textContent='✓ Pronto';
  }
 });

 const commUrl=new URLSearchParams({
  q:activeArtist?.name||'',
  city:String(cityObj.code),
  cityQuery:`${cityObj.name} / ${cityObj.uf}`,
  radius:String(radiusKm)
 });
 const openComm=el('a','↗ Abrir no Painel de Oportunidade Comercial');
 openComm.className='secondary-button';
 openComm.style.textDecoration='none';
 openComm.style.padding='5px 11px';
 openComm.style.borderRadius='7px';
 openComm.href='/commercial.html?'+commUrl.toString()+'#compatibility-simulator';

 const pdfBtn=el('button','📄 Exportar Dossiê Executivo (PDF)');
 pdfBtn.type='button';
 pdfBtn.className='secondary-button';
 pdfBtn.style.borderColor='#00f0ff';
 pdfBtn.style.color='#a5f3fc';
 pdfBtn.addEventListener('click',()=>{
  const w=window.open('','_blank','width=960,height=780');
  if(!w)return;
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Dossiê Executivo — ${activeArtist?.name||'Radar de Talentos'} em ${cityObj.name}/${cityObj.uf}</title><style>
   body{font-family:Inter,system-ui,sans-serif;background:#0a0414;color:#f5eeff;margin:0;padding:32px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
   .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #9b4dff;padding-bottom:16px;margin-bottom:20px}
   .eyebrow{font-size:11px;letter-spacing:.14em;color:#d896ff;text-transform:uppercase;font-weight:700}
   h1{margin:4px 0 6px;font-size:24px;color:#fff}
   .sub{margin:0;font-size:13px;color:#bca8dc}
   .badge{background:#1e1035;border:1.5px solid #00f0ff;border-radius:10px;padding:10px 16px;text-align:center}
   .badge strong{display:block;font-size:22px;color:#00f0ff}
   .badge small{font-size:11px;color:#e9d5ff}
   .pre-box{background:#120824;border:1px solid rgba(184,132,255,.35);border-radius:10px;padding:18px;white-space:pre-wrap;font-size:13px;line-height:1.65;color:#f3e8ff;margin-bottom:20px}
   table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12.5px}
   th,td{border:1px solid rgba(184,132,255,.3);padding:9px 12px;text-align:left}
   th{background:#1f1138;color:#d8b4fe;text-transform:uppercase;font-size:11px}
   .foot{margin-top:26px;padding-top:12px;border-top:1px solid rgba(184,132,255,.25);display:flex;justify-content:space-between;font-size:11px;color:#9689ad}
   @media print{.no-print{display:none}}
  </style></head><body>
   <div class="head">
    <div>
     <div class="eyebrow">RADAR DE TALENTOS • DOSSIÊ EXECUTIVO DE VIABILIDADE COMERCIAL & P&L</div>
     <h1>${activeArtist?.name||'Catálogo Nacional'} — ${cityObj.name} / ${cityObj.uf}</h1>
     <p class="sub">Bacia Regional de ${radiusKm} km (${plan.catchmentCount} municípios) · Emitido em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
    <div class="badge">
     <small>Radar Score Comercial</small>
     <strong>${scVal!=null?scVal+' / 100':'Qualificado'}</strong>
     <small>${compat?.verdict?.label||plan.tierLabel}</small>
    </div>
   </div>
   <div class="pre-box">${currentSummaryText.replace(/</g,'&lt;')}</div>
   <h3 style="color:#d8b4fe;font-size:14px;margin-bottom:6px">Detalhamento por Setor & Mapa de Palco</h3>
   ${sectorTableHost.innerHTML}
   <div class="foot">
    <span>© 2026 Radar de Talentos — Central de Inteligência Estratégica</span>
    <span>Fonte Demográfica: IBGE · Métricas Auditadas (YouTube, Spotify, Instagram, TikTok)</span>
   </div>
   <script>window.onload=()=>{setTimeout(()=>window.print(),300);};<\/script>
  </body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
 });

 footBtns.append(copyBtn,pdfBtn,openComm);
 foot.append(footBtns);
 host.append(foot);
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
 const techMeta=getCityTalentIndexMeta(demInfo);
 host.replaceChildren();
 const head=el('div');head.className='inspector-head';
 const titleGroup=el('div');titleGroup.className='inspector-title-group';
 titleGroup.append(
  el('strong',`⌖ Praça em Foco no Mapa: ${activeHub.name} / ${activeHub.uf} (${activeHub.region||'Brasil'}) · ${techMeta.typeTitle} · Bacia de ${radiusKm} km`),
  el('small',demInfo.population?`Base Oficial IBGE · População: ${fmt(demInfo.population)} hab · PIB per capita: R$ ${fmt(Math.round(demInfo.pib_per_capita||0))} · Gêneros em alta: ${techMeta.topGenres}`:`Município oficial IBGE (${activeHub.name}/${activeHub.uf}) · Gêneros em alta: ${techMeta.topGenres}`)
 );
 const scoreBadge=el('div','Calculando viabilidade artista × praça…');
 scoreBadge.className='inspector-score-badge';
 head.append(titleGroup,scoreBadge);
 host.append(head);

 const metricsGrid=el('div');metricsGrid.className='inspector-metrics-grid';
 const addMetricBox=(label,val,sub,accentCol=null)=>{
  const box=el('div');box.className='inspector-metric-box';
  const st=el('strong',val);
  if(accentCol)st.style.color=accentCol;
  box.append(el('span',label),st,el('small',sub));
  metricsGrid.append(box);
 };
 addMetricBox(
  'Índices Técnicos de Talentos',
  `+${techMeta.growthPct.toFixed(1).replace('.',',')}% cresc. · ${techMeta.sharePct.toFixed(1).replace('.',',')}% conc.`,
  `${techMeta.badgeLabel} · Score Técnico: ${techMeta.techScore}/100`,
  techMeta.color
 );
 addMetricBox(
  'População do Polo (IBGE)',
  demInfo.population?`${fmt(demInfo.population)} hab`:'Catálogo Municipal',
  `Bacia 100 km est.: ${fmt(techMeta.basinPop)} hab · ${activeHub.region||'Brasil'}`
 );
 addMetricBox(
  'PIB per Capita / Renda',
  demInfo.pib_per_capita?`R$ ${fmt(Math.round(demInfo.pib_per_capita))}`:'Base Territorial IBGE',
  demInfo.avg_income?`Renda média est.: R$ ${fmt(Math.round(demInfo.avg_income))}/mês`:`Locais: ${techMeta.venueRef}`
 );
 addMetricBox(
  'Bacia Regional & Artista',
  activeArtist?`${activeArtist.name} (${radiusKm} km)`:`Raio ${radiusKm} km`,
  activeArtist?`YT: ${activeArtist.media?.YouTube?.formatted||'—'} · SP: ${activeArtist.media?.Spotify?.formatted||'—'}`:'Anel de bacia regional ativo no mapa'
 );
 host.append(metricsGrid);

 const actionsRow=el('div');actionsRow.className='inspector-actions';
 const topArtistsBar=el('div');topArtistsBar.className='inspector-top-artists';
 topArtistsBar.append(el('span',`📈 Talentos em maior crescimento em ${activeHub.name}/${activeHub.uf}:`));
 const growingInHub=getCityGrowingTalents(demInfo,techMeta,6);
 const pillsSource=growingInHub.length?growingInHub:lastCrossItems.slice(0,6).map(a=>({artist:a,growthText:'Ativo'}));
 for(const item of pillsSource){
  const a=item.artist;
  const pill=el('button',`🔥 ${a.name} (${item.growthText})`);
  pill.type='button';
  pill.className='inspector-artist-pill';
  pill.title=`Focar e simular ${a.name} em ${activeHub.name}/${activeHub.uf}`;
  pill.addEventListener('click',()=>{
   field('talent').value=a.id;
   if($('artist-quick-search'))$('artist-quick-search').value=a.name;
   search(true);
  });
  topArtistsBar.append(pill);
 }
 const btnGroup=el('div');btnGroup.style.display='flex';btnGroup.style.gap='6px';btnGroup.style.flexWrap='wrap';
 const modalSimBtn=el('button',`⚡ Simular Show (Local, Capacidade & Ingressos)`);
 modalSimBtn.type='button';
 modalSimBtn.className='btn-simulate-show';
 modalSimBtn.addEventListener('click',()=>openShowSimulatorModal(activeHub.code,activeArtist?.id,radiusKm));
 btnGroup.append(modalSimBtn);

 if(field('center')?.value!==String(activeHub.code)){
  const radiusBtn=el('button',`📍 Traçar Bacia de 100 km em ${activeHub.name}`);
  radiusBtn.type='button';
  radiusBtn.className='secondary-button';
  radiusBtn.addEventListener('click',()=>focusCommercialHub(activeHub.code,100));
  btnGroup.append(radiusBtn);
 }
 const commLink=el('a',`↗ Oportunidade Comercial`);
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
   const sc=compat?.score;
   const cls=compat?.verdict?.label||'Potencial calculado';
   scoreBadge.textContent=sc!=null
    ?`⚡ Compatibilidade Comercial (${activeArtist.name} × ${activeHub.name}/${activeHub.uf}): ${sc}/100 · ${cls}`
    :`⚡ Praça pronta para simulação comercial (${activeHub.name}/${activeHub.uf})`;
   if(compat?.catchment?.totalMunicipalities){
    const basinBox=metricsGrid.children[3];
    if(basinBox){
     basinBox.replaceChildren(
      el('span',`Bacia Regional (${radiusKm} km)`),
      el('strong',`${fmt(compat.catchment.totalMunicipalities)} municípios`),
      el('small',compat.catchment.knownPopulation?`População nos polos do raio: ${fmt(compat.catchment.knownPopulation)} hab`:`Alcance territorial a partir de ${activeHub.name}`)
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
   const cp=new URLSearchParams({limit:'300'});
   for(const key of ['talent','category','modality'])if(field(key)?.value)cp.set(key,field(key).value);
   const qInput=$('artist-quick-search')?.value?.trim()||'';
   if(qInput&&!field('talent').value)cp.set('q',qInput);
   const [cross,freshCats]=await Promise.all([
    get('/api/radar/cross-summary?'+cp),
    get('/api/regional/categories').catch(()=>null)
   ]);
   if(n!==request)return;
   if(freshCats?.categories){
    categoryCatalog=freshCats.categories;
    catalogTotal=freshCats.total??cross?.counts?.talents??catalogTotal;
   }else if(cross?.counts?.talents!=null){
    catalogTotal=cross.counts.talents;
   }
   categoryCards(categoryCatalog,'Cadastro nacional de talentos — indicadores consolidados das 4 mídias e presença territorial',catalogTotal);
   lastCrossItems=cross.items||[];
   if(cross.items?.length&&!field('category')?.value&&!qInput){
    options(field('talent'),cross.items.map(t=>({id:t.id,name:t.name})),'Todos com dados');
    const dl=$('talent-datalist');
    if(dl){
     const talentOpts=cross.items.map(r=>{const o=document.createElement('option');o.value=r.name;return o;});
     const cityOpts=(demographicsData?.items||[]).slice(0,30).map(h=>{const o=document.createElement('option');o.value=`${h.name} / ${h.uf}`;return o;});
     dl.replaceChildren(...talentOpts,...cityOpts);
    }
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
   const activeCatId=field('category').value||'';
   const activeCatObj=categoryCatalog.find(c=>String(c.id)===String(activeCatId));
   renderCategoryQuickDrawer(cross.items||[],activeCatId,activeCatObj?.name||'');
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
   const focusCode=field('center')?.value||([...selected][0]||activeTechnicalMarkerCode||'3550308');
   const focusCity=(demographicsData?.items||[]).find(d=>String(d.code)===String(focusCode))||catalog.find(c=>String(c.code)===String(focusCode))||(demographicsData?.items?.[0]||null);
   const focusMeta=focusCity?getCityTalentIndexMeta(focusCity):null;
   const cityGrowthTalents=focusCity?getCityGrowingTalents(focusCity,focusMeta,25):[];
   const growingRows=[];
   if(cityGrowthTalents.length&&focusCity){
    for(const item of cityGrowthTalents){
     const b=el('button',item.artist.name);
     b.type='button';
     b.className='link';
     b.addEventListener('click',()=>{
      field('talent').value=item.artist.id;
      if($('artist-quick-search'))$('artist-quick-search').value=item.artist.name;
      openShowSimulatorModal(focusCity.code,item.artist.id,Number(field('radius')?.value)||100);
     });
     growingRows.push([b,`${focusCity.name}/${focusCity.uf}`,item.bestNet,`+${item.growthPct.toFixed(1).replace('.',',')}%`,item.reachFormatted]);
    }
    $('growth-period').textContent=`📈 Talentos em maior crescimento e tração em ${focusCity.name} / ${focusCity.uf} (${focusMeta?.badgeLabel||'Polo monitorado'} · clique no talento p/ simular show):`;
    table('growth',['Artista','Cidade / Polo','Mídia Líder','Crescimento (30d)','Alcance Atual'],growingRows);
   }else{
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
   }
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

window.openRadarShowSimulator=openShowSimulatorModal;

let execModalBound=false;
function renderOverview20(cross){
 if(!$('executive-kpis'))return;
 const eo=cross?.executiveOverview;
 if(eo){
  const hhmm=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if($('exec-monitored'))$('exec-monitored').textContent=fmt(eo.monitoredTalents?.value??cross.total??0);
  if($('exec-monitored-sub'))$('exec-monitored-sub').textContent=`Alimentação automática (${hhmm}) · Clique p/ listar ↗`;
  if($('exec-profiles'))$('exec-profiles').textContent=fmt(eo.confirmedProfiles?.value??0);
  if($('exec-profiles-sub'))$('exec-profiles-sub').textContent=(eo.confirmedProfiles?.subtitle||'Quatro mídias')+' · Clique p/ abrir ↗';
  if($('exec-recent'))$('exec-recent').textContent=fmt(eo.recentCollections?.value??0);
  if($('exec-recent-sub'))$('exec-recent-sub').textContent=(eo.recentCollections?.subtitle||'Últimos 7 dias')+' · Clique p/ auditar ↗';
  if($('exec-quality'))$('exec-quality').textContent=eo.dataQuality?.formatted||eo.dataQuality?.label||'Verificado';
  if($('exec-quality-sub'))$('exec-quality-sub').textContent=(eo.dataQuality?.subtitle||'Talentos com coleta verificada')+' · Ver diagnóstico ↗';
 }
 if(!execModalBound){
  execModalBound=true;
  const cards=[...document.querySelectorAll('#executive-kpis .exec-kpi-card')];
  const modes=['talents','profiles','recent','quality'];
  cards.forEach((card,idx)=>{
   const mode=modes[idx]||'talents';
   card.classList.add('exec-kpi-clickable');
   card.setAttribute('role','button');
   card.setAttribute('tabindex','0');
   card.addEventListener('click',()=>openExecutiveDetailModal(mode));
   card.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){
     e.preventDefault();
     openExecutiveDetailModal(mode);
    }
   });
  });
 }
 const items=cross?.items||[];
 const chosenId=field('talent')?.value;
 const target=items.find(x=>x.id===chosenId)||items.find(x=>active360Artist&&x.id===active360Artist.id)||items.find(x=>Object.values(x.media||{}).some(m=>m?.value!=null))||items[0]||null;
 if(target)selectOverviewArtist360(target,false);
}

async function openExecutiveDetailModal(mode='talents',filterCatId='',filterCatName=''){
 const dialog=$('show-simulator-modal');
 const host=$('show-simulator-content');
 if(!dialog||!host)return;
 if(!dialog.open)dialog.showModal();
 host.replaceChildren(el('p','Carregando painel detalhado do catálogo nacional…'));

 let fullCross=null;
 try{
  const cp=new URLSearchParams({limit:'200'});
  if(filterCatId)cp.set('category',String(filterCatId));
  fullCross=await get('/api/radar/cross-summary?'+cp);
 }catch(e){
  host.replaceChildren(el('p','Não foi possível carregar os dados detalhados: '+e.message));
  return;
 }

 const allItems=fullCross?.items||[];
 const counts=fullCross?.counts||{};
 host.replaceChildren();

 const titles={
  talents:filterCatName?`📂 Talentos da Categoria: ${filterCatName} (${allItems.length})`:`📋 Catálogo Nacional de Talentos Monitorados (${counts.talents||allItems.length})`,
  verified_talents:`★ Artistas com Indicadores Verificados nas Mídias (${allItems.filter(a=>a.hasCollectedMetric).length})`,
  profiles:`🔗 Perfis Oficiais Confirmados nas 4 Mídias (${counts.confirmedProfiles||0} contas vinculadas)`,
  recent:`⚡ Coletas Verificadas Recentes — Últimos 7 Dias (${counts.recentCollections7d||0} indicadores)`,
  quality:`🛡 Diagnóstico de Qualidade, Procedência & Cobertura (${counts.withCollectedMetrics||0}/${counts.talents||allItems.length} talentos)`
 };
 const subtitles={
  talents:'Pesquise por nome, filtre por categoria e clique em qualquer talento para abrir sua Ficha 360° ou Simular Show.',
  verified_talents:'Talentos com métricas reais auditadas de YouTube Data API v3, Spotify Web API e relatórios públicos de Instagram.',
  profiles:'Vínculos oficiais validados via Wikidata, MusicBrainz e APIs oficiais nas 4 mídias (Instagram, Spotify, YouTube e TikTok).',
  recent:'Indicadores coletados e auditados nos últimos 7 dias com fonte, data de referência e link de comprovação.',
  quality:'Separação transparente entre talentos com coleta verificada ativa e talentos do catálogo aguardando coleta.'
 };

 const head=el('div');head.className='show-sim-head';
 const headLeft=el('div');
 const eye=el('span','DETALHAMENTO EXECUTIVO · RADAR DE TALENTOS');
 eye.className='eyebrow';
 const h2=el('h2',titles[mode]||titles.talents);
 const subP=el('p',subtitles[mode]||subtitles.talents);
 headLeft.append(eye,h2,subP);
 const closeBtn=el('button','✕ Fechar');
 closeBtn.type='button';
 closeBtn.className='secondary-button';
 closeBtn.addEventListener('click',()=>dialog.close());
 head.append(headLeft,closeBtn);
 host.append(head);

 // Abas de alternância rápida entre os 4 módulos executivos dentro do próprio modal
 const tabRow=el('div');tabRow.className='exec-modal-tabs';
 for(const [mKey,mLabel] of [
  ['talents',`📋 Talentos (${counts.talents||allItems.length})`],
  ['verified_talents',`★ Com Coleta (${counts.withCollectedMetrics||0})`],
  ['profiles',`🔗 Perfis Confirmados (${counts.confirmedProfiles||0})`],
  ['recent',`⚡ Coletas 7d (${counts.recentCollections7d||0})`],
  ['quality',`🛡 Qualidade & Pendentes`]
 ]){
  const tb=el('button',mLabel);
  tb.type='button';
  tb.className='map-mode-btn';
  tb.setAttribute('aria-pressed',String(mode===mKey));
  tb.addEventListener('click',()=>openExecutiveDetailModal(mKey,filterCatId,filterCatName));
  tabRow.append(tb);
 }
 host.append(tabRow);

 // Barra de busca + filtro por categoria / mídia dentro do modal
 const filterBar=el('div');filterBar.className='exec-modal-filterbar';
 const searchInp=el('input');
 searchInp.type='search';
 searchInp.setAttribute('aria-label','Filtrar lista por nome do artista ou mídia');
 searchInp.value='';

 const catSel=el('select');
 catSel.append(new Option('Todas as categorias',''));
 for(const c of categoryCatalog){
  const o=new Option(`${c.name} (${c.value})`,String(c.id));
  if(String(c.id)===String(filterCatId))o.selected=true;
  catSel.append(o);
 }
 catSel.addEventListener('change',()=>{
  const chosenCat=categoryCatalog.find(c=>String(c.id)===catSel.value);
  activateCategoryFilter(catSel.value,chosenCat?.name||'',false);
  openExecutiveDetailModal(mode,catSel.value,chosenCat?.name||'');
 });

 const netSel=el('select');
 for(const [nVal,nText] of [['','Todas as 4 mídias'],['Instagram','Instagram'],['Spotify','Spotify'],['YouTube','YouTube'],['TikTok','TikTok']]){
  netSel.append(new Option(nText,nVal));
 }

 filterBar.append(
  (() => { const l=el('label');l.className='show-sim-ctrl-card';l.append(el('span','Buscar Artista / Perfil'),searchInp);return l; })(),
  (() => { const l=el('label');l.className='show-sim-ctrl-card';l.append(el('span','Filtrar Categoria'),catSel);return l; })(),
  (() => { const l=el('label');l.className='show-sim-ctrl-card';l.append(el('span','Filtrar Mídia'),netSel);return l; })()
 );
 host.append(filterBar);

 const bodyWrap=el('div');bodyWrap.className='exec-modal-table-wrap';
 host.append(bodyWrap);

 function renderModalRows(){
  const q=normalize(searchInp.value);
  const netFilter=netSel.value;
  bodyWrap.replaceChildren();

  if(mode==='profiles'||mode==='recent'){
   const flatRows=[];
   for(const a of allItems){
    if(q&&!normalize(a.name).includes(q)&&!normalize((a.categories||[]).join(' ')).includes(q))continue;
    for(const net of ['Instagram','Spotify','YouTube','TikTok']){
     if(netFilter&&net!==netFilter)continue;
     const m=a.media?.[net];
     if(!m)continue;
     if(mode==='recent'&&m.value==null)continue;
     if(mode==='profiles'&&!m.url&&m.value==null)continue;
     flatRows.push({artist:a,net,m});
    }
   }
   if(!flatRows.length){
    bodyWrap.append(el('p','Nenhum registro encontrado para este filtro.'));
    return;
   }
   const tbl=el('table');
   const thead=el('thead'),trH=el('tr');
   ['Artista','Categoria','Mídia','Indicador Verificado','Fonte & Data','Perfil Oficial','Ações'].forEach(h=>trH.append(el('th',h)));
   thead.append(trH);tbl.append(thead);
   const tbody=el('tbody');
   for(const {artist,net,m} of flatRows.slice(0,180)){
    const tr=el('tr');
    const nameBtn=el('button',artist.name);
    nameBtn.type='button';nameBtn.className='link';
    nameBtn.addEventListener('click',()=>{dialog.close();focusArtistInOverview(artist);});
    const tdName=el('td');tdName.append(nameBtn);

    const tdCat=el('td',(artist.categories||[]).join(' · ')||'Sem categoria');
    const tdNet=el('td',net);
    tdNet.style.color=evoPalette[net]||'#e9d5ff';
    tdNet.style.fontWeight='700';

    const tdVal=el('td',m.value!=null?`${m.formatted} (${fmt(m.value)})`:'Aguardando coleta');
    const tdSrc=el('td',m.value!=null?`${m.source||'Verificado'} · ${m.observed_on||'Atual'}`:'Perfil pré-cadastrado');

    const tdUrl=el('td');
    if(m.url){
     const aLink=el('a','Abrir perfil ↗');
     aLink.href=m.url;aLink.target='_blank';aLink.rel='noopener noreferrer';
     tdUrl.append(aLink);
    }else{
     tdUrl.textContent='—';
    }

    const tdAct=el('td');
    const simB=el('button','⚡ Show');
    simB.type='button';simB.className='btn-simulate-show';
    simB.style.height='24px';simB.style.padding='0 8px';simB.style.fontSize='10.5px';
    simB.addEventListener('click',()=>openShowSimulatorModal(null,artist.id,100));
    tdAct.append(simB);

    tr.append(tdName,tdCat,tdNet,tdVal,tdSrc,tdUrl,tdAct);
    tbody.append(tr);
   }
   tbl.append(tbody);
   bodyWrap.append(tbl);
   return;
  }

  // Modos: talents, verified_talents, quality
  let list=allItems.filter(a=>{
   if(q&&!normalize(a.name).includes(q)&&!normalize((a.categories||[]).join(' ')).includes(q))return false;
   if(netFilter&&a.media?.[netFilter]?.value==null)return false;
   if(mode==='verified_talents')return Boolean(a.hasCollectedMetric);
   return true;
  });

  if(mode==='quality'){
   const verCount=list.filter(a=>a.hasCollectedMetric).length;
   const pendCount=list.length-verCount;
   const qGrid=el('div');qGrid.className='show-sim-kpi-grid';
   for(const [tag,val,sub] of [
    ['Com Coleta Verificada',`${fmt(verCount)} talentos`,'Métricas reais com fonte, data e evidência'],
    ['Aguardando Coleta',`${fmt(pendCount)} talentos`,'Identidade no catálogo pronta para enriquecimento'],
    ['YouTube & Spotify Ativos',`${fmt(list.filter(a=>a.media?.YouTube?.value!=null||a.media?.Spotify?.value!=null).length)} talentos`,'Coleta automática via API Oficial / Web Player'],
    ['Instagram Verificado',`${fmt(list.filter(a=>a.media?.Instagram?.value!=null).length)} talentos`,'Relatórios públicos verificados com evidência']
   ]){
    const c=el('div');c.className='show-sim-kpi-card cyan-neon';
    const sp=el('span',tag);sp.className='kpi-tag';
    c.append(sp,el('strong',val),el('small',sub));
    qGrid.append(c);
   }
   bodyWrap.append(qGrid);
  }

  const tbl=el('table');
  const thead=el('thead'),trH=el('tr');
  ['Artista / Talento','Categoria(s)','Instagram','Spotify','YouTube','TikTok','Status','Ações Rápidas'].forEach(h=>trH.append(el('th',h)));
  thead.append(trH);tbl.append(thead);
  const tbody=el('tbody');
  for(const a of list){
   const tr=el('tr');
   const nameBtn=el('button',a.name);
   nameBtn.type='button';nameBtn.className='link';
   nameBtn.addEventListener('click',()=>{dialog.close();focusArtistInOverview(a);});
   const tdName=el('td');tdName.append(nameBtn);
   const tdCat=el('td',(a.categories||[]).join(' · ')||'Sem categoria');

   const cellNet=net=>{
    const m=a.media?.[net];
    const td=el('td');
    if(m?.value!=null){
     const st=el('strong',m.formatted);
     st.style.color=evoPalette[net]||'#fafafa';
     td.append(st);
    }else{
     td.textContent=m?.url?'Vinculado':'—';
     td.style.color='#71717a';
    }
    return td;
   };

   const tdStatus=el('td',a.hasCollectedMetric?'✓ Verificado':'⏳ Catálogo');
   tdStatus.style.color=a.hasCollectedMetric?'#34d399':'#facc15';
   tdStatus.style.fontWeight='700';

   const tdAct=el('td');
   const actWrap=el('div');actWrap.style.display='flex';actWrap.style.gap='5px';
   const f360=el('button','◉ 360°');
   f360.type='button';f360.className='secondary-button';
   f360.style.height='24px';f360.style.padding='0 7px';f360.style.fontSize='10.5px';
   f360.addEventListener('click',()=>{dialog.close();focusArtistInOverview(a);});

   const simB=el('button','⚡ Show');
   simB.type='button';simB.className='btn-simulate-show';
   simB.style.height='24px';simB.style.padding='0 8px';simB.style.fontSize='10.5px';
   simB.addEventListener('click',()=>openShowSimulatorModal(null,a.id,100));

   actWrap.append(f360,simB);
   tdAct.append(actWrap);

   tr.append(tdName,tdCat,cellNet('Instagram'),cellNet('Spotify'),cellNet('YouTube'),cellNet('TikTok'),tdStatus,tdAct);
   tbody.append(tr);
  }
  tbl.append(tbody);
  bodyWrap.append(tbl);
 }

 searchInp.addEventListener('input',renderModalRows);
 netSel.addEventListener('change',renderModalRows);
 renderModalRows();
}
window.openRadarExecutiveModal=openExecutiveDetailModal;

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
window.addEventListener('radar:socket-event',ev=>{const t=ev?.detail?.topic||'';if(t==='discovery.updated'||t==='operations.sync_completed'){search(true);}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')search(true);});
setInterval(()=>{if(document.visibilityState==='visible')search(true);},45000);
(async()=>{try{let cats,municipal,demog;[mods,geo,cats,municipal,demog]=await Promise.all([get('/api/radar/modalities'),get('/api/radar/geography'),get('/api/regional/categories'),get('/api/radar/municipalities'),get('/api/radar/demographics').catch(()=>({items:[],byRegion:[]}))]);categoryCatalog=cats.categories;catalogTotal=cats.total;catalog=municipal.items;demographicsData=normalizeDemographicsPayload(demog);renderQuickHubsBar();options(field('category'),categoryCatalog.map(c=>({id:String(c.id),name:c.name})),'Todas');options(field('modality'),mods,'Todas');subs();filterCities();filterCenters();categoryCards(categoryCatalog,'Cadastro nacional de talentos',catalogTotal);await loadReports()}catch(e){$('message').textContent=e.message}})();
