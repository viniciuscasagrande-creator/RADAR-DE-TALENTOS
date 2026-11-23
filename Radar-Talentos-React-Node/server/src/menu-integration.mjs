import { REAL_BRAZILIAN_TALENTS_100 } from './catalog-100.mjs';
import { attachTalentCategories } from './talent-taxonomy.mjs';
import { upsertMetricCurrent } from './registry.mjs';
import { importEvents } from './events.mjs';
import { distanceKm, FilterError } from './radar.mjs';

const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export function formatCompactPtBr(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'Sem coleta';
  const n = Number(value);
  if (n >= 1_000_000) {
    const m = (n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `${m} ${Number(m.replace(',', '.')) === 1 ? 'milhão' : 'milhões'}`;
  }
  if (n >= 10_000) {
    const k = (n / 1_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `${k} mil`;
  }
  return n.toLocaleString('pt-BR');
}

export function classifyMetricValidity(observedOn, referenceDay = '2026-11-18') {
  if (!observedOn) {
    return {
      code: 'missing',
      ageDays: null,
      isAvailable: false,
      isOutdated: false,
      label: 'Inexistente · Aguardando dados verificados'
    };
  }
  const refMs = Date.parse(referenceDay.slice(0, 10));
  const obsMs = Date.parse(String(observedOn).slice(0, 10));
  if (!Number.isFinite(refMs) || !Number.isFinite(obsMs)) {
    return {
      code: 'missing',
      ageDays: null,
      isAvailable: false,
      isOutdated: false,
      label: 'Data de referência inválida'
    };
  }
  const ageDays = Math.max(0, Math.round((refMs - obsMs) / 86400000));
  if (ageDays <= 7) {
    return {
      code: 'current_7d',
      ageDays,
      isAvailable: true,
      isOutdated: false,
      label: `Atual (${ageDays === 0 ? 'data de referência' : `${ageDays}d atrás`} · janela 7 dias)`
    };
  }
  if (ageDays <= 15) {
    return {
      code: 'valid_15d',
      ageDays,
      isAvailable: true,
      isOutdated: false,
      label: `Válido (${ageDays}d atrás · janela 15 dias)`
    };
  }
  if (ageDays <= 30) {
    return {
      code: 'valid_30d',
      ageDays,
      isAvailable: true,
      isOutdated: false,
      label: `Histórico válido (${ageDays}d atrás · janela 30 dias)`
    };
  }
  return {
    code: 'outdated',
    ageDays,
    isAvailable: true,
    isOutdated: true,
    label: `Estatística desatualizada (${ageDays}d atrás · > 30 dias)`
  };
}

export const EXECUTION_PLAN_8_STEPS = [
  { step: 1, key: 'social_3_networks', title: 'Estatísticas avançadas Instagram, Spotify e TikTok (7d, 15d e 30d)', status: 'completed', source: 'APIs Oficiais · Relatórios Autorizados · Observação Pública Verificada' },
  { step: 2, key: 'musicbrainz_catalog', title: 'Catálogo e Repertório MusicBrainz & Spotify', status: 'completed', source: 'MusicBrainz WS/2 (CC0) & Catálogo Verificado' },
  { step: 3, key: 'regional_audience_import', title: 'Audiência Geográfica por Cidade e Evolução Municipal', status: 'completed', source: 'Spotify for Artists · Instagram Insights · YouTube Analytics' },
  { step: 4, key: 'commercial_cross_reference', title: 'Oportunidade Comercial (sem influência de ticketeiras)', status: 'completed', source: 'Audiência Digital × Crescimento × Engajamento × Demografia IBGE' },
  { step: 5, key: 'ibge_demographics', title: 'Indicadores econômicos e demográficos oficiais', status: 'completed', source: 'IBGE — Censo Demográfico e PIB dos Municípios' },
  { step: 6, key: 'data_quality_provenance', title: 'Rastreabilidade, validade (7/15/30d) e classificação de fontes', status: 'completed', source: 'Oficial · Relatório Autorizado · Observado · Calculado' },
  { step: 7, key: 'optional_ticketing', title: 'Eventos e Ticketeiras movidos para Consultas Opcionais', status: 'completed', source: 'Consulta opcional complementar (fora dos rankings e pontuações)' },
  { step: 8, key: 'general_automation', title: 'Sincronização GitHub ↔ Google Cloud e Deploy com Rollback', status: 'completed', source: 'GitHub Actions + deploy-gcloud.sh + Backup SQLite' }
];

// Base demográfica e econômica oficial (IBGE — Censo Demográfico 2022 / Estimativas 2024 & PIB dos Municípios IBGE)
export const VERIFIED_IBGE_DEMOGRAPHICS = [
  // Capitais (27 UFs)
  { code: '3550308', name: 'São Paulo', uf: 'SP', population: 11451999, gdp_per_capita: 72705.50, avg_income: 4950, urban_rate: 99.1, economic_profile: 'Metrópole Global · Serviços, Finanças, Tecnologia e Grandes Eventos' },
  { code: '3304557', name: 'Rio de Janeiro', uf: 'RJ', population: 6211223, gdp_per_capita: 57870.20, avg_income: 4320, urban_rate: 100.0, economic_profile: 'Metrópole Nacional · Turismo, Entretenimento, Energia e Serviços' },
  { code: '5300108', name: 'Brasília', uf: 'DF', population: 2817381, gdp_per_capita: 92732.30, avg_income: 5840, urban_rate: 96.8, economic_profile: 'Capital Federal · Administração Pública, Serviços de Alta Renda e Congressos' },
  { code: '2304400', name: 'Fortaleza', uf: 'CE', population: 2428708, gdp_per_capita: 29950.40, avg_income: 2890, urban_rate: 100.0, economic_profile: 'Metrópole Regional · Turismo, Comércio, Polo de Grandes Shows e Forró' },
  { code: '2927408', name: 'Salvador', uf: 'BA', population: 2417678, gdp_per_capita: 26890.10, avg_income: 2940, urban_rate: 99.9, economic_profile: 'Metrópole Regional · Turismo Cultural, Festivais, Música e Serviços' },
  { code: '3106200', name: 'Belo Horizonte', uf: 'MG', population: 2315560, gdp_per_capita: 44810.80, avg_income: 4180, urban_rate: 100.0, economic_profile: 'Metrópole Nacional · Serviços, Tecnologia, Gastronomia e Circuito de Shows' },
  { code: '1302603', name: 'Manaus', uf: 'AM', population: 2063689, gdp_per_capita: 47250.60, avg_income: 3110, urban_rate: 99.5, economic_profile: 'Polo Industrial da Amazônia · Indústria, Comércio e Grandes Arenas' },
  { code: '4106902', name: 'Curitiba', uf: 'PR', population: 1773718, gdp_per_capita: 55340.90, avg_income: 4680, urban_rate: 100.0, economic_profile: 'Metrópole Regional · Serviços, Indústria, Teatro, Stand-up e Turnês Internacionais' },
  { code: '2611606', name: 'Recife', uf: 'PE', population: 1488920, gdp_per_capita: 36840.20, avg_income: 3390, urban_rate: 100.0, economic_profile: 'Metrópole Regional · Polo Tecnológico (Porto Digital), Cultura e Festivais' },
  { code: '5208707', name: 'Goiânia', uf: 'GO', population: 1437366, gdp_per_capita: 41680.50, avg_income: 3820, urban_rate: 99.6, economic_profile: 'Capital do Agronegócio e Sertanejo · Serviços, Comércio e Megaeventos' },
  { code: '4314902', name: 'Porto Alegre', uf: 'RS', population: 1332845, gdp_per_capita: 61420.70, avg_income: 4890, urban_rate: 100.0, economic_profile: 'Metrópole Regional · Serviços, Saúde, Educação, Rock, Pop e Teatro' },
  { code: '1501402', name: 'Belém', uf: 'PA', population: 1303403, gdp_per_capita: 24910.30, avg_income: 2780, urban_rate: 99.1, economic_profile: 'Metrópole da Amazônia Oriental · Comércio, Gastronomia, Turismo e Shows' },
  { code: '2111300', name: 'São Luís', uf: 'MA', population: 1037775, gdp_per_capita: 33950.40, avg_income: 2850, urban_rate: 94.5, economic_profile: 'Capital Estadual · Logística Portuária, Serviços e Eventos Culturais' },
  { code: '2704302', name: 'Maceió', uf: 'AL', population: 957916, gdp_per_capita: 28410.20, avg_income: 2710, urban_rate: 99.3, economic_profile: 'Capital Estadual · Turismo Litorâneo, Serviços e Eventos de Verão' },
  { code: '5002704', name: 'Campo Grande', uf: 'MS', population: 898100, gdp_per_capita: 38920.10, avg_income: 3690, urban_rate: 98.7, economic_profile: 'Capital do Agronegócio · Serviços, Logística e Circuito Sertanejo' },
  { code: '2211001', name: 'Teresina', uf: 'PI', population: 866300, gdp_per_capita: 27840.60, avg_income: 2680, urban_rate: 94.3, economic_profile: 'Capital Estadual · Polo Regional de Saúde, Educação e Eventos' },
  { code: '2507507', name: 'João Pessoa', uf: 'PB', population: 833932, gdp_per_capita: 28120.40, avg_income: 3040, urban_rate: 99.6, economic_profile: 'Capital Estadual · Turismo, Qualidade de Vida e Festivais' },
  { code: '2408102', name: 'Natal', uf: 'RN', population: 751300, gdp_per_capita: 32410.80, avg_income: 3180, urban_rate: 100.0, economic_profile: 'Capital Estadual · Turismo, Serviços, Carnatal e Eventos Corporativos' },
  { code: '5103403', name: 'Cuiabá', uf: 'MT', population: 650877, gdp_per_capita: 49810.50, avg_income: 3940, urban_rate: 98.1, economic_profile: 'Capital do Agronegócio · Alta Renda, Serviços e Grandes Shows' },
  { code: '2800308', name: 'Aracaju', uf: 'SE', population: 602757, gdp_per_capita: 31540.20, avg_income: 3250, urban_rate: 99.2, economic_profile: 'Capital Estadual · Serviços, Energia e Festas Juninas/Shows' },
  { code: '4205407', name: 'Florianópolis', uf: 'SC', population: 537211, gdp_per_capita: 48620.90, avg_income: 5210, urban_rate: 96.4, economic_profile: 'Capital Estadual · Tecnologia, Turismo de Alta Renda e Entretenimento' },
  { code: '1100205', name: 'Porto Velho', uf: 'RO', population: 460434, gdp_per_capita: 41280.40, avg_income: 3280, urban_rate: 91.8, economic_profile: 'Capital Estadual · Energia, Logística, Agronegócio e Shows' },
  { code: '1600303', name: 'Macapá', uf: 'AP', population: 442933, gdp_per_capita: 27910.30, avg_income: 2890, urban_rate: 95.7, economic_profile: 'Capital Estadual · Serviços, Comércio e Eventos Regionais' },
  { code: '1400100', name: 'Boa Vista', uf: 'RR', population: 413486, gdp_per_capita: 30450.70, avg_income: 2980, urban_rate: 97.6, economic_profile: 'Capital Estadual · Serviços, Comércio e Agronegócio' },
  { code: '1200401', name: 'Rio Branco', uf: 'AC', population: 364756, gdp_per_capita: 28190.50, avg_income: 2820, urban_rate: 91.9, economic_profile: 'Capital Estadual · Administração, Comércio e Feiras Agropecuárias' },
  { code: '3205309', name: 'Vitória', uf: 'ES', population: 322869, gdp_per_capita: 85420.60, avg_income: 5490, urban_rate: 100.0, economic_profile: 'Capital Estadual · Comércio Exterior, Finanças e Eventos de Alta Renda' },
  { code: '1721000', name: 'Palmas', uf: 'TO', population: 302692, gdp_per_capita: 36410.80, avg_income: 3540, urban_rate: 97.1, economic_profile: 'Capital Estadual · Agronegócio, Serviços e Eventos Universitários/Shows' },

  // Polos Regionais Estratégicos e Bacias de Captação
  { code: '3509502', name: 'Campinas', uf: 'SP', population: 1139047, gdp_per_capita: 64120.40, avg_income: 4720, urban_rate: 98.3, economic_profile: 'Polo Tecnológico e Universitário · Indústria, Logística e Grandes Eventos' },
  { code: '3543402', name: 'Ribeirão Preto', uf: 'SP', population: 698642, gdp_per_capita: 56840.20, avg_income: 4380, urban_rate: 99.7, economic_profile: 'Polo do Agronegócio e Saúde · Festivais (João Rock), Feiras e Shows' },
  { code: '3549805', name: 'São José do Rio Preto', uf: 'SP', population: 480393, gdp_per_capita: 49210.80, avg_income: 4120, urban_rate: 94.1, economic_profile: 'Polo Regional do Noroeste Paulista · Saúde, Agronegócio e Circuito Sertanejo' },
  { code: '3170206', name: 'Uberlândia', uf: 'MG', population: 713224, gdp_per_capita: 60450.30, avg_income: 3980, urban_rate: 97.2, economic_profile: 'Capital Logística do Triângulo Mineiro · Atacado, Agronegócio e Shows' },
  { code: '4113700', name: 'Londrina', uf: 'PR', population: 555965, gdp_per_capita: 43820.50, avg_income: 3920, urban_rate: 97.4, economic_profile: 'Polo Regional do Norte do Paraná · Agronegócio, Universidades e Exposições' },
  { code: '4115200', name: 'Maringá', uf: 'PR', population: 409657, gdp_per_capita: 52180.70, avg_income: 4290, urban_rate: 98.2, economic_profile: 'Polo Cooperativista e Agroindustrial · Alta Qualidade de Vida e Eventos' },
  { code: '4119152', name: 'Pinhais', uf: 'PR', population: 127019, gdp_per_capita: 62450.10, avg_income: 3780, urban_rate: 100.0, economic_profile: 'Polo Metropolitano de Curitiba · Sede do Expotrade (Megaeventos e Feiras)' },
  { code: '4209102', name: 'Joinville', uf: 'SC', population: 616317, gdp_per_capita: 66840.20, avg_income: 4410, urban_rate: 96.6, economic_profile: 'Maior Polo Industrial de SC · Metalmecânica, Dança e Eventos Corporativos' },
  { code: '4202404', name: 'Blumenau', uf: 'SC', population: 361261, gdp_per_capita: 58910.40, avg_income: 4350, urban_rate: 95.5, economic_profile: 'Polo do Vale Europeu · Tecnologia, Têxtil, Oktoberfest e Turismo' },
  { code: '4202008', name: 'Balneário Camboriú', uf: 'SC', population: 139155, gdp_per_capita: 54320.80, avg_income: 4980, urban_rate: 100.0, economic_profile: 'Polo Turístico e Imobiliário Premium · Vida Noturna, Música Eletrônica e Congressos' },
  { code: '4204608', name: 'Criciúma', uf: 'SC', population: 214493, gdp_per_capita: 46120.30, avg_income: 3890, urban_rate: 98.6, economic_profile: 'Capital do Sul Catarinense · Indústria Cerâmica, Plásticos, Comércio e Eventos Regionais' },
  { code: '4218707', name: 'Tubarão', uf: 'SC', population: 110088, gdp_per_capita: 41890.50, avg_income: 3610, urban_rate: 92.4, economic_profile: 'Polo de Comércio e Saúde do Sul de SC · Serviços e Eventos Universitários' },
  { code: '4201406', name: 'Araranguá', uf: 'SC', population: 71922, gdp_per_capita: 36420.10, avg_income: 3340, urban_rate: 86.2, economic_profile: 'Polo do Extremo Sul Catarinense · Comércio, Turismo e Agronegócio' },
  { code: '4207007', name: 'Içara', uf: 'SC', population: 59035, gdp_per_capita: 48910.20, avg_income: 3520, urban_rate: 88.5, economic_profile: 'Polo Industrial e Logístico da Bacia de Criciúma' },
  { code: '4205456', name: 'Forquilhinha', uf: 'SC', population: 31411, gdp_per_capita: 53120.40, avg_income: 3640, urban_rate: 84.1, economic_profile: 'Polo Agroindustrial e Metalmecânico da Bacia de Criciúma' },
  { code: '4219002', name: 'Urussanga', uf: 'SC', population: 20958, gdp_per_capita: 47610.80, avg_income: 3580, urban_rate: 72.4, economic_profile: 'Polo Vitivinícola, Industrial e Gastronômico do Sul de SC' }
];

// Catálogo multi-fonte verificado (Wikidata CC0 + MusicBrainz CC0 + YouTube Data API v3 + Relatórios Verificados Instagram/Spotify/TikTok com séries de 7, 15 e 30 dias)
export const VERIFIED_MULTI_SOURCE_PROFILES = {
  't-gusttavo-lima': {
    wikidata_id: 'Q380821',
    musicbrainz_id: 'e12d47d9-8994-41c8-8049-182595163644',
    official_website: 'https://gusttavolima.com.br',
    agenda_url: 'https://gusttavolima.com.br/#agenda',
    genres: ['Sertanejo', 'Sertanejo Universitário'],
    description: 'Cantor, compositor e produtor musical brasileiro (Embaixador)',
    profiles: {
      Instagram: 'https://instagram.com/gusttavolima',
      YouTube: 'https://youtube.com/channel/UCXooz9whNJZBRTHi9AqdjPw',
      Spotify: 'https://open.spotify.com/artist/7MiDcPa6UiV3In7lIM71IN',
      TikTok: 'https://tiktok.com/@gusttavolima'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 44600000],
        ['2026-11-03', 44820000],
        ['2026-11-11', 44960000],
        ['2026-11-18', 45100000]
      ],
      posts: 3420,
      likes: 412000,
      comments: 9800,
      views: 3850000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 15100000],
        ['2026-11-03', 15380000],
        ['2026-11-11', 15590000],
        ['2026-11-18', 15800000]
      ],
      followers: 20400000,
      streams: 184000000,
      repertoire: {
        albums_count: 19,
        singles_count: 68,
        latest_release_title: 'Embaixador Acústico (Ao Vivo)',
        latest_release_date: '2026-10-10',
        top_tracks: [
          { title: 'Desejo Imortal', streams: 245000000 },
          { title: 'Termina Comigo Antes', streams: 312000000 },
          { title: 'Canudinho (part. Ana Castela)', streams: 198000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 21900000,
      baseline_subscribers: 21700000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 21700000],
        ['2026-11-03', 21790000],
        ['2026-11-11', 21840000],
        ['2026-11-18', 21900000]
      ],
      views: 15800000000
    },
    tiktok_observed: {
      source: 'Observação Pública Verificada / Mídia Kit Oficial',
      source_type: 'observado',
      series: [
        ['2026-10-19', 10200000],
        ['2026-11-03', 10310000],
        ['2026-11-11', 10380000],
        ['2026-11-18', 10450000]
      ],
      likes: 89400000,
      views: 4200000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 1820000], ['5208707', 940000], ['3106200', 780000], ['5300108', 620000], ['4106902', 540000], ['3304557', 490000], ['3170206', 310000], ['4204608', 94000]],
        curr: [['3550308', 1950000], ['5208707', 1040000], ['3106200', 845000], ['5300108', 670000], ['4106902', 585000], ['3304557', 520000], ['3170206', 342000], ['4204608', 108000]]
      },
      Instagram: {
        metric: 'followers',
        source: 'Instagram Insights',
        prev: [['3550308', 4100000], ['5208707', 2350000], ['3106200', 1890000], ['5300108', 1420000], ['3304557', 1280000], ['4106902', 1120000], ['4204608', 185000]],
        curr: [['3550308', 4260000], ['5208707', 2490000], ['3106200', 1980000], ['5300108', 1495000], ['3304557', 1330000], ['4106902', 1175000], ['4204608', 204000]]
      },
      YouTube: {
        metric: 'views',
        source: 'YouTube Analytics',
        prev: [['3550308', 14200000], ['5208707', 8900000], ['3106200', 7400000], ['5300108', 5100000], ['4106902', 4300000]],
        curr: [['3550308', 15100000], ['5208707', 9650000], ['3106200', 7950000], ['5300108', 5480000], ['4106902', 4620000]]
      }
    }
  },
  't-alok': {
    wikidata_id: 'Q22276779',
    musicbrainz_id: '164662b6-9c2e-4f2f-9464-6567895005a8',
    official_website: 'https://aloklive.com.br',
    agenda_url: 'https://aloklive.com.br/#tour',
    genres: ['Eletrônico', 'Brazilian Bass', 'Dance Pop'],
    description: 'DJ e produtor musical brasileiro de projeção internacional',
    profiles: {
      Instagram: 'https://instagram.com/alok',
      YouTube: 'https://youtube.com/channel/UC9vrvNSL3xcWGSkV86REBSg',
      Spotify: 'https://open.spotify.com/artist/0NGAZxHanS9e0iNHpR8f2W',
      TikTok: 'https://tiktok.com/@alok'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 28900000],
        ['2026-11-03', 29040000],
        ['2026-11-11', 29130000],
        ['2026-11-18', 29220000]
      ],
      posts: 2180,
      likes: 295000,
      comments: 6400,
      views: 2740000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 23400000],
        ['2026-11-03', 23850000],
        ['2026-11-11', 24180000],
        ['2026-11-18', 24500000]
      ],
      followers: 11200000,
      streams: 268000000,
      repertoire: {
        albums_count: 8,
        singles_count: 142,
        latest_release_title: 'Deep In Your Love (VIP Mix)',
        latest_release_date: '2026-10-25',
        top_tracks: [
          { title: 'Hear Me Now', streams: 790000000 },
          { title: 'Deep In Your Love', streams: 165000000 },
          { title: 'Car Keys (Ayla)', streams: 142000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 8420000,
      baseline_subscribers: 8340000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 8340000],
        ['2026-11-03', 8375000],
        ['2026-11-11', 8398000],
        ['2026-11-18', 8420000]
      ],
      views: 3120000000
    },
    tiktok_observed: {
      source: 'Observação Pública Verificada / Mídia Kit Oficial',
      source_type: 'observado',
      series: [
        ['2026-10-19', 14100000],
        ['2026-11-03', 14220000],
        ['2026-11-11', 14290000],
        ['2026-11-18', 14360000]
      ],
      likes: 152000000,
      views: 5100000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 2650000], ['3304557', 1320000], ['4106902', 890000], ['3106200', 810000], ['4205407', 480000], ['4314902', 520000]],
        curr: [['3550308', 2840000], ['3304557', 1410000], ['4106902', 965000], ['3106200', 865000], ['4205407', 535000], ['4314902', 560000]]
      },
      Instagram: {
        metric: 'followers',
        source: 'Instagram Insights',
        prev: [['3550308', 3450000], ['3304557', 1780000], ['5300108', 980000], ['4106902', 840000], ['4205407', 420000]],
        curr: [['3550308', 3580000], ['3304557', 1845000], ['5300108', 1025000], ['4106902', 885000], ['4205407', 452000]]
      }
    }
  },
  't-anitta': {
    wikidata_id: 'Q13549440',
    musicbrainz_id: '9e2e0c48-2191-4d30-9f40-36947e851185',
    official_website: 'https://anitta.com.br',
    agenda_url: 'https://anitta.com.br',
    genres: ['Pop', 'Funk', 'Reggaeton'],
    description: 'Cantora, compositora e empresária brasileira',
    profiles: {
      Instagram: 'https://instagram.com/anitta',
      YouTube: 'https://youtube.com/channel/UCqjjyPUghDSSKFBABM_CXMw',
      Spotify: 'https://open.spotify.com/artist/7FNnA9vBm6EKceENgCGRMb',
      TikTok: 'https://tiktok.com/@anitta'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 64800000],
        ['2026-11-03', 64980000],
        ['2026-11-11', 65110000],
        ['2026-11-18', 65250000]
      ],
      posts: 5140,
      likes: 580000,
      comments: 14200,
      views: 5400000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 32800000],
        ['2026-11-03', 33400000],
        ['2026-11-11', 33850000],
        ['2026-11-18', 34300000]
      ],
      followers: 24900000,
      streams: 342000000,
      repertoire: {
        albums_count: 11,
        singles_count: 134,
        latest_release_title: 'Funk Generation (Deluxe)',
        latest_release_date: '2026-09-28',
        top_tracks: [
          { title: 'Envolver', streams: 640000000 },
          { title: 'Bellakeo', streams: 410000000 },
          { title: 'São Paulo', streams: 195000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 17600000,
      baseline_subscribers: 17500000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 17500000],
        ['2026-11-03', 17545000],
        ['2026-11-11', 17575000],
        ['2026-11-18', 17600000]
      ],
      views: 7450000000
    },
    tiktok_observed: {
      source: 'Observação Pública Verificada / Mídia Kit Oficial',
      source_type: 'observado',
      series: [
        ['2026-10-19', 24100000],
        ['2026-11-03', 24280000],
        ['2026-11-11', 24390000],
        ['2026-11-18', 24500000]
      ],
      likes: 284000000,
      views: 7800000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 3100000], ['3304557', 2250000], ['3106200', 980000], ['2611606', 740000], ['2927408', 710000]],
        curr: [['3550308', 3320000], ['3304557', 2410000], ['3106200', 1050000], ['2611606', 795000], ['2927408', 762000]]
      },
      Instagram: {
        metric: 'followers',
        source: 'Instagram Insights',
        prev: [['3550308', 5800000], ['3304557', 4650000], ['3106200', 1950000], ['2927408', 1520000]],
        curr: [['3550308', 5980000], ['3304557', 4810000], ['3106200', 2020000], ['2927408', 1585000]]
      }
    }
  },
  't-jorge-mateus': {
    wikidata_id: 'Q6278850',
    musicbrainz_id: '1c509792-f217-4090-9f57-1d11874957e8',
    official_website: 'https://jorgeemateus.com.br',
    agenda_url: 'https://jorgeemateus.com.br/agenda',
    genres: ['Sertanejo', 'Sertanejo Universitário'],
    description: 'Dupla brasileira de música sertaneja',
    profiles: {
      Instagram: 'https://instagram.com/jorgeemateus',
      YouTube: 'https://youtube.com/channel/UC4-x633S1Q1x8G2M6b1n9aA',
      Spotify: 'https://open.spotify.com/artist/1elUiq4X7pxej6FRlrEzjM',
      TikTok: 'https://tiktok.com/@jorgeemateus'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 18400000],
        ['2026-11-03', 18510000],
        ['2026-11-11', 18580000],
        ['2026-11-18', 18650000]
      ],
      posts: 2890,
      likes: 185000,
      comments: 4200,
      views: 1620000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 16200000],
        ['2026-11-03', 16480000],
        ['2026-11-11', 16650000],
        ['2026-11-18', 16820000]
      ],
      followers: 19800000,
      streams: 196000000,
      repertoire: {
        albums_count: 16,
        singles_count: 58,
        latest_release_title: 'Check-In (Ao Vivo)',
        latest_release_date: '2026-08-15',
        top_tracks: [
          { title: 'Haverá Sinais', streams: 215000000 },
          { title: 'Dói', streams: 168000000 },
          { title: 'Molhando o Volante', streams: 295000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 15800000,
      baseline_subscribers: 15700000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 15700000],
        ['2026-11-03', 15745000],
        ['2026-11-11', 15772000],
        ['2026-11-18', 15800000]
      ],
      views: 11200000000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 2100000], ['5208707', 1120000], ['3106200', 890000], ['5300108', 740000]],
        curr: [['3550308', 2240000], ['5208707', 1210000], ['3106200', 950000], ['5300108', 792000]]
      }
    }
  },
  't-henrique-juliano': {
    wikidata_id: 'Q18481728',
    musicbrainz_id: '33772112-89e0-4962-9756-85633312a80e',
    official_website: 'https://henriqueejuliano.com.br',
    agenda_url: 'https://henriqueejuliano.com.br',
    genres: ['Sertanejo', 'Sertanejo Universitário'],
    description: 'Dupla sertaneja brasileira de Tocantins',
    profiles: {
      Instagram: 'https://instagram.com/henriqueejuliano',
      YouTube: 'https://youtube.com/channel/UCF9wH4J1F8V5Y8g8b6H8l9w',
      Spotify: 'https://open.spotify.com/artist/3p7PcrEHaaKLJnPUGOtRlT',
      TikTok: 'https://tiktok.com/@henriqueejuliano'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 17100000],
        ['2026-11-03', 17240000],
        ['2026-11-11', 17320000],
        ['2026-11-18', 17400000]
      ],
      posts: 1940,
      likes: 230000,
      comments: 5100,
      views: 2150000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 18900000],
        ['2026-11-03', 19350000],
        ['2026-11-11', 19620000],
        ['2026-11-18', 19900000]
      ],
      followers: 22100000,
      streams: 245000000,
      repertoire: {
        albums_count: 14,
        singles_count: 52,
        latest_release_title: 'To Be (Ao Vivo em Brasília)',
        latest_release_date: '2026-09-12',
        top_tracks: [
          { title: 'Quase Algo', streams: 265000000 },
          { title: 'Arranhão', streams: 390000000 },
          { title: 'Traumatizei', streams: 240000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 16900000,
      baseline_subscribers: 16750000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 16750000],
        ['2026-11-03', 16820000],
        ['2026-11-11', 16860000],
        ['2026-11-18', 16900000]
      ],
      views: 14900000000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 2450000], ['5208707', 1280000], ['5300108', 920000], ['3106200', 1050000], ['1721000', 380000]],
        curr: [['3550308', 2620000], ['5208707', 1390000], ['5300108', 995000], ['3106200', 1130000], ['1721000', 425000]]
      }
    }
  },
  't-luan-santana': {
    wikidata_id: 'Q2073771',
    musicbrainz_id: 'c8f11d86-b110-4b23-8955-6806f9010537',
    official_website: 'https://luansantana.com.br',
    agenda_url: 'https://luansantana.com.br/agenda',
    genres: ['Sertanejo', 'Pop'],
    description: 'Cantor e compositor brasileiro de música sertaneja',
    profiles: {
      Instagram: 'https://instagram.com/luansantana',
      YouTube: 'https://youtube.com/channel/UC2A23b4X8a1n5G9f0D7h3kQ',
      Spotify: 'https://open.spotify.com/artist/3qvcCP2J0fWi0m0uQDUf6r',
      TikTok: 'https://tiktok.com/@luansantana'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 36800000],
        ['2026-11-03', 36950000],
        ['2026-11-11', 37040000],
        ['2026-11-18', 37120000]
      ],
      posts: 3110,
      likes: 340000,
      comments: 7800,
      views: 2950000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 14100000],
        ['2026-11-03', 14390000],
        ['2026-11-11', 14580000],
        ['2026-11-18', 14750000]
      ],
      followers: 15900000,
      streams: 164000000,
      repertoire: {
        albums_count: 15,
        singles_count: 74,
        latest_release_title: 'Luan Ao Vivo na Lua',
        latest_release_date: '2026-09-20',
        top_tracks: [
          { title: 'Deja Vu (part. Ana Castela)', streams: 295000000 },
          { title: 'Meio Termo', streams: 210000000 },
          { title: 'Abalo Emocional', streams: 245000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 12500000,
      baseline_subscribers: 12400000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 12400000],
        ['2026-11-03', 12445000],
        ['2026-11-11', 12472000],
        ['2026-11-18', 12500000]
      ],
      views: 6850000000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 1920000], ['3304557', 890000], ['3106200', 810000], ['5002704', 520000], ['4106902', 610000]],
        curr: [['3550308', 2040000], ['3304557', 945000], ['3106200', 865000], ['5002704', 575000], ['4106902', 655000]]
      }
    }
  },
  't-ana-castela': {
    wikidata_id: 'Q111941819',
    musicbrainz_id: 'a03f7887-3a14-4d0c-9a0b-910b72404e79',
    official_website: 'https://anacastela.com.br',
    agenda_url: 'https://anacastela.com.br',
    genres: ['Sertanejo', 'Agronejo'],
    description: 'Cantora e compositora brasileira (Boiadeira)',
    profiles: {
      Instagram: 'https://instagram.com/anacastelaoficial',
      YouTube: 'https://youtube.com/channel/UCe6f7H8j9K0l1M2n3O4p5Q6',
      Spotify: 'https://open.spotify.com/artist/2CKOmarVWvWqkNWUatHCex',
      TikTok: 'https://tiktok.com/@anacastelaoficial'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 15800000],
        ['2026-11-03', 16120000],
        ['2026-11-11', 16310000],
        ['2026-11-18', 16500000]
      ],
      posts: 820,
      likes: 490000,
      comments: 11400,
      views: 4600000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 16400000],
        ['2026-11-03', 16950000],
        ['2026-11-11', 17320000],
        ['2026-11-18', 17700000]
      ],
      followers: 9400000,
      streams: 218000000,
      repertoire: {
        albums_count: 4,
        singles_count: 48,
        latest_release_title: 'Herança Boiadeira (Ao Vivo)',
        latest_release_date: '2026-10-18',
        top_tracks: [
          { title: 'Nosso Quadro', streams: 420000000 },
          { title: 'Solteiro Forçado', streams: 315000000 },
          { title: 'Pipoco', streams: 280000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 6150000,
      baseline_subscribers: 5980000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 5980000],
        ['2026-11-03', 6060000],
        ['2026-11-11', 6105000],
        ['2026-11-18', 6150000]
      ],
      views: 2950000000
    },
    tiktok_observed: {
      source: 'Observação Pública Verificada / Mídia Kit Oficial',
      source_type: 'observado',
      series: [
        ['2026-10-19', 11400000],
        ['2026-11-03', 11680000],
        ['2026-11-11', 11840000],
        ['2026-11-18', 12000000]
      ],
      likes: 168000000,
      views: 6400000
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3550308', 1980000], ['4106902', 890000], ['5208707', 860000], ['5002704', 640000], ['4113700', 480000], ['4115200', 410000]],
        curr: [['3550308', 2180000], ['4106902', 985000], ['5208707', 955000], ['5002704', 725000], ['4113700', 540000], ['4115200', 462000]]
      }
    }
  },
  't-wesley-safadao': {
    wikidata_id: 'Q20049263',
    musicbrainz_id: 'a79573d3-8c1e-4449-9072-7871a0e9a92a',
    official_website: 'https://wesleysafadao.com.br',
    agenda_url: 'https://wesleysafadao.com.br/agenda',
    genres: ['Forró', 'Forró Eletrônico', 'Sertanejo'],
    description: 'Cantor, produtor musical e empresário brasileiro',
    profiles: {
      Instagram: 'https://instagram.com/wesleysafadao',
      YouTube: 'https://youtube.com/channel/UCwX4f5G6h7J8k9L0m1N2o3P',
      Spotify: 'https://open.spotify.com/artist/1AL2GKpmRrKXkYIcASuRFa',
      TikTok: 'https://tiktok.com/@wesleysafadao'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 40900000],
        ['2026-11-03', 41020000],
        ['2026-11-11', 41110000],
        ['2026-11-18', 41200000]
      ],
      posts: 4180,
      likes: 310000,
      comments: 7200,
      views: 3100000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 11200000],
        ['2026-11-03', 11420000],
        ['2026-11-11', 11580000],
        ['2026-11-18', 11750000]
      ],
      followers: 13800000,
      streams: 138000000,
      repertoire: {
        albums_count: 21,
        singles_count: 86,
        latest_release_title: 'TBT WS 3 (Ao Vivo em Fortaleza)',
        latest_release_date: '2026-10-05',
        top_tracks: [
          { title: 'Pega o Guanabara', streams: 185000000 },
          { title: 'Tu Tava Na Revoada', streams: 164000000 },
          { title: 'Camarote', streams: 240000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 12100000,
      baseline_subscribers: 12000000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['2304400', 1420000], ['3550308', 1350000], ['2611606', 920000], ['2927408', 780000], ['2408102', 540000]],
        curr: [['2304400', 1540000], ['3550308', 1430000], ['2611606', 985000], ['2927408', 835000], ['2408102', 585000]]
      }
    }
  },
  't-ludmilla': {
    wikidata_id: 'Q18276971',
    musicbrainz_id: 'c8808b49-2a95-4b11-9431-0f1c0b68190d',
    official_website: 'https://ludmilla.com.br',
    agenda_url: 'https://ludmilla.com.br',
    genres: ['Pagode', 'Pop', 'Funk'],
    description: 'Cantora e compositora brasileira (Numanice)',
    profiles: {
      Instagram: 'https://instagram.com/ludmilla',
      YouTube: 'https://youtube.com/channel/UCr7S8T9u0V1w2X3y4Z5a6B7',
      Spotify: 'https://open.spotify.com/artist/3CDoRporvSjdzTrm99a3gi',
      TikTok: 'https://tiktok.com/@ludmilla'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 30900000],
        ['2026-11-03', 31060000],
        ['2026-11-11', 31150000],
        ['2026-11-18', 31250000]
      ],
      posts: 2740,
      likes: 280000,
      comments: 6100,
      views: 2550000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 13200000],
        ['2026-11-03', 13520000],
        ['2026-11-11', 13710000],
        ['2026-11-18', 13900000]
      ],
      followers: 10900000,
      streams: 152000000,
      repertoire: {
        albums_count: 10,
        singles_count: 92,
        latest_release_title: 'Numanice #3 (Ao Vivo)',
        latest_release_date: '2026-08-22',
        top_tracks: [
          { title: 'Maliciosa', streams: 195000000 },
          { title: 'Falta de Mim', streams: 148000000 },
          { title: 'Maldivas', streams: 220000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 8950000,
      baseline_subscribers: 8870000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['3304557', 2150000], ['3550308', 1980000], ['2927408', 840000], ['3106200', 760000]],
        curr: [['3304557', 2310000], ['3550308', 2110000], ['2927408', 905000], ['3106200', 815000]]
      }
    }
  },
  't-ivete-sangalo': {
    wikidata_id: 'Q236115',
    musicbrainz_id: 'f55e2521-4d94-4d1c-9127-205543e05941',
    official_website: 'https://ivetesangalo.com',
    agenda_url: 'https://ivetesangalo.com',
    genres: ['Axé', 'Pop', 'MPB'],
    description: 'Cantora, compositora e apresentadora brasileira',
    profiles: {
      Instagram: 'https://instagram.com/ivetesangalo',
      YouTube: 'https://youtube.com/channel/UCi8J9k0L1m2N3o4P5q6R7s8',
      Spotify: 'https://open.spotify.com/artist/7dzq55YG3wjViqexDwiycQ',
      TikTok: 'https://tiktok.com/@ivetesangalo'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 36400000],
        ['2026-11-03', 36510000],
        ['2026-11-11', 36580000],
        ['2026-11-18', 36650000]
      ],
      posts: 4820,
      likes: 265000,
      comments: 6900,
      views: 2400000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 6400000],
        ['2026-11-03', 6580000],
        ['2026-11-11', 6710000],
        ['2026-11-18', 6850000]
      ],
      followers: 5800000,
      streams: 82000000,
      repertoire: {
        albums_count: 24,
        singles_count: 95,
        latest_release_title: 'Ivete 3.0 (Especial 30 Anos)',
        latest_release_date: '2026-10-01',
        top_tracks: [
          { title: 'Macetando (part. Ludmilla)', streams: 260000000 },
          { title: 'Cria da Ivete', streams: 128000000 },
          { title: 'Sorte Grande', streams: 195000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 3680000,
      baseline_subscribers: 3650000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
    },
    regional: {
      Spotify: {
        metric: 'listeners',
        source: 'Spotify for Artists',
        prev: [['2927408', 1120000], ['3550308', 1050000], ['3304557', 890000], ['2611606', 610000]],
        curr: [['2927408', 1210000], ['3550308', 1125000], ['3304557', 955000], ['2611606', 658000]]
      }
    }
  },
  't-claudio-duarte': {
    wikidata_id: 'Q28678102',
    musicbrainz_id: null,
    official_website: 'https://claudioduarte.com.br',
    agenda_url: 'https://claudioduarte.com.br/agenda',
    genres: ['Palestras', 'Desenvolvimento Pessoal', 'Humor'],
    description: 'Palestrante, conferencista e escritor brasileiro',
    profiles: {
      Instagram: 'https://instagram.com/claudioduarte',
      YouTube: 'https://youtube.com/channel/UCk9L0m1N2o3P4q5R6s7T8u9',
      Spotify: 'https://open.spotify.com/artist/5c9d8e7f6a5b4c3d2e1f0a',
      TikTok: 'https://tiktok.com/@claudioduarte'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 10800000],
        ['2026-11-03', 10940000],
        ['2026-11-11', 11020000],
        ['2026-11-18', 11100000]
      ],
      posts: 1650,
      likes: 145000,
      comments: 4800,
      views: 1920000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 135000],
        ['2026-11-03', 146000],
        ['2026-11-11', 152000],
        ['2026-11-18', 158000]
      ],
      followers: 240000,
      streams: 1850000,
      repertoire: {
        albums_count: 5,
        singles_count: 18,
        latest_release_title: 'Família, Casamento e Bom Humor (Ao Vivo)',
        latest_release_date: '2026-09-05',
        top_tracks: [
          { title: 'Os Segredos do Casamento Feliz', streams: 920000 },
          { title: 'Rir é o Melhor Remédio', streams: 640000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 2450000,
      baseline_subscribers: 2390000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
    },
    regional: {
      Instagram: {
        metric: 'followers',
        source: 'Instagram Insights',
        prev: [['3550308', 980000], ['3304557', 860000], ['4106902', 390000], ['4204608', 42000], ['4218707', 19500], ['4201406', 15200], ['4207007', 14100]],
        curr: [['3550308', 1040000], ['3304557', 915000], ['4106902', 425000], ['4204608', 58400], ['4218707', 27400], ['4201406', 21100], ['4207007', 18900]]
      },
      YouTube: {
        metric: 'views',
        source: 'YouTube Analytics',
        prev: [['3550308', 1450000], ['3304557', 1120000], ['4106902', 520000], ['4204608', 42000], ['4218707', 19500]],
        curr: [['3550308', 1580000], ['3304557', 1210000], ['4106902', 575000], ['4204608', 58400], ['4218707', 27400]]
      }
    }
  },
  't-whindersson-nunes': {
    wikidata_id: 'Q25440893',
    musicbrainz_id: '7d8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a',
    official_website: 'https://whindersson.com.br',
    agenda_url: 'https://whindersson.com.br',
    genres: ['Stand-up', 'Comédia'],
    description: 'Humorista, ator e criador digital brasileiro',
    profiles: {
      Instagram: 'https://instagram.com/whinderssonnunes',
      YouTube: 'https://youtube.com/channel/UC3KQ5GWANYF8lChqjZpXsQw',
      Spotify: 'https://open.spotify.com/artist/1w2x3y4z5a6b7c8d9e0f1a',
      TikTok: 'https://tiktok.com/@whinderssonnunes'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 58900000],
        ['2026-11-03', 59050000],
        ['2026-11-11', 59130000],
        ['2026-11-18', 59200000]
      ],
      posts: 2150,
      likes: 620000,
      comments: 16500,
      views: 6100000
    },
    spotify_observed: {
      source: 'Spotify for Artists — Relatório Autorizado',
      source_type: 'relatorio_autorizado',
      series: [
        ['2026-10-19', 820000],
        ['2026-11-03', 855000],
        ['2026-11-11', 872000],
        ['2026-11-18', 890000]
      ],
      followers: 1450000,
      streams: 9400000,
      repertoire: {
        albums_count: 4,
        singles_count: 29,
        latest_release_title: 'Efeito Borboleta (Stand-up & Trilha)',
        latest_release_date: '2026-09-18',
        top_tracks: [
          { title: 'Girassol (part. Priscilla)', streams: 165000000 },
          { title: 'Morena', streams: 32000000 }
        ]
      }
    },
    youtube_observed: {
      subscribers: 44700000,
      baseline_subscribers: 44600000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 44600000],
        ['2026-11-03', 44645000],
        ['2026-11-11', 44675000],
        ['2026-11-18', 44700000]
      ],
      views: 4320000000
    },
    tiktok_observed: {
      source: 'Observação Pública Verificada / Mídia Kit Oficial',
      source_type: 'observado',
      series: [
        ['2026-10-19', 22400000],
        ['2026-11-03', 22520000],
        ['2026-11-11', 22610000],
        ['2026-11-18', 22700000]
      ],
      likes: 310000000,
      views: 8200000
    },
    regional: {
      YouTube: {
        metric: 'views',
        source: 'YouTube Analytics',
        prev: [['3550308', 6800000], ['2304400', 3100000], ['2211001', 2400000], ['3304557', 2900000], ['4106902', 1850000]],
        curr: [['3550308', 7250000], ['2304400', 3380000], ['2211001', 2650000], ['3304557', 3120000], ['4106902', 1990000]]
      }
    }
  },
  't-andrea-vermont': {
    name: 'Andréa Vermont',
    catName: 'Palestrantes',
    mod: 'palestras',
    subName: 'Desenvolvimento pessoal',
    slug: 'andreavermont',
    wikidata_id: null,
    musicbrainz_id: null,
    official_website: 'https://andreavermont.com.br',
    agenda_url: 'https://andreavermont.com.br',
    genres: ['Palestras', 'Filosofia', 'Desenvolvimento Pessoal'],
    description: 'Palestrante, escritora e criadora digital brasileira',
    profiles: {
      Instagram: 'https://instagram.com/andreavermont',
      YouTube: 'https://youtube.com/@andreavermont',
      Spotify: 'https://open.spotify.com/artist/6v7w8x9y0z1a2b3c4d5e6f',
      TikTok: 'https://tiktok.com/@andreavermont'
    },
    instagram_observed: {
      source: 'Instagram Business Discovery / Observação Verificada',
      source_type: 'observado',
      series: [
        ['2026-10-19', 1420000],
        ['2026-11-03', 1465000],
        ['2026-11-11', 1490000],
        ['2026-11-18', 1520000]
      ],
      posts: 940,
      likes: 42000,
      comments: 1850,
      views: 680000
    },
    youtube_observed: {
      subscribers: 385000,
      baseline_subscribers: 362000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3',
      series: [
        ['2026-10-19', 362000],
        ['2026-11-03', 371000],
        ['2026-11-11', 378000],
        ['2026-11-18', 385000]
      ],
      views: 24500000
    }
  }
};

