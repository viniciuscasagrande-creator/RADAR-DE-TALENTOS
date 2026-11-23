# Radar de Talentos — Plataforma de Inteligência Artística, Geográfica e Comercial

Plataforma de inteligência de mercado para identificação, monitoramento de mídias (Instagram, Spotify, YouTube e TikTok), análise de audiência geográfica e viabilidade comercial de talentos no Brasil.

## Arquitetura Operacional (RADAR 3.0)

- **Interface Web Ativa (`dashboard/`)**: painéis HTML/CSS/JS nativos servidos diretamente pelo servidor HTTP Node.js (`server/src/app.mjs`) e copiados para `dist/` via `npm run build` (`scripts/build-dashboard.mjs`).
  - *Nota sobre `src/` e `legado/`*: `src/domain/` contém módulos de domínio compartilhados com o backend; os componentes `.jsx` em `src/` e o diretório `legado/` são artefatos históricos de fases anteriores e não fazem parte do runtime em produção (`Dockerfile`).
- **Visão Geral & Painel de Inteligência (`/`)**: KPIs executivos, comparação de artistas, evolução verificada em 7, 30 e 90 dias e **Ficha 360° do Artista** integrada às rotas `/api/current-media`, `/api/radar/media-stats` e `/api/indicators/artist`.
- **Audiência Geográfica (`/audience.html`)**: Mapa nacional de concentração de audiência, estados, regiões e municípios com separação estrita entre a **Base Geográfica Nacional (5.571 municípios IBGE)** e **relatórios regionais verificados de audiência artística**.
- **Oportunidade Comercial (`/commercial.html`)**: Ranking inteligente com mini-sparklines inline, comparador direto de artistas e **Simulador de Compatibilidade Comercial (Artista × Cidade + Bacia Regional por raio em km)**, sem utilizar eventos de ticketeiras nos scores.
- **Motor de Dados (`/acquisition.html`)**: Diagnóstico de fontes conectadas, execuções reais do worker em 24h (`collection_logs` e `operation_runs`), canais confirmados individualmente e separação entre evidência HTTPS cadastrada e procedência auditada.
- **Prospecção e Aprovação (`/discovery.html`)**: Busca global gratuita (`Wikidata CC0`, `MusicBrainz`, `YouTube Data API v3` e `Brave Search`), funil de 4 etapas, confirmação individual de canais/perfis e quarentena auditável de métricas sem comprovação (`metric_review_quarantine`).
- **Novas Descobertas & Aceleração (`/rising.html`)**: Ranking de artistas em crescimento de 30 dias (`/api/discoveries/rising`) e aceleração entre janelas consecutivas por segmento (`/api/discoveries/acceleration`), com sino de notificações no topo.
- **Consultas Opcionais — Eventos e Ticketeiras (`/events.html`)**: Catálogo opcional de eventos publicados (Sympla, Ticketmaster, Eventim, Ingresse, etc.), isolado dos cálculos de audiência e de pontuação comercial.

## Bancos de Dados Persistentes (`SQLite`)

1. **`data/radar.sqlite`**: Banco principal com talentos catalogados, 8 categorias, 9 modalidades, 70 submodalidades, 5.571 municípios brasileiros (IBGE), séries históricas (`media_metric_series`), estado atual (`metric_current`), trilha de auditoria (`metric_review_quarantine`) e relatórios regionais autorizados.
2. **`data/discovery.sqlite`**: Banco independente do Motor de Prospecção para candidatos, vínculos de perfis, evidências auditadas e coletas atuais (`youtube-public-current` e `open-social-current`).

## Regras de Integridade e Segurança

- **Zero dados fictícios**: Ausência de coleta é exibida explicitamente como `Sem coleta` ou `Aguardando dados verificados`.
- **Validação de procedência na origem**: URLs de catálogos de identidade (`wikidata.org`, `musicbrainz.org`, `wikipedia.org`) comprovam identidade do artista, nunca métricas de seguidores/ouvintes.
- **População IBGE ≠ Audiência**: Dados demográficos do IBGE servem exclusivamente como contexto socioeconômico territorial e nunca ocupam gráficos ou mapas de audiência.
- **Container não-root e Proxy Reverso**: O `Dockerfile` executa como `USER node` e o limitador de taxa (`resolveClientIp`) respeita `X-Forwarded-For` / `X-Real-IP` quando originado de proxy reverso confiável (Caddy / Cloud Run).

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
