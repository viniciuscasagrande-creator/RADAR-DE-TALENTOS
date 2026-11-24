'use strict';
(() => {
  const area = document.getElementById('acceleration-results');
  if (!area) return;
  const category = document.getElementById('acceleration-category'),
    network = document.getElementById('acceleration-network'),
    status = document.getElementById('acceleration-status'),
    total = document.getElementById('acceleration-total'),
    accelKpi = document.getElementById('rising-accel-kpi');
  const fmt = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  let data = [],
    allCategories = [],
    crossSummaryItems = [];
  const el = (tag, txt) => {
    const n = document.createElement(tag);
    if (txt !== undefined) n.textContent = txt;
    return n;
  };

  function draw() {
    const cats = [...new Set([...allCategories, ...data.flatMap(x => x.categories || [])])].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    const old = category.value;
    category.replaceChildren(new Option('Todos os segmentos', ''), ...cats.map(x => new Option(x, x)));
    if (cats.includes(old)) category.value = old;

    const filtered = data.filter(
      x => (!category.value || (x.categories || []).includes(category.value)) && (!network.value || x.network === network.value)
    );
    total.textContent = fmt(filtered.length);
    if (accelKpi) accelKpi.textContent = filtered.length ? fmt(filtered.length) : 'Série 1/3 Ativa';
    area.replaceChildren();

    if (!filtered.length) {
      const matchingBaseline = crossSummaryItems.filter(a => {
        if (!a.hasCollectedMetric) return false;
        if (category.value) {
          if (category.value === 'Sem categoria') {
            if (a.categories && a.categories.length > 0) return false;
          } else if (!(a.categories || []).includes(category.value)) {
            return false;
          }
        }
        if (network.value && a.media?.[network.value]?.value == null) return false;
        return true;
      });
      const p = el(
        'p',
        `Sem evidência de aceleração em 2 períodos de 30 dias neste recorte (${matchingBaseline.length} talento(s) deste segmento/mídia já possuem a 1ª medição de linha de base ativa e aguardam as próximas janelas de ~30d e ~60d para cálculo de aceleração em p.p.).`
      );
      area.append(p);
      return;
    }

    const table = el('table');
    const thead = table.createTHead(),
      h = thead.insertRow();
    for (const name of ['Artista / segmento', 'Mídia', '30d anteriores', '30d recentes', 'Aceleração', 'Evidência']) {
      const th = document.createElement('th');
      th.textContent = name;
      h.append(th);
    }
    const tbody = table.createTBody();
    for (const x of filtered) {
      const tr = tbody.insertRow();
      tr.insertCell().textContent = x.name + ' · ' + x.categories.join(', ');
      tr.insertCell().textContent = x.network;
      tr.insertCell().textContent = fmt(x.previous_growth_pct) + '%';
      tr.insertCell().textContent = fmt(x.recent_growth_pct) + '%';
      tr.insertCell().textContent = '+' + fmt(x.acceleration_pp) + ' p.p.';
      const td = tr.insertCell();
      const a = el('a', 'Ver referência ↗');
      a.href = x.evidence_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      td.append(a);
      td.append(el('small', ' · ' + x.last_on + ' · fonte declarada: ' + x.source));
    }
    area.append(table);
  }

  async function load() {
    status.textContent = 'Consultando observações comparáveis...';
    try {
      const [r, catRes, crossRes] = await Promise.all([
        fetch('/api/discoveries/acceleration', { cache: 'no-store' }),
        fetch('/api/regional/categories', { cache: 'no-store' }).then(x => (x.ok ? x.json() : null)).catch(() => null),
        fetch('/api/radar/cross-summary?limit=200', { cache: 'no-store' }).then(x => (x.ok ? x.json() : null)).catch(() => null)
      ]);
      if (!r.ok) throw Error('HTTP ' + r.status);
      const j = await r.json();
      data = Array.isArray(j.items) ? j.items : [];
      allCategories = Array.isArray(catRes?.categories) ? catRes.categories.map(c => c.name) : [];
      crossSummaryItems = Array.isArray(crossRes?.items) ? crossRes.items : [];
      draw();
      status.textContent = `${fmt(j.total)} sinais com três observações comparáveis (dois períodos de 30 dias). Revisão de procedência obrigatória.`;
    } catch (e) {
      data = [];
      total.textContent = '—';
      area.replaceChildren();
      status.textContent = 'Consulta indisponível: ' + e.message;
    }
  }

  category.addEventListener('change', draw);
  network.addEventListener('change', draw);
  document.getElementById('acceleration-refresh')?.addEventListener('click', load);
  load();
})();
