import test from 'node:test';
import assert from 'node:assert/strict';
import { openDiscovery, configureSource, ingest, listCandidates, detail, review, publishIdentityOnly, recordAuthorizedObservation } from '../server/src/discovery/engine.mjs';
import { collectYoutube, confirmYoutube } from '../server/src/discovery/youtube-current.mjs';
import { suggestRadarId } from '../server/src/discovery/youtube-bulk.mjs';
import { currentDashboard } from '../server/src/discovery/current-dashboard.mjs';
import { openDatabase } from '../server/src/database/index.mjs';
import { distributeVerifiedDiscoveryToRadar, quarantineUnverifiedRadarMetrics, getArtistMediaStats, getCrossMenuSummary } from '../server/src/menu-integration.mjs';
import { distributeArtistStats } from '../server/src/indicator-distribution.mjs';
import { commercialQuery } from '../server/src/commercial.mjs';

const GUSTTAVO_ID = 't-gusttavo-lima';
const GUSTTAVO_NAME = 'Gusttavo Lima';
const CHANNEL_ID = 'UCXooz9whNJZBRTHi9AqdjPw';
const CHANNEL_URL = `https://youtube.com/channel/${CHANNEL_ID}`;

function mockYoutubeApi({ subscribers = '21900000', views = '19536857880', videos = '1007' } = {}) {
  return async (url, opts) => {
    assert.equal(url.searchParams.get('id'), CHANNEL_ID);
    assert.equal(opts.headers['X-Goog-Api-Key'], 'test-yt-key');
    return {
      ok: true,
      json: async () => ({
        items: [
          {
            id: CHANNEL_ID,
            statistics: {
              hiddenSubscriberCount: false,
              subscriberCount: subscribers,
              viewCount: views,
              videoCount: videos
            }
          }
        ]
      })
    };
  };
}

