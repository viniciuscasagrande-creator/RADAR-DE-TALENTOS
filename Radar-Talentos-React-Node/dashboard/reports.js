'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let hubData = null;

  function currentParams() {
    const sp = new URLSearchParams();
    const type = $('rep-type-select')?.value || 'master_talents';
    const cat = $('rep-category-select')?.value || '';
    const net = $('rep-network-select')?.value || '';
    const talent = $('rep-talent-select')?.value || '';
    const region = $('rep-region-select')?.value || '';
    const city = $('rep-city-select')?.value || '4106902';
    const q = $('reports-quick-search')?.value?.trim() || '';
    sp.set('type', type);
    if (cat) sp.set('category', cat);
    if (net) sp.set('network', net);
    if (talent) sp.set('talent', talent);
    if (region) sp.set('region', region);
    if (city) sp.set('city', city);
    if (q) sp.set('q', q);
    return sp;
  }

  function updateExportLinks() {
    const sp = currentParams();
    const csvBtn = $('export-csv-btn');
    if (csvBtn) {
      csvBtn.href = '/api/reports/export.csv?' + sp.toString();
    }
  }

  function renderCatalogCards(catalog = [], activeType = 'master_talents') {
    const grid = $('reports-catalog-grid');
    if (!grid) return;
    grid.replaceChildren();
    for (const item of catalog) {
      const isSelected = item.id === activeType;
      const btn = el('button', 'kpi');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(isSelected));
      btn.style.textAlign = 'left';
      btn.style.padding = '12px 14px';
      btn.style.borderRadius = '10px';
      btn.style.cursor = 'pointer';
      btn.style.background = isSelected
        ? 'linear-gradient(160deg, #2d1a47 0%, #161029 100%)'
        : 'linear-gradient(160deg, #1b142c 0%, #100c1b 100%)';
      btn.style.border = isSelected ? '1.5px solid #00f0ff' : '1.5px solid rgba(192,132,252,0.55)';
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.justifyContent = 'space-between';
      btn.style.gap = '6px';

      const topRow = el('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.justifyContent = 'space-between';
      topRow.style.width = '100%';
      topRow.style.gap = '6px';
      const badge = el('span', null, item.badge);
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '800';
      badge.style.color = isSelected ? '#00f0ff' : '#e9d5ff';
      badge.style.textTransform = 'uppercase';
      const countPill = el('span', 'studio-badge-pill', `${item.rowsCount} reg.`);
      countPill.style.fontSize = '10px';
      topRow.append(badge, countPill);

      const title = el('strong', null, item.title);
      title.style.fontSize = '13.5px';
      title.style.color = '#ffffff';

      const desc = el('small', null, item.description);
      desc.style.fontSize = '11px';
      desc.style.color = '#cbd5e1';
      desc.style.lineHeight = '1.35';

      btn.append(topRow, title, desc);
      btn.addEventListener('click', () => {
        if ($('rep-type-select')) {
          $('rep-type-select').value = item.id;
          loadReportsHub();
        }
      });
      grid.append(btn);
    }
  }

  function populateSelectOptions(data) {
    const catSel = $('rep-category-select');
    if (catSel && catSel.options.length <= 1 && Array.isArray(data.categories)) {
      for (const c of data.categories) {
        catSel.append(new Option(c.name, c.name));
      }
    }
    const talSel = $('rep-talent-select');
    if (talSel && !talSel.options.length && Array.isArray(data.talentsList)) {
      for (const t of data.talentsList) {
        const label = t.hasCollectedMetric ? `★ ${t.name} (${t.category})` : `${t.name} (${t.category})`;
        talSel.append(new Option(label, t.id));
      }
      if ([...talSel.options].some(o => o.value === 't-gusttavo-lima')) {
        talSel.value = 't-gusttavo-lima';
      }
    }
    const citySel = $('rep-city-select');
    if (citySel && !citySel.options.length && Array.isArray(data.citiesList)) {
      for (const c of data.citiesList) {
        citySel.append(new Option(c.name, c.code));
      }
      if ([...citySel.options].some(o => o.value === '4106902')) {
        citySel.value = '4106902';
      }
    }
  }

  function renderActiveReportTable(activeReport, catalogItem) {
    if ($('active-report-title')) $('active-report-title').textContent = `📄 ${activeReport.title}`;
    if ($('active-report-desc') && catalogItem) $('active-report-desc').textContent = catalogItem.description;

    const dossierBanner = $('dossier-highlight-banner');
    if (dossierBanner) {
      if (activeReport.id === 'artist_dossier' && activeReport.artistStats) {
        const st = activeReport.artistStats;
        dossierBanner.hidden = false;
        dossierBanner.replaceChildren();
        const title = el('strong', null, `★ Dossiê 360° Verificado: ${st.name}`);
        title.style.color = '#38bdf8';
        title.style.fontSize = '14px';
        const sub = el(
          'p',
          null,
          `Data de referência: ${st.reference_end || 'Atual'} · Repertório Spotify: ${st.Spotify?.repertoire?.formatted || '—'} · Último lançamento: ${st.Spotify?.repertoire?.latest_release_title || '—'} · Top faixas: ${st.Spotify?.repertoire?.top_tracks_formatted || '—'}`
        );
        sub.style.margin = '4px 0 0';
        sub.style.fontSize = '12px';
        sub.style.color = '#e2e8f0';
        dossierBanner.append(title, sub);
      } else {
        dossierBanner.hidden = true;
      }
    }

    const wrap = $('active-report-table-wrap');
    if (!wrap) return;
    wrap.replaceChildren();

    const cols = activeReport.columns || [];
    const rows = activeReport.rows || [];
    if (!rows.length) {
      const empty = el('p', null, 'Nenhum registro encontrado para os filtros atuais.');
      empty.style.padding = '14px';
      empty.style.color = '#a1a1aa';
      wrap.append(empty);
      return;
    }

    const tbl = el('table', 'rising-table');
    const thead = tbl.createTHead().insertRow();
    for (const c of cols) {
      const th = document.createElement('th');
      th.textContent = c.label;
      thead.append(th);
    }

    const tbody = tbl.createTBody();
    const numericDisplayOverrides = {
      instagram_followers: 'instagram_formatted',
      spotify_listeners: 'spotify_formatted',
      youtube_subscribers: 'youtube_formatted',
      tiktok_followers: 'tiktok_formatted',
      max_reach: 'max_reach_formatted',
      current_value: 'current_formatted',
      population: 'population_formatted',
      gdp_per_capita: 'gdp_formatted',
      verified_audience_sum: 'verified_audience_formatted',
      value: 'value_formatted'
    };

    for (const r of rows) {
      const tr = tbody.insertRow();
      for (const c of cols) {
        const td = tr.insertCell();
        const displayKey = numericDisplayOverrides[c.key];
        const rawVal = displayKey && r[displayKey] != null ? r[displayKey] : r[c.key];

        if (c.key === 'evidence_url' && typeof rawVal === 'string' && rawVal.startsWith('https://')) {
          const a = el('a', null, 'Abrir evidência ↗');
          a.href = rawVal;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.color = '#38bdf8';
          td.append(a);
        } else if ((c.key === 'name' || c.key === 'artist_name') && r.talent_id) {
          const a = el('a', null, String(rawVal ?? '—'));
          a.href = `/?talent=${encodeURIComponent(r.talent_id)}#studio-ficha-360`;
          a.style.color = '#f0abfc';
          a.style.fontWeight = '700';
          a.style.textDecoration = 'none';
          a.title = 'Abrir Ficha 360° na Visão Geral';
          td.append(a);
        } else if (typeof rawVal === 'number') {
          td.textContent = rawVal.toLocaleString('pt-BR');
        } else {
          td.textContent = rawVal != null ? String(rawVal) : '—';
        }
      }
    }
    wrap.append(tbl);
  }

  function renderAuditLogsAndQuarantine(data) {
    const auditRep = data?.reports?.engine_audit || {};
    const logs = auditRep.discoveryLogs || [];
    const quarantine = auditRep.quarantineRows || [];

    const logsWrap = $('engine-logs-table-wrap');
    if (logsWrap) {
      logsWrap.replaceChildren();
      if (!logs.length) {
        logsWrap.append(el('p', null, 'Motor 24/7 pronto. Clique em "Executar Extração do Motor Agora" para registrar um novo ciclo de coleta.'));
      } else {
        const tbl = el('table', 'rising-table');
        const thRow = tbl.createTHead().insertRow();
        for (const h of ['Data / Hora', 'Status', 'Itens', 'Detalhe do Conector']) {
          const th = document.createElement('th');
          th.textContent = h;
          thRow.append(th);
        }
        const tb = tbl.createTBody();
        for (const l of logs.slice(0, 12)) {
          const tr = tb.insertRow();
          tr.insertCell().textContent = (l.at || '').slice(0, 19).replace('T', ' ');
          const tdSt = tr.insertCell();
          tdSt.textContent = l.status || 'ok';
          tdSt.style.color = l.status === 'failed' || l.status === 'error' ? '#fca5a5' : '#4ade80';
          tr.insertCell().textContent = String(l.count ?? 0);
          tr.insertCell().textContent = l.message || l.job_id || 'Coleta executada';
        }
        logsWrap.append(tbl);
      }
    }

    const qWrap = $('engine-quarantine-table-wrap');
    if (qWrap) {
      qWrap.replaceChildren();
      if (!quarantine.length) {
        const okMsg = el('p', null, '✓ 0 indicadores em quarentena no momento — 100% das métricas ativas possuem procedência comprovada.');
        okMsg.style.color = '#86efac';
        okMsg.style.fontSize = '12px';
        qWrap.append(okMsg);
      } else {
        const tbl = el('table', 'rising-table');
        const thRow = tbl.createTHead().insertRow();
        for (const h of ['Talento', 'Mídia', 'Valor Retido', 'Motivo da Quarentena']) {
          const th = document.createElement('th');
          th.textContent = h;
          thRow.append(th);
        }
        const tb = tbl.createTBody();
        for (const q of quarantine.slice(0, 12)) {
          const tr = tb.insertRow();
          tr.insertCell().textContent = q.talent_id;
          tr.insertCell().textContent = `${q.network} (${q.metric})`;
          tr.insertCell().textContent = q.value != null ? Number(q.value).toLocaleString('pt-BR') : '—';
          tr.insertCell().textContent = q.reason || 'Sem evidência válida';
        }
        qWrap.append(tbl);
      }
    }
  }

  async function loadReportsHub() {
    updateExportLinks();
    const sp = currentParams();
    try {
      const r = await fetch('/api/reports/hub?' + sp.toString(), { cache: 'no-store' });
      if (!r.ok) throw Error('HTTP ' + r.status);
      hubData = await r.json();

      if ($('rep-kpi-extracted')) $('rep-kpi-extracted').textContent = String(hubData.kpis?.talentsWithExtractions ?? 0);
      if ($('rep-kpi-extracted-sub')) {
        $('rep-kpi-extracted-sub').textContent = `De ${hubData.kpis?.monitoredTalents ?? 0} talentos monitorados`;
      }
      if ($('rep-kpi-profiles')) $('rep-kpi-profiles').textContent = String(hubData.kpis?.confirmedProfiles ?? 0);
      if ($('rep-kpi-series')) $('rep-kpi-series').textContent = Number(hubData.kpis?.verifiedSeriesCount ?? 0).toLocaleString('pt-BR');
      if ($('rep-kpi-geo')) $('rep-kpi-geo').textContent = String(hubData.kpis?.ibgeHubsCount ?? 0);

      populateSelectOptions(hubData);
      renderCatalogCards(hubData.catalog || [], hubData.reportType);
      const catItem = (hubData.catalog || []).find(c => c.id === hubData.reportType);
      renderActiveReportTable(hubData.activeReport, catItem);
      renderAuditLogsAndQuarantine(hubData);
    } catch (err) {
      if ($('reports-status-banner')) {
        $('reports-status-banner').textContent = 'Erro ao carregar relatórios: ' + err.message;
      }
    }
  }

  // Botão: Executar Extração do Motor Agora (Produção de Teste)
  $('reports-extract-now-btn')?.addEventListener('click', async () => {
    const btn = $('reports-extract-now-btn');
    const banner = $('reports-status-banner');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Extraindo dados nas APIs e atualizando relatórios…';
    }
    if (banner) {
      banner.textContent = 'Motor de Dados em execução: consultando Wikidata, MusicBrainz, YouTube Data API v3 e Spotify Web…';
    }
    try {
      const r = await fetch('/api/reports/extract-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 6,
          category: $('rep-category-select')?.value || '',
          talentId: $('rep-type-select')?.value === 'artist_dossier' ? $('rep-talent-select')?.value || '' : ''
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Falha na extração');
      if (banner) {
        banner.textContent = `✓ ${d.message || 'Extração concluída com sucesso!'}`;
      }
      await loadReportsHub();
    } catch (err) {
      if (banner) {
        banner.textContent = '⚠ Não foi possível concluir a extração imediata: ' + err.message;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Executar Extração do Motor Agora';
      }
    }
  });

  // Botão: Baixar JSON Auditado
  $('export-json-btn')?.addEventListener('click', () => {
    if (!hubData?.activeReport) return;
    const payload = {
      generatedAt: hubData.generatedAt,
      reportType: hubData.reportType,
      title: hubData.activeReport.title,
      kpis: hubData.kpis,
      totalRows: hubData.activeReport.rows?.length || 0,
      rows: hubData.activeReport.rows || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `radar-relatorio-${hubData.reportType}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Botão: Copiar Tabela para Planilha (TSV p/ Excel / Google Sheets)
  $('copy-table-btn')?.addEventListener('click', async () => {
    if (!hubData?.activeReport) return;
    const cols = hubData.activeReport.columns || [];
    const rows = hubData.activeReport.rows || [];
    const header = cols.map(c => c.label).join('\t');
    const body = rows.map(r => cols.map(c => String(r[c.key] ?? '')).join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(header + '\n' + body);
      const btn = $('copy-table-btn');
      if (btn) {
        btn.textContent = '✓ Copiado p/ Excel!';
        setTimeout(() => {
          btn.textContent = '📋 Copiar p/ Planilha';
        }, 2200);
      }
    } catch {}
  });

  // Botão: Imprimir / Salvar PDF Executivo
  $('print-pdf-btn')?.addEventListener('click', () => {
    window.print();
  });

  for (const id of ['rep-type-select', 'rep-category-select', 'rep-network-select', 'rep-talent-select', 'rep-region-select', 'rep-city-select']) {
    $(id)?.addEventListener('change', loadReportsHub);
  }
  $('reports-filter-btn')?.addEventListener('click', loadReportsHub);
  $('reports-quick-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadReportsHub();
    }
  });

  window.addEventListener('radar:socket-event', ev => {
    const topic = ev.detail?.topic || '';
    if (topic === 'reports.extracted' || topic === 'discovery.updated' || topic === 'operations.sync_completed') {
      loadReportsHub();
    }
  });

  loadReportsHub();
})();
