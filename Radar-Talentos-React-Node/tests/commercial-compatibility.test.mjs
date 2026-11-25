import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/src/database/index.mjs';
import { importCommercial } from '../server/src/commercial.mjs';
import { importRegionalReport } from '../server/src/regional-dashboard.mjs';
import { importEvents } from '../server/src/events.mjs';
import { commercialCompatibility } from '../server/src/commercial-compatibility.mjs';
import { createRadarServer } from '../server/src/app.mjs';

function setupCompatibilityDb() {
  const db = openDatabase(':memory:');
  const insMuni = db.prepare(
    'INSERT INTO municipalities(code,name,uf,region,lat,lon,source,version) VALUES(?,?,?,?,?,?,?,?)'
  );
  // Criciúma e bacia regional do Sul de SC (< 80 km) + Florianópolis (> 140 km)
  insMuni.run('4204608', 'Criciúma', 'SC', 'Sul', -28.6775, -49.3697, 'Base Nacional', '2026');
  insMuni.run('4207007', 'Içara', 'SC', 'Sul', -28.7133, -49.3003, 'Base Nacional', '2026');
  insMuni.run('4205456', 'Forquilhinha', 'SC', 'Sul', -28.7475, -49.4722, 'Base Nacional', '2026');
  insMuni.run('4219002', 'Urussanga', 'SC', 'Sul', -28.5178, -49.3147, 'Base Nacional', '2026');
  insMuni.run('4218707', 'Tubarão', 'SC', 'Sul', -28.4667, -49.0069, 'Base Nacional', '2026');
  insMuni.run('4201406', 'Araranguá', 'SC', 'Sul', -28.9356, -49.4919, 'Base Nacional', '2026');
  insMuni.run('4205407', 'Florianópolis', 'SC', 'Sul', -27.5954, -48.5480, 'Base Nacional', '2026');

  importCommercial(db, {
    authorization_ref: 'monitoramento-autorizado',
    artists: [
      {
        id: 't-claudio-duarte',
        name: 'Pastor Cláudio Duarte',
        categories: ['Palestrantes', 'Humoristas'],
        modalities: ['palestras', 'humor'],
        accounts: [
          {
            id: 'cd-ig',
            network: 'Instagram',
            url: 'https://www.instagram.com/claudioduarte',
            identity_source: 'oficial',
            snapshots: [
              { metric: 'followers', observed_on: '2026-10-01', value: 780000, source: 'Instagram Graph API' },
              { metric: 'followers', observed_on: '2026-10-31', value: 940000, source: 'Instagram Graph API' }
            ]
          },
          {
            id: 'cd-yt',
            network: 'YouTube',
            url: 'https://www.youtube.com/@claudioduarte',
            identity_source: 'oficial',
            snapshots: [
              { metric: 'subscribers', observed_on: '2026-10-01', value: 2100000, source: 'YouTube Data API v3' },
              { metric: 'subscribers', observed_on: '2026-10-31', value: 2450000, source: 'YouTube Data API v3' }
            ]
          },
          {
            id: 'cd-sp',
            network: 'Spotify',
            url: 'https://open.spotify.com/artist/claudioduarte',
            identity_source: 'oficial',
            snapshots: [
              { metric: 'monthly_listeners', observed_on: '2026-10-01', value: 120000, source: 'Spotify for Artists' },
              { metric: 'monthly_listeners', observed_on: '2026-10-31', value: 158000, source: 'Spotify for Artists' }
            ]
          },
          {
            id: 'cd-tk',
            network: 'TikTok',
            url: 'https://www.tiktok.com/@claudioduarte',
            identity_source: 'oficial',
            snapshots: [
              { metric: 'followers', observed_on: '2026-10-01', value: 640000, source: 'TikTok for Artists' },
              { metric: 'followers', observed_on: '2026-10-31', value: 890000, source: 'TikTok for Artists' }
            ]
          }
        ]
      },
      {
        id: 't-sem-regional',
        name: 'Artista Sem Dados Regionais',
        categories: ['Cantores'],
        modalities: ['shows'],
        accounts: []
      }
    ]
  }, { day: '2026-10-31' });

  for (const [net, metric, src] of [
    ['Instagram', 'followers', 'Instagram Insights'],
    ['YouTube', 'views', 'YouTube Analytics'],
    ['Spotify', 'listeners', 'Spotify for Artists'],
    ['TikTok', 'followers', 'TikTok for Artists']
  ]) {
    // Janela anterior (2026-09-01 a 2026-09-30)
    importRegionalReport(db, {
      talent_id: 't-claudio-duarte',
      network: net,
      metric,
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      source: src,
      quality: 'verified',
      report_ref: `prev-${net}`,
      authorization_ref: 'auth-oficial',
      coverage: 'complete',
      rows: [
        { municipality_code: '4204608', value: 42000 },
        { municipality_code: '4218707', value: 19500 },
        { municipality_code: '4201406', value: 15200 },
        { municipality_code: '4207007', value: 14100 },
        { municipality_code: '4205456', value: 9200 },
        { municipality_code: '4219002', value: 7800 },
        { municipality_code: '4205407', value: 48000 }
      ]
    });
    // Janela atual (2026-10-01 a 2026-10-30)
    importRegionalReport(db, {
      talent_id: 't-claudio-duarte',
      network: net,
      metric,
      period_start: '2026-10-01',
      period_end: '2026-10-30',
      source: src,
      quality: 'verified',
      report_ref: `curr-${net}`,
      authorization_ref: 'auth-oficial',
      coverage: 'complete',
      rows: [
        { municipality_code: '4204608', value: 58400 },
        { municipality_code: '4218707', value: 27400 },
        { municipality_code: '4201406', value: 21100 },
        { municipality_code: '4207007', value: 18900 },
        { municipality_code: '4205456', value: 12400 },
        { municipality_code: '4219002', value: 10300 },
        { municipality_code: '4205407', value: 54000 }
      ]
    });
  }

  return db;
}