test('Fluxo aprovado Gusttavo Lima (E2E): Prospecção -> Canal YouTube confirmado -> Coleta -> Visão Geral, Ficha 360, Camada Central e Oportunidade Comercial com mesmo valor, fonte e data', async () => {
  const discovery = openDiscovery(':memory:');
  const radar = openDatabase(':memory:');
  try {
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES (?, ?, 'person', 0)").run(GUSTTAVO_ID, GUSTTAVO_NAME);
    configureSource(discovery, {
      id: 'wikidata-cc0',
      kind: 'licensed-file',
      authorization: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
      history_allowed: false,
      enabled: true
    });

    // 1. Artista encontrado na prospecção
    ingest(discovery, 'wikidata-cc0', [
      {
        name: GUSTTAVO_NAME,
        external_id: 'Q5621275',
        evidence_url: 'https://www.wikidata.org/wiki/Q5621275',
        profiles: [{ network: 'YouTube', url: CHANNEL_URL }]
      }
    ]);
    const candidateId = listCandidates(discovery)[0].id;
    const profileId = detail(discovery, candidateId).profiles[0].id;

    // 2. Identidade vinculada ao Radar e canal do YouTube confirmado individualmente
    review(discovery, candidateId, {
      approve: true,
      reviewer: 'admin',
      evidence: 'https://www.wikidata.org/wiki/Q5621275',
      radarId: GUSTTAVO_ID
    });
    publishIdentityOnly(discovery, radar, candidateId);
    confirmYoutube(discovery, candidateId, profileId, {
      evidence: CHANNEL_URL,
      reviewer: 'admin'
    });

    // 3. Coleta oficial do YouTube (Dia 1: 2026-11-23) e distribuição automática do worker
    const day1Clock = () => new Date('2026-11-23T12:00:00.000Z');
    const col1 = await collectYoutube(discovery, {
      key: 'test-yt-key',
      fetcher: mockYoutubeApi({ subscribers: '21900000', views: '19536857880', videos: '1007' }),
      clock: day1Clock
    });
    assert.equal(col1.status, 'success');
    assert.equal(col1.collected, 1);

    const dist1 = distributeVerifiedDiscoveryToRadar(radar, discovery);
    assert.equal(dist1.distributed, 3);

    // 4. Verificação unificada: mesmo valor (21.900.000), mesma fonte (youtube-public-current) e mesma data (2026-11-23)
    const curDash = currentDashboard(discovery, radar, { talent: GUSTTAVO_ID }, day1Clock);
    assert.equal(curDash.items.length, 1);
    assert.equal(curDash.items[0].metrics.subscribers.value, 21900000);

    const crossSummary = getCrossMenuSummary(radar, new URLSearchParams({ talent: GUSTTAVO_ID }));
    assert.equal(crossSummary.items.length, 1);
    assert.equal(crossSummary.items[0].media.YouTube.value, 21900000);
    assert.equal(crossSummary.items[0].media.YouTube.observed_on, '2026-11-23');
    assert.equal(crossSummary.items[0].media.YouTube.source, 'youtube-public-current');
    assert.equal(crossSummary.items[0].media.Instagram.value, null);
    assert.equal(crossSummary.items[0].media.Spotify.value, null);
    assert.equal(crossSummary.items[0].media.TikTok.value, null);

    const rawStats = getArtistMediaStats(radar, GUSTTAVO_ID, { end: '2026-11-23', discoveryDb: discovery });
    const central = distributeArtistStats(rawStats, { end: '2026-11-23' });
    assert.equal(central.networks.YouTube.current.value, 21900000);
    assert.equal(central.networks.YouTube.current.observed_on, '2026-11-23');
    assert.equal(central.networks.YouTube.current.source, 'youtube-public-current');
    assert.equal(central.networks.YouTube.current.evidence_url, CHANNEL_URL);
    assert.equal(central.networks.YouTube.growth_7d, null);

    const comm = commercialQuery(radar, new URLSearchParams({ talent: GUSTTAVO_ID, end: '2026-11-23' }));
    assert.equal(comm.items.length, 1);
    assert.equal(comm.items[0].networks.YouTube.value, 21900000);
    assert.equal(comm.items[0].networks.YouTube.observed_on, '2026-11-23');
    assert.equal(comm.items[0].networks.YouTube.source, 'youtube-public-current');
    assert.equal(comm.items[0].networks.YouTube.url, CHANNEL_URL);

    // 5. Ciclo automático seguinte do worker (7 dias depois: 2026-11-30) atualiza indicadores e habilita crescimento de 7 dias
    const day2Clock = () => new Date('2026-11-30T12:00:00.000Z');
    const col2 = await collectYoutube(discovery, {
      key: 'test-yt-key',
      fetcher: mockYoutubeApi({ subscribers: '22000000', views: '19600000000', videos: '1009' }),
      clock: day2Clock
    });
    assert.equal(col2.status, 'success');
    assert.equal(col2.collected, 1);
    distributeVerifiedDiscoveryToRadar(radar, discovery);

    const rawStatsDay2 = getArtistMediaStats(radar, GUSTTAVO_ID, { end: '2026-11-30', discoveryDb: discovery });
    const centralDay2 = distributeArtistStats(rawStatsDay2, { end: '2026-11-30' });
    assert.equal(centralDay2.networks.YouTube.current.value, 22000000);
    assert.equal(centralDay2.networks.YouTube.current.observed_on, '2026-11-30');
    assert.equal(centralDay2.networks.YouTube.growth_7d.absolute, 100000);
    assert.equal(centralDay2.networks.YouTube.growth_7d.baseline_on, '2026-11-23');

    const commDay2 = commercialQuery(radar, new URLSearchParams({ talent: GUSTTAVO_ID, days: '7', end: '2026-11-30' }));
    assert.equal(commDay2.items[0].networks.YouTube.value, 22000000);
    assert.equal(commDay2.items[0].networks.YouTube.observed_on, '2026-11-30');
    assert.equal(commDay2.items[0].networks.YouTube.growth, 100000);
  } finally {
    discovery.close();
    radar.close();
  }
});

