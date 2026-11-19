import { attachTalentCategories } from './talent-taxonomy.mjs';
import { upsertMetricCurrent } from './registry.mjs';

export const DISCOVERY_TARGETS = [
  { category: 'Cantores', key: 'cantores', modality: 'shows', milestone100: 30, target10k: 3000 },
  { category: 'Influenciadores', key: 'influenciadores', modality: 'feiras', milestone100: 20, target10k: 2000 },
  { category: 'Humoristas', key: 'humoristas', modality: 'humor', milestone100: 10, target10k: 1000 },
  { category: 'Palestrantes', key: 'palestrantes', modality: 'palestras', milestone100: 10, target10k: 1000 },
  { category: 'Artistas', key: 'artistas', modality: 'experiencias', milestone100: 10, target10k: 1000 },
  { category: 'Peças de teatro e musicais', key: 'teatro-musicais', modality: 'teatro', milestone100: 8, target10k: 750 },
  { category: 'Infantil e família', key: 'infantil-familia', modality: 'infantil', milestone100: 7, target10k: 750 },
  { category: 'Gastronomia', key: 'gastronomia', modality: 'gastronomia', milestone100: 5, target10k: 500 }
];

export const PLATFORM_POLICIES = {
  Instagram: {
    priority: 'Máxima',
    objective: 'Seguidores e crescimento',
    mechanism: 'Wikidata / Brave Search / Sites oficiais (identificação) · Observação, CSV ou Meta Graph API (métricas)',
    precision: 'Coleta automática limitada sem conta de desenvolvedor; seguidores registrados por observação ou importação autorizada',
    fallbackStatus: 'pending_source',
    fallbackLabel: 'Coleta automática limitada · Aguardando observação ou CSV autorizado'
  },
  YouTube: {
    priority: 'Máxima',
    objective: 'Inscritos, visualizações e crescimento',
    mechanism: 'YouTube Data API v3 (channels.statistics) & YouTube Analytics',
    precision: 'Inscritos públicos arredondados pelo YouTube para 3 algarismos significativos',
    retentionDays: 30,
    policyNote: 'Retenção histórica de dados da API pública limitada a 30 dias salvo aprovação ampliada.'
  },
  Spotify: {
    priority: 'Alta',
    objective: 'Indicadores de relevância musical',
    mechanism: 'Wikidata / MusicBrainz / Brave Search (identificação) · Observação, CSV ou Spotify for Artists (métricas)',
    precision: 'Restrições de fev/2026 limitam seguidores/popularidade para apps sem quota estendida; ouvintes mensais exigem fonte autorizada.',
    fallbackStatus: 'pending_source',
    fallbackLabel: 'Fonte pendente · Dados indisponíveis'
  },
  TikTok: {
    priority: 'Alta',
    objective: 'Identificação antecipada de talentos emergentes',
    mechanism: 'Wikidata / Brave Search / Sites oficiais (identificação) · Observação, CSV ou TikTok for Artists (métricas)',
    precision: 'Exige autorização OAuth do titular, observação verificada ou fornecedor licenciado.',
    fallbackStatus: 'pending_auth',
    fallbackLabel: 'Autorização pendente · Dados indisponíveis'
  }
};

export const DEVELOPMENT_STRATEGY_7_STEPS = [
  { step: '01', title: 'Identificação automática das quatro mídias', status: 'active' },
  { step: '02', title: 'Integração MusicBrainz', status: 'active' },
  { step: '03', title: 'Busca complementar na internet (Brave Search / Sites oficiais)', status: 'active' },
  { step: '04', title: 'Aquisição de indicadores públicos permitidos (YouTube API / Observação / CSV)', status: 'active' },
  { step: '05', title: 'Validação cruzada das informações', status: 'active' },
  { step: '06', title: 'Atualização periódica', status: 'active' },
  { step: '07', title: 'Alimentação dos dashboards (Home · Oportunidades · Rankings · Mapas)', status: 'active' }
];

const MODALITY_TO_CATEGORY = {
  shows: 'Cantores',
  festivais: 'Cantores',
  humor: 'Humoristas',
  palestras: 'Palestrantes',
  teatro: 'Peças de teatro e musicais',
  infantil: 'Infantil e família',
  gastronomia: 'Gastronomia',
  feiras: 'Influenciadores',
  experiencias: 'Artistas'
};

