import { createHash } from 'node:crypto';
import { addOpenProfile, confirmOpenProfile, recordOpenMetric, openCurrent, purgeOpen } from './open-social.mjs';
import { suggestRadarId, purgeBulkSuggestions, prospectYoutubeBulk } from './youtube-bulk.mjs';
import { addYoutubeProfile, confirmYoutube, collectYoutube, youtubeCurrent, searchYoutube, purgeYoutube } from './youtube-current.mjs';
import { globalSearch, saveWikidata, saveMusicBrainz, FREE_MOTOR_CAPABILITIES } from './global-search.mjs';
import { openDiscovery, listCandidates, detail, review, discover, publish, publishIdentityOnly, recordAuthorizedObservation, enrich } from './engine.mjs';
import { importNationalCsv, importRegionalCsv } from './csv-import.mjs';
import { syncAllMenusData, distributeVerifiedDiscoveryToRadar, importOfficialAgenda, EXECUTION_PLAN_8_STEPS, formatCompactPtBr } from '../menu-integration.mjs';
import { upsertMetricCurrent, recordAccountCollectionStatus } from '../registry.mjs';
import { authenticate } from '../security.mjs';
import { importCommercial } from '../commercial.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');

const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function body(req, maxBytes = 65536) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw Error('JSON obrigatório');
  let n = 0;
  const parts = [];
  for await (const chunk of req) {
    n += chunk.length;
    if (n > maxBytes) throw Error('Limite de requisição');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

async function autoCollectSpotifyForCandidate(radar, targetRadarId, profiles, evidenceFallback, fetcher = fetch) {
  if (!radar || !targetRadarId) return 0;
  const spProfiles = (profiles || []).filter(p => p.network === 'Spotify');
  if (!spProfiles.length) return 0;
  const spSource = 'Spotify Web Player API / initialState';
  const nowIso = new Date().toISOString();
  const dayStr = nowIso.slice(0, 10);
  let collected = 0;

  radar.prepare("INSERT OR IGNORE INTO network_metrics(network,metric) VALUES('Spotify','followers')").run();
  radar.prepare("INSERT OR IGNORE INTO network_metrics(network,metric) VALUES('Spotify','monthly_listeners')").run();

  for (const p of spProfiles) {
    const m = /\/artist\/([A-Za-z0-9]{22})$/.exec(p.url);
    if (!m) continue;
    const spId = m[1];
    const spUrl = `https://open.spotify.com/artist/${spId}`;
    const evUrl = `https://open.spotify.com/embed/artist/${spId}`;
    try {
      const res = await fetcher(spUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      if (!res?.ok) continue;
      const html = await res.text();
      const mState = /<script id="initialState"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
      if (!mState) continue;
      const parsed = JSON.parse(Buffer.from(mState[1].trim(), 'base64').toString('utf8'));
      const ent = parsed?.entities?.items?.[`spotify:artist:${spId}`];
      if (!ent?.stats) continue;

      const commAcc = radar.prepare("SELECT id FROM commercial_accounts WHERE talent_id=? AND network='Spotify'").get(targetRadarId);
      const socAcc = radar.prepare("SELECT id FROM social_accounts WHERE talent_id=? AND network='Spotify'").get(targetRadarId);
      const accId = commAcc?.id || socAcc?.id || `${targetRadarId}-sp`;
      const idSrc = evidenceFallback || spUrl;

      radar.prepare(
        'INSERT INTO social_accounts(id,talent_id,network,url,external_id,identity_confirmed,identity_source,collection_state) VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url, external_id=excluded.external_id, identity_confirmed=1, identity_source=excluded.identity_source'
      ).run(accId, targetRadarId, 'Spotify', spUrl, spId, idSrc, 'collected');
      if (commAcc) {
        radar.prepare('UPDATE commercial_accounts SET url=?, identity_source=? WHERE id=?').run(spUrl, idSrc, accId);
      } else {
        radar.prepare('INSERT INTO commercial_accounts(id,talent_id,network,url,identity_source) VALUES(?,?,?,?,?)').run(accId, targetRadarId, 'Spotify', spUrl, idSrc);
      }

      for (const [metric, val] of [
        ['monthly_listeners', ent.stats.monthlyListeners],
        ['followers', ent.stats.followers]
      ]) {
        if (!Number.isSafeInteger(val) || val < 0) continue;
        radar.prepare(
          'INSERT INTO commercial_snapshots(account_id,metric,observed_on,value,source,authorization_ref) VALUES(?,?,?,?,?,?) ON CONFLICT(account_id,metric,observed_on) DO UPDATE SET value=excluded.value,source=excluded.source,authorization_ref=excluded.authorization_ref'
        ).run(accId, metric, dayStr, val, spSource, evUrl);
        radar.prepare(
          'INSERT INTO metric_snapshots(account_id,network,metric,observed_on,value,source,collected_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,metric,observed_on) DO UPDATE SET value=excluded.value,source=excluded.source,collected_at=excluded.collected_at'
        ).run(accId, 'Spotify', metric, dayStr, val, spSource, nowIso);
        radar.prepare(
          'INSERT INTO media_metric_series(talent_id,network,metric,observed_on,value,source,source_type,evidence_url,collected_at,methodology) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(talent_id,network,metric,observed_on,source) DO UPDATE SET value=excluded.value,source_type=excluded.source_type,evidence_url=excluded.evidence_url,collected_at=excluded.collected_at,methodology=excluded.methodology'
        ).run(targetRadarId, 'Spotify', metric, dayStr, val, spSource, 'oficial', evUrl, nowIso, 'Spotify Web Player initialState JSON oficial');
        upsertMetricCurrent(radar, {
          account_id: accId,
          talent_id: targetRadarId,
          network: 'Spotify',
          metric,
          value: val,
          observed_on: dayStr,
          collected_at: nowIso,
          source: spSource,
          status: 'available',
          status_detail: `${spSource} (${formatCompactPtBr(val)})`
        });
      }

      const discog = ent.discography || {};
      const topTracks = (discog.topTracks?.items || []).slice(0, 5).map(item => ({
        title: item.track?.name || 'Faixa',
        streams: Number.isSafeInteger(Number(item.track?.playcount)) ? Number(item.track.playcount) : null
      }));
      radar.prepare(
        'INSERT INTO spotify_repertoire(talent_id,albums_count,singles_count,latest_release_title,latest_release_date,top_tracks_json,source,source_type,evidence_url,observed_on,collected_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(talent_id) DO UPDATE SET albums_count=excluded.albums_count,singles_count=excluded.singles_count,latest_release_title=excluded.latest_release_title,latest_release_date=excluded.latest_release_date,top_tracks_json=excluded.top_tracks_json,source=excluded.source,source_type=excluded.source_type,evidence_url=excluded.evidence_url,observed_on=excluded.observed_on,collected_at=excluded.collected_at'
      ).run(
        targetRadarId,
        discog.popularReleasesAlbums?.items?.length ?? null,
        null,
        discog.latest?.name || null,
        discog.latest?.date?.year ? String(discog.latest.date.year) : null,
        JSON.stringify(topTracks),
        spSource,
        'oficial',
        evUrl,
        dayStr,
        nowIso
      );
      recordAccountCollectionStatus(radar, accId, 'succeeded', null, nowIso);
      collected++;
    } catch {}
  }
  return collected;
}

export async function approveAndSendToRadar(db, radar, payload = {}, { reviewer = 'admin', fetcher = fetch } = {}) {
  if (!radar) throw Error('Banco Radar indisponível');
  let candidateId = payload.id || null;
  if (!candidateId && payload.source === 'wikidata' && payload.external_id) {
    const saved = await saveWikidata(db, payload.external_id, { fetcher });
    candidateId = saved.id;
  } else if (!candidateId && payload.source === 'musicbrainz' && payload.external_id) {
    const saved = await saveMusicBrainz(db, payload.external_id, { fetcher });
    candidateId = saved.id;
  }
  if (!candidateId) throw Error('Candidato obrigatório para aprovação');

  let c = detail(db, candidateId);
  const autoEv =
    payload.evidence && String(payload.evidence).trim().startsWith('https://')
      ? String(payload.evidence).trim()
      : c.identity_evidence ||
        c.evidence.find(e => e.source_id === 'wikidata-cc0')?.url ||
        c.evidence[0]?.url ||
        c.profiles[0]?.url ||
        'https://www.wikidata.org';

  if (Array.isArray(payload.extraProfiles)) {
    for (const ep of payload.extraProfiles) {
      if (!ep?.network || !ep?.url) continue;
      try {
        if (ep.network === 'YouTube' && /^https:\/\/(www\.)?youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/.test(ep.url)) {
          const cleanYt = ep.url.replace('https://www.', 'https://');
          if (!c.profiles.some(x => x.url === cleanYt)) {
            addYoutubeProfile(db, candidateId, { url: cleanYt, evidence: autoEv });
          }
        }
      } catch {}
    }
    c = detail(db, candidateId);
  }

  const rawRadarId = payload.radarId && !String(payload.radarId).includes('://') ? String(payload.radarId).trim() : null;
  const resolvedRadarId =
    rawRadarId ||
    (c.radar_id && !String(c.radar_id).includes('://') ? c.radar_id : null) ||
    suggestRadarId(radar, c.name) ||
    null;

  if (c.status !== 'published') {
    review(db, candidateId, {
      approve: true,
      reviewer,
      evidence: autoEv,
      radarId: resolvedRadarId
    });
  } else if (resolvedRadarId && c.radar_id !== resolvedRadarId) {
    db.prepare('UPDATE candidates SET radar_id=? WHERE id=?').run(resolvedRadarId, candidateId);
  }

  c = detail(db, candidateId);
  let pubResult;
  try {
    pubResult = publishIdentityOnly(db, radar, candidateId);
  } catch {
    pubResult = publish(db, radar, candidateId, importCommercial);
  }

  c = detail(db, candidateId);
  const targetRadarId = c.radar_id || pubResult?.radarId;

  // Confirma automaticamente todos os perfis trazidos na busca para este candidato aprovado pelo operador
  for (const p of c.profiles) {
    if (p.network === 'YouTube' && /^https:\/\/youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/.test(p.url)) {
      try {
        confirmYoutube(db, candidateId, p.id, { evidence: autoEv, reviewer });
      } catch {}
    } else if (['Instagram', 'Spotify', 'TikTok'].includes(p.network)) {
      try {
        const indepEv =
          new URL(autoEv).hostname.replace(/^www\./, '') !== new URL(p.url).hostname.replace(/^www\./, '')
            ? autoEv
            : `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(c.name)}`;
        confirmOpenProfile(db, candidateId, { profileId: p.id, evidence: indepEv, attested: true });
      } catch {}
    }
  }

  // Coleta oficial imediata do YouTube e do Spotify para tudo que veio na busca
  let youtubeCollected = 0;
  try {
    const ytRes = await collectYoutube(db, { candidateId, force: true, fetcher });
    youtubeCollected = ytRes.collected || 0;
  } catch {}

  const spotifyCollected = await autoCollectSpotifyForCandidate(radar, targetRadarId, c.profiles, autoEv, fetcher);
  const dist = distributeVerifiedDiscoveryToRadar(radar, db);

  return {
    ok: true,
    id: candidateId,
    name: c.name,
    radarId: targetRadarId,
    status: 'published',
    profilesLinked: c.profiles.length,
    youtubeCollected,
    spotifyCollected,
    distributed: dist.distributed
  };
}

let busy = false;

// Anexar antes do filtro de métodos da aplicação atual. Não aceita autenticação ausente.
export async function handleDiscovery(req, res, { radar, security } = {}) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/discovery/')) return false;
  if ((!security && !radar) || !authenticate(req, security)) {
    send(res, 401, { error: 'Acesso administrativo obrigatório' });
    return true;
  }
  if (!['GET', 'POST'].includes(req.method)) {
    send(res, 405, { error: 'Método não permitido' });
    return true;
  }
  if (req.method === 'POST') {
    let same = false;
    try {
      const origin = new URL(req.headers.origin);
      same = ['https:', 'http:'].includes(origin.protocol) && origin.host === req.headers.host;
    } catch {}
    if (!same || req.headers['x-radar-action'] !== 'discovery') {
      send(res, 403, { error: 'Origem não autorizada' });
      return true;
    }
  }
  let db;
  try {
    db = openDiscovery();
    purgeYoutube(db);
    purgeOpen(db);
    purgeBulkSuggestions(db);
    const action = url.pathname.slice('/api/discovery/'.length);
    if (req.method === 'GET') {
      if (action === 'status') {
        const dc = (t, w = '') => db.prepare(`SELECT count(*) n FROM ${t} ${w}`).get().n;
        const ytObs = dc('observations o JOIN profiles p ON p.id=o.profile_id', "WHERE p.network='YouTube'");
        const openObs = dc('observations', "WHERE source_id='open-social-current'");
        const cands = listCandidates(db);
        const rc = (t, w = '') => (radar ? radar.prepare(`SELECT count(*) n FROM ${t} ${w}`).get().n : 0);
        const funnel = {
          searched: Math.max(cands.length, dc('collection_jobs')),
          confirmed: cands.filter(c => ['approved', 'published'].includes(c.status)).length,
          collected: rc('metric_current', 'WHERE value IS NOT NULL'),
          distributed: rc('media_metric_series')
        };
        send(res, 200, {
          sources: db.prepare('SELECT id,kind,enabled,history_allowed FROM sources').all(),
          candidates: cands,
          logs: db.prepare('SELECT * FROM collection_logs ORDER BY at DESC LIMIT 30').all(),
          providers: {
            youtube: { configured: Boolean(process.env.YOUTUBE_API_KEY && String(process.env.YOUTUBE_API_KEY).trim()) },
            brave: { configured: Boolean(process.env.BRAVE_SEARCH_API_KEY && String(process.env.BRAVE_SEARCH_API_KEY).trim()) },
            wikidata: { configured: true },
            musicbrainz: { configured: true }
          },
          counts: {
            candidates: dc('candidates'),
            profiles: dc('profiles'),
            observations: dc('observations'),
            youtube_observations: ytObs,
            open_social_observations: openObs
          },
          funnel,
          capabilities: FREE_MOTOR_CAPABILITIES,
          executionPlan: EXECUTION_PLAN_8_STEPS
        });
      } else if (action === 'detail') {
        const id = url.searchParams.get('id');
        const c = detail(db, id);
        send(res, 200, {
          ...c,
          suggestedRadarId: radar ? suggestRadarId(radar, c.name) : null,
          observations: c.observations.filter(o => !['youtube-public-current', 'open-social-current'].includes(o.source_id)),
          youtube: youtubeCurrent(db, id),
          openSocial: openCurrent(db, id)
        });
      } else {
        send(res, 404, { error: 'Rota inexistente' });
      }
      return true;
    }

    const v = await body(req);
    if (busy) {
      send(res, 409, { error: 'Operação em andamento' });
      return true;
    }
    busy = true;
    try {
      let result;
      if (action === 'approve-and-send') {
        result = await approveAndSendToRadar(db, radar, v, { reviewer: security?.username ?? 'admin' });
      } else if (action === 'open-add') {
        result = addOpenProfile(db, v.id, v);
      } else if (action === 'open-confirm') {
        result = confirmOpenProfile(db, v.id, v);
        if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'open-record') {
        result = recordOpenMetric(db, v.id, v);
        if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'youtube-bulk') {
        if (!radar) throw Error('Banco Radar indisponível');
        const lim = Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= 20 ? v.limit : 5;
        result = { bulk: await prospectYoutubeBulk(db, radar, { limit: lim }) };
      } else if (action === 'youtube-search') {
        result = { channels: await searchYoutube(v.query) };
      } else if (action === 'youtube-add') {
        result = addYoutubeProfile(db, v.id, v);
      } else if (action === 'youtube-confirm') {
        result = confirmYoutube(db, v.id, v.profileId, { evidence: v.evidence, reviewer: security?.username ?? 'admin' });
        if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'youtube-collect') {
        if (typeof v.id !== 'string' || !v.id) throw Error('Candidato obrigatório');
        result = await collectYoutube(db, { candidateId: v.id, force: true });
        if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'youtube-collect-all') {
        result = await collectYoutube(db, { force: Boolean(v.force) });
        if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'global-search') {
        result = await globalSearch(db, radar, v.query, { includeMusicBrainzLive: Boolean(v.includeMusicBrainzLive) });
      } else if (action === 'global-save') {
        result = await saveWikidata(db, v.id);
      } else if (action === 'musicbrainz-save') {
        result = await saveMusicBrainz(db, v.id);
      } else if (action === 'search') {
        const s = db.prepare('SELECT kind FROM sources WHERE id=?').get(v.source);
        result = await discover(db, v.source, v.query, {
          key: s?.kind === 'youtube' ? process.env.YOUTUBE_API_KEY : process.env.TICKETMASTER_API_KEY
        });
      } else if (action === 'review') {
        const c = detail(db, v.id);
        const ev =
          v.evidence && String(v.evidence).trim()
            ? v.evidence
            : c.identity_evidence || c.evidence[0]?.url || c.profiles[0]?.url || 'https://www.wikidata.org';
        const rId =
          v.radarId && !String(v.radarId).includes('://')
            ? v.radarId
            : (c.radar_id && !String(c.radar_id).includes('://') ? c.radar_id : null) || (radar ? suggestRadarId(radar, c.name) : null);
        review(db, v.id, { approve: v.approve, reviewer: security?.username ?? 'admin', evidence: ev, radarId: rId || null });
        result = { ok: true };
      } else if (action === 'enrich') {
        result = { profile: enrich(db, v.id, v.source, v) };
      } else if (action === 'observe') {
        result = recordAuthorizedObservation(db, v.id, v);
        if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'publish') {
        if (!radar) throw Error('Banco Radar indisponível');
        result = v.identityOnly === true ? publishIdentityOnly(db, radar, v.id) : publish(db, radar, v.id, importCommercial);
        distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'publish-identity') {
        if (!radar) throw Error('Banco Radar indisponível');
        result = publishIdentityOnly(db, radar, v.id);
        distributeVerifiedDiscoveryToRadar(radar, db);
      } else if (action === 'import-csv') {
        if (!radar) throw Error('Banco Radar indisponível');
        result =
          v.mode === 'regional'
            ? importRegionalCsv(radar, v.csv, { authorization_ref: v.authorization_ref, report_ref: v.report_ref, coverage: v.coverage })
            : importNationalCsv(radar, v.csv, {
                authorization_ref: v.authorization_ref,
                default_day: v.default_day,
                default_source: v.default_source
              });
      } else if (action === 'sync-menus') {
        if (!radar) throw Error('Banco Radar indisponível');
        result = syncAllMenusData(radar, db);
      } else if (action === 'import-agenda') {
        if (!radar) throw Error('Banco Radar indisponível');
        result = importOfficialAgenda(radar, v);
      } else {
        send(res, 404, { error: 'Rota inexistente' });
        return true;
      }
      send(res, 200, result);
    } finally {
      busy = false;
    }
    return true;
  } catch {
    send(res, 400, { error: 'Operação recusada. Confira fonte, identificação, evidências, autorização e logs no servidor.' });
    return true;
  } finally {
    db?.close();
  }
}