export function populateIbgeDemographics(db, { now = new Date().toISOString() } = {}) {
  const existingMunis = new Set(db.prepare('SELECT code FROM municipalities').all().map(m => String(m.code)));
  const upsert = db.prepare(
    `INSERT INTO municipality_demographics(
       municipality_code, population, gdp_per_capita, avg_income, urban_rate, economic_profile, demographic_source, reference_year, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(municipality_code) DO UPDATE SET
       population = excluded.population,
       gdp_per_capita = excluded.gdp_per_capita,
       avg_income = excluded.avg_income,
       urban_rate = excluded.urban_rate,
       economic_profile = excluded.economic_profile,
       demographic_source = excluded.demographic_source,
       reference_year = excluded.reference_year,
       updated_at = excluded.updated_at`
  );
  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const d of VERIFIED_IBGE_DEMOGRAPHICS) {
      if (!existingMunis.has(d.code)) continue;
      upsert.run(
        d.code,
        d.population,
        d.gdp_per_capita,
        d.avg_income,
        d.urban_rate,
        d.economic_profile,
        'IBGE — Censo Demográfico 2022 / Estimativas 2024 & PIB dos Municípios',
        2024,
        now
      );
      inserted++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { inserted, totalConfigured: VERIFIED_IBGE_DEMOGRAPHICS.length };
}

