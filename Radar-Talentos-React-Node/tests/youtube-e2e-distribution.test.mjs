import test from 'node:test';
import assert from 'node:assert/strict';
import { openDiscovery, configureSource, ingest, listCandidates, detail, review, publishIdentityOnly } from '../server/src/discovery/engine.mjs';
import { collectYoutube, confirmYoutube } from '../server/src/discovery/youtube-current.mjs';
import { currentDashboard } from '../server/src/discovery/current-dashboard.mjs';
import { openDatabase } from '../server/src/database/index.mjs';
import { distributeVerifiedDiscoveryToRadar, getArtistMediaStats, getCrossMenuSummary } from '../server/src/menu-integration.mjs';
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
