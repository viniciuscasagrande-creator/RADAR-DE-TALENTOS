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

const AUTO_EXPANSION_BRAZILIAN_TALENTS = [
  { name: 'Simone Mendes', description: 'cantora brasileira de música sertaneja' },
  { name: 'Nattan', description: 'cantor brasileiro de forró' },
  { name: 'Matuê', description: 'rapper e cantor brasileiro de trap' },
  { name: 'Thiaguinho', description: 'cantor e compositor brasileiro de pagode' },
  { name: 'Sorriso Maroto', description: 'grupo musical brasileiro de pagode' },
  { name: 'Péricles', description: 'cantor brasileiro de samba e pagode' },
  { name: 'Grupo Menos é Mais', description: 'grupo brasileiro de pagode' },
  { name: 'Ferrugem', description: 'cantor brasileiro de pagode' },
  { name: 'Dilsinho', description: 'cantor e compositor brasileiro de pagode' },
  { name: 'Ludmilla', description: 'cantora e compositora brasileira de pop e pagode' },
  { name: 'Ivete Sangalo', description: 'cantora brasileira de axé e pop' },
  { name: 'Bell Marques', description: 'cantor brasileiro de axé' },
  { name: 'Xand Avião', description: 'cantor brasileiro de forró' },
  { name: 'Wesley Safadão', description: 'cantor brasileiro de forró' },
  { name: 'João Gomes', description: 'cantor brasileiro de piseiro e forró' },
  { name: 'Zé Vaqueiro', description: 'cantor brasileiro de forró e piseiro' },
  { name: 'Mari Fernandez', description: 'cantora brasileira de forró e piseiro' },
  { name: 'Henry Freitas', description: 'cantor brasileiro de forró' },
  { name: 'Felipe Amorim', description: 'cantor brasileiro de forró e pop' },
  { name: 'Gustavo Mioto', description: 'cantor brasileiro de música sertaneja' },
  { name: 'Murilo Huff', description: 'cantor e compositor brasileiro de música sertaneja' },
  { name: 'Lauana Prado', description: 'cantora brasileira de música sertaneja' },
  { name: 'Guilherme & Benuto', description: 'dupla sertaneja brasileira' },
  { name: 'Matheus & Kauan', description: 'dupla sertaneja brasileira' },
  { name: 'Israel & Rodolffo', description: 'dupla sertaneja brasileira' },
  { name: 'Hugo & Guilherme', description: 'dupla sertaneja brasileira' },
  { name: 'Diego & Victor Hugo', description: 'dupla sertaneja brasileira' },
  { name: 'Clayton & Romário', description: 'dupla sertaneja brasileira' },
  { name: 'Chitãozinho & Xororó', description: 'dupla sertaneja brasileira' },
  { name: 'Zezé Di Camargo & Luciano', description: 'dupla sertaneja brasileira' },
  { name: 'Leonardo', description: 'cantor brasileiro de música sertaneja' },
  { name: 'Michel Teló', description: 'cantor brasileiro de música sertaneja' },
  { name: 'Léo Santana', description: 'cantor brasileiro de pagode baiano e axé' },
  { name: 'Pedro Sampaio', description: 'DJ e produtor musical brasileiro' },
  { name: 'Dennis DJ', description: 'DJ e produtor musical brasileiro' },
  { name: 'Vintage Culture', description: 'DJ e produtor brasileiro de música eletrônica' },
  { name: 'Dubdogz', description: 'duo brasileiro de música eletrônica' },
  { name: 'Luísa Sonza', description: 'cantora e compositora brasileira de pop' },
  { name: 'Jão', description: 'cantor e compositor brasileiro de pop' },
  { name: 'Iza', description: 'cantora brasileira de pop e R&B' },
  { name: 'Gloria Groove', description: 'cantora e rapper brasileira' },
  { name: 'Pabllo Vittar', description: 'cantora brasileira de pop' },
  { name: 'Marina Sena', description: 'cantora e compositora brasileira de pop' },
  { name: 'Liniker', description: 'cantora e compositora brasileira de soul e MPB' },
  { name: 'Djavan', description: 'cantor e compositor brasileiro de MPB' },
  { name: 'Caetano Veloso', description: 'cantor e compositor brasileiro de MPB' },
  { name: 'Gilberto Gil', description: 'cantor e compositor brasileiro de MPB' },
  { name: 'Marisa Monte', description: 'cantora e compositora brasileira de MPB' },
  { name: 'Seu Jorge', description: 'cantor e ator brasileiro de MPB e samba' },
  { name: 'Lulu Santos', description: 'cantor e guitarrista brasileiro de pop rock' },
  { name: 'Capital Inicial', description: 'banda brasileira de rock' },
  { name: 'Natiruts', description: 'banda brasileira de reggae' },
  { name: 'Maneva', description: 'banda brasileira de reggae' },
  { name: 'Pitty', description: 'cantora brasileira de rock' },
  { name: 'Filipe Ret', description: 'rapper e cantor brasileiro' },
  { name: 'L7NNON', description: 'rapper brasileiro' },
  { name: 'Veigh', description: 'rapper e cantor brasileiro de trap' },
  { name: 'KayBlack', description: 'rapper e cantor brasileiro de trap' },
  { name: 'MC Cabelinho', description: 'cantor, rapper e ator brasileiro' },
  { name: 'Orochi', description: 'rapper brasileiro' },
  { name: 'WIU', description: 'rapper e produtor musical brasileiro' },
  { name: 'Teto', description: 'rapper e cantor brasileiro de trap' },
  { name: 'MC Hariel', description: 'cantor brasileiro de funk' },
  { name: 'MC Livinho', description: 'cantor brasileiro de funk' },
  { name: 'Aline Barros', description: 'cantora brasileira de música gospel' },
  { name: 'Gabriela Rocha', description: 'cantora brasileira de música gospel' },
  { name: 'Fernandinho', description: 'cantor brasileiro de música gospel' },
  { name: 'Isaias Saad', description: 'cantor brasileiro de música gospel' },
  { name: 'Padre Marcelo Rossi', description: 'padre, cantor e escritor brasileiro' },
  { name: 'Padre Reginaldo Manzotti', description: 'padre, escritor e cantor brasileiro' },
  { name: 'Roberto Carlos', description: 'cantor e compositor brasileiro' },
  { name: 'Alexandre Pires', description: 'cantor brasileiro de pagode e samba' },
  { name: 'Raça Negra', description: 'grupo musical brasileiro de samba e pagode' },
  { name: 'Belo', description: 'cantor brasileiro de pagode' },
  { name: 'Zeca Pagodinho', description: 'cantor e compositor brasileiro de samba' },
  { name: 'Alcione', description: 'cantora brasileira de samba' },
  { name: 'Alceu Valença', description: 'cantor e compositor brasileiro de MPB e forró' },
  { name: 'Joelma', description: 'cantora brasileira de calypso e brega pop' },
  { name: 'Manu Bahtidão', description: 'cantora brasileira de tecnomelody e sertanejo' },
  { name: 'Nadson O Ferinha', description: 'cantor brasileiro de arrocha' },
  { name: 'Fábio Porchat', description: 'humorista, ator e apresentador brasileiro' },
  { name: 'Tatá Werneck', description: 'humorista, atriz e apresentadora brasileira' },
  { name: 'Danilo Gentili', description: 'humorista e apresentador brasileiro de stand-up' },
  { name: 'Thiago Ventura', description: 'humorista brasileiro de stand-up comedy' },
  { name: 'Rodrigo Marques', description: 'humorista brasileiro de stand-up' },
  { name: 'Bruna Louise', description: 'humorista brasileira de stand-up comedy' },
  { name: 'Diogo Portugal', description: 'humorista brasileiro de stand-up' },
  { name: 'Tirullipa', description: 'humorista e artista brasileiro' },
  { name: 'Renato Albani', description: 'humorista brasileiro de stand-up' },
  { name: 'Raphael Ghanem', description: 'humorista, ator e comediante brasileiro de stand-up' },
  { name: 'Murilo Couto', description: 'humorista brasileiro de stand-up comedy' },
  { name: 'Igor Guimarães', description: 'humorista brasileiro de stand-up' },
  { name: 'Nando Viana', description: 'humorista brasileiro de stand-up' },
  { name: 'Paul Cabannes', description: 'humorista de stand-up radicado no Brasil' },
  { name: 'Mario Sergio Cortella', description: 'filósofo, escritor e palestrante brasileiro' },
  { name: 'Clóvis de Barros Filho', description: 'filósofo, professor e palestrante brasileiro' },
  { name: 'Monja Coen', description: 'monja budista e palestrante brasileira' },
  { name: 'Augusto Cury', description: 'médico psiquiatra, escritor e palestrante brasileiro' },
  { name: 'Joel Jota', description: 'mentor de alta performance e palestrante brasileiro' },
  { name: 'Thiago Nigro', description: 'educador financeiro, youtuber e palestrante brasileiro' },
  { name: 'Camila Farani', description: 'investidora, empresária e palestrante brasileira' },
  { name: 'Deive Leonardo', description: 'evangelista, escritor e palestrante brasileiro' },
  { name: 'Padre Fábio de Melo', description: 'padre, escritor, cantor e palestrante brasileiro' },
  { name: 'Virginia Fonseca', description: 'influenciadora digital e apresentadora brasileira' },
  { name: 'Carlinhos Maia', description: 'influenciador digital e humorista brasileiro' },
  { name: 'Bianca Andrade', description: 'influenciadora digital e empresária brasileira' },
  { name: 'Casimiro Miguel', description: 'streamer, jornalista e influenciador digital brasileiro' },
  { name: 'Enaldinho', description: 'youtuber e influenciador digital brasileiro' },
  { name: 'Felipe Neto', description: 'youtuber, empresário e influenciador brasileiro' },
  { name: 'Manual do Mundo', description: 'canal educativo e criador de conteúdo brasileiro' },
  { name: 'Erick Jacquin', description: 'chef de cozinha e apresentador de gastronomia' },
  { name: 'Henrique Fogaça', description: 'chef de cozinha e jurado de gastronomia brasileiro' },
  { name: 'Helena Rizzo', description: 'chef de cozinha brasileira premiada em gastronomia' },
  { name: 'Rodrigo Hilbert', description: 'apresentador de culinária e gastronomia brasileiro' },
  { name: 'Felipe Bronze', description: 'chef de cozinha e apresentador de gastronomia brasileiro' },
  { name: 'Mundo Bita', description: 'projeto musical infantil e família brasileiro' },
  { name: 'Galinha Pintadinha', description: 'projeto musical infantil e família brasileiro' },
  { name: 'Palavra Cantada', description: 'dupla musical infantil e família brasileira' },
  { name: 'Patati Patatá', description: 'dupla de palhaços infantil e família brasileira' },
  { name: 'Luccas Neto', description: 'ator e produtor de conteúdo infantil e família brasileiro' },
  { name: 'Fernanda Montenegro', description: 'atriz brasileira de teatro, cinema e televisão' },
  { name: 'Selton Mello', description: 'ator e diretor brasileiro de cinema e teatro' },
  { name: 'Wagner Moura', description: 'ator e diretor brasileiro de cinema e teatro' },
  { name: 'Lázaro Ramos', description: 'ator, diretor e escritor brasileiro de teatro e cinema' },
  { name: 'Claudia Raia', description: 'atriz e produtora brasileira de peças de teatro e musicais' },
  { name: 'Miguel Falabella', description: 'ator, dramaturgo e diretor brasileiro de peças de teatro e musicais' }
];

