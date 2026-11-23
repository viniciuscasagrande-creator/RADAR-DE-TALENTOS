'use strict';
(()=>{
 const area=document.getElementById('acceleration-results');if(!area)return;
 const category=document.getElementById('acceleration-category'),network=document.getElementById('acceleration-network'),status=document.getElementById('acceleration-status'),total=document.getElementById('acceleration-total');
 const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});let data=[];
 const el=(tag,txt)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;return n};
 function draw(){const cats=[...new Set(data.flatMap(x=>x.categories))].sort((a,b)=>a.localeCompare(b,'pt-BR'));const old=category.value;category.replaceChildren(new Option('Todos os segmentos',''),...cats.map(x=>new Option(x,x)));if(cats.includes(old))category.value=old;
 const filtered=data.filter(x=>(!category.value||x.categories.includes(category.value))&&(!network.value||x.network===network.value));total.textContent=fmt(filtered.length);area.replaceChildren();if(!filtered.length){area.append(el('p','Sem evidência de aceleração neste recorte. Isso não significa ausência de novos talentos.'));return;}
 const table=el('table');const thead=table.createTHead(),h=thead.insertRow();for(const name of ['Artista / segmento','Mídia','30d anteriores','30d recentes','Aceleração','Evidência'])h.insertCell().textContent=name;
 const tbody=table.createTBody();for(const x of filtered){const tr=tbody.insertRow();tr.insertCell().textContent=x.name+' · '+x.categories.join(', ');tr.insertCell().textContent=x.network;tr.insertCell().textContent=fmt(x.previous_growth_pct)+'%';tr.insertCell().textContent=fmt(x.recent_growth_pct)+'%';tr.insertCell().textContent='+'+fmt(x.acceleration_pp)+' p.p.';const td=tr.insertCell();const a=el('a','Ver referência');a.href=x.evidence_url;a.target='_blank';a.rel='noopener noreferrer';td.append(a);td.append(el('small',' · '+x.last_on+' · fonte declarada: '+x.source));}area.append(table);
 }
 async function load(){status.textContent='Consultando observações comparáveis...';try{const r=await fetch('/api/discoveries/acceleration',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();data=Array.isArray(j.items)?j.items:[];draw();status.textContent=`${fmt(j.total)} sinais com três observações comparáveis (dois períodos). Revisão de procedência obrigatória.`;}catch(e){data=[];total.textContent='—';area.replaceChildren();status.textContent='Consulta indisponível: '+e.message;}}
 category.addEventListener('change',draw);network.addEventListener('change',draw);document.getElementById('acceleration-refresh')?.addEventListener('click',load);load();
})();
