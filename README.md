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
│   │   ├── layout.tsx                # Root layout with nav (Corpus, Analytics, P&L)
│   │   ├── research/
│   │   │   └── [eventId]/page.tsx    # Research output page (tabs: Research, Sources, Trade Log)
│   │   ├── corpus/
│   │   │   └── page.tsx              # Corpus management (speakers, series, transcripts)
│   │   ├── analytics/
│   │   │   └── page.tsx              # Performance analytics (logged trades, win rates)
│   │   ├── pnl/
│   │   │   └── page.tsx              # P&L dashboard (Overview + Calendar tabs, per-event table)
│   │   └── api/
│   │       ├── events/
│   │       │   ├── load/route.ts     # POST — load event from Kalshi URL/ticker
│   │       │   ├── list/route.ts     # GET — list previously researched events
│   │       │   ├── speaker/route.ts  # PATCH — assign speaker to event
│   │       │   ├── notes/route.ts    # PATCH — save pre/post event notes
│   │       │   └── refresh-markets/route.ts  # POST — refresh market prices
│   │       ├── research/
│   │       │   ├── trigger/route.ts  # POST — trigger research pipeline
│   │       │   ├── [eventId]/route.ts # GET — fetch research results
│   │       │   ├── status/[runId]/route.ts # GET — poll pipeline progress
│   │       │   └── stop/route.ts     # POST — cancel running research
│   │       ├── pnl/
│   │       │   └── route.ts          # GET — P&L from Kalshi fills + settlements
│   │       ├── trades/
│   │       │   ├── log/route.ts      # POST — log a trade
│   │       │   ├── results/route.ts  # GET/POST — trade results & settlement
│   │       │   └── [tradeId]/route.ts # DELETE — remove a logged trade
│   │       ├── analytics/
│   │       │   └── performance/route.ts # GET — aggregate performance stats
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
│   │   │   ├── EventContext.tsx      # React context for event data
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
│       └── 010_total_cost_real.sql   # trades.total_cost_cents INTEGER → REAL (sub-cent precision)
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
| `series` | Kalshi series linked to speakers | `speaker_id`, `series_ticker`, `excluded_tickers` |

### Views

- `event_performance` — Aggregated trade performance per event (wins, losses, win rate, P&L)
- `calibration_data` — Predicted probability vs actual outcome for calibration analysis

### Migrations

All 10 migrations (001-010) are applied to the live Supabase instance. Run migrations via the Supabase Management API:

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
  → /api/events/load (fetches event + markets from Kalshi API, saves to Supabase)
  → User selects speaker, corpus categories, model preset
  → /api/research/trigger (creates research_run, starts orchestrator in background)
  → Orchestrator runs Phase 1 → Phase 2 → Phase 3
  → Results saved to Supabase (research_runs, word_scores, word_clusters)
  → Frontend polls /api/research/status/[runId] for progress
  → /api/research/[eventId] returns full results for display
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
- `RecentRecordings` — Recent recordings discovered by the research pipeline
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
- `WordScoresTable` — Full scores table with inline trade form for logging new trades
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

### Analytics Page (`/analytics`)

- Overall stats: total trades, wins, losses, win rate, total P&L, expected value
- Per-event performance table with expandable trade details
- Shows word-level breakdown: side, entry price, mention rate, edge, result, P&L

### P&L Page (`/pnl`)

Pulls data directly from Kalshi APIs (no CSV uploads needed).

**Data Source:** The API route (`/api/pnl/route.ts`) fetches:
- `/portfolio/fills` — Current portfolio fill history
- `/historical/fills` — Historical fill data
- `/portfolio/settlements` — Settlement results

Then uses **FIFO matching** to pair buy fills with sell fills and settlements:
- Buy fills create open positions per ticker/side
- Sell fills close positions via FIFO (first-in-first-out)
- Settlements close remaining open positions when markets resolve
- Most positions close via settlement, not sells

**5-minute server-side cache** with `?refresh=1` query param to bust cache.

**Timezone Handling:** All dates use **UTC** to match Kalshi's timestamps. The calendar grid, daily P&L map keys, "today" highlight, and per-event table dates all use UTC. The `dailyPnl` entries are keyed by `closeTimestamp.slice(0, 10)` (UTC date from Kalshi). The calendar initial month/year uses `getUTCFullYear()`/`getUTCMonth()`, and per-event dates render with `toLocaleDateString("en-US", { timeZone: "UTC" })`.

