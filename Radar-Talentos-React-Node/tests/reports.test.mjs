import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/src/database/index.mjs';
import { seedPilotDatabaseIfEmpty } from '../server/src/seed-pilot.mjs';
import { syncAllMenusData } from '../server/src/menu-integration.mjs';
import { createRadarServer } from '../server/src/app.mjs';

test('Central de Relatórios & Extrações do Motor (/reports.html, /api/reports/hub, /api/reports/export.csv e /api/reports/extract-now)', async () => {
  const db = openDatabase(':memory:');
  seedPilotDatabaseIfEmpty(db);
  syncAllMenusData(db, null, { includeDemoFixtures: true });

  const server = createRadarServer({ database: db, eventsOnly: true, combinedDashboard: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;

    // 1. Página /reports.html carregada e link presente em todos os menus
    const pageRes = await fetch(base + '/reports.html');
    assert.equal(pageRes.status, 200);
    const html = await pageRes.text();
    assert.match(html, /Relatórios &amp; Extrações de Inteligência/);
    assert.match(html, /id="reports-extract-now-btn"/);

    for (const p of ['/', '/audience.html', '/commercial.html', '/rising.html', '/acquisition.html', '/discovery.html', '/users.html', '/events.html']) {
      const mHtml = await (await fetch(base + p)).text();
      assert.match(mHtml, /href="\/reports\.html"/);
    }

    // 2. Endpoint /api/reports/hub retorna os 5 relatórios prontos com extrações reais
    const hubRes = await fetch(base + '/api/reports/hub?type=master_talents');
    assert.equal(hubRes.status, 200);
    const hub = await hubRes.json();
    assert.equal(hub.ok, true);
    assert.equal(hub.catalog.length, 5);
    assert.ok(hub.kpis.talentsWithExtractions > 0);
    assert.ok(hub.activeReport.rows.length > 0);
    assert.ok(hub.reports.artist_dossier.rows.length === 4);
    assert.ok(hub.reports.geo_ibge.rows.length > 0);
    assert.ok(hub.reports.commercial_score.rows.length > 0);
    assert.ok(hub.reports.engine_audit.rows.length > 0);

    // 3. Exportação CSV (/api/reports/export.csv) gera arquivo compatível com Excel (BOM UTF-8 + separador ;)
    const csvRes = await fetch(base + '/api/reports/export.csv?type=master_talents');
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get('content-type') || '', /text\/csv/);
    const csvText = await csvRes.text();
    assert.match(csvText, /Artista \/ Talento;Categoria;Porte Digital/);
    assert.match(csvText, /Gusttavo Lima/);

    // 4. Dossiê 360° individual via parâmetro talent
    const dossierRes = await fetch(base + '/api/reports/hub?type=artist_dossier&talent=t-gusttavo-lima');
    assert.equal(dossierRes.status, 200);
    const dossier = await dossierRes.json();
    assert.equal(dossier.reportType, 'artist_dossier');
    assert.equal(dossier.activeReport.rows.length, 4);
  } finally {
    await new Promise(r => server.close(r));
    db.close();
  }
});
