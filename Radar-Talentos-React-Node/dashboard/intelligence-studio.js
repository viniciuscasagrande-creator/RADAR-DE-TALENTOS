'use strict';
/* RADAR — Intelligence Studio: interface de leitura, não persiste nem altera indicadores. */
(()=>{
  const main=document.querySelector('main.dashboard-main, main');
  const overview=document.getElementById('overview');
  if(!main||!overview||document.getElementById('radar-intelligence-studio'))return;
  const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
  const section=el('section','radar-studio');section.id='radar-intelligence-studio';
  section.setAttribute('aria-label','Painel de inteligência das mídias');
  const header=el('header','studio-header');
  const heading=el('div');heading.append(el('span','studio-eyebrow','PAINEL DE INTELIGÊNCIA'),el('h2',null,'Desempenho das mídias'),el('p',null,'Compare artistas com indicadores observados. Cada valor mantém a fonte e a data da coleta.'));
  const toolbar=el('div','studio-toolbar');const network=el('select');network.setAttribute('aria-label','Filtrar por mídia');
  for(const x of ['Todas as mídias','Instagram','Spotify','YouTube','TikTok']){const o=document.createElement('option');o.value=x==='Todas as mídias'?'':x;o.textContent=x;network.append(o)}
  const metric=el('select');metric.setAttribute('aria-label','Selecionar indicador');
  const refresh=el('button','studio-button','Atualizar');refresh.type='button';
  toolbar.append(network,metric,refresh);header.append(heading,toolbar);
  const cards=el('div','studio-stats');
  const names=[['Artistas com indicadores','artists'],['Perfis com indicadores','profiles'],['Mídias com coleta','networks'],['Última observação','latest']];
  const statValues={};for(const [title,id] of names){const box=el('div','studio-stat');box.append(el('span',null,title));const v=el('strong',null,'—');statValues[id]=v;box.append(v);cards.append(box)}
  const content=el('div','studio-content');
  const chartCard=el('article','studio-panel studio-chart');
  const chartTitle=el('div','studio-panel-title');chartTitle.append(el('h3',null,'Comparação de artistas'),el('span','studio-source','Por indicador e mídia'));
  const chartInfo=el('p','studio-note','Selecione uma mídia e um indicador para comparar valores da mesma unidade.');
  const chart=el('div','studio-bars');chart.setAttribute('role','region');chart.setAttribute('aria-label','Gráfico de comparação por artista');
  chartCard.append(chartTitle,chartInfo,chart);
  const tableCard=el('article','studio-panel studio-table-panel');
  const tt=el('div','studio-panel-title');tt.append(el('h3',null,'Perfis e evidências'));
  const tableWrap=el('div','studio-table-scroll');tableCard.append(tt,tableWrap);
  content.append(chartCard,tableCard);
  const foot=el('p','studio-footnote','Valores de mídias diferentes não são somados. Instagram, Spotify e TikTok podem depender de registro autorizado; dados municipais exigem relatórios regionais específicos.');
  const status=el('p','studio-status','Carregando dados observados...');status.setAttribute('role','status');
  section.append(header,cards,content,status,foot);
  const subbar=overview.querySelector('.subbar');if(subbar)subbar.after(section);else overview.prepend(section);
  const displayNames={followers:'Seguidores',subscribers:'Inscritos',monthly_listeners:'Ouvintes mensais',posts:'Publicações',views:'Visualizações',video_count:'Vídeos',likes:'Curtidas'};
  const format=n=>Number(n).toLocaleString('pt-BR');
  const date=s=>{const d=new Date(s);return Number.isFinite(+d)?d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Data indisponível';};
  let items=[],loadingId=0;
  function metricsForNetwork(){const rows=items.filter(x=>!network.value||x.network===network.value);return [...new Set(rows.flatMap(x=>Object.keys(x.metrics||{})))].sort((a,b)=>(displayNames[a]||a).localeCompare(displayNames[b]||b,'pt-BR'));}
  function render(){
    const subset=items.filter(x=>!network.value||x.network===network.value);
    const keys=metricsForNetwork();const old=metric.value;metric.replaceChildren();for(const k of keys){const o=document.createElement('option');o.value=k;o.textContent=displayNames[k]||k;metric.append(o)}
    if(keys.includes(old))metric.value=old;else if(keys.includes(network.value==='Spotify'?'monthly_listeners':'followers'))metric.value=network.value==='Spotify'?'monthly_listeners':'followers';else if(keys.includes('subscribers'))metric.value='subscribers';
    const valid=subset.flatMap(a=>Object.entries(a.metrics||{}).map(([key,m])=>({...a,metric:key,value:m.value,observed_at:m.observed_at,metric_source:m.evidence_url||'',collected_source:a.source||'YouTube Data API'}))).filter(x=>Number.isFinite(x.value)&&x.value>=0);
    const unique=new Set(valid.map(x=>x.talent_id));const latest=valid.map(x=>Date.parse(x.observed_at)).filter(Number.isFinite);
    statValues.artists.textContent=unique.size?format(unique.size):'—';statValues.profiles.textContent=valid.length?format(new Set(valid.map(x=>x.url)).size):'—';statValues.networks.textContent=valid.length?String(new Set(valid.map(x=>x.network)).size):'—';statValues.latest.textContent=latest.length?date(new Date(Math.max(...latest)).toISOString()):'—';
    chart.replaceChildren();tableWrap.replaceChildren();
    const selected=valid.filter(x=>x.metric===metric.value).sort((a,b)=>b.value-a.value);
    if(!network.value){chart.append(el('p','studio-empty','Selecione uma mídia para comparar o mesmo indicador entre artistas.'));}
    else if(!selected.length){chart.append(el('p','studio-empty',`Sem valores observados para ${network.value}. A coleta ainda não está disponível.`));}
    else{
      const max=Math.max(1,...selected.map(x=>x.value));
      for(const x of selected.slice(0,12)){
        const row=el('div','studio-barrow');
        const label=el('div','studio-bar-label');label.append(el('strong',null,x.name),el('span',null,date(x.observed_at)));
        const track=el('div','studio-track');const fill=el('span','studio-fill');fill.style.width=Math.max(2,x.value/max*100)+'%';track.append(fill);
        row.append(label,track,el('b','studio-amount',format(x.value)));chart.append(row);
      }
      if(selected.length>12)chart.append(el('p','studio-note',`Exibindo os 12 primeiros de ${selected.length} registros. Use a busca para refinar.`));
    }
    if(!subset.length){tableWrap.append(el('p','studio-empty','Nenhum perfil com indicadores observados neste recorte.'));}
    else{
      const t=el('table','studio-table'),head=el('thead'),tr=el('tr');
      for(const h of ['Artista','Mídia','Indicadores','Coleta'])tr.append(el('th',null,h));head.append(tr);t.append(head);
      const body=el('tbody');for(const a of subset.slice(0,30)){
        const tr=el('tr');const name=el('td');const link=el('a',null,a.name);link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';name.append(link);tr.append(name,el('td',null,a.network));
        const vals=el('td');for(const [k,v] of Object.entries(a.metrics||{}))vals.append(el('div',null,`${displayNames[k]||k}: ${format(v.value)}`));tr.append(vals);
        const prov=el('td');for(const v of Object.values(a.metrics||{})){const div=el('div',null,`${date(v.observed_at)} · ${a.source||'YouTube Data API'}`);if(v.evidence_url){const l=el('a',null,' Evidência');l.href=v.evidence_url;l.target='_blank';l.rel='noopener noreferrer';div.append(l)}prov.append(div)}tr.append(prov);body.append(tr);
      }t.append(body);tableWrap.append(t);
    }
    chartInfo.textContent=network.value?`${displayNames[metric.value]||metric.value||'Sem indicador'} · ${network.value} · última observação disponível`:'Selecione uma mídia: unidades diferentes não são comparáveis.';
    status.textContent=valid.length?`${valid.length} indicadores observados no recorte. Valores não devem ser interpretados como audiência municipal ou estimativa de vendas.`:'Sem indicadores observados no recorte. Nenhum valor foi estimado.';
  }
  async function load(){const id=++loadingId;status.textContent='Consultando dados reais do Radar...';refresh.disabled=true;
    try{const q=document.getElementById('artist-quick-search')?.value?.trim()||'';const response=await fetch('/api/current-media?'+new URLSearchParams({q}),{cache:'no-store'});
      if(!response.ok)throw Error(`API ${response.status}`);const data=await response.json();if(id!==loadingId)return;items=Array.isArray(data.items)?data.items.filter(x=>x&&typeof x.name==='string'&&typeof x.network==='string'&&typeof x.url==='string'):[];render();if(data.truncated)status.textContent+=' A consulta foi limitada no servidor: refine a pesquisa.';
    }catch(e){if(id===loadingId){items=[];render();status.textContent='Não foi possível consultar a API. Os dados antigos não foram reutilizados: '+e.message}}
    finally{if(id===loadingId)refresh.disabled=false}
  }
  network.addEventListener('change',render);metric.addEventListener('change',render);refresh.addEventListener('click',load);
  document.getElementById('artist-quick-btn')?.addEventListener('click',load);
  document.getElementById('artist-quick-search')?.addEventListener('keydown',e=>{if(e.key==='Enter')load()});
  load();
})();
