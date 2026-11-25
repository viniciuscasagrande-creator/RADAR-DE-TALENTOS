import { FilterError, distanceKm } from './radar.mjs';
import { commercialQuery, metrics } from './commercial.mjs';
import { formatCompactPtBr, VERIFIED_IBGE_DEMOGRAPHICS } from './menu-integration.mjs';

const networks = Object.keys(metrics);
const primaryNational = {
  Instagram: 'followers',
  YouTube: 'subscribers',
  Spotify: 'monthly_listeners',
  TikTok: 'followers'
};
const preferredRegional = {
  Instagram: ['followers', 'reach', 'views'],
  YouTube: ['views', 'subscribers'],
  Spotify: ['listeners', 'streams'],
  TikTok: ['followers', 'reach', 'views']
};

const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

function resolveTalent(db, talentParam, queryParam) {
  if (talentParam) {
    const exact = db.prepare('SELECT id, name, entity_type FROM talents WHERE id = ? AND blocked = 0').get(talentParam);
    if (exact) return exact;
  }
  const q = norm(queryParam || talentParam);
  if (!q) throw new FilterError('Informe um artista ou talento para analisar a compatibilidade');
  const all = db.prepare('SELECT id, name, entity_type FROM talents WHERE blocked = 0 ORDER BY name').all();
  const exactName = all.find(t => norm(t.name) === q || norm(t.id) === q);
  if (exactName) return exactName;
  const partial = all.find(t => norm(t.name).includes(q));
  if (partial) return partial;
  const tokens = q.split(/\s+/).filter(Boolean);
  const tokenMatch = all.find(t => {
    const tn = norm(t.name);
    return tokens.every(tok => tn.includes(tok));
  });
  if (tokenMatch) return tokenMatch;
  throw new FilterError('Artista não encontrado na base ativa');
}