const slugify = s =>
  't-' +
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export function enforceYouTubeRetentionPolicy(db, { referenceDay = new Date().toISOString().slice(0, 10), retentionDays = 30, extendedAccessApproved = false } = {}) {
  if (extendedAccessApproved) return { purged: 0, retentionDays, extendedAccessApproved: true };
  const cutoff = new Date(Date.parse(referenceDay + 'T00:00:00Z') - retentionDays * 86400000).toISOString().slice(0, 10);
  const res = db.prepare(
    `DELETE FROM metric_snapshots
     WHERE network = 'YouTube' AND source LIKE 'YouTube Data API%' AND observed_on < ?`
  ).run(cutoff);
  return { purged: Number(res.changes || 0), cutoff, retentionDays, extendedAccessApproved: false };
}

export function discoverTalentsFromSources(db, { candidates = [], limit = 250, now = new Date().toISOString() } = {}) {
  let discoveredFromEvents = 0;
  let discoveredFromCandidates = 0;
  let accountsLinked = 0;

  const existingNames = new Map(
    db.prepare('SELECT id, name FROM talents').all().map(t => [norm(t.name), t.id])
  );

  // 1. Descoberta automática a partir do catálogo verificado de eventos (event_listing_artists)
  const eventAttractions = db.prepare(
    `SELECT a.artist_key, a.name, e.modality_id, e.submodality_id, count(DISTINCT l.event_id) AS event_count
     FROM event_listing_artists a
     JOIN event_listings l ON l.platform_id = a.platform_id AND l.external_id = a.external_id
     JOIN events e ON e.id = l.event_id
     WHERE l.status != 'cancelled'
     GROUP BY a.artist_key
     ORDER BY event_count DESC, a.name ASC
     LIMIT ?`
  ).all(limit);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const attr of eventAttractions) {
      const key = norm(attr.name);
      if (!key || existingNames.has(key)) continue;
      let id = slugify(attr.name);
      if (db.prepare('SELECT 1 FROM talents WHERE id = ?').get(id)) {
        id = `${id}-${existingNames.size + 1}`;
      }
      db.prepare('INSERT INTO talents(id, name, entity_type, blocked) VALUES (?, ?, ?, 0)').run(id, attr.name.trim(), 'person');
      existingNames.set(key, id);

      const categoryName = MODALITY_TO_CATEGORY[attr.modality_id] || 'Artistas';
      attachTalentCategories(db, id, [categoryName]);
      if (attr.modality_id && db.prepare('SELECT 1 FROM modalities WHERE id = ?').get(attr.modality_id)) {
        db.prepare('INSERT OR IGNORE INTO talent_modalities(talent_id, modality_id) VALUES (?, ?)').run(id, attr.modality_id);
        if (attr.submodality_id != null) {
          db.prepare('INSERT OR IGNORE INTO talent_submodalities(talent_id, modality_id, submodality_id) VALUES (?, ?, ?)').run(id, attr.modality_id, attr.submodality_id);
        }
      }
      discoveredFromEvents++;
    }

    // 2. Descoberta a partir de lista estruturada/fornecedores autorizados
    for (const c of candidates) {
      if (!c || typeof c.name !== 'string' || !c.name.trim()) continue;
      const key = norm(c.name);
      let talentId = c.id || existingNames.get(key) || slugify(c.name);
      const exists = db.prepare('SELECT id FROM talents WHERE id = ?').get(talentId);
      if (!exists && !existingNames.has(key)) {
        db.prepare('INSERT INTO talents(id, name, entity_type, blocked) VALUES (?, ?, ?, 0)').run(talentId, c.name.trim(), c.entity_type || 'person');
        existingNames.set(key, talentId);
        discoveredFromCandidates++;
      } else if (existingNames.has(key)) {
        talentId = existingNames.get(key);
      }
      if (Array.isArray(c.categories) && c.categories.length) {
        attachTalentCategories(db, talentId, c.categories);
      }
      for (const mod of c.modalities ?? []) {
        if (db.prepare('SELECT 1 FROM modalities WHERE id = ?').get(mod)) {
          db.prepare('INSERT OR IGNORE INTO talent_modalities(talent_id, modality_id) VALUES (?, ?)').run(talentId, mod);
        }
      }
      for (const acc of c.accounts ?? []) {
        if (!acc || !['Instagram', 'YouTube', 'Spotify', 'TikTok'].includes(acc.network) || !acc.url) continue;
        const accId = acc.id || `${talentId}-${acc.network.toLowerCase().slice(0, 2)}`;
        const source = acc.identity_source || 'Descoberta verificada';
        db.prepare('INSERT OR IGNORE INTO commercial_accounts(id, talent_id, network, url, identity_source) VALUES (?, ?, ?, ?, ?)').run(
          accId,
          talentId,
          acc.network,
          acc.url.replace(/\/$/, ''),
          source
        );
        if (['Instagram', 'YouTube', 'Spotify'].includes(acc.network)) {
          const extId = acc.external_id || acc.url.split('/').filter(Boolean).at(-1)?.replace(/^@/, '') || accId;
          db.prepare(
            `INSERT OR IGNORE INTO social_accounts(id, talent_id, network, external_id, url, identity_confirmed, identity_source, collection_state)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(accId, talentId, acc.network, extId, acc.url.replace(/\/$/, ''), acc.identity_confirmed ?? 1, source, acc.status === 'available' ? 'collected' : 'queued');
        }
        const primaryMetric = { Instagram: 'followers', YouTube: 'subscribers', Spotify: 'monthly_listeners', TikTok: 'followers' }[acc.network];
        upsertMetricCurrent(db, {
          account_id: accId,
          talent_id: talentId,
          network: acc.network,
          metric: acc.metric || primaryMetric,
          value: acc.value ?? null,
          observed_on: acc.observed_on ?? null,
          collected_at: now,
          source: acc.source || source,
          status: acc.status || (acc.value != null ? 'available' : PLATFORM_POLICIES[acc.network]?.fallbackStatus || 'pending_source'),
          status_detail: acc.status_detail || (acc.value != null ? 'Atualizado' : PLATFORM_POLICIES[acc.network]?.fallbackLabel || 'Pendente')
        });
        accountsLinked++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    discoveredFromEvents,
    discoveredFromCandidates,
    accountsLinked,
    totalTalents: db.prepare('SELECT count(*) AS n FROM talents WHERE blocked = 0').get().n
  };
}

export function discoveryStatus(db) {
  const totalTalents = db.prepare('SELECT count(*) AS n FROM talents WHERE blocked = 0').get().n;
  const socialAccounts = db.prepare('SELECT count(*) AS n FROM social_accounts WHERE identity_confirmed = 1').get().n;
  const commercialAccounts = db.prepare('SELECT count(*) AS n FROM commercial_accounts').get().n;
  const currentMetrics = db.prepare('SELECT count(*) AS n FROM metric_current WHERE status = \'available\' AND value IS NOT NULL').get().n;
  const pendingMetrics = db.prepare('SELECT count(*) AS n FROM metric_current WHERE status IN (\'pending_source\',\'pending_auth\')').get().n;
  const nationalSnapshots = db.prepare('SELECT count(*) AS n FROM metric_snapshots').get().n;
  const commercialSnapshots = db.prepare('SELECT count(*) AS n FROM commercial_snapshots').get().n;
  const regionalRecords = db.prepare('SELECT count(*) AS n FROM regional_audience').get().n;

  const catCounts = new Map(
    db.prepare(
      `SELECT c.name, count(DISTINCT t.id) AS n
       FROM categories c
       LEFT JOIN talent_categories tc ON tc.category_id = c.id
       LEFT JOIN talents t ON t.id = tc.talent_id AND t.blocked = 0
       GROUP BY c.id`
    ).all().map(r => [r.name, r.n])
  );

  const categories = DISCOVERY_TARGETS.map(t => {
    const current = catCounts.get(t.category) ?? 0;
    return {
      category: t.category,
      key: t.key,
      current,
      milestone100: t.milestone100,
      target10k: t.target10k,
      milestone100Pct: Math.min(100, Math.round((current / Math.max(1, t.milestone100)) * 100)),
      target10kPct: Number(((current / t.target10k) * 100).toFixed(2))
    };
  });

  const milestones = [
    { phase: 1, label: 'Validação Inicial (100 artistas)', target: 100, reached: totalTalents >= 100 },
    { phase: 2, label: 'Expansão Regional (500 artistas)', target: 500, reached: totalTalents >= 500 },
    { phase: 3, label: 'Cobertura Multi-Plataforma (2.000 artistas)', target: 2000, reached: totalTalents >= 2000 },
    { phase: 4, label: 'Meta Nacional (10.000 talentos)', target: 10000, reached: totalTalents >= 10000 }
  ];

  return {
    totalTalents,
    targetTotal: 10000,
    currentMilestone: milestones.find(m => !m.reached) || milestones.at(-1),
    milestones,
    categories,
    databaseStructures: {
      metric_current: { available: currentMetrics, pending: pendingMetrics },
      metric_snapshots: { national: nationalSnapshots, commercial: commercialSnapshots },
      accounts: { socialConfirmed: socialAccounts, commercial: commercialAccounts },
      regional_audience: { records: regionalRecords }
    },
    platformPolicies: PLATFORM_POLICIES,
    developmentStrategy: DEVELOPMENT_STRATEGY_7_STEPS
  };
}
