import { getCrossMenuSummary, getArtistMediaStats, formatCompactPtBr, VERIFIED_IBGE_DEMOGRAPHICS } from './menu-integration.mjs';
import { commercialCompatibility } from './commercial-compatibility.mjs';
import { openDiscovery } from './discovery/engine.mjs';
import { autoDiscoverApproveAndSyncCycle } from './discovery/http.mjs';

const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

function escapeCsvCell(val) {
  if (val == null) return '';
  const str = String(val);
  if (/[";\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvDocument(columns = [], rows = []) {
  const header = columns.map(c => escapeCsvCell(c.label)).join(';');
  const lines = rows.map(row => columns.map(c => escapeCsvCell(row[c.key])).join(';'));
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

export function buildReportsHub(db, params = new URLSearchParams(), { discoveryDb = null } = {}) {
  const reportType = (params.get('type') || 'master_talents').trim();
  const category = (params.get('category') || '').trim();
  const network = (params.get('network') || '').trim();
  const region = (params.get('region') || '').trim();
  const q = norm(params.get('q') || '');
  const onlyVerified = params.get('onlyVerified') !== '0';
  const talentIdParam = (params.get('talent') || 't-gusttavo-lima').trim();
  const cityCodeParam = (params.get('city') || '4106902').trim();

  const cross = getCrossMenuSummary(
    db,
    new URLSearchParams({
      category,
      onlyWithData: onlyVerified ? '1' : '0',
      limit: '300'
    })
  );

  let ddb = discoveryDb;
  let closeDdb = false;
  if (!ddb) {
    try {
      ddb = openDiscovery();
      closeDdb = true;
    } catch {}
  }

  try {
    const generatedAt = new Date().toISOString();
    const categories = db.prepare('SELECT id, name FROM categories ORDER BY name ASC').all();
    const allTalents = (cross.items || []).filter(
      t => !q || norm(t.name).includes(q) || norm(t.id).includes(q) || (t.categories || []).some(c => norm(c).includes(q))
    );

    const kpis = {
      monitoredTalents: cross.counts?.talents || 0,
      talentsWithExtractions: cross.counts?.withCollectedMetrics || 0,
      confirmedProfiles: cross.counts?.confirmedProfiles || 0,
      verifiedSeriesCount: db.prepare('SELECT count(*) n FROM media_metric_series').get().n,
      regionalRecordsCount: cross.counts?.regionalRecords || 0,
      ibgeHubsCount: cross.counts?.demographicsMunicipalities || VERIFIED_IBGE_DEMOGRAPHICS.length
    };

    // 1. Relatório 1: Quadro Consolidado de Talentos & 4 Mídias (Extração Geral do Motor)
    const masterColumns = [
      { key: 'rank', label: '#' },
      { key: 'talent_id', label: 'ID Radar' },
      { key: 'name', label: 'Artista / Talento' },
      { key: 'category', label: 'Categoria' },
      { key: 'tier', label: 'Porte Digital' },
      { key: 'instagram_followers', label: 'Instagram (Seguidores)' },
      { key: 'instagram_growth_30d', label: 'IG Variação %' },
      { key: 'spotify_listeners', label: 'Spotify (Ouvintes Mensais)' },
      { key: 'spotify_growth_30d', label: 'Spotify Variação %' },
      { key: 'youtube_subscribers', label: 'YouTube (Inscritos)' },
      { key: 'youtube_growth_30d', label: 'YouTube Variação %' },
      { key: 'tiktok_followers', label: 'TikTok (Seguidores)' },
      { key: 'tiktok_growth_30d', label: 'TikTok Variação %' },
      { key: 'max_reach', label: 'Maior Alcance Verificado' },
      { key: 'active_networks', label: 'Mídias Ativas' },
      { key: 'latest_date', label: 'Data da Coleta' },
      { key: 'primary_source', label: 'Fonte / Procedência' },
      { key: 'governance_status', label: 'Classificação' }
    ];

    const masterRows = allTalents
      .filter(t => !network || t.media?.[network]?.value != null)
      .map((t, idx) => {
        const ig = t.media?.Instagram || {};
        const sp = t.media?.Spotify || {};
        const yt = t.media?.YouTube || {};
        const tk = t.media?.TikTok || {};
        const activeCount = ['Instagram', 'Spotify', 'YouTube', 'TikTok'].filter(n => t.media?.[n]?.value != null).length;
        const dates = [ig.observed_on, sp.observed_on, yt.observed_on, tk.observed_on].filter(Boolean).sort();
        const latestDate = dates.at(-1) || '—';
        const maxVal = t.maxNumericValue || 0;
        const tier =
          maxVal >= 10_000_000
            ? 'Mega / Consolidado (10M+)'
            : maxVal >= 1_000_000
              ? 'Grande Porte (1M–10M)'
              : maxVal >= 100_000
                ? 'Médio Porte (100k–1M)'
                : maxVal > 0
                  ? 'Emergente (<100k)'
                  : 'Catálogo (Aguardando coleta)';
        const sources = [...new Set([ig.source, sp.source, yt.source, tk.source].filter(Boolean))];
        return {
          rank: idx + 1,
          talent_id: t.id,
          name: t.name,
          category: (t.categories || []).join(' · ') || 'Geral',
          tier,
          instagram_followers: ig.value != null ? ig.value : 'Sem coleta',
          instagram_formatted: ig.formatted || 'Sem coleta',
          instagram_growth_30d: ig.growth_pct != null ? `${ig.growth_pct > 0 ? '+' : ''}${ig.growth_pct}%` : '—',
          spotify_listeners: sp.value != null ? sp.value : 'Sem coleta',
          spotify_formatted: sp.formatted || 'Sem coleta',
          spotify_growth_30d: sp.growth_pct != null ? `${sp.growth_pct > 0 ? '+' : ''}${sp.growth_pct}%` : '—',
          youtube_subscribers: yt.value != null ? yt.value : 'Sem coleta',
          youtube_formatted: yt.formatted || 'Sem coleta',
          youtube_growth_30d: yt.growth_pct != null ? `${yt.growth_pct > 0 ? '+' : ''}${yt.growth_pct}%` : '—',
          tiktok_followers: tk.value != null ? tk.value : 'Sem coleta',
          tiktok_formatted: tk.formatted || 'Sem coleta',
          tiktok_growth_30d: tk.growth_pct != null ? `${tk.growth_pct > 0 ? '+' : ''}${tk.growth_pct}%` : '—',
          max_reach: maxVal > 0 ? maxVal : 'Sem coleta',
          max_reach_formatted: maxVal > 0 ? formatCompactPtBr(maxVal) : 'Sem coleta',
          active_networks: `${activeCount}/4`,
          latest_date: latestDate,
          primary_source: sources.slice(0, 2).join(' + ') || 'Catálogo Nacional',
          governance_status: activeCount > 0 ? '✓ Dado verificado' : '— Dado indisponível'
        };
      });

    // 2. Relatório 2: Dossiê Executivo 360° de Artista (Séries Históricas + Repertório + Praças)
    let targetTalentId = talentIdParam;
    if (!db.prepare('SELECT 1 FROM talents WHERE id = ?').get(targetTalentId)) {
      targetTalentId = allTalents[0]?.id || 't-gusttavo-lima';
    }
    const artistStats = getArtistMediaStats(db, targetTalentId, { discoveryDb: ddb }) || null;
    const dossierColumns = [
      { key: 'artist_name', label: 'Artista' },
      { key: 'network', label: 'Mídia' },
      { key: 'metric_label', label: 'Indicador Principal' },
      { key: 'current_value', label: 'Valor Atual' },
      { key: 'growth_7d', label: 'Evolução 7d' },
      { key: 'growth_15d', label: 'Evolução 15d' },
      { key: 'growth_30d', label: 'Evolução 30d' },
      { key: 'secondary_info', label: 'Indicadores Secundários / Repertório' },
      { key: 'top_cities', label: 'Principais Praças Verificadas' },
      { key: 'observed_on', label: 'Data de Referência' },
      { key: 'source', label: 'Fonte Oficial / Relatório' },
      { key: 'evidence_url', label: 'URL de Evidência (HTTPS)' }
    ];
    const dossierRows = [];
    if (artistStats) {
      for (const [net, primaryKey, label] of [
        ['Instagram', 'followers', 'Seguidores'],
        ['Spotify', 'monthly_listeners', 'Ouvintes Mensais'],
        ['YouTube', 'subscribers', 'Inscritos'],
        ['TikTok', 'followers', 'Seguidores']
      ]) {
        const ns = artistStats[net] || {};
        const pObj = ns[primaryKey] || {};
        let sec = '—';
        if (net === 'Instagram') {
          sec = `Posts: ${ns.recent_posts?.formatted || '—'} · Engajamento: ${ns.engagement?.formatted || '—'}`;
        } else if (net === 'Spotify') {
          sec = `Seguidores: ${ns.followers?.formatted || '—'} · Repertório: ${ns.repertoire?.top_tracks_formatted || ns.repertoire?.formatted || '—'}`;
        } else if (net === 'YouTube') {
          sec = `Views acumuladas: ${ns.views?.formatted || '—'}`;
        } else if (net === 'TikTok') {
          sec = `Curtidas: ${ns.likes?.formatted || '—'}`;
        }
        dossierRows.push({
          artist_name: artistStats.name,
          network: net,
          metric_label: label,
          current_value: pObj.value != null ? pObj.value : 'Sem coleta',
          current_formatted: pObj.formatted || 'Sem coleta',
          growth_7d: ns.growth_7d?.formatted || 'Aguardando 2ª coleta',
          growth_15d: ns.growth_15d?.formatted || 'Aguardando série 15d',
          growth_30d: ns.growth_30d?.formatted || 'Aguardando série 30d',
          secondary_info: sec,
          top_cities: ns.top_cities?.hasData ? ns.top_cities.statusLabel : 'Sem relatório municipal',
          observed_on: pObj.observed_on || '—',
          source: pObj.source || 'Aguardando coleta',
          evidence_url: pObj.evidence_url || ns.profile_url || '—'
        });
      }
    }

    // 3. Relatório 3: Inteligência Geográfica & Polos Socioeconômicos (Audiência Regional × IBGE)
    const geoColumns = [
      { key: 'code', label: 'Código IBGE' },
      { key: 'city_name', label: 'Município / Praça' },
      { key: 'uf', label: 'UF' },
      { key: 'region', label: 'Região' },
      { key: 'population', label: 'População (IBGE)' },
      { key: 'pea_estimated', label: 'PEA Estimada (64%)' },
      { key: 'gdp_per_capita', label: 'PIB per Capita (R$)' },
      { key: 'avg_income', label: 'Renda Média (R$)' },
      { key: 'verified_audience_sum', label: 'Audiência Artística Verificada' },
      { key: 'monitored_artists_city', label: 'Artistas c/ Relatório na Praça' },
      { key: 'top_artists_in_city', label: 'Líderes Verificados na Praça' },
      { key: 'economic_profile', label: 'Perfil Econômico & Vocação de Eventos' }
    ];

    const regCityAgg = db
      .prepare(
        `SELECT a.municipality_code,
                count(DISTINCT a.talent_id) AS artists_count,
                sum(a.value) AS audience_sum,
                group_concat(DISTINCT t.name) AS artist_names
         FROM regional_audience a
         JOIN talents t ON t.id = a.talent_id
         WHERE (? = '' OR a.network = ?)
         GROUP BY a.municipality_code`
      )
      .all(network, network);
    const regCityMap = new Map(regCityAgg.map(r => [r.municipality_code, r]));

    const demoRows = db
      .prepare(
        `SELECT d.*, m.name, m.uf, m.region
         FROM municipality_demographics d
         JOIN municipalities m ON m.code = d.municipality_code
         WHERE (? = '' OR m.region = ?)
         ORDER BY d.population DESC`
      )
      .all(region, region);

    const geoSourceList = demoRows.length
      ? demoRows
      : VERIFIED_IBGE_DEMOGRAPHICS.map(d => {
          const mRow = db.prepare('SELECT region FROM municipalities WHERE code = ?').get(d.code);
          return { ...d, municipality_code: d.code, region: mRow?.region || 'Sudeste' };
        }).filter(d => !region || d.region === region);

    const geoRows = geoSourceList
      .filter(d => !q || norm(d.name).includes(q) || norm(d.uf).includes(q) || norm(d.economic_profile || '').includes(q))
      .map(d => {
        const code = d.municipality_code || d.code;
        const reg = regCityMap.get(code) || null;
        return {
          code,
          city_name: d.name,
          uf: d.uf,
          region: d.region || '—',
          population: d.population || 0,
          population_formatted: Number(d.population || 0).toLocaleString('pt-BR'),
          pea_estimated: Math.round((d.population || 0) * 0.64),
          gdp_per_capita: Number(d.gdp_per_capita || 0).toFixed(2),
          gdp_formatted: `R$ ${Number(d.gdp_per_capita || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
          avg_income: d.avg_income || 0,
          verified_audience_sum: reg ? reg.audience_sum : 'Sem relatório regional',
          verified_audience_formatted: reg ? formatCompactPtBr(reg.audience_sum) : 'Sem relatório regional',
          monitored_artists_city: reg ? reg.artists_count : 0,
          top_artists_in_city: reg?.artist_names ? reg.artist_names.split(',').slice(0, 4).join(', ') : 'Apenas contexto IBGE',
          economic_profile: d.economic_profile || 'Polo Regional IBGE'
        };
      });

    // 4. Relatório 4: Viabilidade Comercial & Simulação Financeira (Radar Score 2.0 + P&L)
    const commColumns = [
      { key: 'rank', label: '#' },
      { key: 'artist_name', label: 'Artista / Talento' },
      { key: 'category', label: 'Categoria' },
      { key: 'target_city', label: 'Praça Simulada (Raio 80km)' },
      { key: 'artistic_score', label: 'Radar Score Artístico (0-100)' },
      { key: 'territorial_score', label: 'Radar Score Territorial 2.0' },
      { key: 'confidence_score', label: 'Índice de Confiança (%)' },
      { key: 'venue_capacity', label: 'Capacidade Sugerida (Lugares)' },
      { key: 'avg_ticket', label: 'Ticket Médio Sugerido (R$)' },
      { key: 'estimated_fee', label: 'Cachê Estimado (R$)' },
      { key: 'estimated_gross_70', label: 'Receita Bruta 70% Ocup. (R$)' },
      { key: 'verdict_label', label: 'Parecer Comercial Qualificado' }
    ];

    const topCandidatesForSim = allTalents.filter(t => t.hasCollectedMetric).slice(0, 20);
    const commRows = [];
    for (const [idx, t] of topCandidatesForSim.entries()) {
      try {
        const sim = commercialCompatibility(
          db,
          new URLSearchParams({
            talent: t.id,
            city: cityCodeParam,
            radius: '80',
            days: '30'
          })
        );
        const cap = sim.financialDefaults?.venueCapacity || 2000;
        const tkPrice = sim.financialDefaults?.averageTicket || 90;
        const gross70 = Math.round(cap * 0.7 * tkPrice);
        commRows.push({
          rank: idx + 1,
          talent_id: t.id,
          artist_name: t.name,
          category: (t.categories || []).join(' · ') || 'Geral',
          target_city: `${sim.city.name}/${sim.city.uf}`,
          artistic_score: sim.threeIndependentResults?.artisticScore?.score ?? '—',
          territorial_score: sim.score != null ? sim.score : 'Aguardando regional',
          confidence_score: `${sim.confidenceIndicator?.score ?? 0}%`,
          venue_capacity: cap,
          avg_ticket: tkPrice,
          estimated_fee: sim.financialDefaults?.artistFee || 0,
          estimated_gross_70: gross70,
          verdict_label: sim.verdict?.label || 'Avaliação neutra'
        });
      } catch {}
    }

    // 5. Relatório 5: Auditoria de Extrações do Motor de Dados (Séries Verificadas, Logs & Quarentena)
    const auditColumns = [
      { key: 'timestamp', label: 'Data / Hora da Extração' },
      { key: 'talent_name', label: 'Artista / Escopo' },
      { key: 'network', label: 'Mídia / Conector' },
      { key: 'metric', label: 'Indicador' },
      { key: 'value', label: 'Valor Extraído' },
      { key: 'source', label: 'Fonte / Motor' },
      { key: 'classification', label: 'Governança' },
      { key: 'evidence_url', label: 'Evidência Auditável (HTTPS)' }
    ];

    const recentSeries = db
      .prepare(
        `SELECT s.talent_id, t.name AS talent_name, s.network, s.metric, s.observed_on, s.value,
                s.source, s.source_type, s.evidence_url, s.collected_at
         FROM media_metric_series s
         JOIN talents t ON t.id = s.talent_id
         WHERE (? = '' OR s.network = ?)
         ORDER BY s.observed_on DESC, s.value DESC
         LIMIT 120`
      )
      .all(network, network);

    const auditRows = recentSeries
      .filter(r => !q || norm(r.talent_name).includes(q) || norm(r.source).includes(q))
      .map(r => ({
        timestamp: r.observed_on || (r.collected_at || '').slice(0, 10),
        talent_name: r.talent_name,
        network: r.network,
        metric: r.metric,
        value: r.value,
        value_formatted: formatCompactPtBr(r.value),
        source: r.source,
        classification: r.source_type,
        evidence_url: r.evidence_url
      }));

    let discoveryLogs = [];
    if (ddb) {
      try {
        discoveryLogs = ddb.prepare('SELECT id, job_id, at, status, count, message FROM collection_logs ORDER BY at DESC LIMIT 25').all();
      } catch {}
    }
    const quarantineRows = db
      .prepare('SELECT * FROM metric_review_quarantine ORDER BY quarantined_at DESC LIMIT 25')
      .all();

    const catalog = [
      {
        id: 'master_talents',
        title: '1. Quadro Geral de Talentos & 4 Mídias',
        badge: 'Extração Consolidada',
        description: 'Todos os talentos monitorados com métricas de Instagram, Spotify, YouTube e TikTok, porte, variação e procedência.',
        rowsCount: masterRows.length
      },
      {
        id: 'artist_dossier',
        title: '2. Dossiê Executivo 360° do Artista',
        badge: 'Ficha Completa & Repertório',
        description: 'Extração detalhada por artista com evolução em 7/15/30 dias, repertório Spotify e principais praças verificadas.',
        rowsCount: dossierRows.length
      },
      {
        id: 'geo_ibge',
        title: '3. Inteligência Geográfica & Polos IBGE',
        badge: 'Audiência × Demografia',
        description: 'Cruzamento das praças de audiência artística com População, PEA, PIB per capita e Renda Média oficial do IBGE.',
        rowsCount: geoRows.length
      },
      {
        id: 'commercial_score',
        title: '4. Viabilidade Comercial & Radar Score 2.0',
        badge: 'Simulação P&L de Shows',
        description: 'Comparativo de contratação com Score Artístico, Score Territorial, Confiança, Capacidade, Ticket Médio e Receita.',
        rowsCount: commRows.length
      },
      {
        id: 'engine_audit',
        title: '5. Auditoria de Extrações do Motor 24/7',
        badge: 'Trilha de Procedência HTTPS',
        description: 'Séries extraídas pelo Motor de Dados com carimbo de data, classificação de governança, logs do worker e quarentena.',
        rowsCount: auditRows.length
      }
    ];

    const activeReportMap = {
      master_talents: { id: 'master_talents', title: catalog[0].title, columns: masterColumns, rows: masterRows },
      artist_dossier: { id: 'artist_dossier', title: `${catalog[1].title} — ${artistStats?.name || ''}`, columns: dossierColumns, rows: dossierRows, artistStats },
      geo_ibge: { id: 'geo_ibge', title: catalog[2].title, columns: geoColumns, rows: geoRows },
      commercial_score: { id: 'commercial_score', title: catalog[3].title, columns: commColumns, rows: commRows },
      engine_audit: { id: 'engine_audit', title: catalog[4].title, columns: auditColumns, rows: auditRows, discoveryLogs, quarantineRows }
    };

    const selectedReport = activeReportMap[reportType] || activeReportMap.master_talents;

    return {
      ok: true,
      generatedAt,
      reportType: selectedReport.id,
      kpis,
      categories,
      talentsList: (cross.items || []).map(t => ({
        id: t.id,
        name: t.name,
        hasCollectedMetric: t.hasCollectedMetric,
        category: (t.categories || [])[0] || 'Geral'
      })),
      citiesList: geoSourceList.slice(0, 85).map(c => ({
        code: c.municipality_code || c.code,
        name: `${c.name}/${c.uf}`,
        region: c.region || ''
      })),
      catalog,
      activeReport: selectedReport,
      reports: activeReportMap
    };
  } finally {
    if (closeDdb && ddb) {
      try {
        ddb.close();
      } catch {}
    }
  }
}

export async function runEngineExtractionForReports(db, { limit = 6, category = '', talentId = '', fetcher = fetch } = {}) {
  let ddb = null;
  try {
    ddb = openDiscovery();
    const cycleResult = await autoDiscoverApproveAndSyncCycle(ddb, db, {
      limit: Math.min(15, Math.max(1, Number(limit) || 6)),
      category,
      talentId,
      force: false,
      fetcher
    });
    const hub = buildReportsHub(db, new URLSearchParams({ type: 'master_talents', category }), { discoveryDb: ddb });
    return {
      ok: true,
      extractionCycle: cycleResult,
      kpis: hub.kpis,
      message: `Extração do Motor concluída! ${cycleResult.totalWithMetrics || hub.kpis.talentsWithExtractions} talentos com indicadores verificados prontos para exportação.`
    };
  } finally {
    ddb?.close();
  }
}