function resolveCity(db, cityParam, cityQueryParam) {
  if (cityParam && /^\d{7}$/.test(cityParam.trim())) {
    const byCode = db.prepare('SELECT code, name, uf, region, lat, lon FROM municipalities WHERE code = ?').get(cityParam.trim());
    if (byCode) return byCode;
    throw new FilterError('Município não encontrado para o código informado');
  }
  const raw = (cityQueryParam || cityParam || '').trim();
  if (!raw) throw new FilterError('Informe um município (código ou nome/UF) para avaliar a compatibilidade');
  const cleaned = norm(raw).replace(/[\/,-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  const maybeUf = parts.length > 1 && /^[a-z]{2}$/.test(parts.at(-1)) ? parts.at(-1).toUpperCase() : '';
  const namePart = maybeUf ? parts.slice(0, -1).join(' ') : cleaned;
  if (!namePart || namePart.length < 2) {
    throw new FilterError('Informe um município válido (nome da cidade ou Cidade/UF)');
  }

  const candidates = db.prepare(
    `SELECT code, name, uf, region, lat, lon
     FROM municipalities
     WHERE (? = '' OR uf = ?)
     ORDER BY name, uf`
  ).all(maybeUf, maybeUf);

  const exact = candidates.find(m => norm(m.name) === namePart);
  if (exact) return exact;
  const starts = candidates.find(m => norm(m.name).startsWith(namePart));
  if (starts) return starts;
  const includes = candidates.find(m => norm(m.name).includes(namePart));
  if (includes) return includes;
  throw new FilterError('Município não localizado na Base Geográfica Nacional');
}

export function commercialCompatibility(db, p) {
  const days = Number(p.get('days') || 30);
  if (![7, 15, 30, 90].includes(days)) throw new FilterError('Janela inválida (use 7, 15, 30 ou 90 dias)');

  const radiusRaw = p.get('radius');
  const radius = radiusRaw === null || radiusRaw === '' ? 80 : Number(radiusRaw);
  if (!Number.isFinite(radius) || radius < 0 || radius > 1000) {
    throw new FilterError('Raio inválido (informe entre 0 e 1000 km)');
  }

  const artist = resolveTalent(db, p.get('talent') || '', p.get('q') || '');
  const city = resolveCity(db, p.get('city') || '', p.get('cityQuery') || '');

  const categories = db.prepare(
    `SELECT c.id, c.name
     FROM categories c
     JOIN talent_categories tc ON tc.category_id = c.id
     WHERE tc.talent_id = ?
     ORDER BY c.name`
  ).all(artist.id);

  const modalities = db.prepare(
    `SELECT m.id, m.name
     FROM modalities m
     JOIN talent_modalities tm ON tm.modality_id = m.id
     WHERE tm.talent_id = ?
     ORDER BY m.name`
  ).all(artist.id);

  const submodalities = db.prepare(
    `SELECT s.id, s.name, s.modality_id
     FROM submodalities s
     JOIN talent_submodalities ts ON ts.submodality_id = s.id AND ts.modality_id = s.modality_id
     WHERE ts.talent_id = ?
     ORDER BY s.name`
  ).all(artist.id);

  // Bacia de captação regional no raio (Haversine)
  const allMunis = db.prepare('SELECT code, name, uf, region, lat, lon FROM municipalities WHERE lat IS NOT NULL AND lon IS NOT NULL').all();
  const catchmentMap = new Map();
  if (city.lat != null && city.lon != null && radius > 0) {
    for (const m of allMunis) {
      const d = m.code === city.code ? 0 : distanceKm(city, m);
      if (d <= radius) {
        catchmentMap.set(m.code, { ...m, distance_km: Number(d.toFixed(1)) });
      }
    }
  }
  if (!catchmentMap.has(city.code)) {
    catchmentMap.set(city.code, { ...city, distance_km: 0 });
  }
  const catchmentCodes = new Set(catchmentMap.keys());

  // Dados nacionais e por janela nas 4 mídias
  const endParam = p.get('end') || '';
  const media = [];
  const cityConcentrationRatios = [];
  const radiusAmplificationRatios = [];
  const growthPcts = [];
  const categoryAffinityRatios = [];

  const modalityIds = modalities.map(m => m.id);
  const categoryIds = categories.map(c => c.id);

  for (const net of networks) {
    const metric = primaryNational[net];
    const qBase = new URLSearchParams({ network: net, metric, days: String(days), talent: artist.id });
    if (endParam) qBase.set('end', endParam);
    const natRes = commercialQuery(db, qBase);
    const natItem = natRes.items[0] ?? null;

    const win7 = days === 7 ? natItem : (commercialQuery(db, new URLSearchParams({ network: net, metric, days: '7', end: natRes.end, talent: artist.id })).items[0] ?? null);
    const win30 = days === 30 ? natItem : (commercialQuery(db, new URLSearchParams({ network: net, metric, days: '30', end: natRes.end, talent: artist.id })).items[0] ?? null);
    const win90 = days === 90 ? natItem : (commercialQuery(db, new URLSearchParams({ network: net, metric, days: '90', end: natRes.end, talent: artist.id })).items[0] ?? null);

    if (natItem?.growth_pct != null) {
      growthPcts.push(natItem.growth_pct);
    }

    // Relatório regional mais recente do artista nesta mídia
    const prefs = preferredRegional[net] || ['views', 'followers'];
    const regReports = db.prepare(
      `SELECT metric, period_start, period_end, source, quality
       FROM regional_audience
       WHERE talent_id = ? AND network = ?
       GROUP BY metric, period_start, period_end, source, quality
       ORDER BY period_end DESC, CASE WHEN quality = 'verified' THEN 0 ELSE 1 END`
    ).all(artist.id, net);

    regReports.sort((a, b) =>
      b.period_end.localeCompare(a.period_end) ||
      (a.quality === 'verified' ? -1 : 1) - (b.quality === 'verified' ? -1 : 1) ||
      (prefs.indexOf(a.metric) === -1 ? 99 : prefs.indexOf(a.metric)) - (prefs.indexOf(b.metric) === -1 ? 99 : prefs.indexOf(b.metric))
    );

    const latestReport = regReports[0] ?? null;
    let cityAudience = null;
    let radiusAudience = null;

    if (latestReport) {
      const rows = db.prepare(
        `SELECT a.municipality_code, a.value, m.name, m.uf, m.region
         FROM regional_audience a
         JOIN municipalities m ON m.code = a.municipality_code
         WHERE a.talent_id = ? AND a.network = ? AND a.metric = ?
           AND a.period_start = ? AND a.period_end = ? AND a.source = ? AND a.quality = ?
         ORDER BY a.value DESC, a.municipality_code ASC`
      ).all(
        artist.id,
        net,
        latestReport.metric,
        latestReport.period_start,
        latestReport.period_end,
        latestReport.source,
        latestReport.quality
      );

      const totalArtistRegional = rows.reduce((acc, r) => acc + r.value, 0);
      const maxCityValue = rows[0]?.value ?? 0;
      const avgCityValue = rows.length ? totalArtistRegional / rows.length : 0;

      // Janela anterior adjacente para crescimento municipal
      const durationDays = Math.round((Date.parse(latestReport.period_end) - Date.parse(latestReport.period_start)) / 86400000) + 1;
      const prevEnd = new Date(Date.parse(latestReport.period_start) - 86400000).toISOString().slice(0, 10);
      const prevStart = new Date(Date.parse(latestReport.period_start) - durationDays * 86400000).toISOString().slice(0, 10);

      const prevRows = db.prepare(
        `SELECT municipality_code, value
         FROM regional_audience
         WHERE talent_id = ? AND network = ? AND metric = ?
           AND period_start = ? AND period_end = ? AND source = ? AND quality = ?`
      ).all(
        artist.id,
        net,
        latestReport.metric,
        prevStart,
        prevEnd,
        latestReport.source,
        latestReport.quality
      );
      const prevMap = new Map(prevRows.map(r => [r.municipality_code, r.value]));

      const cityIdx = rows.findIndex(r => r.municipality_code === city.code);
      const cityRow = cityIdx >= 0 ? rows[cityIdx] : null;
      const cityPrev = cityRow && prevMap.has(city.code) ? prevMap.get(city.code) : null;
      const cityGrowth = cityRow && cityPrev != null ? cityRow.value - cityPrev : null;
      const cityGrowthPct = cityGrowth != null && cityPrev > 0 ? (cityGrowth / cityPrev) * 100 : null;

      if (cityRow) {
        // Índice de concentração na cidade: compara com a média e o topo do artista
        const vsAvg = avgCityValue > 0 ? Math.min(1, cityRow.value / (avgCityValue * 1.4)) : 0;
        const vsMax = maxCityValue > 0 ? Math.sqrt(cityRow.value / maxCityValue) : 0;
        cityConcentrationRatios.push(0.55 * vsAvg + 0.45 * vsMax);
        if (cityGrowthPct != null) growthPcts.push(cityGrowthPct);
      }

      cityAudience = {
        present: Boolean(cityRow),
        value: cityRow ? cityRow.value : null,
        rank: cityRow ? cityIdx + 1 : null,
        totalCities: rows.length,
        sharePct: cityRow && totalArtistRegional > 0 ? Number(((cityRow.value / totalArtistRegional) * 100).toFixed(2)) : null,
        previousValue: cityPrev,
        growth: cityGrowth,
        growthPct: cityGrowthPct != null ? Number(cityGrowthPct.toFixed(1)) : null,
        metric: latestReport.metric,
        periodStart: latestReport.period_start,
        periodEnd: latestReport.period_end,
        source: latestReport.source,
        quality: latestReport.quality
      };

      // Bacia regional dentro do raio
      const inRadiusRows = rows
        .filter(r => catchmentCodes.has(r.municipality_code))
        .map(r => ({
          code: r.municipality_code,
          name: r.name,
          uf: r.uf,
          value: r.value,
          distance_km: catchmentMap.get(r.municipality_code)?.distance_km ?? 0,
          previousValue: prevMap.get(r.municipality_code) ?? null
        }))
        .sort((a, b) => b.value - a.value || a.distance_km - b.distance_km);

      const radiusSum = inRadiusRows.reduce((acc, r) => acc + r.value, 0);
      const comparableRadius = inRadiusRows.length > 0 && inRadiusRows.every(r => r.previousValue != null);
      const radiusPrevSum = comparableRadius ? inRadiusRows.reduce((acc, r) => acc + r.previousValue, 0) : null;
      const radiusGrowth = comparableRadius ? radiusSum - radiusPrevSum : null;
      const radiusGrowthPct = radiusGrowth != null && radiusPrevSum > 0 ? (radiusGrowth / radiusPrevSum) * 100 : null;

      if (radiusSum > 0) {
        const surroundingBoost = cityRow && cityRow.value > 0
          ? Math.min(1, (radiusSum - cityRow.value) / (cityRow.value * 1.25))
          : Math.min(1, radiusSum / Math.max(1, avgCityValue * 1.5));
        const shareBoost = totalArtistRegional > 0 ? Math.min(1, (radiusSum / totalArtistRegional) / 0.12) : 0;
        radiusAmplificationRatios.push(Math.max(surroundingBoost * 0.5 + shareBoost * 0.5, cityRow ? 0.55 : 0.35));
        if (radiusGrowthPct != null) growthPcts.push(radiusGrowthPct);
      }

      // Afinidade da categoria/modalidade na bacia regional vs nacional
      if (modalityIds.length || categoryIds.length) {
        const codesArr = [...catchmentCodes];
        const placeholders = codesArr.map(() => '?').join(',');
        const totalAllTalentsInCatchment = db.prepare(
          `SELECT sum(a.value) AS s
           FROM regional_audience a
           JOIN talents t ON t.id = a.talent_id
           WHERE t.blocked = 0 AND a.network = ? AND a.metric = ?
             AND a.period_start = ? AND a.period_end = ?
             AND a.municipality_code IN (${placeholders})`
        ).get(net, latestReport.metric, latestReport.period_start, latestReport.period_end, ...codesArr)?.s ?? 0;

        let catTalentsInCatchment = 0;
        if (categoryIds.length) {
          const catPh = categoryIds.map(() => '?').join(',');
          catTalentsInCatchment = db.prepare(
            `SELECT sum(a.value) AS s
             FROM regional_audience a
             JOIN talents t ON t.id = a.talent_id
             WHERE t.blocked = 0 AND a.network = ? AND a.metric = ?
               AND a.period_start = ? AND a.period_end = ?
               AND a.municipality_code IN (${placeholders})
               AND EXISTS (SELECT 1 FROM talent_categories tc WHERE tc.talent_id = t.id AND tc.category_id IN (${catPh}))`
          ).get(net, latestReport.metric, latestReport.period_start, latestReport.period_end, ...codesArr, ...categoryIds)?.s ?? 0;
        } else if (modalityIds.length) {
          const modPh = modalityIds.map(() => '?').join(',');
          catTalentsInCatchment = db.prepare(
            `SELECT sum(a.value) AS s
             FROM regional_audience a
             JOIN talents t ON t.id = a.talent_id
             WHERE t.blocked = 0 AND a.network = ? AND a.metric = ?
               AND a.period_start = ? AND a.period_end = ?
               AND a.municipality_code IN (${placeholders})
               AND EXISTS (SELECT 1 FROM talent_modalities tm WHERE tm.talent_id = t.id AND tm.modality_id IN (${modPh}))`
          ).get(net, latestReport.metric, latestReport.period_start, latestReport.period_end, ...codesArr, ...modalityIds)?.s ?? 0;
        }

        if (totalAllTalentsInCatchment > 0 && catTalentsInCatchment > 0) {
          const localCatShare = catTalentsInCatchment / totalAllTalentsInCatchment;
          // 12.5% é a média teórica entre 8 categorias; >= 15% indica alta afinidade
          categoryAffinityRatios.push(Math.min(1, localCatShare / 0.16));
        }
      }

      radiusAudience = {
        radiusKm: radius,
        totalCatchmentMunicipalities: catchmentCodes.size,
        municipalitiesWithData: inRadiusRows.length,
        totalValue: inRadiusRows.length ? radiusSum : null,
        surroundingValue: inRadiusRows.length ? Math.max(0, radiusSum - (cityRow?.value ?? 0)) : null,
        sharePct: inRadiusRows.length && totalArtistRegional > 0 ? Number(((radiusSum / totalArtistRegional) * 100).toFixed(2)) : null,
        growth: radiusGrowth,
        growthPct: radiusGrowthPct != null ? Number(radiusGrowthPct.toFixed(1)) : null,
        cities: inRadiusRows.slice(0, 15)
      };
    }

    const acctRow = db.prepare('SELECT url, identity_source FROM commercial_accounts WHERE talent_id = ? AND network = ? LIMIT 1').get(artist.id, net)
      || db.prepare('SELECT url, identity_source FROM social_accounts WHERE talent_id = ? AND network = ? LIMIT 1').get(artist.id, net);

    media.push({
      network: net,
      nationalMetric: metric,
      profileUrl: natItem?.url ?? acctRow?.url ?? null,
      statusLabel: natItem ? formatCompactPtBr(natItem.value) : 'Sem coleta',
      national: natItem ? {
        value: natItem.value,
        formatted: formatCompactPtBr(natItem.value),
        observed_on: natItem.observed_on,
        baseline_on: natItem.baseline_on,
        growth: natItem.growth,
        growth_pct: natItem.growth_pct != null ? Number(natItem.growth_pct.toFixed(1)) : null,
        size: natItem.size,
        source: natItem.source,
        collection_state: natItem.collection_state,
        freshness_label: natItem.freshness_label,
        windows: {
          7: win7 ? { value: win7.value, growth: win7.growth, growth_pct: win7.growth_pct != null ? Number(win7.growth_pct.toFixed(1)) : null } : null,
          30: win30 ? { value: win30.value, growth: win30.growth, growth_pct: win30.growth_pct != null ? Number(win30.growth_pct.toFixed(1)) : null } : null,
          90: win90 ? { value: win90.value, growth: win90.growth, growth_pct: win90.growth_pct != null ? Number(win90.growth_pct.toFixed(1)) : null } : null
        }
      } : null,
      cityAudience,
      radiusAudience
    });
  }

  // Concorrência de eventos e descanso de praça (cruzamento com eventos verificados nas plataformas)
  const codesArr = [...catchmentCodes];
  const placeholders = codesArr.map(() => '?').join(',');
  const eventsInCatchment = db.prepare(
    `SELECT e.id, e.title, e.municipality_code, m.name AS city_name, m.uf, e.venue, e.event_date, e.modality_id, mo.name AS modality_name
     FROM events e
     JOIN municipalities m ON m.code = e.municipality_code
     JOIN modalities mo ON mo.id = e.modality_id
     WHERE e.municipality_code IN (${placeholders})
       AND EXISTS (SELECT 1 FROM event_listings l WHERE l.event_id = e.id AND l.status != 'cancelled')
     ORDER BY e.event_date ASC`
  ).all(...codesArr);

  const artistNameKey = norm(artist.name);
  const artistEventIds = new Set(
    db.prepare('SELECT DISTINCT l.event_id, a.artist_key FROM event_listing_artists a JOIN event_listings l ON l.platform_id = a.platform_id AND l.external_id = a.external_id')
      .all()
      .filter(r => r.artist_key.includes(artistNameKey) || artistNameKey.includes(r.artist_key))
      .map(r => r.event_id)
  );

  const sameModalityEvents = eventsInCatchment.filter(e =>
    modalityIds.length ? modalityIds.includes(e.modality_id) : true
  );
  const cityCompetingEvents = sameModalityEvents.filter(e => e.municipality_code === city.code && !artistEventIds.has(e.id));
  const radiusCompetingEvents = sameModalityEvents.filter(e => !artistEventIds.has(e.id));
  const artistEventsInCatchment = eventsInCatchment.filter(e => artistEventIds.has(e.id) || norm(e.title).includes(artistNameKey));

  const refDate = p.get('end') || new Date().toISOString().slice(0, 10);
  const pastArtistEvents = artistEventsInCatchment.filter(e => e.event_date <= refDate).sort((a, b) => b.event_date.localeCompare(a.event_date));
  const futureArtistEvents = artistEventsInCatchment.filter(e => e.event_date > refDate);
  const lastArtistEvent = pastArtistEvents[0] ?? null;
  const daysSinceLastEvent = lastArtistEvent
    ? Math.round((Date.parse(refDate) - Date.parse(lastArtistEvent.event_date)) / 86400000)
    : null;

  // Cálculo dos 7 subíndices (0 a 100)
  const networksWithNational = media.filter(m => m.national != null).length;
  const networksWithCity = media.filter(m => m.cityAudience?.present).length;
  const networksWithRadius = media.filter(m => (m.radiusAudience?.municipalitiesWithData ?? 0) > 0).length;

  const hasAnyRegional = networksWithCity > 0 || networksWithRadius > 0;
  const hasAnyData = networksWithNational > 0 || hasAnyRegional;

  const v1DirectScore = cityConcentrationRatios.length
    ? clamp((cityConcentrationRatios.reduce((a, b) => a + b, 0) / cityConcentrationRatios.length) * 100)
    : null;

  const v2RadiusScore = radiusAmplificationRatios.length
    ? clamp((radiusAmplificationRatios.reduce((a, b) => a + b, 0) / radiusAmplificationRatios.length) * 100)
    : null;

  const avgGrowthPct = growthPcts.length
    ? growthPcts.reduce((a, b) => a + b, 0) / growthPcts.length
    : null;
  const v3GrowthScore = avgGrowthPct != null
    ? clamp(50 + avgGrowthPct * 1.15)
    : null;

  const v4AffinityScore = categoryAffinityRatios.length
    ? clamp((categoryAffinityRatios.reduce((a, b) => a + b, 0) / categoryAffinityRatios.length) * 100)
    : null;

  // Indicadores demográficos e econômicos oficiais (IBGE) para o município e bacia regional
  const demoMap = new Map(VERIFIED_IBGE_DEMOGRAPHICS.map(d => [d.code, d]));
  for (const r of db.prepare('SELECT * FROM municipality_demographics').all()) {
    demoMap.set(r.municipality_code, r);
  }
  const cityDemo = demoMap.get(city.code) || null;
  let catchmentKnownPop = 0;
  let catchmentDemoCities = 0;
  for (const code of catchmentCodes) {
    const dm = demoMap.get(code);
    if (dm?.population != null) {
      catchmentKnownPop += dm.population;
      catchmentDemoCities++;
    }
  }

  // Potencial socioeconômico IBGE (sem influência de ticketeiras)
  const popBase = catchmentKnownPop || cityDemo?.population || 0;
  const gdpBase = cityDemo?.gdp_per_capita || 0;
  const v5SocioeconomicScore = popBase > 0
    ? clamp(Math.min(60, Math.log10(Math.max(10000, popBase)) * 10) + Math.min(40, (gdpBase / 65000) * 40))
    : 75;

  // Presença digital multi-rede e consistência de séries verificadas (sem influência de ticketeiras)
  const v6DigitalPresenceScore = clamp(((networksWithNational * 0.5 + networksWithRadius * 0.3 + networksWithCity * 0.2) / 4) * 100);

  const v7ConfidenceScore = clamp(((networksWithNational * 0.35 + networksWithRadius * 0.40 + networksWithCity * 0.25) / 4) * 100);
  const maxNationalReach = Math.max(0, ...media.map(m => Number(m.national?.value || 0)));

  // Regra adotada (Radar Score 2.0): Ticketeiras e eventos publicados NÃO entram no cálculo do Score Artístico nem do Score Territorial.
  // Os eventos aparecem exclusivamente como o 3º resultado independente ("Contexto de Eventos") para apoiar a decisão humana.
  const regionalAudienceComposite = v1DirectScore != null && v2RadiusScore != null
    ? clamp(v1DirectScore * 0.6 + v2RadiusScore * 0.4)
    : (v1DirectScore ?? v2RadiusScore);

  const historicalConsistencyScore = clamp(
    (networksWithNational * 15) +
    (media.filter(m => m.national?.baseline_on != null).length * 10)
  );

  // 1) Radar Score Artístico (Popularidade, crescimento e tração nacional multi-mídia)
  const reachLogScore = maxNationalReach > 0
    ? clamp(Math.min(100, (Math.log10(Math.max(1000, maxNationalReach)) - 3) * 24))
    : null;
  const artisticComponents = [
    [0.40, reachLogScore],
    [0.35, v3GrowthScore],
    [0.25, v6DigitalPresenceScore]
  ].filter(([, val]) => val != null);
  const artisticWeightSum = artisticComponents.reduce((sum, [w]) => sum + w, 0);
  const artisticScoreValue = artisticWeightSum > 0
    ? clamp(artisticComponents.reduce((sum, [w, val]) => sum + w * val, 0) / artisticWeightSum)
    : null;

  // 2) Radar Score Territorial 2.0 (Compatibilidade comercial entre artista e cidade — 6 pesos: 30/20/15/15/10/10)
  let overallScore = null;
  if (hasAnyData && (v1DirectScore != null || v2RadiusScore != null)) {
    const components = [
      [0.30, regionalAudienceComposite],
      [0.20, v3GrowthScore],
      [0.15, v4AffinityScore],
      [0.15, v6DigitalPresenceScore],
      [0.10, v5SocioeconomicScore],
      [0.10, historicalConsistencyScore]
    ].filter(([, val]) => val != null);
    const totalWeight = components.reduce((sum, [w]) => sum + w, 0);
    const demandBase = totalWeight > 0
      ? components.reduce((sum, [w, val]) => sum + w * val, 0) / totalWeight
      : 0;
    overallScore = clamp(demandBase);
  }

  let verdict;
  if (overallScore == null) {
    verdict = {
      level: 'insufficient',
      label: 'Dados regionais insuficientes para o município',
      recommendation: `Ainda não há relatório municipal de audiência para ${artist.name} em ${city.name}/${city.uf} ou no raio de ${radius} km. Importe ou sincronize os relatórios regionais para liberar o score de viabilidade.`
    };
  } else if (overallScore >= 80) {
    verdict = {
      level: 'high',
      label: 'Alta Viabilidade Comercial — Praça Prioritária para Vendas',
      recommendation: `${artist.name} apresenta forte concentração digital comprovada em ${city.name}/${city.uf} e na bacia regional de ${radius} km, com tendência positiva de crescimento nas mídias e alto potencial socioeconômico.`
    };
  } else if (overallScore >= 60) {
    verdict = {
      level: 'good',
      label: 'Boa Compatibilidade — Viável com Captação Regional no Raio',
      recommendation: `Evento comercialmente viável em ${city.name}/${city.uf}, especialmente ao direcionar a campanha de vendas para os municípios vizinhos num raio de ${radius} km.`
    };
  } else if (overallScore >= 40) {
    verdict = {
      level: 'moderate',
      label: 'Compatibilidade Moderada — Praça em Maturação ou Competitiva',
      recommendation: `Recomenda-se dimensionar casa de médio porte em ${city.name}/${city.uf} ou combinar pré-venda regional com parceiros locais.`
    };
  } else {
    verdict = {
      level: 'low',
      label: 'Baixa Tração Atual na Praça',
      recommendation: `Concentração local abaixo das praças líderes do artista no momento; priorizar aquecimento digital na região antes da abertura de bilheteria.`
    };
  }

  // Construção do Argumentário Comercial Auditável (Bullets prontos para Vendas, baseados em audiência, presença digital e demografia)
  const salesPitch = [];
  const bestCityMedia = media
    .filter(m => m.cityAudience?.present)
    .sort((a, b) => (a.cityAudience.rank ?? 999) - (b.cityAudience.rank ?? 999))[0];
  if (bestCityMedia) {
    salesPitch.push(
      `Demanda local comprovada em ${city.name}/${city.uf}: #${bestCityMedia.cityAudience.rank}ª maior praça do artista no ${bestCityMedia.network} (${bestCityMedia.cityAudience.value.toLocaleString('pt-BR')} em ${bestCityMedia.cityAudience.metric}, fonte ${bestCityMedia.cityAudience.source}).`
    );
  }
  const bestRadiusMedia = media
    .filter(m => (m.radiusAudience?.totalValue ?? 0) > 0)
    .sort((a, b) => (b.radiusAudience.totalValue ?? 0) - (a.radiusAudience.totalValue ?? 0))[0];
  if (bestRadiusMedia) {
    const neighborNames = bestRadiusMedia.radiusAudience.cities
      .filter(c => c.code !== city.code)
      .slice(0, 5)
      .map(c => `${c.name}/${c.uf} (${c.distance_km} km)`)
      .join(', ');
    salesPitch.push(
      `Bacia regional no raio de ${radius} km abrange ${bestRadiusMedia.radiusAudience.totalCatchmentMunicipalities} municípios (${bestRadiusMedia.radiusAudience.municipalitiesWithData} com audiência ativa somando ${bestRadiusMedia.radiusAudience.totalValue.toLocaleString('pt-BR')} no ${bestRadiusMedia.network}${neighborNames ? ` — polos vizinhos: ${neighborNames}` : ''}).`
    );
  }
  if (avgGrowthPct != null) {
    salesPitch.push(
      `Momento de tração (${days} dias): variação média de ${avgGrowthPct >= 0 ? '+' : ''}${avgGrowthPct.toFixed(1)}% nas métricas verificadas do artista.`
    );
  }
  if (cityDemo?.population) {
    salesPitch.push(
      `Potencial demográfico oficial (IBGE): ${city.name}/${city.uf} possui ${cityDemo.population.toLocaleString('pt-BR')} habitantes (PIB per capita R$ ${Number(cityDemo.gdp_per_capita || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })})${catchmentKnownPop > cityDemo.population ? ` e bacia regional com ${catchmentKnownPop.toLocaleString('pt-BR')} habitantes nos polos monitorados` : ''}.`
    );
  }
  salesPitch.push(
    `Cobertura e rastreabilidade: ${networksWithNational}/4 mídias com métricas nacionais datadas e ${networksWithRadius}/4 mídias com audiência municipal comprovada na região (ticketeiras excluídas dos cálculos de pontuação).`
  );

  const artistMeta = db.prepare('SELECT * FROM talent_metadata WHERE talent_id = ?').get(artist.id) || null;
  let artistGenres = [];
  try { artistGenres = JSON.parse(artistMeta?.genres || '[]'); } catch {}

  const allNationalArtistEvents = db.prepare(
    `SELECT DISTINCT e.id, e.title, e.event_date, m.name AS city_name, m.uf, l.platform_id
     FROM event_listing_artists a
     JOIN event_listings l ON l.platform_id = a.platform_id AND l.external_id = a.external_id
     JOIN events e ON e.id = l.event_id
     JOIN municipalities m ON m.code = e.municipality_code
     WHERE l.status != 'cancelled'`
  ).all().filter(r => {
    const tNorm = norm(r.title);
    return artistEventIds.has(r.id) || (artistNameKey.length >= 4 && tNorm.includes(artistNameKey));
  });

  const isSeatedCategory = categories.some(c => /Humor|Palestr|Ator|Mágic|Teatro/i.test(c.name));
  const estTier = maxNationalReach >= 10000000 ? 'A' : maxNationalReach >= 2500000 ? 'B' : maxNationalReach >= 400000 ? 'C' : 'D';
  const estPib = Number(cityDemo?.gdp_per_capita || 45000);
  const estIncomeFactor = Math.max(0.8, Math.min(1.4, estPib / 46000));
  const estCapacity = isSeatedCategory
    ? (estTier === 'A' ? 2000 : estTier === 'B' ? 1300 : 800)
    : (estTier === 'A' ? 6000 : estTier === 'B' ? 3500 : estTier === 'C' ? 2000 : 1200);
  const estAvgTicket = Math.max(50, Math.round(((estTier === 'A' ? 120 : estTier === 'B' ? 95 : 75) * estIncomeFactor) / 5) * 5);
  const estArtistFee = Math.round((estCapacity * estAvgTicket * 0.34) / 1000) * 1000;
  const estOtherCosts = Math.round((estCapacity * estAvgTicket * 0.22) / 1000) * 1000;

  const roadKm = Number((radius * 1.28).toFixed(1));
  const roadMinutes = Math.round((roadKm / 75) * 60);
  const peaEstimate = catchmentKnownPop > 0 ? Math.round(catchmentKnownPop * 0.64) : (cityDemo?.population ? Math.round(cityDemo.population * 0.64) : null);

  const confScore = v7ConfidenceScore ?? Math.min(95, networksWithNational * 22 + networksWithRadius * 12);
  const confLevel = confScore >= 85 ? 'Identidade & Coleta Confirmadas (95–100%)' : confScore >= 65 ? 'Alta Cobertura Verificada (70–94%)' : confScore >= 40 ? 'Cobertura Parcial — Necessita Complementação (40–69%)' : 'Dados Regionais Pendentes (0–39%)';

  const scoreBand = overallScore == null
    ? 'Dados regionais pendentes (Avaliação neutra — não penaliza por ausência)'
    : overallScore >= 85
      ? '85–100 · Excelente compatibilidade'
      : overallScore >= 70
        ? '70–84 · Forte oportunidade'
        : overallScore >= 55
          ? '55–69 · Oportunidade moderada'
          : overallScore >= 40
            ? '40–54 · Necessita investigação'
            : '0–39 · Baixa compatibilidade';

  // Recomendação Comercial Qualificada por Cobertura e Confiança (Score × Confiança)
  if (overallScore != null && confScore < 65 && (verdict.level === 'high' || verdict.level === 'good')) {
    verdict = {
      level: 'moderate',
      label: `${verdict.label} (Sujeita a Validação — Cobertura Parcial ${confScore}%)`,
      recommendation: `${verdict.recommendation} Nota de governança: como o Índice de Cobertura e Confiança é ${confScore}% (${networksWithNational}/4 mídias nacionais e ${networksWithRadius}/4 regionais), esta recomendação não recebe o mesmo selo prioritário de um artista com cobertura ampla verificada.`
    };
  }

  return {
    artist: {
      id: artist.id,
      name: artist.name,
      entityType: artist.entity_type,
      categories: categories.map(c => c.name),
      modalities: modalities.map(m => m.name),
      submodalities: submodalities.map(s => s.name),
      catalog: {
        wikidata_id: artistMeta?.wikidata_id ?? null,
        musicbrainz_id: artistMeta?.musicbrainz_id ?? null,
        official_website: artistMeta?.official_website ?? null,
        agenda_url: artistMeta?.agenda_url ?? null,
        genres: artistGenres
      }
    },
    city: {
      code: city.code,
      name: city.name,
      uf: city.uf,
      region: city.region,
      lat: city.lat,
      lon: city.lon,
      demographics: cityDemo ? {
        population: cityDemo.population,
        pea_estimated: Math.round(cityDemo.population * 0.64),
        gdp_per_capita: cityDemo.gdp_per_capita,
        avg_income: cityDemo.avg_income,
        urban_rate: cityDemo.urban_rate,
        economic_profile: cityDemo.economic_profile,
        source: cityDemo.demographic_source || 'IBGE — Censo Demográfico / PIB dos Municípios'
      } : null
    },
    radiusKm: radius,
    days,
    score: overallScore,
    verdict,
    threeIndependentResults: {
      artisticScore: {
        indicator: 'Radar Score Artístico',
        purpose: 'Popularidade, crescimento e tração',
        score: artisticScoreValue,
        bandLabel: artisticScoreValue == null ? 'Dados insuficientes' : artisticScoreValue >= 80 ? 'Alta tração nacional' : artisticScoreValue >= 60 ? 'Boa tração multi-mídia' : 'Em construção',
        summary: `${networksWithNational}/4 mídias ativas · Alcance líder: ${formatCompactPtBr(maxNationalReach)}${avgGrowthPct != null ? ` · Crescimento médio: ${avgGrowthPct >= 0 ? '+' : ''}${avgGrowthPct.toFixed(1)}%` : ''}`
      },
      territorialScore: {
        indicator: 'Radar Score Territorial',
        purpose: 'Compatibilidade entre artista e cidade (Radar Score 2.0)',
        score: overallScore,
        bandLabel: scoreBand,
        summary: overallScore != null
          ? `Score Territorial ${overallScore}/100 em ${city.name}/${city.uf} + raio de ${radius} km (${networksWithRadius}/4 mídias com audiência regional comprovada)`
          : `Sem relatório municipal para ${city.name}/${city.uf} (avaliação neutra — não penaliza por ausência)`
      },
      eventsContext: {
        indicator: 'Contexto de Eventos',
        purpose: 'Concorrência, calendário e oferta anunciada (Isolado dos scores)',
        isolatedFromScore: true,
        cityEventsCount: cityCompetingEvents.length,
        radiusEventsCount: radiusCompetingEvents.length,
        artistUpcomingCount: futureArtistEvents.length,
        daysSinceLastArtistEvent: daysSinceLastEvent,
        statusLabel: radiusCompetingEvents.length > 0 || artistEventsInCatchment.length > 0
          ? `${cityCompetingEvents.length} evento(s) no município · ${radiusCompetingEvents.length} na bacia de ${radius} km`
          : 'Sem eventos concorrentes catalogados na janela',
        summary: 'Consulta informativa de calendário e oferta anunciada em ticketeiras. Auxilia na decisão comercial sem interferir no cálculo do Radar Score Artístico ou Territorial.'
      }
    },
    radarScore: {
      version: '2.0',
      score: overallScore,
      artisticScore: artisticScoreValue,
      bandLabel: scoreBand,
      methodologyNote: 'Radar Score 2.0 (Compatibilidade Territorial): eventos de ticketeiras permanecem 100% isolados no indicador "Contexto de Eventos" e não alteram a pontuação comercial.',
      weights: [
        { key: 'regional_audience', label: 'Audiência regional comprovada', weightPct: 30, score: regionalAudienceComposite },
        { key: 'digital_growth', label: 'Crescimento digital', weightPct: 20, score: v3GrowthScore },
        { key: 'category_affinity', label: 'Afinidade artística regional', weightPct: 15, score: v4AffinityScore },
        { key: 'engagement_traction', label: 'Engajamento e tração', weightPct: 15, score: v6DigitalPresenceScore },
        { key: 'economic_potential', label: 'Potencial econômico da praça (IBGE)', weightPct: 10, score: v5SocioeconomicScore },
        { key: 'historical_consistency', label: 'Consistência histórica', weightPct: 10, score: historicalConsistencyScore }
      ]
    },
    confidenceIndicator: {
      score: confScore,
      level: confLevel,
      verifiedNetworksCount: networksWithNational,
      regionalNetworksCount: networksWithRadius,
      cityNetworksCount: networksWithCity,
      qualifiedRecommendationTier: overallScore == null
        ? 'Neutro — Aguardando Cobertura Regional'
        : (overallScore >= 70 && confScore >= 65)
          ? 'Recomendação Prioritária Verificada (Score Alto + Ampla Cobertura)'
          : (overallScore >= 70 && confScore < 65)
            ? 'Potencial Elevado com Baixa Cobertura — Validar Dados Antes da Contratação'
            : 'Recomendação Padrão Auditada',
      independentRule: 'Um artista com pontuação elevada mas poucas informações verificadas recebe alerta de validação e não recebe a mesma recomendação prioritária de outro com ampla cobertura de dados.'
    },
    roadTravelEstimate: {
      straightRadiusKm: radius,
      estimatedHighwayKm: roadKm,
      estimatedDriveMinutes: roadMinutes,
      formattedDriveTime: roadMinutes >= 60 ? `${Math.floor(roadMinutes / 60)}h${String(roadMinutes % 60).padStart(2, '0')}min via rodovia` : `${roadMinutes} min via rodovia`,
      peaPopulation: peaEstimate
    },
    financialDefaults: {
      artistFee: estArtistFee,
      operationalCosts: estOtherCosts,
      venueCapacity: estCapacity,
      averageTicket: estAvgTicket,
      expectedOccupancyPct: 70,
      taxAndFeePct: 10
    },
    dataTaxonomy: [
      { code: 'verificado', label: 'Dado verificado', rule: 'Fonte oficial ou relatório autorizado com evidência e data.' },
      { code: 'observado', label: 'Dado observado', rule: 'Registrado a partir de fonte pública identificável.' },
      { code: 'calculado', label: 'Dado calculado', rule: 'Fórmula transparente aplicada sobre indicadores disponíveis.' },
      { code: 'estimado', label: 'Dado estimado', rule: 'Projeção parametrizada com metodologia documentada.' },
      { code: 'indisponivel', label: 'Dado indisponível', rule: 'Ausência de informação nunca é tratada como zero.' }
    ],
    variables: [
      {
        key: 'direct_audience',
        label: '1. Audiência Direta no Município',
        score: v1DirectScore,
        summary: networksWithCity > 0
          ? `Presença confirmada em ${networksWithCity} de 4 mídias em ${city.name}/${city.uf}`
          : `Sem registro isolado em ${city.name}/${city.uf} nos relatórios atuais`
      },
      {
        key: 'radius_catchment',
        label: `2. Bacia Regional (Raio de ${radius} km)`,
        score: v2RadiusScore,
        summary: `${catchmentCodes.size} municípios abrangidos no raio · ${networksWithRadius} mídias com audiência regional ativa`
      },
      {
        key: 'growth_momentum',
        label: `3. Tração e Crescimento (${days} dias)`,
        score: v3GrowthScore,
        summary: avgGrowthPct != null
          ? `Variação média de ${avgGrowthPct >= 0 ? '+' : ''}${avgGrowthPct.toFixed(1)}% nas séries comparáveis`
          : 'Aguardando janela anterior para cálculo de tendência'
      },
      {
        key: 'category_affinity',
        label: '4. Afinidade Cultural da Praça',
        score: v4AffinityScore,
        summary: `Aderência de ${city.name}/${city.uf} e região a ${(categories.map(c => c.name).concat(modalities.map(m => m.name)))[0] || 'Entretenimento'}`
      },
      {
        key: 'socioeconomic_potential',
        label: '5. Potencial Socioeconômico (IBGE)',
        score: v5SocioeconomicScore,
        summary: cityDemo?.population
          ? `${cityDemo.population.toLocaleString('pt-BR')} hab. · PIB per capita R$ ${Number(cityDemo.gdp_per_capita || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
          : 'Base demográfica regional monitorada (IBGE)'
      },
      {
        key: 'digital_presence',
        label: '6. Presença Digital e Engajamento nas Mídias',
        score: v6DigitalPresenceScore,
        summary: `${networksWithNational}/4 mídias ativas · Ticketeiras excluídas dos cálculos de pontuação`
      },
      {
        key: 'data_confidence',
        label: '7. Confiança e Rastreabilidade dos Dados',
        score: v7ConfidenceScore,
        summary: `${networksWithNational}/4 mídias nacionais · ${networksWithRadius}/4 mídias com cobertura na região`
      }
    ],
    media,
    catchment: {
      center: { code: city.code, name: city.name, uf: city.uf, region: city.region },
      radiusKm: radius,
      totalMunicipalities: catchmentCodes.size,
      knownPopulation: catchmentKnownPop > 0 ? catchmentKnownPop : null,
      municipalitiesWithDemographics: catchmentDemoCities,
      municipalities: [...catchmentMap.values()].sort((a, b) => a.distance_km - b.distance_km).slice(0, 40)
    },
    territorialPresence: {
      nationalEventsCount: allNationalArtistEvents.length,
      catchmentEventsCount: artistEventsInCatchment.length,
      statusLabel: allNationalArtistEvents.length > 0
        ? `${allNationalArtistEvents.length} evento(s) publicado(s)`
        : 'A integrar',
      notice: 'Os eventos permitem identificar presença territorial do artista, mas não devem ser confundidos com audiência digital ou ingressos vendidos.'
    },
    competition: {
      cityEventsCount: cityCompetingEvents.length,
      radiusEventsCount: radiusCompetingEvents.length,
      artistUpcomingCount: futureArtistEvents.length,
      daysSinceLastArtistEvent: daysSinceLastEvent,
      sampleCompetingEvents: radiusCompetingEvents.slice(0, 8).map(e => ({
        title: e.title,
        city: `${e.city_name}/${e.uf}`,
        venue: e.venue,
        date: e.event_date,
        modality: e.modality_name
      }))
    },
    salesPitch
  };
}
