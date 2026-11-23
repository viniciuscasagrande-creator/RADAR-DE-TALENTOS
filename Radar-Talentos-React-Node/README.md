# Radar de Talentos — Plataforma de Inteligência Artística, Geográfica e Comercial

Plataforma de inteligência de mercado para identificação, monitoramento de mídias (Instagram, Spotify, YouTube e TikTok), análise de audiência geográfica e viabilidade comercial de talentos no Brasil.

## Arquitetura Operacional (RADAR 2.0)

- **Visão Geral 2.0 & Painel de Inteligência (`/`)**: KPIs executivos, comparação de artistas, evolução verificada em 7, 30 e 90 dias e **Ficha 360° do Artista** integrada à API `/api/current-media` e `/api/radar/media-stats`.
- **Audiência Geográfica (`/audience.html`)**: Mapa nacional de concentração de audiência, estados, regiões e municípios com separação estrita entre a **Base Geográfica Nacional (5.571 municípios IBGE)** e **relatórios regionais verificados de audiência artística**.
- **Oportunidade Comercial (`/commercial.html`)**: Ranking inteligente com mini-sparklines inline, comparador direto de artistas e **Simulador de Compatibilidade Comercial (Artista × Cidade + Bacia Regional por raio em km)**, sem utilizar eventos de ticketeiras nos scores.
- **Motor de Dados (`/acquisition.html`)**: Fluxo visual de processamento em 5 etapas (`Descoberta → Identidade → Coleta Datada → Série Histórica → Publicação 360°`), monitoramento de conectores e contagens de integridade.
- **Prospecção e Aprovação (`/discovery.html`)**: Busca global gratuita (`Wikidata CC0`, `MusicBrainz`, `YouTube Data API v3` e `Brave Search`), validação cruzada de identidades, registro autorizado de métricas de Instagram/Spotify/TikTok (`social-statistics.mjs`) e importação CSV nacional/regional.
- **Consultas Opcionais — Eventos e Ticketeiras (`/events.html`)**: Catálogo opcional de eventos publicados (Sympla, Ticketmaster, Eventim, Ingresse, etc.), isolado dos cálculos de audiência e de pontuação comercial.

## Bancos de Dados Persistentes (`SQLite`)

1. **`data/radar.sqlite`**: Banco principal com os 100 talentos catalogados, 8 categorias, 9 modalidades, 70 submodalidades, 5.571 municípios brasileiros (IBGE), séries históricas homologadas e relatórios regionais autorizados.
2. **`data/discovery.sqlite`**: Banco independente do Motor de Prospecção para candidatos, vínculos de perfis, evidências auditadas e coletas atuais (`youtube-public-current` e `open-social-current`).

## Regras de Integridade de Dados

- **Zero dados fictícios**: Ausência de coleta é exibida explicitamente como `Sem coleta` ou `Aguardando dados verificados`.
- **População IBGE ≠ Audiência**: Dados demográficos do IBGE servem exclusivamente como contexto socioeconômico territorial e nunca ocupam gráficos ou mapas de audiência.
- **Séries históricas reais**: Variações de 7d e 30d só são calculadas quando existem pelo menos duas observações reais e datadas dentro da janela de tolerância.

## Executar Localmente (VS Code / Node.js 22+)

```sh
npm run db:init
npm test
npm run build
npm start
```

Acesse `http://127.0.0.1:3000`.

## Publicação e Deploy Automático (GitHub ↔ Google Cloud)

O ambiente de produção roda na VM `radar-producao` (`https://radar.34.70.140.94.sslip.io`) via Docker Compose (`radar` + `worker`) com volumes persistentes e backup automático pré-deploy (`scripts/deploy-gcloud.sh`).
