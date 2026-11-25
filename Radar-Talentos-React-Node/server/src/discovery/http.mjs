import { createHash } from 'node:crypto';
import { addOpenProfile, confirmOpenProfile, openConfirmed, recordOpenMetric, openCurrent, purgeOpen } from './open-social.mjs';
import { suggestRadarId, purgeBulkSuggestions, prospectYoutubeBulk } from './youtube-bulk.mjs';
import { addYoutubeProfile, confirmYoutube, confirmedYoutube, collectYoutube, youtubeCurrent, searchYoutube, purgeYoutube } from './youtube-current.mjs';
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

function slugifyTalentId(name) {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return 't-' + (slug || 'novo-talento');
}

function inferAndAttachCategory(radar, talentId, description = '', sourceHint = '') {
  if (!radar || !talentId) return;
  try {
    const hasCat = radar.prepare('SELECT 1 FROM talent_categories WHERE talent_id = ? LIMIT 1').get(talentId);
    if (hasCat) return;
    const text = `${description || ''} ${sourceHint || ''}`.toLowerCase();
    let catName = 'Cantores';
    if (/humorist|comediant|comedian|stand-up/.test(text)) catName = 'Humoristas';
    else if (/palestrant|speaker|escritor|filósofo|filosofo|historiador|economista|mentor|pastor|padre/.test(text)) catName = 'Palestrantes';
    else if (/influenciador|influencer|youtuber|streamer|criador|tiktoker|apresentador/.test(text)) catName = 'Influenciadores';
    else if (/chef|cozinheir|gastronomia|culinária|culinaria/.test(text)) catName = 'Gastronomia';
    else if (/infantil|criança|crianca|children/.test(text)) catName = 'Infantil e família';
    else if (/teatro|musical|peça|peca|dramaturg/.test(text)) catName = 'Peças de teatro e musicais';
    else if (/ator|atriz|actor|actress|artista plástico|muralista/.test(text)) catName = 'Artistas';
    const catRow =
      radar.prepare('SELECT id FROM categories WHERE lower(name) = lower(?) LIMIT 1').get(catName) ||
      radar.prepare('SELECT id FROM categories ORDER BY id ASC LIMIT 1').get();
    if (catRow?.id != null) {
      radar.prepare('INSERT OR IGNORE INTO talent_categories(talent_id, category_id) VALUES (?, ?)').run(talentId, catRow.id);
    }
    const modRow = radar.prepare("SELECT id FROM modalities WHERE id = 'shows' OR lower(name) LIKE '%show%' LIMIT 1").get();
    if (modRow?.id) {
      radar.prepare('INSERT OR IGNORE INTO talent_modalities(talent_id, modality_id) VALUES (?, ?)').run(talentId, modRow.id);
    }
  } catch {}
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
  } else if (!candidateId && payload.name && String(payload.name).trim().length >= 2) {
    // Talento emergente ou novo artista pesquisado diretamente no Motor de Dados
    const cleanName = String(payload.name).trim().slice(0, 140);
    const existingCand = db.prepare('SELECT id FROM candidates WHERE lower(trim(name))=lower(trim(?))').get(cleanName);
    if (existingCand) {
      candidateId = existingCand.id;
    } else {
      const evFallback =
        payload.evidence && String(payload.evidence).trim().startsWith('https://')
          ? String(payload.evidence).trim()
          : (Array.isArray(payload.extraProfiles) && payload.extraProfiles[0]?.url) ||
            `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(cleanName)}`;
      const srcId = 'emerging-direct-discovery';
      db.prepare(
        "INSERT INTO sources VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=1"
      ).run(srcId, 'licensed-file', 'Prospecção direta de talento com perfil oficial', 1, 1);
      const newCandId = hash(srcId + '\0' + cleanName.toLowerCase());
      const stamp = new Date().toISOString();
      db.prepare('INSERT OR IGNORE INTO candidates(id,name,created_at) VALUES(?,?,?)').run(newCandId, cleanName, stamp);
      db.prepare('INSERT OR IGNORE INTO evidence VALUES(?,?,?,?,?)').run(hash(newCandId + evFallback), newCandId, srcId, evFallback, stamp);
      candidateId = newCandId;
    }
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
        `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(c.name)}`;

  // Incorpora perfis extras (YouTube, Spotify, Instagram, TikTok) diretamente na ficha do candidato antes da revisão
  if (Array.isArray(payload.extraProfiles)) {
    const directSrc = 'emerging-direct-discovery';
    db.prepare(
      "INSERT INTO sources VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=1"
    ).run(directSrc, 'licensed-file', 'Prospecção direta de talento com perfil oficial', 1, 1);
    for (const ep of payload.extraProfiles) {
      if (!ep?.network || !ep?.url) continue;
      try {
        if (ep.network === 'YouTube' && /^https:\/\/(www\.)?youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/.test(ep.url)) {
          const cleanYt = ep.url.replace('https://www.', 'https://');
          if (!c.profiles.some(x => x.url === cleanYt)) {
            try {
              addYoutubeProfile(db, candidateId, { url: cleanYt, evidence: autoEv });
            } catch {
              const pid = hash('YouTube\0' + cleanYt);
              db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?)').run(pid, candidateId, 'YouTube', cleanYt, directSrc);
            }
          }
        } else if (['Instagram', 'Spotify', 'TikTok'].includes(ep.network) && String(ep.url).startsWith('https://')) {
          const cleanSocial = String(ep.url).replace('https://www.', 'https://').replace(/\/$/, '');
          if (!c.profiles.some(x => x.url === cleanSocial)) {
            try {
              enrich(db, candidateId, directSrc, { network: ep.network, url: cleanSocial, evidence_url: autoEv });
            } catch {
              const pid = hash(ep.network + '\0' + cleanSocial);
              db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?)').run(pid, candidateId, ep.network, cleanSocial, directSrc);
            }
          }
        }
      } catch {}
    }
    c = detail(db, candidateId);
  }

  const rawRadarId = payload.radarId && !String(payload.radarId).includes('://') ? String(payload.radarId).trim() : null;
  let resolvedRadarId =
    rawRadarId ||
    (c.radar_id && !String(c.radar_id).includes('://') ? c.radar_id : null) ||
    suggestRadarId(radar, c.name) ||
    null;

  // Se o talento ainda não existe na tabela talents do Radar, cria imediatamente para atualizar o contador global (ex.: 103 -> 104)
  if (!resolvedRadarId) {
    const baseId = slugifyTalentId(c.name);
    const collision = radar.prepare('SELECT id, name FROM talents WHERE id = ?').get(baseId);
    resolvedRadarId = collision && collision.name.toLowerCase() !== c.name.toLowerCase() ? `${baseId}-${candidateId.slice(0, 6)}` : baseId;
  }
  const existingTalent = radar.prepare('SELECT id, name FROM talents WHERE id = ?').get(resolvedRadarId);
  if (!existingTalent) {
    radar.prepare("INSERT OR IGNORE INTO talents(id, name, entity_type, blocked) VALUES (?, ?, 'person', 0)").run(resolvedRadarId, c.name);
  }
  inferAndAttachCategory(radar, resolvedRadarId, payload.description || '', payload.source || '');
  try {
    const qidMatch = /wikidata\.org\/wiki\/(Q\d+)/i.exec(autoEv);
    const mbMatch = /musicbrainz\.org\/artist\/([0-9a-f-]{36})/i.exec(autoEv);
    radar
      .prepare(
        `INSERT INTO talent_metadata(talent_id, wikidata_id, musicbrainz_id, description, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(talent_id) DO UPDATE SET
           wikidata_id = COALESCE(excluded.wikidata_id, talent_metadata.wikidata_id),
           musicbrainz_id = COALESCE(excluded.musicbrainz_id, talent_metadata.musicbrainz_id),
           description = CASE WHEN excluded.description != '' THEN excluded.description ELSE talent_metadata.description END,
           updated_at = excluded.updated_at`
      )
      .run(
        resolvedRadarId,
        payload.source === 'wikidata' ? payload.external_id : qidMatch?.[1] || null,
        payload.source === 'musicbrainz' ? payload.external_id : mbMatch?.[1] || null,
        String(payload.description || '').slice(0, 400),
        new Date().toISOString()
      );
  } catch {}

  let targetRadarId = resolvedRadarId;
  if (c.profiles.length > 0) {
    if (c.status !== 'published') {
      try {
        review(db, candidateId, {
          approve: true,
          reviewer,
          evidence: autoEv,
          radarId: resolvedRadarId
        });
      } catch {}
    } else if (resolvedRadarId && c.radar_id !== resolvedRadarId) {
      db.prepare('UPDATE candidates SET radar_id=? WHERE id=?').run(resolvedRadarId, candidateId);
    }

    c = detail(db, candidateId);
    let pubResult;
    try {
      pubResult = publishIdentityOnly(db, radar, candidateId);
    } catch {
      try {
        pubResult = publish(db, radar, candidateId, importCommercial);
      } catch {}
    }
    c = detail(db, candidateId);
    targetRadarId = c.radar_id || pubResult?.radarId || resolvedRadarId;
  } else {
    // Mesmo que ainda não haja URL de rede social no Wikidata, incorpora o artista aprovado ao Radar e atualiza os contadores
    const stamp = new Date().toISOString();
    db.prepare(
      "UPDATE candidates SET status='published', reviewer=?, identity_evidence=?, reviewed_at=?, radar_id=? WHERE id=?"
    ).run(reviewer, autoEv, stamp, resolvedRadarId, candidateId);
    db.prepare(
      'INSERT INTO approved_imports VALUES(?,?,?,0) ON CONFLICT(candidate_id) DO UPDATE SET published_at=excluded.published_at, radar_id=excluded.radar_id'
    ).run(candidateId, resolvedRadarId, stamp);
    c = detail(db, candidateId);
  }

  const allowedConfirmNetworks = Array.isArray(payload.confirmNetworks)
    ? new Set(payload.confirmNetworks.map(n => String(n).trim()))
    : null;

  // Confirma perfis (respeitando seleção individual por plataforma quando informada em confirmNetworks)
  for (const p of c.profiles) {
    if (allowedConfirmNetworks && !allowedConfirmNetworks.has(p.network)) continue;
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

  // Coleta oficial imediata apenas dos perfis devidamente confirmados
  let youtubeCollected = 0;
  try {
    const ytRes = await collectYoutube(db, { candidateId, force: true, fetcher });
    youtubeCollected = ytRes.collected || 0;
  } catch {}

  const confirmedSpotifyProfiles = c.profiles.filter(p => p.network === 'Spotify' && openConfirmed(db, p));
  const spotifyCollected = confirmedSpotifyProfiles.length
    ? await autoCollectSpotifyForCandidate(radar, targetRadarId, confirmedSpotifyProfiles, autoEv, fetcher)
    : 0;
  const dist = distributeVerifiedDiscoveryToRadar(radar, db);
  const totalTalents = radar.prepare('SELECT count(*) n FROM talents WHERE blocked = 0').get().n;

  return {
    ok: true,
    id: candidateId,
    name: c.name,
    radarId: targetRadarId,
    status: 'published',
    totalTalents,
    profilesLinked: c.profiles.length,
    platformValidationMatrix: buildPlatformValidationMatrix(db, detail(db, candidateId)),
    youtubeCollected,
    spotifyCollected,
    distributed: dist.distributed,
    crossPanelSync: {
      overview: true,
      audience: true,
      commercial: true,
      rising: true,
      ficha360Url: `/?talent=${encodeURIComponent(targetRadarId)}`,
      commercialUrl: `/commercial.html?q=${encodeURIComponent(c.name)}`
    }
  };
}

