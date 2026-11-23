'use strict';(()=>{
 if(document.getElementById('radar-notification-bell'))return;
 const host=document.querySelector('.topline, .ac-top-header, .rising-top, .dashboard-main > :first-child, main > :first-child');
 if(!host)return;
 const box=document.createElement('div');box.className='radar-notify';const btn=document.createElement('button');btn.id='radar-notification-bell';btn.type='button';btn.setAttribute('aria-label','Abrir notificações de novos artistas em ascensão');btn.setAttribute('aria-expanded','false');btn.textContent='♧';btn.innerHTML='&#128276;';
 const count=document.createElement('span');count.className='radar-notify-count';count.hidden=true;btn.append(count);const panel=document.createElement('div');panel.className='radar-notify-panel';panel.hidden=true;box.append(btn,panel);host.append(box);
 btn.addEventListener('click',()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden));});
 async function load(){try{const r=await fetch('/api/discoveries/rising?limit=10',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();const n=data.total||0;count.hidden=n===0;count.textContent=n>99?'99+':String(n);panel.replaceChildren();const h=document.createElement('strong');h.textContent=n?`${n} talento(s) com crescimento observado`:'Nenhum crescimento elegível';panel.append(h);for(const x of data.items||[]){const p=document.createElement('p');p.textContent=`${x.name} · ${x.network} · +${x.change_pct.toLocaleString('pt-BR')}% (30d)`;panel.append(p);}const a=document.createElement('a');a.href='/rising.html';a.textContent='Abrir descobertas em ascensão';panel.append(a);}catch{panel.replaceChildren();panel.textContent='Notificações temporariamente indisponíveis';count.hidden=true;}}
 load();setInterval(load,120000);
})();
