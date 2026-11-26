'use strict';
(()=>{
  const project=([lon,lat])=>[20+(lon+75)*15,20+(6-lat)*13];
  const distKm=(a,b)=>{const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))))};
  const svg=(tag,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e};

  function ensureMunicipalCells(geo){
    if(!geo||geo._cellsByUf)return geo?._cellsByUf??new Map();
    const byUf=new Map();
    for(const m of geo.municipalities??[]){
      if(m.lat==null||m.lon==null)continue;
      const [x,y]=project([m.lon,m.lat]);
      if(!byUf.has(m.uf))byUf.set(m.uf,[]);
      byUf.get(m.uf).push({...m,x,y});
    }
    const cellsByUf=new Map();
    for(const [uf,list] of byUf){
      const outList=[];
      for(let i=0;i<list.length;i++){
        const a=list[i],nb=[];
        for(let j=0;j<list.length;j++){
          if(i===j)continue;
          const b=list[j],dx=b.x-a.x,dy=b.y-a.y;
          if(Math.abs(dx)>140||Math.abs(dy)>140)continue;
          nb.push({b,d:dx*dx+dy*dy});
        }
        nb.sort((p,q)=>p.d-q.d);
        const top=nb.slice(0,18);
        let poly=[[0,0],[680,0],[680,570],[0,570]];
        for(const {b} of top){
          const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,nx=b.x-a.x,ny=b.y-a.y,next=[];
          for(let k=0;k<poly.length;k++){
            const p1=poly[k],p2=poly[(k+1)%poly.length];
            const d1=(p1[0]-mx)*nx+(p1[1]-my)*ny,d2=(p2[0]-mx)*nx+(p2[1]-my)*ny;
            if(d1<=0){
              next.push(p1);
              if(d2>0){const t=d1/(d1-d2);next.push([p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]);}
            }else if(d2<=0){
              const t=d1/(d1-d2);next.push([p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]);
            }
          }
          poly=next;
          if(!poly.length)break;
        }
        if(poly.length>=3){
          outList.push({...a,d:'M'+poly.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z'});
        }
      }
      cellsByUf.set(uf,outList);
    }
    geo._cellsByUf=cellsByUf;
    return cellsByUf;
  }

  window.renderRadarMunicipalMesh=function(s,target,geo,r,onSelectCity,onSelectUf){
    const cellsByUf=ensureMunicipalCells(geo);
    const defs=svg('defs');
    const stateGroup=svg('g',{class:'state-layer'});
    const muniGroup=svg('g',{class:'muni-layer'});
    const values=new Map((r.byState??[]).map(x=>[x.name,x.value])),max=Math.max(1,...values.values());
    const placeValues=new Map((r.places??[]).map(p=>[String(p.code),p.value])),maxPlace=Math.max(1,...placeValues.values());
    const selectedSet=new Set((r.explicitCities??[]).map(String));
    const hasRadius=Boolean(r.origin&&r.origin.lat!=null&&r.radius!=null&&r.radius>=0);
    const coveredMunis=[],coveredStates=new Set(),coveredRegions=new Set();
    let framedBox=null;

    for(const f of geo?.states?.features??[]){
      const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
      const ptsAll=[];
      const d=polys.flatMap(poly=>poly.map(ring=>ring.map((p,i)=>{const pt=project(p);ptsAll.push(pt);return(i?'L':'M')+pt.join(' ')}).join(' ')+'Z')).join(' ');
      const uf=f.properties.uf,v=values.get(uf);
      if(r.uf&&r.uf===uf&&ptsAll.length){
        const xs=ptsAll.map(p=>p[0]),ys=ptsAll.map(p=>p[1]);
        framedBox=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      }
      const clipId='clip-uf-'+uf;
      const cp=svg('clipPath',{id:clipId});
      cp.append(svg('path',{d,'clip-rule':'evenodd'}));
      defs.append(cp);

      const isActiveUf=r.uf&&r.uf===uf;
      const baseFill=isActiveUf?'rgba(168,85,247,0.34)':v?`rgba(168,85,247,${.16+.58*v/max})`:'#1f1f25';
      const stPath=svg('path',{d,fill:baseFill,stroke:isActiveUf?'#e9d5ff':'#71717a','stroke-width':isActiveUf?'1.6':'1','fill-rule':'evenodd',class:'state-path'});
      const stTitle=svg('title');
      stTitle.textContent=`Estado: ${uf}`+(v?` · Audiência: ${Number(v).toLocaleString('pt-BR')}`:'')+' (clique para filtrar o estado)';
      stPath.append(stTitle);
      stPath.addEventListener('click',()=>onSelectUf?.(uf));
      stateGroup.append(stPath);

      const ufMuniGroup=svg('g',{'clip-path':`url(#${clipId})`,class:'uf-muni-group'});
      for(const m of cellsByUf.get(uf)??[]){
        const pv=placeValues.get(String(m.code))??0;
        const isSelected=selectedSet.has(String(m.code));
        let inRadius=false,km=null;
        if(hasRadius){
          km=distKm(r.origin,m);
          if(km<=r.radius){
            inRadius=true;
            coveredMunis.push({...m,km,value:pv});
            coveredStates.add(m.uf);
            coveredRegions.add(m.region);
          }
        }
        const cls=['muni-cell'];
        if(isSelected)cls.push('selected-city');
        if(inRadius)cls.push('in-radius');
        if(pv>0)cls.push('has-data');
        const fill=isSelected?'rgba(250,204,21,0.72)':pv>0?`rgba(234,179,8,${.28+.62*Math.sqrt(pv/maxPlace)})`:inRadius?'rgba(168,85,247,0.34)':'transparent';
        const cell=svg('path',{d:m.d,fill,class:cls.join(' ')});
        const title=svg('title');
        title.textContent=`${m.name} / ${m.uf} (${m.region})`+(pv?` · Audiência: ${Number(pv).toLocaleString('pt-BR')}`:'')+(km!=null?` · Distância: ${km.toFixed(1)} km`:'')+' (clique para selecionar município)';
        cell.append(title);
        cell.addEventListener('click',e=>{e.stopPropagation();onSelectCity?.(m,e)});
        ufMuniGroup.append(cell);
      }
      muniGroup.append(ufMuniGroup);

      const borderPath=svg('path',{d,fill:'none',stroke:isActiveUf?'#e9d5ff':'#a1a1aa','stroke-width':isActiveUf?'1.4':'1','pointer-events':'none','fill-rule':'evenodd',class:'state-border'});
      muniGroup.append(borderPath);
    }

    s.append(defs,stateGroup,muniGroup);

    if(hasRadius){
      const a=r.origin.lat*Math.PI/180,b=r.origin.lon*Math.PI/180,ang=r.radius/6371;
      const pts=Array.from({length:97},(_,i)=>{
        const t=i/96*2*Math.PI;
        const lat=Math.asin(Math.sin(a)*Math.cos(ang)+Math.cos(a)*Math.sin(ang)*Math.cos(t));
        const lon=b+Math.atan2(Math.sin(t)*Math.sin(ang)*Math.cos(a),Math.cos(ang)-Math.sin(a)*Math.sin(lat));
        return project([lon*180/Math.PI,lat*180/Math.PI]);
      });
      s.append(svg('polygon',{points:pts.map(p=>p.join(',')).join(' '),fill:'#a855f71a',stroke:'#e9d5ff','stroke-width':'1.4','stroke-dasharray':'5 3','pointer-events':'none',class:'radius-ring'}));

      coveredMunis.sort((p,q)=>p.km-q.km);
      const box=document.createElement('div');
      box.className='radius-summary';
      const strong=document.createElement('strong');
      strong.textContent=`Abrangência no raio de ${Number(r.radius).toLocaleString('pt-BR')} km a partir de ${r.origin.name}/${r.origin.uf}: `;
      const span=document.createElement('span');
      const preview=coveredMunis.slice(0,10).map(m=>`${m.name}/${m.uf}`).join(', ');
      span.textContent=`${coveredMunis.length} municípios abrangidos em ${coveredStates.size} UF (${[...coveredRegions].join(', ') || r.origin.region}). `+(preview?`Principais: ${preview}${coveredMunis.length>10?` (+${coveredMunis.length-10} municípios)`:''}.`:'');
      box.append(strong,span);
      target.append(box);
    }

    if(framedBox){
      const minX=Math.max(0,framedBox[0]-26),maxX=Math.min(680,framedBox[2]+26);
      const minY=Math.max(0,framedBox[1]-22),maxY=Math.min(570,framedBox[3]+22);
      const rawW=Math.max(45,maxX-minX),rawH=Math.max(38,maxY-minY);
      const w=Math.max(rawW,rawH*680/570),h=w*570/680;
      const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
      s.dataset.initialView=[Math.max(0,Math.min(680-w,cx-w/2)),Math.max(0,Math.min(570-h,cy-h/2)),w,h].map(n=>n.toFixed(2)).join(' ');
    }
  };

  const host=document.getElementById('map'),status=document.getElementById('connection-status');
  async function health(){try{const r=await fetch('/api/health',{cache:'no-store'});const d=await r.json();if(!r.ok||d.ok!==true)throw Error('Backend indisponível');if(status){status.textContent='Backend conectado';status.parentElement.dataset.state='online'}}catch{if(status){status.textContent='Backend indisponível';status.parentElement.dataset.state='offline'}}}health();setInterval(health,60000);
  let current=null,base=null,view=null,drag=null,suppress=false;
  function render(){
    if(!current||!view)return;
    current.setAttribute('viewBox',view.join(' '));
    const zoom=base?base[2]/view[2]:1;
    current.dataset.zoom=zoom>=1.3?'municipios':'nacional';
    current.style.setProperty('--map-zoom',zoom.toFixed(2));
  }
  function zoomAt(factor,clientX,clientY){
    if(!current||!view||!base)return;
    const rect=current.getBoundingClientRect();
    const rx=rect.width>0?Math.max(0,Math.min(1,(clientX-rect.left)/rect.width)):0.5;
    const ry=rect.height>0?Math.max(0,Math.min(1,(clientY-rect.top)/rect.height)):0.5;
    const w=Math.max(base[2]/18,Math.min(base[2],view[2]*factor)),h=w*base[3]/base[2];
    const vx=view[0]+(view[2]-w)*rx,vy=view[1]+(view[3]-h)*ry;
    view=[Math.max(0,Math.min(base[2]-w,vx)),Math.max(0,Math.min(base[3]-h,vy)),w,h];
    render();
  }
  function attach(){
    if(!host)return;
    const s=host.querySelector('svg');if(s===current)return;current=s;if(!s)return;
    base=s.getAttribute('viewBox').split(/\s+/).map(Number);
    view=s.dataset.initialView?s.dataset.initialView.split(/\s+/).map(Number):[...base];
    render();
    s.addEventListener('wheel',e=>{
      e.preventDefault();
      const factor=e.deltaY<0?0.82:1.22;
      zoomAt(factor,e.clientX,e.clientY);
    },{passive:false});
    s.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,view:[...view],id:e.pointerId,moved:false};});
    s.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)<12&&!drag.moved)return;if(!drag.moved){drag.moved=true;try{s.setPointerCapture(e.pointerId);}catch{}s.classList.add('dragging')}const scale=Math.min(s.clientWidth/view[2],s.clientHeight/view[3]);view=[Math.max(0,Math.min(base[2]-view[2],drag.view[0]-dx/scale)),Math.max(0,Math.min(base[3]-view[3],drag.view[1]-dy/scale)),view[2],view[3]];render()});
    function end(e){if(drag?.moved){try{if(e?.pointerId!=null&&s.hasPointerCapture?.(e.pointerId))s.releasePointerCapture(e.pointerId);}catch{}suppress=true;setTimeout(()=>suppress=false,50)}drag=null;s.classList.remove('dragging')}
    s.addEventListener('pointerup',end);s.addEventListener('pointercancel',end);
    s.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation()}},true);
  }
  if(host){new MutationObserver(attach).observe(host,{childList:true});attach();}
  document.querySelectorAll('[data-map-action]').forEach(b=>b.addEventListener('click',()=>{
    if(!view||!current)return;
    if(b.dataset.mapAction==='reset'){
      view=[...base];render();
      if(typeof window.onRadarResetMap==='function')window.onRadarResetMap();
    }else{
      const rect=current.getBoundingClientRect();
      zoomAt(b.dataset.mapAction==='in'?0.78:1.28,rect.left+rect.width/2,rect.top+rect.height/2);
    }
  }));
})();

