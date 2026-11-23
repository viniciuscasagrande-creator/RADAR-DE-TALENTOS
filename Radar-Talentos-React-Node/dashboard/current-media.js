'use strict';
(()=>{
const main=document.querySelector('main');if(!main)return;
const make=(tag,text,parent)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(parent)parent.append(e);return e;};
const section=make('section');section.id='current-media';section.setAttribute('aria-label','Indicadores atuais das mídias');
const anchor=document.querySelector('#overview');anchor?.after(section);if(!section.isConnected)main.prepend(section);
make('h2','Indicadores atuais — Todas as mídias',section);
make('p','Dados atuais por perfil confirmado; valores das demais mídias são registros autorizados pelo operador. Não representam audiência brasileira ou municipal, crescimento estimado ou viabilidade comercial. Variações de 7d e 30d só aparecem quando existem duas observações reais no período.',section);
const form=make('form',null,section);form.className='filter-panel';const label=make('label','Artista',form);const input=make('input',null,label);input.type='search';input.maxLength=120;input.autocomplete='off';const button=make('button','Consultar indicadores',form);button.type='submit';
const status=make('p',null,section);status.setAttribute('role','status');const scroll=make('div',null,section);scroll.className='scroll';
const labels=['Artista / perfil','Mídia','Indicadores atuais e variação (7d/30d)','Fonte e coleta (horário de Brasília)'];const names={subscribers:'Inscritos (arredondados)',views:'Visualizações acumuladas',video_count:'Vídeos',followers:'Seguidores',posts:'Publicações',monthly_listeners:'Ouvintes mensais',likes:'Curtidas totais'};
const num=v=>v==null?'—':v.toLocaleString('pt-BR');
const signed=v=>v==null?'—':(v>0?'+':'')+num(v);
const fmtDelta=c=>c&&Number.isFinite(c.absolute)?`${signed(c.absolute)}${c.percent!=null?` (${c.percent>0?'+':''}${c.percent.toFixed(1)}%)`:''}`:null;
let seq=0;
async function load(){const id=++seq;status.textContent='Consultando indicadores atuais...';scroll.replaceChildren();try{const p=new URLSearchParams({q:input.value.trim()});const r=await fetch('/api/current-media?'+p,{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(id!==seq)return;if(!d.items.length){status.textContent='Nenhuma coleta atual disponível para esta busca.';return;}status.textContent='Valores atuais por perfil, sem consolidação'+(d.truncated?' · refine a busca para ver outros resultados.':'.');const table=make('table',null,scroll),thead=make('thead',null,table),head=make('tr',null,thead);labels.forEach(h=>make('th',h,head));const body=make('tbody',null,table);for(const a of d.items){const tr=make('tr',null,body),td=make('td',null,tr);make('strong',a.name,td);make('br',null,td);const link=make('a','Abrir perfil',td);link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';make('td',a.network,tr);const vals=make('td',null,tr),src=make('td',null,tr);for(const [key,m] of Object.entries(a.metrics)){const d7=fmtDelta(m.change_7d),d30=fmtDelta(m.change_30d);const evo=[d7?`7d: ${d7}`:null,d30?`30d: ${d30}`:null].filter(Boolean).join(' · ');make('div',(names[key]||key)+': '+num(m.value)+(evo?` (${evo})`:''),vals);const line=make('div',(a.source||'youtube-public-current')+' · '+new Date(m.observed_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),src);if(m.evidence_url){const l=make('a',' Evidência',line);l.href=m.evidence_url;l.target='_blank';l.rel='noopener noreferrer';}}}}catch{if(id===seq)status.textContent='Não foi possível consultar os indicadores atuais. Tente novamente.';}}
const commercial=document.querySelector('#commercial-filters');
const urlQ=new URLSearchParams(location.search).get('q')||'';
if(urlQ)input.value=urlQ;
form.addEventListener('submit',e=>{
  e.preventDefault();
  load();
  if(commercial?.elements?.q){
    commercial.elements.q.value=input.value.trim();
    commercial.dispatchEvent(new CustomEvent('radar:sync-filter'));
  }
});
const home=document.querySelector('#artist-quick-search');const homeBtn=document.querySelector('#artist-quick-btn');function fromHome(){if(home){input.value=home.value;load();}}homeBtn?.addEventListener('click',fromHome);home?.addEventListener('keydown',e=>{if(e.key==='Enter')fromHome();});
commercial?.addEventListener('submit',()=>{input.value=commercial.elements.q?.value??'';load();});load();
})();
