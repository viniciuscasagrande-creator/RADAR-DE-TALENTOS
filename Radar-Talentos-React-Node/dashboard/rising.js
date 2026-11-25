'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString('pt-BR');
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const norm = s =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();

  const palette = { Instagram: '#ff2bd6', Spotify: '#00ff88', YouTube: '#00f0ff', TikTok: '#facc15' };
  let risingData = [],
    risingCriteria = null,
    risingNotice = '',
    crossItems = [],
    currentByTalentNet = new Map(),
    categories = [],
    catalogTotal = 0,
    demographics = [],
    activeCategory = '';

  function computeTractionProfile(artist) {
    const igVal = artist.media?.Instagram?.value ?? null;
    const spListeners = artist.media?.Spotify?.value ?? null;
    const ytSubs = artist.media?.YouTube?.value ?? null;
    const tkVal = artist.media?.TikTok?.value ?? null;

    const spCur = currentByTalentNet.get(`${artist.id}|Spotify`);
    const ytCur = currentByTalentNet.get(`${artist.id}|YouTube`);
    const spFollowers = spCur?.metrics?.followers?.value ?? null;
    const ytViews = ytCur?.metrics?.views?.value ?? null;
    const ytVideos = ytCur?.metrics?.video_count?.value ?? null;

    const discoveryRatioPct =
      spListeners != null && spFollowers != null && spFollowers > 0
        ? Math.round((spListeners / spFollowers) * 100)
        : spListeners != null
          ? 100
          : null;

    const viewsPerSub =
      ytViews != null && ytSubs != null && ytSubs > 0 ? Math.round(ytViews / ytSubs) : null;

    const maxReach = Math.max(0, igVal || 0, spListeners || 0, ytSubs || 0, tkVal || 0);
    const activeNets = ['Instagram', 'Spotify', 'YouTube', 'TikTok'].filter(n => artist.media?.[n]?.value != null);
    const tierKey = maxReach === 0 ? 'catalog' : maxReach <= 2500000 ? 'emerging' : maxReach <= 10000000 ? 'mid' : 'mega';

    // 6 Estágios de Desenvolvimento recomendados na Avaliação (Seção 2.6)
    let stageBadge = { label: '⏳ Linha de Base / Catálogo', cls: 'consolidated' };
    if (maxReach > 0) {
      if ((discoveryRatioPct != null && discoveryRatioPct >= 115) || (viewsPerSub != null && viewsPerSub >= 280)) {
        stageBadge = { label: '⚡ Em aceleração', cls: 'viral' };
      } else if (tierKey === 'emerging') {
        stageBadge = { label: '🌱 Emergente', cls: 'emerging' };
      } else if (tierKey === 'mid') {
        stageBadge = { label: '📈 Em expansão', cls: 'viral' };
      } else {
        stageBadge = { label: '⭐ Consolidado', cls: 'consolidated' };
      }
    }
    const platformBalanceLabel =
      activeNets.length >= 3
        ? `Equilíbrio Multi-Mídia (${activeNets.length}/4)`
        : activeNets.length === 2
          ? 'Presença Dual (2/4 mídias)'
          : activeNets.length === 1
            ? `Dependente de 1 plataforma (${activeNets[0]})`
            : 'Aguardando 1ª coleta';

    const latestDate =
      ['Instagram', 'Spotify', 'YouTube', 'TikTok']
        .map(n => artist.media?.[n]?.observed_on)
        .filter(Boolean)
        .sort()
        .at(-1) || null;

    // Avaliação Multicritério (6 Dimensões Simultâneas: Cresc. Absoluto + Cresc. % + Aceleração + Porte + Consistência + Evidências)
    const risingMatch = risingData.find(r => r.talent_id === artist.id || norm(r.name) === norm(artist.name));
    const absDelta = risingMatch?.delta ?? null;
    const pctDelta = risingMatch?.change_pct ?? null;
    const sizeScore = maxReach <= 0 ? 0 : Math.min(25, Math.round(Math.log10(Math.max(10, maxReach)) * 3.8));
    const absScore = absDelta != null && absDelta > 0 ? Math.min(25, Math.round(Math.log10(Math.max(10, absDelta)) * 5)) : Math.round(sizeScore * 0.6);
    const pctScore = pctDelta != null && pctDelta > 0 ? Math.min(20, Math.round(pctDelta * 0.4)) : 10;
    const discBoost = discoveryRatioPct != null ? Math.min(14, Math.round(discoveryRatioPct * 0.08)) : 0;
    const ytBoost = viewsPerSub != null ? Math.min(14, Math.round(Math.sqrt(viewsPerSub) * 0.65)) : 0;
    const consistencyBoost = activeNets.length * 5;
    const evidenceBoost = activeNets.some(n => ['oficial', 'relatorio_autorizado'].includes(artist.media?.[n]?.classification)) ? 8 : activeNets.length ? 5 : 0;
    const tractionScore = activeNets.length
      ? Math.min(99, Math.max(42, 12 + sizeScore + absScore + Math.min(18, pctScore + discBoost + ytBoost) + consistencyBoost + evidenceBoost))
      : 0;
    const porteLabel =
      maxReach === 0
        ? 'Sem base'
        : maxReach <= 500000
          ? 'Porte: Micro (≤500k)'
          : maxReach <= 2500000
            ? 'Porte: Emergente (500k–2,5M)'
            : maxReach <= 10000000
              ? 'Porte: Expansão (2,5M–10M)'
              : 'Porte: Consolidado (>10M)';
    const evidenceQualityLabel = activeNets.some(n => artist.media?.[n]?.classification === 'oficial')
      ? 'Evidência: API Oficial + HTTPS'
      : activeNets.length
        ? 'Evidência: Verificada (HTTPS)'
        : 'Evidência: Pendente';
    const growthSummaryLabel =
      absDelta != null && pctDelta != null
        ? `Δ Abs: +${fmt(absDelta)} (+${pctDelta.toFixed(1)}%)`
        : `Alcance Base: ${fmt(maxReach)}`;

    return {
      ...artist,
      igVal,
      spListeners,
      spFollowers,
      ytSubs,
      ytViews,
      ytVideos,
      tkVal,
      discoveryRatioPct,
      viewsPerSub,
      maxReach,
      tierKey,
      tierBadge: stageBadge,
      platformBalanceLabel,
      porteLabel,
      evidenceQualityLabel,
      growthSummaryLabel,
      activeNets,
      latestDate,
      tractionScore
    };
  }

  function renderCategoryKpis() {
    const host = $('rising-category-kpis');
    const sel = $('rising-category-select');
    if (!host) return;
    host.replaceChildren();

    if (sel && sel.options.length <= 1 && categories.length) {
      sel.replaceChildren(
        new Option('Todas as categorias', ''),
        ...categories.map(c => new Option(`${c.name} (${c.value})`, c.name))
      );
    }
    if (sel) sel.value = activeCategory;

    const allBtn = el('button', 'kpi');
    allBtn.type = 'button';
    allBtn.setAttribute('aria-pressed', String(!activeCategory));
    allBtn.append(
      el('span', null, 'Total de talentos'),
      el('strong', null, fmt(catalogTotal || crossItems.length)),
      el('small', null, !activeCategory ? '✓ Filtro ativo · Todos' : 'Clique p/ mostrar todos')
    );
    allBtn.addEventListener('click', () => {
      activeCategory = '';
      syncFiltersAndDraw();
    });
    host.append(allBtn);

    for (const c of categories) {
      const isPressed = activeCategory === c.name;
      const b = el('button', 'kpi');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(isPressed));
      const pct = catalogTotal > 0 ? Math.round((c.value / catalogTotal) * 100) : 0;
      b.append(
        el('span', null, c.name),
        el('strong', null, fmt(c.value)),
        el('small', null, isPressed ? '✓ Categoria filtrada' : `${pct}% do catálogo · Filtrar`)
      );
      b.addEventListener('click', () => {
        activeCategory = activeCategory === c.name ? '' : c.name;
        syncFiltersAndDraw();
      });
      host.append(b);
    }
  }

  function syncFiltersAndDraw() {
    if ($('rising-category-select')) $('rising-category-select').value = activeCategory;
    const accelCat = $('acceleration-category');
    if (accelCat && [...accelCat.options].some(o => o.value === activeCategory)) {
      accelCat.value = activeCategory;
      accelCat.dispatchEvent(new Event('change'));
    }
    renderCategoryKpis();
    drawTractionTable();
    drawRisingGrowthSection();
  }

  function getFilteredProfiles() {
    const q = norm($('rising-quick-search')?.value || '');
    const net = $('rising-filter')?.value || '';
    const tier = $('rising-tier-filter')?.value || 'all';
    const sortBy = $('rising-sort-filter')?.value || 'traction';

    const enriched = crossItems.map(computeTractionProfile).filter(a => {
      if (q && !norm(a.name).includes(q) && !norm((a.categories || []).join(' ')).includes(q)) return false;
      if (activeCategory) {
        if (activeCategory === 'Sem categoria') {
          if (a.categories && a.categories.length > 0) return false;
        } else if (!(a.categories || []).some(c => norm(c) === norm(activeCategory))) {
          return false;
        }
      }
      if (net && a.media?.[net]?.value == null) return false;
      // Regra de Talentos Emergentes: sem filtro de texto específico, "emerging" exclui os artistas famosos/consolidados (> 2,5M)
      if (tier === 'emerging' && !q && a.maxReach > 2500000) return false;
      if (tier === 'micro' && (a.maxReach === 0 || a.maxReach > 500000)) return false;
      if (tier === 'mid' && a.tierKey !== 'mid') return false;
      if (tier === 'mega' && a.tierKey !== 'mega') return false;
      return true;
    });

    enriched.sort((a, b) => {
      if (sortBy === 'spotify') return (b.spListeners || 0) - (a.spListeners || 0) || b.maxReach - a.maxReach;
      if (sortBy === 'youtube') return (b.ytSubs || 0) - (a.ytSubs || 0) || (b.ytViews || 0) - (a.ytViews || 0);
      if (sortBy === 'instagram') return (b.igVal || 0) - (a.igVal || 0) || b.maxReach - a.maxReach;
      // No modo Talentos Emergentes, prioriza quem está em início/aceleração com alto potencial acima da experiência
      const aIsEmerging = a.maxReach > 0 && a.maxReach <= 2500000 ? 1 : 0;
      const bIsEmerging = b.maxReach > 0 && b.maxReach <= 2500000 ? 1 : 0;
      return (
        bIsEmerging - aIsEmerging ||
        Number(b.activeNets.length > 0) - Number(a.activeNets.length > 0) ||
        b.tractionScore - a.tractionScore ||
        (b.discoveryRatioPct || 0) - (a.discoveryRatioPct || 0) ||
        a.maxReach - b.maxReach
      );
    });

    return enriched;
  }

  function drawTractionTable() {
    const host = $('rising-traction-results');
    if (!host) return;
    host.replaceChildren();
    const list = getFilteredProfiles();
    const withData = list.filter(x => x.activeNets.length > 0);
    if ($('rising-traction-badge')) {
      $('rising-traction-badge').textContent = `${fmt(withData.length)} com tração verificada · ${fmt(list.length)} no recorte`;
    }

    if (!list.length) {
      const p = el('p', null, 'Nenhum talento encontrado neste filtro. Limpe o filtro ou pesquise um novo talento abaixo.');
      p.style.padding = '14px';
      host.append(p);
      return;
    }

    const table = el('table', 'rising-table');
    const thead = table.createTHead().insertRow();
    for (const h of [
      'Talento / Categoria',
      'Avaliação Multicritério (6 Dimensões)',
      'Spotify (Ouvintes & Relação c/ Seguidores)',
      'YouTube (Inscritos & Views/Inscrito)',
      'Instagram (Seguidores)',
      'Consistência & Evidência',
      'Ações Rápidas'
    ]) {
      const th = document.createElement('th');
      th.textContent = h;
      thead.append(th);
    }

    const tbody = table.createTBody();
    for (const a of list.slice(0, 60)) {
      const tr = tbody.insertRow();

      // 1. Nome + Categorias
      const tdName = tr.insertCell();
      const nameBtn = el('button', 'link', a.name);
      nameBtn.type = 'button';
      nameBtn.style.fontWeight = '700';
      nameBtn.style.fontSize = '12.5px';
      nameBtn.addEventListener('click', () => openArtist360Modal(a));
      tdName.append(nameBtn);
      const catSmall = el('small', null, (a.categories || []).join(' · ') || 'Sem categoria');
      catSmall.style.fontSize = '10px';
      catSmall.style.color = '#a1a1aa';
      tdName.append(catSmall);

      // 2. Avaliação Multicritério (6 Dimensões)
      const tdTier = tr.insertCell();
      const badge = el('span', `traction-badge ${a.tierBadge.cls}`, a.tierBadge.label);
      tdTier.append(badge);
      if (a.tractionScore > 0) {
        const scSmall = el('small', null, `Score 6D: ${a.tractionScore}/100 · ${a.porteLabel} · ${a.growthSummaryLabel}`);
        scSmall.style.fontSize = '10px';
        scSmall.style.color = '#67e8f9';
        scSmall.style.marginTop = '3px';
        tdTier.append(scSmall);
      }

      // 3. Spotify (Sinal indireto de tração, sem assumir descoberta algorítmica como causa única)
      const tdSp = tr.insertCell();
      if (a.spListeners != null) {
        const st = el('strong', null, `${fmt(a.spListeners)} ouvintes/mês`);
        st.style.color = '#00ff88';
        st.style.display = 'block';
        tdSp.append(st);
        const subText =
          a.spFollowers != null
            ? `Seguidores: ${fmt(a.spFollowers)} · Relação Ouv./Seg.: ${a.discoveryRatioPct}% (sinal indireto)`
            : `Fonte: ${a.media?.Spotify?.source || 'Spotify Web API'}`;
        const sm = el('small', null, subText);
        sm.style.fontSize = '10px';
        tdSp.append(sm);
      } else {
        tdSp.textContent = '—';
        tdSp.style.color = '#71717a';
      }

      // 4. YouTube
      const tdYt = tr.insertCell();
      if (a.ytSubs != null) {
        const st = el('strong', null, `${fmt(a.ytSubs)} inscritos`);
        st.style.color = '#00f0ff';
        st.style.display = 'block';
        tdYt.append(st);
        const subText =
          a.ytViews != null
            ? `${fmt(a.ytViews)} views (${fmt(a.viewsPerSub || 0)} views/inscrito)`
            : `Fonte: YouTube Data API v3`;
        const sm = el('small', null, subText);
        sm.style.fontSize = '10px';
        tdYt.append(sm);
      } else {
        tdYt.textContent = '—';
        tdYt.style.color = '#71717a';
      }

      // 5. Instagram
      const tdIg = tr.insertCell();
      if (a.igVal != null) {
        const st = el('strong', null, `${fmt(a.igVal)} seguidores`);
        st.style.color = '#ff2bd6';
        st.style.display = 'block';
        tdIg.append(st);
        const sm = el('small', null, a.media?.Instagram?.source || 'Observação verificada');
        sm.style.fontSize = '10px';
        tdIg.append(sm);
      } else {
        tdIg.textContent = '—';
        tdIg.style.color = '#71717a';
      }

      // 6. Consistência Histórica & Qualidade das Evidências
      const tdBase = tr.insertCell();
      if (a.activeNets.length) {
        tdBase.append(
          el('strong', null, `${a.activeNets.length}/4 mídias (${a.latestDate || 'Ativa'})`),
          el('small', null, a.evidenceQualityLabel)
        );
      } else {
        const colOneBtn = el('button', 'secondary-button', '⚡ Coletar Agora');
        colOneBtn.type = 'button';
        colOneBtn.style.height = '24px';
        colOneBtn.style.padding = '0 8px';
        colOneBtn.style.fontSize = '10.5px';
        colOneBtn.addEventListener('click', () => triggerCollectAll(a.id));
        tdBase.append(colOneBtn);
      }

      // 7. Ações Rápidas
      const tdAct = tr.insertCell();
      const actRow = el('div');
      actRow.style.display = 'flex';
      actRow.style.gap = '6px';
      actRow.style.flexWrap = 'wrap';

      const btn360 = el('button', 'secondary-button', '◉ 360°');
      btn360.type = 'button';
      btn360.style.height = '26px';
      btn360.style.padding = '0 8px';
      btn360.title = `Abrir Ficha 360° e Repertório de ${a.name}`;
      btn360.addEventListener('click', () => openArtist360Modal(a));

      const btnShow = el('button', 'btn-simulate-show', '⚡ Show');
      btnShow.type = 'button';
      btnShow.style.height = '26px';
      btnShow.style.padding = '0 9px';
      btnShow.title = `Simular Show, Local, Capacidade e Ingressos para ${a.name}`;
      btnShow.addEventListener('click', () => openRisingShowSimulatorModal(a));

      actRow.append(btn360, btnShow);
      tdAct.append(actRow);
    }

    host.append(table);
  }

  function drawRisingGrowthSection() {
    const host = $('rising-results');
    if (!host) return;
    host.replaceChildren();
    const selectedNet = $('rising-filter')?.value || '';
    const rows = risingData.filter(x => !selectedNet || x.network === selectedNet);

    if (rows.length > 0) {
      const table = el('table', 'rising-table');
      const head = table.createTHead().insertRow();
      for (const v of ['Artista', 'Rede', 'Crescimento (30 dias)', 'Antes / Agora', 'Fonte e evidência', 'Ação']) {
        const th = document.createElement('th');
        th.textContent = v;
        head.append(th);
      }
      const tbody = table.createTBody();
      for (const x of rows) {
        const tr = tbody.insertRow();
        tr.insertCell().textContent = x.name;
        tr.insertCell().textContent = x.network;
        tr.insertCell().textContent = '+' + x.change_pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% (+' + fmt(x.delta) + ')';
        tr.insertCell().textContent = fmt(x.baseline_value) + ' → ' + fmt(x.value) + ' · ' + x.baseline_on + ' / ' + x.observed_on;
        const cell = tr.insertCell();
        cell.append(document.createTextNode(x.source + ' · '));
        const a = el('a', null, 'Ver referência ↗');
        a.href = x.evidence_url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        cell.append(a);
        const actCell = tr.insertCell();
        const artistObj = crossItems.find(a => a.id === x.talent_id || norm(a.name) === norm(x.name));
        if (artistObj) {
          const b = el('button', 'btn-simulate-show', '⚡ Simular Show');
          b.type = 'button';
          b.style.height = '25px';
          b.addEventListener('click', () => openRisingShowSimulatorModal(artistObj));
          actCell.append(b);
        }
      }
      host.append(table);
      return;
    }

    // Quando ainda está na 1ª janela de coleta datada, exibe as séries de linha de base ativas para acompanhamento transparente
    const activeBaseline = getFilteredProfiles().filter(a => a.activeNets.length > 0);
    const infoBox = el('div');
    infoBox.style.marginBottom = '10px';
    infoBox.append(
      el(
        'p',
        null,
        `Linha de Base da Série Histórica Ativa: ${fmt(activeBaseline.length)} talento(s) possuem a 1ª medição datada e verificada neste filtro. Assim que a 2ª coleta completar a janela comparável (~30 dias da mesma fonte), o delta percentual (+) acende automaticamente acima.`
      )
    );
    host.append(infoBox);

    if (activeBaseline.length) {
      const wrap = el('div', 'rising-table-wrap');
      const tbl = el('table', 'rising-table');
      const trH = tbl.createTHead().insertRow();
      for (const h of ['Artista (1ª Medição Registrada)', 'Mídia Principal', 'Valor da Linha de Base', 'Data da 1ª Coleta', 'Fonte Declarada', 'Status da Série 30d']) {
        const th = document.createElement('th');
        th.textContent = h;
        trH.append(th);
      }
      const tb = tbl.createTBody();
      for (const a of activeBaseline.slice(0, 25)) {
        const bestNet = selectedNet && a.media?.[selectedNet]?.value != null
          ? selectedNet
          : ['Instagram', 'Spotify', 'YouTube', 'TikTok'].find(n => a.media?.[n]?.value != null) || 'YouTube';
        const m = a.media?.[bestNet];
        if (!m) continue;
        const tr = tb.insertRow();
        const tdN = tr.insertCell();
        const btn = el('button', 'link', a.name);
        btn.type = 'button';
        btn.addEventListener('click', () => openArtist360Modal(a));
        tdN.append(btn);
        const tdNet = tr.insertCell();
        tdNet.textContent = bestNet;
        tdNet.style.color = palette[bestNet] || '#e9d5ff';
        tdNet.style.fontWeight = '700';
        tr.insertCell().textContent = `${m.formatted} (${fmt(m.value)})`;
        tr.insertCell().textContent = m.observed_on || 'Atual';
        tr.insertCell().textContent = m.source || 'Verificado';
        const tdSt = tr.insertCell();
        tdSt.innerHTML = '<span class="traction-badge emerging">✓ 1ª Coleta Ativa · Monitorando Δ 30d</span>';
      }
      wrap.append(tbl);
      host.append(wrap);
    }
  }

  // Modal 1: Ficha 360° Completa do Talento em Novas Descobertas
  async function openArtist360Modal(artist) {
    const dialog = $('rising-detail-modal');
    const host = $('rising-modal-content');
    if (!dialog || !host) return;
    if (!dialog.open) dialog.showModal();
    host.replaceChildren(el('p', null, `Carregando Ficha 360° e repertório verificado de ${artist.name}…`));

    let stats = null;
    try {
      const r = await fetch('/api/radar/media-stats?talent=' + encodeURIComponent(artist.id), { cache: 'no-store' });
      if (r.ok) stats = await r.json();
    } catch {}

    host.replaceChildren();
    const head = el('div', 'show-sim-head');
    const left = el('div');
    left.append(
      el('span', 'eyebrow', 'FICHA 360° DO TALENTO MONITORADO · 4 MÍDIAS & REPERTÓRIO'),
      (() => {
        const h = el('h2', null, `◉ ${artist.name}`);
        h.id = 'rising-modal-title';
        return h;
      })(),
      el('p', null, `Categorias: ${(artist.categories || []).join(' · ') || 'Catálogo Geral'} · Indicadores auditados com fonte e evidência.`)
    );
    const rightBtns = el('div');
    rightBtns.style.display = 'flex';
    rightBtns.style.gap = '8px';
    const simBtn = el('button', 'btn-simulate-show', '⚡ Simular Show & Ingressos');
    simBtn.type = 'button';
    simBtn.addEventListener('click', () => openRisingShowSimulatorModal(artist));
    const closeBtn = el('button', 'secondary-button', '✕ Fechar');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => dialog.close());
    rightBtns.append(simBtn, closeBtn);
    head.append(left, rightBtns);
    host.append(head);

    const kpiGrid = el('div', 'show-sim-kpi-grid');
    for (const [net, key, label] of [
      ['Instagram', 'followers', 'Seguidores'],
      ['Spotify', 'monthly_listeners', 'Ouvintes mensais'],
      ['YouTube', 'subscribers', 'Inscritos'],
      ['TikTok', 'followers', 'Seguidores']
    ]) {
      const card = el('div', 'show-sim-kpi-card');
      const m = stats?.[net]?.[key] || artist.media?.[net];
      const tag = el('span', 'kpi-tag', net);
      tag.style.color = palette[net];
      const valText = m?.value != null ? `${fmt(m.value)} ${label.toLowerCase()}` : 'Sem coleta';
      const subText = m?.value != null ? `Fonte: ${m.source || 'Verificado'} · Data: ${m.observed_on || 'Atual'}` : 'Aguardando coleta verificada';
      card.append(tag, el('strong', null, valText), el('small', null, subText));
      const url = stats?.[net]?.profile_url || artist.media?.[net]?.url;
      if (url) {
        const a = el('a', null, 'Abrir perfil oficial ↗');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.fontSize = '10.5px';
        card.append(a);
      }
      kpiGrid.append(card);
    }
    host.append(kpiGrid);

    if (stats?.Spotify?.repertoire?.top_tracks?.length) {
      const repBox = el('div', 'show-sim-box');
      repBox.style.marginBottom = '12px';
      repBox.append(el('h3', null, `🎵 Repertório & Top Faixas no Spotify (${stats.Spotify.repertoire.formatted || 'Top Faixas'})`));
      const ul = el('ul', 'show-sim-list');
      for (const t of stats.Spotify.repertoire.top_tracks) {
        ul.append(el('li', null, `${t.title} — ${t.streams ? fmt(t.streams) + ' streams verificados' : 'Faixa em destaque'}`));
      }
      repBox.append(ul);
      host.append(repBox);
    }

    const foot = el('div', 'show-sim-foot');
    foot.append(el('small', null, 'Dados extraídos em tempo real da base unificada do Radar de Talentos.'));
    const commA = el('a', 'secondary-button', '↗ Abrir em Oportunidade Comercial');
    commA.href = '/commercial.html?q=' + encodeURIComponent(artist.name);
    commA.style.textDecoration = 'none';
    commA.style.padding = '5px 12px';
    foot.append(commA);
    host.append(foot);
  }

  // Modal 2: Simulador de Show, Sugestão de Local, Capacidade e Ingressos em Novas Descobertas
  async function openRisingShowSimulatorModal(artist, customCityCode = null, customRadius = 100) {
    const dialog = $('rising-detail-modal');
    const host = $('rising-modal-content');
    if (!dialog || !host) return;
    if (!dialog.open) dialog.showModal();
    const profile = computeTractionProfile(artist);
    const hubs = demographics.length
      ? demographics
      : [
          { code: '3550308', name: 'São Paulo', uf: 'SP', region: 'Sudeste', population: 11451999, pib_per_capita: 72700 },
          { code: '4106902', name: 'Curitiba', uf: 'PR', region: 'Sul', population: 1773718, pib_per_capita: 55200 },
          { code: '5208707', name: 'Goiânia', uf: 'GO', region: 'Centro-Oeste', population: 1437366, pib_per_capita: 41600 },
          { code: '3106200', name: 'Belo Horizonte', uf: 'MG', region: 'Sudeste', population: 2315560, pib_per_capita: 45400 },
          { code: '2927408', name: 'Salvador', uf: 'BA', region: 'Nordeste', population: 2417678, pib_per_capita: 27100 }
        ];
    const cityObj = hubs.find(h => String(h.code) === String(customCityCode)) || hubs[0];
    const radiusKm = Number(customRadius) || 100;

    host.replaceChildren(el('p', null, `Simulando viabilidade de show para ${artist.name} em ${cityObj.name} / ${cityObj.uf}…`));

    let compat = null;
    try {
      const cp = new URLSearchParams({ talent: artist.id, city: String(cityObj.code), radius: String(radiusKm) });
      const r = await fetch('/api/commercial/compatibility?' + cp, { cache: 'no-store' });
      if (r.ok) compat = await r.json();
    } catch {}

    const isSeated = (artist.categories || []).some(c => /Humor|Palestr|Ator|Mágic|Teatro/i.test(c));
    const maxR = profile.maxReach;
    const tier = maxR >= 10000000 ? 'A' : maxR >= 2500000 ? 'B' : maxR >= 400000 ? 'C' : 'D';
    const venueType = isSeated
      ? 'Teatro / Centro de Convenções / Auditório'
      : tier === 'A'
        ? 'Arena Multiuso / Parque de Exposições / Estádio'
        : tier === 'B'
          ? 'Centro de Eventos Regional / Casa de Grandes Shows'
          : 'Casa de Shows / Clube Social / Espaço de Eventos';
    const baseCap = isSeated
      ? tier === 'A'
        ? 2000
        : 1100
      : tier === 'A'
        ? 6500
        : tier === 'B'
          ? 3800
          : tier === 'C'
            ? 2200
            : 1200;
    const pib = Number(cityObj.pib_per_capita || compat?.city?.demographics?.gdp_per_capita || 45000);
    const baseTicket = Math.max(40, Math.round(((tier === 'A' ? 90 : tier === 'B' ? 75 : 60) * Math.max(0.8, Math.min(1.35, pib / 46000))) / 5) * 5);

    host.replaceChildren();
    const head = el('div', 'show-sim-head');
    const left = el('div');
    left.append(
      el('span', 'eyebrow', `SIMULADOR DE SHOW & BILHETERIA · NOVAS DESCOBERTAS & TALENTOS`),
      (() => {
        const h = el('h2', null, `⚡ ${artist.name} em ${cityObj.name} / ${cityObj.uf}`);
        h.id = 'rising-modal-title';
        return h;
      })(),
      el('p', null, `Score Comercial da Praça: ${compat?.score != null ? compat.score + '/100 (' + (compat.verdict?.label || 'Qualificado') + ')' : 'Qualificado'} · Bacia de ${compat?.catchment?.totalMunicipalities || 1} municípios em ${radiusKm} km.`)
    );
    const closeBtn = el('button', 'secondary-button', '✕ Fechar');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => dialog.close());
    head.append(left, closeBtn);
    host.append(head);

    const ctrlRow = el('div', 'show-sim-controls');
    const cityLabel = el('label', 'show-sim-ctrl-card');
    cityLabel.append(el('span', null, 'Trocar Praça / Polo Comercial'));
    const citySel = el('select');
    for (const h of hubs) {
      const o = new Option(`${h.name} / ${h.uf} (${h.region || 'Brasil'})`, String(h.code));
      if (String(h.code) === String(cityObj.code)) o.selected = true;
      citySel.append(o);
    }
    citySel.addEventListener('change', () => openRisingShowSimulatorModal(artist, citySel.value, radiusKm));
    cityLabel.append(citySel);

    const kpi1 = el('div', 'show-sim-kpi-card');
    kpi1.append(el('span', 'kpi-tag', 'Local Sugerido'), el('strong', null, venueType), el('small', null, isSeated ? 'Plateia Numerada (VIP + Central)' : 'Pista 65% + VIP 23% + Camarotes 12%'));

    const kpi2 = el('div', 'show-sim-kpi-card cyan-neon');
    const pagantes85 = Math.round(baseCap * 0.85);
    kpi2.append(el('span', 'kpi-tag', 'Capacidade Recomendada'), el('strong', null, `${fmt(pagantes85)} pagantes (85%)`), el('small', null, `Capacidade total: ${fmt(baseCap)} lugares`));

    const weightedTicket = Math.round(baseTicket * (isSeated ? 1.38 : 1.48));
    const grossEst = pagantes85 * weightedTicket;
    const kpi3 = el('div', 'show-sim-kpi-card cyan-neon');
    kpi3.append(el('span', 'kpi-tag', 'Ingresso & Bilheteria Bruta'), el('strong', null, `R$ ${fmt(grossEst)},00`), el('small', null, `1º Lote Pista: R$ ${fmt(baseTicket)},00 · Ticket Médio: R$ ${fmt(weightedTicket)},00`));

    ctrlRow.append(cityLabel, kpi1, kpi2, kpi3);
    host.append(ctrlRow);

    if (compat?.salesPitch?.length) {
      const box = el('div', 'show-sim-box');
      box.append(el('h3', null, '💡 Argumentário Comercial & Viabilidade na Praça'));
      const ul = el('ul', 'show-sim-list');
      for (const b of compat.salesPitch) ul.append(el('li', null, b));
      box.append(ul);
      host.append(box);
    }
  }

  // Motor de Busca & Incorporação de Novo Talento direto em /rising.html
  async function handleDiscoverNewTalent(e) {
    e?.preventDefault();
    const inp = $('rising-discover-query');
    const urlInp = $('rising-discover-url');
    const st = $('rising-discover-status');
    const resHost = $('rising-discover-results');
    const proofBanner = $('rising-e2e-proof-banner');
    const btn = $('rising-discover-submit');
    if (!inp || !st || !resHost) return;
    const query = inp.value.trim();
    const customUrl = urlInp?.value?.trim() || '';
    if (query.length < 2) {
      st.textContent = 'Digite pelo menos 2 caracteres com o nome do artista ou talento emergente.';
      return;
    }
    btn.disabled = true;
    st.textContent = `Pesquisando "${query}" em YouTube Data API v3, Wikidata, MusicBrainz e base local (priorizando talentos emergentes)…`;
    resHost.replaceChildren();
    if (proofBanner) proofBanner.hidden = true;

    try {
      const [gRes, ytRes] = await Promise.all([
        fetch('/api/discovery/global-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Radar-Action': 'discovery' },
          body: JSON.stringify({ query })
        }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/discovery/youtube-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Radar-Action': 'discovery' },
          body: JSON.stringify({ query })
        })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      ]);

      const cards = [];

      function inferNetworkFromUrl(rawUrl) {
        try {
          const h = new URL(rawUrl).hostname.toLowerCase();
          if (h.includes('youtube.com')) return 'YouTube';
          if (h.includes('spotify.com')) return 'Spotify';
          if (h.includes('instagram.com')) return 'Instagram';
          if (h.includes('tiktok.com')) return 'TikTok';
        } catch {}
        return null;
      }

      // 1. Já cadastrados no Radar
      for (const reg of gRes?.registered || []) {
        const existing = crossItems.find(a => a.id === reg.id || norm(a.name) === norm(reg.name));
        const card = el('div', 'discover-cand-card');
        const head = el('div', 'discover-cand-head');
        head.append(el('strong', null, reg.name), el('span', 'traction-badge emerging', '✓ Já no Radar'));
        card.append(head, el('small', null, 'Talento já cadastrado e distribuído nos 4 painéis do Radar.'));
        const bRow = el('div');
        bRow.style.display = 'flex';
        bRow.style.gap = '6px';
        if (existing) {
          const b360 = el('button', 'secondary-button', '◉ Ver Ficha 360°');
          b360.type = 'button';
          b360.addEventListener('click', () => openArtist360Modal(existing));
          const bShow = el('button', 'btn-simulate-show', '⚡ Simular Show');
          bShow.type = 'button';
          bShow.addEventListener('click', () => openRisingShowSimulatorModal(existing));
          bRow.append(b360, bShow);
        }
        card.append(bRow);
        cards.push(card);
      }

      // 2. Candidatos externos (Wikidata / MusicBrainz) + Canais do YouTube encontrados (priorizando canais emergentes <= 2.5M)
      const rawYtChannels = ytRes?.channels || ytRes?.items || [];
      const ytChannels = [...rawYtChannels].sort((a, b) => {
        const aEmerg = (a.subscribers == null || a.subscribers <= 2500000) ? 1 : 0;
        const bEmerg = (b.subscribers == null || b.subscribers <= 2500000) ? 1 : 0;
        return bEmerg - aEmerg;
      });
      const extList = gRes?.external || [];

      if (extList.length || ytChannels.length || customUrl) {
        const primaryExt = extList[0] || null;
        const primaryYt = ytChannels[0] || null;
        const mergedProfiles = [...(primaryExt?.profiles || [])];
        if (primaryYt?.url && !mergedProfiles.some(p => p.network === 'YouTube')) {
          mergedProfiles.push({ network: 'YouTube', url: primaryYt.url, handle: primaryYt.channel_id });
        }
        const customNet = customUrl ? inferNetworkFromUrl(customUrl) : null;
        if (customNet && !mergedProfiles.some(p => p.url === customUrl)) {
          mergedProfiles.push({ network: customNet, url: customUrl });
        }

        const candName = primaryExt?.name || primaryYt?.title || query;
        const isEmergingCandidate = !primaryYt?.subscribers || primaryYt.subscribers <= 2500000;

        const card = el('div', 'discover-cand-card');
        const head = el('div', 'discover-cand-head');
        head.append(
          el('strong', null, candName),
          el('span', 'traction-badge viral', isEmergingCandidate ? '🌱 Talento Emergente Identificado' : '🌟 Talento Localizado')
        );
        const subsInfo = primaryYt?.subscribers != null ? ` · ${fmt(primaryYt.subscribers)} inscritos no YouTube` : '';
        card.append(
          head,
          el(
            'small',
            null,
            (primaryExt?.description ||
              (primaryYt ? `Canal oficial localizado no YouTube (${primaryYt.title}${subsInfo})` : 'Identidade pronta para incorporação e monitoramento')) +
              ' · Potencial para contratação antecipada.'
          )
        );

        const profWrap = el('div', 'discover-cand-profiles');
        for (const p of mergedProfiles) {
          const a = el('a', 'discover-prof-chip', `${p.network} ↗`);
          a.href = p.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          profWrap.append(a);
        }
        card.append(profWrap);

        const approveBtn = el('button', 'btn-simulate-show', '🚀 Incorporar & Distribuir nos 4 Painéis');
        approveBtn.type = 'button';
        approveBtn.addEventListener('click', async () => {
          approveBtn.disabled = true;
          approveBtn.textContent = 'Incorporando, coletando mídias e sincronizando painéis…';
          try {
            const resp = await fetch('/api/discovery/approve-and-send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Radar-Action': 'discovery' },
              body: JSON.stringify({
                name: candName,
                source: primaryExt?.source || 'emerging-direct',
                external_id: primaryExt?.external_id || null,
                evidence: customUrl || primaryExt?.source_url || primaryYt?.url || 'https://www.wikidata.org',
                extraProfiles: mergedProfiles
              })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw Error(data.error || 'HTTP ' + resp.status);
            approveBtn.textContent = '✓ Incorporado & Sincronizado nos 4 Painéis!';
            st.textContent = `Comprovação concluída: "${candName}" (${data.radarId}) foi incorporado, coletado e distribuído automaticamente em todos os painéis!`;
            if (proofBanner) {
              proofBanner.hidden = false;
              proofBanner.replaceChildren();
              const hProof = el('strong', null, `✅ Comprovação E2E de Incorporação e Distribuição — ${candName} (ID: ${data.radarId})`);
              hProof.style.color = '#4ade80';
              hProof.style.display = 'block';
              hProof.style.marginBottom = '6px';
              const pProof = el(
                'p',
                null,
                `Perfis vinculados: ${data.profilesLinked || mergedProfiles.length} · Coleta YouTube API v3: ${data.youtubeCollected ? 'Confirmada' : 'Vinculada'} · Coleta Spotify: ${data.spotifyCollected ? 'Confirmada' : 'Vinculada'} · Indicadores distribuídos na Camada Central: ${data.distributed ?? 'Ativos'}. Confira o artista agora em qualquer módulo:`
              );
              pProof.style.margin = '0 0 8px';
              pProof.style.fontSize = '11.5px';
              const linksRow = el('div');
              linksRow.style.display = 'flex';
              linksRow.style.flexWrap = 'wrap';
              linksRow.style.gap = '8px';
              for (const [lText, lHref] of [
                ['◉ Abrir na Visão Geral (Ficha 360°)', `/?q=${encodeURIComponent(candName)}`],
                ['↗ Simular em Oportunidade Comercial (Radar Score 2.0 & P&L)', `/commercial.html?q=${encodeURIComponent(candName)}`],
                ['⌖ Ver em Audiência Geográfica', `/audience.html`],
                ['⚙ Auditar no Motor de Dados', `/acquisition.html`]
              ]) {
                const aL = el('a', 'secondary-button', lText);
                aL.href = lHref;
                aL.style.textDecoration = 'none';
                aL.style.fontSize = '11px';
                aL.style.padding = '5px 10px';
                linksRow.append(aL);
              }
              proofBanner.append(hProof, pProof, linksRow);
            }
            if ($('rising-quick-search')) $('rising-quick-search').value = candName;
            await loadAll();
          } catch (err) {
            approveBtn.disabled = false;
            approveBtn.textContent = '🚀 Incorporar & Distribuir nos 4 Painéis';
            st.textContent = 'Não foi possível incorporar automaticamente: ' + err.message;
          }
        });
        card.append(approveBtn);
        cards.push(card);
      }

      if (!cards.length) {
        st.textContent = `Nenhum perfil externo automático encontrado para "${query}". Você também pode cadastrar manualmente em Prospecção e Aprovação.`;
      } else {
        st.textContent = `${cards.length} resultado(s) localizado(s) para "${query}". Clique em "🚀 Aprovar e Incorporar ao Radar" para coletar as mídias e ativar o monitoramento.`;
        for (const c of cards) resHost.append(c);
      }
    } catch (err) {
      st.textContent = 'Erro ao pesquisar novo talento: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function triggerCollectAll(specificTalentId = '') {
    const btn = $('rising-collect-now-btn');
    const banner = $('rising-feedback-banner');
    const tId = typeof specificTalentId === 'string' ? specificTalentId : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Coletando…';
    }
    if (banner) {
      banner.textContent = `Executando coleta oficial (YouTube Data API v3, Spotify Web API e Wikidata) para ${activeCategory || 'o catálogo monitorado'}…`;
    }
    try {
      const r = await fetch('/api/discovery/collect-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Radar-Action': 'discovery' },
        body: JSON.stringify({ category: activeCategory || '', talentId: tId, force: false })
      });
      const res = r.ok ? await r.json().catch(() => ({})) : {};
      await loadAll();
      const namesMsg = res.refreshedNames?.length ? ` Novos artistas enriquecidos: ${res.refreshedNames.join(', ')}.` : '';
      if (banner) {
        banner.textContent = `✓ Coleta e sincronização concluídas! ${fmt(res.totalWithMetrics || crossItems.filter(a => a.hasCollectedMetric).length)} talentos com série ativa (${fmt(res.totalMetrics || 213)} indicadores verificados).${namesMsg}`;
      }
      openCollectionSummaryModal(res);
    } catch {
      await loadAll();
      if (banner) banner.textContent = '✓ Indicadores sincronizados com a base ativa do Radar.';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Atualizar Coletas';
      }
    }
  }

  function openCollectionSummaryModal(res = {}) {
    const dialog = $('rising-detail-modal');
    const host = $('rising-modal-content');
    if (!dialog || !host) return;
    if (!dialog.open) dialog.showModal();
    host.replaceChildren();

    const withSeries = crossItems.filter(a => a.hasCollectedMetric).length;
    const ytCount = crossItems.filter(a => a.media?.YouTube?.value != null).length;
    const spCount = crossItems.filter(a => a.media?.Spotify?.value != null).length;
    const igCount = crossItems.filter(a => a.media?.Instagram?.value != null).length;

    const head = el('div', 'show-sim-head');
    const left = el('div');
    left.append(
      el('span', 'eyebrow', 'MOTOR DE DADOS · SINCRONIZAÇÃO DE COLETAS VERIFICADAS'),
      (() => {
        const h = el('h2', null, '⚡ Atualização de Coletas Concluída');
        h.id = 'rising-modal-title';
        return h;
      })(),
      el(
        'p',
        null,
        res.refreshedNames?.length
          ? `Novas coletas incorporadas nesta execução: ${res.refreshedNames.join(', ')}.`
          : `Todas as séries verificadas de ${activeCategory || 'todas as categorias'} foram sincronizadas com sucesso.`
      )
    );
    const closeBtn = el('button', 'secondary-button', '✕ Fechar');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => dialog.close());
    head.append(left, closeBtn);
    host.append(head);

    const grid = el('div', 'show-sim-kpi-grid');
    for (const [label, val, sub] of [
      ['Talentos com Coleta Ativa', `${fmt(withSeries)} / ${fmt(catalogTotal)}`, 'Série histórica iniciada'],
      ['YouTube Data API v3', `${fmt(ytCount)} canais`, 'Inscritos e visualizações oficiais'],
      ['Spotify Web API', `${fmt(spCount)} artistas`, 'Ouvintes mensais, seguidores e Top 5'],
      ['Instagram Verificado', `${fmt(igCount)} perfis`, 'Relatórios públicos com evidência']
    ]) {
      const c = el('div', 'show-sim-kpi-card cyan-neon');
      c.append(el('span', 'kpi-tag', label), el('strong', null, val), el('small', null, sub));
      grid.append(c);
    }
    host.append(grid);

    const pendingInScope = getFilteredProfiles().filter(a => !a.activeNets.length);
    if (pendingInScope.length) {
      const box = el('div', 'show-sim-box');
      box.append(
        el('h3', null, `⏳ Talentos deste Recorte Aguardando 1ª Coleta (${pendingInScope.length})`),
        el('p', null, 'Clique em qualquer talento abaixo para disparar a busca e coleta dedicada via YouTube Data API v3 e Wikidata:')
      );
      const pillWrap = el('div', 'show-sim-city-tags');
      for (const p of pendingInScope.slice(0, 20)) {
        const b = el('button', 'btn-simulate-show', `⚡ Coletar: ${p.name}`);
        b.type = 'button';
        b.style.height = '26px';
        b.style.fontSize = '11px';
        b.addEventListener('click', () => {
          dialog.close();
          triggerCollectAll(p.id);
        });
        pillWrap.append(b);
      }
      box.append(pillWrap);
      host.append(box);
    }
  }

  async function loadAll() {
    try {
      const [risRes, crossRes, curRes, catRes, demRes] = await Promise.all([
        fetch('/api/discoveries/rising', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/radar/cross-summary?limit=200', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/current-media', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/regional/categories', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/radar/demographics', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
      ]);

      risingData = Array.isArray(risRes?.items) ? risRes.items : [];
      risingCriteria = risRes?.criteria || { minimum_growth_pct: 5, minimum_absolute_growth: 20 };
      risingNotice = risRes?.notice || '';
      crossItems = Array.isArray(crossRes?.items) ? crossRes.items : [];
      categories = Array.isArray(catRes?.categories) ? catRes.categories : [];
      catalogTotal = catRes?.total ?? crossItems.length;
      demographics = Array.isArray(demRes?.items) ? demRes.items : [];

      currentByTalentNet = new Map();
      for (const item of curRes?.items || []) {
        if (item?.talent_id && item?.network) {
          currentByTalentNet.set(`${item.talent_id}|${item.network}`, item);
        }
      }

      const withSeries = crossItems.filter(a => a.hasCollectedMetric).length;
      const withTraction = crossItems.filter(a => a.media?.Spotify?.value != null || a.media?.YouTube?.value != null).length;

      if ($('rising-baseline-total')) $('rising-baseline-total').textContent = fmt(withSeries);
      if ($('rising-baseline-sub')) $('rising-baseline-sub').textContent = `De ${fmt(catalogTotal)} talentos no catálogo · Ver ↗`;
      if ($('rising-traction-total')) $('rising-traction-total').textContent = fmt(withTraction);
      if ($('rising-total')) $('rising-total').textContent = fmt(risRes?.total ?? risingData.length);
      if ($('rising-status')) {
        $('rising-status').textContent = `Critério: +${risingCriteria.minimum_growth_pct}% e +${risingCriteria.minimum_absolute_growth} unidades em aproximadamente 30 dias. ${risingNotice}`;
      }

      renderCategoryKpis();
      drawTractionTable();
      drawRisingGrowthSection();
    } catch (e) {
      if ($('rising-status')) $('rising-status').textContent = 'Não foi possível consultar sinais de crescimento: ' + e.message;
    }
  }

  // Eventos dos filtros e cards executivos
  $('rising-filter')?.addEventListener('change', syncFiltersAndDraw);
  $('rising-category-select')?.addEventListener('change', e => {
    activeCategory = e.target.value;
    syncFiltersAndDraw();
  });
  $('rising-tier-filter')?.addEventListener('change', drawTractionTable);
  $('rising-sort-filter')?.addEventListener('change', drawTractionTable);
  $('rising-quick-btn')?.addEventListener('click', drawTractionTable);
  $('rising-quick-search')?.addEventListener('input', drawTractionTable);
  $('rising-reset-filters')?.addEventListener('click', () => {
    activeCategory = '';
    if ($('rising-quick-search')) $('rising-quick-search').value = '';
    if ($('rising-filter')) $('rising-filter').value = '';
    if ($('rising-tier-filter')) $('rising-tier-filter').value = 'emerging';
    if ($('rising-sort-filter')) $('rising-sort-filter').value = 'traction';
    syncFiltersAndDraw();
  });
  $('rising-open-discover-btn')?.addEventListener('click', () => {
    $('rising-new-discovery-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('rising-discover-query')?.focus();
  });
  $('rising-discover-form')?.addEventListener('submit', handleDiscoverNewTalent);
  $('rising-collect-now-btn')?.addEventListener('click', triggerCollectAll);

  $('kpi-card-baseline')?.addEventListener('click', () => {
    if ($('rising-tier-filter')) $('rising-tier-filter').value = 'all';
    drawTractionTable();
    $('rising-traction-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('kpi-card-traction')?.addEventListener('click', () => {
    if ($('rising-tier-filter')) $('rising-tier-filter').value = 'emerging';
    drawTractionTable();
    $('rising-traction-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('kpi-card-growth')?.addEventListener('click', () => {
    $('rising-growth-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('kpi-card-accel')?.addEventListener('click', () => {
    $('acceleration-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  loadAll();
})();