**UI Tabs:**

1. **Overview** — Summary cards (Total Trades, Total Profit, Total Fees, Profit After Fees), cumulative P&L line chart (Recharts)
2. **Calendar** — Monthly grid showing daily P&L (net after fees), color-coded cells (green = profit, red = loss), month navigation, monthly stats (P&L, trading days, win rate). Monthly P&L summary shows net value (after fees).

**Per-Event Table** (always visible below either tab):
- Groups trades by event ticker
- Shows P&L, fees, net per event
- Expandable rows showing individual trade details (ticker, side, qty, entry/exit price, P&L, fees, net)
- Refresh button to pull latest data from Kalshi

**Key Types (P&L API):**

```typescript
interface ProcessedTrade {
  ticker: string;
  side: "yes" | "no";
  quantity: number;
  entryPriceCents: number;    // Entry price in cents (0-100)
  exitPriceCents: number;     // Exit price: sell price or settlement (0 or 100)
  feeCents: number;
  pnlCents: number;           // Raw P&L = (exit - entry) * quantity
  pnlAfterFeesCents: number;  // P&L minus fees
  openTimestamp: string;
  closeTimestamp: string;
  closedVia: "sell" | "settlement";
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
- **Sortable columns** — Word, Market Price, Historical Rate, Edge (default sort: edge descending)
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

**Data flow:** Builds `WordRow[]` by merging `wordScores` + `livePrices` + `mentionRateMap` (from corpus). Also includes "unscored" words from `allWords` that don't have research scores yet (newly added markets). Filtering pipeline: category filter → search filter → sort.

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

**Location:** Inline within `WordScoresTable` rows

The trade form allows logging trades with precise cost tracking for both limit and market orders.

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
| `/api/events/load` | POST | Load event from Kalshi URL/ticker. Creates/updates event + words in Supabase |
| `/api/events/list` | GET | List all events in Supabase |
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
| `/api/pnl` | GET | Full P&L data from Kalshi fills + settlements. Add `?refresh=1` to bust cache |

Returns: `{ summary, dailyPnl, cumulativePnl, events, trades }`

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
| `/api/corpus/series` | GET/POST | List or create series (link Kalshi series to speakers) |
| `/api/corpus/series/events` | GET | Get events in a series |
| `/api/corpus/categories` | GET | Get corpus categories for a speaker |
| `/api/corpus/import-historical` | POST | Bulk import historical events from Kalshi |
| `/api/corpus/mention-history` | GET | Get word mention history |
| `/api/corpus/kalshi-series` | GET | Search Kalshi for series |
| `/api/corpus/quick-prices` | GET | Quick market price lookup |

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

React hook for real-time Kalshi price updates via WebSocket. Returns `Record<string, PriceData>` keyed by market ticker.

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

- **P&L Calendar:** `calYear`/`calMonth` state initialized from `getUTCFullYear()`/`getUTCMonth()`. Calendar cells build date strings from these UTC values. The "today" highlight uses UTC components.
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

- Kalshi fills represent individual buy/sell actions. Most positions close via **market settlement**, not sells
- The P&L API fetches from both `/portfolio/fills` AND `/historical/fills`, then deduplicates by `fill_id`
- FIFO matching: buy fills create open positions; sell fills close them first-in-first-out; remaining positions close at settlement (100 or 0 cents based on `market_result`)
- Prices in fills are in cents (0-100 scale)
- Fee cost comes as a string dollar amount (e.g. `"0.03"`) — multiply by 100 for cents

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

### WebSocket Prices

- `useLivePrices` hook connects to Kalshi's WebSocket via a server-side proxy at `/api/ws/prices`
- Provides real-time price updates for word contracts on the research page
- Returns `Record<string, PriceData>` where keys are market tickers

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
- The `EventContext` React context provides event data to deeply nested components without prop drilling
- `LoggedTrades` appears in **two locations**: Research tab (when settled, for note-writing convenience) and Trade Log tab (always)

### Dead Code Policy

- Unused components should be deleted, not left in the codebase
- If a component is not imported anywhere, it is dead code and should be removed
- The project previously had a `WordAnalysisTable.tsx` component that was never imported — it has been deleted