test('Consistência de ranking e filtro comercial: artista com 1 coleta grande precede registro manual menor sem histórico, e filtro q isola o artista pesquisado', () => {
  const radar = openDatabase(':memory:');
  try {
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES ('t-gusttavo-lima', 'Gusttavo Lima', 'person', 0)").run();
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES ('discovery-bm', 'Bruno & Marrone', 'person', 0)").run();

    radar.prepare("INSERT INTO commercial_accounts(id, talent_id, network, url, identity_source) VALUES ('gl-yt', 't-gusttavo-lima', 'YouTube', 'https://youtube.com/channel/UCXooz9whNJZBRTHi9AqdjPw', 'yt')").run();
    radar.prepare("INSERT INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref) VALUES ('gl-yt', 'subscribers', '2026-11-23', 21900000, 'youtube-public-current', 'yt')").run();

    radar.prepare("INSERT INTO commercial_accounts(id, talent_id, network, url, identity_source) VALUES ('bm-ig', 'discovery-bm', 'Instagram', 'https://instagram.com/oficialbrunoemarrone', 'ig')").run();
    radar.prepare("INSERT INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref) VALUES ('bm-ig', 'followers', '2026-11-23', 123, 'authorized-observation', 'ig')").run();

    // Sem filtro: ambos têm growth_pct = null (1 coleta), portanto Gusttavo Lima (21,9M) precede Bruno & Marrone (123)
    const all = commercialQuery(radar, new URLSearchParams({ network: 'all', end: '2026-11-23' }));
    assert.equal(all.items.length, 2);
    assert.equal(all.items[0].id, 't-gusttavo-lima');
    assert.equal(all.items[0].value, 21900000);
    assert.equal(all.items[1].id, 'discovery-bm');
    assert.equal(all.items[1].value, 123);

    // Com filtro q=Gusttavo Lima: retorna exclusivamente Gusttavo Lima
    const filtered = commercialQuery(radar, new URLSearchParams({ network: 'all', q: 'Gusttavo Lima', end: '2026-11-23' }));
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].id, 't-gusttavo-lima');
  } finally {
    radar.close();
  }
});

