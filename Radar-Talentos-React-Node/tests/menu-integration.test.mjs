import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/src/database/index.mjs';
import { openDiscovery } from '../server/src/discovery/engine.mjs';
import { seedPilotDatabaseIfEmpty } from '../server/src/seed-pilot.mjs';
import {
  syncAllMenusData,
  getCrossMenuSummary,
  getDemographicsSummary,
  getArtistMediaStats,
  classifyMetricValidity,
  importOfficialAgenda
} from '../server/src/menu-integration.mjs';
import { commercialInsights } from '../server/src/commercial-insights.mjs';
import { commercialCompatibility } from '../server/src/commercial-compatibility.mjs';
import { createRadarServer } from '../server/src/app.mjs';

test('Instagram e Spotify (7/15/30 dias, engajamento, repertório, cidades comprovadas, qualidade de dados) e Ticketeiras como consulta opcional sem influenciar rankings/scores', async () => {
  const db = openDatabase(':memory:');
  const disc = openDiscovery(':memory:');
  try {
    seedPilotDatabaseIfEmpty(db);
    const syncRes = syncAllMenusData(db, disc, { now: '2026-11-19T18:00:00.000Z' });
    assert.equal(syncRes.ok, true);
    assert.equal(syncRes.executionPlan.length, 8);
    assert.ok(syncRes.demographicsInserted >= 30);
    assert.ok(syncRes.socialSeriesSynced >= 40);
    assert.ok(syncRes.regionalReportsSynced >= 10);

    // 1. Validar cruzamento inteligente (/api/radar/cross-summary) com séries verificadas para Gusttavo Lima e "Sem coleta" para artistas sem fonte
    const cross = getCrossMenuSummary(db, new URLSearchParams({ q: 'Gusttavo Lima' }));
    assert.equal(cross.executionPlan.label, '8 de 8 etapas concluídas');
    const optionalMenu = cross.menus.find(m => m.optional === true);
    assert.ok(optionalMenu, 'Ticketeiras deve estar marcada como consulta opcional');

    const gl = cross.items.find(i => i.id === 't-gusttavo-lima');
    assert.ok(gl, 'Gusttavo Lima deve estar presente no cruzamento');
    assert.equal(gl.name, 'Gusttavo Lima');
    assert.equal(gl.media.Instagram.value, 45100000);
    assert.equal(gl.media.Instagram.formatted, '45,1 milhões');
    assert.equal(gl.media.Instagram.classification, 'relatorio_autorizado');
    assert.equal(gl.media.YouTube.value, 21900000);
    assert.equal(gl.media.YouTube.formatted, '21,9 milhões');
    assert.equal(gl.media.YouTube.classification, 'oficial');
    assert.equal(gl.media.Spotify.value, 15800000);
    assert.equal(gl.media.Spotify.formatted, '15,8 milhões');
    assert.equal(gl.media.Spotify.classification, 'relatorio_autorizado');
    assert.equal(gl.media.TikTok.value, 10450000);
    assert.equal(gl.media.TikTok.formatted, '10,4 milhões');
    assert.equal(gl.media.TikTok.classification, 'observado');
    assert.equal(gl.regionalAudience.hasData, true);
    assert.equal(gl.catalog.wikidata_id, 'Q380821');
    assert.equal(gl.catalog.musicbrainz_id, 'e12d47d9-8994-41c8-8049-182595163644');

    // 2. Validar Estatísticas Avançadas de Instagram e Spotify (getArtistMediaStats)
    const stats = getArtistMediaStats(db, 't-gusttavo-lima', { end: '2026-11-18' });
    assert.ok(stats);
    // Instagram: seguidores, crescimento 7d/15d/30d, engajamento médio com metodologia, Reels e principais cidades
    assert.equal(stats.Instagram.followers.value, 45100000);
    assert.equal(stats.Instagram.followers.classification, 'relatorio_autorizado');
    assert.equal(stats.Instagram.followers.validity.code, 'current_7d');
    assert.equal(stats.Instagram.growth_7d.value, 140000);
    assert.equal(stats.Instagram.growth_15d.value, 280000);
    assert.equal(stats.Instagram.growth_30d.value, 500000);
    assert.equal(stats.Instagram.growth_30d.classification, 'calculado');
    assert.ok(stats.Instagram.engagement.rate_pct > 0);
    assert.equal(stats.Instagram.engagement.interactions_per_post, 412000 + 9800);
    assert.match(stats.Instagram.engagement.methodology, /Seguidores/i);
    assert.equal(stats.Instagram.recent_posts.value, 3420);
    assert.equal(stats.Instagram.reels_views.value, 3850000);
    assert.equal(stats.Instagram.top_cities.hasData, true);
    assert.equal(stats.Instagram.top_cities.cities[0].name, 'São Paulo');
    assert.ok(stats.Instagram.top_cities.cities[0].growth > 0);
    assert.equal(stats.Instagram.history.length, 4);

    // Spotify: ouvintes mensais, crescimento 7d/15d/30d, seguidores, repertório/lançamentos, top tracks e cidades com evolução
    assert.equal(stats.Spotify.monthly_listeners.value, 15800000);
    assert.equal(stats.Spotify.monthly_listeners.classification, 'relatorio_autorizado');
    assert.equal(stats.Spotify.growth_7d.value, 210000);
    assert.equal(stats.Spotify.growth_15d.value, 420000);
    assert.equal(stats.Spotify.growth_30d.value, 700000);
    assert.equal(stats.Spotify.followers.value, 20400000);
    assert.equal(stats.Spotify.repertoire.albums_count, 19);
    assert.equal(stats.Spotify.repertoire.singles_count, 68);
    assert.ok(stats.Spotify.repertoire.top_tracks.length >= 3);
    assert.equal(stats.Spotify.top_cities.hasData, true);
    assert.equal(stats.Spotify.top_cities.cities[0].name, 'São Paulo');
    assert.equal(stats.Spotify.top_cities.cities[1].name, 'Goiânia');
    assert.ok(stats.Spotify.top_cities.cities[1].growth > 0);
    assert.equal(stats.Spotify.history.length, 4);

    // 3. Validar artista sem coleta verificada: deve exibir "—" e "Aguardando dados verificados", sem inventar números
    const uncollectedStats = getArtistMediaStats(db, 't-ze-neto-cristiano', { end: '2026-11-18' });
    assert.equal(uncollectedStats.Instagram.has_verified_data, false);
    assert.equal(uncollectedStats.Instagram.followers.formatted, '—');
    assert.equal(uncollectedStats.Instagram.growth_30d.formatted, '—');
    assert.equal(uncollectedStats.Instagram.engagement.formatted, '—');
    assert.equal(uncollectedStats.Instagram.top_cities.statusLabel, '—');
    assert.equal(uncollectedStats.Instagram.waiting_label, 'Aguardando dados verificados');
    assert.equal(uncollectedStats.Spotify.has_verified_data, false);
    assert.equal(uncollectedStats.Spotify.monthly_listeners.formatted, '—');
    assert.equal(uncollectedStats.Spotify.repertoire.formatted, '—');
    assert.equal(uncollectedStats.Spotify.top_cities.statusLabel, '—');

    // 4. Validar distinção entre estatística válida (7, 15, 30 dias), desatualizada (> 30 dias) e inexistente
    assert.equal(classifyMetricValidity('2026-11-15', '2026-11-18').code, 'current_7d');
    assert.equal(classifyMetricValidity('2026-11-05', '2026-11-18').code, 'valid_15d');
    assert.equal(classifyMetricValidity('2026-10-22', '2026-11-18').code, 'valid_30d');
    assert.equal(classifyMetricValidity('2026-09-01', '2026-11-18').code, 'outdated');
    assert.equal(classifyMetricValidity(null, '2026-11-18').code, 'missing');

    // 5. Validar que Ticketeiras são apenas consulta opcional e NÃO alteram o Score Comercial de Compatibilidade
    const compatBeforeEvents = commercialCompatibility(db, new URLSearchParams({
      talent: 't-gusttavo-lima',
      city: '5208707',
      radius: '80',
      days: '30',
      end: '2026-11-18'
    }));
    assert.ok(compatBeforeEvents.score >= 70, `Score recebido: ${compatBeforeEvents.score}`);

    importOfficialAgenda(db, {
      artist_name: 'Gusttavo Lima',
      talent_id: 't-gusttavo-lima',
      platform: 'bilheteriadigital',
      observed_on: '2026-11-18',
      source: 'Agenda oficial Gusttavo Lima / Bilheteria Digital',
      official_agenda_url: 'https://gusttavolima.com.br/#agenda',
      items: [
        {
          external_id: 'gl-goiania-2026',
          title: 'Buteco do Gusttavo Lima — Goiânia',
          municipality_code: '5208707',
          venue: 'Estádio Serra Dourada',
          event_date: '2026-12-19',
          modality_id: 'shows',
          url: 'https://www.bilheteriadigital.com/buteco-goiania-2026',
          price_info: 'A partir de R$ 120,00 (publicado)'
        }
      ]
    });

    const compatAfterEvents = commercialCompatibility(db, new URLSearchParams({
      talent: 't-gusttavo-lima',
      city: '5208707',
      radius: '80',
      days: '30',
      end: '2026-11-18'
    }));
    // O score comercial permanece idêntico com ou sem eventos de ticketeiras
    assert.equal(compatAfterEvents.score, compatBeforeEvents.score);

    // 6. Validar endpoints HTTP (incluindo /api/radar/media-stats e menu Consultas Opcionais)
    const ins = commercialInsights(db, new URLSearchParams({
      talent: 't-gusttavo-lima',
      scope: 'artist',
      days: '15',
      end: '2026-11-18'
    }));
    assert.ok(ins.mediaStats);
    assert.equal(ins.mediaStats.Instagram.followers.formatted, '45,1 milhões');
    assert.equal(ins.mediaStats.Spotify.monthly_listeners.formatted, '15,8 milhões');

    const server = createRadarServer({ database: db, eventsOnly: true, combinedDashboard: true });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      const rStats = await fetch(base + '/api/radar/media-stats?talent=t-gusttavo-lima&end=2026-11-18');
      assert.equal(rStats.status, 200);
      const bStats = await rStats.json();
      assert.equal(bStats.Instagram.followers.value, 45100000);
      assert.equal(bStats.Spotify.monthly_listeners.value, 15800000);

      const homeHtml = await (await fetch(base + '/')).text();
      assert.match(homeHtml, /CONSULTAS OPCIONAIS/);
      assert.match(homeHtml, /Eventos e Ticketeiras/);

      const rDemo = await fetch(base + '/api/radar/demographics?uf=SP');
      assert.equal(rDemo.status, 200);
      const bDemo = await rDemo.json();
      assert.equal(bDemo.topMunicipalities[0].name, 'São Paulo');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    disc.close();
    db.close();
  }
});
