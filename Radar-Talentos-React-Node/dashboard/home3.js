'use strict';
/* RADAR Home 3.0 — presentation-only progressive enhancement.
 * Reuses original nodes and IDs. No API writes, storage changes or fake metrics.
 */
(() => {
  const ready = () => {
    const main = document.querySelector('main.dashboard-main');
    const overview = document.getElementById('overview');
    const studio = document.getElementById('radar-intelligence-studio');
    if (!main || !overview || !studio || document.getElementById('home3-advanced')) return;
    document.body.classList.add('home3-enabled');
    const el = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const headline = overview.querySelector('.topline');
    const intro = el('div', 'home3-intro');
    const eyebrow = el('div', 'home3-intro-eyebrow', 'INTELIGÊNCIA ARTÍSTICA · PAINEL EXECUTIVO');
    const copy = el('p', 'home3-intro-copy', 'Descubra, compare e analise talentos. Indicadores somente com fonte, data e evidência; dados indisponíveis permanecem em branco.');
    intro.append(eyebrow, copy);
    if (headline) headline.after(intro); else overview.prepend(intro);

    const quick = el('nav', 'home3-quick');
    quick.setAttribute('aria-label', 'Atalhos do painel executivo');
    const links = [
      ['Comparar artistas', '#radar-intelligence-studio', 'compare'],
      ['Ficha 360°', '#studio-ficha-360', 'artist'],
      ['Audiência geográfica', '/audience.html', null],
      ['Oportunidade comercial', '/commercial.html', null]
    ];
    links.forEach(([title, href, tab]) => {
      const a = el('a', null, title);
      a.href = href;
      if (tab) a.dataset.home3Tab = tab;
      quick.append(a);
    });
    intro.after(quick);

    // Collapse/relocate, NEVER clone or remove, so event handlers and API targets survive.
    const advanced = el('details', 'home3-advanced');
    advanced.id = 'home3-advanced';
    const summary = el('summary', 'home3-advanced-heading');
    const sumTitle = el('strong', null, 'Análises avançadas e filtros originais');
    const sumInfo = el('span', null, 'Mapa · relatórios municipais · filtros completos · tabelas anteriores');
    summary.append(sumTitle, sumInfo);
    advanced.append(summary);
    const shell = el('div', 'home3-advanced-body');
    advanced.append(shell);
    main.append(advanced);

    const selectors = [
      '#overview .overview-20-grid',
      '#overview .filter-panel',
      '#overview #message',
      '#overview #category-scope',
      '#overview #kpis',
      '#overview #audience-kpis',
      'main > #current-media',
      'main > .geo-grid',
      'main > .detail-grid',
      'main > #coverage-panel'
    ];
    for (const sel of selectors) {
      const node = document.querySelector(sel);
      if (node) shell.append(node);
    }
    const filters = advanced.querySelector('.filter-panel');
    if (filters) filters.open = false;
    const subbar = overview.querySelector('.subbar');
    if (subbar) shell.prepend(subbar); // preserve media shortcuts, without duplicating filters.

    // One central studio with two modes; do not add another redundant 360 panel.
    const comparePanel = studio.querySelector('.studio-content');
    const artistPanel = studio.querySelector('.studio-ficha-360');
    if (comparePanel && artistPanel) {
      const tabbar = el('div', 'home3-tabs');
      tabbar.setAttribute('role', 'tablist');
      tabbar.setAttribute('aria-label', 'Modo de inteligência');
      const buttons = new Map();
      for (const [key, label, panel] of [
        ['compare', 'Comparar artistas', comparePanel],
        ['artist', 'Ficha 360° do artista', artistPanel]
      ]) {
        const button = el('button', 'home3-tab', label);
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', key === 'compare' ? 'home3-compare' : 'studio-ficha-360');
        button.dataset.home3Mode = key;
        buttons.set(key, button);
        tabbar.append(button);
        if (key === 'compare') panel.id = 'home3-compare';
      }
      const setMode = key => {
        for (const [mode, button] of buttons) {
          const active = mode === key;
          button.setAttribute('aria-selected', String(active));
          button.tabIndex = active ? 0 : -1;
        }
        comparePanel.hidden = key !== 'compare';
        artistPanel.hidden = key !== 'artist';
      };
      const header = studio.querySelector('.studio-header');
      if (header) header.after(tabbar); else studio.prepend(tabbar);
      buttons.forEach((button, key) => button.addEventListener('click', () => setMode(key)));
      tabbar.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const mode = buttons.get('compare').getAttribute('aria-selected') === 'true' ? 'artist' : 'compare';
        setMode(mode);
        buttons.get(mode).focus();
      });
      quick.querySelectorAll('[data-home3-tab]').forEach(a => {
        a.addEventListener('click', () => setMode(a.dataset.home3Tab));
      });
      const picker = studio.querySelector('select[aria-label="Selecionar artista para Ficha 360°"]');
      picker?.addEventListener('change', () => setMode('artist'));
      studio.addEventListener('click', event => {
        if (event.target.closest('.studio-artist-btn, .studio-barrow')) setMode('artist');
      });
      setMode(location.hash === '#studio-ficha-360' ? 'artist' : 'compare');
    }

    // Preserve geographic analysis on a dedicated page and as expandable legacy content.
    const advancedAnchor = document.querySelector('a[href="#geography"]');
    advancedAnchor?.addEventListener('click', () => { advanced.open = true; });
    for (const href of ['#ranking','#coverage-panel']) {
      document.querySelector(`.sidebar a[href="${href}"]`)?.addEventListener('click', () => { advanced.open = true; });
    }
    const onHash = () => {
      if (['#geography','#ranking','#coverage-panel','#growth-panel'].includes(location.hash)) advanced.open = true;
    };
    window.addEventListener('hashchange', onHash);
    onHash();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once:true});
  else ready();
})();
