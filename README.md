# Kalshi Research Agent

AI-powered research platform for Kalshi **mention markets** — prediction markets where you bet on whether a specific word will be said during a live event (e.g. a presidential address). The app ingests a Kalshi event URL, runs a multi-agent AI research pipeline to estimate per-word mention probabilities, and presents actionable trading signals with edge calculations.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Environment Variables](#environment-variables)
4. [Database Schema (Supabase)](#database-schema-supabase)
5. [Authentication — Kalshi API](#authentication--kalshi-api)
6. [AI Research Pipeline](#ai-research-pipeline)
7. [Pages & Features](#pages--features)
8. [UI Component Details](#ui-component-details)
9. [API Routes](#api-routes)
10. [Key Libraries & Clients](#key-libraries--clients)
11. [Deployment](#deployment)
12. [Running Locally](#running-locally)
13. [Migrations](#migrations)
14. [Important Patterns & Gotchas](#important-patterns--gotchas)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4 |
| Database | Supabase (PostgreSQL) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk` ^0.78.0) — Opus 4.6, Sonnet 4.5, Haiku 4.5 |
| Charts | Recharts 3.7 |
| Market Data | Kalshi REST API + WebSocket (`ws` ^8.19.0, RSA-PSS auth) |
| Deployment | Fly.io (Docker, `sin` region) |
| Markdown | react-markdown ^10.1.0 + remark-gfm ^4.0.1 |

---

## Project Structure

```
kalshi-research/
├── src/
│   ├── app/                          # Next.js App Router pages & API routes
│   │   ├── page.tsx                  # Home — URL input, event loader, research launcher
│   │   ├── layout.tsx                # Root layout with nav (Corpus, Analytics, Trade Analytics, P&L)
│   │   ├── research/
│   │   │   └── [eventId]/page.tsx    # Research output page (tabs: Research, Sources, Trade Log)
│   │   ├── corpus/
│   │   │   └── page.tsx              # Corpus management (speakers, series, transcripts)
│   │   ├── analytics/
│   │   │   └── page.tsx              # Performance analytics (logged trades, win rates)
│   │   ├── trade-analytics/
│   │   │   └── page.tsx              # Per-word trade analytics (speaker filter, edge analysis)
│   │   ├── pnl/
│   │   │   └── page.tsx              # P&L dashboard (Overview + Calendar tabs, per-event table)
│   │   └── api/
│   │       ├── events/
│   │       │   ├── load/route.ts     # POST — load event from Kalshi URL/ticker
│   │       │   ├── list/route.ts     # GET — list events with research runs or logged trades
│   │       │   ├── speaker/route.ts  # PATCH — assign speaker to event
│   │       │   ├── notes/route.ts    # PATCH — save pre/post event notes
│   │       │   └── refresh-markets/route.ts  # POST — refresh market prices
│   │       ├── research/
│   │       │   ├── trigger/route.ts  # POST — trigger research pipeline
│   │       │   ├── [eventId]/route.ts # GET — fetch research results
│   │       │   ├── status/[runId]/route.ts # GET — poll pipeline progress
│   │       │   └── stop/route.ts     # POST — cancel running research
│   │       ├── pnl/
│   │       │   ├── route.ts          # GET — P&L from Kalshi fills + settlements (FIFO offset matching)
│   │       │   └── debug/route.ts    # GET — P&L diagnostics (fill counts, theory validation)
│   │       ├── trades/
│   │       │   ├── log/route.ts      # POST — log a trade
│   │       │   ├── results/route.ts  # GET/POST — trade results & settlement
│   │       │   └── [tradeId]/route.ts # DELETE — remove a logged trade
│   │       ├── analytics/
│   │       │   ├── performance/route.ts # GET — aggregate performance stats
│   │       │   └── trade-analytics/route.ts # GET — per-word trade analytics by speaker
│   │       ├── corpus/
│   │       │   ├── speakers/route.ts # GET/POST — manage speakers
│   │       │   ├── series/route.ts   # GET/POST — manage Kalshi series
│   │       │   ├── series/events/route.ts # GET — events in a series
│   │       │   ├── categories/route.ts # GET — corpus event categories
│   │       │   ├── kalshi-series/route.ts # GET — search Kalshi series
│   │       │   ├── import-historical/route.ts # POST — bulk import historical events
│   │       │   ├── mention-history/route.ts # GET — word mention history
│   │       │   └── quick-prices/route.ts # GET — quick price lookup
│   │       ├── transcripts/
│   │       │   ├── route.ts          # GET — list transcripts
│   │       │   ├── upload/route.ts   # POST — upload transcript
│   │       │   ├── frequencies/route.ts # GET — word frequencies
│   │       │   ├── [id]/route.ts     # GET/DELETE — single transcript
│   │       │   └── [id]/download/route.ts # GET — download transcript
│   │       ├── settlement/
│   │       │   └── check/route.ts    # GET — check market settlement
│   │       └── ws/
│   │           └── prices/route.ts   # GET — WebSocket proxy for live prices
│   ├── agents/                       # AI research agents
│   │   ├── orchestrator.ts           # Pipeline coordinator (phases 1→2→3)
│   │   ├── historical.ts            # Historical transcript analysis
│   │   ├── agenda.ts                # Event agenda/topic analysis
│   │   ├── news-cycle.ts            # Current news cycle analysis
│   │   ├── event-format.ts          # Event format/duration estimation
│   │   ├── market-analysis.ts       # Market pricing analysis
│   │   ├── recent-recordings.ts     # Recent recording discovery
│   │   ├── clustering.ts            # Word clustering (uses phase 1 outputs)
│   │   └── synthesizer.ts           # Final synthesis (combines everything)
│   ├── components/
│   │   ├── research/                 # Research page components
│   │   │   ├── WordTable.tsx         # Main word table — prices, historical rates, edge, search bar, expandable event details
│   │   │   ├── WordScoresTable.tsx   # Detailed AI scores grid — probabilities, confidence, trade form, cluster filter
│   │   │   ├── ResearchNotes.tsx     # Pre/post event notes (auto-save, 800ms debounce)
│   │   │   ├── ResearchBriefing.tsx  # AI-generated briefing (markdown)
│   │   │   ├── AgentOutputAccordion.tsx # Expandable per-agent results
│   │   │   ├── ClusterView.tsx       # Word cluster visualization
│   │   │   ├── EventHeader.tsx       # Event metadata header
│   │   │   ├── EventContext.tsx      # Event context panel (format, agenda, news cycle, trending topics)
│   │   │   ├── QuickTradeTable.tsx   # Standalone trade table for logging trades without research (uses words list)
│   │   │   ├── LoggedTrades.tsx      # Trade log with delete (shown in both Research tab when settled + Trade Log tab)
│   │   │   ├── RunHistory.tsx        # Research run history
│   │   │   ├── ResolveEvent.tsx      # Mark event results (mentioned/not mentioned)
│   │   │   ├── ProgressMessages.tsx  # Research progress indicator
│   │   │   ├── SourcesTab.tsx        # Sources/transcripts tab
│   │   │   ├── TabNavigation.tsx     # Tab switcher (Research, Sources, Trade Log)
│   │   │   ├── CorpusStats.tsx       # Corpus statistics
│   │   │   ├── FrequencyTable.tsx    # Word frequency table
│   │   │   ├── RecentRecordings.tsx  # Recent recordings display
│   │   │   ├── TranscriptViewer.tsx  # Transcript viewer
│   │   │   ├── TranscriptUpload.tsx  # Transcript upload
│   │   │   └── TranscriptList.tsx    # Transcript list
│   │   └── corpus/                   # Corpus page components
│   │       ├── SpeakerSelector.tsx   # Speaker dropdown selector
│   │       ├── KalshiSeriesSearch.tsx # Search Kalshi for series
│   │       ├── KalshiMarketsTab.tsx  # Browse Kalshi markets
│   │       ├── QuickAnalysisTab.tsx  # Quick analysis tools
│   │       ├── MentionHistoryTable.tsx # Word mention history with search bar, expandable event details
│   │       ├── MentionSummaryStats.tsx # Summary stats for mention data
│   │       ├── TranscriptSearchBar.tsx # Search bar for transcripts
│   │       └── CorpusTabNav.tsx      # Corpus page tab navigation
│   ├── hooks/
│   │   └── useLivePrices.ts          # WebSocket hook for real-time Kalshi prices
│   ├── lib/
│   │   ├── kalshi-client.ts          # Kalshi API client (RSA-PSS signing)
│   │   ├── claude-client.ts          # Claude API wrapper (retry, web search, JSON parsing)
│   │   ├── supabase.ts              # Supabase server client (service role)
│   │   ├── settlement.ts            # Settlement logic — uses total_cost_cents for P&L calculation
│   │   ├── url-parser.ts            # Kalshi URL/ticker parser
│   │   └── ui-utils.ts              # Shared UI utilities (edgeColor, confBadge)
│   └── types/
│       ├── research.ts               # Agent result types, orchestrator I/O
│       ├── components.ts             # UI component types (Event, WordScore, Trade, Cluster, SortKey, etc.)
│       ├── database.ts               # Database row types (DbEvent, DbWord, etc.)
│       ├── kalshi.ts                 # Kalshi API response types
│       └── corpus.ts                 # Corpus-related types (MentionHistoryRow, MentionEventDetail)
├── supabase/
│   └── migrations/                   # SQL migrations (001-010, all applied)
│       ├── 001_initial_schema.sql    # Core tables: events, words, word_clusters, research_runs,
│       │                             #   word_scores, transcripts, trades, event_results + views
│       ├── 002_rls_policies.sql      # Row Level Security policies
│       ├── 003_dashboard_redesign.sql # briefing column, word_frequencies JSONB, cancelled status
│       ├── 004_speakers_and_series.sql # speakers + series tables, series_id on events
│       ├── 005_event_speaker_id.sql  # speaker_id FK on events
│       ├── 006_excluded_tickers.sql  # excluded_tickers TEXT[] on series (multi-speaker support)
│       ├── 007_corpus_categories.sql # events.category, research_runs.corpus_category
│       ├── 008_recent_recordings.sql # research_runs.recent_recordings_result JSONB
│       ├── 009_event_notes.sql       # events.pre_event_notes, events.post_event_notes
│       ├── 010_total_cost_real.sql   # trades.total_cost_cents INTEGER → REAL (sub-cent precision)
│       └── 011_series_ticker_per_speaker.sql  # UNIQUE(series_ticker) → UNIQUE(series_ticker, speaker_id)
├── docs/
│   └── kalshi-openapi.yaml           # Full Kalshi OpenAPI spec
├── Dockerfile                        # Multi-stage Node 22 Alpine build
├── fly.toml                          # Fly.io config (sin region, 512MB, port 3000)
├── CLAUDE.md                         # AI builder instructions
├── package.json
├── tsconfig.json
└── .env.local                        # Local environment variables (not committed)
```

---

## Environment Variables

All stored in `.env.local` (local) or Fly.io secrets (production):

```bash
# Kalshi API
KALSHI_API_KEY=<uuid>                          # Kalshi API key ID
KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."  # RSA private key (inline PEM)
KALSHI_PRIVATE_KEY_PATH=./kalshi-key.pem       # OR path to PEM file (fallback)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://hczppfsuqtpccxvmyaue.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # Bypasses RLS for server-side writes

# Anthropic
ANTHROPIC_API_KEY=<api-key>                    # Claude API key
```

The Kalshi client (`src/lib/kalshi-client.ts`) first checks `KALSHI_PRIVATE_KEY` (inline), then falls back to reading from `KALSHI_PRIVATE_KEY_PATH`.

---

## Database Schema (Supabase)

**Project ID:** `hczppfsuqtpccxvmyaue`

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `events` | Kalshi mention market events | `kalshi_event_ticker`, `title`, `speaker`, `event_date`, `status`, `series_id`, `speaker_id`, `category`, `pre_event_notes`, `post_event_notes` |
| `words` | Individual word contracts within an event | `event_id`, `kalshi_market_ticker`, `word`, `cluster_id` |
| `word_clusters` | Grouped words by theme | `event_id`, `cluster_name`, `theme`, `correlation_note` |
| `research_runs` | Research pipeline execution records | `event_id`, `layer`, `status`, `model_used`, `briefing`, all agent result JSONB columns, token/cost tracking |
| `word_scores` | Per-word probability scores from research | `word_id`, `research_run_id`, probabilities (historical/agenda/news/base/combined), `edge`, `confidence`, `reasoning`, `key_evidence` |
| `transcripts` | Cached speaker transcripts | `speaker`, `title`, `event_date`, `full_text`, `word_count`, `word_frequencies` |
| `trades` | Logged trades | `event_id`, `word_id`, `side`, `entry_price` (REAL), `contracts` (INTEGER), `total_cost_cents` (REAL — supports sub-cent precision), `result`, `pnl_cents` |
| `event_results` | Settlement outcomes per word | `event_id`, `word_id`, `was_mentioned` |
| `speakers` | Registered speakers for corpus | `name` |
| `series` | Kalshi series linked to speakers — one row per (ticker, speaker) pair | `speaker_id`, `series_ticker`, `display_name`, `excluded_tickers`. Unique constraint is `UNIQUE(series_ticker, speaker_id)` — the same Kalshi series (e.g. `KXMENTION`) can be added for multiple speakers independently |

### Views

- `event_performance` — Aggregated trade performance per event (wins, losses, win rate, P&L)
- `calibration_data` — Predicted probability vs actual outcome for calibration analysis

### Migrations

All 11 migrations (001-011) are applied to the live Supabase instance. Run migrations via the Supabase Management API:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/hczppfsuqtpccxvmyaue/database/query" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL HERE>"}'
```

**Important:** Supabase has a 1000-row default limit — always paginate large queries. Use the service role key for writes (bypasses RLS).

---

## Authentication — Kalshi API

The Kalshi API uses **RSA-PSS** request signing (not OAuth or basic auth).

### How it works (`src/lib/kalshi-client.ts`)

1. For each request, construct the signing message: `timestamp + METHOD + path` (path without query string)
2. Sign with RSA-SHA256 using PSS padding (`RSA_PKCS1_PSS_PADDING`, salt length = digest)
3. Send three headers: `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE`

### Key exports

- `kalshiFetch(method, apiPath, body?)` — Authenticated REST call. `apiPath` starts with `/` (e.g. `/portfolio/fills`)
- `getKalshiWsHeaders()` — Auth headers for WebSocket connections
- `KALSHI_WS_URL` — WebSocket endpoint

### API Base URLs

- **Production:** `https://api.elections.kalshi.com/trade-api/v2`
- **Demo:** `https://demo-api.kalshi.co/trade-api/v2`
- **OpenAPI spec:** `./docs/kalshi-openapi.yaml`

---

## AI Research Pipeline

The research pipeline is orchestrated by `src/agents/orchestrator.ts` and runs in 3 phases:

### Phase 1 — Parallel Research Agents

All run concurrently via `Promise.allSettled`:

| Agent | File | Purpose | Web Search |
|-------|------|---------|------------|
| Historical | `historical.ts` | Analyzes past transcripts for word frequency patterns | Yes |
| Agenda | `agenda.ts` | Researches event agenda, topics, and likely discussion areas | Yes |
| News Cycle | `news-cycle.ts` | Scans current news for relevant trending topics | Yes |
| Event Format | `event-format.ts` | Estimates duration, format (scripted/unscripted/mixed), Q&A likelihood | Yes |
| Market Analysis | `market-analysis.ts` | Analyzes current market pricing for mispricing signals | No |
| Recent Recordings | `recent-recordings.ts` | Finds recent recordings of the speaker | Yes |

### Phase 2 — Clustering

- **Clustering Agent** (`clustering.ts`) — Groups words into thematic clusters using phase 1 outputs (historical + agenda results)
- Identifies correlated words, standalone words, and cross-cluster relationships

### Phase 3 — Synthesis

- **Synthesizer** (`synthesizer.ts`) — Combines all agent outputs + corpus mention rates into final per-word scores
- Produces: probability estimates (historical, agenda, news cycle, base rate, combined), edge vs market price, confidence rating, reasoning, key evidence, and a markdown briefing
- Outputs `topRecommendations` (strongest yes/no signals) and `researchQuality` assessment

### Model Presets

Configurable per-research-run via the UI:

| Preset | Description |
|--------|-------------|
| `opus` | All agents use Claude Opus 4.6 — highest quality |
| `hybrid` | Synthesizer uses Opus, research agents use Sonnet, utility agents use Haiku |
| `sonnet` | All agents use Claude Sonnet 4.5 — good balance (default) |
| `haiku` | All agents use Claude Haiku 4.5 — cheapest |

### Claude Client (`src/lib/claude-client.ts`)

- Wraps `@anthropic-ai/sdk` with retry logic (4 retries, exponential backoff starting at 3s)
- Handles `web_search_20250305` server-side tool (Anthropic executes searches within the API call)
- Handles `pause_turn` resumptions (up to 5 continuations)
- `callAgent(options)` — Raw text response with token tracking
- `callAgentForJson<T>(options)` — Parses JSON from response, auto-retries on parse failure by asking Claude to fix the JSON
- `parseJsonResponse<T>(text)` — Extracts JSON from code fences, bare JSON, or balanced-brace matching
- Tracks token usage and estimated cost per call (per-model pricing table built in)
- Strips web search citation tags from responses

### Pipeline Data Flow

```
User pastes Kalshi URL
  → /api/events/load (fetches event + ALL markets from Kalshi API, saves to Supabase)
  → User selects speaker, corpus categories, model preset
  → "Start Baseline Research" navigates to /research/[eventId] (does NOT auto-trigger research)
  → User can immediately log trades via Trade Log tab (QuickTradeTable uses words from DB)
  → User optionally clicks "Start Research" to trigger AI pipeline
  → /api/research/trigger (creates research_run, starts orchestrator in background)
  → Orchestrator runs Phase 1 → Phase 2 → Phase 3
  → Results saved to Supabase (research_runs, word_scores, word_clusters)
  → Frontend polls /api/research/status/[runId] for progress
  → /api/research/[eventId] returns full results for display
  → Trade Log tab upgrades to WordScoresTable (with AI scores + inline trade form)
```

---

## Pages & Features

### Home Page (`/`)

- Paste a Kalshi mention market URL or event ticker (e.g. `KXTRUMPMENTION-27FEB26`)
- Loads event details and word contracts from Kalshi API
- Select speaker (for corpus data), corpus categories, and model preset
- Shows previously researched events with links
- "Start Baseline Research" button navigates to research page

### Research Page (`/research/[eventId]`)

Three tabs: **Research**, **Sources**, **Trade Log**

**Research Tab:**
- `EventHeader` — Event title, speaker, date, duration, status
- `WordTable` — Primary word analysis table (always visible, see [UI Component Details](#wordtable) below)
- `WordScoresTable` — Detailed AI-generated scores with inline trade form (visible after research completes)
- `LoggedTrades` — Settled trade results table (visible only when event is resolved, i.e. `isResolved === true`). Shown between WordTable and ResearchNotes for convenient reference while writing post-event notes.
- `ResearchNotes` — Two side-by-side textareas:
  - **Pre-Event Analysis** — Research thoughts before the event
  - **Post-Event Review** — Reflections after trades
  - Auto-saves with 800ms debounce (no save button), shows "Saving..."/"Saved" indicator
  - Stored in `events.pre_event_notes` and `events.post_event_notes`
- `RecentRecordings` — Recent recordings discovered by the research pipeline. Handles two response shapes from the AI agent: (1) standard `{ recordings: [...] }` with clickable video links, and (2) fallback `{ status: "error", available_content: [...], recommendations: [...] }` when the agent couldn't find direct URLs. The fallback renders a "Recent Events" section showing known events (date, type, participants, sources) without links, plus a "Where to find recordings" list of recommendations.
- `AgentOutputAccordion` — Expandable sections showing raw output from each AI agent
- `ResearchBriefing` — AI-generated markdown briefing with top recommendations
- `ClusterView` — Visual grouping of correlated words
- `ProgressMessages` — Real-time progress during research pipeline execution
- `RunHistory` — View/select past research runs

**Sources Tab:**
- Transcripts found by historical agent
- Recent recordings discovered
- Corpus statistics and mention history

**Trade Log Tab:**
- **Trade logging works without research.** When no research has been run, `QuickTradeTable` renders using the event's `words` list (loaded from Kalshi). When research results exist, `WordScoresTable` renders instead (with AI scores + inline trade form).
- `QuickTradeTable` — Lightweight trade table showing all words with live prices, search, sorting, and the same inline trade form (side/price/contracts/editable cost). Uses `words` from Supabase (always available after event load), not `wordScores` (only available after research).
- `WordScoresTable` — Full scores table with inline trade form for logging new trades (only shown when research has been run)
- `LoggedTrades` — View logged trades with P&L after settlement, delete trades
- `ResolveEvent` — Mark words as mentioned/not mentioned, trigger settlement
- Log trades with side, price, contracts, and editable total cost

### Corpus Page (`/corpus`)

- Manage speakers and their associated Kalshi series
- Import historical events from Kalshi series
- View mention rates across past events (with search bar for filtering words)
- Upload and manage transcripts
- Quick analysis tools
- Category-based filtering

**Multi-speaker series (e.g. KXMENTION):** Kalshi sometimes places multiple speakers under the same series ticker. The corpus handles this by allowing the same `series_ticker` to be added separately for each speaker (unique constraint is on `(series_ticker, speaker_id)`, not just `series_ticker`). Each speaker gets their own independent `series` row and their own set of imported events. After importing, events not belonging to the target speaker can be deleted from that series row without affecting the other speaker's series.

### Analytics Page (`/analytics`)

- Overall stats: total trades, wins, losses, win rate, total P&L, expected value
- Per-event performance table with expandable trade details
- Shows word-level breakdown: side, entry price, mention rate, edge, result, P&L

### Trade Analytics Page (`/trade-analytics`)

Per-word trade performance analysis, designed to evaluate edge at the word level across speakers. Unlike the Analytics page (which groups by event), Trade Analytics groups by **word** — so you can see your track record for "China" across all events regardless of which speech it was from.

**Speaker Filter:**
- Dropdown selector at the top to filter by individual speakers or "All Speakers" (aggregates across all speakers)
- "All" shows every per-speaker word row across all speakers — the same word may appear multiple times if it was traded for different speakers (e.g. "China" traded for both Trump and Biden appear as two separate rows, each with their own speaker name). This is intentional: merging would hide speaker-level performance differences.
- Individual speaker views show only that speaker's word rows, with no Speaker column

**Summary Cards (6 boxes at top):**
- Total Trades — count of resolved trades
- Wins — total wins
- Losses — total losses
- Win Rate — percentage
- Total P&L — dollar amount, green/red colored
- EV (Expected Value) — average P&L per trade (`totalPnl / totalTrades`), green/red colored

**Per-Word Performance Table:**

Sorted by P&L descending (highest profit words at top). Columns:

| Column | Description | Shown when |
|--------|-------------|------------|
| Word | The word/phrase traded | Always |
| Speaker | Name of the speaker this word belongs to | **"All Speakers" tab only** — hidden on individual speaker views |
| Side | YES/NO badge (green/red). Shows "mixed" if both sides traded | Always |
| # Trades | Number of resolved trades for this word | Always |
| Avg Entry | Average entry price in cents. **Hover tooltip** shows all individual entries horizontally (e.g. "72¢, 15¢, 30¢") sorted most recent first — important for spotting if the average masks wide variation | Always |
| Win Rate | Combined format: percentage + W/L record, e.g. `67% (2W / 1L)`. Fixed-width formatting for vertical alignment. Normal text color (not green/red) | Always |
| Edge | `Win Rate - Avg Entry`. Green if positive (paying less than win rate), red if negative (overpaying). This is the core metric — positive edge means profitable long-term | Always |
| P&L | Dollar P&L, green/red colored | Always |

The `colSpan` on expandable sub-table rows adjusts dynamically: 9 columns when Speaker column is visible ("All" mode), 8 columns otherwise.

**Expandable Word Rows:**
- Click any word row to expand and see individual trade details
- Expand shows a sub-table with columns: Event (event title), Side (YES/NO badge), Date, Entry (price in cents), Result (W/L), P&L
- Trade details sorted by most recent first (chronologically descending by `created_at`)

**Key Concept — Edge:**
- `Edge = Win Rate - Average Entry Price`
- Positive edge = you're paying less than what the word is actually worth based on your results
- Negative edge = you're overpaying relative to your actual win rate
- Example: 67% win rate with 42¢ avg entry = +25% edge (buying at 42¢ something worth 67¢)
- Use this to identify words where you need better entries (lower price) or should stop trading entirely

**Data Source:**
- Only uses **resolved** trades (where `result` is not null)
- Groups trades by `speakerId|wordNormalized` key (one row per speaker+word combination)
- Fetches from `trades`, `words`, `events`, and `speakers` tables
- Entries array is sorted by `created_at` descending (most recent first) for the hover tooltip

**"All" aggregation:** Does **not** merge same words across speakers. The `all` result set is the union of all per-speaker word rows, preserving individual `speakerName` on each row. This means the same word (e.g. "China") appears as separate rows if it was traded for multiple speakers. The summary cards (total trades, wins, wins rate, P&L, EV) are still aggregated across everything.

**Expandable row key:** Uses `${speakerName}|${word}|${index}` as the React key and expand/collapse key to handle duplicate word names across speakers in "All" mode.

**API:** `GET /api/analytics/trade-analytics`

**Response shape:**
```typescript
{
  speakers: SpeakerData[];  // Per-speaker breakdown
  all: SpeakerData;         // Aggregated across all speakers
}

interface SpeakerData {
  speakerId: string;
  speakerName: string;
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;          // 0-1 decimal
    totalPnlCents: number;
    totalPnlDollars: string;  // Formatted, e.g. "2.14"
    ev: string;               // Per-trade EV in dollars, e.g. "0.11"
  };
  words: WordRow[];           // Sorted by pnlCents descending
}

interface WordRow {
  word: string;
  speakerName: string;        // Speaker name (e.g. "Trump", "Biden") — always present, used to render the Speaker column in "All" mode
  side: string;               // "yes", "no", or "mixed"
  trades: number;
  avgEntry: number;           // 0-1 decimal
  winRate: number;            // 0-1 decimal
  edge: number;               // winRate - avgEntry
  wins: number;
  losses: number;
  pnlCents: number;
  entries: number[];          // Individual entry prices (most recent first)
  tradeDetails: TradeDetail[];
}

interface TradeDetail {
  eventTitle: string;
  eventDate: string | null;
  entry: number;              // 0-1 decimal
  side: string;
  result: string;             // "win" or "loss"
  pnlCents: number;
}
```

### P&L Page (`/pnl`)

Pulls data directly from Kalshi APIs (no CSV uploads needed). **Verified to match Kalshi's official P&L numbers to the penny** (as shown on Kalshi's Documents/Tax page).

**Data Source:** The API route (`/api/pnl/route.ts`) fetches from three Kalshi endpoints in parallel:
- `/portfolio/fills` — Current portfolio fill history
- `/historical/fills` — Historical fill data (before the historical cutoff date)
- `/portfolio/settlements` — Settlement results

Fills are deduplicated by `fill_id` (historical and portfolio endpoints may overlap).

**Kalshi Fill Model (CRITICAL — read before modifying P&L code):**

On Kalshi, **ALL fills create positions**. The `side` field (yes/no) determines the position type, and the `action` field (buy/sell) indicates order book side (taker vs maker), **NOT whether the position is opening or closing**.

- A fill with `side=yes` creates a YES position, regardless of `action`
- A fill with `side=no` creates a NO position, regardless of `action`
- To **exit** a YES position, the user acquires NO contracts (fill with `side=no`). This is NOT a "sell" in the traditional sense — it's buying the opposite side.
- At settlement, offsetting YES+NO pairs net out: one side pays 100¢, the other pays 0¢

This means `action` is **completely irrelevant** for position tracking. The previous (incorrect) implementation treated `action=sell` as closing a position, which caused massive P&L errors (~$204 pre-fee discrepancy, turning losses into gains).

**Two-Phase FIFO Matching Algorithm:**

1. **Phase 1 — Offset Matching:** For each ticker, all fills are sorted chronologically and placed into YES or NO queues based on `side`. Offsetting YES+NO positions are matched FIFO. P&L per offset pair = `100 - yes_price - no_price` per contract. These represent "exits" where the user locked in P&L by acquiring the opposite side.

2. **Phase 2 — Settlement:** Remaining unmatched single-side positions are settled using `market_result`:
   - YES position + market result YES → exit at 100¢ (win)
   - YES position + market result NO → exit at 0¢ (loss)
   - NO position + market result NO → exit at 100¢ (win)
   - NO position + market result YES → exit at 0¢ (loss)

**Fee Handling:**
- Each fill's `fee_cost` (string dollar amount, e.g. `"0.03"`) is converted to cents and tracked per position entry
- For offset matches (Phase 1), fees from both the YES and NO fills are summed
- For settlements (Phase 2), only the original fill's fee is used — settlement has no additional close fee (confirmed via Kalshi CSV export where `close_fees=0` for settled positions)
- The settlement's `fee_cost` field is an **aggregate** of all fees for that market (informational only), NOT an additional fee to add
- When a fill is partially matched, fees are split proportionally with the remainder going to the last match (avoids rounding drift)

**Position Validation:**
- The API validates computed positions against settlement data (`settlement.yes_count` / `settlement.no_count`)
- Any mismatches are returned in `diagnostics.positionMismatches` (should be empty if the fill model is correct)

**5-minute server-side cache** with `?refresh=1` query param to bust cache.

**Timezone Handling:** All dates use **UTC** to match Kalshi's timestamps. The calendar grid, daily P&L map keys, "today" highlight, and per-event table dates all use UTC. The `dailyPnl` entries are keyed by `closeTimestamp.slice(0, 10)` (UTC date from Kalshi). The calendar initial month/year uses `getUTCFullYear()`/`getUTCMonth()`, and per-event dates render with `toLocaleDateString("en-US", { timeZone: "UTC" })`.

**UI Tabs:**

1. **Overview** — Summary cards (Total Trades, Total Profit, Total Fees, Profit After Fees), cumulative P&L line chart (Recharts)
2. **Calendar** — Monthly grid showing daily P&L (net after fees), color-coded cells (green = profit, red = loss), month navigation, monthly stats (P&L, trading days, win rate). Monthly P&L summary shows net value (after fees). An 8th "WEEK" column on the right shows the net weekly P&L for each row (sum of all days in that week), using the same green/red coloring and `dollars()` formatting.

**Per-Event Table** (always visible below either tab):
- Groups trades by event ticker
- **Event titles** resolved via two-tier lookup: first from Supabase `events` table (for events researched in the app), then from Kalshi API `/events/{event_ticker}` as fallback (for events traded but not researched). Falls back to raw ticker if neither source has a title.
- Shows P&L, fees, net per event
- Expandable rows showing individual trade details (ticker, side, qty, entry/exit price, P&L, fees, net)
- Refresh button to pull latest data from Kalshi

**Key Types (P&L API):**

```typescript
interface ProcessedTrade {
  ticker: string;
  side: "yes" | "no";          // The side of the original (opening) position
  quantity: number;
  entryPriceCents: number;     // Entry price in cents (0-100)
  exitPriceCents: number;      // Exit: (100 - opposite_side_price) for offsets, or 0/100 for settlement
  feeCents: number;            // Combined fees from all fills involved in this trade
  pnlCents: number;            // Raw P&L before fees
  pnlAfterFeesCents: number;   // P&L minus fees
  openTimestamp: string;        // When the first fill (opening position) occurred
  closeTimestamp: string;       // When the offsetting fill or settlement occurred
  closedVia: "sell" | "settlement";  // "sell" = offset match, "settlement" = market resolved
}

interface PositionMismatch {
  ticker: string;
  ourYes: number;              // YES contracts we computed from fills
  settlementYes: number;       // YES contracts Kalshi says at settlement
  ourNo: number;               // NO contracts we computed from fills
  settlementNo: number;        // NO contracts Kalshi says at settlement
}
```

**API Response Shape:**

```typescript
{
  summary: {
    totalTrades: number;           // Count of ProcessedTrade entries
    totalPnlCents: number;         // Sum of all pnlCents
    totalFeesCents: number;        // Sum of all feeCents
    totalPnlAfterFeesCents: number; // Sum of all pnlAfterFeesCents
    totalFills: number;            // Raw fill count from Kalshi (after dedup)
    totalSettlements: number;      // Settlement count from Kalshi
  };
  diagnostics: {
    positionMismatches: PositionMismatch[];  // Should be empty
  };
  dailyPnl: DailyPnl[];           // Per-day aggregated P&L
  cumulativePnl: { date, cumulativeCents, dailyCents }[];  // For chart
  events: EventGroup[];           // Trades grouped by event ticker, with resolved titles
  trades: ProcessedTrade[];       // All individual trades
}
```

---

## UI Component Details

### WordTable

**File:** `src/components/research/WordTable.tsx`

The primary word analysis table on the research page. Always visible regardless of whether research has been run. Merges data from three sources: word scores (research results), live Kalshi prices (WebSocket), and corpus mention history.

**Features:**
- **Search bar** — Text input at the top filters words by name as you type (same pattern as `MentionHistoryTable` on corpus page). Uses internal `useState` with `useMemo` for filtering.
- **Speaker selector** — Dropdown to select speaker for loading historical mention rates from corpus
- **Category filter** — Multi-select dropdown to filter by corpus event categories (e.g. "This event" vs specific categories). When categories are selected, only shows words that exist in that category's corpus data.
- **Refresh Markets button** — Fetches latest market prices from Kalshi API
- **Sortable columns** — Word, Yes Price, Historical Rate, Edge (default sort: edge descending)
- **No Price column** — Shows the No-side ask price alongside the Yes-side ask price. Derived from `1 - yesAsk` on initial load (before WebSocket data arrives), then updated via WebSocket `noAsk` (computed as `1 - yesBid`) once live data flows in. See [Price Architecture](#price-architecture-yes--no) below.
- **Expandable rows** — Click a word row to see event-by-event mention history (which events the word was mentioned in, with dates and MENTIONED/NOT MENTIONED badges)
- **Color-coded rates** — Historical rate badges: green (>=60%), yellow (>=30%), red (>0%), grey (no data)
- **Edge coloring** — Uses `edgeColor()` from `ui-utils.ts` for positive/negative edge styling

**Props interface:**
```typescript
interface WordTableProps {
  wordScores: WordScore[];
  livePrices: Record<string, PriceData>;
  mentionData: MentionHistoryRow[];
  mentionLoading: boolean;
  speakers: Array<{ id: string; name: string }>;
  selectedSpeakerId: string;
  onSpeakerChange: (speakerId: string) => void;
  categories?: string[];
  selectedCategories?: string[];
  onCategoriesChange?: (categories: string[]) => void;
  allWords?: Array<{ id: string; word: string; kalshi_market_ticker: string }>;
  onRefreshMarkets?: () => Promise<void>;
  refreshing?: boolean;
}
```

**Internal state:** `sortKey`, `sortAsc`, `expandedWord`, `catDropdownOpen`, `search`

**WordRow interface (internal):**
```typescript
interface WordRow {
  word: string;
  marketTicker: string;
  currentPrice: number;     // Yes ask price (0-1 scale)
  noPrice: number;          // No ask price (0-1 scale) — see Price Architecture section
  historicalRate: number | null;
  edge: number | null;
  sampleYes: number | null;
  sampleTotal: number | null;
  events: MentionEventDetail[];
}
```

**Table columns (in order):** Word | Yes Price | No Price | Historical Rate | Edge | Sample | expand arrow

**Data flow:** Builds `WordRow[]` by merging `wordScores` + `livePrices` + `mentionRateMap` (from corpus). Also includes "unscored" words from `allWords` that don't have research scores yet (newly added markets). `noPrice` is derived from `livePrices[ticker].noAsk` when available, falling back to `1 - currentPrice`. Filtering pipeline: category filter → search filter → sort.

### QuickTradeTable

**File:** `src/components/research/QuickTradeTable.tsx`

Standalone trade logging table that works **without running research**. Renders in the Trade Log tab when no word scores exist (i.e. research hasn't been run). Uses the event's `words` list from Supabase (populated by `/api/events/load`) instead of requiring `wordScores` from the research pipeline.

**Features:**
- **Search bar** — Text input filters words by name (same pattern as `WordTable`)
- **Sortable columns** — Word (alphabetical, default), Yes Price, No Price
- **Inline trade form** — Same trade form as `WordScoresTable` (side/price/contracts/editable cost)
- **Trade count badge** — Shows `Trade (N)` when trades exist for a word
- **Live prices** — Shows real-time prices from WebSocket when available, `-` for settled markets

**Props interface:**
```typescript
interface QuickTradeTableProps {
  words: Word[];
  livePrices: Record<string, PriceData>;
  trades: Trade[];
  tradeFormWordId: string | null;
  tradeForm: TradeForm;
  tradeLoading: boolean;
  onTradeFormWordId: (id: string | null) => void;
  onTradeFormChange: (form: TradeForm) => void;
  onSubmitTrade: (wordId: string) => void;
}
```

**Internal state:** `search`, `sortKey`, `sortAsc`

**Conditional rendering in Trade Log tab:**
```typescript
{wordScores.length > 0 ? (
  <WordScoresTable ... />    // Research has been run — show AI scores + trade form
) : (
  <QuickTradeTable ... />    // No research — show simple word list + trade form
)}
```

### WordScoresTable

**File:** `src/components/research/WordScoresTable.tsx`

Detailed AI-generated scores table, visible after research pipeline completes. Shows probability breakdowns from each agent and allows inline trade logging.

**Features:**
- **Cluster filter** — Filter by word clusters (thematic groups identified by the clustering agent)
- **Sortable columns** — Word, Est. %, Market, Edge, Confidence
- **Expandable rows** — Click to see agent reasoning, key evidence, and probability breakdown (historical, agenda, news, base rate)
- **Inline trade form** — Click trade button to open side/price/contracts/cost form directly in the table row (see [Trade Form](#trade-form) below)
- **Confidence badges** — Color-coded high/medium/low badges via `confBadge()` from `ui-utils.ts`
- **Live price column** — Real-time prices from WebSocket, color-coded vs initial market price

**Props:** Receives `wordScores`, `clusters`, `livePrices`, `trades`, trade form state/handlers, sort state, cluster filter state, `researchRunning` flag.

### Trade Form

**Location:** Inline within `WordScoresTable` rows and `QuickTradeTable` rows

The trade form allows logging trades with precise cost tracking for both limit and market orders. The same form pattern is used in both components — both use the shared `tradeForm`/`tradeFormWordId` state from the research page.

**Fields:**
- **Side** — YES/NO toggle buttons
- **Price** — Entry price as a decimal (e.g. `0.116` for 11.6¢). Supports sub-cent precision with `step="0.001"`, `min="0.001"`, `max="0.999"`
- **Contracts** — Number of contracts (integer)
- **Cost ($)** — Total cost in dollars (e.g. `1.16`). Auto-calculated from `price × contracts` when Price or Contracts change, but **editable** for market order fills where the actual cost differs from `price × contracts`

**TradeForm interface:**
```typescript
interface TradeForm {
  side: "yes" | "no";
  entryPrice: number;   // Decimal 0-1 (e.g. 0.85 = 85¢)
  contracts: number;     // Integer
  totalCost: number;     // Dollars (e.g. 1.16 = $1.16)
}
```

**Data flow:**
1. User enters price + contracts → cost auto-fills as `price × contracts`
2. User can override cost for market orders (actual fill cost from Kalshi)
3. On submit, `totalCost` is converted to cents (`totalCost * 100`) and sent to API as `totalCostCents`
4. API stores `totalCostCents` as `total_cost_cents` (REAL column) in the `trades` table
5. Settlement P&L uses `total_cost_cents` directly — no rounding anywhere in the chain

**Why this matters:** Market orders on Kalshi fill across multiple price levels, so `price × contracts` doesn't equal the actual cost. The editable cost field lets you enter the exact total from Kalshi's order history.

### MentionHistoryTable

**File:** `src/components/corpus/MentionHistoryTable.tsx`

Word mention history table on the corpus page. Shows how often each word has been mentioned across past events for the selected speaker.

**Features:**
- **Search bar** — Text input filters words by name (same pattern as `WordTable`)
- **Sortable columns** — Word, Yes, No, Total, Rate
- **Expandable rows** — Click to see event-by-event breakdown with MENTIONED/NOT MENTIONED badges
- **Color-coded rates** — Same rate coloring as `WordTable`

**Internal state:** `sortKey`, `sortAsc`, `expandedWord`, `search`

---

## API Routes

### Events

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/events/load` | POST | Load event from Kalshi URL/ticker. Creates/updates event + words in Supabase. Saves **all** markets regardless of status (active, settled, closed, etc.) |
| `/api/events/list` | GET | List events that have at least one research run OR logged trades. Queries both `research_runs` and `trades` tables in parallel for event IDs |
| `/api/events/speaker` | PATCH | Assign speaker to event `{ eventId, speakerId }` |
| `/api/events/notes` | PATCH | Save research notes `{ eventId, field: "pre_event_notes" or "post_event_notes", value }` |
| `/api/events/refresh-markets` | POST | Refresh market prices from Kalshi |

### Research

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/research/trigger` | POST | Start research pipeline. Body: `{ eventId, modelPreset, corpusCategories }` |
| `/api/research/[eventId]` | GET | Get research results (scores, clusters, briefing, agent outputs) |
| `/api/research/status/[runId]` | GET | Poll pipeline progress (completed agents, current agent) |
| `/api/research/stop` | POST | Cancel running research `{ runId }` |

### P&L

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/pnl` | GET | Full P&L data from Kalshi fills + settlements. Resolves event titles from Supabase + Kalshi API fallback. Add `?refresh=1` to bust cache |
| `/api/pnl/debug` | GET | Diagnostic endpoint: fill counts per source, historical cutoff, position validation |

Returns: `{ summary, diagnostics, dailyPnl, cumulativePnl, events, trades }`

### Trades

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/trades/log` | POST | Log a trade `{ eventId, wordId, side, entryPrice, contracts, totalCostCents }` |
| `/api/trades/results` | GET/POST | Get or set trade results |
| `/api/trades/[tradeId]` | DELETE | Delete a logged trade |

**Trade log body details:**
- `entryPrice` — Decimal 0-1 (e.g. `0.116` for 11.6¢)
- `contracts` — Integer count
- `totalCostCents` — Total cost in cents as a float (e.g. `116.0` for $1.16). Stored as REAL in Postgres, no rounding.

### Corpus

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/corpus/speakers` | GET/POST | List or create speakers |
| `/api/corpus/series` | GET/POST | List or create series (link Kalshi series to speakers). POST returns 409 if the `(series_ticker, speaker_id)` pair already exists — same ticker can be added for multiple speakers |
| `/api/corpus/series/events` | GET | Get events in a series |
| `/api/corpus/categories` | GET | Get corpus categories for a speaker |
| `/api/corpus/import-historical` | POST | Bulk import historical events from Kalshi |
| `/api/corpus/mention-history` | GET | Get word mention history |
| `/api/corpus/kalshi-series` | GET | Search Kalshi for series |
| `/api/corpus/quick-prices` | GET | Quick market price lookup. Returns `yesBid`, `yesAsk`, `noAsk`, `lastPrice`, `volume` per market |

### Transcripts

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/transcripts` | GET | List transcripts |
| `/api/transcripts/upload` | POST | Upload a transcript |
| `/api/transcripts/frequencies` | GET | Get word frequencies across transcripts |
| `/api/transcripts/[id]` | GET/DELETE | Get or delete a transcript |
| `/api/transcripts/[id]/download` | GET | Download transcript text |

### Other

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settlement/check` | GET | Check if markets have settled |
| `/api/analytics/performance` | GET | Aggregate performance analytics |
| `/api/analytics/trade-analytics` | GET | Per-word trade analytics grouped by speaker. Returns resolved trades aggregated by word with edge calculations, individual entries, and expandable trade details. Supports "All" aggregation across speakers |
| `/api/ws/prices` | GET | WebSocket proxy for live Kalshi prices |

---

## Key Libraries & Clients

### `src/lib/kalshi-client.ts`

Authenticated Kalshi API client with RSA-PSS request signing.

```typescript
// Make an authenticated Kalshi API call
const res = await kalshiFetch("GET", "/portfolio/fills?limit=200");
const data = await res.json();

// WebSocket headers for real-time data
const headers = getKalshiWsHeaders();
```

### `src/lib/claude-client.ts`

Claude API wrapper with retry, web search, and JSON parsing.

```typescript
// Text response with web search
const result = await callAgent({
  systemPrompt: "You are a research analyst...",
  userMessage: "Research the topic...",
  enableWebSearch: true,
  model: "claude-sonnet-4-5-20250929",
});
// result.content, result.inputTokens, result.outputTokens, result.estimatedCostCents

// JSON response with type safety
const { data } = await callAgentForJson<MyType>({
  systemPrompt: "Return JSON...",
  userMessage: "Analyze...",
});
```

### `src/lib/supabase.ts`

Server-side Supabase client using service role key (bypasses RLS).

```typescript
const supabase = getServerSupabase();
const { data } = await supabase.from("events").select("*").eq("id", eventId).single();
```

### `src/lib/ui-utils.ts`

Shared UI utility functions:
- `edgeColor(edge: number)` — Returns Tailwind color class for edge values (green for positive, red for negative)
- `confBadge(confidence: string)` — Returns Tailwind classes for confidence badges (high/medium/low)

### `src/hooks/useLivePrices.ts`

React hook for real-time Kalshi price updates via WebSocket. Returns `Record<string, PriceData>` keyed by market ticker. Computes `noAsk` as `1 - yesBid` since the Kalshi WS ticker channel does not include no-side price fields (see [Price Architecture](#price-architecture-yes--no)).

### `src/lib/url-parser.ts`

Parses Kalshi URLs and raw event tickers. Supports formats like `https://kalshi.com/markets/KXTRUMPMENTION-27FEB26` and `KXTRUMPMENTION-27FEB26`.

### `src/lib/settlement.ts`

Settlement logic — resolves events by recording word mention results and calculating trade P&L.

**P&L Calculation:**
- Uses `total_cost_cents` from the trade record (the exact cost the user entered) for P&L
- Falls back to `entry_price * contracts * 100` for older trades that may have `null` total_cost_cents
- Win P&L: `contracts * 100 - costCents` (payout minus cost)
- Loss P&L: `-costCents` (lose the entire cost)
- No rounding — preserves sub-cent precision throughout

```typescript
const costCents = trade.total_cost_cents ?? trade.entry_price * trade.contracts * 100;
const pnlCents = isWin
  ? trade.contracts * 100 - costCents
  : -costCents;
```

---

## Deployment

### Fly.io

The app deploys to Fly.io using a multi-stage Docker build (Node 22 Alpine).

```bash
# Deploy
fly deploy

# Set secrets
fly secrets set KALSHI_API_KEY=... KALSHI_PRIVATE_KEY="..." \
  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  ANTHROPIC_API_KEY=...
```

**Config (`fly.toml`):**
- App name: `kalshi-research`
- Region: `sin` (Singapore)
- Internal port: 3000
- VM: shared CPU, 512MB RAM
- Auto-stop/start enabled
- Health check: GET `/` every 30s

**Dockerfile:** Uses Next.js standalone output (`output: 'standalone'` in next.config). Three stages: deps → builder → runner.

---

## Running Locally

```bash
# Install dependencies
npm install

# Set up environment variables (add your keys to .env.local)

# Run dev server
npm run dev

# Build for production
npm run build
npm start
```

The dev server runs on port 3000 (or next available if occupied). Turbopack is enabled for fast HMR — component changes hot-reload without restarting.

---

## Migrations

All migrations are in `supabase/migrations/` and have been applied to the live database.

| # | File | Description |
|---|------|-------------|
| 001 | `001_initial_schema.sql` | Core schema: events, words, word_clusters, research_runs, word_scores, transcripts, trades, event_results, views (event_performance, calibration_data), indexes |
| 002 | `002_rls_policies.sql` | Row Level Security policies |
| 003 | `003_dashboard_redesign.sql` | `briefing TEXT` on research_runs, `word_frequencies JSONB` on transcripts, `cancelled` status |
| 004 | `004_speakers_and_series.sql` | `speakers` + `series` tables, `series_id UUID` on events |
| 005 | `005_event_speaker_id.sql` | `speaker_id UUID` FK on events |
| 006 | `006_excluded_tickers.sql` | `excluded_tickers TEXT[]` on series (for multi-speaker series) |
| 007 | `007_corpus_categories.sql` | `events.category TEXT`, `research_runs.corpus_category TEXT` |
| 008 | `008_recent_recordings.sql` | `research_runs.recent_recordings_result JSONB` |
| 009 | `009_event_notes.sql` | `events.pre_event_notes TEXT`, `events.post_event_notes TEXT` |
| 010 | `010_total_cost_real.sql` | `trades.total_cost_cents` changed from `INTEGER` to `REAL` for sub-cent precision |
| 011 | `011_series_ticker_per_speaker.sql` | Changed `series.series_ticker` uniqueness from global `UNIQUE` to `UNIQUE(series_ticker, speaker_id)`. Fixes: Kalshi series like `KXMENTION` that cover multiple speakers can now be added independently per speaker. Previously, adding the same ticker for a second speaker would throw a 409 "already exists" error. |

To apply new migrations, use the Supabase Management API (never ask the user to do it manually):

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/hczppfsuqtpccxvmyaue/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE ..."}'
```

---

## Important Patterns & Gotchas

### Timezone Handling (UTC Everywhere)

All dates in the app use **UTC** to match Kalshi's API timestamps. This is critical for consistency:

- **P&L Calendar:** `calYear`/`calMonth` state initialized from `getUTCFullYear()`/`getUTCMonth()`. Calendar cells build date strings from these UTC values. The "today" highlight uses UTC components. The calendar uses an 8-column grid (`grid-cols-[repeat(7,1fr)_auto]`) with days chunked into weekly rows and a fixed-width (w-20) weekly summary column on the right.
- **Daily P&L map:** Keys are `closeTimestamp.slice(0, 10)` — the UTC date portion of Kalshi's close timestamp.
- **Per-event table dates:** Rendered with `toLocaleDateString("en-US", { timeZone: "UTC" })` to avoid local timezone shifting the displayed date.
- **Why this matters:** The user may be in a timezone ahead of UTC (e.g. UTC+8). Without UTC handling, a trade closing at `2026-03-07T16:41Z` would display as March 8 in local time, creating a mismatch between the calendar and per-event table.

### Trade Cost Precision

The trade logging system preserves exact cost values with no rounding:

- **Frontend:** `TradeForm.totalCost` is a float in dollars. The Cost ($) input uses `parseFloat`, not `parseInt`. Auto-calculated from `price × contracts` but manually editable for market orders.
- **Submission:** Converted to cents at submit time: `totalCost * 100` → `totalCostCents`
- **API:** `totalCostCents` passed through to Supabase without modification
- **Database:** `trades.total_cost_cents` is `REAL` (not INTEGER) — stores sub-cent values like `11.6`
- **Settlement:** P&L uses `total_cost_cents` directly, falls back to `entry_price * contracts * 100` for legacy trades
- **No `Math.round()` anywhere** in the cost chain from form to database to settlement

### Search Bars

Both `WordTable` (research page) and `MentionHistoryTable` (corpus page) implement the same search pattern:
- Internal `useState("")` for search text
- `useMemo` filtering that runs `.toLowerCase().includes(searchLower)` on the word name
- Full-width text input with consistent styling: `bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500`
- Search composes with other filters (category filter in `WordTable`, none in `MentionHistoryTable`)

When adding search to other tables, follow this same pattern for consistency.

### Kalshi Fill Matching (P&L)

**CRITICAL: On Kalshi, ALL fills create positions.** The `side` field determines position type (YES or NO). The `action` field (buy/sell) indicates order book side (taker/maker) and is **irrelevant for position tracking**. Do NOT use `action` to determine if a fill opens or closes a position — this was a previous bug that caused ~$204 P&L error.

- Exiting a position = acquiring the opposite side (e.g., to exit YES, buy NO contracts)
- The P&L API fetches from both `/portfolio/fills` AND `/historical/fills`, then deduplicates by `fill_id`
- **Two-phase FIFO matching:**
  1. Match offsetting YES vs NO positions per ticker (FIFO). P&L = `100 - yes_price - no_price` per contract
  2. Settle remaining single-side positions at 0 or 100 based on `market_result`
- Prices in fills are in integer cents (0-100 scale)
- Fee cost comes as a string dollar amount (e.g. `"0.03"`) — multiply by 100 for cents
- Settlement `fee_cost` is an aggregate total (informational), NOT an additional fee — do not add it to trade fees
- Position counts are validated against `settlement.yes_count` / `settlement.no_count` — mismatches indicate a bug in fill processing

### Supabase

- Default 1000-row limit on queries — always paginate for large datasets
- Use service role key for all server-side writes (bypasses RLS)
- The `transcripts` table has a unique constraint on `(speaker, title, event_date)` — use upsert

### Claude API

- Web search is a **server-side tool** — Anthropic's infrastructure executes searches within the API call. No client-side search needed.
- Handle `pause_turn` stop reason by re-sending the response to resume (the server-side tool loop hit its iteration limit)
- JSON responses from Claude may need extraction from code fences — `parseJsonResponse` handles this with 3 fallback strategies
- Retries on 429, 500, 502, 503, 529, and connection errors with exponential backoff (3s base, 4 retries max)
- If JSON parsing fails, `callAgentForJson` auto-retries by asking Claude to fix the malformed JSON

### Research Pipeline

- Phase 1 agents run in parallel via `Promise.allSettled` — individual failures don't crash the pipeline
- Results are saved to Supabase after each phase (non-critical — DB errors are logged but don't stop the pipeline)
- Pipeline supports cancellation: each phase checks `research_runs.status` before proceeding
- Transcript metadata from the historical agent is cached in the `transcripts` table for future runs
- Token usage and cost are tracked cumulatively across all agents and saved to the research run record

### Price Architecture (Yes + No)

The Word Analysis table shows both **Yes Price** (yes_ask) and **No Price** (no_ask) columns. Prices flow through two paths:

**1. WebSocket (real-time updates via `useLivePrices` hook):**

The Kalshi WebSocket `ticker` channel sends these fields per message:
```
market_id, market_ticker, price, yes_bid, yes_ask, price_dollars,
yes_bid_dollars, yes_ask_dollars, volume, volume_fp, open_interest,
open_interest_fp, dollar_volume, dollar_open_interest, yes_bid_size_fp,
yes_ask_size_fp, last_trade_size_fp, ts, time, Clock
```

**The WS ticker channel does NOT send `no_ask_dollars` or any no-side fields.** However, for Kalshi binary markets, `no_ask = 1 - yes_bid` exactly (verified against REST API `no_ask_dollars` on live markets). This is because buying a No contract at the ask is economically equivalent to selling a Yes contract at the bid — they are two sides of the same order book.

The `useLivePrices` hook computes: `noAsk = yesBid > 0 ? 1 - yesBid : 0`

When `yesBid` is 0 (no bids on the yes side), `noAsk` is set to 0, which the UI renders as "—". This is correct — if no one is bidding on Yes, there's no meaningful No ask price to derive.

**2. REST API (initial load + quick-prices):**

The REST endpoint `GET /events/{eventTicker}` returns full market objects including `no_ask_dollars` directly. The `/api/corpus/quick-prices` route reads this field and returns it as `noAsk`.

**3. WordTable fallback (before WS connects):**

Before the first WebSocket tick arrives, `livePrices` is empty. `WordTable` falls back to deriving No Price from the existing Yes price: `noPrice = 1 - currentPrice` (where `currentPrice` comes from `market_yes_price` stored in the DB). This uses `yesAsk` rather than `yesBid`, so it's approximate (off by the bid-ask spread), but ensures the No Price column is populated immediately on page load rather than showing "—" until WS connects.

```typescript
// In WordTable row building:
const noPrice = live?.noAsk || (currentPrice > 0 ? 1 - currentPrice : 0);
```

**PriceData interface:**
```typescript
interface PriceData {
  yesBid: number;    // Best bid for YES contracts
  yesAsk: number;    // Best ask for YES contracts (price to buy YES)
  noAsk: number;     // Best ask for NO contracts (price to buy NO) — computed as 1 - yesBid from WS
  lastPrice: number; // Last trade price
  volume: string;
  openInterest: string;
}
```

### WebSocket Prices

- `useLivePrices` hook connects to Kalshi's WebSocket via a server-side proxy at `/api/ws/prices`
- Provides real-time price updates for word contracts on the research page
- Returns `Record<string, PriceData>` where keys are market tickers
- The proxy (`/api/ws/prices`) subscribes to the `ticker` channel and forwards raw `data.msg` objects via Server-Sent Events (SSE)

### Auto-Save Notes

- `ResearchNotes` component uses 800ms debounced auto-save via `setTimeout`
- No save button — typing triggers save automatically
- Shows "Saving..." / "Saved" indicator per field
- API: `PATCH /api/events/notes` with `{ eventId, field, value }`

### Event Ticker Parsing (P&L)

- Individual market tickers follow the pattern `EVENT_TICKER-SUFFIX` (e.g. `KXTRUMPMENTION-27FEB26-ECONOMY`)
- To group trades by event, the P&L code splits on `-` and takes all parts except the last: `parts.slice(0, -1).join("-")`

### Component Architecture

- Research page (`src/app/research/[eventId]/page.tsx`) is a single `"use client"` page component that manages all state and passes props down to child components
- Components in `src/components/research/` are presentational — they receive data via props, with state management living in the page
- Exception: `WordTable` and `MentionHistoryTable` manage their own internal UI state (search, sort, expand) since these are self-contained interactions
- `EventContext` is a presentational component (not a React context) that displays event format, agenda, news cycle, and trending topics from phase 1 agent results
- `LoggedTrades` appears in **two locations**: Research tab (when settled, for note-writing convenience) and Trade Log tab (always)

### AI Agent Response Defensiveness

AI agents (Claude) may return JSON in unexpected shapes — missing fields, alternative structures, or error objects instead of the expected schema. All components that consume agent results must use optional chaining (`?.`) when accessing nested properties, especially arrays.

**Known patterns:**
- `EventContext.tsx` — Uses `?.length` on `sourcesFound`, `relatedWords`, `wordsUsed`, and `data.relatedWords` because these may be absent from agent output
- `RecentRecordings.tsx` — The recent recordings agent may return `{ recordings: [...] }` (success) OR `{ status: "error", available_content: [...], recommendations: [...] }` (when it can't find URLs). The component handles both shapes.
- **General rule:** Never trust that an AI-generated JSONB field has the exact shape defined in the TypeScript interface. Always use optional chaining on nested array/object access from `research_runs.*_result` columns.

### Kalshi WebSocket Ticker Fields

The Kalshi WS `ticker` channel does **NOT** include no-side price fields (`no_ask_dollars`, `no_bid_dollars`). It only sends yes-side prices (`yes_bid_dollars`, `yes_ask_dollars`). For binary markets, the no-side prices can be derived:

- `no_ask = 1 - yes_bid` (price to buy No = complement of best Yes bid)
- `no_bid = 1 - yes_ask` (price to sell No = complement of best Yes ask)

This was verified against the Kalshi REST API `no_ask_dollars` on live markets (e.g. `KX60MINMENTION-26MAR09`) — the values match exactly. The `useLivePrices` hook uses this derivation. The REST API (`GET /events/{ticker}`, `GET /markets/{ticker}`) does return `no_ask_dollars` directly.

### Trade Logging Without Research

Trade logging is **decoupled from the research pipeline**. The Trade Log tab works in two modes:

1. **No research run** → `QuickTradeTable` renders using the event's `words` array (always available after `/api/events/load`)
2. **Research completed** → `WordScoresTable` renders with full AI scores, probabilities, and inline trade form

The trade logging API (`/api/trades/log`) handles both cases gracefully:
- When research exists: records `agent_estimated_probability` and `agent_edge` from the latest word score
- When no research exists: these fields are `null` — the trade is still logged with all other fields populated

**Home page event visibility:** Events appear in the home page "Researched Events" list if they have at least one research run OR at least one logged trade. This ensures events with trades (but no research) remain accessible for editing/viewing.

### Event Loading — Market Status Filter

The `/api/events/load` route saves **all markets** returned by the Kalshi API for an event, regardless of their status (active, open, settled, closed, finalized). Previously it filtered to only `active`/`open` markets, which caused settled/ended events to have zero or few words saved. This was changed because:
- Users need to log trades for events that have already ended
- The word list is needed for `QuickTradeTable` to render in the Trade Log tab
- Settled markets still have valid ticker and word data even without live prices

### Multi-Speaker Kalshi Series (KXMENTION et al.)

Some Kalshi series cover multiple speakers under one ticker (e.g. `KXMENTION` includes events for any speaker who might be mentioned). The corpus handles this with a per-`(speaker_id, series_ticker)` uniqueness model:

- **One `series` row per (speaker, ticker) pair** — `KXMENTION` for Gavin Newsom and `KXMENTION` for Pete Hegseth are separate rows with independent event sets.
- **Workflow:** Add the series for a speaker → import historical events → delete events that belong to other speakers from that series row. Each speaker's row is independent, so deleting events from one does not affect the other.
- **Unique constraint:** `UNIQUE(series_ticker, speaker_id)` (migration 011). The old global `UNIQUE(series_ticker)` constraint caused a false 409 "already exists" error when attempting to add the same ticker for a second speaker.
- **`excluded_tickers` column** (`TEXT[]` on `series`, migration 006) — an earlier mechanism for filtering out specific sub-tickers from a multi-speaker series. Still present but the primary workflow is now to delete non-relevant events after import.

### Dead Code Policy

- Unused components should be deleted, not left in the codebase
- If a component is not imported anywhere, it is dead code and should be removed
- The project previously had a `WordAnalysisTable.tsx` component that was never imported — it has been deleted
