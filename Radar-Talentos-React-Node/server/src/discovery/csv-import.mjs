import { importCommercial } from '../commercial.mjs';
import { importRegionalReport } from '../regional-dashboard.mjs';
import { upsertMetricCurrent } from '../registry.mjs';

const NETWORKS = ['Instagram', 'YouTube', 'Spotify', 'TikTok'];
const METRIC_ALIASES = {
  followers: 'followers',
  seguidores: 'followers',
  subscribers: 'subscribers',
  inscritos: 'subscribers',
  monthly_listeners: 'monthly_listeners',
  ouvintes_mensais: 'monthly_listeners',
  'ouvintes mensais': 'monthly_listeners',
  listeners: 'listeners',
  ouvintes: 'listeners',
  views: 'views',
  visualizacoes: 'views',
  visualizações: 'views',
  streams: 'streams',
  reproducoes: 'streams',
  reproduções: 'streams',
  reach: 'reach',
  alcance: 'reach',
  likes: 'likes',
  curtidas: 'likes',
  comments: 'comments',
  comentarios: 'comments',
  comentários: 'comments'
};

const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const slugify = s =>
  't-' +
  norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function parseCsvLine(line, delimiter = ',') {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseCsvTable(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('Conteúdo CSV vazio ou inválido');
  }
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) {
    throw new Error('CSV deve conter cabeçalho e pelo menos uma linha de dados');
  }
  const firstLine = lines[0];
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';
  const headers = parseCsvLine(firstLine, delimiter).map(h =>
    norm(h).replace(/[^a-z0-9]+/g, '_')
  );
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] ?? '';
    }
    rows.push(obj);
  }
  return { headers, rows };
}

function normalizeNetwork(raw) {
  const n = norm(raw);
  return NETWORKS.find(net => norm(net) === n) || null;
}

function normalizeMetric(raw, network, mode = 'national') {
  const m = METRIC_ALIASES[norm(raw)] || norm(raw);
  if (!m) {
    if (mode === 'regional') {
      return { Instagram: 'followers', YouTube: 'views', Spotify: 'listeners', TikTok: 'followers' }[network];
    }
    return { Instagram: 'followers', YouTube: 'subscribers', Spotify: 'monthly_listeners', TikTok: 'followers' }[network];
  }
  return m;
}

function parseCleanInt(raw) {
  const s = String(raw ?? '').replace(/[.\s]/g, '').replace(/,/g, '').trim();
  if (!/^\d+$/.test(s)) throw new Error(`Valor numérico inválido no CSV: "${raw}"`);
  const val = Number(s);
  if (!Number.isSafeInteger(val) || val < 0) throw new Error(`Valor fora do intervalo permitido: "${raw}"`);
  return val;
}

/**
 * Importa CSV de métricas nacionais / perfis observados ou fornecidos pelos artistas.
 * Colunas aceitas (flexíveis em PT/EN):
 * - id / talent_id / artist_id (opcional)
 * - name / nome / artist / artista (obrigatório)
 * - network / midia / rede (Instagram, YouTube, Spotify, TikTok)
 * - url / link / perfil (URL HTTPS oficial)
 * - metric / metrica / indicador (followers, subscribers, monthly_listeners, views, streams, etc.)
 * - value / valor (inteiro >= 0; se vazio ou "pendente", vincula o perfil e sinaliza limitação sem inventar número!)
 * - observed_on / data / date (YYYY-MM-DD)
 * - source / fonte (opcional)
 * - category / categoria (opcional)
 * - modality / modalidade (opcional)
 */
