import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/src/database/index.mjs';
import { openDiscovery } from '../server/src/discovery/engine.mjs';
import { seedPilotDatabaseIfEmpty } from '../server/src/seed-pilot.mjs';
import {
  syncAllMenusData,
  getCrossMenuSummary,
  getDemographicsSummary,
  importOfficialAgenda,
  formatCompactPtBr
} from '../server/src/menu-integration.mjs';
import { commercialInsights } from '../server/src/commercial-insights.mjs';
import { commercialCompatibility } from '../server/src/commercial-compatibility.mjs';
import { createRadarServer } from '../server/src/app.mjs';

test('Plano 8 de 8 etapas: modelo Gusttavo Lima (IG/SP/TK Sem coleta, YT 21,9 milhões, Eventos A integrar, Regional Sem dados), MusicBrainz, Demografia IBGE e Agendas Oficiais', async () => {
  const db = openDatabase(':memory:');
  const disc = openDiscovery(':memory:');
  try {
    seedPilotDatabaseIfEmpty(db);
    const syncRes = syncAllMenusData(db, disc, { now: '2026-11-19T18:00:00.000Z' });
    assert.equal(syncRes.ok, true);
    assert.equal(syncRes.executionPlan.length, 8);
    assert.ok(syncRes.demographicsInserted >= 30);

    // 1. Validar modelo exato de Gusttavo Lima no cruzamento inteligente (/api/radar/cross-summary)
    const cross = getCrossMenuSummary(db, new URLSearchParams({ q: 'Gusttavo Lima' }));
    assert.equal(cross.executionPlan.label, '8 de 8 etapas concluídas');
    assert.equal(cross.menus.length, 6);
    const gl = cross.items.find(i => i.id === 't-gusttavo-lima');
    assert.ok(gl, 'Gusttavo Lima deve estar presente no cruzamento');
    assert.equal(gl.name, 'Gusttavo Lima');
    assert.equal(gl.media.Instagram.statusLabel, 'Sem coleta');
    assert.equal(gl.media.Instagram.url, 'https://instagram.com/gusttavolima');
    assert.equal(gl.media.YouTube.value, 21900000);
    assert.equal(gl.media.YouTube.formatted, '21,9 milhões');
    assert.equal(gl.media.YouTube.statusLabel, '21,9 milhões');
    assert.equal(gl.media.Spotify.statusLabel, 'Sem coleta');
    assert.equal(gl.media.Spotify.url, 'https://open.spotify.com/artist/7MiDcPa6UiV3In7lIM71IN');
    assert.equal(gl.media.TikTok.statusLabel, 'Sem coleta');
    assert.equal(gl.media.TikTok.url, 'https://tiktok.com/@gusttavolima');
    assert.equal(gl.events.statusLabel, 'A integrar');
    assert.equal(gl.regionalAudience.statusLabel, 'Sem dados');
    assert.equal(gl.catalog.wikidata_id, 'Q380821');
    assert.equal(gl.catalog.musicbrainz_id, 'e12d47d9-8994-41c8-8049-182595163644');
    assert.ok(gl.catalog.genres.includes('Sertanejo'));

    // 2. Validar ficha de Oportunidade Comercial (/api/commercial/insights) para Gusttavo Lima
    const ins = commercialInsights(db, new URLSearchParams({
      talent: 't-gusttavo-lima',
      scope: 'artist',
      days: '30',
      end: '2026-11-18'
    }));
    assert.equal(ins.national.find(n => n.network === 'Instagram').statusLabel, 'Sem coleta');
    assert.equal(ins.national.find(n => n.network === 'YouTube').statusLabel, '21,9 milhões');
    assert.equal(ins.national.find(n => n.network === 'Spotify').statusLabel, 'Sem coleta');
    assert.equal(ins.national.find(n => n.network === 'TikTok').statusLabel, 'Sem coleta');
    assert.equal(ins.eventsPresence.statusLabel, 'A integrar');
    assert.equal(ins.regionalSummary.statusLabel, 'Sem dados');

    // 3. Validar Base Geográfica Nacional com Indicadores Demográficos e Econômicos Oficiais (IBGE)
    const demo = getDemographicsSummary(db, new URLSearchParams({ city: '5208707', radius: '100' }));
    assert.ok(demo.municipalitiesWithDemographics >= 30);
    assert.equal(demo.catchment.center.name, 'Goiânia');
    assert.equal(demo.catchment.center.population, 1437366);
    assert.ok(demo.catchment.center.gdp_per_capita > 40000);

    // 4. Validar integração de Agenda Oficial / Ticketeiras (presença territorial distinta de vendas/audiência)
    const agendaRes = importOfficialAgenda(db, {
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
    assert.equal(agendaRes.imported, 1);

    const crossAfter = getCrossMenuSummary(db, new URLSearchParams({ talent: 't-gusttavo-lima' }));
    assert.equal(crossAfter.items[0].events.statusLabel, '1 evento(s) em 1 cidade(s)');
    assert.equal(crossAfter.items[0].events.items[0].price_info, 'A partir de R$ 120,00 (publicado)');
    assert.match(crossAfter.items[0].events.notice, /presença territorial/i);

    // 5. Validar Simulador de Compatibilidade com Demografia IBGE e Presença Territorial
    const compat = commercialCompatibility(db, new URLSearchParams({
      talent: 't-gusttavo-lima',
      city: '5208707',
      radius: '80',
      days: '30',
      end: '2026-11-18'
    }));
    assert.equal(compat.city.demographics.population, 1437366);
    assert.equal(compat.territorialPresence.nationalEventsCount, 1);
    assert.equal(compat.media.find(m => m.network === 'YouTube').statusLabel, '21,9 milhões');
    assert.equal(compat.media.find(m => m.network === 'Instagram').statusLabel, 'Sem coleta');

    // 6. Validar endpoints HTTP
    const server = createRadarServer({ database: db, eventsOnly: true, combinedDashboard: true });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      const rCross = await fetch(base + '/api/radar/cross-summary?q=Gusttavo+Lima');
      assert.equal(rCross.status, 200);
      const bCross = await rCross.json();
      assert.equal(bCross.items[0].media.YouTube.formatted, '21,9 milhões');

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