// Shared navigation, collapsible mobile sidebar, and search. No external dependency or fabricated records.
(()=>{
 const toggle=document.getElementById('sidebar-toggle');
 if(toggle){toggle.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));document.querySelectorAll('.sidebar nav a,.sidebar nav button').forEach(el=>el.addEventListener('click',()=>document.body.classList.remove('sidebar-open')));}
 const dialog=document.getElementById('command-palette'),input=document.getElementById('global-search'),results=document.getElementById('search-results'),trigger=document.getElementById('open-search'),form=document.getElementById('filters')||document.getElementById('commercial-filters');
 if(!dialog||!input||!results||!trigger||!form)return;
 const normalize=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
 function open(){if(!dialog.open){dialog.showModal();input.value='';render();input.focus()}}
 function parseArtistCity(raw){
  const m=String(raw||'').trim().match(/^(.+?)\s+(?:em|x|×)\s+(.+)$/i);
  if(m)return {artist:m[1].trim(),city:m[2].trim()};
  return {artist:String(raw||'').trim(),city:document.getElementById('compat-city')?.value?.trim()||''};
 }
 function goCompatibility(artist,city){
  if(typeof window.runRadarCompatibility==='function'){
   window.runRadarCompatibility(artist,city,80);
  }else{
   const p=new URLSearchParams({q:artist,radius:'80'});
   if(city)p.set('cityQuery',city);
   location.href='/commercial.html?'+p.toString()+'#compatibility-simulator';
  }
 }
 function render(){const q=normalize(input.value),entries=[],priority=[];
 if(q){
  const {artist,city}=parseArtistCity(input.value);
  if(artist){
   priority.push({
    label:city?`⚡ Simular Compatibilidade Comercial: ${artist} em ${city}`:`⚡ Selecionar no Simulador de Compatibilidade: ${artist}`,
    kind:'Viabilidade para Vendas · 4 Mídias + 7 Variáveis',
    run:()=>goCompatibility(artist,city)
   });
   priority.push({
    label:`↗ Abrir Ficha & 4 Mídias: ${artist}`,
    kind:'Oportunidade Comercial',
    run:()=>goCompatibility(artist,city)
   });
  }
 }
 for(const a of document.querySelectorAll('.sidebar nav a'))entries.push({label:a.textContent.trim(),kind:'Navegação',run:()=>{location.href=a.href}});
 for(const opt of document.querySelectorAll('#compat-artists-list option')){if(opt.value)entries.push({label:`${opt.value} — Simulador de Compatibilidade`,kind:'Compatibilidade Artista × Cidade',run:()=>goCompatibility(opt.value,document.getElementById('compat-city')?.value?.trim()||'')});}
 for(const [name,kind] of [['category','Categoria'],['talent','Artista'],['modality','Modalidade'],['submodality','Submodalidade'],['network','Mídia'],['region','Região'],['uf','Estado'],['city','Município'],['platform','Plataforma']]){const select=form.elements.namedItem(name);if(!(select instanceof HTMLSelectElement))continue;for(const option of [...select.options].slice(0,250)){if(!option.value)continue;entries.push({label:option.textContent,kind,run:()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));const det=form.closest('details');if(det)det.open=true;form.requestSubmit()}})}}
 if(q&&form.elements.namedItem('artist'))priority.push({label:'Filtrar artista: '+input.value,kind:'Pesquisa de talento',run:()=>{form.elements.namedItem('artist').value=input.value.trim();const det=form.closest('details');if(det)det.open=true;form.requestSubmit()}});
 const filtered=[...priority,...entries.filter(e=>!q||normalize(e.label+' '+e.kind).includes(q))].slice(0,30);
 results.replaceChildren();for(const entry of filtered){const b=document.createElement('button');b.type='button';b.textContent=entry.label;const small=document.createElement('small');small.textContent=entry.kind;b.append(small);b.addEventListener('click',()=>{dialog.close();entry.run()});results.append(b)}if(!results.children.length){const p=document.createElement('p');p.textContent='Nenhum resultado nos dados carregados.';results.append(p)}}
 trigger.addEventListener('click',open);document.getElementById('close-search').addEventListener('click',()=>dialog.close());input.addEventListener('input',render);input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus()}});document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.open?dialog.close():open()}});
 const network=form.elements.namedItem('network');if(network){const urlNet=new URLSearchParams(location.search).get('network');if(urlNet&&[...network.options].some(o=>o.value===urlNet))network.value=urlNet;const buttons=document.querySelectorAll('[data-network]');const update=()=>buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.network===network.value)));buttons.forEach(b=>b.addEventListener('click',()=>{if(network.value!==b.dataset.network){network.value=b.dataset.network;network.dispatchEvent(new Event('change',{bubbles:true}))}}));network.addEventListener('change',update);update()}
})();
