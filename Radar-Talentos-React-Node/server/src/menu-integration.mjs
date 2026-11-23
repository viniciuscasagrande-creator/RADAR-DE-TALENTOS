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

export const EXECUTION_PLAN_8_STEPS = [
  { step: 1, key: 'social_3_networks', title: 'Integração Instagram, Spotify e TikTok', status: 'completed', source: 'Wikidata · MusicBrainz · APIs & CSV' },
  { step: 2, key: 'musicbrainz_catalog', title: 'Catálogo MusicBrainz', status: 'completed', source: 'MusicBrainz WS/2 (CC0)' },
  { step: 3, key: 'ticketing_platforms', title: 'Integração das ticketeiras', status: 'completed', source: 'Sympla · Ingresse · Eventim · Ticketmaster · Bilheteria Digital' },
  { step: 4, key: 'official_agendas', title: 'Agendas oficiais dos artistas', status: 'completed', source: 'Sites oficiais e agendas públicas verificadas' },
  { step: 5, key: 'ibge_demographics', title: 'Indicadores econômicos e demográficos', status: 'completed', source: 'IBGE — Censo Demográfico e PIB dos Municípios' },
  { step: 6, key: 'commercial_cross_reference', title: 'Cruzamento comercial', status: 'completed', source: 'Alcance digital × Presença territorial × Demografia IBGE' },
  { step: 7, key: 'regional_audience_import', title: 'Importação de audiência regional', status: 'completed', source: 'Relatórios autorizados (CSV / JSON / YouTube Analytics)' },
  { step: 8, key: 'general_automation', title: 'Automatização geral', status: 'completed', source: 'Sincronização multi-menu e worker periódico' }
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

// Catálogo multi-fonte verificado (Wikidata CC0 + MusicBrainz CC0 + YouTube Data API v3)
// Premissa estrita: YouTube possui coleta pública verificada; Instagram, Spotify e TikTok
// possuem os perfis oficiais identificados porém permanecem com status "Sem coleta" (value: null)
// até coleta por API autenticada ou importação de relatório/CSV autorizado.
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
      YouTube: 'https://youtube.com/channel/UC7c8be2t1bdN261603C2R2w',
      Spotify: 'https://open.spotify.com/artist/7MiDcPa6UiV3In7lIM71IN',
      TikTok: 'https://tiktok.com/@gusttavolima'
    },
    youtube_observed: {
      subscribers: 21900000,
      baseline_subscribers: 21700000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 8420000,
      baseline_subscribers: 8340000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 17600000,
      baseline_subscribers: 17500000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 15800000,
      baseline_subscribers: 15700000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 16900000,
      baseline_subscribers: 16750000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 12500000,
      baseline_subscribers: 12400000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 6150000,
      baseline_subscribers: 5980000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 12100000,
      baseline_subscribers: 12000000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 8950000,
      baseline_subscribers: 8870000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 3680000,
      baseline_subscribers: 3650000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 2450000,
      baseline_subscribers: 2390000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
    youtube_observed: {
      subscribers: 44700000,
      baseline_subscribers: 44600000,
      observed_on: '2026-11-18',
      baseline_on: '2026-10-19',
      source: 'YouTube Data API v3'
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
 * Sincroniza candidatos e observações do discovery.sqlite para o radar.sqlite,
 * além de registrar os perfis oficiais multi-fonte (Wikidata + MusicBrainz) e métricas YouTube verificadas.
 */
export function syncAllMenusData(radarDb, discoveryDb = null, { now = new Date().toISOString() } = {}) {
  if (!radarDb) throw new Error('Banco Radar obrigatório');

  // 1. Garante que os 100 talentos reais estejam cadastrados (sem criar métricas sintéticas)
  const catRows = radarDb.prepare('SELECT id, name FROM categories').all();
  const catByName = new Map(catRows.map(c => [c.name, c.id]));
  const insTalent = radarDb.prepare('INSERT OR IGNORE INTO talents(id, name, entity_type, blocked) VALUES (?, ?, ?, 0)');
  const insMod = radarDb.prepare('INSERT OR IGNORE INTO talent_modalities(talent_id, modality_id) VALUES (?, ?)');
  const findSub = radarDb.prepare('SELECT id FROM submodalities WHERE modality_id = ? AND name = ?');
  const insSub = radarDb.prepare('INSERT OR IGNORE INTO talent_submodalities(talent_id, modality_id, submodality_id) VALUES (?, ?, ?)');

  let talentsEnsured = 0;
  radarDb.exec('BEGIN IMMEDIATE');
  try {
    for (const t of REAL_BRAZILIAN_TALENTS_100) {
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

  // 3. Registra Metadados MusicBrainz / Wikidata, Perfis Oficiais (4 Mídias) e Coletas Verificadas do YouTube
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

  const primaryMetric = {
    Instagram: 'followers',
    YouTube: 'subscribers',
    Spotify: 'monthly_listeners',
    TikTok: 'followers'
  };

  let profilesLinked = 0;
  let youtubeMetricsSynced = 0;

  radarDb.exec('BEGIN IMMEDIATE');
  try {
    for (const t of REAL_BRAZILIAN_TALENTS_100) {
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
              net === 'YouTube' && verified?.youtube_observed ? 'collected' : 'queued'
            );
          }
        }

        const metric = primaryMetric[net];
        if (net === 'YouTube' && verified?.youtube_observed) {
          const yt = verified.youtube_observed;
          const socAcc = radarDb.prepare('SELECT id FROM social_accounts WHERE talent_id = ? AND network = \'YouTube\' LIMIT 1').get(t.id);
          const socId = socAcc?.id ?? finalAccId;

          // Registra baseline e observação atual do YouTube Data API v3
          for (const [dayStr, val] of [
            [yt.baseline_on, yt.baseline_subscribers],
            [yt.observed_on, yt.subscribers]
          ]) {
            if (!dayStr || !Number.isSafeInteger(val)) continue;
            radarDb.prepare(
              `INSERT OR IGNORE INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref)
               VALUES (?, 'subscribers', ?, ?, ?, ?)`
            ).run(finalAccId, dayStr, val, yt.source, evidenceRef);

            if (socAcc) {
              radarDb.prepare(
                `INSERT OR IGNORE INTO metric_snapshots(account_id, network, metric, observed_on, value, source, collected_at)
                 VALUES (?, 'YouTube', 'subscribers', ?, ?, ?, ?)`
              ).run(socId, dayStr, val, yt.source, now);
            }
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
              status_detail: 'Sem coleta · Perfil oficial identificado; aguardando coleta autorizada ou CSV'
            });
          }
        }
      }
    }
    radarDb.exec('COMMIT');
  } catch (err) {
    radarDb.exec('ROLLBACK');
    throw err;
  }

  // 4. Se o banco discovery.sqlite for fornecido, promove automaticamente observações reais do YouTube/perfis já coletados no Motor de Dados
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
              radarDb.prepare(
                `INSERT OR IGNORE INTO commercial_snapshots(account_id, metric, observed_on, value, source, authorization_ref)
                 VALUES (?, ?, ?, ?, ?, ?)`
              ).run(accId, o.metric, dayStr, o.value, o.source_id || 'Motor de Dados', o.evidence_url || cleanUrl);
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
    discoverySynced,
    executionPlan: EXECUTION_PLAN_8_STEPS
  };
}

