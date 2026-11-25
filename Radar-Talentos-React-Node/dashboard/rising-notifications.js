'use strict';(()=>{
 const mark=document.querySelector('.sidebar .radar-mark');
 if(mark&&!mark.querySelector('img')){
  mark.textContent='';
  const logoImg=document.createElement('img');
  logoImg.className='brand-logo-img';
  logoImg.src='/radar-logo-mark.png';
  logoImg.alt='';
  mark.append(logoImg);
 }
 if(document.getElementById('radar-notification-bell'))return;
 const host=
  document.querySelector('.top-search-bar')||
  document.querySelector('.compat-topbar-actions')||
  document.querySelector('.commercial-topbar')||
  document.querySelector('.ac-actions')||
  document.querySelector('.topbar-actions')||
  document.querySelector('.topline')||
  document.querySelector('.topbar')||
  document.querySelector('.ac-top-header')||
  document.querySelector('.disc-top-header')||
  document.querySelector('.rising-top')||
  document.querySelector('.dashboard-main > :first-child')||
  document.querySelector('main > :first-child');
 if(!host)return;
 const box=document.createElement('div');
 box.className='radar-notify';
 const btn=document.createElement('button');
 btn.id='radar-notification-bell';
 btn.type='button';
 btn.title='Notificações de artistas em ascensão';
 btn.setAttribute('aria-label','Abrir notificações de novos artistas em ascensão');
 btn.setAttribute('aria-expanded','false');
 btn.innerHTML='&#128276;';
 const count=document.createElement('span');
 count.className='radar-notify-count';
 count.hidden=true;
 btn.append(count);
 const panel=document.createElement('div');
 panel.className='radar-notify-panel';
 panel.hidden=true;
 box.append(btn,panel);
 host.append(box);
 btn.addEventListener('click',e=>{
  e.stopPropagation();
  panel.hidden=!panel.hidden;
  btn.setAttribute('aria-expanded',String(!panel.hidden));
 });
 document.addEventListener('click',e=>{
  if(!panel.hidden&&!box.contains(e.target)){
   panel.hidden=true;
   btn.setAttribute('aria-expanded','false');
  }
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!panel.hidden){
   panel.hidden=true;
   btn.setAttribute('aria-expanded','false');
  }
 });
 async function load(){
  try{
   const r=await fetch('/api/discoveries/rising?limit=10',{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();
   const n=data.total||0;
   count.hidden=n===0;
   count.textContent=n>99?'99+':String(n);
   panel.replaceChildren();
   const h=document.createElement('strong');
   h.textContent=n?`${n} talento(s) com crescimento observado`:'Monitoramento de Ascensão Ativo';
   panel.append(h);
   if(!n){
    const sub=document.createElement('p');
    sub.textContent='53 artistas monitorados com métricas verificadas (YouTube, Spotify e Instagram). Novos alertas surgem automaticamente a partir da 2ª janela comparável de 30 dias.';
    panel.append(sub);
   }
   for(const x of data.items||[]){
    const p=document.createElement('p');
    p.textContent=`${x.name} · ${x.network} · +${x.change_pct.toLocaleString('pt-BR')}% (30d)`;
    panel.append(p);
   }
   const a=document.createElement('a');
   a.href='/rising.html';
   a.textContent='Abrir painel de descobertas em ascensão ↗';
   panel.append(a);
  }catch{
   panel.replaceChildren();
   panel.textContent='Notificações temporariamente indisponíveis';
   count.hidden=true;
  }
 }
 load();
 setInterval(load,120000);
})();
