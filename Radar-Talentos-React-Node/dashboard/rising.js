'use strict';(()=>{
 const q=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('pt-BR');let data=[];
 function draw(){const host=q('rising-results');host.replaceChildren();const selected=q('rising-filter').value;const rows=data.filter(x=>!selected||x.network===selected);if(!rows.length){const p=document.createElement('p');p.textContent='Nenhum crescimento comparável registrado neste filtro. Isso não significa ausência de potencial.';host.append(p);return;}
 const table=document.createElement('table');table.className='rising-table';const head=table.createTHead().insertRow();for(const v of ['Artista','Rede','Crescimento (30 dias)','Antes / Agora','Fonte e evidência'])head.insertCell().textContent=v;
 for(const x of rows){const tr=table.createTBody().insertRow();tr.insertCell().textContent=x.name;tr.insertCell().textContent=x.network;tr.insertCell().textContent='+'+x.change_pct.toLocaleString('pt-BR',{maximumFractionDigits:2})+'% (+'+fmt(x.delta)+')';tr.insertCell().textContent=fmt(x.baseline_value)+' → '+fmt(x.value)+' · '+x.baseline_on+' / '+x.observed_on;const cell=tr.insertCell();cell.append(document.createTextNode(x.source+' · '));const a=document.createElement('a');a.href=x.evidence_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Ver referência';cell.append(a);}
 host.append(table);
 }
 async function load(){try{const r=await fetch('/api/discoveries/rising',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();data=Array.isArray(j.items)?j.items:[];q('rising-total').textContent=fmt(j.total??0);q('rising-status').textContent=`Critério: +${j.criteria.minimum_growth_pct}% e +${j.criteria.minimum_absolute_growth} unidades em aproximadamente 30 dias. ${j.notice}`;draw();}catch(e){q('rising-status').textContent='Não foi possível consultar sinais de crescimento: '+e.message;}}
 q('rising-filter').addEventListener('change',draw);load();
})();