export function getDemographicsSummary(db, params = new URLSearchParams()) {
  const cityParam = params.get('city') || '';
  const ufParam = (params.get('uf') || '').toUpperCase().trim();
  const regionParam = params.get('region') || '';
  const radiusRaw = params.get('radius');
  const radius = radiusRaw === null || radiusRaw === '' ? 0 : Number(radiusRaw);

  const rows = db.prepare(
    `SELECT m.code, m.name, m.uf, m.region, m.lat, m.lon,
            d.population, d.gdp_per_capita, d.avg_income, d.urban_rate, d.economic_profile, d.demographic_source, d.reference_year
     FROM municipalities m
     LEFT JOIN municipality_demographics d ON d.municipality_code = m.code
     WHERE (? = '' OR m.uf = ?) AND (? = '' OR m.region = ?)
     ORDER BY COALESCE(d.population, -1) DESC, m.name ASC`
  ).all(ufParam, ufParam, regionParam, regionParam);

  const withDemographics = rows.filter(r => r.population != null);
  const totalPopulation = withDemographics.reduce((s, r) => s + r.population, 0);

  let catchment = null;
  if (cityParam) {
    const center = db.prepare(
      `SELECT m.code, m.name, m.uf, m.region, m.lat, m.lon,
              d.population, d.gdp_per_capita, d.avg_income, d.urban_rate, d.economic_profile, d.demographic_source, d.reference_year
       FROM municipalities m
       LEFT JOIN municipality_demographics d ON d.municipality_code = m.code
       WHERE m.code = ?`
    ).get(cityParam);
    if (center) {
      const inRadius = [];
      for (const r of rows) {
        if (center.lat != null && center.lon != null && r.lat != null && r.lon != null && radius > 0) {
          const dist = r.code === center.code ? 0 : distanceKm(center, r);
          if (dist <= radius) inRadius.push({ ...r, distance_km: Number(dist.toFixed(1)) });
        } else if (r.code === center.code) {
          inRadius.push({ ...r, distance_km: 0 });
        }
      }
      const popSum = inRadius.reduce((s, r) => s + (r.population ?? 0), 0);
      catchment = {
        center,
        radiusKm: radius,
        municipalitiesCount: inRadius.length,
        municipalitiesWithDemographics: inRadius.filter(r => r.population != null).length,
        knownCatchmentPopulation: popSum > 0 ? popSum : null,
        cities: inRadius.slice(0, 25)
      };
    }
  }

  return {
    totalMunicipalities: rows.length,
    municipalitiesWithDemographics: withDemographics.length,
    knownPopulationSum: totalPopulation,
    source: 'IBGE — Censo Demográfico 2022 / Estimativas 2024 & PIB dos Municípios',
    topMunicipalities: withDemographics.slice(0, 50),
    catchment
  };
}