/**
 * Matriz de Validação Individual por Plataforma (YouTube, Spotify, Instagram, TikTok):
 * Somente perfis com confirmed=true alimentam rankings e indicadores comerciais.
 */
export function buildPlatformValidationMatrix(db, candidate) {
  const networks = ['YouTube', 'Spotify', 'Instagram', 'TikTok'];
  const profiles = candidate?.profiles || [];
  return networks.map(network => {
    const p = profiles.find(x => x.network === network) || null;
    if (!p) {
      return {
        network,
        located: false,
        profileId: null,
        url: null,
        source_id: null,
        confirmed: false,
        statusLabel: 'Não localizado',
        feedsCommercialRankings: false
      };
    }
    const isConfirmed = network === 'YouTube' ? confirmedYoutube(db, p) : openConfirmed(db, p);
    return {
      network,
      located: true,
      profileId: p.id,
      url: p.url,
      source_id: p.source_id,
      confirmed: Boolean(isConfirmed),
      statusLabel: isConfirmed ? 'Confirmado por evidências' : 'Aguardando validação',
      feedsCommercialRankings: Boolean(isConfirmed)
    };
  });
}

/**
 * Desfaz uma associação incorreta de perfil de uma plataforma específica e reprocessa
 * todos os indicadores afetados nos painéis do Radar.
 */