test('Simulador de Compatibilidade: Pastor Cláudio Duarte em Criciúma/SC retorna 4 mídias, bacia regional no raio de 80 km, 7 variáveis e argumentário de vendas', () => {
  const db = setupCompatibilityDb();
  try {
    const res = commercialCompatibility(
      db,
      new URLSearchParams({
        q: 'Pastor Claudio Duarte',
        cityQuery: 'Criciuma SC',
        radius: '80',
        days: '30',
        end: '2026-10-31'
      })
    );

    assert.equal(res.artist.id, 't-claudio-duarte');
    assert.equal(res.artist.name, 'Pastor Cláudio Duarte');
    assert.equal(res.city.code, '4204608');
    assert.equal(res.city.name, 'Criciúma');
    assert.equal(res.city.uf, 'SC');
    assert.equal(res.media.length, 4);
    assert.equal(res.variables.length, 7);

    // Bacia de 80 km inclui Criciúma, Içara, Forquilhinha, Urussanga, Tubarão e Araranguá (6 municípios), mas exclui Florianópolis (> 140 km)
    assert.equal(res.catchment.totalMunicipalities, 6);
    const ig = res.media.find(m => m.network === 'Instagram');
    assert.equal(ig.national.value, 940000);
    assert.equal(ig.cityAudience.present, true);
    assert.equal(ig.cityAudience.value, 58400);
    assert.equal(ig.cityAudience.rank, 1);
    assert.equal(ig.radiusAudience.municipalitiesWithData, 6);
    assert.equal(ig.radiusAudience.totalValue, 58400 + 27400 + 21100 + 18900 + 12400 + 10300);

    assert.ok(res.score >= 80, `Score esperado >= 80, recebido ${res.score}`);
    assert.equal(res.verdict.level, 'high');
    assert.equal(res.radarScore.version, '2.0');
    assert.equal(res.radarScore.weights.length, 6);
    assert.deepEqual(
      res.radarScore.weights.map(w => w.weightPct),
      [30, 20, 15, 15, 10, 10]
    );
    assert.ok(res.threeIndependentResults?.artisticScore?.score >= 70);
    assert.equal(res.threeIndependentResults?.territorialScore?.score, res.score);
    assert.equal(res.threeIndependentResults?.eventsContext?.isolatedFromScore, true);
    assert.ok(res.confidenceIndicator?.score >= 65);
    assert.ok(res.salesPitch.length >= 4);
    assert.match(res.salesPitch[0], /Criciúma\/SC/);
  } finally {
    db.close();
  }
});

test('Simulador de Compatibilidade: ausência de dados regionais não fabrica score falso e endpoint HTTP responde 200/400', async () => {
  const db = setupCompatibilityDb();
  const server = createRadarServer({ database: db, eventsOnly: true, combinedDashboard: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const empty = commercialCompatibility(
      db,
      new URLSearchParams({
        talent: 't-sem-regional',
        city: '4204608',
        radius: '80',
        end: '2026-10-31'
      })
    );
    assert.equal(empty.score, null);
    assert.equal(empty.verdict.level, 'insufficient');

    const base = 'http://127.0.0.1:' + server.address().port;
    const okRes = await fetch(base + '/api/commercial/compatibility?q=Pastor+Claudio+Duarte&cityQuery=Criciuma+SC&radius=80&end=2026-10-31');
    assert.equal(okRes.status, 200);
    const body = await okRes.json();
    assert.equal(body.city.code, '4204608');
    assert.ok(body.score >= 80);

    const badRes = await fetch(base + '/api/commercial/compatibility?q=Artista+Inexistente&cityQuery=Criciuma');
    assert.equal(badRes.status, 400);

    // Sem cidade selecionada deve rejeitar (não assume Criciúma automaticamente)
    const noCityRes = await fetch(base + '/api/commercial/compatibility?q=Pastor+Claudio+Duarte&cityQuery=');
    assert.equal(noCityRes.status, 400);

    // Autocomplete de municípios aceita nome parcial, sem acento e formato "Cidade / UF"
    const muniRes = await fetch(base + '/api/radar/municipalities?q=Florianopolis+%2F+SC');
    assert.equal(muniRes.status, 200);
    const muniBody = await muniRes.json();
    assert.equal(muniBody.items[0].code, '4205407');
  } finally {
    await new Promise(r => server.close(r));
    db.close();
  }
});