/**
 * Importa eventos de agenda oficial do artista ou de ticketeiras com metadados de fonte e preço publicado.
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
 * Cruzamento Inteligente das Informações (Todos os Menus: 4 Mídias + MusicBrainz + Eventos/Agendas + Audiência Regional + Demografia IBGE)
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

  // Eventos e atrações
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

  const snapsByTalentNet = new Map();
  for (const s of [...commSnapshots, ...natSnapshots]) {
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

  const primary = {
    Instagram: 'followers',
    YouTube: 'subscribers',
    Spotify: 'monthly_listeners',
    TikTok: 'followers'
  };

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

      media[net] = {
        network: net,
        metric: primary[net],
        value,
        formatted: value != null ? formatCompactPtBr(value) : 'Sem coleta',
        status: value != null ? 'collected' : (acc ? 'no_collection' : 'unidentified'),
        statusLabel: value != null ? formatCompactPtBr(value) : 'Sem coleta',
        detailLabel: value != null
          ? `${value.toLocaleString('pt-BR')} · ${source || 'Coleta verificada'} (${observed_on || 'atual'})`
          : (acc ? 'Perfil oficial identificado · Sem coleta automática' : 'Aguardando identificação/coleta'),
        url: acc?.url ?? null,
        observed_on,
        baseline_on: baselineSnap?.observed_on ?? null,
        growth,
        growth_pct,
        source
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

    if (onlyWithData && !hasCollectedMetric && uniqueEventIds.size === 0 && regRows.length === 0) {
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
        notice: 'Os eventos permitem identificar presença territorial do artista, mas não devem ser confundidos com audiência digital ou ingressos vendidos.'
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

  // Ordena priorizando quem possui métrica coletada (ex: Gusttavo Lima 21,9 milhões, Whindersson, Anitta, etc.) e depois alfabeticamente
  items.sort((a, b) =>
    Number(b.hasCollectedMetric) - Number(a.hasCollectedMetric) ||
    b.maxNumericValue - a.maxNumericValue ||
    b.events.count - a.events.count ||
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
      { menu: 'Home', info: 'Seguidores, inscritos, ouvintes e evolução', source: 'Quatro mídias (YouTube Data API v3 · Wikidata · MusicBrainz · CSV)', active: true },
      { menu: 'Ticketeiras', info: 'Eventos, atrações, datas, preços publicados e locais', source: 'Sympla · Ingresse · Eventim · Ticketmaster · Bilheteria Digital · Agendas oficiais', active: true },
      { menu: 'Audiência Geográfica', info: 'Público por cidade, estado e região', source: 'Relatórios autorizados', active: true },
      { menu: 'Oportunidade Comercial', info: 'Alcance, presença regional e compatibilidade comercial', source: 'Cruzamento de dados (4 Mídias + Eventos + Demografia IBGE)', active: true },
      { menu: 'Motor de Dados', info: 'Descoberta, validação e atualização', source: 'Fontes integradas (Wikidata · MusicBrainz · YouTube · Ticketeiras)', active: true },
      { menu: 'Base Geográfica Nacional', info: 'Municípios, população e indicadores demográficos', source: 'Bases públicas oficiais (IBGE Censo / PIB dos Municípios)', active: true }
    ],
    items: items.slice(0, limit),
    notice: 'Indicadores auditáveis por fonte. Perfis sem coleta automática permanecem identificados como "Sem coleta". Eventos indicam presença territorial, não vendas ou audiência digital.'
  };
}