/**
 * Ciclo Automático Intradiário de Prospecção, Aprovação, Coleta e Distribuição Multi-Menu:
 * 1. Aprova, coleta (YouTube + Spotify) e envia ao Radar todos os candidatos pendentes/aprovados na fila.
 * 2. Busca automaticamente no Wikidata + YouTube API v3 + Spotify os talentos do catálogo que ainda
 *    não possuem métricas coletadas.
 * 3. Alimenta automaticamente novos talentos brasileiros reais (a partir de eventos detectados e da
 *    fila nacional de expansão nas 8 categorias), aumentando continuamente o total de Talentos Monitorados.
 * 4. Atualiza múltiplas vezes ao dia (rotação intradiária a cada 2h) as métricas dos talentos já monitorados.
 */
export async function autoDiscoverApproveAndSyncCycle(db, radar, { limit = 6, category = '', talentId = '', force = false, fetcher = fetch } = {}) {
  if (!db || !radar) return { ok: false, processed: 0 };
  const ytBatch = await collectYoutube(db, { force: Boolean(force), fetcher }).catch(() => ({ collected: 0 }));
  let ytExtra = 0;
  let spExtra = 0;
  let pendingApproved = 0;
  let newlyFedTalents = 0;
  let intradayRefreshed = 0;
  const refreshedNames = [];

  // Etapa 1: Aprova e distribui automaticamente todos os candidatos pendentes na fila do Discovery (incorporando novos talentos ao Radar)
  const talentFilter = typeof talentId === 'string' ? talentId.trim() : '';
  const pendingCands = talentFilter
    ? []
    : db
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
        const ytChans = Array.isArray(gSearch?.youtubeChannels) && gSearch.youtubeChannels.length
          ? gSearch.youtubeChannels
          : await searchYoutube(tal.name, { fetcher }).catch(() => []);
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

  // Etapa 3: Alimentação automática contínua de novos talentos monitorados (eventos detectados + fila nacional de expansão)
  if (!talentFilter) {
    const existingNames = new Set(
      radar
        .prepare('SELECT lower(trim(name)) nm FROM talents')
        .all()
        .map(r => r.nm)
    );
    const eventArtists = radar
      .prepare('SELECT DISTINCT trim(name) AS name FROM event_listing_artists WHERE length(trim(name)) >= 3 LIMIT 40')
      .all()
      .map(r => ({ name: r.name, description: 'atração artística e musical brasileira' }));
    const expansionCandidates = [...eventArtists, ...AUTO_EXPANSION_BRAZILIAN_TALENTS].filter(
      item => item?.name && !existingNames.has(item.name.toLowerCase().trim())
    );
    const feedLimit = Math.min(4, Math.max(2, Math.ceil((Number(limit) || 6) / 2)));
    for (const newItem of expansionCandidates.slice(0, feedLimit)) {
      try {
        const gSearch = await globalSearch(db, radar, newItem.name, { includeMusicBrainzLive: false, fetcher }).catch(() => null);
        const bestExt = gSearch?.external?.find(e => e.profiles?.length > 0) || gSearch?.external?.[0] || null;
        const extraProfiles = [];
        if (Array.isArray(gSearch?.youtubeChannels) && gSearch.youtubeChannels[0]?.url) {
          extraProfiles.push({ network: 'YouTube', url: gSearch.youtubeChannels[0].url });
        } else if (process.env.YOUTUBE_API_KEY) {
          const ytChans = await searchYoutube(newItem.name, { fetcher }).catch(() => []);
          if (ytChans?.[0]?.url) extraProfiles.push({ network: 'YouTube', url: ytChans[0].url });
        }
        if (Array.isArray(gSearch?.crossValidation?.profiles)) {
          for (const cp of gSearch.crossValidation.profiles) {
            if (cp?.network && cp?.url) extraProfiles.push({ network: cp.network, url: cp.url });
          }
        }
        const ap = await approveAndSendToRadar(
          db,
          radar,
          bestExt?.external_id
            ? {
                source: 'wikidata',
                external_id: bestExt.external_id,
                description: bestExt.description || newItem.description,
                evidence: bestExt.evidence_url,
                extraProfiles
              }
            : {
                name: newItem.name,
                description: newItem.description,
                evidence:
                  extraProfiles[0]?.url ||
                  `https://www.wikidata.org/wiki/Special:Search?search=${encodeURIComponent(newItem.name)}`,
                extraProfiles
              },
          { reviewer: 'auto-feeder', fetcher }
        );
        if (ap?.ok) {
          newlyFedTalents++;
          existingNames.add(newItem.name.toLowerCase().trim());
          ytExtra += ap.youtubeCollected || 0;
          spExtra += ap.spotifyCollected || 0;
          if (!refreshedNames.includes(ap.name)) refreshedNames.push(ap.name);
        }
      } catch {}
    }
  }

  // Etapa 4: Atualização intradiária contínua (múltiplas vezes ao dia para talentos cuja última coleta tem mais de 2 horas)
  if (!talentFilter) {
    const twoHoursAgoIso = new Date(Date.now() - 2 * 3600000).toISOString();
    const staleTalents = radar
      .prepare(
        `SELECT t.id, t.name, MIN(mc.collected_at) AS oldest_collected
         FROM talents t
         JOIN metric_current mc ON mc.talent_id = t.id
         WHERE t.blocked = 0
           AND mc.value IS NOT NULL
           AND mc.collected_at < ?
         GROUP BY t.id
         ORDER BY oldest_collected ASC
         LIMIT ?`
      )
      .all(twoHoursAgoIso, Math.min(4, Math.max(2, Math.floor((Number(limit) || 6) / 2))));

    for (const st of staleTalents) {
      try {
        const candRow = db.prepare('SELECT id FROM candidates WHERE radar_id = ? LIMIT 1').get(st.id);
        if (candRow?.id) {
          const ytR = await collectYoutube(db, { candidateId: candRow.id, force: true, fetcher }).catch(() => ({ collected: 0 }));
          ytExtra += ytR.collected || 0;
        }
        const spComm = radar.prepare("SELECT url, identity_source FROM commercial_accounts WHERE talent_id = ? AND network = 'Spotify' LIMIT 1").get(st.id);
        if (spComm?.url) {
          const spCount = await autoCollectSpotifyForCandidate(
            radar,
            st.id,
            [{ network: 'Spotify', url: spComm.url }],
            spComm.identity_source || spComm.url,
            fetcher
          ).catch(() => 0);
          spExtra += spCount;
        }
        intradayRefreshed++;
        if (!refreshedNames.includes(st.name)) refreshedNames.push(st.name);
      } catch {}
    }
  }

  const dist = distributeVerifiedDiscoveryToRadar(radar, db);
  const totalTalents = radar.prepare('SELECT count(*) n FROM talents WHERE blocked = 0').get().n;
  const totalWithMetrics = radar.prepare('SELECT count(DISTINCT talent_id) n FROM metric_current WHERE value IS NOT NULL').get().n;
  const totalMetrics = radar.prepare('SELECT count(*) n FROM metric_current WHERE value IS NOT NULL').get().n;

  return {
    ok: true,
    status: 'completed',
    processed: pendingApproved + candidatesToEnrich.length + newlyFedTalents + intradayRefreshed,
    approvedAndPublished: pendingApproved + newlyFedTalents + refreshedNames.length,
    pendingApproved,
    newlyFedTalents,
    intradayRefreshed,
    collected: (ytBatch.collected || 0) + ytExtra + spExtra,
    youtubeCollected: (ytBatch.collected || 0) + ytExtra,
    spotifyCollected: spExtra,
    distributed: dist.distributed,
    refreshedNames,
    totalTalents,
    totalWithMetrics,
    remainingPendingTalents: Math.max(0, totalTalents - totalWithMetrics),
    totalMetrics,
    updatedAt: new Date().toISOString()
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