export function unlinkProfileAndReprocess(db, radar, { id, profileId, network } = {}) {
  const c = detail(db, id);
  const p = c.profiles.find(x => (profileId && x.id === profileId) || (network && x.network === network));
  if (!p) throw Error('Perfil não encontrado para desassociação');
  const net = p.network;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM observations WHERE profile_id = ?').run(p.id);
    db.prepare('DELETE FROM evidence WHERE candidate_id = ? AND (url = ? OR id = ?)').run(c.id, p.url, hash('open-confirm:' + p.id));
    db.prepare('DELETE FROM profiles WHERE id = ?').run(p.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  let removedFromRadar = 0;
  if (radar && c.radar_id) {
    radar.exec('BEGIN IMMEDIATE');
    try {
      const commAccs = radar.prepare('SELECT id FROM commercial_accounts WHERE talent_id = ? AND network = ?').all(c.radar_id, net);
      for (const acc of commAccs) {
        removedFromRadar += radar.prepare('DELETE FROM commercial_snapshots WHERE account_id = ?').run(acc.id).changes;
        radar.prepare('DELETE FROM metric_current WHERE account_id = ?').run(acc.id);
        radar.prepare('DELETE FROM commercial_accounts WHERE id = ?').run(acc.id);
      }
      const socAccs = radar.prepare('SELECT id FROM social_accounts WHERE talent_id = ? AND network = ?').all(c.radar_id, net);
      for (const acc of socAccs) {
        removedFromRadar += radar.prepare('DELETE FROM metric_snapshots WHERE account_id = ?').run(acc.id).changes;
        radar.prepare('DELETE FROM metric_current WHERE account_id = ?').run(acc.id);
        radar.prepare('DELETE FROM social_accounts WHERE id = ?').run(acc.id);
      }
      removedFromRadar += radar.prepare('DELETE FROM media_metric_series WHERE talent_id = ? AND network = ?').run(c.radar_id, net).changes;
      radar.prepare('DELETE FROM metric_current WHERE talent_id = ? AND network = ?').run(c.radar_id, net);
      radar.prepare('DELETE FROM metric_review_quarantine WHERE talent_id = ? AND network = ?').run(c.radar_id, net);
      radar.exec('COMMIT');
    } catch (e) {
      radar.exec('ROLLBACK');
      throw e;
    }
    distributeVerifiedDiscoveryToRadar(radar, db);
  }

  const updated = detail(db, id);
  return {
    ok: true,
    id,
    unlinkedNetwork: net,
    unlinkedUrl: p.url,
    removedFromRadar,
    platformValidationMatrix: buildPlatformValidationMatrix(db, updated),
    message: `Associação de ${net} (${p.url}) desfeita e indicadores reprocessados em todos os módulos.`
  };
}

/**
 * Confirma individualmente uma única plataforma do candidato, coleta métricas e reprocessa a distribuição.
 */
export async function confirmSinglePlatformAndReprocess(db, radar, { id, profileId, network, evidence } = {}, { reviewer = 'admin', fetcher = fetch } = {}) {
  let c = detail(db, id);
  const p = c.profiles.find(x => (profileId && x.id === profileId) || (network && x.network === network));
  if (!p) throw Error('Perfil não localizado para esta plataforma');
  const autoEv =
    (evidence && String(evidence).trim().startsWith('https://') ? String(evidence).trim() : null) ||
    c.identity_evidence ||
    c.evidence.find(e => e.source_id === 'wikidata-cc0')?.url ||
    c.evidence[0]?.url ||
    `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(c.name)}`;

  if (c.status === 'pending') {
    const resolvedRadarId =
      (c.radar_id && !String(c.radar_id).includes('://') ? c.radar_id : null) ||
      (radar ? suggestRadarId(radar, c.name) : null);
    review(db, id, { approve: true, reviewer, evidence: autoEv, radarId: resolvedRadarId });
    c = detail(db, id);
  }
  if (radar && (!c.radar_id || !db.prepare('SELECT 1 FROM approved_imports WHERE candidate_id=?').get(id))) {
    try {
      publishIdentityOnly(db, radar, id);
    } catch {
      publish(db, radar, id, importCommercial);
    }
    c = detail(db, id);
  }

  if (p.network === 'YouTube') {
    confirmYoutube(db, id, p.id, { evidence: autoEv, reviewer });
    try {
      await collectYoutube(db, { candidateId: id, force: true, fetcher });
    } catch {}
  } else {
    const indepEv =
      new URL(autoEv).hostname.replace(/^www\./, '') !== new URL(p.url).hostname.replace(/^www\./, '')
        ? autoEv
        : `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(c.name)}`;
    confirmOpenProfile(db, id, { profileId: p.id, evidence: indepEv, attested: true });
    if (p.network === 'Spotify' && radar && c.radar_id) {
      await autoCollectSpotifyForCandidate(radar, c.radar_id, [p], indepEv, fetcher);
    }
  }

  if (radar) distributeVerifiedDiscoveryToRadar(radar, db);
  const updated = detail(db, id);
  return {
    ok: true,
    id,
    confirmedNetwork: p.network,
    platformValidationMatrix: buildPlatformValidationMatrix(db, updated),
    message: `Perfil ${p.network} confirmado por evidências e indicadores distribuídos.`
  };
}

/**
 * Ciclo Automático de Prospecção, Aprovação, Coleta e Distribuição Multi-Menu:
 * 1. Aprova, coleta (YouTube + Spotify) e envia ao Radar todos os candidatos pendentes/aprovados na fila.
 * 2. Busca automaticamente no Wikidata + YouTube API v3 + Spotify os talentos do catálogo que ainda
 *    não possuem métricas coletadas, aprovando e distribuindo para Oportunidade Comercial, Visão Geral,
 *    Audiência Geográfica e Talentos Emergentes.
 */
export async function autoDiscoverApproveAndSyncCycle(db, radar, { limit = 6, category = '', talentId = '', force = false, fetcher = fetch } = {}) {
  if (!db || !radar) return { ok: false, processed: 0 };
  const ytBatch = await collectYoutube(db, { force: Boolean(force), fetcher }).catch(() => ({ collected: 0 }));
  let ytExtra = 0;
  let spExtra = 0;
  let pendingApproved = 0;
  const refreshedNames = [];

  // Etapa 1: Aprova e distribui automaticamente todos os candidatos pendentes na fila do Discovery (incorporando novos talentos ao Radar)
  const pendingCands = db
    .prepare(
      `SELECT c.id, c.name, c.radar_id
       FROM candidates c
       WHERE c.status IN ('pending', 'approved')
       ORDER BY c.created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Number(limit) || 6));

  for (const pc of pendingCands) {
    try {
      const ap = await approveAndSendToRadar(
        db,
        radar,
        { id: pc.id, radarId: pc.radar_id || suggestRadarId(radar, pc.name) || null },
        { reviewer: 'auto-engine', fetcher }
      );
      pendingApproved++;
      ytExtra += ap.youtubeCollected || 0;
      spExtra += ap.spotifyCollected || 0;
      if (!refreshedNames.includes(ap.name)) refreshedNames.push(ap.name);
    } catch {}
  }

  // Etapa 2: Prospecção automática dos talentos do catálogo sem métrica verificada
  const catFilter = typeof category === 'string' ? category.trim() : '';
  const talentFilter = typeof talentId === 'string' ? talentId.trim() : '';
  const candidatesToEnrich = radar
    .prepare(
      `SELECT t.id, t.name
       FROM talents t
       WHERE t.blocked = 0
         AND (? = '' OR t.id = ?)
         AND (? = '' OR EXISTS (
           SELECT 1 FROM talent_categories tc
           JOIN categories c ON c.id = tc.category_id
           WHERE tc.talent_id = t.id AND lower(c.name) = lower(?)
         ))
         AND (
           NOT EXISTS (SELECT 1 FROM metric_current mc WHERE mc.talent_id = t.id AND mc.value IS NOT NULL)
           OR NOT EXISTS (SELECT 1 FROM metric_current mc WHERE mc.talent_id = t.id AND mc.network = 'Spotify' AND mc.value IS NOT NULL)
           OR NOT EXISTS (SELECT 1 FROM metric_current mc WHERE mc.talent_id = t.id AND mc.network = 'YouTube' AND mc.value >= 1000)
         )
       ORDER BY
         CASE WHEN EXISTS (SELECT 1 FROM metric_current mc WHERE mc.talent_id = t.id AND mc.value IS NOT NULL) THEN 1 ELSE 0 END ASC,
         t.name ASC
       LIMIT ?`
    )
    .all(talentFilter, talentFilter, catFilter, catFilter, Math.max(1, Number(limit) || 6));

  for (const tal of candidatesToEnrich) {
    try {
      const gSearch = await globalSearch(db, radar, tal.name, { includeMusicBrainzLive: false, fetcher }).catch(() => null);
      const ext = gSearch?.external?.[0] || null;
      const extraProfiles = [];
      if (process.env.YOUTUBE_API_KEY) {
        const ytChans = await searchYoutube(tal.name, { fetcher }).catch(() => []);
        if (ytChans?.[0]?.url) {
          extraProfiles.push({ network: 'YouTube', url: ytChans[0].url });
        }
      }
      const spComm = radar.prepare("SELECT url FROM commercial_accounts WHERE talent_id = ? AND network = 'Spotify' LIMIT 1").get(tal.id);
      if (spComm?.url && /^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]{22}$/.test(spComm.url)) {
        extraProfiles.push({ network: 'Spotify', url: spComm.url });
      }
      if (ext?.external_id) {
        const ap = await approveAndSendToRadar(
          db,
          radar,
          {
            source: ext.source || 'wikidata',
            external_id: ext.external_id,
            radarId: tal.id,
            extraProfiles
          },
          { reviewer: 'auto-engine', fetcher }
        );
        ytExtra += ap.youtubeCollected || 0;
        spExtra += ap.spotifyCollected || 0;
        if ((ap.youtubeCollected || 0) + (ap.spotifyCollected || 0) > 0 && !refreshedNames.includes(tal.name)) {
          refreshedNames.push(tal.name);
        }
      } else if (extraProfiles.length) {
        const ap = await approveAndSendToRadar(
          db,
          radar,
          {
            name: tal.name,
            radarId: tal.id,
            evidence: extraProfiles[0].url,
            extraProfiles
          },
          { reviewer: 'auto-engine', fetcher }
        );
        ytExtra += ap.youtubeCollected || 0;
        spExtra += ap.spotifyCollected || 0;
        if ((ap.youtubeCollected || 0) + (ap.spotifyCollected || 0) > 0 && !refreshedNames.includes(tal.name)) {
          refreshedNames.push(tal.name);
        }
      }
    } catch {}
  }

  const dist = distributeVerifiedDiscoveryToRadar(radar, db);
  const totalTalents = radar.prepare('SELECT count(*) n FROM talents WHERE blocked = 0').get().n;
  const totalWithMetrics = radar.prepare('SELECT count(DISTINCT talent_id) n FROM metric_current WHERE value IS NOT NULL').get().n;
  const totalMetrics = radar.prepare('SELECT count(*) n FROM metric_current WHERE value IS NOT NULL').get().n;

  return {
    ok: true,
    status: 'completed',
    processed: pendingApproved + candidatesToEnrich.length,
    approvedAndPublished: pendingApproved + refreshedNames.length,
    pendingApproved,
    collected: (ytBatch.collected || 0) + ytExtra + spExtra,
    youtubeCollected: (ytBatch.collected || 0) + ytExtra,
    spotifyCollected: spExtra,
    distributed: dist.distributed,
    refreshedNames,
    totalTalents,
    totalWithMetrics,
    remainingPendingTalents: Math.max(0, totalTalents - totalWithMetrics),
    totalMetrics
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
          searched: Math.max(rc('talents', 'WHERE blocked=0'), cands.length, dc('collection_jobs')),
          confirmed: Math.max(rc('talents', 'WHERE blocked=0'), cands.filter(c => ['approved', 'published'].includes(c.status)).length),
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
          platformValidationMatrix: buildPlatformValidationMatrix(db, c),
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
      } else if (action === 'unlink-profile') {
        result = unlinkProfileAndReprocess(db, radar, v);
      } else if (action === 'confirm-platform') {
        result = await confirmSinglePlatformAndReprocess(db, radar, v, { reviewer: security?.username ?? 'admin' });
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
      } else if (action === 'youtube-collect-all' || action === 'collect-all' || action === 'refresh-catalog' || action === 'auto-pipeline') {
        const lim = Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= 30 ? v.limit : 8;
        result = await autoDiscoverApproveAndSyncCycle(db, radar, {
          limit: lim,
          category: v.category || '',
          talentId: v.talentId || '',
          force: Boolean(v.force)
        });
      } else if (action === 'global-search') {
        result = await globalSearch(db, radar, v.query, { includeMusicBrainzLive: Boolean(v.includeMusicBrainzLive) });
        // Se autoApprove estiver ativo, já aprova, cadastra em talents, coleta YouTube + Spotify e distribui automaticamente para todos os menus
        if (Boolean(v.autoApprove) && radar) {
          const extraYt = Array.isArray(result.youtubeChannels) && result.youtubeChannels.length ? [result.youtubeChannels[0]] : [];
          const cvProfiles = Array.isArray(result.crossValidation?.profiles) ? result.crossValidation.profiles : [];
          const mergedExtras = [...extraYt, ...cvProfiles];
          const bestExt = result.external?.find(e => e.profiles?.length > 0) || result.external?.[0] || null;
          const bestMb = result.musicbrainz?.find(m => m.profiles?.length > 0) || result.musicbrainz?.[0] || null;
          let autoPublished = null;
          try {
            if (bestExt?.external_id) {
              autoPublished = await approveAndSendToRadar(db, radar, {
                id: bestExt.candidate_id || null,
                source: 'wikidata',
                external_id: bestExt.external_id,
                description: bestExt.description || '',
                evidence: bestExt.evidence_url,
                extraProfiles: mergedExtras
              });
            } else if (bestMb?.external_id) {
              autoPublished = await approveAndSendToRadar(db, radar, {
                id: bestMb.candidate_id || null,
                source: 'musicbrainz',
                external_id: bestMb.external_id,
                description: bestMb.description || '',
                evidence: bestMb.evidence_url,
                extraProfiles: mergedExtras
              });
            } else if (v.query && String(v.query).trim().length >= 2) {
              autoPublished = await approveAndSendToRadar(db, radar, {
                name: String(v.query).trim(),
                evidence: extraYt[0]?.url || `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(String(v.query).trim())}`,
                extraProfiles: mergedExtras
              });
            }
          } catch {}
          if (autoPublished) {
            result.autoPublished = autoPublished;
          }
        }
      } else if (action === 'global-save') {
        result = await saveWikidata(db, v.id);
        if (Boolean(v.autoApprove) && radar) {
          result = await approveAndSendToRadar(db, radar, { id: result.id, source: 'wikidata', external_id: v.id });
        }
      } else if (action === 'musicbrainz-save') {
        result = await saveMusicBrainz(db, v.id);
        if (Boolean(v.autoApprove) && radar) {
          result = await approveAndSendToRadar(db, radar, { id: result.id, source: 'musicbrainz', external_id: v.id });
        }
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
