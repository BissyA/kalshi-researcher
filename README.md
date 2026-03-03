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
- [API Routes](#api-routes)
- [Frontend Pages](#frontend-pages)
- [Component Architecture](#component-architecture)
- [Sources System](#sources-system)
- [Live Prices (WebSocket)](#live-prices-websocket)
- [Trade Logging & Settlement](#trade-logging--settlement)
- [How to Run](#how-to-run)
- [Two-Layer Research Model](#two-layer-research-model)
- [Relationship to Speed Trader](#relationship-to-speed-trader)
- [Current Status & Known Issues](#current-status--known-issues)
- [Debugging Notes](#debugging-notes)
- [Cost Estimates](#cost-estimates)
- [Changelog](#changelog)

---

## Overview

Kalshi offers "mention markets" where you bet on whether a speaker will say a specific word during an event. For example: "Will Trump say 'border' during his Address to Congress?" Each word has a YES/NO contract with live pricing.

This tool:

1. **Loads** a Kalshi mention market event by URL or ticker
2. **Runs 7 AI research agents** (powered by Claude Opus 4) to analyze historical patterns, current news, agenda items, market pricing, and corpus settlement data (ground truth mention rates from Kalshi)
3. **Produces per-word probability estimates** with reasoning
4. **Surfaces structured event context** — event format, duration, Q&A expectations, agenda analysis, exogenous events, likely topics, and recent speaker statements extracted from agent results
5. **Displays corpus-integrated word analysis** — live market prices cross-referenced against historical mention rates from Kalshi settled market data (ground truth), with manual speaker selection, expandable per-event detail, and edge detection
6. **Identifies mispriced contracts** where historical mention rate diverges from market price
7. **Streams live prices** via WebSocket from Kalshi
8. **Logs trades** with inline forms on the research dashboard
9. **Auto-settles trades** by polling Kalshi's market resolution API
10. **Tracks performance** with Recharts charts on the analytics page
11. **Tracks word mention rates** across all historical Kalshi events per speaker via the Corpus page
12. **Manages Kalshi market series** — search and add series from the Kalshi API, import historical settled events, refresh data per-series
13. **Quick Analysis** — paste a Kalshi mention market URL to instantly compare live market prices against historical mention rates, with WebSocket live price updates, saved search persistence, and edge detection

The research happens in two layers:
- **Baseline layer** (comprehensive): historical frequency, event format analysis, agenda research, news cycle analysis, market structure, corpus settlement data (when speaker is selected)
- **Current layer** (refresh): re-runs all agents with latest data closer to the event. Reuses baseline results as context.

**Both layers run all 7 agents.** The only difference is that current layer loads existing baseline results as additional context via `existingResearch`.

### What has been tested end-to-end
- One successful "current" layer research run (Trump Corpus Christi speech, Feb 28 2026)
- Trade logging from the research dashboard
- Settlement checking via Kalshi API
- Analytics page rendering with Recharts charts
- Live WebSocket price streaming
- Dashboard redesign with tabbed layout (Research | Sources | Trade Log)
- EventContext component: structured event format, agenda, news cycle, and likely topics from agent results
- WordTable component: corpus-integrated word analysis with manual speaker selection, historical rates from settled Kalshi markets, expandable per-event detail
- Corpus page: speaker management, series import (KXTRUMPMENTION — 114 events, KXTRUMPMENTIONB — 57 events, KXBUSINESSROUNDTABLE — 1 event), mention history with expandable per-event detail
- Historical data import from Kalshi API with pagination (handles 100+ events)
- Speaker persistence: select speaker in research page WordTable → saves to event record → analytics pulls corpus historical rates for that speaker
- Analytics expandable trade detail with corpus-based mention rates and edge calculations
- Quick Analysis tab: paste URL → live price vs historical rate comparison with WebSocket updates and saved searches
- News Cycle agent runs on both baseline and current layers
- Corpus data injection: selected speaker's settled Kalshi mention rates fed into synthesizer as empirical base rates
- Home page speaker selection flows through to research pipeline and analytics

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript (strict mode) | 5.x |
| AI/LLM | Claude Opus 4 via `@anthropic-ai/sdk` | ^0.78.0 |
| Database | Supabase (PostgreSQL) via `@supabase/supabase-js` | ^2.98.0 |
| Styling | Tailwind CSS v4 | 4.x |
| Charts | Recharts | ^3.7.0 |
| Markdown | react-markdown + remark-gfm | ^10.1.0 / ^4.0.1 |
| WebSocket | `ws` (server-side Kalshi WS client) | ^8.19.0 |
| Fonts | Geist Sans + Geist Mono | via `next/font` |
| API Client | Kalshi REST API v2 + WebSocket v2 | RSA-PSS auth |

---

## Project Structure

```
kalshi-research/
├── kalshi-key.pem                # RSA private key for Kalshi API auth
├── .env.local                    # All API keys (not committed)
├── CLAUDE.md                     # AI builder instructions (references OpenAPI spec)
├── package.json
├── tsconfig.json                 # strict mode, @/* → ./src/*
├── next.config.ts
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
│       └── 005_event_speaker_id.sql   # events.speaker_id FK to speakers table
│
└── src/
    ├── types/
    │   ├── kalshi.ts             # KalshiEvent, KalshiMarket, WordContract
    │   ├── research.ts           # All agent I/O types, OrchestratorInput/Output, CorpusMentionRate
    │   ├── database.ts           # TypeScript interfaces for all DB table rows (including DbSpeaker, DbSeries)
    │   ├── components.ts         # Shared component-level types (Event, WordScore, Cluster, Trade, etc.)
    │   └── corpus.ts             # MentionHistoryRow, MentionEventDetail, SeriesWithStats, SpeakerWithSeries
    │
    ├── lib/
    │   ├── claude-client.ts      # Claude API wrapper with web search + pause_turn + streaming
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
    │   ├── orchestrator.ts       # 3-phase pipeline with cancellation + transcript caching + corpus pass-through
    │   ├── historical.ts         # Past speech transcript analysis
    │   ├── agenda.ts             # Advance info + agenda research
    │   ├── news-cycle.ts         # Last 72-hour news analysis
    │   ├── event-format.ts       # Event structure analysis
    │   ├── market-analysis.ts    # Pure price/volume analysis
    │   ├── clustering.ts         # Thematic word grouping
    │   └── synthesizer.ts        # Final probability synthesis + markdown briefing + corpus-aware weighting
    │
    ├── components/
    │   ├── corpus/               # 8 components for the /corpus page
    │   │   ├── SpeakerSelector.tsx       # Speaker dropdown with inline "Add New Speaker"
    │   │   ├── CorpusTabNav.tsx          # 3-tab switcher: Mention History | Kalshi Markets | Quick Analysis
    │   │   ├── MentionSummaryStats.tsx   # Stat cards: words tracked, settled events, avg rate, top word
    │   │   ├── MentionHistoryTable.tsx   # Sortable, searchable table with expandable per-event detail rows + reset sort
    │   │   ├── TranscriptSearchBar.tsx   # Debounced text search input (used by Quick Analysis)
    │   │   ├── KalshiMarketsTab.tsx      # Series management: add/delete/import/refresh + expandable events + word results
    │   │   ├── KalshiSeriesSearch.tsx    # Searchable dropdown querying Kalshi API for available series
    │   │   └── QuickAnalysisTab.tsx      # Paste URL → live price vs historical rate comparison with saved searches
    │   │
    │   └── research/             # Research dashboard components
    │       ├── EventHeader.tsx
    │       ├── ProgressMessages.tsx
    │       ├── TabNavigation.tsx         # 3 tabs: Research | Sources | Trade Log
    │       ├── EventContext.tsx          # **NEW** — Event structure + analysis from agent results
    │       ├── WordTable.tsx             # **NEW** — Corpus-integrated word analysis with speaker selector
    │       ├── AgentOutputAccordion.tsx
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
            │   └── speaker/route.ts      # PATCH: persist speaker selection on an event
            │
            ├── research/
            │   ├── trigger/route.ts      # POST: start research (SSE stream, accepts speakerId, fetches corpus data)
            │   ├── stop/route.ts         # POST: cancel a running run
            │   ├── [eventId]/route.ts    # GET: full research data
            │   └── status/[runId]/route.ts # GET: run status
            │
            ├── trades/
            │   ├── log/route.ts          # POST: log a trade
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
            │   ├── mention-history/route.ts  # GET: aggregated word mention rates across events
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

All 6 migrations (001-006) have been applied to the live Supabase database.

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
| event_date | timestamptz | |
| venue | text | Nullable |
| estimated_duration_minutes | integer | Set after event_format agent runs |
| series_id | uuid (FK → series) | **Migration 004**. ON DELETE SET NULL |
| speaker_id | uuid (FK → speakers) | **Migration 005**. ON DELETE SET NULL. Explicit speaker linkage for analytics — set from research page speaker dropdown. Used by analytics API to pull corpus historical mention rates. |
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
| briefing | text | **Migration 003** — Markdown research briefing from synthesizer |
| historical_result | jsonb | Phase 1 agent output |
| agenda_result | jsonb | Phase 1 agent output |
| news_cycle_result | jsonb | Phase 1 agent output (runs on both layers) |
| event_format_result | jsonb | Phase 1 agent output |
| market_analysis_result | jsonb | Phase 1 agent output |
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
| entry_price | real | 0.00-1.00 scale |
| contracts | integer | Default: 1 |
| total_cost_cents | integer | entry_price * contracts * 100 |
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

---

## Corpus System (Speaker → Series → Events)

The Corpus page (`/corpus`) provides cross-event analytics and historical data management, entirely separate from individual research runs.

### Data Model

```
speakers (manually created)
  ├── series (Kalshi series tickers, linked to speaker via series.speaker_id)
  │    └── events (individual Kalshi events, linked to series via events.series_id)
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
4. **View mention rates** — switch to Mention History tab to see cross-event word frequencies
5. **Browse events** — expand a series to see every individual event, expand an event to see word results (green Y / red N)

### Import Flow (POST /api/corpus/import-historical)

1. Accepts `{ seriesId }` (NOT a ticker — the series record must exist first)
2. Looks up the series record to get `series_ticker` and speaker name (via series → speakers join)
3. Fetches `GET /events?series_ticker=...&status=settled&with_nested_markets=true` from Kalshi (paginated, 200 per page)
4. For events where nested markets are empty (past Kalshi's historical cutoff), falls back to `GET /historical/markets?event_ticker=...`
5. For each event: upserts into `events` (with `series_id` and `speaker` from the series record), `words`, and `event_results`
6. Deduplicates words within the same event (handles `UNIQUE(event_id, word)` constraint — some Kalshi events have multiple market tickers resolving to the same display word)
7. Updates `series.events_count`, `series.words_count`, and `series.last_imported_at`
8. Uses `inferEventType()` from url-parser.ts for event type, but NOT `inferSpeaker()` — speaker always comes from the series record

### Mention History Aggregation (GET /api/corpus/mention-history)

- Fetches all `event_results` joined with `words` and `events`
- **Paginates** to avoid Supabase's default 1000-row limit (fetches in 1000-row pages)
- Filters by `speakerId` through the series linkage: looks up which series belong to the speaker, then filters events by `series_id`
- Groups results by normalized word (case-insensitive)
- Returns: `{ rows: MentionHistoryRow[], totalSettledEvents: number }`
- Each row has: `word`, `yesCount`, `noCount`, `totalEvents`, `mentionRate`, and expandable `events[]` with per-event detail

### Series Events API (GET /api/corpus/series/events)

- Fetches all events for a series ordered by most recent first
- Joins `event_results` with `words` to nest word results per event
- Paginates to handle large result sets (same 1000-row Supabase limit)
- Returns: `{ events: [{ id, title, eventDate, status, words: [{ word, wasMentioned }] }] }`

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
- **1 speaker**: Donald Trump
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

- **Model**: `claude-opus-4-0` (hardcoded)
- **Streaming**: Uses `anthropic.messages.stream().finalMessage()` instead of `anthropic.messages.create()`. This is **required** because web search operations can take longer than 10 minutes, and the Anthropic SDK mandates streaming for long-running operations.
- **Web search**: Uses `web_search_20250305` server-side tool. This is NOT a client-side tool — Anthropic's servers execute the search. The client only needs to handle `pause_turn` stop reasons.
- **`pause_turn` handling**: When `stop_reason === "pause_turn"`, the client appends the response content as an assistant message and sends another request. This loops up to 5 times (`MAX_CONTINUATIONS`).
- **Tools typed as `any[]`**: The SDK's TypeScript types don't cleanly handle server-side tool definitions like `{ type: "web_search_20250305", name: "web_search" }`. Using `any[]` avoids type errors.
- **JSON parsing**: `parseJsonResponse<T>()` uses a three-tier approach:
  1. Extract from markdown code fences (```json ... ```)
  2. Parse the entire text as raw JSON
  3. **Balanced-brace parser**: Finds the first `{` and walks character-by-character tracking depth, string boundaries, and escape characters to find the matching `}`. This is more robust than regex for responses where Claude wraps JSON in explanatory text.
- **JSON retry**: If parsing fails, `callAgentForJson` makes a second Claude call asking it to fix the malformed JSON. This adds to token usage but prevents pipeline crashes.

**Cost tracking**: Every call returns token counts. The orchestrator accumulates these across all agents and stores them on the research run. Pricing: $15/M input tokens, $75/M output tokens (Claude Opus 4).

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

All agents live in `src/agents/`. Each exports a single `run*Agent(input)` function that returns a typed result plus token usage.

### Phase 1 Agents (run in parallel)

| Agent | File | Web Search | Max Tokens | Purpose |
|-------|------|-----------|------------|---------|
| Historical | `historical.ts` | Yes | 16,384 | Searches past speech transcripts, counts word frequencies. Accepts optional `cachedTranscripts` to skip redundant web searches. Returns per-transcript `wordMentions` map. |
| Agenda | `agenda.ts` | Yes | 16,384 | Finds advance info, press releases, social media hints about topics |
| News Cycle | `news-cycle.ts` | Yes | 16,384 | Analyzes last 72 hours of news for each word. **Runs on both baseline and current layers** |
| Event Format | `event-format.ts` | Yes | 8,192 | Determines duration, scripted vs unscripted ratio, outputs weighting factors |
| Market Analysis | `market-analysis.ts` | No | 12,288 | Pure price/volume analysis, identifies mispricings, correlations |

### Phase 2 Agent

| Agent | File | Web Search | Max Tokens | Purpose |
|-------|------|-----------|------------|---------|
| Clustering | `clustering.ts` | No | 12,288 | Groups words thematically. Returns `narrative` per cluster. |

### Phase 3 Agent

| Agent | File | Web Search | Max Tokens | Purpose |
|-------|------|-----------|------------|---------|
| Synthesizer | `synthesizer.ts` | No | **32,000** | Final per-word probabilities with reasoning. **Generates markdown briefing** (800-1500 words). Accepts corpus settlement data when available. |

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

When corpus data is available, the synthesizer receives an additional `=== CORPUS MENTION HISTORY (Settled Kalshi Markets) ===` section showing per-word empirical mention rates (e.g., "border: 75% mention rate (9/12 events)"). The system prompt instructs the model to use corpus rates as the **primary anchor** for `baseRateProbability`, only deviating when there's strong evidence this event is different.

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

interface CorpusMentionRate {
  mentionRate: number;   // 0-1, e.g. 0.75 = mentioned in 75% of past events
  yesCount: number;      // times mentioned
  totalEvents: number;   // total events checked
}

interface OrchestratorInput {
  event: {
    id: string; kalshiEventTicker: string; title: string;
    speaker: string; eventType: string; eventDate: string; venue?: string;
  };
  words: Array<{ id: string; ticker: string; word: string; yesPrice: number; noPrice: number }>;
  layer: "baseline" | "current";
  existingResearch?: { historicalResult?; agendaResult?; eventFormatResult?; marketAnalysisResult? };
  corpusMentionRates?: Record<string, CorpusMentionRate>;  // keyed by lowercase word
}
```

---

## Orchestrator Pipeline

`src/agents/orchestrator.ts` — `runResearchPipeline(input, runId, onProgress?)`

### Transcript Caching (Internal Optimization)

Before Phase 1, the orchestrator queries the `transcripts` table for the speaker's cached transcripts. These are passed to the historical agent as `cachedTranscripts` so it can skip redundant web searches. After Phase 1, newly found transcript metadata is upserted back into the `transcripts` table for future runs.

**Note**: The `transcripts` table is an internal optimization cache only. It is NOT exposed on any user-facing page. The Sources tab on the research dashboard shows agent-found transcripts from `research_runs.historical_result` JSONB, not from the `transcripts` table.

### Cancellation Support

Before each phase, the orchestrator queries `research_runs.status` — if `"cancelled"` (set by `POST /api/research/stop`), it throws a `CancelledError` and stops.

### Phase 1: Parallel Research
```
historical ─┐
agenda ─────┤
news-cycle ─┼──→ Promise.allSettled() ──→ Save agent results to DB
event-format┤
market ─────┘
```

### Phase 2: Clustering → Phase 3: Synthesis → Phase 4: Persistence

All DB writes are individually wrapped in try/catch — a failed write doesn't crash the pipeline.

### Corpus Data Flow

When a speaker is selected (via `speakerId` in the trigger request or from `event.speaker_id`):

1. **Trigger API** fetches corpus data: `speakers` → `series` (by `speaker_id`) → `event_results` (paginated, joined with `words` and `events`) → filter by series → build `corpusMentionRates` map (word → { mentionRate, yesCount, totalEvents })
2. **Orchestrator** passes `corpusMentionRates` through to the synthesizer (single field pass-through, no transformation)
3. **Synthesizer** receives corpus data as an additional research section, reallocates weight from base_rate to corpus (70/30 split), and instructs Claude to use corpus rates as the primary anchor for base rate probability

If no speaker is selected or the speaker has no series/settlement data, `corpusMentionRates` is `undefined` and the synthesizer falls back to its standard weighting (no corpus weight).

---

## API Routes

### Core Research Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/events/load` | POST | Load event from Kalshi by URL or ticker |
| `/api/events/list` | GET | List events with research runs (excludes corpus-only imports) |
| `/api/events/speaker` | PATCH | Persist speaker selection on an event `{ eventId, speakerId }` |
| `/api/research/trigger` | POST | Start research pipeline (returns SSE stream). Accepts `{ eventId, layer, speakerId? }`. When `speakerId` is provided: persists to event, fetches corpus mention rates from settled Kalshi markets, passes to synthesizer. |
| `/api/research/stop` | POST | Cancel a running research run |
| `/api/research/[eventId]` | GET | Get full research data for an event |
| `/api/research/status/[runId]` | GET | Check status of a specific run |

### Trade Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/trades/log` | POST | Log a trade with agent probability |
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
| `/api/corpus/series/events` | GET | List events + word results for a series `?seriesId=` |
| `/api/corpus/mention-history` | GET | Aggregated word mention rates `?speakerId=` |
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
- Displays event details: title, ticker, word count
- Shows grid of all word contracts with current YES prices
- "Start Research" button — persists the selected speaker to the event record via `PATCH /api/events/speaker`, then navigates to the research page. The speaker selection flows through to the research trigger API which fetches corpus data for the synthesizer.
- **"Researched Events" list** at the bottom — only shows events that have at least one research run (filtered via `/api/events/list` which queries `research_runs` table). Corpus-imported events without research runs are excluded entirely.

### Research Dashboard (`/research/[eventId]`)
The main working page for tactical research on a specific upcoming Kalshi mention market event. Tabbed layout with extracted components.

**Always visible:**
- `EventHeader` — Event title, speaker, date, WS status, corpus speaker dropdown (same speakers list as home page), research trigger buttons. The speaker dropdown here allows changing the speaker after initial selection on the home page — persists via `PATCH /api/events/speaker` and is sent with the next research trigger.
- `ProgressMessages` — Real-time SSE progress during active research
- `TabNavigation` — Three tabs: Research | Sources | Trade Log
- `RunHistory` — Expandable research run history

**Research tab** (designed for the trader's pre-event workflow):
1. `EventContext` — Structured event context surfaced from agent results:
   - **Event Structure section**: Format (scripted/unscripted/mixed), estimated duration + range, Q&A (yes/no), live (yes/no), agent explanation of format and duration effects, trading weight footer (Historical weight %, Current context weight %, Word count expectation). Data from `EventFormatResult`.
   - **Event Analysis section**: Breaking news alert banner (if any), Agenda & Purpose with advance sources, Exogenous Events sorted by relevance (HIGH/MEDIUM/LOW) with speaker framing, Recent Speaker Statements with dates and context, Likely Topics sorted by likelihood (very_likely → unlikely) with evidence strings and related market words. Data from `AgendaResult` and `NewsCycleResult`.
   - Shows placeholder when no research has been run yet.

2. `WordTable` — Corpus-integrated word analysis (replaces the old WordAnalysisTable):
   - **Manual speaker selector** in the header — dropdown of all speakers from the corpus system. User selects which speaker's historical data to cross-reference against.
   - **Historical rates from corpus only** — mention rates come exclusively from Kalshi settled market data (ground truth via `MentionHistoryRow`), NOT from the agent's web-scraped transcripts. This provides 100+ event sample sizes instead of ~9 from web scraping.
   - **Columns**: Word, Market Price (live via WebSocket), Historical Rate (color-coded badge: green ≥60%, yellow ≥30%, red <30%), Edge (historical rate - market price), Sample (yes/total)
   - **Expandable rows** — click any word to see event-by-event results (event title, ticker, date, MENTIONED/NOT MENTIONED badge) from the corpus
   - **Sortable** by all columns. Default sort: Edge descending.
   - Data flow: `wordScores` (from research run) provide the word list + market tickers → `livePrices` (from WebSocket) update market prices → `mentionData` (from `/api/corpus/mention-history`) provides historical rates matched by normalized word name

3. `AgentOutputAccordion` — Expandable raw agent outputs for debugging

**Sources tab**: `SourcesTab` — aggregates every source used across all research agents, with type tags. Extracts sources from the latest completed run's `historical_result`, `agenda_result`, `news_cycle_result`, and `event_format_result`. Each source is tagged by type:
  - **Transcript** (blue) — from historical agent's `transcriptsFound[]`
  - **Agenda** (green) — from agenda agent's `sourcesFound[]`
  - **News** (amber) — from news cycle agent's `trendingTopics[].sources[]`
  - **Statement** (rose) — from news cycle agent's `recentSpeakerStatements[]`
  - **Event** (purple) — from event format agent's `comparableEvents[]`

  Sources with URLs are clickable. Summary badges at the top show counts per type. The `extractSources()` helper function (exported from `SourcesTab.tsx`) handles the extraction logic.

**Trade Log tab**: WordScoresTable (with inline trade forms), LoggedTrades, ResolveEvent

### Corpus Page (`/corpus`)
Strategic analytics page for long-term speaker data, completely separate from individual research runs. All data here comes from Kalshi's settled market results (ground truth), not from AI agent analysis.

**Layout:**
- Header with SpeakerSelector dropdown (includes "Add New Speaker")
- 3-tab navigation: Mention History | Kalshi Markets | Quick Analysis
- All tabs filter by the selected speaker

**Mention History tab:**
- `MentionSummaryStats` — Stat cards: Words Tracked, Settled Events, Avg Mention Rate, Top Word
- `MentionHistoryTable` — Sortable, searchable table with columns: Word, Yes, No, Total, Mention Rate %
  - **Search input** at the top filters words by name as you type (case-insensitive substring match)
  - **Reset sort button** appears when sort differs from default (Total desc) — click to reset
  - Color-coded rates (green ≥60%, yellow ≥30%, red <30%)
  - Click any row to expand → shows per-event detail (event title, date, MENTIONED/NOT MENTIONED badge)

**Kalshi Markets tab:**
- `KalshiSeriesSearch` — Searchable dropdown querying the Kalshi API for all available series. Type a keyword (e.g., "mention", "trump", "vance") to filter. Click a result to add the series to the speaker.
- Series cards showing: ticker, display name, events count, words count, last imported date
- Per-series **Refresh** button (re-imports from Kalshi API) and **Delete** button
- **Expandable series → events**: Click a series to see all its events, most recent first
  - Each event shows: title, date, status, and quick Y/N count
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
- **Overall Stats cards**: Total trades, wins, losses, win rate, total P&L (resolved trades only)
- **Per-Event Performance table**: Only shows events with at least one trade (corpus-only events excluded). Columns: Event, Date, Trades, W/L, Win Rate, P&L.
  - **Expandable rows** — click any event to expand and see individual trade detail. Chevron (▶) rotates 90° when expanded.
  - **Trade detail sub-table** (8 columns): Word, Side (YES/NO pill), Entry Price, Contracts, Mention Rate, Edge, Result (W/L), P&L.
  - **Mention Rate** = historical corpus mention rate (from `event_results` settled data via the event's `speaker_id` linkage). NOT the AI synthesizer's `combined_probability`. Shows "-" if no speaker is linked.
  - **Edge** = `historical_rate - entry_price`. Color-coded: green for positive (underpriced), red for negative (overpriced). Shows "-" if no speaker is linked.
  - **Data flow for historical rates**: `events.speaker_id` → `series` (where `speaker_id` matches) → all corpus `events` in those series → `event_results` joined with `words` → group by normalized word → `mentionRate = mentioned / total`. Paginated to handle Supabase 1000-row limit.
- **Calibration Chart**: Agent probability buckets vs actual mention outcomes (from `word_scores` + `event_results`)
- **Edge vs P&L Chart**: Average P&L by agent edge bucket
- **P&L by Event Chart**: Bar chart of P&L per event over time
- Dark theme Recharts charts with custom DarkTooltip component

---

## Component Architecture

### Shared Types (`src/types/components.ts`)

All component prop types defined here: Event, WordScore, Cluster, ResearchRun, ResearchSummary, Trade, Word, EventResult, SortKey, TabId (`"research" | "sources" | "tradelog"`), PriceData.

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
- Props: `{ wordScores: WordScore[]; livePrices: Record<string, PriceData>; mentionData: MentionHistoryRow[]; mentionLoading: boolean; speakers: Array<{ id: string; name: string }>; selectedSpeakerId: string; onSpeakerChange: (speakerId: string) => void }`
- Builds a `mentionRateMap` (word name → rate + events) from corpus `MentionHistoryRow[]`
- Merges word scores (for the word list + market tickers), live prices (for current market price), and corpus data (for historical rate, edge, sample, and per-event detail)
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

The `extractSources()` function handles all extraction logic, normalizing different agent output shapes into a flat `ResearchSource[]` array.

### Transcript Caching (Orchestrator)

The orchestrator still caches transcript metadata in the `transcripts` table after historical agent runs (for future run optimization). This is an internal optimization — the `transcripts` table is NOT exposed on any user-facing page. The transcript API routes (`/api/transcripts/*`) still exist but are not used by any current UI.

---

## Live Prices (WebSocket)

```
Browser (EventSource) → /api/ws/prices (SSE) → Kalshi WebSocket (wss://...)
```

Client hook: `const { prices, status, lastUpdate } = useLivePrices(marketTickers);`

---

## Trade Logging & Settlement

### Trade Flow
1. Log trade → 2. Wait for event → 3. Check settlement (polls Kalshi API) → 4. Auto-resolve → 5. View analytics

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
2. Run all six migrations (001-006) in order
3. Get a Kalshi API key and RSA private key
4. Get an Anthropic API key with Claude Opus 4 access
5. Fill in `.env.local` with all credentials

---

## Two-Layer Research Model

### Baseline Layer (Comprehensive)
Run days before the event. Runs ALL 7 agents: historical frequencies, agenda, news cycle, event format, market analysis, clustering, and synthesis. The baseline should always be as comprehensive as possible.

### Current Layer (Refresh)
Run hours before the event. Re-runs all agents with the latest data. Reuses baseline results as context (passed via `existingResearch` to the orchestrator). The purpose is to catch any material changes since the baseline was run.

---

## Relationship to Speed Trader

Companion to the **Speed Trader** project at `~/kalshi-trade/`. Speed Trader handles fast automated trading during live events. This Research Agent handles pre-event analysis.

Shared: `kalshi-client.ts`, WebSocket-to-SSE pattern, `kalshi-key.pem`, Kalshi API key.

---

## Current Status & Known Issues

### What's Built and Working
- Full 7-agent research pipeline with streaming progress (all agents run on both layers)
- **Corpus data injection** — when a speaker is selected, empirical mention rates from settled Kalshi markets are fetched and passed to the synthesizer as ground-truth base rates. Weight reallocation: 70% corpus / 30% generic base rate.
- **Home page speaker selection** — corpus speaker dropdown on home page (no free-text speaker input or event type dropdown). Speaker persists to event record and flows through research trigger to synthesizer.
- Tabbed research dashboard (Research | Sources | Trade Log) with extracted components
- **EventHeader** — includes corpus speaker dropdown for changing speaker selection before/between research runs
- **EventContext** — structured event context (format, duration, Q&A, agenda, exogenous events, likely topics, recent statements) surfaced from agent results
- **WordTable** — corpus-integrated word analysis with manual speaker selection, historical rates from Kalshi settled market data (ground truth, 100+ event samples), expandable per-event detail, live WebSocket prices
- **Sources tab** — aggregated sources from all agents with type tags (transcript, news, agenda, statement, event), clickable links to originals
- **Home page** — only shows events with research runs (corpus-imported events excluded)
- Live WebSocket price streaming via SSE proxy
- Trade logging with inline forms
- Automatic and manual settlement
- Recharts analytics charts with expandable per-event trade detail, corpus-based historical mention rates and edge
- Run cancellation
- **Corpus page** with 3 tabs:
  - Mention History: cross-event word mention rates with searchable, sortable, expandable per-event detail (827+ data points across 116 events). Word search filter, reset sort button. Data from Kalshi settled markets (ground truth).
  - Kalshi Markets: series management with searchable Kalshi API dropdown, per-series import/refresh, expandable events with word result tables. Per-event removal with excluded_tickers tracking (removed events won't be re-imported on refresh). Event title filter for quickly finding/removing non-relevant events. Event titles hyperlinked to original Kalshi market pages for speaker verification. Supports multi-speaker series (e.g. KXCONGRESSMENTION) — import full series under a speaker, remove non-relevant events, refresh safely.
  - Quick Analysis: paste URL → live price vs historical rate comparison table with WebSocket updates, saved search list (localStorage), expandable per-event detail, edge detection, summary cards
- Speaker → Series → Events data model (no fragile inference)
- Historical data import from Kalshi API with pagination and deduplication

### Known Limitations
- **Supabase 1000-row limit**: All queries returning potentially large result sets must paginate. The corpus APIs handle this, but any new API routes querying large tables should use `.range()` pagination.
- **Agent-level retry**: Individual agent failures get fallback empty results, no automatic retry.
- **Multiple concurrent research runs**: Untested.
- **Baseline layer**: One baseline run tested. News cycle agent now runs on both layers but baseline-specific results have limited production testing.
- **Event types beyond speeches**: Only `address_to_congress` type events tested end-to-end with research.
- **One empty event**: KXTRUMPMENTION has 1 event (a Press Conference) with 0 settled markets — this is a Kalshi data issue, not a bug.
- **One missing result set**: KXTRUMPMENTIONB-25DEC03 has 20 words but 0 event_results (transient DB error during import). Re-import the series to fix.
- **Analytics historical rates require speaker_id**: The analytics page only shows corpus historical mention rates for events where the user has set a speaker (via the home page dropdown before research, or the research page EventHeader/WordTable dropdown). Events without a `speaker_id` show "-" for Mention Rate and Edge columns. Setting the speaker on the home page before triggering research is now the recommended flow — it ensures both the synthesizer and analytics have corpus data.

### Architecture Improvements to Consider
- Rate limiting for Claude API calls
- Proper error boundaries on frontend
- Switching from Claude Opus 4 to a cheaper model for simpler agents
- Batch market fetching in settlement check (currently sequential)

---

## Debugging Notes

### Claude API
- Streaming required for long-running web search operations
- Three-tier JSON parsing: code fences → raw JSON → balanced-brace parser
- `pause_turn` max 5 continuations
- Synthesizer uses 32K tokens — monitor for truncation on 50+ word events

### Kalshi API
- Website uses `/markets/` URLs, API uses `/events/`. Load route handles this.
- Market `result` field: `"yes"`, `"no"`, `"scalar"`, or `""` (empty = unsettled)
- `yes_sub_title` gives the word display name for markets
- Historical markets endpoint: `GET /historical/markets?event_ticker=...` — use when nested markets are empty
- Series listing: `GET /series` — returns all series (no search param, filter client-side)
- Full OpenAPI spec at `docs/kalshi-openapi.yaml`

### Supabase
- All 6 migrations applied. **Default 1000-row limit** — always paginate large queries.
- Service role key bypasses RLS. Anon key respects RLS.
- Management API at `POST https://api.supabase.com/v1/projects/hczppfsuqtpccxvmyaue/database/query` for running SQL directly.

### Build
- TypeScript strict mode — all variables explicitly typed
- `tools` array in `claude-client.ts` typed as `any[]` to avoid SDK type conflicts
- Run `npm run build` to verify before deploying

---

## Cost Estimates

Per research run (7 agents, one event with ~28 words):

| Component | Estimated Cost |
|-----------|---------------|
| Phase 1 (5 agents, 4 with web search) | ~$0.50 - $1.50 |
| Phase 2 (clustering) | ~$0.10 - $0.20 |
| Phase 3 (synthesis, 32K max tokens) | ~$0.20 - $0.50 |
| **Total per run** | **~$0.80 - $2.20** |

Both layers: ~$1.60 - $4.40. Failed runs still cost money.

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
   - Columns: Word, Market Price (live via WebSocket), Historical Rate (color-coded badge), Edge (rate - price), Sample (yes/total).
   - Expandable rows showing per-event detail from corpus `MentionEventDetail[]`.
   - No cluster filters, no agent confidence columns, no summary cards.
   - Props include: `wordScores`, `livePrices`, `mentionData: MentionHistoryRow[]`, `speakers`, `selectedSpeakerId`, `onSpeakerChange`.

53. **Research page corpus integration** — `src/app/research/[eventId]/page.tsx` now fetches corpus data:
   - Added state: `speakers`, `selectedSpeakerId`, `mentionData`, `mentionLoading`.
   - Fetches speaker list from `GET /api/corpus/speakers` on mount.
   - Fetches mention history from `GET /api/corpus/mention-history?speakerId=X` when speaker changes.
   - **Speaker selection persists to DB**: When the user selects a speaker in the WordTable dropdown, it calls `PATCH /api/events/speaker` to save `speaker_id` on the event. On page load, `selectedSpeakerId` is restored from the event's `speaker_id` field, so the selection survives page reloads.
   - Speaker selection is manual (never automatic) — the user explicitly chooses which speaker's historical data to use. The `speaker_id` on the event record is the ONLY way analytics knows which corpus data to pull.
   - Research tab render order: `EventContext` → `WordTable` → `AgentOutputAccordion`.

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