test('Validação de procedência e quarentena auditável: bloqueia 123 seguidores de Bruno & Marrone sem comprovação, coloca registros existentes em revisão e preserva YouTube oficial de Gusttavo Lima', async () => {
  const discovery = openDiscovery(':memory:');
  const radar = openDatabase(':memory:');
  try {
    const BM_RADAR_ID = 'discovery-609c291a13f0f61a466767ceb83418a6';
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES (?, ?, 'person', 0)").run(GUSTTAVO_ID, GUSTTAVO_NAME);
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES (?, 'Bruno & Marrone', 'person', 0)").run(BM_RADAR_ID);

    configureSource(discovery, {
      id: 'wikidata-cc0',
      kind: 'licensed-file',
      authorization: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
      history_allowed: false,
      enabled: true
    });

    // 1. Cadastra Gusttavo Lima (YouTube oficial confirmado) e Bruno & Marrone (Instagram com evidência apenas do Wikidata)
    ingest(discovery, 'wikidata-cc0', [
      {
        name: GUSTTAVO_NAME,
        external_id: 'Q5621275',
        evidence_url: 'https://www.wikidata.org/wiki/Q5621275',
        profiles: [{ network: 'YouTube', url: CHANNEL_URL }]
      },
      {
        name: 'Bruno & Marrone',
        external_id: 'Q3645985',
        evidence_url: 'https://www.wikidata.org/wiki/Q3645985',
        profiles: [{ network: 'Instagram', url: 'https://instagram.com/oficialbrunoemarrone' }]
      }
    ]);

    const cands = listCandidates(discovery);
    const glCand = cands.find(c => c.name === GUSTTAVO_NAME);
    const bmCand = cands.find(c => c.name === 'Bruno & Marrone');

    review(discovery, glCand.id, {
      approve: true,
      reviewer: 'admin',
      evidence: 'https://www.wikidata.org/wiki/Q5621275',
      radarId: GUSTTAVO_ID
    });
    publishIdentityOnly(discovery, radar, glCand.id);
    const glProfId = detail(discovery, glCand.id).profiles[0].id;
    confirmYoutube(discovery, glCand.id, glProfId, {
      evidence: CHANNEL_URL,
      reviewer: 'admin'
    });

    review(discovery, bmCand.id, {
      approve: true,
      reviewer: 'admin',
      evidence: 'https://www.wikidata.org/wiki/Q3645985',
      radarId: BM_RADAR_ID
    });
    publishIdentityOnly(discovery, radar, bmCand.id);

    // 2. Bloqueio na origem: recordAuthorizedObservation rejeita URL de catálogo de identidade (Wikidata) como prova de métrica
    assert.throws(
      () =>
        recordAuthorizedObservation(discovery, bmCand.id, {
          network: 'Instagram',
          url: 'https://instagram.com/oficialbrunoemarrone',
          metric: 'followers',
          value: 123,
          observed_at: '2026-11-23T17:22:11.938Z',
          evidence_url: 'https://www.wikidata.org/wiki/Q3645985'
        }),
      /Evidência de identidade/
    );

    // 3. Simula o estado exato de produção (onde 123 seguidores já havia sido gravado antes da trava em discovery.observations, commercial_snapshots e metric_current)
    configureSource(discovery, {
      id: 'authorized-observation',
      kind: 'licensed-file',
      authorization: 'Observação autorizada / Relatório do artista',
      history_allowed: true,
      enabled: true
    });
    const bmProfId = detail(discovery, bmCand.id).profiles[0].id;
    discovery.prepare('INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'ba5905c9c8003b187463cba94add1e561369dd7d532e771a6d15c3467aa0946a',
      bmProfId,
      'followers',
      123,
      '2026-11-23T17:22:11.938Z',
      'authorized-observation',
      'https://www.wikidata.org/wiki/Q3645985'
    );
    const bmAcc = radar.prepare("SELECT id FROM commercial_accounts WHERE talent_id = ? AND network = 'Instagram'").get(BM_RADAR_ID);
    radar.prepare('INSERT INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref) VALUES (?, ?, ?, ?, ?, ?)').run(
      bmAcc.id,
      'followers',
      '2026-11-23',
      123,
      'authorized-observation',
      'https://www.wikidata.org/wiki/Q3645985'
    );
    radar.prepare("UPDATE metric_current SET value = 123, observed_on = '2026-11-23', source = 'authorized-observation', status = 'available' WHERE account_id = ? AND metric = 'followers'").run(
      bmAcc.id
    );

    // Coleta oficial do YouTube para Gusttavo Lima
    const dayClock = () => new Date('2026-11-23T17:56:25.637Z');
    await collectYoutube(discovery, {
      key: 'test-yt-key',
      fetcher: mockYoutubeApi({ subscribers: '21900000', views: '19536857880', videos: '1008' }),
      clock: dayClock
    });

    // 4. Executa distribuição central (que audita registros existentes e bloqueia novas distribuições sem comprovação)
    const dist = distributeVerifiedDiscoveryToRadar(radar, discovery);
    assert.ok(dist.quarantined >= 2);
    assert.equal(dist.distributed, 3); // Apenas as 3 métricas oficiais do YouTube de Gusttavo Lima

    // 5. Verifica que o registro original em discovery.observations foi preservado para auditoria (não apagado)
    const rawObs = discovery.prepare("SELECT value, source_id FROM observations WHERE id = 'ba5905c9c8003b187463cba94add1e561369dd7d532e771a6d15c3467aa0946a'").get();
    assert.equal(rawObs.value, 123);

    // 6. Verifica que o histórico também foi arquivado em metric_review_quarantine no radar.sqlite
    const qRows = radar.prepare('SELECT * FROM metric_review_quarantine WHERE talent_id = ?').all(BM_RADAR_ID);
    assert.ok(qRows.length >= 2);
    assert.ok(qRows.every(r => r.value === 123));

    // 7. Verifica que metric_current de Bruno & Marrone voltou para revisão (pending_source, value = null) e commercial_snapshots não tem mais 123
    const bmCurr = radar.prepare("SELECT value, status FROM metric_current WHERE account_id = ? AND metric = 'followers'").get(bmAcc.id);
    assert.equal(bmCurr.value, null);
    assert.equal(bmCurr.status, 'pending_source');
    const bmSnapCount = radar.prepare('SELECT count(*) n FROM commercial_snapshots WHERE account_id = ?').get(bmAcc.id).n;
    assert.equal(bmSnapCount, 0);

    // 8. Verifica que Oportunidade Comercial, Visão Geral e Camada Central não exibem mais 123 para Bruno & Marrone, mas mantêm Gusttavo Lima intacto
    const comm = commercialQuery(radar, new URLSearchParams({ network: 'all', end: '2026-11-23' }));
    assert.equal(comm.items.length, 1);
    assert.equal(comm.items[0].id, GUSTTAVO_ID);
    assert.equal(comm.items[0].value, 21900000);

    const bmStats = distributeArtistStats(getArtistMediaStats(radar, BM_RADAR_ID, { end: '2026-11-23', discoveryDb: discovery }), { end: '2026-11-23' });
    assert.equal(bmStats.networks.Instagram.current, null);
    assert.equal(bmStats.networks.Instagram.status, 'perfil_sem_coleta');

    const glStats = distributeArtistStats(getArtistMediaStats(radar, GUSTTAVO_ID, { end: '2026-11-23', discoveryDb: discovery }), { end: '2026-11-23' });
    assert.equal(glStats.networks.YouTube.current.value, 21900000);
  } finally {
    discovery.close();
    radar.close();
  }
});