export function importNationalCsv(db, csvText, {
  authorization_ref = 'Importação de CSV / Relatório fornecido pelo artista',
  default_day = new Date().toISOString().slice(0, 10),
  default_source = 'Observação autorizada / CSV'
} = {}) {
  const { rows } = parseCsvTable(csvText);
  const byArtist = new Map();
  const pendingProfiles = [];

  for (const r of rows) {
    const name = (r.name || r.nome || r.artist || r.artista || '').trim();
    if (!name) throw new Error('Coluna de nome do artista (name/nome/artista) é obrigatória em todas as linhas');
    const network = normalizeNetwork(r.network || r.midia || r.rede);
    if (!network) throw new Error(`Mídia inválida no CSV: "${r.network || r.midia || r.rede}"`);
    const url = (r.url || r.link || r.perfil || '').trim();
    if (!url) throw new Error(`URL oficial obrigatória para ${name} (${network})`);
    const id = (r.id || r.talent_id || r.artist_id || '').trim() || slugify(name);
    const metric = normalizeMetric(r.metric || r.metrica || r.indicador, network, 'national');
    const observedOn = (r.observed_on || r.data || r.date || default_day).trim();
    const source = (r.source || r.fonte || default_source).trim();
    const identitySource = (r.identity_source || r.evidencia || url).trim();
    const rawVal = (r.value ?? r.valor ?? '').trim();
    const categories = (r.category || r.categoria || '').split('|').map(x => x.trim()).filter(Boolean);
    const modalities = (r.modality || r.modalidade || '').split('|').map(x => x.trim()).filter(Boolean);

    const cleanUrl = url.replace(/\/$/, '');
    const noWwwUrl = cleanUrl.replace('https://www.', 'https://');
    const wwwUrl = noWwwUrl.replace('https://', 'https://www.');
    const existingAcct = db.prepare('SELECT id, talent_id, url FROM commercial_accounts WHERE network = ? AND rtrim(url, \'/\') IN (?, ?)').get(network, noWwwUrl, wwwUrl);
    if (existingAcct && existingAcct.talent_id !== id) {
      throw new Error(`Conta ${network} (${url}) já está associada a outro talento (${existingAcct.talent_id})`);
    }
    const accId = (r.account_id || '').trim() || existingAcct?.id || `${id}-${network.toLowerCase().slice(0, 2)}`;
    const targetUrl = existingAcct?.url || cleanUrl;

    if (rawVal === '' || ['pendente', 'indisponivel', 'indisponível', 'null', '-', '—'].includes(norm(rawVal))) {
      pendingProfiles.push({
        id,
        name,
        categories,
        modalities,
        account_id: accId,
        network,
        url: targetUrl,
        metric,
        source,
        identity_source: identitySource
      });
      continue;
    }

    const value = parseCleanInt(rawVal);
    if (!byArtist.has(id)) {
      byArtist.set(id, { id, name, categories: new Set(), modalities: new Set(), accounts: new Map() });
    }
    const artist = byArtist.get(id);
    categories.forEach(c => artist.categories.add(c));
    modalities.forEach(m => artist.modalities.add(m));

    if (!artist.accounts.has(accId)) {
      artist.accounts.set(accId, {
        id: accId,
        network,
        url: targetUrl,
        identity_source: identitySource,
        snapshots: []
      });
    }
    artist.accounts.get(accId).snapshots.push({
      metric,
      value,
      observed_on: observedOn,
      source
    });
  }

  let snapshotsImported = 0;
  if (byArtist.size > 0) {
    const batch = {
      authorization_ref,
      artists: [...byArtist.values()].map(a => ({
        id: a.id,
        name: a.name,
        categories: [...a.categories],
        modalities: [...a.modalities],
        accounts: [...a.accounts.values()]
      }))
    };
    snapshotsImported = importCommercial(db, batch, { day: default_day, allowIntradayUpdate: true });
  }

  let pendingLinked = 0;
  if (pendingProfiles.length > 0) {
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of pendingProfiles) {
        const existing = db.prepare('SELECT id, name, blocked FROM talents WHERE id = ?').get(p.id);
        if (!existing) {
          db.prepare('INSERT INTO talents(id, name, entity_type, blocked) VALUES (?, ?, ?, 0)').run(p.id, p.name, 'person');
        }
        const cleanUrl = p.url.replace(/\/$/, '');
        db.prepare('INSERT OR IGNORE INTO commercial_accounts(id, talent_id, network, url, identity_source) VALUES (?, ?, ?, ?, ?)').run(
          p.account_id,
          p.id,
          p.network,
          cleanUrl,
          p.identity_source
        );
        const cur = db.prepare('SELECT value FROM metric_current WHERE account_id = ? AND metric = ?').get(p.account_id, p.metric);
        if (!cur) {
          const st = p.network === 'TikTok' ? 'pending_auth' : 'pending_source';
          const detail = p.network === 'TikTok'
            ? 'Autorização pendente · Coleta automática limitada sem conta de desenvolvedor'
            : 'Fonte pendente · Coleta automática limitada sem conta de desenvolvedor';
          upsertMetricCurrent(db, {
            account_id: p.account_id,
            talent_id: p.id,
            network: p.network,
            metric: p.metric,
            value: null,
            observed_on: null,
            collected_at: now,
            source: p.source,
            status: st,
            status_detail: detail
          });
        }
        pendingLinked++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return {
    artistsProcessed: byArtist.size,
    snapshotsImported,
    pendingProfilesLinked: pendingLinked,
    authorization_ref
  };
}

/**
 * Importa CSV de relatórios regionais (audiência por município) fornecidos pelos artistas.
 * Colunas aceitas:
 * - talent_id / id / artist / artista / nome
 * - network / midia / rede (Instagram, YouTube, Spotify, TikTok)
 * - metric / metrica (views, followers, listeners, streams, reach)
 * - municipality_code / codigo_ibge / ibge OU city / cidade + uf / estado
 * - value / valor (inteiro >= 0)
 * - period_start / inicio (YYYY-MM-DD)
 * - period_end / fim (YYYY-MM-DD)
 * - source / fonte (ex: Spotify for Artists, Instagram Insights, Relatório do Artista)
 * - quality / qualidade (verified ou estimated; padrão: verified)
 */
export function importRegionalCsv(db, csvText, {
  authorization_ref = 'Relatório regional fornecido pelo artista via CSV',
  report_ref = 'csv-regional-' + new Date().toISOString().slice(0, 10),
  coverage = 'partial'
} = {}) {
  const { rows } = parseCsvTable(csvText);
  const allMunis = db.prepare('SELECT code, name, uf FROM municipalities').all();
  const muniByNameUf = new Map(allMunis.map(m => [`${norm(m.name)}|${norm(m.uf)}`, m.code]));
  const muniByCode = new Set(allMunis.map(m => String(m.code)));

  const groups = new Map();

  for (const r of rows) {
    const rawTalent = (r.talent_id || r.id || r.artist || r.artista || r.nome || r.name || '').trim();
    if (!rawTalent) throw new Error('Identificador ou nome do artista obrigatório no CSV regional');

    let talent = db.prepare('SELECT id, name FROM talents WHERE id = ? AND blocked = 0').get(rawTalent);
    if (!talent) {
      talent = db.prepare('SELECT id, name FROM talents WHERE lower(trim(name)) = lower(trim(?)) AND blocked = 0').get(rawTalent);
    }
    if (!talent) throw new Error(`Artista não localizado no cadastro ativo: "${rawTalent}"`);

    const network = normalizeNetwork(r.network || r.midia || r.rede);
    if (!network) throw new Error(`Mídia inválida no CSV regional: "${r.network || r.midia || r.rede}"`);

    const metric = normalizeMetric(r.metric || r.metrica || r.indicador, network, 'regional');
    const period_start = (r.period_start || r.inicio || r.start || '').trim();
    const period_end = (r.period_end || r.fim || r.end || '').trim();
    const source = (r.source || r.fonte || `Relatório ${network} fornecido pelo artista`).trim();
    const quality = norm(r.quality || r.qualidade) === 'estimated' ? 'estimated' : 'verified';

    let code = (r.municipality_code || r.codigo_ibge || r.ibge || '').trim();
    if (!code) {
      const city = norm(r.city || r.cidade || r.municipio || r.município || '');
      const uf = norm(r.uf || r.estado || '');
      code = muniByNameUf.get(`${city}|${uf}`) || '';
    }
    if (!code || !muniByCode.has(code)) {
      throw new Error(`Município não localizado na Base Geográfica Nacional: "${r.municipality_code || r.city || r.cidade || ''}/${r.uf || ''}"`);
    }

    const value = parseCleanInt(r.value ?? r.valor);
    const key = JSON.stringify([talent.id, network, metric, period_start, period_end, source, quality]);
    if (!groups.has(key)) {
      groups.set(key, {
        talent_id: talent.id,
        network,
        metric,
        period_start,
        period_end,
        source,
        quality,
        report_ref: (r.report_ref || report_ref).trim(),
        authorization_ref: (r.authorization_ref || authorization_ref).trim(),
        coverage: (r.coverage || coverage).trim(),
        rows: []
      });
    }
    groups.get(key).rows.push({ municipality_code: code, value });
  }

  let totalMunicipalities = 0;
  let reportsImported = 0;
  for (const report of groups.values()) {
    const res = importRegionalReport(db, report);
    totalMunicipalities += res.imported;
    reportsImported++;
  }

  return {
    reportsImported,
    totalMunicipalities,
    authorization_ref
  };
}