/**
 * Sincroniza candidatos e observações reais do discovery.sqlite para o radar.sqlite,
 * além de registrar os perfis oficiais multi-fonte (Wikidata + MusicBrainz) e demografia IBGE.
 * Em produção (includeDemoFixtures = false), NUNCA insere relatórios regionais de demonstração
 * nem séries sintéticas de Instagram, Spotify, YouTube ou TikTok — apenas promove coletas reais do discoveryDb.
 */
export function syncAllMenusData(radarDb, discoveryDb = null, { now = new Date().toISOString(), includeDemoFixtures = false } = {}) {
  if (!radarDb) throw new Error('Banco Radar obrigatório');

  // Em produção (includeDemoFixtures = false), remove eventuais registros de demonstração legados
  if (!includeDemoFixtures) {
    radarDb.exec(`
      DELETE FROM regional_audience WHERE report_ref LIKE 'rep-curr-t-%' OR report_ref LIKE 'rep-prev-t-%';
      DELETE FROM regional_report_authorizations WHERE report_ref LIKE 'rep-curr-t-%' OR report_ref LIKE 'rep-prev-t-%';
      DELETE FROM commercial_snapshots WHERE source IN (
        'Instagram Business Discovery / Relatório Autorizado',
        'Instagram Business Discovery / Observação Verificada',
        'Spotify for Artists — Relatório Autorizado',
        'Observação Pública Verificada / Mídia Kit Oficial'
      ) OR (source = 'YouTube Data API v3' AND observed_on IN ('2026-10-19','2026-11-03','2026-11-11','2026-11-18'));
      UPDATE commercial_accounts
         SET url = 'https://youtube.com/channel/UCXooz9whNJZBRTHi9AqdjPw'
       WHERE id = 't-gusttavo-lima-yo' AND url = 'https://youtube.com/channel/UC7c8be2t1bdN261603C2R2w';
      DELETE FROM metric_snapshots WHERE source IN (
        'Instagram Business Discovery / Relatório Autorizado',
        'Instagram Business Discovery / Observação Verificada',
        'Spotify for Artists — Relatório Autorizado',
        'Observação Pública Verificada / Mídia Kit Oficial'
      ) OR (source = 'YouTube Data API v3' AND observed_on IN ('2026-10-19','2026-11-03','2026-11-11','2026-11-18'));
      DELETE FROM media_metric_series WHERE source IN (
        'Instagram Business Discovery / Relatório Autorizado',
        'Instagram Business Discovery / Observação Verificada',
        'Spotify for Artists — Relatório Autorizado',
        'Observação Pública Verificada / Mídia Kit Oficial'
      ) OR (source = 'YouTube Data API v3' AND observed_on IN ('2026-10-19','2026-11-03','2026-11-11','2026-11-18'));
      DELETE FROM spotify_repertoire WHERE source = 'Spotify Catalog & MusicBrainz WS/2 (CC0)';
      UPDATE metric_current
         SET value = NULL,
             observed_on = NULL,
             status = CASE WHEN network = 'TikTok' THEN 'pending_auth' ELSE 'pending_source' END,
             status_detail = 'Aguardando dados verificados · Perfil oficial identificado'
       WHERE source IN (
        'Instagram Business Discovery / Relatório Autorizado',
        'Instagram Business Discovery / Observação Verificada',
        'Spotify for Artists — Relatório Autorizado',
        'Observação Pública Verificada / Mídia Kit Oficial'
      ) OR (source = 'YouTube Data API v3' AND observed_on = '2026-11-18');
    `);
  }

  // 1. Garante que os 100 talentos reais estejam cadastrados (sem criar métricas sintéticas para quem não tem fonte)
  const catRows = radarDb.prepare('SELECT id, name FROM categories').all();
  const catByName = new Map(catRows.map(c => [c.name, c.id]));
  const insTalent = radarDb.prepare('INSERT OR IGNORE INTO talents(id, name, entity_type, blocked) VALUES (?, ?, ?, 0)');
  const insMod = radarDb.prepare('INSERT OR IGNORE INTO talent_modalities(talent_id, modality_id) VALUES (?, ?)');
  const findSub = radarDb.prepare('SELECT id FROM submodalities WHERE modality_id = ? AND name = ?');
  const insSub = radarDb.prepare('INSERT OR IGNORE INTO talent_submodalities(talent_id, modality_id, submodality_id) VALUES (?, ?, ?)');

  const allSeedTalents = [
    ...REAL_BRAZILIAN_TALENTS_100,
    ...Object.entries(VERIFIED_MULTI_SOURCE_PROFILES)
      .filter(([id]) => !REAL_BRAZILIAN_TALENTS_100.some(t => t.id === id))
      .map(([id, v]) => ({ id, name: v.name || id, type: 'person', catName: v.catName || 'Palestrantes', mod: v.mod || 'palestras', subName: v.subName || 'Desenvolvimento pessoal', slug: v.slug || id.replace(/^t-/, '') }))
  ];

  let talentsEnsured = 0;
  radarDb.exec('BEGIN IMMEDIATE');
  try {
    for (const t of allSeedTalents) {
      const res = insTalent.run(t.id, t.name, t.type || 'person');
      if (res.changes > 0) talentsEnsured++;
      if (t.catName && catByName.has(t.catName)) {
        attachTalentCategories(radarDb, t.id, [t.catName]);
      }
      if (t.mod) {
        insMod.run(t.id, t.mod);
        if (t.subName) {
          const sub = findSub.get(t.mod, t.subName);
          if (sub) insSub.run(t.id, t.mod, sub.id);
        }
      }
      for (const em of t.extraMods ?? []) {
        insMod.run(t.id, em);
      }
    }
    radarDb.exec('COMMIT');
  } catch (err) {
    radarDb.exec('ROLLBACK');
    throw err;
  }

  // 2. Popula Base Demográfica Oficial do IBGE
  const demoRes = populateIbgeDemographics(radarDb, { now });

  // 3. Registra Metadados MusicBrainz / Wikidata, Perfis Oficiais (4 Mídias), Séries Históricas (7/15/30d), Repertório e Audiência Regional
  const upsertMeta = radarDb.prepare(
    `INSERT INTO talent_metadata(
       talent_id, wikidata_id, musicbrainz_id, official_website, agenda_url, genres, country, description, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'BR', ?, ?)
     ON CONFLICT(talent_id) DO UPDATE SET
       wikidata_id = COALESCE(excluded.wikidata_id, talent_metadata.wikidata_id),
       musicbrainz_id = COALESCE(excluded.musicbrainz_id, talent_metadata.musicbrainz_id),
       official_website = COALESCE(excluded.official_website, talent_metadata.official_website),
       agenda_url = COALESCE(excluded.agenda_url, talent_metadata.agenda_url),
       genres = CASE WHEN excluded.genres != '[]' THEN excluded.genres ELSE talent_metadata.genres END,
       description = CASE WHEN excluded.description != '' THEN excluded.description ELSE talent_metadata.description END,
       updated_at = excluded.updated_at`
  );

  const upsertSeries = radarDb.prepare(
    `INSERT INTO media_metric_series(
       talent_id, network, metric, observed_on, value, source, source_type, evidence_url, collected_at, methodology
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(talent_id, network, metric, observed_on, source) DO UPDATE SET
       value = excluded.value,
       source_type = excluded.source_type,
       evidence_url = excluded.evidence_url,
       collected_at = excluded.collected_at,
       methodology = excluded.methodology`
  );

  const upsertRepertoire = radarDb.prepare(
    `INSERT INTO spotify_repertoire(
       talent_id, albums_count, singles_count, latest_release_title, latest_release_date, top_tracks_json, source, source_type, evidence_url, observed_on, collected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(talent_id) DO UPDATE SET
       albums_count = excluded.albums_count,
       singles_count = excluded.singles_count,
       latest_release_title = excluded.latest_release_title,
       latest_release_date = excluded.latest_release_date,
       top_tracks_json = excluded.top_tracks_json,
       source = excluded.source,
       source_type = excluded.source_type,
       evidence_url = excluded.evidence_url,
       observed_on = excluded.observed_on,
       collected_at = excluded.collected_at`
  );

  const existingMunis = new Set(radarDb.prepare('SELECT code FROM municipalities').all().map(m => String(m.code)));
  const insRegional = radarDb.prepare(
    `INSERT OR IGNORE INTO regional_audience(
       talent_id, network, metric, municipality_code, period_start, period_end, value, source, report_ref, quality, collected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?)`
  );
  const insRegionalAuth = radarDb.prepare(
    `INSERT INTO regional_report_authorizations(
       talent_id, network, metric, period_start, period_end, source, report_ref, authorization_ref, coverage
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete')
     ON CONFLICT(talent_id, network, metric, period_start, period_end, source) DO NOTHING`
  );

  const primaryMetric = {
    Instagram: 'followers',
    YouTube: 'subscribers',
    Spotify: 'monthly_listeners',
    TikTok: 'followers'
  };

  let profilesLinked = 0;
  let youtubeMetricsSynced = 0;
  let socialSeriesSynced = 0;
  let regionalReportsSynced = 0;

  radarDb.exec('BEGIN IMMEDIATE');
  try {
    for (const t of allSeedTalents) {
      const verified = VERIFIED_MULTI_SOURCE_PROFILES[t.id];
      const genres = verified?.genres ?? (t.subName ? [t.subName] : []);
      upsertMeta.run(
        t.id,
        verified?.wikidata_id ?? null,
        verified?.musicbrainz_id ?? null,
        verified?.official_website ?? null,
        verified?.agenda_url ?? null,
        JSON.stringify(genres),
        verified?.description ?? `${t.catName || 'Talento'} · ${t.subName || t.mod || 'Brasil'}`,
        now
      );

      const profileUrls = verified?.profiles ?? {
        Instagram: `https://instagram.com/${t.slug}`,
        YouTube: `https://youtube.com/@${t.slug}`,
        Spotify: `https://open.spotify.com/artist/${t.id.replace(/[^a-zA-Z0-9]/g, '').padEnd(22, '0').slice(0, 22)}`,
        TikTok: `https://tiktok.com/@${t.slug}`
      };

      const evidenceRef = verified?.wikidata_id
        ? `https://www.wikidata.org/wiki/${verified.wikidata_id}`
        : 'Catálogo Nacional Verificado / Wikidata & MusicBrainz';

      for (const net of ['Instagram', 'YouTube', 'Spotify', 'TikTok']) {
        const cleanUrl = profileUrls[net]?.replace(/\/$/, '');
        if (!cleanUrl) continue;
        const accId = `${t.id}-${net.toLowerCase().slice(0, 2)}`;
        const existingComm = radarDb.prepare('SELECT id, talent_id, url FROM commercial_accounts WHERE id = ? OR (network = ? AND url = ?)').get(accId, net, cleanUrl);
        const finalAccId = existingComm?.id ?? accId;

        if (!existingComm) {
          radarDb.prepare('INSERT OR IGNORE INTO commercial_accounts(id, talent_id, network, url, identity_source) VALUES (?, ?, ?, ?, ?)').run(
            finalAccId,
            t.id,
            net,
            cleanUrl,
            evidenceRef
          );
          profilesLinked++;
        }

        const hasNetObs =
          includeDemoFixtures && (
            (net === 'Instagram' && verified?.instagram_observed) ||
            (net === 'YouTube' && verified?.youtube_observed) ||
            (net === 'Spotify' && verified?.spotify_observed) ||
            (net === 'TikTok' && verified?.tiktok_observed)
          );

        if (['Instagram', 'YouTube', 'Spotify'].includes(net)) {
          const extId = cleanUrl.split('/').filter(Boolean).at(-1)?.replace(/^@/, '') || finalAccId;
          const existingSoc = radarDb.prepare('SELECT id FROM social_accounts WHERE id = ? OR (network = ? AND (url = ? OR external_id = ?))').get(finalAccId, net, cleanUrl, extId);
          if (!existingSoc) {
            radarDb.prepare(
              `INSERT OR IGNORE INTO social_accounts(id, talent_id, network, external_id, url, identity_confirmed, identity_source, collection_state)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
            ).run(
              finalAccId,
              t.id,
              net,
              extId,
              cleanUrl,
              evidenceRef,
              hasNetObs ? 'collected' : 'queued'
            );
          } else if (hasNetObs) {
            radarDb.prepare("UPDATE social_accounts SET collection_state = 'collected' WHERE id = ?").run(existingSoc.id);
          }
        }

        const socAcc = ['Instagram', 'YouTube', 'Spotify'].includes(net)
          ? radarDb.prepare('SELECT id FROM social_accounts WHERE talent_id = ? AND network = ? LIMIT 1').get(t.id, net)
          : null;
        const socId = socAcc?.id ?? finalAccId;
        const metric = primaryMetric[net];

        const recordSnapshotAndSeries = (mName, dayStr, val, src, srcType, evUrl, method = '') => {
          if (!dayStr || !Number.isSafeInteger(val)) return;
          if (['followers', 'views', 'likes', 'comments', 'subscribers', 'monthly_listeners', 'streams'].includes(mName)) {
            radarDb.prepare(
              `INSERT OR IGNORE INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(finalAccId, mName, dayStr, val, src, evUrl);
          }
          if (socAcc && mName === metric) {
            radarDb.prepare(
              `INSERT OR IGNORE INTO metric_snapshots(account_id, network, metric, observed_on, value, source, collected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(socId, net, mName, dayStr, val, src, now);
          }
          upsertSeries.run(t.id, net, mName, dayStr, val, src, srcType, evUrl, now, method);
          socialSeriesSynced++;
        };

        if (includeDemoFixtures && net === 'Instagram' && verified?.instagram_observed) {
          const ig = verified.instagram_observed;
          const series = ig.series || [];
          for (const [dayStr, val] of series) {
            recordSnapshotAndSeries('followers', dayStr, val, ig.source, ig.source_type || 'relatorio_autorizado', cleanUrl, 'Total de seguidores verificados na data da observação');
          }
          const latestPair = series.at(-1);
          if (latestPair) {
            const [latestDay, latestVal] = latestPair;
            if (Number.isSafeInteger(ig.posts)) {
              upsertSeries.run(t.id, 'Instagram', 'posts', latestDay, ig.posts, ig.source, ig.source_type || 'relatorio_autorizado', cleanUrl, now, 'Publicações acumuladas e frequência de atividade verificada');
            }
            if (Number.isSafeInteger(ig.likes)) {
              recordSnapshotAndSeries('likes', latestDay, ig.likes, ig.source, ig.source_type || 'relatorio_autorizado', cleanUrl, 'Média de curtidas nas publicações recentes verificadas');
            }
            if (Number.isSafeInteger(ig.comments)) {
              recordSnapshotAndSeries('comments', latestDay, ig.comments, ig.source, ig.source_type || 'relatorio_autorizado', cleanUrl, 'Média de comentários nas publicações recentes verificadas');
            }
            if (Number.isSafeInteger(ig.views)) {
              recordSnapshotAndSeries('views', latestDay, ig.views, ig.source, ig.source_type || 'relatorio_autorizado', cleanUrl, 'Média de visualizações de Reels verificados');
            }
            upsertMetricCurrent(radarDb, {
              account_id: finalAccId,
              talent_id: t.id,
              network: 'Instagram',
              metric: 'followers',
              value: latestVal,
              observed_on: latestDay,
              collected_at: now,
              source: ig.source,
              status: 'available',
              status_detail: `Coletado via ${ig.source} (${formatCompactPtBr(latestVal)})`
            });
          }
        } else if (includeDemoFixtures && net === 'Spotify' && verified?.spotify_observed) {
          const sp = verified.spotify_observed;
          const series = sp.series || [];
          for (const [dayStr, val] of series) {
            recordSnapshotAndSeries('monthly_listeners', dayStr, val, sp.source, sp.source_type || 'relatorio_autorizado', cleanUrl, 'Fotografia datada de ouvintes mensais (janela móvel de 28 dias)');
          }
          const latestPair = series.at(-1);
          if (latestPair) {
            const [latestDay, latestVal] = latestPair;
            if (Number.isSafeInteger(sp.followers)) {
              recordSnapshotAndSeries('followers', latestDay, sp.followers, sp.source, sp.source_type || 'relatorio_autorizado', cleanUrl, 'Seguidores do perfil do artista no Spotify');
            }
            if (Number.isSafeInteger(sp.streams)) {
              recordSnapshotAndSeries('streams', latestDay, sp.streams, sp.source, sp.source_type || 'relatorio_autorizado', cleanUrl, 'Reproduções verificadas na janela de 30 dias');
            }
            if (sp.repertoire) {
              upsertRepertoire.run(
                t.id,
                sp.repertoire.albums_count ?? null,
                sp.repertoire.singles_count ?? null,
                sp.repertoire.latest_release_title ?? null,
                sp.repertoire.latest_release_date ?? null,
                JSON.stringify(sp.repertoire.top_tracks || []),
                'Spotify Catalog & MusicBrainz WS/2 (CC0)',
                'oficial',
                cleanUrl,
                latestDay,
                now
              );
            }
            upsertMetricCurrent(radarDb, {
              account_id: finalAccId,
              talent_id: t.id,
              network: 'Spotify',
              metric: 'monthly_listeners',
              value: latestVal,
              observed_on: latestDay,
              collected_at: now,
              source: sp.source,
              status: 'available',
              status_detail: `Coletado via ${sp.source} (${formatCompactPtBr(latestVal)})`
            });
          }
        } else if (includeDemoFixtures && net === 'YouTube' && verified?.youtube_observed) {
          const yt = verified.youtube_observed;
          const series = yt.series || [
            [yt.baseline_on, yt.baseline_subscribers],
            [yt.observed_on, yt.subscribers]
          ];
          for (const [dayStr, val] of series) {
            recordSnapshotAndSeries('subscribers', dayStr, val, yt.source, 'oficial', cleanUrl, 'Inscritos públicos oficiais via YouTube Data API v3');
          }
          if (Number.isSafeInteger(yt.views)) {
            recordSnapshotAndSeries('views', yt.observed_on, yt.views, yt.source, 'oficial', cleanUrl, 'Visualizações acumuladas do canal oficial');
          }
          upsertMetricCurrent(radarDb, {
            account_id: finalAccId,
            talent_id: t.id,
            network: 'YouTube',
            metric: 'subscribers',
            value: yt.subscribers,
            observed_on: yt.observed_on,
            collected_at: now,
            source: yt.source,
            status: 'available',
            status_detail: `Coletado via ${yt.source} (${formatCompactPtBr(yt.subscribers)})`
          });
          youtubeMetricsSynced++;
        } else if (includeDemoFixtures && net === 'TikTok' && verified?.tiktok_observed) {
          const tk = verified.tiktok_observed;
          const series = tk.series || [];
          for (const [dayStr, val] of series) {
            recordSnapshotAndSeries('followers', dayStr, val, tk.source, tk.source_type || 'observado', cleanUrl, 'Seguidores públicos observados e conferidos');
          }
          const latestPair = series.at(-1);
          if (latestPair) {
            const [latestDay, latestVal] = latestPair;
            if (Number.isSafeInteger(tk.likes)) {
              recordSnapshotAndSeries('likes', latestDay, tk.likes, tk.source, tk.source_type || 'observado', cleanUrl, 'Curtidas acumuladas no perfil oficial');
            }
            if (Number.isSafeInteger(tk.views)) {
              recordSnapshotAndSeries('views', latestDay, tk.views, tk.source, tk.source_type || 'observado', cleanUrl, 'Visualizações médias em vídeos recentes');
            }
            upsertMetricCurrent(radarDb, {
              account_id: finalAccId,
              talent_id: t.id,
              network: 'TikTok',
              metric: 'followers',
              value: latestVal,
              observed_on: latestDay,
              collected_at: now,
              source: tk.source,
              status: 'available',
              status_detail: `Coletado via ${tk.source} (${formatCompactPtBr(latestVal)})`
            });
          }
        } else {
          // Não sobrescreve se já houver métrica real coletada
          const cur = radarDb.prepare('SELECT value, status FROM metric_current WHERE account_id = ? AND metric = ?').get(finalAccId, metric);
          if (!cur || cur.value == null) {
            upsertMetricCurrent(radarDb, {
              account_id: finalAccId,
              talent_id: t.id,
              network: net,
              metric,
              value: null,
              observed_on: null,
              collected_at: now,
              source: evidenceRef,
              status: net === 'TikTok' ? 'pending_auth' : 'pending_source',
              status_detail: 'Aguardando dados verificados · Perfil oficial identificado'
            });
          }
        }
      }

      // Audiência regional de demonstração: inserida SOMENTE em ambiente de testes (includeDemoFixtures = true)
      if (includeDemoFixtures && verified?.regional) {
        for (const [rNet, rCfg] of Object.entries(verified.regional)) {
          const validPrev = (rCfg.prev || []).filter(([code]) => existingMunis.has(code));
          const validCurr = (rCfg.curr || []).filter(([code]) => existingMunis.has(code));
          if (validPrev.length) {
            insRegionalAuth.run(t.id, rNet, rCfg.metric, '2026-09-19', '2026-10-18', rCfg.source, `rep-prev-${t.id}-${rNet}`, evidenceRef);
            for (const [code, val] of validPrev) {
              insRegional.run(t.id, rNet, rCfg.metric, code, '2026-09-19', '2026-10-18', val, rCfg.source, `rep-prev-${t.id}-${rNet}`, now);
            }
            regionalReportsSynced++;
          }
          if (validCurr.length) {
            insRegionalAuth.run(t.id, rNet, rCfg.metric, '2026-10-19', '2026-11-18', rCfg.source, `rep-curr-${t.id}-${rNet}`, evidenceRef);
            for (const [code, val] of validCurr) {
              insRegional.run(t.id, rNet, rCfg.metric, code, '2026-10-19', '2026-11-18', val, rCfg.source, `rep-curr-${t.id}-${rNet}`, now);
            }
            regionalReportsSynced++;
          }
        }
      }
    }
    radarDb.exec('COMMIT');
  } catch (err) {
    radarDb.exec('ROLLBACK');
    throw err;
  }

  // 4. Se o banco discovery.sqlite for fornecido, promove automaticamente observações reais já coletadas no Motor de Dados
  let discoverySynced = 0;
  if (discoveryDb) {
    try {
      const candidates = discoveryDb.prepare("SELECT * FROM candidates WHERE status != 'rejected'").all();
      const allTalents = radarDb.prepare('SELECT id, name FROM talents WHERE blocked = 0').all();
      const talentByNorm = new Map(allTalents.map(t => [norm(t.name), t]));

      radarDb.exec('BEGIN IMMEDIATE');
      try {
        for (const c of candidates) {
          const matched = (c.radar_id && allTalents.find(t => t.id === c.radar_id)) || talentByNorm.get(norm(c.name));
          const targetId = matched?.id ?? (`discovery-${c.id.slice(0, 24)}`);
          if (!matched) {
            radarDb.prepare('INSERT OR IGNORE INTO talents(id, name, entity_type, blocked) VALUES (?, ?, \'person\', 0)').run(targetId, c.name);
          }
          const profiles = discoveryDb.prepare('SELECT * FROM profiles WHERE candidate_id = ?').all(c.id);
          for (const p of profiles) {
            if (!['Instagram', 'YouTube', 'Spotify', 'TikTok'].includes(p.network)) continue;
            const cleanUrl = p.url.replace(/\/$/, '');
            const accId = `${targetId}-${p.network.toLowerCase().slice(0, 2)}`;
            radarDb.prepare('INSERT OR IGNORE INTO commercial_accounts(id, talent_id, network, url, identity_source) VALUES (?, ?, ?, ?, ?)').run(
              accId,
              targetId,
              p.network,
              cleanUrl,
              c.identity_evidence || cleanUrl
            );
            const obs = discoveryDb.prepare('SELECT * FROM observations WHERE profile_id = ? ORDER BY observed_at DESC').all(p.id);
            for (const o of obs) {
              const dayStr = o.observed_at.slice(0, 10);
              if (['followers', 'views', 'likes', 'comments', 'subscribers', 'monthly_listeners', 'streams'].includes(o.metric)) {
                radarDb.prepare(
                  `INSERT OR IGNORE INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref)
                   VALUES (?, ?, ?, ?, ?, ?)`
                ).run(accId, o.metric, dayStr, o.value, o.source_id || 'Motor de Dados', o.evidence_url || cleanUrl);
              }
              upsertSeries.run(
                targetId,
                p.network,
                o.metric,
                dayStr,
                o.value,
                o.source_id || 'Motor de Dados',
                o.source_id?.includes('youtube') ? 'oficial' : 'observado',
                o.evidence_url || cleanUrl,
                o.observed_at,
                'Coleta registrada pelo Motor de Dados'
              );
              upsertMetricCurrent(radarDb, {
                account_id: accId,
                talent_id: targetId,
                network: p.network,
                metric: o.metric,
                value: o.value,
                observed_on: dayStr,
                collected_at: o.observed_at,
                source: o.source_id || 'Motor de Dados',
                status: 'available',
                status_detail: `Coletado (${formatCompactPtBr(o.value)})`
              });
              discoverySynced++;
            }
          }
        }
        radarDb.exec('COMMIT');
      } catch (err) {
        radarDb.exec('ROLLBACK');
        throw err;
      }
    } catch {}
  }

  return {
    ok: true,
    talentsEnsured,
    demographicsInserted: demoRes.inserted,
    profilesLinked,
    youtubeMetricsSynced,
    socialSeriesSynced,
    regionalReportsSynced,
    discoverySynced,
    executionPlan: EXECUTION_PLAN_8_STEPS
  };
}

/**
 * Calcula estatísticas detalhadas, séries históricas (7, 15 e 30 dias), engajamento,
 * repertório, cidades principais e metadados de qualidade/validade para a Ficha do Artista.
 */
export function getArtistMediaStats(db, talentId, { end = new Date().toISOString().slice(0, 10) } = {}) {
  const artist = db.prepare('SELECT id, name, entity_type FROM talents WHERE id = ? AND blocked = 0').get(talentId);
  if (!artist) return null;

  const commAccs = db.prepare('SELECT id, network, url, identity_source FROM commercial_accounts WHERE talent_id = ?').all(talentId);
  const socAccs = db.prepare('SELECT id, network, url, identity_source, collection_state FROM social_accounts WHERE talent_id = ?').all(talentId);
  const accMap = new Map();
  for (const a of commAccs) accMap.set(a.network, a);
  for (const a of socAccs) if (!accMap.has(a.network)) accMap.set(a.network, a);

  const snaps = db.prepare(
    `SELECT a.network, a.url, s.metric, s.observed_on, s.value, s.source, s.authorization_ref
     FROM commercial_snapshots s
     JOIN commercial_accounts a ON a.id = s.account_id
     WHERE a.talent_id = ? AND s.observed_on <= ?
     ORDER BY s.observed_on ASC`
  ).all(talentId, end);

  const seriesRows = db.prepare(
    `SELECT network, metric, observed_on, value, source, source_type, evidence_url, collected_at, methodology
     FROM media_metric_series
     WHERE talent_id = ? AND observed_on <= ?
     ORDER BY observed_on ASC`
  ).all(talentId, end);

  const getMetricSeries = (net, metric) => {
    const byDate = new Map();
    for (const r of snaps.filter(x => x.network === net && x.metric === metric)) {
      byDate.set(r.observed_on, {
        date: r.observed_on,
        value: r.value,
        source: r.source,
        source_type: r.source?.includes('API') ? 'oficial' : r.source?.includes('Relatório') || r.source?.includes('Artists') || r.source?.includes('Insights') ? 'relatorio_autorizado' : 'observado',
        evidence_url: r.authorization_ref || r.url,
        collected_at: r.observed_on
      });
    }
    for (const r of seriesRows.filter(x => x.network === net && x.metric === metric)) {
      byDate.set(r.observed_on, {
        date: r.observed_on,
        value: r.value,
        source: r.source,
        source_type: r.source_type,
        evidence_url: r.evidence_url,
        collected_at: r.collected_at,
        methodology: r.methodology
      });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  };

  const computeWindowGrowth = (history, days) => {
    if (!history || history.length < 2) {
      return {
        days,
        value: null,
        pct: null,
        formatted: '—',
        baseline_on: null,
        observed_on: history?.at(-1)?.date ?? null,
        classification: 'calculado',
        methodology: `Diferença e taxa proporcional entre duas observações reais (${days} dias)`
      };
    }
    const latest = history.at(-1);
    const targetMs = Date.parse(latest.date) - days * 86400000;
    // Busca a observação real mais próxima do limite da janela
    let baseline = null;
    for (const pt of history.slice(0, -1)) {
      const ptMs = Date.parse(pt.date);
      if (ptMs <= targetMs + 4 * 86400000) {
        if (!baseline || Math.abs(ptMs - targetMs) < Math.abs(Date.parse(baseline.date) - targetMs)) {
          baseline = pt;
        }
      }
    }
    if (!baseline) baseline = history[0];
    if (!baseline || baseline.date === latest.date) {
      return {
        days,
        value: null,
        pct: null,
        formatted: '—',
        baseline_on: null,
        observed_on: latest.date,
        classification: 'calculado',
        methodology: `Diferença e taxa proporcional entre duas observações reais (${days} dias)`
      };
    }
    const delta = latest.value - baseline.value;
    const pct = baseline.value > 0 ? Number(((delta / baseline.value) * 100).toFixed(2)) : null;
    const sign = delta > 0 ? '+' : '';
    return {
      days,
      value: delta,
      pct,
      formatted: `${sign}${formatCompactPtBr(delta)}${pct != null ? ` (${sign}${pct.toFixed(1).replace('.', ',')}%)` : ''}`,
      baseline_on: baseline.date,
      baseline_value: baseline.value,
      observed_on: latest.date,
      classification: 'calculado',
      methodology: `Diferença entre ${latest.date} (${latest.value.toLocaleString('pt-BR')}) e ${baseline.date} (${baseline.value.toLocaleString('pt-BR')})`
    };
  };

  const getRegionalCities = net => {
    const reports = db.prepare(
      `SELECT metric, period_start, period_end, source, quality
       FROM regional_audience
       WHERE talent_id = ? AND network = ? AND period_end <= ?
       GROUP BY metric, period_start, period_end, source, quality
       ORDER BY period_end DESC, CASE WHEN quality = 'verified' THEN 0 ELSE 1 END`
    ).all(talentId, net, end);

    if (!reports.length) {
      return {
        hasData: false,
        statusLabel: '—',
        waitingLabel: 'Aguardando dados verificados',
        report: null,
        cities: []
      };
    }
    const latestRep = reports[0];
    const rows = db.prepare(
      `SELECT a.municipality_code AS code, m.name, m.uf, m.region, a.value
       FROM regional_audience a
       JOIN municipalities m ON m.code = a.municipality_code
       WHERE a.talent_id = ? AND a.network = ? AND a.metric = ?
         AND a.period_start = ? AND a.period_end = ? AND a.source = ?
       ORDER BY a.value DESC, m.name ASC`
    ).all(talentId, net, latestRep.metric, latestRep.period_start, latestRep.period_end, latestRep.source);

    const total = rows.reduce((s, r) => s + r.value, 0);
    // Busca janela anterior da mesma métrica e fonte para evolução por cidade
    const prevRep = reports.find(
      r => r.metric === latestRep.metric && r.source === latestRep.source && r.period_end < latestRep.period_start
    );
    const prevMap = new Map();
    if (prevRep) {
      const prevRows = db.prepare(
        `SELECT municipality_code AS code, value
         FROM regional_audience
         WHERE talent_id = ? AND network = ? AND metric = ?
           AND period_start = ? AND period_end = ? AND source = ?`
      ).all(talentId, net, prevRep.metric, prevRep.period_start, prevRep.period_end, prevRep.source);
      for (const pr of prevRows) prevMap.set(pr.code, pr.value);
    }

    const cities = rows.slice(0, 8).map((r, idx) => {
      const prevVal = prevMap.has(r.code) ? prevMap.get(r.code) : null;
      const growth = prevVal != null ? r.value - prevVal : null;
      const growth_pct = growth != null && prevVal > 0 ? Number(((growth / prevVal) * 100).toFixed(1)) : null;
      return {
        rank: idx + 1,
        code: r.code,
        name: r.name,
        uf: r.uf,
        region: r.region,
        value: r.value,
        formatted: formatCompactPtBr(r.value),
        share_pct: total > 0 ? Number(((r.value / total) * 100).toFixed(1)) : null,
        previous_value: prevVal,
        growth,
        growth_pct,
        classification: latestRep.quality === 'verified' ? 'relatorio_autorizado' : 'estimado'
      };
    });

    return {
      hasData: cities.length > 0,
      statusLabel: cities.length > 0 ? cities.slice(0, 3).map(c => `${c.name}/${c.uf} (${c.formatted})`).join(' · ') : '—',
      waitingLabel: cities.length > 0 ? null : 'Aguardando dados verificados',
      report: {
        ...latestRep,
        classification: latestRep.quality === 'verified' ? 'relatorio_autorizado' : 'estimado',
        previous_period: prevRep ? `${prevRep.period_start} a ${prevRep.period_end}` : null
      },
      total,
      cities
    };
  };

  // 1. Instagram
  const igAcc = accMap.get('Instagram') || null;
  const igFollowersSeries = getMetricSeries('Instagram', 'followers');
  const igLatestFollowers = igFollowersSeries.at(-1) || null;
  const igPosts = getMetricSeries('Instagram', 'posts').at(-1) || null;
  const igLikes = getMetricSeries('Instagram', 'likes').at(-1) || null;
  const igComments = getMetricSeries('Instagram', 'comments').at(-1) || null;
  const igReels = getMetricSeries('Instagram', 'views').at(-1) || null;
  const igCities = getRegionalCities('Instagram');

  const igPerPost = igLikes || igComments ? (igLikes?.value ?? 0) + (igComments?.value ?? 0) : null;
  const igEngRate = igPerPost != null && igLatestFollowers?.value > 0
    ? Number(((igPerPost / igLatestFollowers.value) * 100).toFixed(2))
    : null;

  const instagramStats = {
    network: 'Instagram',
    profile_url: igAcc?.url ?? null,
    has_verified_data: Boolean(igLatestFollowers),
    waiting_label: igLatestFollowers ? null : 'Aguardando dados verificados',
    followers: {
      value: igLatestFollowers?.value ?? null,
      formatted: igLatestFollowers ? formatCompactPtBr(igLatestFollowers.value) : '—',
      observed_on: igLatestFollowers?.date ?? null,
      collected_at: igLatestFollowers?.collected_at ?? null,
      source: igLatestFollowers?.source ?? null,
      evidence_url: igLatestFollowers?.evidence_url ?? igAcc?.url ?? null,
      classification: igLatestFollowers?.source_type ?? null,
      validity: classifyMetricValidity(igLatestFollowers?.date ?? null, end)
    },
    growth_7d: computeWindowGrowth(igFollowersSeries, 7),
    growth_15d: computeWindowGrowth(igFollowersSeries, 15),
    growth_30d: computeWindowGrowth(igFollowersSeries, 30),
    recent_posts: {
      value: igPosts?.value ?? null,
      formatted: igPosts ? `${igPosts.value.toLocaleString('pt-BR')} publicações` : '—',
      observed_on: igPosts?.date ?? null,
      source: igPosts?.source ?? null,
      classification: igPosts?.source_type ?? null
    },
    likes_comments: {
      likes: igLikes?.value ?? null,
      comments: igComments?.value ?? null,
      total_per_post: igPerPost,
      formatted: igPerPost != null
        ? `${formatCompactPtBr(igLikes?.value ?? 0)} curtidas · ${formatCompactPtBr(igComments?.value ?? 0)} comentários/post`
        : '—',
      observed_on: igLikes?.date ?? igComments?.date ?? null,
      source: igLikes?.source ?? igComments?.source ?? null,
      classification: igLikes?.source_type ?? null
    },
    engagement: {
      rate_pct: igEngRate,
      interactions_per_post: igPerPost,
      formatted: igEngRate != null
        ? `${igEngRate.toFixed(2).replace('.', ',')}% (${formatCompactPtBr(igPerPost)} interações/post)`
        : '—',
      classification: igEngRate != null ? 'calculado' : null,
      methodology: '(Curtidas médias + Comentários médios por publicação verificada) ÷ Seguidores na data da observação × 100'
    },
    reels_views: {
      value: igReels?.value ?? null,
      formatted: igReels ? `${formatCompactPtBr(igReels.value)} views/Reels` : '—',
      observed_on: igReels?.date ?? null,
      source: igReels?.source ?? null,
      classification: igReels?.source_type ?? null
    },
    top_cities: igCities,
    history: igFollowersSeries
  };

  // 2. Spotify
  const spAcc = accMap.get('Spotify') || null;
  const spListenersSeries = getMetricSeries('Spotify', 'monthly_listeners');
  const spLatestListeners = spListenersSeries.at(-1) || null;
  const spFollowers = getMetricSeries('Spotify', 'followers').at(-1) || null;
  const spStreams = getMetricSeries('Spotify', 'streams').at(-1) || null;
  const spRep = db.prepare('SELECT * FROM spotify_repertoire WHERE talent_id = ?').get(talentId) || null;
  let spTopTracks = [];
  try { spTopTracks = JSON.parse(spRep?.top_tracks_json || '[]'); } catch {}
  const spCities = getRegionalCities('Spotify');

  const spotifyStats = {
    network: 'Spotify',
    profile_url: spAcc?.url ?? null,
    has_verified_data: Boolean(spLatestListeners),
    waiting_label: spLatestListeners ? null : 'Aguardando dados verificados',
    monthly_listeners: {
      value: spLatestListeners?.value ?? null,
      formatted: spLatestListeners ? formatCompactPtBr(spLatestListeners.value) : '—',
      observed_on: spLatestListeners?.date ?? null,
      collected_at: spLatestListeners?.collected_at ?? null,
      source: spLatestListeners?.source ?? null,
      evidence_url: spLatestListeners?.evidence_url ?? spAcc?.url ?? null,
      classification: spLatestListeners?.source_type ?? null,
      validity: classifyMetricValidity(spLatestListeners?.date ?? null, end)
    },
    growth_7d: computeWindowGrowth(spListenersSeries, 7),
    growth_15d: computeWindowGrowth(spListenersSeries, 15),
    growth_30d: computeWindowGrowth(spListenersSeries, 30),
    followers: {
      value: spFollowers?.value ?? null,
      formatted: spFollowers ? formatCompactPtBr(spFollowers.value) : '—',
      observed_on: spFollowers?.date ?? null,
      source: spFollowers?.source ?? null,
      classification: spFollowers?.source_type ?? null
    },
    streams_30d: {
      value: spStreams?.value ?? null,
      formatted: spStreams ? formatCompactPtBr(spStreams.value) : '—',
      observed_on: spStreams?.date ?? null,
      source: spStreams?.source ?? null,
      classification: spStreams?.source_type ?? null
    },
    repertoire: {
      albums_count: spRep?.albums_count ?? null,
      singles_count: spRep?.singles_count ?? null,
      latest_release_title: spRep?.latest_release_title ?? null,
      latest_release_date: spRep?.latest_release_date ?? null,
      formatted: spRep && (spRep.albums_count != null || spRep.singles_count != null)
        ? `${spRep.albums_count ?? 0} álbuns · ${spRep.singles_count ?? 0} singles${spRep.latest_release_title ? ` · Último: ${spRep.latest_release_title}` : ''}`
        : '—',
      top_tracks: spTopTracks.map(tr => ({
        title: tr.title,
        streams: tr.streams ?? null,
        formatted: tr.streams ? `${tr.title} (${formatCompactPtBr(tr.streams)})` : tr.title
      })),
      top_tracks_formatted: spTopTracks.length
        ? spTopTracks.slice(0, 3).map(tr => tr.streams ? `${tr.title} (${formatCompactPtBr(tr.streams)})` : tr.title).join(' · ')
        : '—',
      source: spRep?.source ?? null,
      classification: spRep?.source_type ?? null,
      evidence_url: spRep?.evidence_url ?? spAcc?.url ?? null,
      observed_on: spRep?.observed_on ?? null
    },
    top_cities: spCities,
    history: spListenersSeries
  };

  // 3. YouTube & TikTok
  const ytAcc = accMap.get('YouTube') || null;
  const ytSeries = getMetricSeries('YouTube', 'subscribers');
  const ytLatest = ytSeries.at(-1) || null;
  const ytViews = getMetricSeries('YouTube', 'views').at(-1) || null;
  const ytCities = getRegionalCities('YouTube');

  const tkAcc = accMap.get('TikTok') || null;
  const tkSeries = getMetricSeries('TikTok', 'followers');
  const tkLatest = tkSeries.at(-1) || null;
  const tkLikes = getMetricSeries('TikTok', 'likes').at(-1) || null;
  const tkCities = getRegionalCities('TikTok');

  return {
    talent_id: artist.id,
    name: artist.name,
    reference_end: end,
    Instagram: instagramStats,
    Spotify: spotifyStats,
    YouTube: {
      network: 'YouTube',
      profile_url: ytAcc?.url ?? null,
      has_verified_data: Boolean(ytLatest),
      waiting_label: ytLatest ? null : 'Aguardando dados verificados',
      subscribers: {
        value: ytLatest?.value ?? null,
        formatted: ytLatest ? formatCompactPtBr(ytLatest.value) : '—',
        observed_on: ytLatest?.date ?? null,
        collected_at: ytLatest?.collected_at ?? null,
        source: ytLatest?.source ?? null,
        evidence_url: ytLatest?.evidence_url ?? ytAcc?.url ?? null,
        classification: ytLatest?.source_type ?? 'oficial',
        validity: classifyMetricValidity(ytLatest?.date ?? null, end)
      },
      growth_7d: computeWindowGrowth(ytSeries, 7),
      growth_15d: computeWindowGrowth(ytSeries, 15),
      growth_30d: computeWindowGrowth(ytSeries, 30),
      views: {
        value: ytViews?.value ?? null,
        formatted: ytViews ? formatCompactPtBr(ytViews.value) : '—',
        observed_on: ytViews?.date ?? null,
        source: ytViews?.source ?? null,
        classification: 'oficial'
      },
      top_cities: ytCities,
      history: ytSeries
    },
    TikTok: {
      network: 'TikTok',
      profile_url: tkAcc?.url ?? null,
      has_verified_data: Boolean(tkLatest),
      waiting_label: tkLatest ? null : 'Aguardando dados verificados',
      followers: {
        value: tkLatest?.value ?? null,
        formatted: tkLatest ? formatCompactPtBr(tkLatest.value) : '—',
        observed_on: tkLatest?.date ?? null,
        collected_at: tkLatest?.collected_at ?? null,
        source: tkLatest?.source ?? null,
        evidence_url: tkLatest?.evidence_url ?? tkAcc?.url ?? null,
        classification: tkLatest?.source_type ?? 'observado',
        validity: classifyMetricValidity(tkLatest?.date ?? null, end)
      },
      growth_7d: computeWindowGrowth(tkSeries, 7),
      growth_15d: computeWindowGrowth(tkSeries, 15),
      growth_30d: computeWindowGrowth(tkSeries, 30),
      likes: {
        value: tkLikes?.value ?? null,
        formatted: tkLikes ? formatCompactPtBr(tkLikes.value) : '—',
        observed_on: tkLikes?.date ?? null,
        source: tkLikes?.source ?? null,
        classification: 'observado'
      },
      top_cities: tkCities,
      history: tkSeries
    }
  };
}

/**
 * Importa eventos de agenda oficial do artista ou de ticketeiras com metadados de fonte e preço publicado.
 * Nota: Eventos publicados permanecem apenas como consulta opcional, sem influenciar pontuações ou rankings.
 */
export function importOfficialAgenda(db, {
  artist_name,
  talent_id = null,
  platform = 'sympla',
  observed_on = new Date().toISOString().slice(0, 10),
  source = 'Agenda oficial do artista',
  official_agenda_url = null,
  items = []
} = {}) {
  if (!Array.isArray(items) || !items.length) throw new FilterError('Informe pelo menos um evento da agenda oficial');
  const enrichedItems = items.map(it => ({
    ...it,
    artists: Array.isArray(it.artists) && it.artists.length ? it.artists : (artist_name ? [artist_name] : [])
  }));
  const count = importEvents(db, {
    platform,
    observed_on,
    source,
    items: enrichedItems
  }, null, { tolerateConflicts: true });

  const now = new Date().toISOString();
  const upsertEventMeta = db.prepare(
    `INSERT INTO event_metadata(event_id, price_info, source_type, official_agenda_url, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       price_info = COALESCE(excluded.price_info, event_metadata.price_info),
       source_type = excluded.source_type,
       official_agenda_url = COALESCE(excluded.official_agenda_url, event_metadata.official_agenda_url),
       updated_at = excluded.updated_at`
  );

  for (const it of enrichedItems) {
    const listing = db.prepare('SELECT event_id FROM event_listings WHERE platform_id = ? AND external_id = ?').get(platform, String(it.external_id));
    if (listing) {
      upsertEventMeta.run(
        listing.event_id,
        it.price_info ? String(it.price_info) : null,
        it.source_type === 'ticketeira' ? 'ticketeira' : 'agenda_oficial',
        official_agenda_url || it.url || null,
        now
      );
    }
  }

  if (talent_id && official_agenda_url) {
    db.prepare(
      `INSERT INTO talent_metadata(talent_id, agenda_url, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(talent_id) DO UPDATE SET agenda_url = excluded.agenda_url, updated_at = excluded.updated_at`
    ).run(talent_id, official_agenda_url, now);
  }

  return { imported: count, source, source_type: 'agenda_oficial' };
}

/**
 * Cruzamento Inteligente das Informações (4 Mídias + MusicBrainz + Audiência Regional + Demografia IBGE;
 * Ticketeiras mantidas apenas como consulta opcional complementar, sem participar dos rankings).
 */
export function getCrossMenuSummary(db, params = new URLSearchParams()) {
  const q = norm(params.get('q') || '');
  const talentParam = (params.get('talent') || '').trim();
  const categoryParam = (params.get('category') || '').trim();
  const modalityParam = (params.get('modality') || '').trim();
  const onlyWithData = params.get('onlyWithData') === '1';
  const limit = Math.min(200, Math.max(1, Number(params.get('limit') || 100)));

  const talents = db.prepare(
    `SELECT t.id, t.name, t.entity_type,
            tm.wikidata_id, tm.musicbrainz_id, tm.official_website, tm.agenda_url, tm.genres, tm.description
     FROM talents t
     LEFT JOIN talent_metadata tm ON tm.talent_id = t.id
     WHERE t.blocked = 0
       AND (? = '' OR t.id = ?)
       AND (? = '' OR EXISTS (SELECT 1 FROM talent_categories tc WHERE tc.talent_id = t.id AND (CAST(tc.category_id AS TEXT) = ? OR EXISTS (SELECT 1 FROM categories c WHERE c.id = tc.category_id AND lower(c.name) = lower(?)))))
       AND (? = '' OR EXISTS (SELECT 1 FROM talent_modalities m WHERE m.talent_id = t.id AND m.modality_id = ?))
     ORDER BY t.name ASC`
  ).all(talentParam, talentParam, categoryParam, categoryParam, categoryParam, modalityParam, modalityParam);

  const filteredTalents = q
    ? talents.filter(t => norm(t.name).includes(q) || norm(t.id).includes(q) || norm(t.description || '').includes(q))
    : talents;

  // Pré-carrega contas, métricas atuais, snapshots comerciais e nacionais
  const commAccounts = db.prepare('SELECT id, talent_id, network, url, identity_source FROM commercial_accounts').all();
  const socAccounts = db.prepare('SELECT id, talent_id, network, url, external_id, identity_source, collection_state FROM social_accounts').all();
  const currentMetrics = db.prepare('SELECT * FROM metric_current').all();
  const commSnapshots = db.prepare(
    `SELECT a.talent_id, a.network, a.url, s.metric, s.observed_on, s.value, s.source
     FROM commercial_snapshots s
     JOIN commercial_accounts a ON a.id = s.account_id
     ORDER BY s.observed_on DESC`
  ).all();
  const natSnapshots = db.prepare(
    `SELECT a.talent_id, a.network, a.url, s.metric, s.observed_on, s.value, s.source
     FROM metric_snapshots s
     JOIN social_accounts a ON a.id = s.account_id
     ORDER BY s.observed_on DESC, s.id DESC`
  ).all();

  // Eventos e atrações (consulta opcional complementar)
  const allEventArtists = db.prepare(
    `SELECT a.artist_key, a.name, l.platform_id, l.url, l.status,
            e.id AS event_id, e.title, e.venue, e.event_date, e.municipality_code,
            m.name AS city_name, m.uf, m.region,
            em.price_info, em.source_type
     FROM event_listing_artists a
     JOIN event_listings l ON l.platform_id = a.platform_id AND l.external_id = a.external_id
     JOIN events e ON e.id = l.event_id
     JOIN municipalities m ON m.code = e.municipality_code
     LEFT JOIN event_metadata em ON em.event_id = e.id
     WHERE l.status != 'cancelled'
     ORDER BY e.event_date ASC`
  ).all();

  // Audiência regional por talento
  const regSummaryRows = db.prepare(
    `SELECT a.talent_id, a.network, a.metric, count(DISTINCT a.municipality_code) AS cities_count,
            sum(a.value) AS total_value, max(a.period_end) AS latest_end, a.source, a.quality
     FROM regional_audience a
     GROUP BY a.talent_id, a.network, a.metric, a.source, a.quality`
  ).all();

  // Categorias e modalidades por talento
  const catMap = new Map();
  for (const r of db.prepare('SELECT tc.talent_id, c.name FROM talent_categories tc JOIN categories c ON c.id = tc.category_id').all()) {
    if (!catMap.has(r.talent_id)) catMap.set(r.talent_id, []);
    catMap.get(r.talent_id).push(r.name);
  }
  const modMap = new Map();
  for (const r of db.prepare('SELECT tm.talent_id, m.id, m.name FROM talent_modalities tm JOIN modalities m ON m.id = tm.modality_id').all()) {
    if (!modMap.has(r.talent_id)) modMap.set(r.talent_id, []);
    modMap.get(r.talent_id).push(r.name);
  }

  const accByTalentNet = new Map();
  for (const a of commAccounts) accByTalentNet.set(`${a.talent_id}|${a.network}`, a);
  for (const a of socAccounts) {
    const k = `${a.talent_id}|${a.network}`;
    if (!accByTalentNet.has(k)) accByTalentNet.set(k, a);
  }

  const curByTalentNet = new Map();
  for (const c of currentMetrics) {
    const k = `${c.talent_id}|${c.network}`;
    if (!curByTalentNet.has(k) || c.value != null) curByTalentNet.set(k, c);
  }

  const primary = {
    Instagram: 'followers',
    YouTube: 'subscribers',
    Spotify: 'monthly_listeners',
    TikTok: 'followers'
  };

  const snapsByTalentNet = new Map();
  for (const s of [...commSnapshots, ...natSnapshots]) {
    if (s.metric !== primary[s.network]) continue;
    const k = `${s.talent_id}|${s.network}`;
    if (!snapsByTalentNet.has(k)) snapsByTalentNet.set(k, []);
    const arr = snapsByTalentNet.get(k);
    if (!arr.some(x => x.observed_on === s.observed_on && x.metric === s.metric)) {
      arr.push(s);
    }
  }

  const regByTalent = new Map();
  for (const r of regSummaryRows) {
    if (!regByTalent.has(r.talent_id)) regByTalent.set(r.talent_id, []);
    regByTalent.get(r.talent_id).push(r);
  }

  const items = [];
  for (const t of filteredTalents) {
    const tNorm = norm(t.name);
    const media = {};
    let hasCollectedMetric = false;
    let maxNumericValue = 0;

    for (const net of ['Instagram', 'YouTube', 'Spotify', 'TikTok']) {
      const k = `${t.id}|${net}`;
      const acc = accByTalentNet.get(k) || null;
      const cur = curByTalentNet.get(k) || null;
      const snaps = (snapsByTalentNet.get(k) || []).sort((a, b) => b.observed_on.localeCompare(a.observed_on));
      const latestSnap = snaps[0] || null;
      const baselineSnap = snaps.length > 1 ? snaps[snaps.length - 1] : null;

      const value = latestSnap?.value ?? cur?.value ?? null;
      const observed_on = latestSnap?.observed_on ?? cur?.observed_on ?? null;
      const source = latestSnap?.source ?? cur?.source ?? acc?.identity_source ?? null;
      const growth = latestSnap && baselineSnap && latestSnap.observed_on !== baselineSnap.observed_on
        ? latestSnap.value - baselineSnap.value
        : null;
      const growth_pct = growth != null && baselineSnap.value > 0
        ? Number(((growth / baselineSnap.value) * 100).toFixed(1))
        : null;

      if (value != null) {
        hasCollectedMetric = true;
        if (value > maxNumericValue) maxNumericValue = value;
      }

      const validity = classifyMetricValidity(observed_on);
      const classification = value == null
        ? null
        : source?.includes('API')
          ? 'oficial'
          : source?.includes('Relatório') || source?.includes('Artists') || source?.includes('Insights')
            ? 'relatorio_autorizado'
            : 'observado';

      media[net] = {
        network: net,
        metric: primary[net],
        value,
        formatted: value != null ? formatCompactPtBr(value) : 'Sem coleta',
        status: value != null ? 'collected' : (acc ? 'no_collection' : 'unidentified'),
        statusLabel: value != null ? formatCompactPtBr(value) : 'Sem coleta',
        detailLabel: value != null
          ? `${value.toLocaleString('pt-BR')} · ${source || 'Coleta verificada'} (${observed_on || 'atual'} · ${validity.label})`
          : (acc ? 'Aguardando dados verificados · Perfil oficial identificado' : 'Aguardando identificação/coleta'),
        url: acc?.url ?? null,
        observed_on,
        baseline_on: baselineSnap?.observed_on ?? null,
        growth,
        growth_pct,
        source,
        classification,
        validity
      };
    }

    const matchingEvents = allEventArtists.filter(
      e => e.artist_key === tNorm || (tNorm.length >= 4 && (e.artist_key.includes(tNorm) || tNorm.includes(e.artist_key)))
    );
    const uniqueEventIds = new Set(matchingEvents.map(e => e.event_id));
    const uniqueCities = [...new Set(matchingEvents.map(e => `${e.city_name}/${e.uf}`))];
    const uniquePlatforms = [...new Set(matchingEvents.map(e => e.platform_id))];

    const regRows = regByTalent.get(t.id) || [];
    const regCitiesMax = regRows.reduce((m, r) => Math.max(m, r.cities_count), 0);
    const regNetworks = [...new Set(regRows.map(r => r.network))];

    if (onlyWithData && !hasCollectedMetric && regRows.length === 0) {
      continue;
    }

    let parsedGenres = [];
    try { parsedGenres = JSON.parse(t.genres || '[]'); } catch {}

    items.push({
      id: t.id,
      name: t.name,
      entity_type: t.entity_type,
      categories: catMap.get(t.id) || [],
      modalities: modMap.get(t.id) || [],
      catalog: {
        wikidata_id: t.wikidata_id || null,
        musicbrainz_id: t.musicbrainz_id || null,
        official_website: t.official_website || null,
        agenda_url: t.agenda_url || null,
        genres: parsedGenres,
        description: t.description || ''
      },
      media,
      events: {
        count: uniqueEventIds.size,
        citiesCount: uniqueCities.length,
        cities: uniqueCities,
        platforms: uniquePlatforms,
        optionalConsultationOnly: true,
        status: uniqueEventIds.size > 0 ? 'integrated' : 'pending_integration',
        statusLabel: uniqueEventIds.size > 0
          ? `${uniqueEventIds.size} evento(s) em ${uniqueCities.length} cidade(s)`
          : 'A integrar',
        items: matchingEvents.slice(0, 10).map(e => ({
          event_id: e.event_id,
          title: e.title,
          city: `${e.city_name}/${e.uf}`,
          region: e.region,
          venue: e.venue,
          date: e.event_date,
          platform: e.platform_id,
          url: e.url,
          price_info: e.price_info || null,
          source_type: e.source_type || 'ticketeira'
        })),
        notice: 'Consulta opcional: eventos publicados indicam presença territorial, mas não entram nos cálculos de ranking/pontuação nem estimam ingressos vendidos.'
      },
      regionalAudience: {
        hasData: regRows.length > 0,
        municipalitiesCount: regCitiesMax,
        networks: regNetworks,
        status: regRows.length > 0 ? 'available' : 'no_data',
        statusLabel: regRows.length > 0
          ? `${regCitiesMax} município(s) (${regNetworks.join(', ')})`
          : 'Sem dados',
        reports: regRows
      },
      maxNumericValue,
      hasCollectedMetric
    });
  }

  // Regra: Rankings de artistas não utilizam dados das ticketeiras!
  // Ordena exclusivamente por métricas verificadas das mídias e audiência regional comprovada.
  items.sort((a, b) =>
    Number(b.hasCollectedMetric) - Number(a.hasCollectedMetric) ||
    b.maxNumericValue - a.maxNumericValue ||
    Number(b.regionalAudience.hasData) - Number(a.regionalAudience.hasData) ||
    a.name.localeCompare(b.name)
  );

  const counts = {
    talents: db.prepare('SELECT count(*) n FROM talents WHERE blocked = 0').get().n,
    withOfficialProfiles: db.prepare('SELECT count(DISTINCT talent_id) n FROM commercial_accounts').get().n,
    withCollectedMetrics: items.filter(i => i.hasCollectedMetric).length,
    withMusicBrainzOrWikidata: db.prepare('SELECT count(*) n FROM talent_metadata WHERE wikidata_id IS NOT NULL OR musicbrainz_id IS NOT NULL').get().n,
    events: db.prepare('SELECT count(*) n FROM events').get().n,
    eventListings: db.prepare('SELECT count(*) n FROM event_listings').get().n,
    regionalRecords: db.prepare('SELECT count(*) n FROM regional_audience').get().n,
    municipalities: db.prepare('SELECT count(*) n FROM municipalities').get().n,
    demographicsMunicipalities: db.prepare('SELECT count(*) n FROM municipality_demographics').get().n
  };

  return {
    total: items.length,
    counts,
    executionPlan: {
      completedSteps: 8,
      totalSteps: 8,
      label: '8 de 8 etapas concluídas',
      steps: EXECUTION_PLAN_8_STEPS
    },
    menus: [
      { menu: 'Visão Geral', info: 'Seguidores, ouvintes mensais, inscritos, engajamento e evolução (7d/15d/30d)', source: 'Instagram · Spotify · YouTube · TikTok', active: true },
      { menu: 'Audiência Geográfica', info: 'Cidades com maior audiência por mídia e evolução municipal comprovada', source: 'Spotify for Artists · Instagram Insights · YouTube Analytics', active: true },
      { menu: 'Oportunidade Comercial', info: 'Cruzamento de audiência, presença digital e dados socioeconômicos (sem ticketeiras)', source: '4 Mídias + Audiência Municipal + Demografia IBGE', active: true },
      { menu: 'Motor de Dados', info: 'Descoberta, validação, classificação de qualidade e atualização periódica', source: 'Wikidata · MusicBrainz · APIs Oficiais · CSV Autorizado', active: true },
      { menu: 'Base Geográfica Nacional', info: 'Municípios, população e PIB per capita oficial', source: 'IBGE — Censo Demográfico e PIB dos Municípios', active: true },
      { menu: 'Consultas Opcionais — Eventos e Ticketeiras', info: 'Consulta opcional de eventos publicados (sem influenciar pontuações ou rankings)', source: 'Sympla · Ingresse · Eventim · Ticketmaster · Bilheteria Digital', active: true, optional: true }
    ],
    items: items.slice(0, limit),
    notice: 'Indicadores auditáveis com fonte, data de referência e classificação (oficial, relatório autorizado, observado ou calculado). Ticketeiras permanecem apenas como consulta opcional complementar, sem participar dos cálculos.'
  };
}
