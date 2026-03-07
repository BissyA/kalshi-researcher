# Kalshi Mention Market Research Agent

AI-powered research tool for Kalshi "mention markets" — prediction contracts on whether specific words will be spoken during live political events (speeches, press conferences, rallies, etc.).

**GitHub**: [BissyA/kalshi-researcher](https://github.com/BissyA/kalshi-researcher)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Corpus System (Speaker → Series → Events)](#corpus-system-speaker--series--events)
- [Architecture Deep Dive](#architecture-deep-dive)
- [Research Agents](#research-agents)
- [Orchestrator Pipeline](#orchestrator-pipeline)
  - [Model Preset Routing](#model-preset-routing)
- [API Routes](#api-routes)
- [Frontend Pages](#frontend-pages)
- [Component Architecture](#component-architecture)
- [Sources System](#sources-system)
- [Live Prices (WebSocket)](#live-prices-websocket)
- [Trade Logging & Settlement](#trade-logging--settlement)
- [How to Run](#how-to-run)
- [Deployment (Fly.io)](#deployment-flyio)
- [Two-Layer Research Model](#two-layer-research-model)
- [Relationship to Speed Trader](#relationship-to-speed-trader)
- [Corpus Categories](#corpus-categories)
- [Current Status & Known Issues](#current-status--known-issues)
- [Debugging Notes](#debugging-notes)
- [Cost Estimates](#cost-estimates)
- [Changelog](#changelog)

---

## Overview

Kalshi offers "mention markets" where you bet on whether a speaker will say a specific word during an event. For example: "Will Trump say 'border' during his Address to Congress?" Each word has a YES/NO contract with live pricing.

This tool:

1. **Loads** a Kalshi mention market event by URL or ticker
2. **Runs 8 AI research agents** (powered by Claude, with configurable model presets: Opus, Hybrid, Sonnet, Haiku) to analyze historical patterns, current news, agenda items, market pricing, corpus settlement data (ground truth mention rates from Kalshi), and recent video recordings of similar events
3. **Produces per-word probability estimates** with reasoning
4. **Surfaces structured event context** — event format, duration, Q&A expectations, agenda analysis, exogenous events, likely topics, and recent speaker statements extracted from agent results
5. **Displays corpus-integrated word analysis** — live market prices cross-referenced against historical mention rates from Kalshi settled market data (ground truth), with manual speaker selection, expandable per-event detail, and edge detection
6. **Identifies mispriced contracts** where historical mention rate diverges from market price
7. **Streams live prices** via WebSocket from Kalshi
8. **Logs trades** with inline forms on the research dashboard
9. **Auto-settles trades** by polling Kalshi's market resolution API
10. **Tracks performance** on the analytics page with EV calculation and per-event trade breakdowns
11. **Tracks word mention rates** across all historical Kalshi events per speaker via the Corpus page
12. **Manages Kalshi market series** — search and add series from the Kalshi API, import historical settled events, refresh data per-series
13. **Quick Analysis** — paste a Kalshi mention market URL to instantly compare live market prices against historical mention rates, with WebSocket live price updates, saved search persistence, and edge detection
14. **Corpus categories** — organize events by type (Rally, Press Conference, Sports, etc.) to filter mention rates by event category. Categories are managed per-speaker with full CRUD. Research runs can be scoped to one or more categories so the synthesizer only sees relevant historical data. The home page has an explicit "All" checkbox (`__all__` sentinel) to control whether the full unfiltered corpus is passed to agents.
15. **Refresh Markets** — pull in newly added Kalshi strikes for an event without re-running research. Unscored words appear in the Word Analysis table with corpus data if available.
16. **Recent Recordings** — the research pipeline finds and displays the 3 most recent video recordings of similar events (e.g., last 3 press briefings for a press briefing event), with direct links to YouTube/C-SPAN/official sources for the trader to watch in preparation.

The research happens in two layers:
- **Baseline layer** (comprehensive): historical frequency, event format analysis, agenda research, news cycle analysis, market structure, recent recordings search, corpus settlement data (when speaker is selected)
- **Current layer** (refresh): re-runs all agents with latest data closer to the event. Reuses baseline results as context.

**Both layers run all 8 agents.** The only difference is that current layer loads existing baseline results as additional context via `existingResearch`.

### What has been tested end-to-end
- One successful "current" layer research run (Trump Corpus Christi speech, Feb 28 2026)
- Trade logging from the research dashboard
- Trade deletion from the LoggedTrades table (with confirmation dialog)
- Settlement checking via Kalshi API
- Analytics page rendering with Recharts charts
- Live WebSocket price streaming
- Dashboard redesign with tabbed layout (Research | Sources | Trade Log)
- EventContext component: structured event format, agenda, news cycle, and likely topics from agent results
- WordTable component: corpus-integrated word analysis with manual speaker selection, historical rates from settled Kalshi markets, expandable per-event detail
- Corpus page: speaker management, series import (KXTRUMPMENTION — 114 events, KXTRUMPMENTIONB — 57 events, KXBUSINESSROUNDTABLE — 1 event), mention history with expandable per-event detail
- Historical data import from Kalshi API with pagination (handles 100+ events)
- Speaker persistence: select speaker in research page WordTable → saves to event record → analytics pulls corpus historical rates for that speaker
- Analytics expandable trade detail with corpus-based mention rates (with sample counts), edge calculations, and EV card
- Quick Analysis tab: paste URL → live price vs historical rate comparison with WebSocket updates and saved searches
- News Cycle agent runs on both baseline and current layers
- Corpus data injection: selected speaker's settled Kalshi mention rates fed into synthesizer as empirical base rates
- Home page speaker selection flows through to research pipeline and analytics
- Home page multi-select category dropdown with checkbox pattern (Phase 17)
- Home page category API normalization fix (Phase 17 — API returns `{name, count}` objects, not strings)
- Model preset selection from home page → research page → trigger API → orchestrator → agents
- Model preset tag display on completed research runs in RunHistory
- Retry logic on overloaded API errors (Haiku preset triggered 529 errors — retry helped but Haiku + web search remains unstable)
- Haiku (All) baseline research run completed end-to-end (Trump College Sports Roundtable, Mar 6 2026) — all 8 agents, synthesis, word scores saved
- Citation tag stripping verified — web search `<cite>` tags no longer appear in agent outputs

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript (strict mode) | 5.x |
| AI/LLM | Claude (Opus 4.6 / Sonnet 4.5 / Haiku 4.5) via `@anthropic-ai/sdk` | ^0.78.0 |
| Database | Supabase (PostgreSQL) via `@supabase/supabase-js` | ^2.98.0 |
| Styling | Tailwind CSS v4 | 4.x |
| Charts | Recharts | ^3.7.0 |
| Markdown | react-markdown + remark-gfm | ^10.1.0 / ^4.0.1 |
| WebSocket | `ws` (server-side Kalshi WS client) | ^8.19.0 |
| Fonts | Geist Sans + Geist Mono | via `next/font` |
| API Client | Kalshi REST API v2 + WebSocket v2 | RSA-PSS auth |
| Deployment | Fly.io (Docker, Singapore region) | shared-cpu-1x, 512MB |

---

## Project Structure

```
kalshi-research/
├── kalshi-key.pem                # RSA private key for Kalshi API auth (local dev only)
├── .env.local                    # All API keys (not committed)
├── CLAUDE.md                     # AI builder instructions (references OpenAPI spec)
├── package.json
├── tsconfig.json                 # strict mode, @/* → ./src/*
├── next.config.ts                # output: "standalone" for Docker deployment
├── Dockerfile                    # Multi-stage Node 22 Alpine build for Fly.io
├── .dockerignore                 # Excludes node_modules, .next, .git, .env*, *.pem
├── fly.toml                      # Fly.io config: sin region, 512MB, auto-stop/start
│
├── docs/
│   └── kalshi-openapi.yaml       # Full Kalshi OpenAPI spec (6923 lines)
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql    # 8 tables, 2 views, 7 indexes
│       ├── 002_rls_policies.sql      # RLS + anon read policies
│       ├── 003_dashboard_redesign.sql # briefing column, word_frequencies, cancelled status
│       ├── 004_speakers_and_series.sql # speakers + series tables, events.series_id FK
│       ├── 005_event_speaker_id.sql   # events.speaker_id FK to speakers table
│       ├── 006_excluded_tickers.sql   # excluded_tickers TEXT[] on series table
│       ├── 007_corpus_categories.sql  # events.category TEXT, research_runs.corpus_category TEXT
│       └── 008_recent_recordings.sql # research_runs.recent_recordings_result JSONB
│
└── src/
    ├── types/
    │   ├── kalshi.ts             # KalshiEvent (with sub_title, strike_date), KalshiMarket, WordContract
    │   ├── research.ts           # All agent I/O types, OrchestratorInput/Output, CorpusMentionRate
    │   ├── database.ts           # TypeScript interfaces for all DB table rows (including DbSpeaker, DbSeries)
    │   ├── components.ts         # Shared component-level types (Event, WordScore, Cluster, Trade, etc.)
    │   └── corpus.ts             # MentionHistoryRow, MentionEventDetail, SeriesWithStats, SpeakerWithSeries
    │
    ├── lib/
    │   ├── claude-client.ts      # Claude API wrapper with per-model pricing, retry logic, web search + pause_turn + streaming
    │   ├── kalshi-client.ts      # Kalshi REST + WebSocket auth (RSA-PSS signing)
    │   ├── supabase.ts           # Client-side + server-side Supabase clients
    │   ├── url-parser.ts         # URL/ticker parsing, inferEventType(), extractWord()
    │   ├── settlement.ts         # Shared P&L calculation + event resolution logic
    │   └── ui-utils.ts           # Styling helpers: edgeColor(), confBadge(), correlationBadge()
    │
    ├── hooks/
    │   └── useLivePrices.ts      # Client-side EventSource hook for live Kalshi prices
    │
    ├── agents/
    │   ├── orchestrator.ts       # 3-phase pipeline with model preset routing, cancellation, transcript caching, dual corpus pass-through (filtered + full)
    │   ├── historical.ts         # Past speech transcript analysis
    │   ├── agenda.ts             # Advance info + agenda research (speaker-agnostic platform references)
    │   ├── news-cycle.ts         # Contextual news analysis (24-72h window scaled by event proximity)
    │   ├── event-format.ts       # Event structure analysis
    │   ├── market-analysis.ts    # Pure price/volume analysis
    │   ├── recent-recordings.ts  # Web search for recent video recordings of similar events
    │   ├── clustering.ts         # Thematic word grouping
    │   └── synthesizer.ts        # Final probability synthesis + markdown briefing + corpus-category-aware weighting with per-event detail
    │
    ├── components/
    │   ├── corpus/               # 8 components for the /corpus page
    │   │   ├── SpeakerSelector.tsx       # Speaker dropdown with inline "Add New Speaker"
    │   │   ├── CorpusTabNav.tsx          # 3-tab switcher: Mention History | Kalshi Markets | Quick Analysis
    │   │   ├── MentionSummaryStats.tsx   # Stat cards: words tracked, settled events, avg rate, top word
    │   │   ├── MentionHistoryTable.tsx   # Sortable, searchable table with expandable per-event detail rows + reset sort
    │   │   ├── TranscriptSearchBar.tsx   # Debounced text search input (used by Quick Analysis)
    │   │   ├── KalshiMarketsTab.tsx      # Series management + category management panel + expandable events with category dropdowns
    │   │   ├── KalshiSeriesSearch.tsx    # Searchable dropdown querying Kalshi API for available series
    │   │   └── QuickAnalysisTab.tsx      # Paste URL → live price vs historical rate comparison with saved searches
    │   │
    │   └── research/             # Research dashboard components
    │       ├── EventHeader.tsx
    │       ├── ProgressMessages.tsx
    │       ├── TabNavigation.tsx         # 3 tabs: Research | Sources | Trade Log
    │       ├── EventContext.tsx          # Event structure + analysis from agent results
    │       ├── WordTable.tsx             # Corpus-integrated word analysis with speaker selector
    │       ├── RecentRecordings.tsx      # Clickable video cards for recent similar event recordings
    │       ├── AgentOutputAccordion.tsx  # 8 agent panels including Recent Recordings Agent
    │       ├── WordScoresTable.tsx       # Used on Trade Log tab (not Research tab)
    │       ├── LoggedTrades.tsx
    │       ├── ResolveEvent.tsx
    │       ├── RunHistory.tsx
    │       ├── SourcesTab.tsx            # Aggregated sources from all agents with type tags
    │       ├── ResearchBriefing.tsx      # (kept but NOT rendered — may repurpose later)
    │       ├── ClusterView.tsx           # (kept but NOT rendered — will return in future iteration)
    │       ├── WordAnalysisTable.tsx     # (kept but NOT rendered on Research tab — superseded by WordTable)
    │       ├── CorpusStats.tsx
    │       ├── FrequencyTable.tsx
    │       ├── TranscriptList.tsx        # Includes optional download button (showDownload prop)
    │       ├── TranscriptViewer.tsx
    │       └── TranscriptUpload.tsx
    │
    └── app/
        ├── layout.tsx            # Root layout: dark theme, nav bar (Home | Corpus | Analytics)
        ├── globals.css           # Tailwind v4, dark-only theme
        ├── page.tsx              # Home: URL input, corpus speaker selection, event loading
        │
        ├── research/
        │   └── [eventId]/
        │       └── page.tsx      # Research dashboard (thin shell with tabs, corpus speaker integration)
        │
        ├── corpus/
        │   └── page.tsx          # Corpus: speaker management, mention history, Kalshi markets, quick analysis
        │
        ├── analytics/
        │   └── page.tsx          # Performance analytics with Recharts charts
        │
        └── api/
            ├── events/
            │   ├── load/route.ts         # POST: load event from Kalshi
            │   ├── list/route.ts         # GET: list all events
            │   ├── speaker/route.ts      # PATCH: persist speaker selection on an event
            │   └── refresh-markets/route.ts # POST: re-fetch markets from Kalshi, upsert new words
            │
            ├── research/
            │   ├── trigger/route.ts      # POST: start research (SSE stream, accepts speakerId, fetches corpus data)
            │   ├── stop/route.ts         # POST: cancel a running run
            │   ├── [eventId]/route.ts    # GET: full research data
            │   └── status/[runId]/route.ts # GET: run status
            │
            ├── trades/
            │   ├── log/route.ts          # POST: log a trade
            │   ├── [tradeId]/route.ts    # DELETE: delete a trade. PATCH: edit a trade (entry price, contracts) with P&L recalc
            │   └── results/route.ts      # POST: manual resolution
            │
            ├── settlement/
            │   └── check/route.ts        # POST: auto-settle via Kalshi API polling
            │
            ├── ws/
            │   └── prices/route.ts       # GET: WebSocket-to-SSE proxy for live prices
            │
            ├── transcripts/
            │   ├── route.ts              # GET: list/filter transcripts (supports ?q= text search)
            │   ├── upload/route.ts       # POST: upload new transcript
            │   ├── frequencies/route.ts  # GET: word frequencies across corpus
            │   └── [id]/
            │       ├── route.ts          # GET/DELETE: single transcript
            │       └── download/route.ts # GET: download transcript as .txt file
            │
            ├── corpus/
            │   ├── speakers/route.ts         # GET/POST/DELETE: manage speakers table
            │   ├── series/
            │   │   ├── route.ts              # GET/POST/DELETE: manage series for a speaker
            │   │   └── events/route.ts       # GET: list events + word results for a series. DELETE: remove single event + track in excluded_tickers
            │   ├── categories/route.ts          # GET/PATCH/PUT/DELETE: category CRUD (list, assign, rename globally, delete globally)
            │   ├── mention-history/route.ts  # GET: aggregated word mention rates across events (supports ?category= filter)
            │   ├── import-historical/route.ts # POST: import settled events from Kalshi API
            │   ├── kalshi-series/route.ts    # GET: search Kalshi API for available series (cached)
            │   └── quick-prices/route.ts     # GET: fetch live market prices for an event (read-only, no DB writes)
            │
            └── analytics/
                └── performance/route.ts  # GET: aggregate analytics
```

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Kalshi API
KALSHI_API_KEY=<your-kalshi-api-key>
KALSHI_PRIVATE_KEY_PATH=./kalshi-key.pem
KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n<raw key content for cloud deploy>\n-----END RSA PRIVATE KEY-----"

# Anthropic Claude
ANTHROPIC_API_KEY=<your-anthropic-api-key>

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
```

**Supabase Management** (for running migrations via REST, not needed at runtime):
- Project ref: `hczppfsuqtpccxvmyaue`
- Management API endpoint: `POST https://api.supabase.com/v1/projects/{ref}/database/query`
- Requires `Authorization: Bearer <supabase-access-token>` header

The `KALSHI_PRIVATE_KEY` env var takes precedence over `KALSHI_PRIVATE_KEY_PATH`. The file path is used for local development; the raw key string is for cloud deployment.

---

## Database Schema

**Supabase project**: `hczppfsuqtpccxvmyaue`

All 8 migrations (001-008) have been applied to the live Supabase database.

10 tables + 2 views:

### `speakers` (Migration 004)
Explicitly created speaker records. Speakers are NEVER inferred — the user creates them manually.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto-generated |
| name | text UNIQUE | e.g. "Donald Trump" |
| created_at | timestamptz | |

### `series` (Migration 004)
Links a Kalshi series ticker to a speaker. Each series contains multiple events.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto-generated |
| speaker_id | uuid (FK → speakers) | ON DELETE CASCADE |
| series_ticker | text UNIQUE | e.g. "KXTRUMPMENTION" |
| display_name | text | Nullable. e.g. "Trump Mention Markets" |
| events_count | integer | Updated after import. Default: 0 |
| words_count | integer | Updated after import. Default: 0 |
| excluded_tickers | text[] | **Migration 006**. Default `'{}'`. Tracks event tickers the user has removed from this series so they won't be re-imported on refresh |
| last_imported_at | timestamptz | Nullable. Set after each import |
| created_at | timestamptz | |

### `events`
Primary table for mention market events.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto-generated |
| kalshi_event_ticker | text UNIQUE | e.g. `KXTRUMPMENTION-27FEB26` |
| title | text | |
| speaker | text | Denormalized from speakers table. Set during import |
| event_type | text | address_to_congress, press_conference, etc. |
| event_date | timestamptz | Actual event date. Parsed from Kalshi event `sub_title` (e.g. "Mar 3, 2026"), falling back to `strike_date` then market `close_time`. See "Event Date Resolution" below. |
| venue | text | Nullable |
| estimated_duration_minutes | integer | Set after event_format agent runs |
| series_id | uuid (FK → series) | **Migration 004**. ON DELETE SET NULL |
| speaker_id | uuid (FK → speakers) | **Migration 005**. ON DELETE SET NULL. Explicit speaker linkage for analytics — set from research page speaker dropdown. Used by analytics API to pull corpus historical mention rates. |
| category | text | **Migration 007**. Nullable. Topical category for corpus filtering (e.g. "Rally", "Press Conference", "Sports"). Managed via `/api/corpus/categories`. Indexed. |
| status | text | `pending` → `researched` → `live` → `completed` |
| created_at, updated_at | timestamptz | |

### `words`
Individual word contracts within an event.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| event_id | uuid (FK → events) | ON DELETE CASCADE |
| word | text | The display word (e.g., "Deport / Deportation") |
| kalshi_market_ticker | text UNIQUE | Kalshi market ticker |
| cluster_id | uuid (FK → word_clusters) | Nullable. Set by clustering agent |
| UNIQUE(event_id, word) | | Prevents duplicate words per event |

### `research_runs`
Each research execution against an event.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| event_id | uuid (FK → events) | ON DELETE CASCADE |
| layer | text | 'baseline' or 'current' |
| status | text | 'running', 'completed', 'failed', or 'cancelled' |
| error_message | text | Set when status is 'failed' |
| model_used | text | Model preset used for this run: `'opus'`, `'hybrid'`, `'sonnet'`, or `'haiku'`. Set on insert by the trigger API. Displayed as a purple badge in RunHistory. |
| corpus_category | text | **Migration 007**. Nullable. Which corpus category was used to filter mention rates for this research run. `null` means all categories were included. |
| briefing | text | **Migration 003** — Markdown research briefing from synthesizer |
| historical_result | jsonb | Phase 1 agent output |
| agenda_result | jsonb | Phase 1 agent output |
| news_cycle_result | jsonb | Phase 1 agent output (runs on both layers) |
| event_format_result | jsonb | Phase 1 agent output |
| market_analysis_result | jsonb | Phase 1 agent output |
| recent_recordings_result | jsonb | **Migration 008**. Phase 1 agent output — recent video recordings of similar events |
| cluster_result | jsonb | Phase 2 agent output |
| synthesis_result | jsonb | Phase 3 agent output |
| total_input_tokens | integer | Accumulated across all agents |
| total_output_tokens | integer | |
| total_cost_cents | numeric | Estimated from token counts |
| triggered_at | timestamptz | Default: now() |
| completed_at | timestamptz | Set on completion, failure, or cancellation |

### `word_scores`
Per-word probability estimates from research.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| word_id | uuid (FK → words) | |
| event_id | uuid (FK → events) | |
| research_run_id | uuid (FK → research_runs) | |
| historical_probability | numeric | 0-1 |
| agenda_probability | numeric | 0-1 |
| news_cycle_probability | numeric | 0-1 (defaults to 0.5 for baseline) |
| base_rate_probability | numeric | 0-1 |
| combined_probability | numeric | Weighted final estimate |
| market_yes_price | numeric | Kalshi price at research time |
| edge | numeric | combined - market. Can be negative |
| confidence | text | 'low', 'medium', or 'high' |
| reasoning | text | |
| key_evidence | text[] | Array of supporting evidence strings |
| UNIQUE(word_id, research_run_id) | | |

### `word_clusters`
Thematic groupings of words.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| event_id | uuid (FK → events) | ON DELETE CASCADE |
| cluster_name | text | |
| theme | text | |
| correlation_note | text | |

**Note**: Rich cluster data (tradingImplication, intraCorrelation, narrative) lives in the `research_runs.cluster_result` JSONB column. The `ClusterView` component (currently not rendered on the Research tab, kept for future use) merges both sources by matching on cluster name.

### `transcripts`
Cached speech transcript metadata (populated by orchestrator after runs, or manually uploaded).
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| speaker | text | |
| event_type | text | |
| event_date | text | |
| title | text | |
| source_url | text | |
| full_text | text NOT NULL | Stores full text, summary, or `"(metadata only)"` as fallback |
| word_count | integer | |
| word_frequencies | jsonb | **Migration 003** — Cached `{ "word": count }` |
| UNIQUE(speaker, title, event_date) | | For upsert conflict resolution |

### `trades`
Logged trades for performance tracking.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| event_id | uuid (FK → events) | |
| word_id | uuid (FK → words) | |
| side | text | 'yes' or 'no' |
| entry_price | real | 0.00-1.00 scale. Editable after logging via `PATCH /api/trades/[tradeId]` |
| contracts | integer | Default: 1. Editable after logging via `PATCH /api/trades/[tradeId]` |
| total_cost_cents | integer | entry_price * contracts * 100. Auto-recalculated on edit |
| agent_estimated_probability | real | Model's estimate at trade time |
| agent_edge | real | Estimated edge at trade time |
| result | text | NULL until resolved, then 'win' or 'loss' |
| pnl_cents | integer | NULL until resolved |

### `event_results`
Ground truth outcomes after events conclude.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| event_id | uuid (FK → events) | ON DELETE CASCADE |
| word_id | uuid (FK → words) | ON DELETE CASCADE |
| was_mentioned | boolean | Did the word appear in the event |
| settled_at | timestamptz | When this result was recorded |
| UNIQUE(event_id, word_id) | | For upsert conflict resolution |

### Views
- **`event_performance`**: Joins trades with events for per-event P&L
- **`calibration_data`**: Joins word_scores with event_results for calibration analysis

### Row Level Security
- RLS enabled on all 10 tables
- Anon read-only policies on: `events`, `words`, `word_clusters`, `research_runs`, `word_scores`, `speakers`, `series`
- No anon read on `trades`, `event_results`, `transcripts` (sensitive data)
- No anon write policies on any table (all writes via service role key which bypasses RLS)

### Migrations Applied
| Migration | Status | Description |
|-----------|--------|-------------|
| 001_initial_schema.sql | Applied | 8 tables, 2 views, 7 indexes |
| 002_rls_policies.sql | Applied | RLS + anon read policies |
| 003_dashboard_redesign.sql | Applied | briefing column, word_frequencies, cancelled status |
| 004_speakers_and_series.sql | Applied | speakers + series tables, events.series_id FK, indexes |
| 005_event_speaker_id.sql | Applied | events.speaker_id FK to speakers, index |
| 006_excluded_tickers.sql | Applied | excluded_tickers TEXT[] on series table |
| 007_corpus_categories.sql | Applied | events.category TEXT + index, research_runs.corpus_category TEXT |
| 008_recent_recordings.sql | Applied | research_runs.recent_recordings_result JSONB |

---

## Corpus System (Speaker → Series → Events)

The Corpus page (`/corpus`) provides cross-event analytics and historical data management, entirely separate from individual research runs.

### Data Model

```
speakers (manually created)
  ├── series (Kalshi series tickers, linked to speaker via series.speaker_id)
  │    └── events (individual Kalshi events, linked to series via events.series_id)
  │         ├── category (optional topical tag: "Rally", "Press Conference", etc.)
  │         └── words (word contracts per event)
  │              └── event_results (was_mentioned: yes/no per word per event)
  │
  └── events (direct speaker link via events.speaker_id — set from research page)
       └── Used by analytics to pull corpus historical mention rates
```

**Two speaker linkage paths**:
1. **Corpus path** (indirect): `speakers` → `series` → `events` (via `events.series_id`). This links corpus-imported events to speakers through their Kalshi series.
2. **Direct path**: `speakers` → `events` (via `events.speaker_id`). Set from the home page speaker dropdown (before research) or the research page EventHeader/WordTable dropdown. Persisted via `PATCH /api/events/speaker`. Used by: (a) the research trigger API to fetch corpus mention rates for the synthesizer, (b) the analytics API to pull corpus historical mention rates for trade evaluation.

**Critical design decision**: Speakers are NEVER inferred from event titles. The user explicitly creates a speaker, then adds Kalshi series to that speaker. For analytics, the user explicitly links each event to a speaker via the research page. This was a deliberate choice — inferring speakers from titles like "Trump Address to Congress" is too fragile for serious trading decisions.

### User Flow

1. **Create a speaker** — via the dropdown at the top of `/corpus` ("+ Add New Speaker")
2. **Add Kalshi series** — in the Kalshi Markets tab, search the Kalshi API for series and click to add
3. **Import historical data** — click "Refresh" on a series to pull all settled events from Kalshi
4. **Create categories** — in the Kalshi Markets tab, use the "Corpus Categories" panel to create topical categories (e.g. "Rally", "Press Conference", "Sports")
5. **Assign events to categories** — expand a series, use the dropdown on each event row to assign it to a category
6. **View mention rates** — switch to Mention History tab to see cross-event word frequencies. Use the category filter to see rates for specific event types only.
7. **Browse events** — expand a series to see every individual event, expand an event to see word results (green Y / red N)

### Import Flow (POST /api/corpus/import-historical)

1. Accepts `{ seriesId }` (NOT a ticker — the series record must exist first)
2. Looks up the series record to get `series_ticker` and speaker name (via series → speakers join)
3. Fetches `GET /events?series_ticker=...&status=settled&with_nested_markets=true` from Kalshi (paginated, 200 per page)
4. For events where nested markets are empty (past Kalshi's historical cutoff), falls back to `GET /historical/markets?event_ticker=...`
5. For each event: upserts into `events` (with `series_id` and `speaker` from the series record), `words`, and `event_results`
6. Deduplicates words within the same event (handles `UNIQUE(event_id, word)` constraint — some Kalshi events have multiple market tickers resolving to the same display word)
7. Updates `series.events_count`, `series.words_count`, and `series.last_imported_at`
8. Uses `inferEventType()` from url-parser.ts for event type, but NOT `inferSpeaker()` — speaker always comes from the series record
9. **Event date resolution**: Parses the actual event date from the Kalshi event's `sub_title` field (e.g. "Mar 3, 2026" or "On Feb 27, 2026"), stripping any leading "On " prefix. Falls back to `strike_date` (nullable, only set for date-strike events), then to the first market's `close_time`. This was fixed because `close_time` represents when trading closes (often in the future when loaded pre-event), not when the event actually occurs.

### Mention History Aggregation (GET /api/corpus/mention-history)

- Fetches all `event_results` joined with `words` and `events`
- **Paginates** to avoid Supabase's default 1000-row limit (fetches in 1000-row pages)
- Filters by `speakerId` through the series linkage: looks up which series belong to the speaker, then filters events by `series_id`
- **Optional `?category=` filter**: Supports comma-separated multiple categories (e.g. `?category=Sports,Rally`). When provided, only includes events where `events.category` matches any of the specified categories. Events with `category = null` or a non-matching category are excluded from the aggregation. This allows scoping mention rates to specific event types.
- Groups results by normalized word (case-insensitive)
- Returns: `{ rows: MentionHistoryRow[], totalSettledEvents: number }`
- Each row has: `word`, `yesCount`, `noCount`, `totalEvents`, `mentionRate`, and expandable `events[]` with per-event detail

### Series Events API (GET /api/corpus/series/events)

- Fetches all events for a series ordered by most recent first
- Joins `event_results` with `words` to nest word results per event
- Paginates to handle large result sets (same 1000-row Supabase limit)
- Returns: `{ events: [{ id, title, eventDate, status, category, words: [{ word, wasMentioned }] }] }`

### Kalshi Series Search (GET /api/corpus/kalshi-series)

- Fetches all series from `GET /series` on the Kalshi API
- Caches in memory for 10 minutes (avoids repeated API calls)
- Filters client-side by `?q=` query param, matching against `ticker`, `title`, and `tags`
- Returns top 50 results: `{ series: [{ ticker, title, category, frequency, tags }], total }`

### Quick Prices API (GET /api/corpus/quick-prices)

Lightweight read-only endpoint for the Quick Analysis tab. Does NOT write to the database.

- Accepts `?url=` parameter (Kalshi URL or raw event ticker)
- Uses `extractEventTicker()` to parse the URL, then `GET /events/{ticker}` from Kalshi
- Falls back to market-level ticker lookup if event 404s (same pattern as `/api/events/load`)
- Filters markets to `active` or `open` status only
- Returns: `{ eventTicker, eventTitle, words: [{ marketTicker, word, yesBid, yesAsk, lastPrice, volume }] }`
- The client uses `marketTicker` values to subscribe to the WebSocket for live price updates

### Current Data

As of the last import:
- **2 speakers**: Donald Trump, Karoline Leavitt
- **3 series**: KXTRUMPMENTION (114 events), KXTRUMPMENTIONB (57 events), KXBUSINESSROUNDTABLE (1 event)
- **172 events with word results** (across all series — some events share titles but are different real-world events on different dates)
- **No true duplicate events** — each event has a unique `kalshi_event_ticker`. Events with identical titles (e.g., "What will Trump say during his announcement?" appearing multiple times) are different events on different dates.
- **Cross-series events on the same day** are different appearances (e.g., a rally in one series, a dinner in another). Kalshi uses the "B" series to handle overflow/volume.

**Known data issue**: `KXTRUMPMENTIONB-25DEC03` has 20 words but 0 event_results — the result upsert failed during import (likely transient DB error). Fix: click "Refresh" on the KXTRUMPMENTIONB series to re-import, which will idempotently fill in the missing results.

---

## Architecture Deep Dive

### Claude Client (`src/lib/claude-client.ts`)

The Claude client wraps the Anthropic SDK for two use cases:

1. **`callAgent()`** — Makes a Claude API call, optionally with web search. Returns `{ content, inputTokens, outputTokens, estimatedCostCents }`.
2. **`callAgentForJson<T>()`** — Wraps `callAgent()` with JSON extraction and retry logic.

**Key design decisions:**

- **Model selection**: Configurable per-call via the `model` option on `AgentCallOptions`. Default: `claude-sonnet-4-5-20250929` (Sonnet 4.5). Available models: `claude-opus-4-6` (Opus 4.6), `claude-sonnet-4-5-20250929` (Sonnet 4.5), `claude-haiku-4-5-20251001` (Haiku 4.5). Each agent in the pipeline receives its model from the orchestrator's `getAgentModels()` function based on the user's selected preset.
- **Per-model pricing**: `MODEL_PRICING` lookup table maps model IDs to cost-per-million-tokens:
  - Opus 4.6: $5.00 input / $25.00 output
  - Sonnet 4.5: $3.00 input / $15.00 output
  - Haiku 4.5: $1.00 input / $5.00 output
- **Retry with exponential backoff**: Wraps the `.stream().finalMessage()` call in a retry loop. `MAX_RETRIES = 4`, `BASE_DELAY_MS = 3000` (delays: 3s, 6s, 12s, 24s). `isRetryableError()` catches:
  - `Anthropic.APIError` with status 429 (rate limited), 500, 502, 503, 529 (overloaded)
  - `APIConnectionError` (status === undefined)
  - Any error whose message string contains "overloaded", "rate_limit", "529", or "connection"
  - Detailed logging: `[claude-client] API call failed (model=..., attempt X/Y, retryable=...): ...`
- **Streaming**: Uses `anthropic.messages.stream().finalMessage()` instead of `anthropic.messages.create()`. This is **required** because web search operations can take longer than 10 minutes, and the Anthropic SDK mandates streaming for long-running operations.
- **Web search**: Uses `web_search_20250305` server-side tool. This is NOT a client-side tool — Anthropic's servers execute the search. The client only needs to handle `pause_turn` stop reasons.
- **`pause_turn` handling**: When `stop_reason === "pause_turn"`, the client appends the response content as an assistant message and sends another request. This loops up to 5 times (`MAX_CONTINUATIONS`).
- **Tools typed as `any[]`**: The SDK's TypeScript types don't cleanly handle server-side tool definitions like `{ type: "web_search_20250305", name: "web_search" }`. Using `any[]` avoids type errors.
- **JSON parsing**: `parseJsonResponse<T>()` uses a three-tier approach:
  1. Extract from markdown code fences (```json ... ```)
  2. Parse the entire text as raw JSON
  3. **Balanced-brace parser**: Finds the first `{` and walks character-by-character tracking depth, string boundaries, and escape characters to find the matching `}`. This is more robust than regex for responses where Claude wraps JSON in explanatory text.
- **Citation tag stripping**: After extracting text content, `callAgent()` strips all web search citation tags (`<cite index="...">...</cite>` and `</cite>`) via regex: `finalTextContent.replace(/<\/?cite[^>]*>/g, "")`. Without this, Claude's web search tool embeds raw `<cite index="1-2,3-4">` markup in its responses, which pollutes agent JSON outputs and renders as visible HTML in the UI. Applied globally so all 5 web-search-enabled agents (historical, agenda, news-cycle, event-format, recent-recordings) benefit automatically.
- **JSON retry**: If parsing fails, `callAgentForJson` makes a second Claude call asking it to fix the malformed JSON. This adds to token usage but prevents pipeline crashes.

**Cost tracking**: Every call returns token counts with per-model cost estimation. The orchestrator accumulates these across all agents and stores them on the research run.

### Kalshi Client (`src/lib/kalshi-client.ts`)

Ported directly from the Speed Trader project (`~/kalshi-trade/src/lib/kalshi-client.ts`).

- **Base URL**: `https://api.elections.kalshi.com/trade-api/v2`
- **WebSocket URL**: `wss://api.elections.kalshi.com/trade-api/ws/v2`
- **Auth**: RSA-PSS signature. Signs `timestamp + method + path` with SHA-256.
- **Key loading**: Reads `KALSHI_PRIVATE_KEY` env var first (raw PEM string), falls back to reading file at `KALSHI_PRIVATE_KEY_PATH`.
- **`kalshiFetch(method, apiPath, body?): Promise<Response>`** — Generic authenticated REST caller. Returns raw `Response` (call `.ok` and `.json()` on it).
- **`getKalshiWsHeaders(): Record<string, string>`** — Generates signed auth headers for WebSocket connections.

### Settlement Logic (`src/lib/settlement.ts`)

Shared function used by both manual resolution (`/api/trades/results`) and automatic settlement (`/api/settlement/check`):

```typescript
settleEvent(eventId: string, results: WordResult[]): Promise<SettlementSummary>
```

**P&L calculation:**
- YES side: win if `was_mentioned = true`, loss if `false`
- NO side: win if `was_mentioned = false`, loss if `true`
- Win P&L: `(1.00 - entry_price) * contracts * 100` cents
- Loss P&L: `-entry_price * contracts * 100` cents

### URL Parser (`src/lib/url-parser.ts`)

- **`extractEventTicker(input)`**: Handles multiple URL formats (website `/markets/`, API `/events/`, raw tickers)
- **`inferSpeaker(eventTitle)`**: Maps event title keywords to speaker names. **NOT used in import-historical** — speaker comes from the series record instead. Only used for loading individual events on the home page.
- **`inferEventType(eventTitle)`**: Maps to event categories (address_to_congress, press_conference, rally, etc.)
- **`extractWord(marketTicker, eventTicker, yesSubTitle)`**: Extracts the display word from market data. Uses `yesSubTitle` first, falls back to parsing the ticker.

### Supabase Client (`src/lib/supabase.ts`)

Two clients:
- **`supabase`** (client-side): Uses anon key, respects Row Level Security
- **`getServerSupabase()`** (server-side): Uses service role key, bypasses RLS

**Important**: Supabase's PostgREST has a default 1000-row limit. Any query that may return more than 1000 rows must paginate using `.range(offset, offset + PAGE_SIZE - 1)`. This affects the `mention-history` and `series/events` APIs (both paginate in 1000-row chunks).

---

## Research Agents

All agents live in `src/agents/`. Each exports a single `run*Agent(input)` function that returns a typed result plus token usage. Every agent accepts an optional `model?: string` parameter in its input interface, which is passed through to `callAgentForJson()`. The orchestrator assigns models based on the user's selected preset (see [Model Preset Routing](#model-preset-routing)).

### Phase 1 Agents (run in parallel)

| Agent | File | Web Search | Max Tokens | Purpose |
|-------|------|-----------|------------|---------|
| Historical | `historical.ts` | Yes | 16,384 | Searches past speech transcripts, counts word frequencies. Accepts optional `cachedTranscripts` to skip redundant web searches. Returns per-transcript `wordMentions` map. |
| Agenda | `agenda.ts` | Yes | 16,384 | Finds advance info, press releases, speaker's recent public statements about topics. Speaker-agnostic (no hardcoded platform references). |
| News Cycle | `news-cycle.ts` | Yes | 16,384 | Analyzes recent news with contextual lookback (24h for imminent events, 72h+ for further out). Speaker-agnostic platform references. **Runs on both baseline and current layers** |
| Event Format | `event-format.ts` | Yes | 8,192 | Determines duration, scripted vs unscripted ratio, outputs weighting factors |
| Market Analysis | `market-analysis.ts` | No | 12,288 | Pure price/volume analysis, identifies mispricings, correlations |
| Recent Recordings | `recent-recordings.ts` | Yes | 4,000 | Searches for the 3 most recent video recordings of similar events by the same speaker. Prioritizes YouTube/C-SPAN. Explicit deduplication instructions prevent returning the same event twice with different titles. Returns URLs, titles, dates, platform, duration, description, selection rationale, and search queries used. |

### Phase 2 Agent

| Agent | File | Web Search | Max Tokens | Purpose |
|-------|------|-----------|------------|---------|
| Clustering | `clustering.ts` | No | 12,288 | Groups words thematically. Returns `narrative` per cluster. |

### Phase 3 Agent

| Agent | File | Web Search | Max Tokens | Purpose |
|-------|------|-----------|------------|---------|
| Synthesizer | `synthesizer.ts` | No | **32,000** | Final per-word probabilities with reasoning. **Generates markdown briefing** (800-1500 words). Corpus-category-aware: receives both filtered and full corpus datasets with per-event detail. |

**Synthesizer weighting formula:**
```
Without corpus data:
  probability = historical (scriptedWeight * 40%) + agenda (25%) + news (currentContextWeight * 25%) + base_rate (remainder)

With corpus data (speaker selected):
  remainder = 100% - historical - agenda - news
  base_rate = remainder * 30%
  corpus = remainder * 70%
  probability = historical + agenda + news + base_rate + corpus
```

**Corpus-category-aware synthesis (Phase 17):**

When corpus data is available, the synthesizer receives corpus data as research sections with **full per-event detail** (event title, date, ticker, category, was_mentioned). The format depends on whether categories are selected:

- **With categories selected** (e.g., "Sports"): Two corpus sections are injected:
  1. `=== CORPUS — FILTERED TO [Sports] (8 events) ===` — per-word rates and per-event breakdown for matching events only
  2. `=== CORPUS — ALL EVENT TYPES (114 total events) ===` — per-word rates and per-event breakdown across all event types
  - The system prompt instructs the model to use **filtered rates as the primary anchor** and **compare against full rates** to identify divergences (e.g., "60% in Sports but 25% overall — flag this"). It also instructs the model to check recency trends, sample size concerns, and event-specific patterns using the per-event detail.

- **Without categories selected**: A single corpus section is injected:
  - `=== CORPUS MENTION HISTORY — ALL EVENT TYPES (114 total events) ===` — with a note that rates mix all event formats and the model should use per-event detail (titles, dates, categories) to reason about which events are most comparable.

Per-event detail is formatted compactly: `YES — Trump Rally 2026-02-28 [Sports]` or `NO — Trump Press Conference 2026-02-15`. The model is instructed to cite corpus data with event-level detail in the briefing and call out significant divergences between filtered and full corpus rates.

### Agent Input/Output Types

All defined in `src/types/research.ts`. Key types:

```typescript
interface HistoricalResult {
  transcriptsFound: Array<{
    title: string; date: string; source: string; url: string;
    wordCount: number; summary: string;
    wordMentions?: Record<string, number>;
  }>;
  wordFrequencies: Record<string, {
    appearedInCount: number; totalTranscripts: number;
    frequency: number; contextNotes: string; averageOccurrences: number;
  }>;
  overallNotes: string;
}

interface ClusterResult {
  clusters: Array<{
    name: string; theme: string; words: string[];
    intraCorrelation: "high" | "medium" | "low";
    correlationNote: string; tradingImplication: string;
    narrative?: string;
  }>;
  standaloneWords: Array<{ word: string; reason: string }>;
  crossClusterCorrelations: Array<{
    cluster1: string; cluster2: string; correlation: string; note: string;
  }>;
}

interface SynthesisResult {
  briefing?: string;
  wordScores: Array<{
    word: string; ticker: string;
    historicalProbability: number; agendaProbability: number;
    newsCycleProbability: number; baseRateProbability: number;
    combinedProbability: number; marketYesPrice: number;
    edge: number; confidence: "high" | "medium" | "low";
    reasoning: string; keyEvidence: string[];
    clusterName: string | null;
  }>;
  topRecommendations: {
    strongYes: Array<{ word: string; edge: number; reasoning: string }>;
    strongNo: Array<{ word: string; edge: number; reasoning: string }>;
  };
  researchQuality: {
    transcriptsAnalyzed: number; sourcesConsulted: number;
    overallConfidence: "high" | "medium" | "low"; caveats: string[];
  };
}

interface CorpusEventDetail {
  eventTitle: string;
  eventDate: string | null;
  eventTicker: string;
  wasMentioned: boolean;
  category: string | null;
}

interface CorpusMentionRate {
  mentionRate: number;       // 0-1, e.g. 0.75 = mentioned in 75% of past events
  yesCount: number;          // times mentioned
  totalEvents: number;       // total events checked
  events: CorpusEventDetail[];  // full per-event breakdown (Phase 17)
}

interface RecentRecordingsResult {
  recordings: Array<{
    title: string;
    date: string;
    url: string;
    platform: string;
    durationMinutes: number | null;
    description: string;
  }>;
  selectionRationale: string;
  searchQueries: string[];
}

type ModelPreset = "opus" | "hybrid" | "sonnet" | "haiku";

interface OrchestratorInput {
  event: {
    id: string; kalshiEventTicker: string; title: string;
    speaker: string; eventType: string; eventDate: string; venue?: string;
  };
  words: Array<{ id: string; ticker: string; word: string; yesPrice: number; noPrice: number }>;
  layer: "baseline" | "current";
  modelPreset?: ModelPreset;  // controls per-agent model selection, default "sonnet"
  existingResearch?: { historicalResult?; agendaResult?; eventFormatResult?; marketAnalysisResult? };
  corpusMentionRates?: Record<string, CorpusMentionRate>;     // keyed by lowercase word (category-filtered if categories selected)
  corpusMentionRatesAll?: Record<string, CorpusMentionRate>;  // keyed by lowercase word (always unfiltered, all event types)
  corpusCategories?: string[];   // which categories were selected for filtering
  corpusTotalEvents?: number;    // total events across all categories for this speaker
}
```

---

## Orchestrator Pipeline

`src/agents/orchestrator.ts` — `runResearchPipeline(input, runId, onProgress?)`

### Model Preset Routing

The orchestrator maps the user-selected `ModelPreset` to per-agent model assignments via `getAgentModels(preset)`:

| Preset | Historical | Agenda | News Cycle | Event Format | Market Analysis | Recent Recordings | Clustering | Synthesizer |
|--------|-----------|--------|------------|--------------|----------------|-------------------|------------|-------------|
| **Opus** (Full) | Opus 4.6 | Opus 4.6 | Opus 4.6 | Opus 4.6 | Opus 4.6 | Opus 4.6 | Opus 4.6 | Opus 4.6 |
| **Hybrid** | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 | Haiku 4.5 | Sonnet 4.5 | Haiku 4.5 | Haiku 4.5 | Opus 4.6 |
| **Sonnet** (All) | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 | Sonnet 4.5 |
| **Haiku** (All) | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 |

Model constants: `OPUS = "claude-opus-4-6"`, `SONNET = "claude-sonnet-4-5-20250929"`, `HAIKU = "claude-haiku-4-5-20251001"`. Type: `ModelPreset = "opus" | "hybrid" | "sonnet" | "haiku"`.

The `AgentModelMap` (type `Record<AgentName, string>`) is computed once at pipeline start from `getAgentModels(input.modelPreset)`, then each agent call receives its assigned model string (e.g., `model: models.historical`). Every agent file accepts an optional `model?: string` parameter in its input interface and passes it through to `callAgentForJson()`.

**Hybrid preset rationale**: Uses Opus only for the synthesizer (the most critical agent that produces final probability estimates), Sonnet for research-heavy agents (historical, agenda, news, market), and Haiku for simpler structural agents (event format, clustering). This significantly reduces cost while maintaining quality on the most important output.

### Transcript Caching (Internal Optimization)

Before Phase 1, the orchestrator queries the `transcripts` table for the speaker's cached transcripts. These are passed to the historical agent as `cachedTranscripts` so it can skip redundant web searches. After Phase 1, newly found transcript metadata is upserted back into the `transcripts` table for future runs.

**Note**: The `transcripts` table is an internal optimization cache only. It is NOT exposed on any user-facing page. The Sources tab on the research dashboard shows agent-found transcripts from `research_runs.historical_result` JSONB, not from the `transcripts` table.

### Cancellation Support

Before each phase, the orchestrator queries `research_runs.status` — if `"cancelled"` (set by `POST /api/research/stop`), it throws a `CancelledError` and stops.

### Phase 1: Parallel Research
```
historical ──────┐
agenda ──────────┤
news-cycle ──────┤
event-format ────┼──→ Promise.allSettled() ──→ Save agent results to DB
market ──────────┤
recent-recordings┘
```

### Phase 2: Clustering → Phase 3: Synthesis → Phase 4: Persistence

All DB writes are individually wrapped in try/catch — a failed write doesn't crash the pipeline.

**Null safety on LLM outputs**: The synthesizer and clustering agent outputs are accessed with `?? []` fallbacks before iteration: `synthesisResult.data.wordScores ?? []` and `clusteringResult.data.clusters ?? []`. This is critical because the TypeScript target is `ES2017`, which downlevels `for...of` loops on arrays to classic `for` loops using `.length`. If an LLM (especially Haiku) returns JSON missing the expected array field, `undefined.length` would crash the pipeline. The `?? []` fallback ensures the pipeline completes (with 0 scores saved) rather than failing. The trigger route also uses `?.length ?? 0` when accessing result arrays in the SSE completion event.

### Corpus Data Flow

When a speaker is selected (via `speakerId` in the trigger request or from `event.speaker_id`):

1. **Trigger API** fetches corpus data: `speakers` → `series` (by `speaker_id`) → `event_results` (paginated, joined with `words` and `events` including title, ticker, date, category) → filter by series → build corpus datasets from the same query:
   - `corpusMentionRates` — filtered by selected categories (if any), with full per-event detail (event title, date, ticker, wasMentioned, category). When only "All" is ticked (no specific categories), uses the full unfiltered dataset.
   - `corpusMentionRatesAll` — **only populated when "All" (`__all__`) is explicitly ticked** on the home page category dropdown. Previously always included; now controlled by explicit user opt-in. When not ticked, this field is `undefined` and the synthesizer only sees filtered data.
   - `corpusTotalEvents` — count of distinct events across all categories
   - `corpusCategories` — which categories were selected (passed through for prompt context)
   - The categories are stored as comma-separated string on `research_runs.corpus_category` for tracking.
2. **Orchestrator** passes all corpus fields through to the synthesizer: `corpusMentionRates`, `corpusMentionRatesAll`, `corpusCategories`, `corpusTotalEvents` (no transformation)
3. **Synthesizer** receives corpus data and builds one or two research sections depending on whether categories are selected:
   - **With categories**: Two sections — filtered corpus (primary anchor) + full corpus (comparison). Prompt instructs the model to compare rates across both, flag divergences, check recency trends, and note sample size differences.
   - **Without categories**: Single section — all events with a note about mixed formats. Per-event detail includes categories so the model can reason about which events are most comparable.
   - Weight reallocation: 70% corpus / 30% base_rate (when corpus is present)

If no speaker is selected or the speaker has no series/settlement data, all corpus fields are `undefined` and the synthesizer falls back to its standard weighting (no corpus weight). When categories are provided, only events matching the selected categories contribute to `corpusMentionRates` — events with `null` or non-matching categories are excluded from the filtered dataset but still appear in `corpusMentionRatesAll`.

---

## API Routes

### Core Research Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/events/load` | POST | Load event from Kalshi by URL or ticker. Parses event date from `sub_title` field (actual event date), falling back to `strike_date` then market `close_time`. |
| `/api/events/list` | GET | List events with research runs (excludes corpus-only imports) |
| `/api/events/speaker` | PATCH | Persist speaker selection on an event `{ eventId, speakerId }` |
| `/api/events/refresh-markets` | POST | Re-fetch markets from Kalshi for an existing event `{ eventId }`. Upserts any new active/open words not already in DB. Returns `{ newWords, totalWords, words }`. Used by the "Refresh Markets" button on the research WordTable to pull in newly added Kalshi strikes without re-running research. |
| `/api/research/trigger` | POST | Start research pipeline (returns SSE stream). Accepts `{ eventId, layer, speakerId?, modelPreset?, corpusCategory?, corpusCategories? }`. `modelPreset` can be `"opus"`, `"hybrid"`, `"sonnet"` (default), or `"haiku"` — controls which Claude model each agent uses. Saved to `research_runs.model_used`. When `speakerId` is provided: persists to event, fetches corpus mention rates from settled Kalshi markets, passes to synthesizer. Supports multi-category filtering: `corpusCategories` (string array) takes precedence over `corpusCategory` (string, backwards-compatible). The `__all__` sentinel value in `corpusCategories` controls whether `corpusMentionRatesAll` (full unfiltered corpus) is passed to agents — it is stripped before category filtering. When categories are provided: filters corpus events to only include those matching any of the selected categories, and stores comma-separated categories on `research_runs.corpus_category`. |
| `/api/research/stop` | POST | Cancel a running research run |
| `/api/research/[eventId]` | GET | Get full research data for an event |
| `/api/research/status/[runId]` | GET | Check status of a specific run |

### Trade Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/trades/log` | POST | Log a trade with agent probability |
| `/api/trades/[tradeId]` | DELETE | Delete a trade permanently. Returns `{ success: true }`. |
| `/api/trades/[tradeId]` | PATCH | Edit a trade's entry price and/or contracts. Recalculates `total_cost_cents`. If trade is already settled, recalculates `pnl_cents` using same formula as `settlement.ts`. |
| `/api/trades/results` | POST | Manual event resolution |
| `/api/settlement/check` | POST | Auto-settle via Kalshi API polling |

### Transcript Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/transcripts` | GET | List/filter transcripts (`?speaker=`, `?q=` text search) |
| `/api/transcripts/upload` | POST | Upload new transcript |
| `/api/transcripts/frequencies` | GET | Word frequencies across corpus |
| `/api/transcripts/[id]` | GET/DELETE | Single transcript |
| `/api/transcripts/[id]/download` | GET | Download transcript as .txt file |

### Corpus Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/corpus/speakers` | GET | List all speakers from speakers table |
| `/api/corpus/speakers` | POST | Create a new speaker `{ name }` |
| `/api/corpus/speakers` | DELETE | Delete a speaker `?id=` |
| `/api/corpus/series` | GET | List series for a speaker `?speakerId=` |
| `/api/corpus/series` | POST | Create series `{ speakerId, seriesTicker, displayName }` |
| `/api/corpus/series` | DELETE | Delete series + cascade all data `?id=` |
| `/api/corpus/series/events` | GET | List events + word results for a series `?seriesId=` (includes `category` field) |
| `/api/corpus/categories` | GET | List distinct categories for a speaker `?speakerId=` |
| `/api/corpus/categories` | PATCH | Assign category to events `{ eventIds: string[], category: string \| null }` |
| `/api/corpus/categories` | PUT | Rename category globally `{ speakerId, oldName, newName }` — updates all events with old name |
| `/api/corpus/categories` | DELETE | Delete category globally `?speakerId=...&name=...` — clears category from all matching events |
| `/api/corpus/mention-history` | GET | Aggregated word mention rates `?speakerId=` (optional `?category=` filter, supports comma-separated multi-category e.g. `?category=Sports,Rally`) |
| `/api/corpus/import-historical` | POST | Import settled events from Kalshi `{ seriesId }` |
| `/api/corpus/kalshi-series` | GET | Search Kalshi API for series `?q=` (cached 10min) |
| `/api/corpus/quick-prices` | GET | Fetch live market prices for an event `?url=` (read-only, no DB writes) |

### Other Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ws/prices` | GET | WebSocket-to-SSE proxy for live Kalshi prices |
| `/api/analytics/performance` | GET | Aggregate analytics with per-trade corpus historical rates |

---

## Frontend Pages

### Home Page (`/`)
- URL input field for Kalshi event URLs or raw tickers
- "Load Event" button fetches event data from Kalshi
- **Speaker dropdown** — fetches speakers from `/api/corpus/speakers` and shows a dropdown to select which speaker's corpus data to use. This is the ONLY speaker selection on the home page (no free-text speaker input, no event type dropdown — agents determine those automatically).
- **Corpus Category dropdown** — appears when a speaker is selected and that speaker has categories defined. Multi-select checkbox dropdown with an explicit **"All" checkbox** at the top (uses `__all__` sentinel value, separated from real categories by a divider). Allows scoping the research run to specific event types (e.g. only "Rally" events). The "All" checkbox controls whether the full unfiltered corpus (`corpusMentionRatesAll`) is passed to agents — it is NOT automatically included. Passed as `?corpusCategories=Sports,__all__` URL param to the research page and included in the trigger request. Button label shows: "No corpus" (nothing selected), "All" (only __all__), "Sports + All" (both real categories and All), or just "Sports" (category without All). When specific categories are selected, only events matching those categories contribute to the synthesizer's filtered mention rates.
- **Model preset dropdown** — allows selecting which Claude model configuration to use for research: "Opus (Full) — highest quality", "Hybrid — Opus synthesizer, Sonnet/Haiku agents", "Sonnet (All) — good balance" (default), "Haiku (All) — cheapest". Stored in `modelPreset` state, passed as a URL query param (`?modelPreset=xxx`) when navigating to the research page.
- Displays event details: title, ticker, word count
- Shows grid of all word contracts with current YES prices
- "Start Research" button — persists the selected speaker to the event record via `PATCH /api/events/speaker`, then navigates to the research page with the selected model preset as a query param. The speaker selection flows through to the research trigger API which fetches corpus data for the synthesizer.
- **"Researched Events" list** at the bottom — only shows events that have at least one research run (filtered via `/api/events/list` which queries `research_runs` table). Corpus-imported events without research runs are excluded entirely. Uses Next.js `<Link>` components (not `<button>`) so items are right-clickable to open in a new tab.

### Research Dashboard (`/research/[eventId]`)
The main working page for tactical research on a specific upcoming Kalshi mention market event. Tabbed layout with extracted components.

Reads `modelPreset` from URL query params (e.g., `/research/abc123?modelPreset=hybrid`) and passes it to the trigger API when starting research. Defaults to `"sonnet"` if not specified.

**Always visible:**
- `EventHeader` — Event title, speaker, date, WS status, corpus speaker dropdown (same speakers list as home page), research trigger buttons. The speaker dropdown here allows changing the speaker after initial selection on the home page — persists via `PATCH /api/events/speaker` and is sent with the next research trigger.
- `ProgressMessages` — Real-time SSE progress during active research
- `TabNavigation` — Three tabs: Research | Sources | Trade Log
- `RunHistory` — Expandable research run history with model preset tags (purple badges showing which model was used for each run)

**Research tab** (designed for the trader's pre-event workflow):

0. `RecentRecordings` — Clickable video cards linking to the 3 most recent recordings of similar events. Each card shows platform icon (▶ for YouTube, 📺 for C-SPAN, 🔗 for others), title, date, platform badge, duration, and description. Opens in new tab. Returns null if no recordings data. The agent's selection rationale and search queries are viewable in the `AgentOutputAccordion` under "Recent Recordings Agent". Data from `RecentRecordingsResult` in `research_runs.recent_recordings_result`.

1. `EventContext` — Structured event context surfaced from agent results:
   - **Event Structure section**: Format (scripted/unscripted/mixed), estimated duration + range, Q&A (yes/no), live (yes/no), agent explanation of format and duration effects, trading weight footer (Historical weight %, Current context weight %, Word count expectation). Data from `EventFormatResult`.
   - **Event Analysis section**: Breaking news alert banner (if any), Agenda & Purpose with advance sources, Exogenous Events sorted by relevance (HIGH/MEDIUM/LOW) with speaker framing, Recent Speaker Statements with dates and context, Likely Topics sorted by likelihood (very_likely → unlikely) with evidence strings and related market words. Data from `AgendaResult` and `NewsCycleResult`.
   - Shows placeholder when no research has been run yet.

2. `WordTable` — Corpus-integrated word analysis (replaces the old WordAnalysisTable):
   - **Title with count** — "Word Analysis (N)" where N is the number of currently visible rows, updates dynamically with filtering.
   - **Refresh Markets button** — pulls in newly added Kalshi strikes from the event without re-running research. Calls `POST /api/events/refresh-markets`, upserts new active/open words. Unscored words appear in the table with corpus data if available.
   - **Manual speaker selector** in the header — dropdown of all speakers from the corpus system. User selects which speaker's historical data to cross-reference against.
   - **Category filter dropdown with checkboxes** — appears next to the speaker dropdown when the speaker has categories. Multi-select via checkboxes in a dropdown menu. Two modes:
     - **"This event" (default)**: No categories selected. Shows all event strikes with full corpus data (no category filter). No rows hidden.
     - **Specific categories (e.g. "Sports")**: Shows only event strikes that exist as words in that category's corpus. Strikes not tracked in the selected category's corpus are hidden. Even words with 0% mention rate in the category still show. Multiple categories can be selected simultaneously.
     - Dropdown shows category name when one selected, "N selected" for multiple, "This event" for none. "Reset to this event" clears all selections.
   - **Historical rates from corpus only** — mention rates come exclusively from Kalshi settled market data (ground truth via `MentionHistoryRow`), NOT from the agent's web-scraped transcripts. This provides 100+ event sample sizes instead of ~9 from web scraping.
   - **Columns**: Word, Market Price (live via WebSocket), Historical Rate (color-coded badge: green ≥60%, yellow ≥30%, red <30%), Edge (historical rate - market price), Sample (yes/total)
   - **Expandable rows** — click any word to see event-by-event results (event title, ticker, date, MENTIONED/NOT MENTIONED badge) from the corpus
   - **Sortable** by all columns. Default sort: Edge descending.
   - **Merges scored + unscored words** — rows come from both `wordScores` (research run results) and `allWords` (all DB words for the event, including newly added strikes). Unscored words show market prices and corpus data but no agent probabilities.
   - Data flow: `wordScores` (from research run) + `allWords` (from DB) provide the word list + market tickers → `livePrices` (from WebSocket) update market prices → `mentionData` (from `/api/corpus/mention-history`) provides historical rates matched by normalized word name

3. `AgentOutputAccordion` — Expandable raw agent outputs for debugging. 8 panels: Historical Transcript, Agenda/Preview, News Cycle, Event Format, Market Analysis, Recent Recordings, Word Clustering, Synthesizer.

**Sources tab**: `SourcesTab` — aggregates every source used across all research agents, with type tags. Extracts sources from the latest completed run's `historical_result`, `agenda_result`, `news_cycle_result`, and `event_format_result`. Each source is tagged by type:
  - **Transcript** (blue) — from historical agent's `transcriptsFound[]`
  - **Agenda** (green) — from agenda agent's `sourcesFound[]`
  - **News** (amber) — from news cycle agent's `trendingTopics[].sources[]`
  - **Statement** (rose) — from news cycle agent's `recentSpeakerStatements[]`
  - **Event** (purple) — from event format agent's `comparableEvents[]`

  Sources with URLs are clickable. Summary badges at the top show counts per type. The `extractSources()` helper function (exported from `SourcesTab.tsx`) handles the extraction logic.

**Trade Log tab**: WordScoresTable (with inline trade forms), LoggedTrades (with inline editing and deletion), ResolveEvent

### Corpus Page (`/corpus`)
Strategic analytics page for long-term speaker data, completely separate from individual research runs. All data here comes from Kalshi's settled market results (ground truth), not from AI agent analysis.

**Layout:**
- Header with SpeakerSelector dropdown (includes "Add New Speaker")
- 3-tab navigation: Mention History | Kalshi Markets | Quick Analysis
- All tabs filter by the selected speaker

**Mention History tab:**
- **Category filter dropdown** — appears when the speaker has categories defined. Filters all mention data to only include events with the selected category. Defaults to "All categories".
- `MentionSummaryStats` — Stat cards: Words Tracked, Settled Events, Avg Mention Rate, Top Word
- `MentionHistoryTable` — Sortable, searchable table with columns: Word, Yes, No, Total, Mention Rate %
  - **Search input** at the top filters words by name as you type (case-insensitive substring match)
  - **Reset sort button** appears when sort differs from default (Total desc) — click to reset
  - Color-coded rates (green ≥60%, yellow ≥30%, red <30%)
  - Click any row to expand → shows per-event detail (event title, date, MENTIONED/NOT MENTIONED badge)

**Kalshi Markets tab:**
- **Side-by-side layout** (2-column grid on large screens):
  - **Left: Add Kalshi Series** — `KalshiSeriesSearch` searchable dropdown querying the Kalshi API for all available series. Type a keyword (e.g., "mention", "trump", "vance") to filter. Click a result to add the series to the speaker.
  - **Right: Corpus Categories** — Category management panel. Create new categories by name, rename globally (updates all events), delete globally (clears from all events). Categories listed with Rename/Delete buttons. See [Corpus Categories](#corpus-categories) for full details.
- Series cards showing: ticker, display name, events count, words count, last imported date
- Per-series **Refresh** button (re-imports from Kalshi API) and **Delete** button
- **Expandable series → events**: Click a series to see all its events, most recent first
  - Each event shows: title, date, status, quick Y/N count, and a **category dropdown**
  - **Category dropdown** — simple `<select>` on each event row. Shows "No category" by default, lists all existing categories. Changing the dropdown immediately assigns/unassigns the event via `PATCH /api/corpus/categories`. Highlighted in indigo when assigned.
  - **Expandable event → words**: Click an event to see a word table with green **Y** / red **N** for each word

**Quick Analysis tab:**
- `QuickAnalysisTab` — Paste a Kalshi mention market URL to compare live market prices against historical mention rates
- **URL input** at the top — paste a URL or event ticker, press Enter or click "Analyze"
- **Saved searches list** — each search is saved as a clickable entry persisted in `localStorage` (keyed per speaker). Click an entry to reload it. "Remove" button to delete entries. Active entry shows a green/yellow WS status dot.
- **Comparison table** — sortable columns: Word, Market Price (cents), Historical Rate (%), Edge (historical - market), Sample (yes/total). Default sort: Edge descending.
  - **Expandable rows** — click any word row to see per-event detail (same MENTIONED/NOT MENTIONED breakdown as Mention History)
  - Edge color-coding: green for positive edge (underpriced), red for negative (overpriced)
  - "No data" shown for words not in the historical corpus
- **Live WebSocket prices** — connects via the existing `useLivePrices` hook and `/api/ws/prices` SSE proxy. Market prices update in real-time. Green dot = connected, yellow = connecting.
- **Summary cards** at the bottom: Underpriced (YES), Overpriced (YES), Fair (±5%) counts with top pick for each
- **Data flow**: `GET /api/corpus/quick-prices?url=` fetches event + market prices from Kalshi REST API (read-only, no DB writes) → client-side cross-references each word against `mentionData` (already loaded for the selected speaker) by normalized word name → WebSocket updates prices in real-time
- **localStorage format**: `kalshi-quick-analysis-{speakerId}` stores `SavedSearch[]` where each entry is `{ url, eventTitle, eventTicker }`. Handles migration from older single-object format.

### Analytics Page (`/analytics`)
- **Overall Stats cards** (6 cards): Total trades, wins, losses, win rate, total P&L, **EV** (resolved trades only). EV = expected value per trade = `totalPnlCents / totalTrades` (in dollars). EV color: green when positive, red when negative.
- **Per-Event Performance table**: Only shows events with at least one trade (corpus-only events excluded). Columns: Event, Date, Trades, W/L, Win Rate, P&L.
  - **Expandable rows** — click any event to expand and see individual trade detail. Chevron (▶) rotates 90° when expanded.
  - **Trade detail sub-table** (8 columns): Word, Side (YES/NO pill), Entry Price, Contracts, Mention Rate, Edge, Result (W/L), P&L.
  - **Mention Rate** = historical corpus mention rate with sample counts. Displayed as `29% (10/34)` where 10 = times mentioned, 34 = total events in corpus. Data from `event_results` settled data via the event's `speaker_id` linkage. NOT the AI synthesizer's `combined_probability`. Shows "-" if no speaker is linked.
  - **Edge** = `historical_rate - entry_price`. Color-coded: green for positive (underpriced), red for negative (overpriced). Shows "-" if no speaker is linked.
  - **Data flow for historical rates**: `events.speaker_id` → `series` (where `speaker_id` matches) → all corpus `events` in those series → `event_results` joined with `words` → group by normalized word → `{ rate, yes, total }`. The analytics API returns `historicalRate`, `mentionYes`, and `mentionTotal` per trade. Paginated to handle Supabase 1000-row limit.
- **Removed sections** (previously existed, removed to simplify): Calibration Chart, Edge vs P&L Chart, P&L by Event Chart, Recharts dependency no longer used on this page.

---

## Component Architecture

### Shared Types (`src/types/components.ts`)

All component prop types defined here: Event, WordScore, Cluster, ResearchRun (includes `model_used` and `recent_recordings_result` fields), ResearchSummary (includes `recentRecordings` field), Trade, Word, EventResult, SortKey, TabId (`"research" | "sources" | "tradelog"`), PriceData.

Also exports `MODEL_PRESET_LABELS: Record<string, string>` — maps preset keys to display labels: `{ opus: "Opus (Full)", hybrid: "Hybrid", sonnet: "Sonnet (All)", haiku: "Haiku (All)" }`. Used by `RunHistory` to display model tags and can be reused anywhere preset labels are needed.

### Corpus Types (`src/types/corpus.ts`)

```typescript
interface MentionEventDetail {
  eventId: string; eventTitle: string; eventDate: string | null;
  eventTicker: string; wasMentioned: boolean; settledAt: string | null;
}

interface MentionHistoryRow {
  word: string; yesCount: number; noCount: number;
  totalEvents: number; mentionRate: number; events: MentionEventDetail[];
}

interface SeriesWithStats {
  id: string; series_ticker: string; display_name: string | null;
  events_count: number; words_count: number;
  last_imported_at: string | null; created_at: string;
}

interface SpeakerWithSeries {
  id: string; name: string; series: SeriesWithStats[];
}

interface HistoricalImportResult {
  eventsImported: number; wordsImported: number;
  resultsImported: number; errors: string[];
}
```

### Database Types (`src/types/database.ts`)

TypeScript interfaces for all DB rows: `DbSpeaker`, `DbSeries`, `DbEvent`, `DbWord`, `DbWordCluster`, `DbResearchRun`, `DbWordScore`, `DbTranscript`, `DbTrade`, `DbEventResult`.

### Key Component Details

**`EventContext.tsx`** (new):
- Props: `{ eventFormat: EventFormatResult | null; agenda: AgendaResult | null; newsCycle: NewsCycleResult | null }`
- Derived from `latestCompletedRun` in the research page — casts the JSONB columns to their typed interfaces
- Helper functions: `likelihoodColor()` for topic likelihood badges, `relevanceColor()` for exogenous event relevance badges
- Shows a "Run research to see event context" placeholder when all three props are null

**`WordTable.tsx`** (new):
- Props: `{ wordScores: WordScore[]; livePrices: Record<string, PriceData>; mentionData: MentionHistoryRow[]; mentionLoading: boolean; speakers: Array<{ id: string; name: string }>; selectedSpeakerId: string; onSpeakerChange: (speakerId: string) => void; categories?: string[]; selectedCategories?: string[]; onCategoriesChange?: (categories: string[]) => void; allWords?: Array<{ id, word, kalshi_market_ticker }>; onRefreshMarkets?: () => Promise<void>; refreshing?: boolean }`
- Title shows "Word Analysis (N)" with dynamic count of visible rows
- **Refresh Markets button** — calls `onRefreshMarkets` to pull in newly added Kalshi strikes without re-running research
- Builds a `mentionRateMap` (word name → rate + events) from corpus `MentionHistoryRow[]`
- **Merges scored + unscored words**: rows from `wordScores` (research results) and `allWords` (all DB words for event, deduplicated by ticker). Unscored words get prices and corpus data but no agent probabilities.
- **Category filtering**: When `selectedCategories` is empty ("This event" mode), all rows show with full corpus data. When specific categories are selected, rows are filtered to only words that exist in the corpus (`mentionData` word list). Uses `corpusWords` Set built from `mentionData` for O(1) lookup.
- **Dropdown with checkboxes**: Category selector is a dropdown menu with checkbox inputs for each category. Shows "This event" (default), category name (1 selected), or "N selected" (multiple). "Reset to this event" clears all.
- Manages its own expand/collapse state for per-event detail rows
- Shows "Select a speaker" prompt when no speaker is selected
- **Speaker selection persists**: `onSpeakerChange` callback saves the selection to the event record via `PATCH /api/events/speaker`, so it survives page reloads and is available to the analytics API

**`EventHeader.tsx`** (updated):
- Props: `{ event, hasBaseline, hasCurrent, researchRunning, wsStatus, lastPriceUpdate, hasMarketTickers, speakers, selectedSpeakerId, onSpeakerChange, onTriggerResearch }`
- Contains a corpus speaker `<select>` dropdown next to the research trigger button
- Speaker selection persists via the parent's `onSpeakerChange` callback (which calls `PATCH /api/events/speaker`)
- The selected speaker is sent with the research trigger request as `speakerId`
- Dropdown is disabled while research is running

**Unused but kept components** (may be repurposed later):
- `ResearchBriefing.tsx` — was the markdown research briefing, currently empty for all runs
- `ClusterView.tsx` — was the thematic cluster groupings, temporarily removed from Research tab
- `WordAnalysisTable.tsx` — was the word analysis on Research tab, superseded by WordTable. Still available if needed elsewhere.

---

## Sources System

### Two Distinct Use Cases

**IMPORTANT architectural distinction** — the app has two completely separate use cases that must not be confused:

1. **Research (tactical)** — The home page (`/`) + research dashboard (`/research/[eventId]`). The user pastes a specific upcoming Kalshi market URL, runs AI agents, and gets per-word probability estimates to decide what to buy. Sources come from agent results stored in `research_runs` JSONB columns. This is event-specific, short-lived analysis.

2. **Corpus (strategic)** — The corpus page (`/corpus`). Long-term historical data on a speaker across all past events. Data comes from Kalshi's settled market results (ground truth yes/no outcomes). No AI analysis — purely settlement data from the Kalshi API. Used to identify word frequency patterns over time.

These two systems share the `events` and `words` tables, but their data flows are completely separate:
- Research events have `research_runs` rows. The home page only shows events with research runs.
- Corpus events are imported via `POST /api/corpus/import-historical` and have `event_results` rows (settlement data). They appear on the corpus page, NOT on the home page.

### Sources Tab (Research Dashboard)

The Sources tab (`SourcesTab.tsx`) on the research dashboard shows every source the agents used, extracted from the latest completed research run:

| Agent | Source Field | Source Type Tag |
|-------|-------------|-----------------|
| Historical | `historical_result.transcriptsFound[]` | `transcript` (blue) |
| Agenda | `agenda_result.sourcesFound[]` | `agenda` (green) |
| News Cycle | `news_cycle_result.trendingTopics[].sources[]` | `news` (amber) |
| News Cycle | `news_cycle_result.recentSpeakerStatements[]` | `statement` (rose) |
| Event Format | `event_format_result.comparableEvents[]` | `event` (purple) |
| Market Analysis | _(none — pure price analysis, no web search)_ | — |
| Recent Recordings | `recent_recordings_result.recordings[]` | _(displayed in dedicated RecentRecordings component, not in Sources tab)_ |

The `extractSources()` function handles all extraction logic, normalizing different agent output shapes into a flat `ResearchSource[]` array.

### Transcript Caching (Orchestrator)

The orchestrator still caches transcript metadata in the `transcripts` table after historical agent runs (for future run optimization). This is an internal optimization — the `transcripts` table is NOT exposed on any user-facing page. The transcript API routes (`/api/transcripts/*`) still exist but are not used by any current UI.

---

## Live Prices (WebSocket)

```
Browser (EventSource) → /api/ws/prices (SSE) → Kalshi WebSocket (wss://...)
```

Client hook: `const { prices, status, lastUpdate } = useLivePrices(marketTickers);`

**Price field usage**: The WebSocket ticker messages contain both `yes_bid_dollars` (highest bid) and `yes_ask_dollars` (lowest ask). The app uses `yesAsk` for all market price displays and edge calculations — this is the actual cost to enter a YES position. The `yesBid` field is available in the `PriceData` type but not used for display (it was incorrectly used prior to the Phase 11 fix).

---

## Trade Logging & Settlement

### Trade Flow
1. Log trade → 2. Wait for event → 3. Check settlement (polls Kalshi API) → 4. Auto-resolve → 5. View analytics

### Trade Deletion
Trades can be deleted from the LoggedTrades table. Each trade row shows a subtle red "✕" button on the right (visible when not in edit mode). Clicking it triggers a browser `confirm()` dialog ("Delete this trade?"). On confirm, sends `DELETE /api/trades/[tradeId]` which permanently removes the trade from the database. The parent page refetches all data so trade counts, analytics, and P&L summaries update immediately. The delete button shows "..." while the request is in flight.

### Trade Editing
Trades can be edited after logging (including after settlement). Click on the Entry or Qty values in the LoggedTrades table to edit inline. On save, `PATCH /api/trades/[tradeId]` updates the trade record:
- Recalculates `total_cost_cents = Math.round(entryPrice * contracts * 100)`
- If trade is already settled (`result` is not null), recalculates `pnl_cents` using the same formula from `settlement.ts`:
  - Win: `Math.round((1.0 - entry_price) * contracts * 100)`
  - Loss: `-Math.round(entry_price * contracts * 100)`
- Parent page refetches all data so analytics and P&L summaries update immediately

### Settlement Details
Kalshi market lifecycle: `active` → `closed` → `determined` → `finalized`. Settlement triggers only when ALL markets for an event have results and zero API errors.

---

## How to Run

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local  # Then fill in your keys

# Run development server
npm run dev
# App available at http://localhost:3000

# Build for production
npm run build
```

**First-time setup:**
1. Create a Supabase project
2. Run all eight migrations (001-008) in order
3. Get a Kalshi API key and RSA private key
4. Get an Anthropic API key with access to Claude Opus 4.6, Sonnet 4.5, and/or Haiku 4.5
5. Fill in `.env.local` with all credentials

---

## Deployment (Fly.io)

The app is deployed to **Fly.io** in the **Singapore (`sin`) region** using a Docker-based standalone Next.js build.

**Live URL**: `https://kalshi-research.fly.dev/`

### Deployment Files

| File | Purpose |
|------|---------|
| `fly.toml` | Fly.io app config — region `sin`, port 3000, shared-cpu-1x, 512MB RAM, auto-stop/start |
| `Dockerfile` | Multi-stage Node 22 Alpine build — deps → build → standalone runner |
| `.dockerignore` | Excludes `node_modules`, `.next`, `.git`, `.env*`, `*.pem`, `*.md` |

### Key Configuration

- **`next.config.ts`**: `output: "standalone"` — required for Docker deployment. Produces a self-contained build with `server.js` entry point.
- **`src/lib/supabase.ts`**: Lazy initialization via `getServerSupabase()` function — the Supabase client is created at runtime, not at module load time. This prevents build failures when env vars aren't available during Docker build.
- **`fly.toml`**: Auto-stop machines when idle (`auto_stop_machines = 'stop'`), auto-start on request. Health check on `/` every 30s.

### Fly Secrets

All environment variables are set as Fly secrets (not baked into the Docker image):

```bash
fly secrets set \
  KALSHI_API_KEY="<uuid>" \
  KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="<jwt>" \
  SUPABASE_SERVICE_ROLE_KEY="<jwt>"
```

**Important**: Use `KALSHI_PRIVATE_KEY` (raw PEM content), not `KALSHI_PRIVATE_KEY_PATH` — there's no local file in the container. The `kalshi-client.ts` checks `KALSHI_PRIVATE_KEY` first, falls back to file path.

### Deploy Commands

```bash
# Deploy latest code
fly deploy

# View logs
fly logs

# Check app status
fly status

# SSH into running machine
fly ssh console

# Update a secret
fly secrets set KEY=value
```

### SSE Keepalive for Long-Running Requests

The research pipeline's synthesizer step can take 60-120+ seconds (32K token output from Claude). Fly.io's proxy kills idle HTTP connections after ~60 seconds. The SSE stream in `/api/research/trigger` sends `: keepalive\n\n` comments every 15 seconds to prevent the proxy from closing the connection. This is a standard SSE comment (colon-prefixed lines are ignored by `EventSource` clients).

### Architecture Notes

- **No custom server**: Uses Next.js built-in standalone server (`node server.js`). No Express/Hono required.
- **WebSocket proxy**: The `/api/ws/prices` route connects to Kalshi's WebSocket API server-side and forwards updates as SSE to the browser. Fly.io supports this natively via HTTP keep-alive. The WS route already has its own 30s keepalive interval.
- **NEXT_PUBLIC_ vars**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are embedded into the client bundle at build time on Fly's build servers. Since they're set as Fly secrets before the first deploy, they're available during build. If you change these values, you must redeploy (not just restart).
- **VM sizing**: Currently shared-cpu-1x with 512MB RAM. The app is I/O bound (waiting on Claude API, Kalshi API, Supabase). If you see OOM errors, bump to 1GB with `fly scale memory 1024`.

---

## Two-Layer Research Model

### Baseline Layer (Comprehensive)
Run days before the event. Runs ALL 8 agents: historical frequencies, agenda, news cycle, event format, market analysis, recent recordings, clustering, and synthesis. The baseline should always be as comprehensive as possible.

### Current Layer (Refresh)
Run hours before the event. Re-runs all agents with the latest data. Reuses baseline results as context (passed via `existingResearch` to the orchestrator). The purpose is to catch any material changes since the baseline was run.

---

## Relationship to Speed Trader

Companion to the **Speed Trader** project at `~/kalshi-trade/`. Speed Trader handles fast automated trading during live events. This Research Agent handles pre-event analysis.

Shared: `kalshi-client.ts`, WebSocket-to-SSE pattern, `kalshi-key.pem`, Kalshi API key.

---

## Corpus Categories

Categories allow grouping corpus events by type (e.g. "Rally", "Press Conference", "Sports/Entertainment") so that mention rates can be filtered to only relevant event types. This is critical because a speaker's word usage patterns differ dramatically between event types — a rally has very different word frequencies than a bilateral meeting.

### Data Model

Categories are stored as a free-text `category` column on the `events` table (Migration 007). There is no separate categories table — categories are derived from distinct `category` values across a speaker's events. This means a category only "exists" if at least one event has it assigned (or it has been created locally in the UI pending assignment).

### Category Management (Corpus Page → Kalshi Markets Tab)

The Kalshi Markets tab has a **side-by-side layout**: "Add Kalshi Series" on the left, "Corpus Categories" on the right.

**Create**: Type a name and click "Create". The category is added to the local list immediately and becomes available in event dropdowns. It becomes persistent once at least one event is assigned to it.

**Rename** (global): Click "Rename" next to a category, enter the new name, click "Save". This calls `PUT /api/corpus/categories` which finds ALL events belonging to the speaker's series that have the old category name and updates them to the new name. Returns the count of events updated.

**Delete** (global): Click "Delete" next to a category, confirm the dialog. This calls `DELETE /api/corpus/categories?speakerId=...&name=...` which sets `category = null` on ALL events belonging to the speaker's series that have that category name. The events are not deleted — just uncategorized.

**Assign**: Each event row in the expanded series list has a `<select>` dropdown. Changing it calls `PATCH /api/corpus/categories` with the event ID and selected category (or `null` for "No category"). The assignment is immediate — no save button needed.

### Category API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/corpus/categories?speakerId=...` | Returns `{ categories: { name: string, count: number }[] }` — distinct category values from all events in the speaker's series, with event counts, sorted alphabetically |
| PATCH | `/api/corpus/categories` | Assign category to events. Body: `{ eventIds: string[], category: string \| null }`. Used by the event row dropdown. |
| PUT | `/api/corpus/categories` | Global rename. Body: `{ speakerId, oldName, newName }`. Finds all events in the speaker's series with `category = oldName`, updates to `newName.trim()`. Returns `{ ok: true, updated: number }`. |
| DELETE | `/api/corpus/categories?speakerId=...&name=...` | Global delete. Finds all events in the speaker's series with `category = name`, sets `category = null`. Returns `{ ok: true, cleared: number }`. |

### Category Filtering in Mention History

The mention history API (`GET /api/corpus/mention-history`) accepts an optional `?category=` query parameter supporting comma-separated multiple categories (e.g. `?category=Sports,Rally`). When provided, the aggregation loop builds a `Set` of category names and skips any event where `events.category` is not in the set. This means:
- Events with `category = null` (uncategorized) are excluded when a category filter is active
- Only events explicitly assigned to one of the selected categories contribute to mention rates
- The `totalSettledEvents` count also reflects only the filtered events

The corpus page shows a single-select category filter dropdown on the Mention History tab when the speaker has categories defined.

### Category Filtering in Research Pipeline

The research trigger API (`POST /api/research/trigger`) accepts both `corpusCategories` (string array, preferred) and `corpusCategory` (string, backwards-compatible) in the request body. `corpusCategories` takes precedence. The array may contain the special `__all__` sentinel value. When provided:
1. The trigger API extracts `__all__` from the categories array: `includeAllCorpus = rawCategories.includes("__all__")`, `effectiveCategories = rawCategories.filter(c => c !== "__all__")`. The `__all__` value is never used as an actual category filter.
2. Builds corpus datasets: `corpusMentionRates` (filtered by `effectiveCategories` if any, or the full dataset if only "All" is ticked) and `corpusMentionRatesAll` (**only populated when `includeAllCorpus` is true** — i.e., the user explicitly ticked "All"). Both include full per-event detail (event title, date, ticker, category, wasMentioned). Also computes `corpusTotalEvents` (distinct event count across all categories).
3. The effective categories (without `__all__`) are stored as comma-separated string on `research_runs.corpus_category` for tracking which category scope was used.
4. The synthesizer receives the datasets plus the category names and total event count, enabling it to compare filtered vs unfiltered rates when both are present.

The home page and research page both support category selection:
- **Home page**: Multi-select category dropdown with checkboxes appears when a speaker is selected and has categories. Has an explicit **"All" checkbox** at the top (separated by a divider from real categories) that sends `__all__` sentinel. Passed as `?corpusCategories=Sports,__all__` URL param. Controls whether `corpusMentionRatesAll` is populated — it is NOT automatically included.
- **Research page**: Reads `corpusCategories` from URL params (comma-separated, initial value — strips `__all__` for display), also supports legacy `corpusCategory` param. Fetches categories when speaker changes. The WordTable component has a multi-select dropdown with checkboxes for category filtering (display filter only — does NOT have the "All" checkbox, which is home-page-only). Multiple categories can be combined (e.g. "Sports" + "Rally"). The research trigger sends `corpusCategories` (array) to the API. The mention-history fetch sends comma-separated categories (with `__all__` stripped).

**Important distinction**: The home page category dropdown controls what corpus data is passed to agents at research trigger time. The WordTable category dropdown on the research page is a CLIENT-SIDE display filter only — it controls which words are shown in the table. These are completely independent systems.

### Category Filtering in WordTable (Research Dashboard)

The WordTable on the research dashboard has a **two-mode** category filter:

1. **"This event" (default)** — `selectedCategories` is empty. The mention-history API is called without a category filter (full corpus). All event strikes are shown. Words with no corpus match show "No data".

2. **Specific categories selected** — `selectedCategories` contains one or more category names. The mention-history API is called with those categories as a comma-separated `?category=` param. Rows are filtered to only show words that exist in the returned corpus data (built from `mentionData` word list). Event strikes not tracked in the selected categories' corpus are hidden. Words with a 0% mention rate in the category still show (they exist in the corpus, they just were never mentioned).

### Import Behavior

New events imported via "Refresh" come in with `category = null` (uncategorized). The user must manually assign them to categories via the event row dropdown. This is by design — category assignment requires human judgment about event type.

---

## Current Status & Known Issues

### What's Built and Working
- Full 8-agent research pipeline with streaming progress (all agents run on both layers)
- **Hybrid model support** — configurable model presets (Opus, Hybrid, Sonnet, Haiku) with per-agent model routing. Default: Sonnet (All). Model preset dropdown on home page, flows through URL params → research page → trigger API → orchestrator → agents → claude-client.
- **Model tags on research runs** — purple badge in RunHistory showing which preset was used (e.g., "Sonnet (All)", "Hybrid"). Uses `MODEL_PRESET_LABELS` from `components.ts`.
- **Retry with exponential backoff** — Claude API calls automatically retry on transient errors (429, 529, 500/502/503, connection errors). 4 retries with 3s base delay. Detailed error logging.
- **Corpus data injection with category awareness** — when a speaker is selected, empirical mention rates from settled Kalshi markets are fetched and passed to the synthesizer as ground-truth base rates. Weight reallocation: 70% corpus / 30% generic base rate. When categories are selected, the synthesizer receives **both** the filtered corpus (matching categories only) and the full corpus (all event types), with full per-event detail (title, date, ticker, category, mentioned yes/no). This enables the synthesizer to compare rates across event formats, spot recency trends, and flag divergences.
- **Home page speaker selection + multi-select categories with "All" control** — corpus speaker dropdown and multi-select category dropdown (checkbox style, same pattern as WordTable) on home page. Speaker persists to event record and flows through research trigger to synthesizer. Categories passed as comma-separated `corpusCategories` URL param. Explicit "All" checkbox (`__all__` sentinel) controls whether the full unfiltered corpus is passed to agents — not automatic.
- Tabbed research dashboard (Research | Sources | Trade Log) with extracted components
- **EventHeader** — includes corpus speaker dropdown for changing speaker selection before/between research runs
- **EventContext** — structured event context (format, duration, Q&A, agenda, exogenous events, likely topics, recent statements) surfaced from agent results
- **WordTable** — corpus-integrated word analysis with manual speaker selection, historical rates from Kalshi settled market data (ground truth, 100+ event samples), expandable per-event detail, live WebSocket prices, multi-select category filtering with checkbox dropdown, "Refresh Markets" button for pulling in new Kalshi strikes, word count in title, merged scored + unscored rows. **Important**: The WordTable category dropdown is a CLIENT-SIDE display filter only — it controls which words are shown in the table. The home page category dropdown controls what corpus data is passed to agents at research trigger time. These are completely independent.
- **Recent Recordings** — clickable video cards linking to 3 most recent recordings of similar events, with agent selection rationale in the AgentOutputAccordion
- **Sources tab** — aggregated sources from all agents with type tags (transcript, news, agenda, statement, event), clickable links to originals
- **Home page** — only shows events with research runs (corpus-imported events excluded)
- Live WebSocket price streaming via SSE proxy
- Trade logging with inline forms
- Automatic and manual settlement
- Analytics page with EV card, expandable per-event trade detail, corpus-based historical mention rates with sample counts, and edge calculations. Recharts charts (calibration, edge vs P&L, P&L by event) removed to simplify.
- Run cancellation
- **Corpus page** with 3 tabs:
  - Mention History: cross-event word mention rates with searchable, sortable, expandable per-event detail (827+ data points across 116 events). Word search filter, reset sort button. Data from Kalshi settled markets (ground truth).
  - Kalshi Markets: series management with searchable Kalshi API dropdown, per-series import/refresh, expandable events with word result tables and category dropdowns. **Category management panel** — create/rename/delete categories alongside "Add Kalshi Series". Per-event removal with excluded_tickers tracking (removed events won't be re-imported on refresh). Event title filter for quickly finding/removing non-relevant events. Event titles hyperlinked to original Kalshi market pages for speaker verification. Supports multi-speaker series (e.g. KXCONGRESSMENTION) — import full series under a speaker, remove non-relevant events, refresh safely.
  - Quick Analysis: paste URL → live price vs historical rate comparison table with WebSocket updates, saved search list (localStorage), expandable per-event detail, edge detection, summary cards
- **Corpus categories** — create, rename (globally), delete (globally) categories in the Kalshi Markets tab with event counts. Assign events to categories via dropdown. Filter mention history and research pipeline by category. Multi-select category support on research page WordTable (single-select on corpus page Mention History tab).
- Speaker → Series → Events data model (no fragile inference)
- Historical data import from Kalshi API with pagination and deduplication

### Known Limitations
- **Supabase 1000-row limit**: All queries returning potentially large result sets must paginate. The corpus APIs handle this, but any new API routes querying large tables should use `.range()` pagination.
- **Agent-level retry**: Individual agent failures get fallback empty results, no automatic retry at the agent level. However, the Claude client now has retry with exponential backoff for transient API errors (429, 529, 500/502/503, connection errors).
- **Haiku + web search overload**: The Haiku (All) preset has been observed to trigger `overloaded_error` (529) from the Anthropic API when agents use the `web_search` tool. In testing, all 4 Phase 1 agents with web search failed, while market_analysis (no web search) succeeded. The retry logic (4 retries, 3s base delay) may help for transient overloads, but sustained Haiku capacity issues with web search remain a known issue. **Workaround**: Use the Hybrid preset instead — it only assigns Haiku to event_format and clustering, which don't use web search.
- **Haiku synthesis quality**: Haiku may return synthesis JSON with missing or differently-named fields (e.g., `wordScores` absent). The pipeline now handles this gracefully via `?? []` fallbacks, but the run will complete with 0 word scores. Check the `synthesis_result` JSONB in the DB to see what the model actually returned. Consider using Hybrid or Sonnet for more reliable synthesis output.
- **Multiple concurrent research runs**: Untested.
- **Baseline layer**: One baseline run tested. News cycle agent now runs on both layers but baseline-specific results have limited production testing.
- **Event types beyond speeches**: Only `address_to_congress` type events tested end-to-end with research.
- **One empty event**: KXTRUMPMENTION has 1 event (a Press Conference) with 0 settled markets — this is a Kalshi data issue, not a bug.
- **One missing result set**: KXTRUMPMENTIONB-25DEC03 has 20 words but 0 event_results (transient DB error during import). Re-import the series to fix.
- **Event dates fixed (Phase 14)**: Event dates were previously set from market `close_time`, which is the market's scheduled trading close (a future date when loaded pre-event). Now correctly parsed from the Kalshi event's `sub_title` field (actual event date). Existing traded events were manually corrected in the database. Both `/api/events/load` and `/api/corpus/import-historical` use the new resolution logic.
- **Analytics historical rates require speaker_id**: The analytics page only shows corpus historical mention rates for events where the user has set a speaker (via the home page dropdown before research, or the research page EventHeader/WordTable dropdown). Events without a `speaker_id` show "-" for Mention Rate and Edge columns. Setting the speaker on the home page before triggering research is now the recommended flow — it ensures both the synthesizer and analytics have corpus data.

### Architecture Improvements to Consider
- Proper error boundaries on frontend
- Batch market fetching in settlement check (currently sequential)
- Per-agent model override (allow individual agent model selection beyond preset-level control)

---

## Debugging Notes

### Claude API
- Streaming required for long-running web search operations
- Three-tier JSON parsing: code fences → raw JSON → balanced-brace parser
- `pause_turn` max 5 continuations
- Synthesizer uses 32K output tokens — monitor for truncation on 50+ word events. **Note (Phase 17)**: Input context is now significantly larger with full per-event detail for both filtered and unfiltered corpus datasets. For 25 words × 114 events × 2 datasets, the corpus section alone can be 50-80K tokens. Within Opus/Sonnet's 200K context window but worth monitoring.
- **Retry logging**: All API failures logged as `[claude-client] API call failed (model=..., attempt X/Y, retryable=...): ...`. Look for these in server console to debug transient errors.
- **Model-specific issues**: Haiku 4.5 has been observed to fail with `overloaded_error` (529) when using web search. Check `[orchestrator] Phase 1 agent failed:` logs for which agents specifically failed.
- **Default model**: Sonnet 4.5 (`claude-sonnet-4-5-20250929`). Changed from Opus 4.0 in Phase 12.
- **Citation tags in old data**: Research runs completed before the citation stripping fix (Phase 19) may have raw `<cite index="...">...</cite>` tags in their JSONB agent results. These are cosmetic — the data is correct, just has HTML markup. Re-running research will produce clean outputs.
- **ES2017 downleveling**: TypeScript target is `ES2017` (see `tsconfig.json`). This means `for...of` on arrays is transpiled to classic `for` loops using `.length`. Any `for...of` on a potentially undefined value will throw `"Cannot read properties of undefined (reading 'length')"` — NOT the usual `"undefined is not iterable"` error. Always use `?? []` or null-check before `for...of` on LLM-parsed data.

### Kalshi API
- Website uses `/markets/` URLs, API uses `/events/`. Load route handles this.
- Market `result` field: `"yes"`, `"no"`, `"scalar"`, or `""` (empty = unsettled)
- `yes_sub_title` gives the word display name for markets
- Event `sub_title` contains the actual event date (e.g. "Mar 3, 2026" or "On Feb 27, 2026"). Used for `event_date` resolution. `strike_date` is often `null` for mention market events.
- Historical markets endpoint: `GET /historical/markets?event_ticker=...` — use when nested markets are empty
- Series listing: `GET /series` — returns all series (no search param, filter client-side)
- Full OpenAPI spec at `docs/kalshi-openapi.yaml`

### Supabase
- All 8 migrations applied (001-008). **Default 1000-row limit** — always paginate large queries.
- Service role key bypasses RLS. Anon key respects RLS.
- Management API at `POST https://api.supabase.com/v1/projects/hczppfsuqtpccxvmyaue/database/query` for running SQL directly.

### Build
- TypeScript strict mode — all variables explicitly typed
- `tools` array in `claude-client.ts` typed as `any[]` to avoid SDK type conflicts
- Run `npm run build` to verify before deploying

---

## Cost Estimates

Per-model pricing (cost per million tokens):

| Model | Input | Output |
|-------|-------|--------|
| Opus 4.6 (`claude-opus-4-6`) | $5.00 | $25.00 |
| Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | $3.00 | $15.00 |
| Haiku 4.5 (`claude-haiku-4-5-20251001`) | $1.00 | $5.00 |

Estimated cost per research run (8 agents, one event with ~28 words):

| Preset | Phase 1 (6 agents) | Phase 2 (clustering) | Phase 3 (synthesis) | **Total per run** |
|--------|-------------------|---------------------|--------------------|--------------------|
| **Opus** (Full) | ~$0.55 - $1.60 | ~$0.10 - $0.20 | ~$0.20 - $0.50 | **~$0.85 - $2.30** |
| **Sonnet** (All) | ~$0.33 - $0.95 | ~$0.06 - $0.12 | ~$0.12 - $0.30 | **~$0.51 - $1.37** |
| **Hybrid** | ~$0.26 - $0.77 | ~$0.02 - $0.04 | ~$0.20 - $0.50 | **~$0.48 - $1.31** |
| **Haiku** (All) | ~$0.11 - $0.32 | ~$0.02 - $0.04 | ~$0.04 - $0.10 | **~$0.17 - $0.46** |

Both layers: double the per-run cost. Failed runs still cost money. The default preset is Sonnet (All).

---

## Changelog

### Phase 1: Core Pipeline Reliability (Initial Build)

1. URL Parser `/markets/` support + market ticker fallback
2. Streaming for long-running operations
3. SSE disconnect guard
4. Run cancellation
5. Expandable run rows
6. Synthesizer null news handling
7. Balanced-brace JSON parser
8. DB error handling in orchestrator
9. Synthesizer token limit → 32,000
10. Default values for word scores

### Phase 2: Trading Features (Feb 2026)

11. Row Level Security on all tables
12. Transcript caching in orchestrator
13. Live WebSocket prices via SSE proxy
14. Trade logging UI with inline forms
15. Trade resolution (manual + automatic)
16. Recharts integration (calibration, edge, P&L charts)
17. Settlement automation via Kalshi API
18. Analytics fix (all trades including pending)

### Phase 3: Dashboard Redesign (Feb 2026)

19. Tabbed layout (Research | Transcripts | Trade Log) with 17 components
20. Research Briefing generation (800-1500 word markdown)
21. Expanded cluster view with rich JSONB data
22. Agent output demotion to accordion
23. Word analysis table with cluster filter + live price deltas
24. Transcript management UI (upload, browse, search, frequency, highlighting)
25. Agent prompt enhancements (wordMentions, narrative, briefing)
26. Database migration 003 (briefing, word_frequencies, cancelled status)
27. Component type system (`types/components.ts`, `lib/ui-utils.ts`)
28. Orchestrator briefing save

### Phase 4: Corpus System (Mar 2026)

29. **Speaker → Series → Events data model** — Migration 004 adds `speakers` and `series` tables with `events.series_id` FK. Explicit speaker assignment, never inferred.
30. **Corpus page** (`/corpus`) — Standalone page with 3 tabs (Mention History | Transcript Library | Kalshi Markets), separated from individual research runs.
31. **Speaker management** — CRUD API for speakers table. SpeakerSelector with inline "Add New Speaker" dropdown.
32. **Series management** — CRUD API for series table. Delete cascades through events/words/results/trades.
33. **Historical import rewrite** — Accepts `seriesId` (not ticker), gets speaker from series record, sets `series_id` on events, deduplicates words (fixes `UNIQUE(event_id, word)` constraint violations).
34. **Mention history** — Aggregated word mention rates across all settled events, filtered by speaker through series linkage. Pagination to handle Supabase 1000-row limit.
35. **Kalshi series search** — `GET /api/corpus/kalshi-series` queries the Kalshi API for all available series with 10-minute caching. Searchable dropdown component (`KalshiSeriesSearch`) for adding series.
36. **Series events drill-down** — `GET /api/corpus/series/events` returns all events for a series with nested word results. Expandable in the UI: series → events → word table with green Y / red N badges.
37. **Transcript download** — `GET /api/transcripts/[id]/download` returns transcript as `.txt` file. TranscriptList has optional `showDownload` prop.
38. **Transcript text search** — `GET /api/transcripts?q=` parameter for case-insensitive text search via ilike.
39. **Supabase pagination fix** — All corpus APIs that may exceed 1000 rows now paginate in 1000-row chunks. Fixed mention history (307 → 814 rows) and series events (42 → 114 events with data).
40. **Data backfill** — Created "Donald Trump" speaker, "KXTRUMPMENTION" series, linked 115 existing events.

### Phase 5: Quick Analysis & UX Improvements (Mar 2026)

41. **Mention History search** — Added text search input to `MentionHistoryTable` that filters words by name as you type (case-insensitive substring match). Filters the data before sorting.
42. **Mention History reset sort** — "Reset sort" button appears when the sort state differs from the default (Total, descending). Click to reset. Disappears when already at default.
43. **Quick Analysis tab** — New 4th tab on the Corpus page. Paste a Kalshi mention market URL to compare live market prices against historical mention rates. Sortable comparison table (Word, Market Price, Historical Rate, Edge, Sample) with expandable per-event detail rows. Live WebSocket price updates via `useLivePrices` hook. Summary cards (Underpriced/Overpriced/Fair). Edge color-coding.
44. **Quick Prices API** — `GET /api/corpus/quick-prices?url=` — lightweight read-only endpoint that fetches event + market prices from Kalshi REST API without writing to the database. Handles URL parsing, market-level ticker fallback, and filtering to active/open markets only.
45. **Saved searches** — Quick Analysis searches are persisted in `localStorage` keyed by `kalshi-quick-analysis-{speakerId}`. Stored as `SavedSearch[]` with `{ url, eventTitle, eventTicker }`. Displayed as a clickable list — click to reload, "Remove" to delete. Auto-loads the first saved search on mount. Handles migration from older single-object format.
46. **CorpusTabNav update** — `CorpusTab` type extended to include quick analysis. Tab label: "Quick Analysis".

### Phase 6: Research/Corpus Separation & Sources System (Mar 2026)

47. **Home page filter** — `/api/events/list` now queries `research_runs` first and only returns events that have at least one research run. Corpus-imported events (no research) are excluded. Label changed from "Previous Events" to "Researched Events".
48. **Sources tab** — Renamed "Transcripts" tab to "Sources" on the research dashboard. `TranscriptsTab` replaced by `SourcesTab` which aggregates all sources from every research agent (historical transcripts, agenda sources, news articles, speaker statements, comparable events). Each source has a type tag with color-coding. `extractSources()` helper extracts sources from all 4 agent result JSONB columns. `TabId` type updated from `"transcripts"` to `"sources"`.
49. **Corpus transcript tab removed** — Removed the "Transcript Library" tab from the corpus page entirely. The corpus page now has 3 tabs (Mention History | Kalshi Markets | Quick Analysis). Corpus data comes exclusively from Kalshi settled market results, not transcripts. `CorpusTab` type updated from 4 to 3 values (`"mentions" | "markets" | "quick"`). All transcript-related state, fetching, and components removed from corpus page.
50. **Research/Corpus conceptual split** — Established clear architectural separation: Research page = tactical (AI agents analyze a specific upcoming event), Corpus page = strategic (historical Kalshi settlement data across all past events for a speaker). The two share DB tables but have completely independent data flows and UI.

### Phase 7: Research Dashboard Overhaul — Event Context & Corpus Integration (Mar 2026)

51. **EventContext component** — New `src/components/research/EventContext.tsx` replacing both `ResearchBriefing` and `ClusterView` on the Research tab. Surfaces structured event context directly from agent results (previously buried in JSONB). Two sections:
   - **Event Structure**: Format, duration + range, Q&A, live status, agent explanation, trading weight footer (Historical weight %, Current context weight %, Word count expectation). Data from `EventFormatResult`.
   - **Event Analysis**: Breaking news alert, Agenda & Purpose with advance sources, Exogenous Events sorted by relevance with speaker framing, Recent Speaker Statements, Likely Topics sorted by likelihood with evidence and related market words. Data from `AgendaResult` + `NewsCycleResult`.
   - Props: `{ eventFormat: EventFormatResult | null; agenda: AgendaResult | null; newsCycle: NewsCycleResult | null }`.

52. **WordTable component** — New `src/components/research/WordTable.tsx` replacing `WordAnalysisTable` on the Research tab. Matches the QuickAnalysis-style layout from the corpus page. Key differences from the old table:
   - Historical rates come exclusively from corpus settled market data (ground truth, 100+ event samples), NOT from the agent's web-scraped transcripts (~9 transcripts).
   - Manual speaker selector dropdown at the top — user selects which speaker's corpus data to cross-reference.
   - Multi-select category dropdown with checkboxes — filter corpus data by one or more categories. "This event" (default) shows all strikes with full corpus; specific categories show only words tracked in those categories' corpus.
   - "Refresh Markets" button to pull in newly added Kalshi strikes without re-running research.
   - "Word Analysis (N)" title with dynamic count of visible rows.
   - Merges scored + unscored rows from both research results and DB words.
   - Columns: Word, Market Price (live via WebSocket), Historical Rate (color-coded badge), Edge (rate - price), Sample (yes/total).
   - Expandable rows showing per-event detail from corpus `MentionEventDetail[]`.
   - No cluster filters, no agent confidence columns, no summary cards.
   - Props include: `wordScores`, `livePrices`, `mentionData: MentionHistoryRow[]`, `speakers`, `selectedSpeakerId`, `onSpeakerChange`, `categories`, `selectedCategories`, `onCategoriesChange`, `allWords`, `onRefreshMarkets`, `refreshing`.

53. **Research page corpus integration** — `src/app/research/[eventId]/page.tsx` now fetches corpus data:
   - Added state: `speakers`, `selectedSpeakerId`, `mentionData`, `mentionLoading`.
   - Fetches speaker list from `GET /api/corpus/speakers` on mount.
   - Fetches mention history from `GET /api/corpus/mention-history?speakerId=X` when speaker changes.
   - **Speaker selection persists to DB**: When the user selects a speaker in the WordTable dropdown, it calls `PATCH /api/events/speaker` to save `speaker_id` on the event. On page load, `selectedSpeakerId` is restored from the event's `speaker_id` field, so the selection survives page reloads.
   - Speaker selection is manual (never automatic) — the user explicitly chooses which speaker's historical data to use. The `speaker_id` on the event record is the ONLY way analytics knows which corpus data to pull.
   - Research tab render order: `RecentRecordings` → `EventContext` → `WordTable` → `AgentOutputAccordion`.

54. **News Cycle agent on both layers** — Removed the `if (input.layer === "current")` guard in `src/agents/orchestrator.ts`. The News Cycle agent now runs on both baseline and current layers. Rationale: baseline should always be as comprehensive as possible; the current layer is a refresh, not the only place for news analysis.

55. **Removed components from Research tab** — `ResearchBriefing`, `ClusterView`, and `WordAnalysisTable` are no longer rendered on the Research tab. Files are kept in the codebase (not deleted) for potential future repurposing. `ResearchBriefing` was always empty (no runs produced a briefing). `ClusterView` will return in a future iteration. `WordAnalysisTable` is superseded by `WordTable` but `WordScoresTable` (different component) is still used on the Trade Log tab.

### Phase 8: Speaker Persistence & Analytics Overhaul (Mar 2026)

56. **Migration 005: events.speaker_id** — New `speaker_id` UUID FK column on `events` table referencing `speakers(id)` with `ON DELETE SET NULL`. Indexed for query performance. This provides a robust, explicit link from any event to a speaker — never inferred, always set manually by the user.

57. **Speaker persistence API** — New `PATCH /api/events/speaker` endpoint (`src/app/api/events/speaker/route.ts`). Accepts `{ eventId, speakerId }` and updates `events.speaker_id`. Used by the research page to persist speaker selection.

58. **Research page speaker persistence** — When the user selects a speaker in the WordTable dropdown on the research page, it now:
   - Calls `PATCH /api/events/speaker` to save the selection to the event record
   - On page load, restores `selectedSpeakerId` from the event's existing `speaker_id` field
   - This means the speaker selection survives page reloads and is available to the analytics API

59. **Analytics: traded events only** — `GET /api/analytics/performance` now filters to only events with at least one trade. Uses `tradedEventIds` from the trades table and queries events with `.in("id", tradedEventIds)`. Corpus-imported events with no trades are excluded.

60. **Analytics: expandable trade detail** — Per-event rows in the analytics table are now clickable to expand/collapse. Each expanded row shows a sub-table of individual trades with columns: Word, Side (YES/NO pill), Entry Price, Contracts, Mention Rate, Edge, Result (W/L), P&L.

61. **Analytics: corpus historical mention rates** — The analytics API now computes real historical mention rates from the corpus (Kalshi settled market data), replacing the AI synthesizer's `combined_probability` estimates. Data flow:
   - For each unique `speaker_id` across traded events, fetches all series for that speaker
   - Queries all corpus events in those series, then fetches `event_results` joined with `words` (paginated in 1000-row chunks to avoid Supabase limit)
   - Groups by normalized word name (case-insensitive) to compute `mentionRate = mentioned / total`
   - Per trade: `historicalRate = rateMap.get(wordName.toLowerCase())`, `historicalEdge = historicalRate - entryPrice`
   - Frontend displays `historicalRate` and `historicalEdge` instead of `agentProbability` and `agentEdge`

62. **KXTRUMPMENTIONB series imported** — Added 57 events from the KXTRUMPMENTIONB Kalshi series to the corpus. Also added KXBUSINESSROUNDTABLE (1 event). Total corpus: 3 series, 172 events. One known issue: KXTRUMPMENTIONB-25DEC03 has 0 event_results due to a transient DB error during import (fixable by re-importing).

63. **Agent estimate vs corpus rate distinction** — Established clear terminology:
   - `agentProbability` / `agentEdge` = AI synthesizer's weighted estimate (historical + agenda + news + base_rate), stored in `word_scores` and snapshotted to `trades` at trade time. These are the model's predictions.
   - `historicalRate` / `historicalEdge` = actual corpus mention rate from Kalshi settled market data (ground truth). Computed at analytics query time from `event_results`. These are empirical frequencies.
   - Analytics now uses corpus rates (ground truth) for display. The agent estimates are still stored on trades for future calibration analysis.

### Phase 9: Multi-Speaker Series Support (Mar 2026)

64. **Migration 006: `excluded_tickers`** — Adds `excluded_tickers TEXT[] DEFAULT '{}'` column to the `series` table. Tracks event tickers the user has manually removed from a series so they are never re-imported on refresh. Applied to live Supabase database.

65. **Per-event removal from series** — New `DELETE` handler on `GET /api/corpus/series/events` (`src/app/api/corpus/series/events/route.ts`). Accepts `?eventId=<uuid>&seriesId=<uuid>`. Cascade-deletes the event and all dependent records (`event_results` → `word_scores` → `trades` → `words` → `word_clusters` → `research_runs` → `events`), appends the event's Kalshi ticker to the series `excluded_tickers` array, and recounts `events_count` / `words_count` on the series. No confirmation dialog — immediate deletion for fast bulk cleanup.

66. **Excluded tickers filtering on import** — `src/app/api/corpus/import-historical/route.ts` now reads `excluded_tickers` from the series record. After fetching all settled events from the Kalshi API, filters out any whose ticker is in the `excluded_tickers` set before processing. Uses DB-based recount for accurate `events_count` / `words_count` stats (instead of counting only newly imported events). Response includes `eventsSkipped` count.

67. **Event filter in KalshiMarketsTab** — When a series is expanded, a text filter input appears above the events list. Filters events by title (case-insensitive substring match). Shows "Showing X of Y events" counter when active. Resets on collapse or series switch. Critical for multi-speaker series like KXCONGRESSMENTION where you need to quickly identify and remove non-relevant speaker events.

68. **Per-event remove button** — Each event row in the expanded series list has a small "x" button on the right side. Clicking it immediately calls the DELETE API (no confirmation dialog) and refreshes the events list. Loading state shown during removal. This enables fast bulk cleanup of multi-speaker series.

69. **Event title hyperlinks to Kalshi** — Event titles in the expanded series view are now hyperlinked to the original Kalshi market page. URL constructed as `https://kalshi.com/markets/{series_ticker}/{event_ticker}` (both lowercased, series ticker extracted by stripping the date suffix). Opens in new tab. Falls back to plain text if `eventTicker` is missing (e.g. for cached events loaded before the API change). Enables speaker verification for events with ambiguous titles like "Mention: Oversight hearing on ICE".

70. **Multi-speaker series workflow** — Established a complete workflow for speakers who don't have their own dedicated Kalshi series (e.g. Kristie Noem with KXCONGRESSMENTION):
    1. Add the speaker on the corpus page (e.g. "Kristie Noem")
    2. Add the shared series (e.g. KXCONGRESSMENTION) under that speaker
    3. Click Refresh to import all settled events from the series
    4. Use the event filter to find non-relevant events (other speakers' sessions)
    5. Click the "x" button to remove them — their tickers go into `excluded_tickers`
    6. On future refreshes, excluded events are skipped — only new, non-excluded events are imported
    7. The mention history and quick analysis tabs then show data only for the remaining (speaker-relevant) events

    **Important limitation**: Corpus import only fetches `status: "settled"` events from Kalshi. Upcoming/active events (like a hearing happening today) won't appear in corpus imports. For upcoming events, use the home page URL input to load them for research — the corpus provides historical context, not live event loading.

### Phase 10: Corpus Data Injection into Research Pipeline (Mar 2026)

71. **Corpus data in research pipeline** — The core gap this phase addresses: corpus settlement data (ground-truth mention rates from settled Kalshi markets) was previously only used for display in the WordTable UI, never fed into the AI research agents. Now, when a speaker is selected, the research trigger API fetches the speaker's empirical mention rates and passes them through the orchestrator to the synthesizer as `corpusMentionRates`.

72. **`CorpusMentionRate` type** — New interface in `src/types/research.ts`: `{ mentionRate: number; yesCount: number; totalEvents: number }`. Added `corpusMentionRates?: Record<string, CorpusMentionRate>` to `OrchestratorInput`. Keyed by lowercase word name.

73. **Trigger API corpus fetching** — `src/app/api/research/trigger/route.ts` now accepts optional `speakerId` in the request body. When provided (or when `event.speaker_id` exists):
    - Persists `speaker_id` to the event record
    - Finds all series belonging to the speaker
    - Fetches all `event_results` (paginated in 1000-row chunks) joined with `words` and `events`
    - Filters to the speaker's series by `series_id`
    - Builds a normalized word → mention rate map
    - Passes the map into `OrchestratorInput.corpusMentionRates`

74. **Orchestrator pass-through** — `src/agents/orchestrator.ts` passes `input.corpusMentionRates` directly to the synthesizer input. No transformation — the orchestrator is a pass-through for corpus data.

75. **Synthesizer corpus awareness** — `src/agents/synthesizer.ts` updated with three changes when corpus data is present:
    - **Weight reallocation**: The "remainder" weight (after historical, agenda, news) is split 30% base_rate / 70% corpus (instead of 100% base_rate)
    - **Corpus research section**: A new `=== CORPUS MENTION HISTORY (Settled Kalshi Markets) ===` section is appended to the research data, showing per-word empirical mention rates sorted by sample size
    - **Calibration guidance**: System prompt instructs the model to use corpus mention rates as the **primary anchor** for `baseRateProbability`, only deviating with strong specific evidence. Example: "A word with a 75% corpus mention rate across 10+ events is extremely strong evidence"

76. **Home page speaker dropdown** — `src/app/page.tsx` redesigned: removed the free-text Speaker input and Event Type dropdown. Added a single "Speaker" dropdown that fetches speakers from `/api/corpus/speakers`. When the user clicks "Start Research":
    - If a speaker is selected, persists the selection to the event via `PATCH /api/events/speaker`
    - Navigates to the research page, where the trigger API picks up the `speaker_id` and fetches corpus data
    - Event type is no longer user-configured — the agents determine it from web search

77. **EventHeader speaker dropdown** — `src/components/research/EventHeader.tsx` now includes a corpus speaker dropdown next to the research trigger button. Props extended with `speakers`, `selectedSpeakerId`, `onSpeakerChange`. Allows changing the speaker selection on the research dashboard (e.g., before triggering a follow-up research run). Disabled while research is running.

78. **Research page speaker wiring** — `src/app/research/[eventId]/page.tsx` passes speaker data to EventHeader. The `triggerResearch` function sends `speakerId: selectedSpeakerId || undefined` in the request body. The `onSpeakerChange` callback persists changes via `PATCH /api/events/speaker`.

79. **End-to-end speaker flow** — Established the recommended flow: Select speaker on home page → Load event → Start Research → speaker persists to event → trigger API fetches corpus data → synthesizer uses empirical rates → WordTable auto-loads corpus for that speaker → analytics gets speaker linkage for historical rate comparison. The speaker dropdown on EventHeader allows mid-session changes without going back to the home page.

### Phase 11: Price Fix, Trade Editing, Analytics Improvements (Mar 2026)

80. **Market price fix: bid → ask** — All market price displays and edge calculations were incorrectly using `yes_bid_dollars` (the highest bid — what buyers are offering) instead of `yes_ask_dollars` (the lowest ask — what you'd actually pay to buy YES). This caused massively overstated edge values. For example, "Midnight Hammer" showed 10¢ (bid) instead of 85¢ (ask), making edge appear as +90% when it was really ~+15%. Fixed in 6 files:
    - `src/components/research/WordAnalysisTable.tsx` — `getLivePrice()` now returns `yesAsk` instead of `yesBid`
    - `src/components/research/WordScoresTable.tsx` — same fix
    - `src/components/research/WordTable.tsx` — `currentPrice` now uses `live.yesAsk`
    - `src/components/corpus/QuickAnalysisTab.tsx` — `currentPrice` now uses `live.yesAsk` with fallback to `w.yesAsk`
    - `src/app/api/events/load/route.ts` — `yesPrice` now uses `yes_ask_dollars` (initial load)
    - `src/app/api/research/trigger/route.ts` — `yesPrice` now uses `yes_ask_dollars` (research pipeline)

81. **Analytics: removed chart sections** — Removed Calibration (Agent Probability vs Actual), Edge vs P&L, and P&L by Event chart sections from the analytics page. All associated Recharts imports, interfaces (`CalibrationBucket`, `EdgeBucket`), state variables (`calibrationData`, `edgeAnalysis`), data transformations, and the `DarkTooltip` component were cleaned up. The analytics page now shows only the summary stats cards and per-event performance table.

82. **Analytics: EV card** — Added an "EV" (Expected Value) summary card to the analytics page, positioned after Total P&L. Calculates EV per trade as `totalPnlCents / totalTrades` (equivalent to `(winRate × avgWin) - (lossRate × avgLoss)`). Displayed in dollars, color-coded green/red. Grid changed from 5 to 6 columns to accommodate.

83. **Trade editing** — New `PATCH /api/trades/[tradeId]` endpoint (`src/app/api/trades/[tradeId]/route.ts`). Accepts `{ entryPrice?, contracts? }`. Updates the trade record, recalculates `total_cost_cents`, and if the trade is already settled, recalculates `pnl_cents` using the same formula from `settlement.ts`. `LoggedTrades.tsx` updated with inline editing: click Entry or Qty to edit → input fields appear → Enter to save, Escape to cancel, or use checkmark/X buttons. On save, calls the PATCH endpoint and triggers a parent refetch via new `onTradeUpdated` callback prop. This allows correcting entry prices and quantities even after settlement, with P&L automatically recalculated.

84. **Analytics: mention rate sample counts** — The per-event trade detail now shows mention rates with sample counts (e.g., `29% (10/34)` instead of just `29%`). The analytics API (`/api/analytics/performance`) updated to return `mentionYes` and `mentionTotal` alongside `historicalRate`. The `speakerMentionRates` map changed from `Map<string, number>` to `Map<string, { rate, yes, total }>` to carry the counts through.

85. **Home page: right-clickable events** — "Researched Events" list items changed from `<button>` with `onClick`/`router.push()` to Next.js `<Link>` with `href`. Events can now be right-clicked to open in a new tab.

### Phase 12: Hybrid Model Support & Retry Logic (Mar 2026)

86. **Model preset system** — New `ModelPreset` type (`"opus" | "hybrid" | "sonnet" | "haiku"`) in `src/types/research.ts`. Added `modelPreset?: ModelPreset` to `OrchestratorInput`. The orchestrator's `getAgentModels(preset)` function maps presets to per-agent model assignments. Three model constants: `OPUS = "claude-opus-4-6"`, `SONNET = "claude-sonnet-4-5-20250929"`, `HAIKU = "claude-haiku-4-5-20251001"`.

87. **Per-model pricing** — `src/lib/claude-client.ts` updated from hardcoded Opus 4.0 pricing ($15/$75 per MTok) to a `MODEL_PRICING` lookup table with accurate per-model rates: Opus 4.6 ($5/$25), Sonnet 4.5 ($3/$15), Haiku 4.5 ($1/$5). Default model changed from `claude-opus-4-0` to `claude-sonnet-4-5-20250929`.

88. **Model parameter pass-through** — All 7 agent files (`historical.ts`, `agenda.ts`, `news-cycle.ts`, `event-format.ts`, `market-analysis.ts`, `clustering.ts`, `synthesizer.ts`) updated: added `model?: string` to each agent's input interface, passed through to `callAgentForJson()`. `AgentCallOptions` in `claude-client.ts` extended with optional `model` field.

89. **Orchestrator model routing** — `src/agents/orchestrator.ts` added `getAgentModels()` function that returns an `AgentModelMap` (type `Record<AgentName, string>`) based on the selected preset. Hybrid preset uses Opus for synthesizer, Sonnet for research-heavy agents, Haiku for structural agents. Each agent call receives `model: models.<agentName>`.

90. **Home page model dropdown** — `src/app/page.tsx` added a model preset dropdown next to the speaker selector. Four options with descriptions. Default: Sonnet (All). Selected preset passed as `?modelPreset=xxx` query parameter when navigating to the research page.

91. **Research page model flow** — `src/app/research/[eventId]/page.tsx` reads `modelPreset` from `useSearchParams()` and includes it in the `POST /api/research/trigger` request body.

92. **Trigger API model handling** — `src/app/api/research/trigger/route.ts` accepts `modelPreset` from request body, validates against `["opus", "hybrid", "sonnet", "haiku"]` (defaults to `"sonnet"`), saves to `research_runs.model_used` on insert, and passes to the orchestrator input.

93. **Model tag display** — `src/components/research/RunHistory.tsx` shows a purple badge next to the status badge on each research run, displaying the model preset label (e.g., "Sonnet (All)", "Hybrid"). Uses `MODEL_PRESET_LABELS` map exported from `src/types/components.ts`. `ResearchRun` interface updated with `model_used: string | null` field.

94. **Retry with exponential backoff** — `src/lib/claude-client.ts` added retry logic wrapping the `.stream().finalMessage()` call. `MAX_RETRIES = 4`, `BASE_DELAY_MS = 3000` (delays: 3s, 6s, 12s, 24s). `isRetryableError()` catches: Anthropic `APIError` status 429/500/502/503/529, `APIConnectionError` (status undefined), and any error string containing "overloaded", "rate_limit", "529", or "connection". Detailed logging: `[claude-client] API call failed (model=..., attempt X/Y, retryable=...): ...`.

95. **Phase 1 failure logging** — `src/agents/orchestrator.ts` now logs Phase 1 agent failures with `[orchestrator] Phase 1 agent failed:` for easier debugging when individual agents fail within `Promise.allSettled()`.

### Phase 13: Fly.io Deployment (Mar 2026)

96. **Fly.io deployment** — Deployed the app to Fly.io in the Singapore (`sin`) region. Created `Dockerfile` (multi-stage Node 22 Alpine build), `.dockerignore`, and `fly.toml`. App config: shared-cpu-1x, 512MB RAM, auto-stop when idle, auto-start on request, health check on `/` every 30s. Live at `https://kalshi-research.fly.dev/`.

97. **Standalone Next.js output** — Added `output: "standalone"` to `next.config.ts`. Required for Docker-based deployments — produces a self-contained build with `node server.js` entry point, minimal `node_modules`, and no dependency on the full `node_modules` tree.

98. **Lazy Supabase client initialization** — `src/lib/supabase.ts` rewritten from module-level `createClient()` to a lazy `getServerSupabase()` function. The original code called `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)` at import time, which crashed during Docker builds when env vars aren't available (Next.js collects page data during `next build`). All 23 consuming files already imported `getServerSupabase` — the unused `export const supabase` and `getSupabase()` were removed entirely.

99. **SSE keepalive for research trigger** — `src/app/api/research/trigger/route.ts` now sends `: keepalive\n\n` SSE comments every 15 seconds on the progress stream. Fixes "network error" during the synthesizer step — the synthesizer API call takes 60-120+ seconds (32K max tokens), during which no progress events were sent, causing Fly.io's proxy to kill the idle connection after ~60s. The keepalive is a standard SSE comment (colon-prefixed) that `EventSource` clients silently ignore. Interval is cleared on stream close.

100. **Fly secrets configuration** — All 6 environment variables set as Fly secrets: `KALSHI_API_KEY`, `KALSHI_PRIVATE_KEY` (raw PEM content, not file path), `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Secrets are injected at runtime, not baked into the Docker image.

### Phase 14: Event Date Fix (Mar 2026)

101. **Event date resolution fix** — `event_date` was previously set from `kalshiMarkets[0]?.close_time`, which is the market's scheduled trading close time. When events are loaded before they occur (the normal use case), `close_time` is a future date — e.g., an event on Mar 3 would show Mar 17 because that's when the market closes for settlement. The fix parses the actual event date from the Kalshi event's `sub_title` field (e.g. "Mar 3, 2026" or "On Feb 27, 2026"), stripping any "On " prefix before parsing. Falls back to `strike_date` (from the Kalshi OpenAPI spec — "The specific date this event is based on"), then to market `close_time`. Fixed in two files:
    - `src/app/api/events/load/route.ts` — new events loaded from the home page
    - `src/app/api/corpus/import-historical/route.ts` — corpus event imports

102. **KalshiEvent type updates** — Added `sub_title?: string` and `strike_date?: string | null` to both `KalshiEvent` interfaces:
    - `src/types/kalshi.ts` (shared type)
    - `src/app/api/corpus/import-historical/route.ts` (local type)

103. **Existing event date corrections** — Manually updated 3 traded events in the database with correct dates via Supabase Management API:
    - `KXTRUMPMENTIONB-26MAR17`: `2026-03-17` → `2026-03-03` (Trump Bilateral Meeting with Germany)
    - `KXSECPRESSMENTION-26MAR15`: `2026-03-15` → `2026-03-04` (Karoline Leavitt press briefing)
    - `KXTRUMPMENTIONB-26FEB28`: `2026-02-28` → `2026-02-27` (Trump remarks in Corpus Christi)

    **Note**: All other corpus-imported events may also have incorrect dates (set from `close_time` during their original import). Re-importing each series via "Refresh" on the corpus page will fix them, as the import now uses the corrected date resolution logic.

### Phase 15: Corpus Categories (Mar 2026)

104. **Migration 007: corpus categories** — New `category TEXT` column on `events` table with index (`idx_events_category`). New `corpus_category TEXT` column on `research_runs` table. Applied to live Supabase database via Management API. Categories are free-text strings (no separate table) — a category exists as long as at least one event has it assigned.

105. **Categories API** — New `src/app/api/corpus/categories/route.ts` with four HTTP methods:
    - `GET ?speakerId=` — returns distinct `category` values from all events in the speaker's series (via series linkage), sorted alphabetically
    - `PATCH { eventIds, category }` — assigns a category (or `null`) to one or more events. Used by the event row dropdown for immediate assignment.
    - `PUT { speakerId, oldName, newName }` — global rename. Finds all events in the speaker's series with `category = oldName`, updates to `newName.trim()`. Returns update count.
    - `DELETE ?speakerId=&name=` — global delete. Finds all events in the speaker's series with `category = name`, sets `category = null`. Returns cleared count.

106. **Category management panel** — `src/components/corpus/KalshiMarketsTab.tsx` rewritten with a side-by-side layout: "Add Kalshi Series" on the left, "Corpus Categories" panel on the right. The categories panel provides full CRUD:
    - **Create**: text input + "Create" button. Category appears in the local list immediately and in event dropdowns.
    - **Rename**: click "Rename" → inline input → "Save". Calls PUT endpoint, updates all events globally. Shows count of events updated.
    - **Delete**: click "Delete" → confirm dialog → calls DELETE endpoint. Clears category from all events. Shows count of events cleared.
    - **Event assignment**: simple `<select>` dropdown on each event row in the expanded series view. Highlighted in indigo when a category is assigned. Changes are immediate via PATCH endpoint.
    - **Removed**: old inline text-editor approach (editingCategoryEventId, categoryInput, knownCategories states) replaced entirely with the panel + dropdown pattern.

107. **Mention history category filter** — `src/app/api/corpus/mention-history/route.ts` accepts optional `?category=` query parameter. Added `category` to the events join select. In the aggregation loop, skips events where `events.category !== category` when the filter is active. The corpus page (`src/app/corpus/page.tsx`) shows a category filter dropdown on the Mention History tab, with state management for `categories`, `selectedCategory`, and `fetchCategories`.

108. **Research pipeline category support** — `src/app/api/research/trigger/route.ts` accepts optional `corpusCategory` in the request body. When provided:
    - Filters corpus `event_results` by checking `events.category === corpusCategory` before building `corpusMentionRates`
    - Stores `corpus_category` on the `research_runs` record for tracking
    - The synthesizer only sees mention rates from events matching the selected category

109. **Home page category dropdown** — `src/app/page.tsx` updated: fetches categories when a speaker is selected, shows a "Corpus Category" dropdown alongside the speaker dropdown. Selected category is passed as `?corpusCategory=xxx` URL parameter when navigating to the research page. Defaults to "All categories" (no filter).

110. **Research page category integration** — `src/app/research/[eventId]/page.tsx` reads `corpusCategory` from URL search params, fetches categories for the selected speaker, manages `categories` and `selectedCategory` state. Passes category to both the mention-history fetch and the research trigger API. The `WordTable` component receives `categories`, `selectedCategory`, and `onCategoryChange` as optional props and shows a category dropdown next to the speaker selector.

111. **Series events API: category field** — `src/app/api/corpus/series/events/route.ts` updated to include `category` in the events select and response. Each event in the response now has `category: string | null`.

### Phase 16: Multi-Category Support, Refresh Markets & WordTable Enhancements (Mar 2026)

112. **Categories API: event counts** — `GET /api/corpus/categories` now returns `{ name: string, count: number }[]` instead of `string[]`. Each category includes the count of events assigned to it. The corpus page and research page both extract `.name` from the new format. The KalshiMarketsTab shows event counts in brackets next to each category name (e.g. "Sports (12)").

113. **Multi-category mention history** — `src/app/api/corpus/mention-history/route.ts` updated from single `?category=` filter to comma-separated multi-category support. Builds a `Set` from the comma-split category param and checks `categorySet.has(eventData.category)` instead of strict equality. This allows combining multiple categories (e.g. `?category=Sports,Rally`) to get aggregate mention rates across event types.

114. **Multi-category research trigger** — `src/app/api/research/trigger/route.ts` now accepts `corpusCategories` (string array) alongside the existing `corpusCategory` (string, backwards-compatible). `corpusCategories` takes precedence. When categories are provided, filters corpus events using `effectiveCategories.includes(row.events.category)`. Stores comma-separated categories on `research_runs.corpus_category`.

115. **Research page multi-category state** — `src/app/research/[eventId]/page.tsx` changed from `corpusCategory` (string) to `corpusCategories` (string array). The mention-history fetch sends comma-separated categories. The research trigger sends `corpusCategories` array. WebSocket `marketTickers` now includes tickers from both `wordScores` and `words` (to support live prices on unscored words).

116. **Refresh Markets API** — New `POST /api/events/refresh-markets` endpoint (`src/app/api/events/refresh-markets/route.ts`). Accepts `{ eventId }`. Looks up the event's Kalshi ticker, fetches current markets from the Kalshi API, and upserts any new active/open words not already in the DB. Returns `{ newWords, totalWords, words }`. Enables pulling in newly added Kalshi strikes without re-running research.

117. **WordTable: Refresh Markets button** — Added "Refresh Markets" button next to the "Word Analysis" title. Calls the refresh-markets API and reloads the page data. Shows a spinner while refreshing. Newly added words appear as unscored rows with market prices and corpus data (if available).

118. **WordTable: merged scored + unscored rows** — The `rows` memo now merges `wordScores` (from research run) with `allWords` (all DB words for the event). Unscored words (from `allWords` but not in `wordScores`) are deduplicated by market ticker and appear with live prices and corpus data but no agent probabilities. This ensures newly added strikes from "Refresh Markets" appear in the table immediately.

119. **WordTable: multi-select category dropdown with checkboxes** — Replaced the initial pill/chip toggle UI with a proper dropdown menu containing checkbox inputs for each category. Two modes:
    - **"This event" (default)**: No categories selected. Full corpus data, all event strikes shown, no filtering.
    - **Specific categories**: Only shows event strikes that exist as words in the selected categories' corpus. Filtering uses a `corpusWords` Set built from `mentionData` for O(1) lookup. Words with 0% rate still show (they exist in the corpus).
    - Dropdown label: "This event" → "Sports" (1 selected) → "2 selected" (multiple). "Reset to this event" clears all.

120. **WordTable: word count in title** — Title changed from "Word Analysis" to "Word Analysis (N)" where N is the count of currently visible (filtered + sorted) rows. Updates dynamically when switching between "This event" and category filters.

121. **KalshiMarketsTab: category event counts** — Category names in the Kalshi Markets tab now show event counts in brackets (e.g. "Sports (12)"). Categories state lifted from local to shared between corpus tabs. The categories prop changed from `string[]` to `CategoryWithCount[]` (`{ name: string, count: number }`). An `onCategoriesChanged` callback notifies the parent when assignments change so counts refresh.

122. **Corpus page: always-visible category dropdown** — The category dropdown on the Mention History tab is now always visible when a speaker is selected (removed the `categories.length > 0` condition). This allows seeing the dropdown even before any categories have events assigned, since locally created categories appear immediately.

### Phase 17: Corpus-Category-Aware Synthesizer + Agent Prompt Audit (Mar 2026)

123. **Home page category API bug fix** — `src/app/page.tsx` was setting categories state directly from the API response (`data.categories`), but the `GET /api/corpus/categories` endpoint returns `{ name: string, count: number }[]` objects, not strings. When React tried to render `{cat}` in `<option>` elements, it threw "Objects are not valid as a React child (found: object with keys {name, count})". Fixed by normalizing the API response with `.map(c => typeof c === "string" ? c : c.name)` — same pattern already used on the research page.

124. **`CorpusEventDetail` type** — New interface in `src/types/research.ts`: `{ eventTitle: string; eventDate: string | null; eventTicker: string; wasMentioned: boolean; category: string | null }`. Represents a single event's result for a word in the corpus.

125. **`CorpusMentionRate` enriched with per-event detail** — The existing `CorpusMentionRate` interface in `src/types/research.ts` now includes `events: CorpusEventDetail[]` — the full per-event breakdown showing exactly which events mentioned (or didn't mention) each word, with event title, date, ticker, and category. Previously this data was fetched for the frontend `MentionHistoryTable` but discarded in the research pipeline — now it flows through to the synthesizer.

126. **Dual corpus datasets in OrchestratorInput** — `src/types/research.ts` `OrchestratorInput` extended with three new fields:
    - `corpusMentionRatesAll?: Record<string, CorpusMentionRate>` — unfiltered corpus data across all event types for the speaker
    - `corpusCategories?: string[]` — which categories were selected for filtering
    - `corpusTotalEvents?: number` — count of distinct events across all categories
    - The existing `corpusMentionRates` field now contains category-filtered data (when categories selected) or identical data to `corpusMentionRatesAll` (when no categories selected)

127. **Trigger API: dual corpus dataset building** — `src/app/api/research/trigger/route.ts` rewritten corpus fetching logic:
    - Expanded Supabase query to fetch `events.title`, `events.kalshi_event_ticker`, `events.event_date`, `events.category` (previously only fetched `series_id` and `category`)
    - Introduced `buildCorpusDataset()` helper function that builds a `Record<string, CorpusMentionRate>` with full per-event detail from a set of query results
    - Builds two datasets from the same query: `corpusMentionRatesAll` (all speaker events) and `corpusMentionRates` (filtered by selected categories, or same as all if no categories)
    - Computes `corpusTotalEvents` as the count of distinct event tickers across all speaker events
    - Passes all four fields (`corpusMentionRates`, `corpusMentionRatesAll`, `corpusCategories`, `corpusTotalEvents`) to the orchestrator input
    - Pagination (1000-row chunks) preserved from previous implementation

128. **Orchestrator corpus pass-through** — `src/agents/orchestrator.ts` updated to pass `corpusMentionRatesAll`, `corpusCategories`, and `corpusTotalEvents` through to the synthesizer call alongside the existing `corpusMentionRates`. No transformation — pure pass-through.

129. **Synthesizer: corpus-category-aware prompt** — `src/agents/synthesizer.ts` major rewrite of corpus handling:
    - `SynthesizerInput` extended with `corpusMentionRatesAll`, `corpusCategories`, `corpusTotalEvents`
    - **System prompt**: When categories are selected, the prompt explains the two-dataset structure ("FILTERED CORPUS" and "FULL CORPUS"), instructs the model to use filtered rates as primary anchor, compare against full rates for divergences, check recency trends using per-event detail, and consider sample size (3 filtered events vs 50 overall). When no categories selected, explains that data mixes all event formats and directs the model to use per-event detail to reason about comparability.
    - **Corpus data sections**: New `formatCorpusDataset()` helper formats each dataset with per-word rates + per-event breakdown. Each word shows: rate, sample fraction, then indented lines for each event (YES/NO — event title (date) [category]). Events sorted by date descending.
    - When categories selected: two labeled sections (`=== CORPUS — FILTERED TO [Sports] (8 events) ===` and `=== CORPUS — ALL EVENT TYPES (114 total events) ===`)
    - When no categories: single section (`=== CORPUS MENTION HISTORY — ALL EVENT TYPES (114 total events) ===`)
    - Filtered section header dynamically computes event count from distinct event tickers in the filtered dataset

130. **Agenda agent: speaker-agnostic prompt** — `src/agents/agenda.ts` removed hardcoded "Truth Social for Trump, X/Twitter for others" from the search instructions. Replaced with generic "The speaker's recent social media posts and public statements that hint at what they plan to discuss". This makes the agent work correctly for any speaker without platform-specific assumptions.

131. **News-cycle agent: contextual lookback + speaker-agnostic** — `src/agents/news-cycle.ts` two changes:
    - Removed hardcoded platform references. Changed "Top news stories in the last 72 hours" to "Top recent news stories... focus on the last 24 hours for imminent events, expand to 72+ hours for events further out". Changed "recent public statements, interviews, and social media posts" to add "across all platforms".
    - Made the user message lookback window contextual: "Focus on the most recent news and statements — prioritize the last 24-72 hours, scaling the window based on how soon the event is" (previously fixed at "last 72 hours").

132. **Home page: multi-select category dropdown** — `src/app/page.tsx` replaced the single `<select>` category dropdown with a multi-select checkbox dropdown matching the same pattern used in `WordTable.tsx`:
    - State changed from `selectedCategory: string` to `selectedCategories: string[]` with `catDropdownOpen` boolean
    - Dropdown button shows "All categories" (none selected), category name (1 selected), or "N selected" (multiple)
    - Checkbox labels for each category, "Reset to all categories" button when selections active
    - Fixed overlay pattern for closing dropdown on outside click
    - Passes `corpusCategories=Sports,Rally` (comma-separated) as URL param instead of `corpusCategory=Sports`

133. **Research page: multi-category URL param** — `src/app/research/[eventId]/page.tsx` updated to read `corpusCategories` (comma-separated) from URL search params, with backwards-compatible fallback to `corpusCategory` (singular). Splits the param on commas to initialize the `corpusCategories` state array.

### Phase 18: Recent Recordings Agent + Corpus "All" Control (Mar 2026)

134. **Recent Recordings agent** — New `src/agents/recent-recordings.ts`. Uses `callAgentForJson` with `enableWebSearch: true` and `maxTokens: 4000`. Takes `speaker`, `eventTitle`, `eventDate`, `eventType`, and optional `model` as input. Prompts Claude to search for the 3 most recent video recordings of events similar to the upcoming one, prioritizing YouTube and C-SPAN. Returns `RecentRecordingsResult` with `recordings[]` (title, date, url, platform, durationMinutes, description), `selectionRationale`, and `searchQueries[]`. The agent explains why each recording was selected and how watching them will help prepare for the upcoming event.

135. **`RecentRecordingsResult` type** — New interface in `src/types/research.ts`. `AgentName` union type updated to include `"recent_recordings"` between `"market_analysis"` and `"clustering"`.

136. **Migration 008: `recent_recordings_result`** — New `supabase/migrations/008_recent_recordings.sql` adds `recent_recordings_result JSONB` column to `research_runs` table. Applied to live Supabase database via Management API.

137. **Orchestrator: recent recordings wiring** — `src/agents/orchestrator.ts` updated:
    - Added import for `runRecentRecordingsAgent` and `RecentRecordingsResult`
    - Added `recent_recordings` to all 4 model preset maps in `getAgentModels()`: Opus→OPUS, Hybrid→HAIKU, Sonnet→SONNET, Haiku→HAIKU
    - Added agent to Phase 1 parallel array (6 agents now, was 5) — runs between market_analysis and news_cycle
    - Added fallback result extraction: `const recentRecordingsResult = (agentResults.recent_recordings as RecentRecordingsResult) ?? { recordings: [], selectionRationale: "Recent recordings search failed", searchQueries: [] }`
    - Added `recent_recordings_result: recentRecordingsResult` to Phase 1 DB save
    - `totalAgents` in SSE "started" event updated from 6/7 to 7/8 (baseline/current)

138. **`RecentRecordings.tsx` component** — New `src/components/research/RecentRecordings.tsx`. Displays 3 clickable video cards with:
    - Platform icon (▶ for YouTube, 📺 for C-SPAN, 🔗 for others)
    - Video title (clickable, opens in new tab, turns blue on hover)
    - Date, platform badge, duration (if available)
    - Description (2-line clamp)
    - External link icon
    - Returns null if no recordings data or empty recordings array

139. **`AgentOutputAccordion.tsx` updated** — Added `{ key: "recentRecordings", label: "Recent Recordings Agent" }` to the `agentPanels` array between `marketAnalysis` and `clusters`. Now has 8 panels total. The agent's selection rationale and search queries are visible in this accordion panel.

140. **Research page integration** — `src/app/research/[eventId]/page.tsx` updated:
    - Added imports for `RecentRecordingsResult` and `RecentRecordings`
    - Added derived value: `const recentRecordingsResult = (latestCompletedRun?.recent_recordings_result as RecentRecordingsResult) ?? null`
    - Rendered `<RecentRecordings recordings={recentRecordingsResult} />` between EventContext and WordTable on the Research tab

141. **API response updated** — `src/app/api/research/[eventId]/route.ts` added `recentRecordings: latestCompletedRun.recent_recordings_result` to the `researchSummary` object in the GET response.

142. **`ResearchRun` type updated** — `src/types/components.ts` added `recent_recordings_result: unknown | null` to the `ResearchRun` interface. `ResearchSummary` interface updated to include `recentRecordings: unknown`.

143. **Explicit "All" corpus checkbox** — `src/app/page.tsx` home page category dropdown updated:
    - Added permanent "All" checkbox at the top of the dropdown, separated from real categories by a `<hr>` divider
    - Uses `__all__` sentinel value in the `selectedCategories` state array
    - The `__all__` sentinel controls whether `corpusMentionRatesAll` (full unfiltered corpus) is passed to agents — previously always included, now opt-in
    - Button label logic: "No corpus" (nothing selected), "All" (only __all__), "Sports + All" (both), "Sports" (category only)
    - Changed "Reset to all categories" text to "Clear all"

144. **Trigger API `__all__` handling** — `src/app/api/research/trigger/route.ts` updated:
    - Extracts `__all__` from `corpusCategories`: `const includeAllCorpus = rawCategories.includes("__all__")`, `const effectiveCategories = rawCategories.filter(c => c !== "__all__")`
    - `corpusMentionRatesAll` only populated when `includeAllCorpus` is true (user explicitly ticked "All")
    - `corpusMentionRates` uses category-filtered data when `effectiveCategories.length > 0`, or the full dataset when only "All" is ticked (no specific categories)
    - `effectiveCategories` (without `__all__`) stored on `research_runs.corpus_category`

145. **Research page `__all__` stripping** — `src/app/research/[eventId]/page.tsx` updated:
    - `corpusCategories` state initialization strips `__all__` from URL params: `.filter((c) => c !== "__all__")`
    - Mention-history API fetch strips `__all__` from categories: `const realCategories = corpusCategories.filter((c) => c !== "__all__")`
    - This prevents `__all__` from leaking into the WordTable display filter or the mention-history API

146. **Synthesizer crash fix** — `src/agents/synthesizer.ts` fixed a crash when using the Haiku preset: `input.historicalResult.transcriptsFound.length` → `input.historicalResult.transcriptsFound?.length ?? 0`. Haiku sometimes returns an unexpected shape where `transcriptsFound` is undefined, causing "Cannot read properties of undefined (reading 'length')".

### Phase 19: Pipeline Robustness & Output Quality (Mar 2026)

147. **Orchestrator null safety for LLM outputs** — `src/agents/orchestrator.ts` fixed a crash where the pipeline would fail with `"Cannot read properties of undefined (reading 'length')"` when the synthesizer (especially Haiku) returned JSON missing the `wordScores` array. Root cause: TypeScript target is `ES2017`, so `for...of` loops are transpiled to classic `for` loops that access `.length` on the iterable. When `synthesisResult.data.wordScores` was `undefined`, the transpiled code tried `undefined.length`. Three fixes:
    - `const wordScores = synthesisResult.data.wordScores ?? []` — safe extraction before the for-of loop (line 416)
    - `clusteringResult.data.clusters ?? []` — same pattern for the clusters for-of loop (line 389)
    - Return value uses the safe `wordScores` variable and `clusters ?? []` fallback (lines 476-477)
    - `console.log` line updated to use the safe `wordScores.length` instead of `synthesisResult.data.wordScores.length` (line 449)

148. **Trigger route null safety** — `src/app/api/research/trigger/route.ts` fixed potential crash on the SSE completion event. `result.wordScores.length` and `result.clusters.length` changed to `result.wordScores?.length ?? 0` and `result.clusters?.length ?? 0` (lines 313-314). Without this, if the orchestrator returned undefined arrays (possible when LLM outputs are malformed), the SSE event send would throw after the pipeline had already saved results to the DB.

149. **Web search citation tag stripping** — `src/lib/claude-client.ts` added `finalTextContent.replace(/<\/?cite[^>]*>/g, "")` after extracting text content from Claude's response (line 197). Claude's `web_search_20250305` server-side tool embeds `<cite index="1-2,3-4">...</cite>` citation markers in its text responses. Without stripping, these raw HTML tags appear in agent JSON outputs and render as visible markup in the UI (EventContext, AgentOutputAccordion, etc.). The regex removes both opening `<cite ...>` and closing `</cite>` tags globally. Applied in `callAgent()` so all 5 web-search-enabled agents benefit automatically (historical, agenda, news-cycle, event-format, recent-recordings). The 3 non-web-search agents (market-analysis, clustering, synthesizer) are unaffected since they never produce citation tags.

150. **Recent recordings deduplication** — `src/agents/recent-recordings.ts` updated the prompt's IMPORTANT section to explicitly instruct the agent to deduplicate recordings. Added: "Each recording MUST be a DIFFERENT event (different date or different occasion). Do NOT return the same event twice with slightly different titles or descriptions. Deduplicate by checking dates and event details." Previously, web search results for similar queries (e.g., "Trump roundtable C-SPAN") could return the same event from different pages, and the agent would treat them as separate recordings with slightly different descriptions.

### Phase 20: Trade Deletion (Mar 2026)

151. **Trade deletion API** — `src/app/api/trades/[tradeId]/route.ts` added `DELETE` handler alongside existing `PATCH`. Accepts no body. Deletes the trade record from `trades` table via `supabase.from("trades").delete().eq("id", tradeId)`. Returns `{ success: true }` on success, or `{ error: "Failed to delete trade: ..." }` with status 500 on DB error.

152. **Trade deletion UI** — `src/components/research/LoggedTrades.tsx` updated:
    - Added `deletingId` state to track which trade is being deleted (shows "..." loading indicator)
    - Added `deleteTrade(tradeId)` async function: shows `confirm("Delete this trade?")` dialog, sends `DELETE /api/trades/${tradeId}`, calls `onTradeUpdated?.()` on success to trigger parent refetch
    - Each trade row now shows a subtle red "✕" button (`text-red-500/60`, brightens to `text-red-400` on hover) in the last column when not in edit mode
    - When in edit mode, the save/cancel buttons replace the delete button (same column, mutually exclusive display)
    - The action column uses a `flex` container to consistently align buttons
