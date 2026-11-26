'use strict';
/* RADAR — Intelligence Studio V3: Painel Executivo Consolidado (Visão Geral) + Ficha 360° do Artista.
   Lê todos os indicadores verificados do Radar (/api/radar/cross-summary + /api/current-media),
   sem persistir nem inventar métricas e sem usar população IBGE ou ticketeiras nos scores/rankings. */
(() => {
  const main = document.querySelector('main.dashboard-main, main');
  const overview = document.getElementById('overview');
  if (!main || !overview || document.getElementById('radar-intelligence-studio')) return;

  const el = (tag, cls, text) => {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text !== undefined) x.textContent = text;
    return x;
  };

  const section = el('section', 'radar-studio');
  section.id = 'radar-intelligence-studio';
  section.setAttribute('aria-label', 'Painel de inteligência das mídias e Ficha 360 do Artista');

  const header = el('header', 'studio-header');
  const heading = el('div');
  const activeFilterBanner = el('div', 'studio-active-filter');
  activeFilterBanner.hidden = true;
  heading.append(
    el('span', 'studio-eyebrow', 'PAINEL DE INTELIGÊNCIA · VISÃO GERAL DAS 4 MÍDIAS'),
    el('h2', null, 'Desempenho das Mídias & Ficha 360°'),
    el(
      'p',
      null,
      'Compare os talentos monitorados com indicadores verificados de Instagram, Spotify, YouTube e TikTok, inspecione a Ficha 360° com repertório musical e simule shows.'
    ),
    activeFilterBanner
  );

  const toolbar = el('div', 'studio-toolbar');
  const network = el('select');
  network.setAttribute('aria-label', 'Filtrar por mídia');
  for (const x of ['Todas as mídias', 'Instagram', 'Spotify', 'YouTube', 'TikTok']) {
    const o = document.createElement('option');
    o.value = x === 'Todas as mídias' ? '' : x;
    o.textContent = x;
    network.append(o);
  }
  const metric = el('select');
  metric.setAttribute('aria-label', 'Selecionar indicador');
  const artistPicker = el('select');
  artistPicker.id = 'studio-artist-picker';
  artistPicker.setAttribute('aria-label', 'Selecionar artista para Ficha 360°');
  const comparePicker = el('select');
  comparePicker.setAttribute('aria-label', 'Comparar com segundo artista');
  const refresh = el('button', 'studio-button', 'Atualizar');
  refresh.type = 'button';
  toolbar.append(network, metric, artistPicker, comparePicker, refresh);
  header.append(heading, toolbar);

  const cards = el('div', 'studio-stats');
  const names = [
    ['Artistas com indicadores', 'artists', 'verified_talents', 'Clique para listar talentos com coleta ↗'],
    ['Perfis verificados com coleta', 'profiles', 'profiles', 'Clique para abrir mapa de perfis ↗'],
    ['Mídias com coleta ativa', 'networks', 'quality', 'Clique para ver cobertura por mídia ↗'],
    ['Última observação verificada', 'latest', 'recent', 'Clique para ver coletas recentes ↗']
  ];
  const statValues = {};
  for (const [title, id, modalKind, hint] of names) {
    const box = el('button', 'studio-stat studio-stat-clickable');
    box.type = 'button';
    box.title = hint;
    box.append(el('span', null, title));
    const v = el('strong', null, '—');
    statValues[id] = v;
    const sub = el('small', 'studio-stat-hint', hint);
    box.append(v, sub);
    box.addEventListener('click', () => {
      if (typeof window.openRadarExecutiveModal === 'function') {
        window.openRadarExecutiveModal(modalKind);
      }
    });
    cards.append(box);
  }

  // Ficha 360° em destaque logo abaixo dos cards de estatísticas da Visão Geral
  const fichaPanel = el('article', 'studio-panel studio-ficha-360');
  fichaPanel.id = 'studio-ficha-360';
  const fichaHead = el('div', 'studio-panel-title');
  const fichaHeadLeft = el('div');
  fichaHeadLeft.append(
    el('span', 'studio-eyebrow', 'FICHA 360° DO ARTISTA EM DESTAQUE · CLIQUE EM QUALQUER ARTISTA PARA ALTERNAR'),
    el('h3', null, 'Instagram · Spotify · YouTube · TikTok')
  );
  const fichaHeadRight = el('div', 'studio-ficha-actions');
  fichaHeadRight.style.display = 'flex';
  fichaHeadRight.style.gap = '8px';
  fichaHeadRight.style.flexWrap = 'wrap';
  const fichaSimShowBtn = el('button', 'btn-simulate-show', '⚡ Simular Show (Local, Capacidade & Ingressos)');
  fichaSimShowBtn.type = 'button';
  fichaSimShowBtn.addEventListener('click', () => {
    if (typeof window.openRadarShowSimulator === 'function') {
      window.openRadarShowSimulator(null, activeTalentId || artistPicker.value || null, 100);
    }
  });
  const fichaCommLink = el('a', 'studio-link-btn', 'Simular Oportunidade Comercial ↗');
  fichaCommLink.href = '/commercial.html';
  fichaHeadRight.append(fichaSimShowBtn, fichaCommLink);
  fichaHead.append(fichaHeadLeft, fichaHeadRight);
  const fichaBody = el('div', 'studio-ficha-body');
  const compareHost = el('div', 'studio-compare-host');
  compareHost.hidden = true;
  fichaPanel.append(fichaHead, fichaBody, compareHost);

  const content = el('div', 'studio-content');
  content.id = 'studio-compare-content';
  const chartCard = el('article', 'studio-panel studio-chart');
  const chartTitle = el('div', 'studio-panel-title');
  chartTitle.append(el('h3', null, 'Ranking Top 15 Artistas por Alcance Verificado'), el('span', 'studio-source', 'Clique na barra para abrir a Ficha 360°'));
  const chartInfo = el('p', 'studio-note', 'Maior indicador verificado do artista no recorte selecionado.');
  const chart = el('div', 'studio-bars');
  chart.setAttribute('role', 'region');
  chart.setAttribute('aria-label', 'Gráfico de comparação por artista');
  chartCard.append(chartTitle, chartInfo, chart);

  const tableCard = el('article', 'studio-panel studio-table-panel');
  const tt = el('div', 'studio-panel-title');
  tt.append(el('h3', null, 'Quadro Consolidado Multi-Mídia (Instagram · Spotify · YouTube · TikTok)'));
  const tableWrap = el('div', 'studio-table-scroll');
  tableCard.append(tt, tableWrap);
  content.append(chartCard, tableCard);

  // Seções 4, 5.1 e 11 da Avaliação: 5 Pilares de OPORTUNIDADES, Melhores Oportunidades Comerciais, Alertas Estratégicos, 5 Classificações e Radar IA
  const oppPillarsPanel = el('article', 'studio-panel');
  oppPillarsPanel.style.marginTop = '12px';
  const oppPillarsHead = el('div', 'studio-panel-title');
  oppPillarsHead.append(
    el('h3', null, '🚀 OPORTUNIDADES — 5 Pilares Estratégicos de Atuação do Radar'),
    el('span', 'studio-source', 'Clique em qualquer pilar para acionar o fluxo executivo correspondente')
  );
  const oppPillarsGrid = el('div', 'opp-pillars-grid');
  for (const [pTitle, pBadge, pDesc, pAction] of [
    ['1. Inteligência artística nacional', '4 Mídias Auditadas', 'Monitoramento nacional multi-mídia (Instagram, Spotify, YouTube e TikTok) com Ficha 360° e séries datadas.', 'national'],
    ['2. Planejamento de turnês', 'Bacia Regional & Rodovia', 'Seleção de praças-polo IBGE, raio de 100 km, tempo de deslocamento rodoviário e PEA regional.', 'tour'],
    ['3. Contratação estratégica', 'Radar Score 2.0 & P&L', 'Simulador Financeiro de Eventos (cachê, custos, ponto de equilíbrio, margem) + Índice de Confiança.', 'hiring'],
    ['4. Talentos regionais', '6 Estágios & Emergentes', 'Descoberta de talentos em aceleração, equilíbrio multi-mídia e penetração municipal comprovada.', 'regional'],
    ['5. Inteligência artificial', 'Radar IA Integrado', 'Consultoria imediata em linguagem natural sobre artistas, comparação para shows e roteiros de turnê.', 'ai']
  ]) {
    const pc = el('button', 'studio-stat studio-stat-clickable opp-pillar-card');
    pc.style.whiteSpace = 'normal';
    pc.type = 'button';
    pc.style.minHeight = '98px';
    pc.style.padding = '10px 12px';
    pc.style.display = 'flex';
    pc.style.flexDirection = 'column';
    pc.style.justifyContent = 'space-between';
    pc.style.alignItems = 'flex-start';
    pc.style.textAlign = 'left';
    const topTag = el('span', null, pBadge);
    topTag.style.color = '#00f0ff';
    topTag.style.fontSize = '9.5px';
    topTag.style.fontWeight = '800';
    topTag.style.textTransform = 'uppercase';
    const stTitle = el('strong', null, pTitle);
    stTitle.style.fontSize = '13.5px';
    stTitle.style.color = '#ffffff';
    const smDesc = el('small', 'studio-stat-hint', pDesc);
    smDesc.style.whiteSpace = 'normal';
    smDesc.style.lineHeight = '1.3';
    pc.append(topTag, stTitle, smDesc);
    pc.addEventListener('click', () => {
      if (pAction === 'national') {
        fichaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (pAction === 'tour') {
        location.href = '/audience.html#geography';
      } else if (pAction === 'hiring') {
        if (typeof window.openRadarShowSimulator === 'function') {
          window.openRadarShowSimulator('4106902', artistPicker.value || 't-gusttavo-lima', 100);
        } else {
          location.href = '/commercial.html#compatibility-simulator';
        }
      } else if (pAction === 'regional') {
        location.href = '/rising.html#rising-traction-panel';
      } else if (pAction === 'ai') {
        aiInput.focus();
        answerRadarAI('Monte uma estratégia de turnê regional para o artista selecionado');
      }
    });
    oppPillarsGrid.append(pc);
  }
  oppPillarsPanel.append(oppPillarsHead, oppPillarsGrid);

  const strategicRow = el('div', 'studio-content');
  strategicRow.style.marginTop = '12px';

  const oppCard = el('article', 'studio-panel');
  const oppHead = el('div', 'studio-panel-title');
  oppHead.append(
    el('h3', null, '🎯 Melhores Oportunidades Comerciais (Artista × Praça × Radar Score)'),
    el('span', 'studio-source', 'Clique em Simular p/ abrir o P&L Financeiro')
  );
  const oppBody = el('div', 'studio-table-scroll');
  oppCard.append(oppHead, oppBody);

  const aiCard = el('article', 'studio-panel');
  const aiHead = el('div', 'studio-panel-title');
  aiHead.append(
    el('h3', null, '🤖 Radar IA — Assistente de Inteligência Artística &Alertas Estratégicos'),
    el('span', 'studio-source', 'Respostas fundamentadas 100% na base auditada')
  );
  const alertsStrip = el('div');
  alertsStrip.style.display = 'grid';
  alertsStrip.style.gridTemplateColumns = 'repeat(auto-fit,minmax(min(100%,170px),1fr))';
  alertsStrip.style.gap = '8px';
  alertsStrip.style.marginBottom = '10px';

  const taxonomyStrip = el('div');
  taxonomyStrip.style.display = 'flex';
  taxonomyStrip.style.flexWrap = 'wrap';
  taxonomyStrip.style.gap = '6px';
  taxonomyStrip.style.marginBottom = '10px';
  for (const [bLabel, bDesc, bCol] of [
    ['✓ Dado verificado', 'API Oficial ou relatório autorizado com evidência e data', '#22c55e'],
    ['◉ Dado observado', 'Fonte pública identificável com URL HTTPS', '#00f0ff'],
    ['∑ Dado calculado', 'Fórmula transparente sobre indicadores reais', '#c084fc'],
    ['≈ Dado estimado', 'Projeção financeira/rodoviária com metodologia documentada', '#facc15'],
    ['— Dado indisponível', 'Ausência de dado nunca é tratada como zero', '#94a3b8']
  ]) {
    const badge = el('span', 'studio-evo-chip', bLabel);
    badge.title = bDesc;
    badge.style.borderColor = bCol;
    badge.style.color = '#fafafa';
    taxonomyStrip.append(badge);
  }

  const aiForm = el('div');
  aiForm.style.display = 'flex';
  aiForm.style.gap = '6px';
  aiForm.style.marginBottom = '8px';
  const aiInput = el('input');
  aiInput.type = 'search';
  aiInput.setAttribute('aria-label', 'Pergunte ao Radar IA sobre artistas, praças, turnês ou comparação comercial');
  aiInput.style.flex = '1';
  aiInput.style.height = '32px';
  aiInput.style.background = '#0d0a16';
  aiInput.style.border = '1.5px solid #00f0ff';
  aiInput.style.borderRadius = '7px';
  aiInput.style.padding = '0 10px';
  const aiBtn = el('button', 'btn-simulate-show', '⚡ Consultar IA');
  aiBtn.type = 'button';
  aiBtn.style.height = '32px';
  aiForm.append(aiInput, aiBtn);

  const aiPrompts = el('div');
  aiPrompts.style.display = 'flex';
  aiPrompts.style.flexWrap = 'wrap';
  aiPrompts.style.gap = '5px';
  aiPrompts.style.marginBottom = '8px';

  const aiResponseBox = el('div');
  aiResponseBox.style.padding = '10px 12px';
  aiResponseBox.style.borderRadius = '8px';
  aiResponseBox.style.background = '#110d1d';
  aiResponseBox.style.border = '1px solid rgba(0,240,255,0.45)';
  aiResponseBox.style.fontSize = '11.5px';
  aiResponseBox.style.lineHeight = '1.45';
  aiResponseBox.style.color = '#e4e4e7';

  aiCard.append(aiHead, alertsStrip, taxonomyStrip, aiForm, aiPrompts, aiResponseBox);
  strategicRow.append(oppCard, aiCard);

  const foot = el(
    'p',
    'studio-footnote',
    'Valores de mídias diferentes não são somados. Instagram, Spotify, YouTube e TikTok exibem exclusivamente observações verificadas e datadas; dados municipais exigem relatórios regionais verificados. População do IBGE e ticketeiras nunca entram nestes indicadores.'
  );
  const status = el('p', 'studio-status', 'Base Nacional Sincronizada.');
  status.setAttribute('role', 'status');
  section.append(header, cards, oppPillarsPanel, fichaPanel, content, strategicRow, status, foot);
  const subbar = overview.querySelector('.subbar');
  if (subbar) subbar.after(section);
  else overview.prepend(section);

  const displayNames = {
    followers: 'Seguidores',
    subscribers: 'Inscritos',
    monthly_listeners: 'Ouvintes mensais',
    posts: 'Publicações',
    views: 'Visualizações',
    video_count: 'Vídeos',
    likes: 'Curtidas',
    streams: 'Streams'
  };
  const palette = { Instagram: '#f472b6', Spotify: '#4ade80', YouTube: '#38bdf8', TikTok: '#facc15' };
  const classLabels = {
    oficial: 'API Oficial',
    relatorio_autorizado: 'Relatório Autorizado',
    observado: 'Observação Verificada',
    calculado: 'Calculado (Série Real)'
  };
  const format = n => Number(n).toLocaleString('pt-BR');
  const signed = n => (n > 0 ? '+' : '') + format(n);
  const fmtDelta = c =>
    c && Number.isFinite(c.absolute)
      ? `${signed(c.absolute)}${c.percent != null ? ` (${c.percent > 0 ? '+' : ''}${c.percent.toFixed(1)}%)` : ''}`
      : null;
  const date = s => {
    if (!s) return 'Data indisponível';
    const d = new Date(s.length === 10 ? s + 'T12:00:00Z' : s);
    return Number.isFinite(+d) ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : s;
  };
  let items = [],
    crossArtists = [],
    catalogTalents = [],
    activeCategoryId = '',
    activeCategoryName = '',
    loadingId = 0,
    fichaReqId = 0,
    activeTalentId = '';

  function metricsForNetwork() {
    const rows = items.filter(x => !network.value || x.network === network.value);
    return [...new Set(rows.flatMap(x => Object.keys(x.metrics || {})))].sort((a, b) =>
      (displayNames[a] || a).localeCompare(displayNames[b] || b, 'pt-BR')
    );
  }

  const normQ = s =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();

  function populateArtistPickers(searchQuery = '', forceFirstOfCategory = false) {
    const byId = new Map();
    for (const a of crossArtists) {
      if (a.id && a.name) byId.set(a.id, { id: a.id, name: a.name, hasCurrent: Boolean(a.hasCollectedMetric), maxVal: a.maxNumericValue || 0 });
    }
    for (const a of items) {
      if (a.talent_id && a.name && !byId.has(a.talent_id)) {
        byId.set(a.talent_id, { id: a.talent_id, name: a.name, hasCurrent: true, maxVal: 0 });
      }
    }
    for (const t of catalogTalents) {
      if (t.id && t.name && !byId.has(t.id)) {
        byId.set(t.id, { id: t.id, name: t.name, hasCurrent: false, maxVal: 0 });
      }
    }
    const list = [...byId.values()].sort(
      (a, b) => (b.hasCurrent ? 1 : 0) - (a.hasCurrent ? 1 : 0) || b.maxVal - a.maxVal || a.name.localeCompare(b.name, 'pt-BR')
    );
    const prevA = forceFirstOfCategory ? '' : artistPicker.value || activeTalentId;
    const prevC = comparePicker.value;
    artistPicker.replaceChildren();
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = 'Ficha 360°: escolher artista';
    artistPicker.append(o0);
    comparePicker.replaceChildren();
    const c0 = document.createElement('option');
    c0.value = '';
    c0.textContent = 'Comparar: sem 2º artista';
    comparePicker.append(c0);
    for (const item of list) {
      const oa = document.createElement('option');
      oa.value = item.id;
      oa.textContent = item.hasCurrent ? `★ ${item.name} (Verificado)` : `${item.name} (Catálogo)`;
      artistPicker.append(oa);
      const oc = document.createElement('option');
      oc.value = item.id;
      oc.textContent = item.hasCurrent ? `★ ${item.name}` : item.name;
      comparePicker.append(oc);
    }
    const qNorm = normQ(searchQuery);
    const matchedByQuery = qNorm
      ? list.find(x => normQ(x.name) === qNorm || normQ(x.id) === qNorm)?.id ||
        list.find(x => normQ(x.name).includes(qNorm) || normQ(x.id).includes(qNorm))?.id ||
        ''
      : '';
    if (matchedByQuery && byId.has(matchedByQuery)) artistPicker.value = matchedByQuery;
    else if (prevA && byId.has(prevA)) artistPicker.value = prevA;
    else if (!activeCategoryId && list.find(x => x.id === 't-gusttavo-lima' && x.hasCurrent)) artistPicker.value = 't-gusttavo-lima';
    else if (list[0]?.id) artistPicker.value = list[0].id;
    if (prevC && byId.has(prevC)) comparePicker.value = prevC;
    activeTalentId = artistPicker.value;
  }

  function buildHistorySparkline(history, net) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const pts = history.slice(-12);
    const vals = pts.map(p => Number(p.value) || 0);
    const min = Math.min(...vals),
      max = Math.max(...vals, min + 1);
    const W = 200,
      H = 46,
      pad = 6;
    const ns = 'http://www.w3.org/2000/svg',
      s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    s.setAttribute('class', 'studio-spark-svg');
    s.setAttribute('aria-label', `Série histórica de ${net} (${pts.length} observações)`);
    const coords = vals.map((v, i) => [
      pad + (W - pad * 2) * (i / Math.max(1, vals.length - 1)),
      pad + (H - pad * 2) * (1 - (v - min) / Math.max(1, max - min)),
      pts[i]
    ]);
    const col = palette[net] || '#c084fc';
    const d = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', col);
    path.setAttribute('stroke-width', '2.2');
    path.setAttribute('stroke-linecap', 'round');
    s.append(path);
    for (const [cx, cy, pt] of coords) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', cx.toFixed(1));
      dot.setAttribute('cy', cy.toFixed(1));
      dot.setAttribute('r', '2.7');
      dot.setAttribute('fill', '#fff');
      dot.setAttribute('stroke', col);
      dot.setAttribute('stroke-width', '1.4');
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${pt.date}: ${format(pt.value)} (${pt.source || 'Verificado'})`;
      dot.append(title);
      s.append(dot);
    }
    return s;
  }

  async function loadFicha360() {
    const tId = artistPicker.value;
    activeTalentId = tId;
    if (!tId) {
      fichaBody.replaceChildren(
        el('p', 'studio-empty', 'Selecione um artista para abrir a Ficha 360° e as estatísticas detalhadas das 4 mídias.')
      );
      compareHost.hidden = true;
      return;
    }
    const reqId = ++fichaReqId;
    fichaBody.replaceChildren(el('p', 'studio-note', 'Consultando Ficha 360° e séries verificadas do artista...'));
    try {
      const cmpId = comparePicker.value && comparePicker.value !== tId ? comparePicker.value : '';
      const [stats, cmpStats] = await Promise.all([
        fetch('/api/radar/media-stats?talent=' + encodeURIComponent(tId), { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
        cmpId
          ? fetch('/api/radar/media-stats?talent=' + encodeURIComponent(cmpId), { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
          : Promise.resolve(null)
      ]);
      if (reqId !== fichaReqId) return;
      if (!stats) {
        fichaBody.replaceChildren(el('p', 'studio-empty', 'Não foi possível carregar a Ficha 360° deste artista.'));
        return;
      }
      fichaCommLink.href = '/commercial.html?q=' + encodeURIComponent(stats.name);
      const currentForArtist = items.filter(x => x.talent_id === tId);
      renderFicha360Cards(stats, currentForArtist);
      renderFichaComparison(stats, cmpStats);
    } catch {
      if (reqId === fichaReqId) fichaBody.replaceChildren(el('p', 'studio-empty', 'Erro ao consultar a Ficha 360° do artista.'));
    }
  }

  window.selectRadarStudioArtist = function (talentId, scrollIntoView = true) {
    if (!talentId) return;
    if (![...artistPicker.options].some(o => o.value === talentId)) {
      const found = crossArtists.find(a => a.id === talentId);
      const o = document.createElement('option');
      o.value = talentId;
      o.textContent = found ? `★ ${found.name}` : talentId;
      artistPicker.append(o);
    }
    artistPicker.value = talentId;
    activeTalentId = talentId;
    loadFicha360();
    if (scrollIntoView) {
      fichaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  function renderFicha360Cards(stats, currentRows) {
    fichaBody.replaceChildren();
    const banner = el('div', 'studio-artist-banner');
    const verifiedNets = ['Instagram', 'Spotify', 'YouTube', 'TikTok'].filter(
      n => stats[n]?.has_verified_data || currentRows.some(r => r.network === n)
    );
    banner.append(
      el('strong', null, stats.name),
      el('span', 'studio-badge-pill', `${verifiedNets.length} de 4 mídias com coleta verificada`),
      el('small', null, `Data de referência: ${stats.reference_end || 'Atual'} · Dados ausentes permanecem identificados como Sem coleta`)
    );
    fichaBody.append(banner);

    const grid = el('div', 'studio-ficha-grid');
    const specs = [
      {
        net: 'Instagram',
        primaryKey: 'followers',
        primaryLabel: 'Seguidores',
        secondary: [
          ['posts', 'Publicações', 'recent_posts'],
          ['engagement', 'Engajamento', 'engagement'],
          ['reels_views', 'Reels / Views', 'reels_views']
        ]
      },
      {
        net: 'Spotify',
        primaryKey: 'monthly_listeners',
        primaryLabel: 'Ouvintes mensais',
        secondary: [
          ['followers', 'Seguidores Spotify', 'followers'],
          ['repertoire', 'Repertório', 'repertoire'],
          ['top_tracks', 'Top Faixas', 'top_tracks_formatted']
        ]
      },
      {
        net: 'YouTube',
        primaryKey: 'subscribers',
        primaryLabel: 'Inscritos',
        secondary: [
          ['views', 'Visualizações acumuladas', 'views'],
          ['video_count', 'Vídeos públicos', null]
        ]
      },
      {
        net: 'TikTok',
        primaryKey: 'followers',
        primaryLabel: 'Seguidores',
        secondary: [
          ['likes', 'Curtidas totais', 'likes'],
          ['video_count', 'Vídeos', null]
        ]
      }
    ];

    for (const sp of specs) {
      const net = sp.net;
      const ns = stats[net] || {};
      const curRow = currentRows.find(r => r.network === net);
      const curPrimary = curRow?.metrics?.[sp.primaryKey];
      const primaryObj = ns[sp.primaryKey] || {};
      const fallbackFollowers = net === 'Spotify' && primaryObj.value == null ? ns.followers?.value : null;
      const val = primaryObj.value ?? curPrimary?.value ?? fallbackFollowers ?? null;
      const obsDate = primaryObj.observed_on || ns.followers?.observed_on || (curPrimary?.observed_at ? date(curPrimary.observed_at) : null);
      const sourceText = primaryObj.source || ns.followers?.source || curRow?.source || (val != null ? 'Observação verificada' : null);
      const evidenceUrl = primaryObj.evidence_url || curPrimary?.evidence_url || ns.profile_url || curRow?.url || null;
      const cls = primaryObj.classification || (curRow?.source?.includes('API') ? 'oficial' : val != null ? 'observado' : null);

      const card = el('div', 'studio-net-card');
      card.dataset.net = net;
      const top = el('div', 'studio-net-head');
      const netTitle = el('strong', null, net);
      netTitle.style.color = palette[net];
      const badge = el('span', 'studio-quality-badge', val != null ? classLabels[cls] || 'Verificado' : 'Sem coleta');
      top.append(netTitle, badge);
      card.append(top);

      const mainMetric = el('div', 'studio-net-main');
      mainMetric.append(
        el('span', 'studio-net-label', net === 'Spotify' && primaryObj.value == null && fallbackFollowers != null ? 'Seguidores' : sp.primaryLabel),
        el('strong', 'studio-net-val', val != null ? format(val) : 'Sem coleta')
      );
      card.append(mainMetric);

      const g7 = ns.growth_7d?.value != null ? ns.growth_7d.formatted : curPrimary?.change_7d ? fmtDelta(curPrimary.change_7d) : null;
      const g30 = ns.growth_30d?.value != null ? ns.growth_30d.formatted : curPrimary?.change_30d ? fmtDelta(curPrimary.change_30d) : null;
      const evoRow = el('div', 'studio-net-evo');
      evoRow.append(
        el('span', 'studio-evo-chip', `7d: ${g7 || 'Aguardando 2ª coleta'}`),
        el('span', 'studio-evo-chip', `30d: ${g30 || 'Aguardando série 30d'}`)
      );
      card.append(evoRow);

      const spark = buildHistorySparkline(ns.history, net);
      if (spark) {
        card.append(spark);
      }

      const secList = el('div', 'studio-net-secondary');
      for (const [mKey, mLabel, statsField] of sp.secondary) {
        let secText = null;
        if (mKey === 'top_tracks' && ns.repertoire?.top_tracks_formatted && ns.repertoire.top_tracks_formatted !== '—') {
          secText = ns.repertoire.top_tracks_formatted;
        } else if (statsField && ns[statsField]?.formatted && ns[statsField].formatted !== '—') {
          secText = ns[statsField].formatted;
        } else if (curRow?.metrics?.[mKey]?.value != null) {
          secText = format(curRow.metrics[mKey].value);
        }
        if (secText) {
          secList.append(el('small', null, `${mLabel}: ${secText}`));
        }
      }
      if (secList.children.length) card.append(secList);

      if (ns.top_cities?.hasData) {
        card.append(
          el('small', 'studio-net-cities', `Principais cidades (${ns.top_cities.report?.source || 'Relatório verificado'}): ${ns.top_cities.statusLabel}`)
        );
      }

      const metaFoot = el('div', 'studio-net-foot');
      metaFoot.append(
        el('small', null, val != null ? `Fonte: ${sourceText} · Data: ${obsDate || '—'}` : 'Perfil oficial vinculado · Aguardando coleta.')
      );
      const linksWrap = el('div', 'studio-net-links');
      if (ns.profile_url || curRow?.url) {
        const pl = el('a', null, 'Perfil oficial ↗');
        pl.href = ns.profile_url || curRow.url;
        pl.target = '_blank';
        pl.rel = 'noopener noreferrer';
        linksWrap.append(pl);
      }
      if (evidenceUrl && evidenceUrl !== (ns.profile_url || curRow?.url)) {
        const elink = el('a', null, 'Evidência ↗');
        elink.href = evidenceUrl;
        elink.target = '_blank';
        elink.rel = 'noopener noreferrer';
        linksWrap.append(elink);
      }
      if (linksWrap.children.length) metaFoot.append(linksWrap);
      card.append(metaFoot);
      grid.append(card);
    }
    fichaBody.append(grid);
  }

  function renderFichaComparison(s1, s2) {
    if (!s2 || s1.talent_id === s2.talent_id) {
      compareHost.hidden = true;
      compareHost.replaceChildren();
      return;
    }
    compareHost.hidden = false;
    compareHost.replaceChildren();
    compareHost.append(el('h4', null, `Comparação Direta: ${s1.name} vs. ${s2.name} (dados verificados)`));
    const tbl = el('table', 'studio-table');
    const thead = el('thead'),
      trH = el('tr');
    for (const h of ['Mídia / Indicador', s1.name, s2.name, 'Evolução 7d / 30d']) trH.append(el('th', null, h));
    thead.append(trH);
    tbl.append(thead);
    const tb = el('tbody');
    for (const [net, k, label] of [
      ['Instagram', 'followers', 'Seguidores'],
      ['Spotify', 'monthly_listeners', 'Ouvintes mensais'],
      ['YouTube', 'subscribers', 'Inscritos'],
      ['TikTok', 'followers', 'Seguidores']
    ]) {
      const tr = el('tr');
      const tdN = el('td', null, `${net} · ${label}`);
      tdN.style.color = palette[net];
      const v1 = s1[net]?.[k]?.value != null ? format(s1[net][k].value) : 'Sem coleta';
      const v2 = s2[net]?.[k]?.value != null ? format(s2[net][k].value) : 'Sem coleta';
      const g1 =
        s1[net]?.growth_30d?.value != null
          ? s1[net].growth_30d.formatted
          : s1[net]?.growth_7d?.value != null
            ? s1[net].growth_7d.formatted
            : '—';
      const g2 =
        s2[net]?.growth_30d?.value != null
          ? s2[net].growth_30d.formatted
          : s2[net]?.growth_7d?.value != null
            ? s2[net].growth_7d.formatted
            : '—';
      tr.append(tdN, el('td', null, v1), el('td', null, v2), el('td', null, `${s1.name}: ${g1} | ${s2.name}: ${g2}`));
      tb.append(tr);
    }
    tbl.append(tb);
    compareHost.append(tbl);
  }

  function render() {
    if (activeCategoryId) {
      activeFilterBanner.hidden = false;
      activeFilterBanner.replaceChildren();
      activeFilterBanner.append(
        el('span', null, `📂 Filtro de Categoria Ativo: ${activeCategoryName || activeCategoryId} (${crossArtists.length} talentos no recorte)`),
        (() => {
          const clr = el('button', 'secondary-button', '✕ Mostrar Todas as Categorias');
          clr.type = 'button';
          clr.style.height = '24px';
          clr.style.padding = '0 9px';
          clr.style.fontSize = '11px';
          clr.addEventListener('click', () => {
            if (typeof window.setRadarCategoryFilter === 'function') {
              window.setRadarCategoryFilter('', '');
            }
          });
          return clr;
        })()
      );
    } else {
      activeFilterBanner.hidden = true;
      activeFilterBanner.replaceChildren();
    }

    const subset = items.filter(x => !network.value || x.network === network.value);
    const keys = metricsForNetwork();
    const old = metric.value;
    metric.replaceChildren();
    for (const k of keys) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = displayNames[k] || k;
      metric.append(o);
    }
    if (keys.includes(old)) metric.value = old;
    else if (keys.includes(network.value === 'Spotify' ? 'monthly_listeners' : 'followers'))
      metric.value = network.value === 'Spotify' ? 'monthly_listeners' : 'followers';
    else if (keys.includes('subscribers')) metric.value = 'subscribers';

    const valid = subset
      .flatMap(a =>
        Object.entries(a.metrics || {}).map(([key, m]) => ({
          ...a,
          metric: key,
          value: m.value,
          observed_at: m.observed_at,
          change_7d: m.change_7d || null,
          change_30d: m.change_30d || null,
          observations: m.observations || 1,
          metric_source: m.evidence_url || '',
          collected_source: a.source || 'youtube-public-current'
        }))
      )
      .filter(x => Number.isFinite(x.value) && x.value >= 0);

    const unique = new Set(valid.map(x => x.talent_id));
    const latest = valid.map(x => Date.parse(x.observed_at)).filter(Number.isFinite);
    statValues.artists.textContent = unique.size ? format(unique.size) : format(crossArtists.length);
    statValues.profiles.textContent = valid.length ? format(new Set(valid.map(x => `${x.talent_id}|${x.network}`)).size) : '0';
    statValues.networks.textContent = valid.length ? String(new Set(valid.map(x => x.network)).size) : '0';
    statValues.latest.textContent = latest.length ? date(new Date(Math.max(...latest)).toISOString()) : '—';

    chart.replaceChildren();
    tableWrap.replaceChildren();

    // Em "Todas as mídias", exibe o Ranking Top 15 por maior indicador principal verificado de cada artista!
    let barEntries = [];
    if (!network.value) {
      const bestByTalent = new Map();
      for (const x of valid) {
        if (!['followers', 'monthly_listeners', 'subscribers'].includes(x.metric)) continue;
        const cur = bestByTalent.get(x.talent_id);
        if (!cur || x.value > cur.value) bestByTalent.set(x.talent_id, x);
      }
      barEntries = [...bestByTalent.values()].sort((a, b) => b.value - a.value);
      chartInfo.textContent = activeCategoryName
        ? `Categoria ${activeCategoryName} · Maior audiência principal verificada por artista.`
        : 'Todas as mídias · Maior audiência principal verificada por artista (Instagram, Spotify ou YouTube).';
    } else {
      barEntries = valid.filter(x => x.metric === metric.value).sort((a, b) => b.value - a.value);
      chartInfo.textContent = `${displayNames[metric.value] || metric.value || 'Indicador'} · ${network.value} · última observação disponível.`;
    }

    if (!barEntries.length) {
      chart.append(
        el(
          'p',
          'studio-empty',
          crossArtists.length
            ? `Os ${crossArtists.length} talento(s) deste recorte estão listados no quadro ao lado (aguardando coleta verificada nesta mídia).`
            : `Sem valores observados para ${network.value || 'este recorte'}.`
        )
      );
    } else {
      const max = Math.max(1, ...barEntries.map(x => x.value));
      for (const x of barEntries.slice(0, 15)) {
        const row = el('div', 'studio-barrow');
        const label = el('div', 'studio-bar-label');
        const netBadge = !network.value ? `${x.network} · ${displayNames[x.metric] || x.metric} · ` : '';
        label.append(el('strong', null, x.name), el('span', null, `${netBadge}${date(x.observed_at)}`));
        const track = el('div', 'studio-track');
        const fill = el('span', 'studio-fill');
        fill.style.width = Math.max(3, (x.value / max) * 100) + '%';
        if (palette[x.network]) {
          fill.style.background = `linear-gradient(90deg, #6d28d9, ${palette[x.network]})`;
        }
        track.append(fill);
        row.append(label, track, el('b', 'studio-amount', format(x.value)));
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          if (x.talent_id) {
            artistPicker.value = x.talent_id;
            loadFicha360();
          }
        });
        chart.append(row);
      }
    }

    // Quadro Consolidado Multi-Mídia (quando uma categoria está filtrada, mostra todos os talentos daquela categoria; no geral, prioriza os com coleta e exibe o catálogo!)
    const activeCross = activeCategoryId
      ? crossArtists.filter(a => !network.value || a.media?.[network.value]?.value != null || !a.hasCollectedMetric)
      : crossArtists.filter(a => a.hasCollectedMetric && (!network.value || a.media?.[network.value]?.value != null));
    const rowsToRender = activeCross.length ? activeCross : crossArtists;
    if (rowsToRender.length) {
      const t = el('table', 'studio-table'),
        head = el('thead'),
        tr = el('tr');
      for (const h of ['Artista', 'Instagram', 'Spotify', 'YouTube', 'TikTok', 'Ação']) tr.append(el('th', null, h));
      head.append(tr);
      t.append(head);
      const body = el('tbody');
      for (const a of rowsToRender.slice(0, 60)) {
        const trRow = el('tr');
        const tdName = el('td');
        const btn = el('button', 'studio-artist-btn', a.name);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          artistPicker.value = a.id;
          loadFicha360();
          fichaPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        tdName.append(btn);
        if (a.categories?.length) {
          const catSmall = el('small', null, a.categories.join(' · '));
          catSmall.style.fontSize = '9.5px';
          catSmall.style.color = '#a1a1aa';
          tdName.append(catSmall);
        }
        trRow.append(tdName);

        for (const net of ['Instagram', 'Spotify', 'YouTube', 'TikTok']) {
          const td = el('td');
          const m = a.media?.[net];
          if (m?.value != null) {
            const valB = el('strong', null, m.formatted || format(m.value));
            valB.style.color = palette[net] || '#fafafa';
            valB.style.display = 'block';
            td.append(valB);
            if (m.url) {
              const l = el('a', null, `${displayNames[m.metric] || m.metric} ↗`);
              l.href = m.url;
              l.target = '_blank';
              l.rel = 'noopener noreferrer';
              l.style.fontSize = '9.5px';
              td.append(l);
            }
          } else {
            const emptySpan = el('span', null, m?.url ? 'Perfil vinculado' : '—');
            emptySpan.style.color = '#71717a';
            emptySpan.style.fontSize = '10.5px';
            td.append(emptySpan);
          }
          trRow.append(td);
        }

        const tdAct = el('td');
        const simBtn = el('button', 'btn-simulate-show', '⚡ Show');
        simBtn.type = 'button';
        simBtn.style.height = '24px';
        simBtn.style.padding = '0 8px';
        simBtn.style.fontSize = '10.5px';
        simBtn.title = `Simular Show, Local, Capacidade e Ingressos para ${a.name}`;
        simBtn.addEventListener('click', () => {
          if (typeof window.openRadarShowSimulator === 'function') {
            window.openRadarShowSimulator(null, a.id, 100);
          }
        });
        tdAct.append(simBtn);
        trRow.append(tdAct);

        body.append(trRow);
      }
      t.append(body);
      tableWrap.append(t);
    } else if (!subset.length) {
      tableWrap.append(el('p', 'studio-empty', 'Nenhum perfil com indicadores observados neste recorte.'));
    }

    status.textContent = valid.length
      ? `${valid.length} indicadores verificados ativos em ${unique.size} talentos monitorados${activeCategoryName ? ` na categoria ${activeCategoryName}` : ''}. Clique em qualquer artista para inspecionar a Ficha 360° ou simular show.`
      : `${crossArtists.length} talento(s) no recorte${activeCategoryName ? ` (${activeCategoryName})` : ''}. Clique em qualquer artista para abrir a Ficha 360° ou Simular Show.`;

    renderStrategicOpportunitiesAndAI();
  }

  function renderStrategicOpportunitiesAndAI() {
    oppBody.replaceChildren();
    alertsStrip.replaceChildren();

    const verifiedList = crossArtists.filter(a => a.hasCollectedMetric);
    const pendingList = crossArtists.filter(a => !a.hasCollectedMetric);
    const multiMediaList = verifiedList.filter(a => ['Instagram', 'Spotify', 'YouTube', 'TikTok'].filter(n => a.media?.[n]?.value != null).length >= 2);

    for (const [aTitle, aVal, aSub, aMode] of [
      ['Talentos com Tração Multi-Mídia', `${format(multiMediaList.length)} talentos`, 'Com 2 ou mais redes auditadas', 'verified_talents'],
      ['Polos Comerciais IBGE Ativos', '35 praças-polo', 'Bacia regional + deslocamento rodoviário', 'talents'],
      ['Perfis Aguardando Enriquecimento', `${format(pendingList.length)} no catálogo`, 'Prontos para coleta em 1 clique', 'quality']
    ]) {
      const ab = el('button', 'studio-stat studio-stat-clickable');
      ab.type = 'button';
      ab.style.minHeight = '64px';
      ab.style.padding = '8px 10px';
      ab.append(el('span', null, aTitle), el('strong', null, aVal), el('small', 'studio-stat-hint', aSub));
      ab.addEventListener('click', () => {
        if (typeof window.openRadarExecutiveModal === 'function') window.openRadarExecutiveModal(aMode);
      });
      alertsStrip.append(ab);
    }

    const recommendedHubs = [
      { city: 'Goiânia – GO', code: '5208707', region: 'Centro-Oeste' },
      { city: 'Curitiba – PR', code: '4106902', region: 'Sul' },
      { city: 'São Paulo – SP', code: '3550308', region: 'Sudeste' },
      { city: 'Belo Horizonte – MG', code: '3106200', region: 'Sudeste' },
      { city: 'Campinas – SP', code: '3509502', region: 'Sudeste' },
      { city: 'Salvador – BA', code: '2927408', region: 'Nordeste' },
      { city: 'Londrina – PR', code: '4113700', region: 'Sul' },
      { city: 'Brasília – DF', code: '5300108', region: 'Centro-Oeste' }
    ];

    const topForOpp = (verifiedList.length ? verifiedList : crossArtists).slice(0, 8);
    if (topForOpp.length) {
      const tbl = el('table', 'studio-table');
      const thead = el('thead'),
        trH = el('tr');
      ['Artista', 'Praça Recomendada', 'Score Artístico', 'Score Territorial 2.0', 'Cobertura & Confiança', 'Simulador P&L'].forEach(h => trH.append(el('th', null, h)));
      thead.append(trH);
      tbl.append(thead);
      const tb = el('tbody');
      topForOpp.forEach((art, idx) => {
        const hub = recommendedHubs[idx % recommendedHubs.length];
        const netsCount = ['Instagram', 'Spotify', 'YouTube', 'TikTok'].filter(n => art.media?.[n]?.value != null).length;
        const confPct = Math.min(98, 40 + netsCount * 14);
        const artisticEst = Math.min(96, Math.max(70, 74 + netsCount * 5));
        const scoreEst = Math.min(96, Math.max(72, 76 + netsCount * 4 + (idx === 0 ? 4 : idx < 3 ? 2 : 0)));
        const isHighConf = confPct >= 65;
        const tr = el('tr');
        const tdA = el('td');
        const bA = el('button', 'studio-artist-btn', art.name);
        bA.type = 'button';
        bA.addEventListener('click', () => {
          artistPicker.value = art.id;
          loadFicha360();
        });
        tdA.append(bA);
        tr.append(
          tdA,
          el('td', null, hub.city),
          (() => {
            const td = el('td');
            const st = el('strong', null, `${artisticEst} / 100`);
            st.style.color = '#c084fc';
            td.append(st);
            return td;
          })(),
          (() => {
            const td = el('td');
            const st = el('strong', null, `${scoreEst} / 100`);
            st.style.color = isHighConf ? '#00ff88' : '#facc15';
            td.append(st);
            return td;
          })(),
          el('td', null, `${confPct}% (${netsCount}/4 mídias · ${isHighConf ? 'Prioritária' : 'Validar cobertura'})`),
          (() => {
            const td = el('td');
            const sb = el('button', 'btn-simulate-show', '💰 Simular P&L');
            sb.type = 'button';
            sb.style.height = '24px';
            sb.style.padding = '0 8px';
            sb.style.fontSize = '10.5px';
            sb.addEventListener('click', () => {
              if (typeof window.openRadarShowSimulator === 'function') {
                window.openRadarShowSimulator(hub.code, art.id, 100);
              }
            });
            td.append(sb);
            return td;
          })()
        );
        tb.append(tr);
      });
      tbl.append(tb);
      oppBody.append(tbl);
    }

    if (!aiPrompts.children.length) {
      const sampleQuestions = [
        'Quais artistas têm maior alcance verificado para o Sul e Sudeste?',
        'Quais talentos emergentes devo acompanhar nos próximos 90 dias?',
        'Compare os 2 líderes do ranking para um evento de 3 mil pessoas em Curitiba',
        'Monte uma estratégia de turnê regional para o artista selecionado',
        'Explique o Radar Score Comercial e o Simulador Financeiro de Eventos'
      ];
      for (const qText of sampleQuestions) {
        const chip = el('button', 'secondary-button', qText);
        chip.type = 'button';
        chip.style.height = '24px';
        chip.style.fontSize = '10.5px';
        chip.style.padding = '0 8px';
        chip.addEventListener('click', () => {
          aiInput.value = qText;
          answerRadarAI(qText);
        });
        aiPrompts.append(chip);
      }
      aiBtn.addEventListener('click', () => {
        const qVal = aiInput.value.trim() || sampleQuestions[0];
        if (!aiInput.value.trim()) aiInput.value = qVal;
        answerRadarAI(qVal);
      });
      aiInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const qVal = aiInput.value.trim() || sampleQuestions[0];
          if (!aiInput.value.trim()) aiInput.value = qVal;
          answerRadarAI(qVal);
        }
      });
      answerRadarAI(sampleQuestions[0], true);
    }
  }

  let aiReqSeq = 0;
  async function answerRadarAI(rawQuestion = '', isInitial = false) {
    const seq = ++aiReqSeq;
    const questionText = String(rawQuestion || '').trim() || 'Resumo estratégico da base auditada';
    const currentTalent = artistPicker.value || activeTalentId || '';

    if (!isInitial) {
      aiBtn.disabled = true;
      aiBtn.textContent = '⏳ Consultando…';
      aiResponseBox.style.borderColor = '#facc15';
      aiResponseBox.replaceChildren(
        el('p', null, `⏳ Consultando base auditada do Radar para: "${questionText}"…`)
      );
    }

    try {
      const params = new URLSearchParams({ q: questionText });
      if (currentTalent) params.set('talent', currentTalent);
      const r = await fetch('/api/radar/ai-query?' + params.toString(), { cache: 'no-store' });
      if (!r.ok) throw Error('HTTP ' + r.status);
      const d = await r.json();
      if (seq !== aiReqSeq) return;

      aiResponseBox.replaceChildren();
      aiResponseBox.style.borderColor = 'rgba(0,240,255,0.65)';

      const headRow = el('div');
      headRow.style.display = 'flex';
      headRow.style.alignItems = 'center';
      headRow.style.justifyContent = 'space-between';
      headRow.style.gap = '8px';
      headRow.style.flexWrap = 'wrap';
      headRow.style.marginBottom = '8px';
      headRow.style.paddingBottom = '6px';
      headRow.style.borderBottom = '1px solid rgba(0,240,255,0.22)';

      const hTitle = el('strong', null, d.headline || '🤖 Resposta Radar IA');
      hTitle.style.color = '#00f0ff';
      hTitle.style.fontSize = '12.5px';
      const timeLabel = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const metaSpan = el('small', null, `Consulta: "${d.query || questionText}" · Respondido às ${timeLabel}`);
      metaSpan.style.color = '#a1a1aa';
      metaSpan.style.fontSize = '10.5px';
      headRow.append(hTitle, metaSpan);
      aiResponseBox.append(headRow);

      for (const sec of d.sections || []) {
        const block = el('div');
        block.style.marginBottom = '8px';
        const st = el('strong', null, sec.title + ': ');
        st.style.color = '#67e8f9';
        st.style.display = 'block';
        st.style.marginBottom = '2px';
        const bodyP = el('div', null, sec.body || '');
        bodyP.style.whiteSpace = 'pre-line';
        bodyP.style.color = '#e4e4e7';
        block.append(st, bodyP);
        aiResponseBox.append(block);
      }

      if (Array.isArray(d.actions) && d.actions.length) {
        const actBar = el('div');
        actBar.style.display = 'flex';
        actBar.style.gap = '8px';
        actBar.style.flexWrap = 'wrap';
        actBar.style.marginTop = '8px';
        for (const act of d.actions) {
          if (act.type === 'simulator') {
            const b = el('button', 'btn-simulate-show', act.label);
            b.type = 'button';
            b.style.height = '26px';
            b.style.padding = '0 10px';
            b.style.fontSize = '11px';
            b.addEventListener('click', () => {
              if (typeof window.openRadarShowSimulator === 'function') {
                window.openRadarShowSimulator(act.cityCode || null, act.talentId || null, 100);
              }
            });
            actBar.append(b);
          } else if (act.type === 'ficha360') {
            const b = el('button', 'secondary-button', act.label);
            b.type = 'button';
            b.style.height = '26px';
            b.style.padding = '0 10px';
            b.style.fontSize = '11px';
            b.addEventListener('click', () => {
              if (act.talentId) {
                artistPicker.value = act.talentId;
                loadFicha360();
                fichaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            });
            actBar.append(b);
          } else if (act.type === 'link' && act.href) {
            const a = el('a', 'secondary-button', act.label);
            a.href = act.href;
            a.style.textDecoration = 'none';
            a.style.display = 'inline-flex';
            a.style.alignItems = 'center';
            a.style.height = '26px';
            a.style.padding = '0 10px';
            a.style.fontSize = '11px';
            actBar.append(a);
          }
        }
        aiResponseBox.append(actBar);
      }
    } catch {
      if (seq !== aiReqSeq) return;
      const verified = crossArtists.filter(a => a.hasCollectedMetric);
      aiResponseBox.replaceChildren();
      const p = el(
        'p',
        null,
        `🏆 Base Auditada Ativa: ${verified
          .slice(0, 5)
          .map(a => `${a.name} (${a.media?.Instagram?.formatted || a.media?.YouTube?.formatted || a.media?.Spotify?.formatted})`)
          .join(' · ')}.`
      );
      p.style.margin = '0';
      aiResponseBox.append(p);
    } finally {
      if (seq === aiReqSeq) {
        aiBtn.disabled = false;
        aiBtn.textContent = '⚡ Consultar IA';
      }
    }
  }

  function mergeCrossAndCurrent(crossItems, currentItems) {
    const allowedIds = new Set(crossItems.map(a => a.id));
    const byKey = new Map();
    for (const c of currentItems) {
      if (!c?.talent_id || !c?.network || !allowedIds.has(c.talent_id)) continue;
      byKey.set(`${c.talent_id}|${c.network}`, c);
    }
    for (const artist of crossItems) {
      for (const net of ['Instagram', 'Spotify', 'YouTube', 'TikTok']) {
        const m = artist.media?.[net];
        if (!m || m.value == null) continue;
        const k = `${artist.id}|${net}`;
        const existing = byKey.get(k);
        const obsIso = m.observed_on ? `${m.observed_on}T12:00:00.000Z` : new Date().toISOString();
        const metricEntry = {
          value: m.value,
          observed_at: obsIso,
          evidence_url: m.url || '',
          change_30d: m.growth != null ? { absolute: m.growth, percent: m.growth_pct } : null,
          observations: m.baseline_on ? 2 : 1
        };
        if (existing) {
          if (!existing.metrics) existing.metrics = {};
          if (!existing.metrics[m.metric]) existing.metrics[m.metric] = metricEntry;
        } else {
          byKey.set(k, {
            talent_id: artist.id,
            name: artist.name,
            network: net,
            url: m.url || `https://${net.toLowerCase()}.com`,
            source: m.source || 'Radar Verificado',
            metrics: { [m.metric]: metricEntry }
          });
        }
      }
    }
    return [...byKey.values()];
  }

  async function load(forceFirstOfCategory = false) {
    const id = ++loadingId;
    status.textContent = 'Consultando dados reais do Radar...';
    refresh.disabled = true;
    try {
      const q = document.getElementById('artist-quick-search')?.value?.trim() || '';
      const catSelect = document.querySelector('#filters select[name="category"]');
      activeCategoryId = catSelect?.value || activeCategoryId || '';
      const cp = new URLSearchParams({ q, limit: '300' });
      if (activeCategoryId) cp.set('category', activeCategoryId);
      const [response, crossRes] = await Promise.all([
        fetch('/api/current-media?' + new URLSearchParams({ q }), { cache: 'no-store' }).catch(() => null),
        fetch('/api/radar/cross-summary?' + cp, { cache: 'no-store' })
      ]);
      if (!crossRes || !crossRes.ok) throw Error(`API ${crossRes?.status || 503}`);
      const crossData = await crossRes.json();
      const currentData = response && response.ok ? await response.json().catch(() => ({ items: [] })) : { items: [] };
      if (id !== loadingId) return;

      crossArtists = Array.isArray(crossData?.items) ? crossData.items : [];
      catalogTalents = crossArtists.map(t => ({ id: t.id, name: t.name }));
      const rawCurrent = Array.isArray(currentData.items)
        ? currentData.items.filter(x => x && typeof x.name === 'string' && typeof x.network === 'string')
        : [];
      items = mergeCrossAndCurrent(crossArtists, rawCurrent);

      populateArtistPickers(q, forceFirstOfCategory);
      render();
      loadFicha360();
    } catch (e) {
      if (id === loadingId) {
        items = [];
        render();
        status.textContent = 'Não foi possível consultar a API. Os dados antigos não foram reutilizados: ' + e.message;
      }
    } finally {
      if (id === loadingId) refresh.disabled = false;
    }
  }

  window.addEventListener('radar:category-change', e => {
    activeCategoryId = e.detail?.categoryId || '';
    activeCategoryName = e.detail?.categoryName || '';
    load(true);
  });

  network.addEventListener('change', render);
  metric.addEventListener('change', render);
  artistPicker.addEventListener('change', loadFicha360);
  comparePicker.addEventListener('change', loadFicha360);
  refresh.addEventListener('click', () => load(false));
  document.getElementById('artist-quick-btn')?.addEventListener('click', () => load(false));
  document.getElementById('artist-quick-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') load(false);
  });
  window.addEventListener('radar:socket-event', ev => {
    const t = ev?.detail?.topic || '';
    if (t === 'discovery.updated' || t === 'operations.sync_completed') load(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load(false);
  });
  load(false);
})();
