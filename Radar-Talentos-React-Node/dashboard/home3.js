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

    // Aplica o logo oficial em alta definição na barra lateral e no hero banner da Visão Geral
    const mark = document.querySelector('.sidebar .radar-mark');
    if (mark && !mark.querySelector('svg') && !mark.querySelector('img')) {
      mark.textContent = '';
      const logoImg = el('img', 'brand-logo-img');
      logoImg.src = '/radar-logo-mark.svg';
      logoImg.alt = '';
      mark.append(logoImg);
    }

    const headline = overview.querySelector('.topline');
    const heroBanner = el('div', 'home3-hero-banner');
    const heroLeft = el('div', 'home3-hero-left');
    const heroArt = el('img', 'home3-hero-art');
    heroArt.src = '/radar-hero-banner.svg';
    heroArt.alt = 'Radar de Talentos — Inteligência de mercado';
    const heroText = el('div', 'home3-hero-text');
    const eyebrow = el('div', 'home3-intro-eyebrow', 'INTELIGÊNCIA ARTÍSTICA · VISÃO GERAL EXECUTIVA');
    const copy = el(
      'p',
      'home3-intro-copy',
      'Descubra, compare e analise talentos nas 4 mídias (Instagram, Spotify, YouTube e TikTok). Indicadores verificados com fonte, data e evidência.'
    );
    heroText.append(eyebrow, copy);
    heroLeft.append(heroArt, heroText);

    const quick = el('nav', 'home3-quick');
    quick.setAttribute('aria-label', 'Atalhos do painel executivo');
    const links = [
      ['★ Ficha 360° em Destaque', '#studio-ficha-360'],
      ['▥ Ranking Multi-Mídia', '#studio-compare-content'],
      ['⚡ Simular Show & Ingressos', '#simular-show'],
      ['⌖ Audiência Geográfica', '/audience.html'],
      ['↗ Oportunidade Comercial', '/commercial.html'],
      ['✓ Prospecção Rápida', '/discovery.html']
    ];
    links.forEach(([title, href]) => {
      const a = el('a', null, title);
      a.href = href;
      if (href === '#simular-show') {
        a.addEventListener('click', e => {
          e.preventDefault();
          if (typeof window.openRadarShowSimulator === 'function') {
            window.openRadarShowSimulator(null, null, 100);
          }
        });
      } else if (href.startsWith('#')) {
        a.addEventListener('click', e => {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
      quick.append(a);
    });
    heroBanner.append(heroLeft, quick);

    if (headline) headline.after(heroBanner);
    else overview.prepend(heroBanner);

    // Mantém os cards de Categorias Nacionais (#category-scope + #kpis) visíveis na Home principal logo abaixo dos 4 KPIs Executivos
    const execKpis = document.getElementById('executive-kpis');
    const catScope = document.getElementById('category-scope');
    const catKpis = document.getElementById('kpis');
    if (execKpis && catScope && catKpis) {
      const catWrap = el('div', 'home3-categories-bar');
      catWrap.append(catScope, catKpis);
      execKpis.after(catWrap);
    }

    // Mantém tanto a Ficha 360° quanto o Ranking e a Tabela Multi-Mídia visíveis simultaneamente na página inicial!
    const comparePanel = studio.querySelector('.studio-content');
    const artistPanel = studio.querySelector('.studio-ficha-360');
    if (comparePanel) comparePanel.hidden = false;
    if (artistPanel) artistPanel.hidden = false;

    // Gaveta inferior para o mapa territorial completo e tabelas legadas (aberta por padrão para clique direto nos estados e municípios)
    const advanced = el('details', 'home3-advanced');
    advanced.id = 'home3-advanced';
    advanced.open = true;
    const summary = el('summary', 'home3-advanced-heading');
    const sumTitle = el('strong', null, 'Mapa Territorial na Home, Evolução Histórica e Filtros Completos');
    const sumInfo = el('span', null, 'Clique para expandir o mapa do Brasil, filtros por município/raio e tabela paginada');
    summary.append(sumTitle, sumInfo);
    advanced.append(summary);
    const shell = el('div', 'home3-advanced-body');
    advanced.append(shell);
    main.append(advanced);

    const selectors = [
      '#overview .overview-20-grid',
      '#overview .filter-panel',
      '#overview #message',
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
    if (subbar) shell.prepend(subbar);

    const advancedAnchor = document.querySelector('a[href="#geography"]');
    advancedAnchor?.addEventListener('click', () => {
      advanced.open = true;
    });
    for (const href of ['#ranking', '#coverage-panel']) {
      document.querySelector(`.sidebar a[href="${href}"]`)?.addEventListener('click', () => {
        advanced.open = true;
      });
    }
    const onHash = () => {
      if (['#geography', '#ranking', '#coverage-panel', '#growth-panel'].includes(location.hash)) advanced.open = true;
    };
    window.addEventListener('hashchange', onHash);
    onHash();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