test('Consistência de vínculo de identidade e classificação Visão Geral: bloqueia URL como radar_id, repara vínculo legado e padroniza classificação oficial do YouTube', () => {
  const discovery = openDiscovery(':memory:');
  const radar = openDatabase(':memory:');
  try {
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES ('t-pastor-claudio-duarte', 'Pastor Cláudio Duarte', 'person', 0)").run();
    radar.prepare("INSERT INTO talents(id, name, entity_type, blocked) VALUES ('t-bruno-e-marrone', 'Bruno e Marrone', 'organization', 0)").run();

    // 1. suggestRadarId resolve variações canônicas (& <-> e, prefixo Pastor)
    assert.equal(suggestRadarId(radar, 'Bruno & Marrone'), 't-bruno-e-marrone');
    assert.equal(suggestRadarId(radar, 'Cláudio Duarte'), 't-pastor-claudio-duarte');

    configureSource(discovery, {
      id: 'wikidata-cc0',
      kind: 'licensed-file',
      authorization: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
      history_allowed: false,
      enabled: true
    });
    ingest(discovery, 'wikidata-cc0', [
      {
        name: 'Cláudio Duarte',
        external_id: 'Q113486349',
        evidence_url: 'https://www.wikidata.org/wiki/Q113486349',
        profiles: [{ network: 'Spotify', url: 'https://open.spotify.com/artist/1234567890123456789012' }]
      }
    ]);
    const cdId = listCandidates(discovery)[0].id;

    // 2. review rejeita URL colada acidentalmente no campo radarId
    assert.throws(
      () =>
        review(discovery, cdId, {
          approve: true,
          reviewer: 'admin',
          evidence: 'https://www.wikidata.org/wiki/Q113486349',
          radarId: 'https://www.wikidata.org/wiki/Q113486349'
        }),
      /ID Radar inválido/
    );

    // 3. Simula registro legado em que uma URL estava gravada em radar_id e verifica reparo automático
    discovery.prepare("UPDATE candidates SET status = 'approved', radar_id = 'https://www.wikidata.org/wiki/Q113486349' WHERE id = ?").run(cdId);
    quarantineUnverifiedRadarMetrics(radar, discovery);
    assert.equal(detail(discovery, cdId).radar_id, 't-pastor-claudio-duarte');
  } finally {
    discovery.close();
    radar.close();
  }
});

