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
15. [Known Kalshi API Breaking Changes](#known-kalshi-api-breaking-changes)

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
| Deployment | Local-only (macOS Launch Agent, `localhost:3000`) |
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
│   │   │   └── [eventId]/page.tsx    # Research output page (tabs: Research, Briefing, Sources, Trade Log)
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
│   │       │   ├── log/route.ts      # POST — log a buy or sell trade (sell uses FIFO matching)
│   │       │   ├── results/route.ts  # GET/POST — trade results & settlement
│   │       │   └── [tradeId]/route.ts # DELETE/PATCH — delete or edit a trade (with sell-aware guards)
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
│   │       │   └── check/route.ts    # POST — check/re-check market settlement
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
│   │   └── synthesizer.ts           # Final synthesis (combines everything + $100 trade recommendations)
│   ├── components/
│   │   ├── research/                 # Research page components
│   │   │   ├── WordTable.tsx         # Main word table — prices, historical rates, edge, search bar, expandable event details
│   │   │   ├── WordScoresTable.tsx   # Detailed AI scores grid — probabilities, confidence, trade form (buy/sell), cluster filter
│   │   │   ├── ResearchNotes.tsx     # Pre/post event notes (auto-save, 800ms debounce)
│   │   │   ├── ResearchBriefing.tsx  # AI-generated briefing + trade recommendations (markdown, rendered in Briefing tab)
│   │   │   ├── AgentOutputAccordion.tsx # Expandable per-agent results
│   │   │   ├── ClusterView.tsx       # Word cluster visualization
│   │   │   ├── EventHeader.tsx       # Event metadata header
│   │   │   ├── EventContext.tsx      # Event context panel (format, agenda, news cycle, trending topics)
│   │   │   ├── QuickTradeTable.tsx   # Standalone trade table for logging buy/sell trades without research (uses words list)
│   │   │   ├── LoggedTrades.tsx      # Trade log with buy/sell display, P&L on buys only, delete with sell-unwind
│   │   │   ├── RunHistory.tsx        # Research run history
│   │   │   ├── ResolveEvent.tsx      # Settlement controls + manual resolve + P&L summary (buy-only, P&L-based W/L)
│   │   │   ├── ProgressMessages.tsx  # Research progress indicator
│   │   │   ├── SourcesTab.tsx        # Sources/transcripts tab
│   │   │   ├── TabNavigation.tsx     # Tab switcher (Research, Briefing, Sources, Trade Log)
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
│       ├── research.ts               # Agent result types, SynthesisResult (incl. tradeRecommendations), orchestrator I/O
│       ├── components.ts             # UI component types (Event, WordScore, Trade, Cluster, SortKey, TabId, etc.)
│       ├── database.ts               # Database row types (DbEvent, DbWord, etc.)
│       ├── kalshi.ts                 # Kalshi API response types
│       └── corpus.ts                 # Corpus-related types (MentionHistoryRow, MentionEventDetail)
├── supabase/
│   └── migrations/                   # SQL migrations (001-012, all applied)
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
│       ├── 011_series_ticker_per_speaker.sql  # UNIQUE(series_ticker) → UNIQUE(series_ticker, speaker_id)
│       └── 012_sell_trades.sql       # Sell trade support: action, exit_price, matched_buy_ids, matched_contracts, realized_pnl_cents + result CHECK allows 'sold'
├── docs/
│   └── kalshi-openapi.yaml           # Full Kalshi OpenAPI spec
├── Dockerfile                        # Multi-stage Node 22 Alpine build (legacy — from previous Fly.io deployment)
├── fly.toml                          # Fly.io config (legacy — app now runs locally via macOS Launch Agent)
├── logs/                             # Launch Agent stdout/stderr logs (gitignored)
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
| `trades` | Logged trades (buy + sell) | `event_id`, `word_id`, `side`, `action` (buy/sell, default buy), `entry_price` (REAL), `contracts` (INTEGER), `total_cost_cents` (REAL), `result` (win/loss/sold), `pnl_cents` (INTEGER), `exit_price` (REAL, sell only), `matched_buy_ids` (UUID[], sell only), `matched_contracts` (INTEGER, tracks sold qty on buys), `realized_pnl_cents` (REAL, P&L from sells) |
| `event_results` | Settlement outcomes per word | `event_id`, `word_id`, `was_mentioned` |
| `speakers` | Registered speakers for corpus | `name` |
| `series` | Kalshi series linked to speakers — one row per (ticker, speaker) pair | `speaker_id`, `series_ticker`, `display_name`, `excluded_tickers`. Unique constraint is `UNIQUE(series_ticker, speaker_id)` — the same Kalshi series (e.g. `KXMENTION`) can be added for multiple speakers independently |

### Views

- `event_performance` — Aggregated trade performance per event (wins, losses, win rate, P&L)
- `calibration_data` — Predicted probability vs actual outcome for calibration analysis

### Migrations

All 12 migrations (001-012) are applied to the live Supabase instance. Run migrations via the Supabase Management API:

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
- Outputs `topRecommendations` (strongest yes/no signals), `researchQuality` assessment, and `tradeRecommendations` (full $100 portfolio construction with limit order prices)
- The `tradeRecommendations` section is the synthesizer's most actionable output — it constructs a complete trade plan as if it were a human trader with $100 to deploy. See [Trade Recommendations](#trade-recommendations-100-budget) below for full details
- **Briefing recovery:** The synthesizer prompt explicitly instructs the model to embed the full briefing inside the JSON `briefing` field (not as separate text before the JSON). However, models occasionally write the briefing as markdown before the JSON block and use a placeholder (e.g. `[Full markdown briefing text above]`) inside the JSON. The orchestrator detects this and recovers the briefing from the raw response text. See [Briefing Placeholder Recovery](#briefing-placeholder-recovery) in Gotchas.

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
- Handles `pause_turn` resumptions (up to 5 continuations) — text content is **accumulated** across continuations (not overwritten), so content from earlier continuations is preserved
- Logs an explicit warning when `stop_reason === "max_tokens"` — the response was truncated and output may be incomplete
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
  → /api/research/trigger (creates research_run, streams SSE progress events)
  → Orchestrator runs Phase 1 → Phase 2 → Phase 3
  → Results saved to Supabase (research_runs, word_scores, word_clusters)
  → SSE completion event sent with token usage, score counts, and any warnings
  → Frontend calls fetchData(), switches to "research" tab, scrolls to top
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

Four tabs: **Research**, **Briefing**, **Sources**, **Trade Log**

**Research Tab:**
- `EventHeader` — Event title, speaker, date, duration, status
- `WordTable` — Primary word analysis table (always visible, see [UI Component Details](#wordtable) below). Speaker selector is a custom dropdown (not native `<select>`) matching the category filter style.
- `WordScoresTable` — Detailed AI-generated scores with inline trade form (visible after research completes)
- `LoggedTrades` — Settled trade results table (visible only when event is resolved, i.e. `isResolved === true`). Shown between WordTable and ResearchNotes for convenient reference while writing post-event notes.
- `ResearchNotes` — Two side-by-side textareas:
  - **Pre-Event Analysis** — Research thoughts before the event
  - **Post-Event Review** — Reflections after trades
  - Auto-saves with 800ms debounce (no save button), shows "Saving..."/"Saved" indicator
  - Stored in `events.pre_event_notes` and `events.post_event_notes`
- `RecentRecordings` — Recent recordings discovered by the research pipeline. Handles two response shapes from the AI agent: (1) standard `{ recordings: [...] }` with clickable video links, and (2) fallback `{ status: "error", available_content: [...], recommendations: [...] }` when the agent couldn't find direct URLs. The fallback renders a "Recent Events" section showing known events (date, type, participants, sources) without links, plus a "Where to find recordings" list of recommendations.
- `AgentOutputAccordion` — Expandable sections showing raw output from each AI agent
- `ClusterView` — Visual grouping of correlated words
- `ProgressMessages` — Real-time progress during research pipeline execution
- `RunHistory` — View/select past research runs

**Briefing Tab:**
- `ResearchBriefing` — AI-generated research briefing rendered as styled markdown. Contains the full analysis narrative, word-by-word assessment, cluster correlation analysis, and the **Trade Recommendations** section with $100 portfolio construction. See [Trade Recommendations](#trade-recommendations-100-budget) and [ResearchBriefing Component](#researchbriefing-component) sections for full details.
- Shows research quality footer (transcripts analyzed, sources consulted, confidence level, caveats)
- Only populated after a research run completes — shows "No briefing available" placeholder otherwise

**Sources Tab:**
- Transcripts found by historical agent
- Recent recordings discovered
- Corpus statistics and mention history

**Trade Log Tab:**
- **Trade logging works without research.** When no research has been run, `QuickTradeTable` renders using the event's `words` list (loaded from Kalshi). When research results exist, `WordScoresTable` renders instead (with AI scores + inline trade form).
- **Buy/Sell support** — Both `QuickTradeTable` and `WordScoresTable` have a BUY/SELL toggle above the YES/NO side buttons. Sell trades FIFO-match against open buys for the same word+side.
- `QuickTradeTable` — Lightweight trade table showing all words with live prices, search, sorting, and inline trade form (action/side/price/contracts/editable cost). Uses `words` from Supabase (always available after event load), not `wordScores` (only available after research).
- `WordScoresTable` — Full scores table with inline trade form for logging new trades (only shown when research has been run)
- `LoggedTrades` — Shows all trades with Action column (BUY/SELL badges), Side, Price (full sub-cent precision), Qty, Cost (dollars), Result (win/loss/sold badges), P&L (dollars, **buy rows only** — sell rows show dash to avoid double-counting). Supports inline editing of entry price and contracts for unmatched buys. Deleting a sell trade unwinds the FIFO match on the associated buys.
- `ResolveEvent` — Settlement controls: "Check Settlement" / "Re-check Settlement" button (persists after resolution), "Manual Resolve" button (hidden after resolution), settlement status feedback, and P&L summary. P&L summary uses **buy trades only** for totals. Win/loss determined by **actual P&L** (positive = win, negative = loss), not the `result` field — so sold trades that lost money count as losses.
- Log trades with action (buy/sell), side, price, contracts, and editable total cost

### Corpus Page (`/corpus`)

- Manage speakers and their associated Kalshi series
- Import historical events from Kalshi series
- View mention rates across past events (with search bar for filtering words)
- Upload and manage transcripts
- Quick analysis tools
- Category-based filtering

**Multi-speaker series (e.g. KXMENTION):** Kalshi sometimes places multiple speakers under the same series ticker. The corpus handles this by allowing the same `series_ticker` to be added separately for each speaker (unique constraint is on `(series_ticker, speaker_id)`, not just `series_ticker`). Each speaker gets their own independent `series` row and their own set of imported events. After importing, events not belonging to the target speaker can be deleted from that series row without affecting the other speaker's series.

### Analytics Page (`/analytics`)

- **Summary cards (8 boxes):** Total Trades, Total Cost, Wins, Losses, Win Rate, Total P&L, EV, ROI
- **Overview/Calendar toggle** (same style as P&L page):
  - **Overview** — Cumulative P&L line chart (Recharts, purple line) built from logged trade data grouped by event date
  - **Calendar** — Monthly grid showing daily P&L from logged trades, color-coded cells (green/red), trade counts, weekly summaries, month navigation, monthly stats header
- **Per-Event Performance table** (always visible below either view):
  - Columns: Event, Date, Trades, Cost, W/L, Win Rate, P&L, ROI
  - Expandable rows showing word-level breakdown: word, side, entry price, contracts, cost, mention rate, result, P&L
  - ROI = P&L / total cost deployed for that event
- **Data source:** Only counts **buy trades** (`action = 'buy'`) for P&L to avoid double-counting with sell trades. Sell P&L is already reflected in the matched buy's `pnl_cents`.
- **W/L counting:** Wins = trades with `result === "win"`. Losses = all other resolved trades (includes both `result === "loss"` AND `result === "sold"`). This ensures the W/L column matches the expanded per-trade dropdown which shows "L" for any non-win trade. Win rate = `wins / total resolved trades`.

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
- `/portfolio/fills` — Current portfolio fill history (primary source of all fills post 2026-03-12 maintenance)
- `/historical/fills` — Historical fill data (before the historical cutoff date; **returns empty array as of 2026-03-12** — all fills now served from `/portfolio/fills`)
- `/portfolio/settlements` — Settlement results

Fills are deduplicated by `fill_id` (historical and portfolio endpoints may overlap).

**⚠️ Kalshi API Breaking Change — 2026-03-12 Maintenance:**

After Kalshi's 2026-03-12 maintenance, the fill and settlement API responses were silently renamed:

| Field (pre-maintenance) | Field (post-maintenance) | Notes |
|---|---|---|
| `count: number` | `count_fp: string` | e.g. `"34.00"` — parse with `parseFloat` |
| `yes_price: number` (cents) | `yes_price_dollars: string` | e.g. `"0.9900"` — multiply by 100 for cents |
| `no_price: number` (cents) | `no_price_dollars: string` | e.g. `"0.0100"` — multiply by 100 for cents |
| `ticker: string` | `market_ticker: string` | `ticker` may still be present; fallback to `market_ticker` |
| Settlement `yes_count: number` | `yes_count_fp: string` | e.g. `"0.00"` |
| Settlement `no_count: number` | `no_count_fp: string` | e.g. `"1.00"` |

The route handles this with `normalizeFill()` and `normalizeSettlement()` functions that read the new field names with fallback to the old ones, so the code is resilient to both formats. Both functions are defined near the top of `src/app/api/pnl/route.ts` and applied immediately after fetching raw data:

```typescript
const portfolioFills = rawPortfolioFills.map(normalizeFill);
const historicalFills = rawHistoricalFills.map(normalizeFill);
const settlements = rawSettlements.map(normalizeSettlement);
```

If Kalshi ever changes field names again, update `normalizeFill()` / `normalizeSettlement()` — all downstream logic (FIFO matching, settlement, fee calculation) continues to use the stable internal interface (`KalshiFill`, `KalshiSettlement`) with integer cents and numeric counts.

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
- Each fill's `fee_cost` (string dollar amount, e.g. `"0.03"`) is converted to cents and tracked per position entry. The `fee_cost` field name is **unchanged** across Kalshi API versions — the normalization layer does not touch it.
- For offset matches (Phase 1), fees from both the YES and NO fills are summed
- For settlements (Phase 2), only the original fill's fee is used — settlement has no additional close fee (confirmed via Kalshi CSV export where `close_fees=0` for settled positions)
- The settlement's `fee_cost` field is an **aggregate** of all fees for that market (informational only), NOT an additional fee to add
- When a fill is partially matched, fees are split proportionally with the remainder going to the last match (avoids rounding drift)

**Position Validation:**
- The API validates computed positions against settlement data (`settlement.yes_count` / `settlement.no_count`). These values are normalized from `yes_count_fp` / `no_count_fp` (strings) if the old integer fields are absent.
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

**Internal state:** `sortKey`, `sortAsc`, `expandedWord`, `catDropdownOpen`, `speakerDropdownOpen`, `search`

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

### Trade Recommendations ($100 Budget)

The synthesizer produces a `tradeRecommendations` field as part of its output, containing a full portfolio construction plan. This is the most actionable part of the research pipeline — it tells the trader exactly what to buy, at what price, and why.

**Design Philosophy:**

The AI acts as an experienced Kalshi mention market trader with $100 to deploy. It does NOT rely on mechanical edge thresholds or automated rules. Instead, it reasons holistically like a human trader — weighing transcript patterns, news cycle momentum, event format, speaker tendencies, recency of word usage, cluster dynamics, and its own judgment. Edge calculations are one signal among many, not a gate.

**Key principles baked into the prompt:**
1. **Ideal entry prices (limit orders)** — Each trade specifies a target entry price, not the current market price. The trader can set limit orders and wait for fills.
2. **Portfolio construction** — Diversification across clusters, concentration limits, mix of high-probability/low-payout and low-probability/high-payout trades.
3. **Cluster correlation awareness** — If "border," "wall," and "immigration" are all correlated, the AI caps exposure to that cluster rather than putting $60 across all of them.
4. **YES and NO side recommendations** — The AI explicitly recommends which side to take. Many profitable trades are on the NO side.
5. **Confidence-based sizing** — High conviction = larger positions. Low confidence = smaller or avoid.
6. **Avoid list** — Words deliberately skipped due to low AI confidence, not because the market price matches. Market price is a signal, not a verdict.
7. **Dollar/cent formatting** — Allocations and costs use dollars (e.g. "$7.00", "$85.22"). Strike prices use cents (e.g. "28¢", "93¢"). The prompt enforces this: "Buy 25 YES contracts at 28¢ ($7.00)".

**Structured JSON output (`tradeRecommendations` field on `SynthesisResult`):**

```typescript
tradeRecommendations: {
  trades: Array<{
    word: string;
    ticker: string;
    side: "yes" | "no";
    targetEntry: number;      // 0-1 decimal — the limit order price
    contracts: number;         // Integer count
    costCents: number;         // targetEntry * 100 * contracts
    reasoning: string;         // 2-3 sentence mini trade thesis
    confidence: "high" | "medium" | "low";
    clusterName: string | null;
    riskNote: string;          // What could make this trade lose
    edgeAtTarget: number;      // Probability of winning minus target entry price
  }>;
  avoid: Array<{
    word: string;
    ticker: string;
    reasoning: string;         // Why the AI is not trading this word
  }>;
  portfolioSummary: {
    totalDeployed: number;     // Total cents across all trades
    budgetRemaining: number;   // 10000 - totalDeployed
    clusterExposure: Array<{
      cluster: string;
      amountCents: number;
      words: string[];
    }>;
    riskNotes: string[];       // Portfolio-level risk observations
    strategy: string;          // 2-3 sentence overall approach summary
  };
}
```

**Cost calculation:** `costCents = targetEntry * 100 * contracts`. For YES trades, `targetEntry` is the YES price. For NO trades, `targetEntry` is the NO price (i.e. `1 - yesPrice`).

**Budget constraint:** The AI targets $70-$90 deployed out of $100, leaving a buffer for limit order adjustments.

**Data flow:** The `tradeRecommendations` JSON is stored in the `research_runs.synthesis_result` JSONB column alongside `wordScores`, `topRecommendations`, and `researchQuality`. It flows through the API unchanged and is available on the frontend via `researchSummary.synthesis`. The human-readable version is embedded in the `briefing` markdown under the heading "## Trade Recommendations ($100 Budget)".

**Rendering:** The trade recommendations appear in two forms:
1. **Briefing markdown** (Briefing tab) — Human-readable tables, commentary, risk notes, and portfolio summary rendered by `ResearchBriefing`
2. **Structured JSON** (Agent Raw Outputs → Synthesizer Agent accordion) — Machine-readable data for potential future UI features (e.g. one-click trade logging)

### ResearchBriefing Component

**File:** `src/components/research/ResearchBriefing.tsx`

Renders the AI-generated research briefing as styled markdown in the **Briefing tab**. Uses `react-markdown` with `remark-gfm` (for GFM table support) and explicit component overrides for all markdown elements — no `@tailwindcss/typography` plugin or `prose` classes.

**CRITICAL — Styling approach:** All markdown element styling is done via the `components` prop on `ReactMarkdown`, NOT via CSS classes like `prose`. Each element (h1, h2, h3, p, strong, ul, ol, li, table, th, td, etc.) has an explicit React component override with Tailwind classes. This approach was chosen because:
- `@tailwindcss/typography` plugin caused global side effects (oversized native `<select>` arrows, broken resize handles across all pages)
- The styling must match the existing `EventContext` component patterns: `text-xs` for body text, `text-zinc-400` for content, `·` character for bullet points, `px-5 py-4` section padding, `border-zinc-800` borders

**Key styling mappings (must match EventContext patterns):**

| Markdown Element | Component Style |
|---|---|
| `## Heading` | `text-sm font-medium text-zinc-300` with bottom border |
| `### Subheading` | `text-xs text-zinc-500 font-medium` |
| Paragraph | `text-xs text-zinc-400 leading-relaxed` |
| `**Bold**` | `text-zinc-200 font-medium` |
| List items | `·` prefix bullet with `text-xs text-zinc-400` |
| Tables | `border border-zinc-800 rounded-lg` with `text-xs` cells |
| Table headers | `bg-zinc-900/50 text-xs font-medium text-zinc-400` |

**Props:**
```typescript
interface ResearchBriefingProps {
  briefing: string | null;
  researchQuality?: {
    transcriptsAnalyzed: number;
    sourcesConsulted: number;
    overallConfidence: string;
    caveats: string[];
  } | null;
  runTimestamp?: string | null;
  layer?: string | null;
}
```

**Where it's rendered:** In the research page (`src/app/research/[eventId]/page.tsx`) within the `activeTab === "briefing"` conditional. The `briefing` string comes from `latestCompletedRun.briefing` and the `researchQuality` is extracted from `latestCompletedRun.synthesis_result`.

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
  action: "buy" | "sell"; // BUY/SELL toggle (default "buy")
  side: "yes" | "no";
  entryPrice: number;     // Decimal 0-1. For sells, this is the exit price.
  contracts: number;      // Integer
  totalCost: number;      // Dollars (e.g. 1.16 = $1.16)
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
| `/api/trades/log` | POST | Log a buy or sell trade. Sells use FIFO matching against open buys. Body: `{ eventId, wordId, side, entryPrice, contracts, totalCostCents, action? }` |
| `/api/trades/results` | GET/POST | Get or set trade results |
| `/api/trades/[tradeId]` | DELETE/PATCH | Delete or edit a trade. Sell deletion unwinds FIFO matches. Buy deletion blocked if sells exist. Sell editing blocked. Buy editing blocked if sells matched. |

**Trade log body details:**
- `action` — `"buy"` (default) or `"sell"`. When `"sell"`, the API FIFO-matches against open buys for the same word+side.
- `entryPrice` — Decimal 0-1 (e.g. `0.116` for 11.6¢). For sells, this is the exit/sell price.
- `contracts` — Integer count
- `totalCostCents` — Total cost in cents as a float (e.g. `116.0` for $1.16). Stored as REAL in Postgres, no rounding.

**Sell trade FIFO matching (in `trades/log/route.ts`):**
1. Fetches open buy trades for the same `event_id`, `word_id`, `side` with `action='buy'`, `result IS NULL`, ordered by `created_at ASC`
2. Pre-calculates matches (consuming available contracts from each buy, FIFO order)
3. Inserts the sell trade record first (so if insert fails, no buys are modified)
4. Updates matched buys: increments `matched_contracts`, accumulates `realized_pnl_cents`. Fully consumed buys get `result='sold'` and `pnl_cents` set.
5. P&L per match = `(exitPrice - buyEntryPrice) * contracts * 100`. Values are `Math.round()`-ed for `pnl_cents` (INTEGER column).

**Sell trade deletion (in `trades/[tradeId]/route.ts`):**
- Reverses the FIFO match: decrements `matched_contracts` on matched buys, clears `result='sold'` back to `null`
- Uses `matched_buy_ids` array on the sell trade to find which buys to update

### Corpus

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/corpus/speakers` | GET/POST | List or create speakers |
| `/api/corpus/series` | GET/POST/DELETE | List, create, or delete series. POST returns 409 if the `(series_ticker, speaker_id)` pair already exists. DELETE cascade-deletes corpus-only events but **unlinks** (sets `series_id=null`) events that have research runs or trades — preserving all research/trade data. Returns `{ eventsDeleted, eventsUnlinked }` |
| `/api/corpus/series/events` | GET/DELETE | Get events in a series, or exclude a single event. DELETE unlinks events with research/trades (sets `series_id=null`) instead of deleting them, adds ticker to `excluded_tickers` |
| `/api/corpus/categories` | GET | Get corpus categories for a speaker |
| `/api/corpus/import-historical` | POST | Bulk import settled historical events from Kalshi for a series. Skips events that already belong to a different series (won't overwrite another speaker's ownership). Respects `excluded_tickers` array. Only imports events with `status: "settled"` |
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
| `/api/settlement/check` | POST | Check market settlement. Body: `{ eventId? }`. When `eventId` is provided, checks that specific event regardless of status (allows re-checking completed events). When omitted, only checks unsettled events (`status != 'completed'`). Auto-settles if all markets have results. **Also refreshes `event_date`** from Kalshi's current `sub_title` — fixes recurring events (e.g. press briefings) where the initial date was stale. |
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

Settlement logic — resolves events by recording word mention results and calculating trade P&L. **Sell-aware**: only settles buy trades that haven't been fully sold.

**Settlement behavior with sell trades:**
- Queries `action = 'buy' AND result IS NULL` — skips fully sold buys (`result = 'sold'`)
- For partially sold buys (`matched_contracts > 0` but less than `contracts`): settlement P&L applies only to remaining open contracts
- Total `pnl_cents` = `realized_pnl_cents` (from sells) + settlement P&L (from remaining contracts)
- `pnl_cents` is `Math.round()`-ed before writing to DB (column is INTEGER, calculations produce floats from sub-cent entry prices)

**P&L Calculation (per open contract):**
- Win P&L: `openContracts * 100 - openCostCents`
- Loss P&L: `-openCostCents`
- Where `openContracts = trade.contracts - trade.matched_contracts` and `openCostCents = trade.entry_price * openContracts * 100`

**CRITICAL — `pnl_cents` is INTEGER:** All P&L values must be `Math.round()`-ed before writing to the `trades` table. Sub-cent entry prices (e.g. `0.1169`) produce float P&L values (e.g. `-1052.1`) that Supabase silently rejects when writing to an INTEGER column. This caused a bug where settlement appeared to succeed but trades remained unsettled.

---

## Deployment

### Local-Only (macOS Launch Agent)

The app runs **locally only** on `localhost:3000` — there is no cloud deployment. A macOS Launch Agent auto-starts the Next.js dev server on login and auto-restarts it if it crashes. No 24/7 uptime is needed; the app is available whenever the laptop is on.

**Launch Agent plist:** `~/Library/LaunchAgents/com.kalshi.research.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kalshi.research</string>
    <key>WorkingDirectory</key>
    <string>/Users/bisolaasolo/kalshi-research</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/bisolaasolo/.nvm/versions/node/v22.15.1/bin/npm</string>
        <string>run</string>
        <string>dev</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/bisolaasolo/.nvm/versions/node/v22.15.1/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/bisolaasolo/kalshi-research/logs/launchd-out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/bisolaasolo/kalshi-research/logs/launchd-err.log</string>
</dict>
</plist>
```

**How it works:**
- **RunAtLoad: true** — starts `npm run dev` automatically when the user logs in
- **KeepAlive: true** — if the process crashes or is killed, launchd restarts it automatically
- **Logs** — stdout/stderr go to `logs/launchd-out.log` and `logs/launchd-err.log` in the project root
- **Node path** — Uses the absolute nvm path (`v22.15.1`) to avoid shell profile issues with launchd (which doesn't source `.zshrc`/`.bashrc`)
- **Port** — Runs on `localhost:3000` (the Next.js default)

**Management commands:**

```bash
# Stop the dev server
launchctl unload ~/Library/LaunchAgents/com.kalshi.research.plist

# Start the dev server
launchctl load ~/Library/LaunchAgents/com.kalshi.research.plist

# Check if it's running
lsof -iTCP:3000 -sTCP:LISTEN -P -n

# View logs
tail -f ~/kalshi-research/logs/launchd-err.log
tail -f ~/kalshi-research/logs/launchd-out.log
```

**Important notes for AI builders:**
- If you upgrade Node via nvm, you must update the absolute node/npm path in the plist file and reload the agent
- The `logs/` directory is in the project root — add it to `.gitignore` if not already there
- The Launch Agent only runs while the laptop is awake/logged in — there is no remote access or 24/7 uptime
- Environment variables (API keys, etc.) are loaded from `.env.local` by Next.js, not from the plist

### Legacy: Fly.io (Deprecated)

The app was previously deployed to Fly.io. The `Dockerfile` and `fly.toml` remain in the repo but are **no longer in use**. The Fly.io deployment was removed to save costs since the app only needs to be accessible locally.

**If you ever need to re-deploy to Fly.io:**

```bash
# Install flyctl, then:
fly deploy

# Set secrets
fly secrets set KALSHI_API_KEY=... KALSHI_PRIVATE_KEY="..." \
  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  ANTHROPIC_API_KEY=...
```

**Legacy config (`fly.toml`):**
- App name: `kalshi-research`
- Region: `iad` (Virginia)
- Internal port: 3000
- VM: shared CPU, 256MB RAM
- Auto-stop/start enabled
- Health check: GET `/` every 30s

**Dockerfile:** Uses Next.js standalone output (`output: 'standalone'` in next.config). Three stages: deps → builder → runner.

---

## Running Locally

The app auto-starts via the macOS Launch Agent (see [Deployment](#deployment) above). Under normal use, you don't need to manually start anything — just open `http://localhost:3000` in your browser after login.

**If you need to run manually (e.g. after unloading the Launch Agent):**

```bash
# Install dependencies (only needed after pulling new changes)
npm install

# Set up environment variables (add your keys to .env.local)

# Run dev server
npm run dev

# Build for production
npm run build
npm start
```

**Runtime details:**
- Dev server runs on port **3000** via the Launch Agent (`npm run dev`)
- Turbopack is enabled for fast HMR — component changes hot-reload without restarting
- Node version: **v22.15.1** (managed via nvm)
- Logs: `logs/launchd-out.log` and `logs/launchd-err.log` in the project root
- If port 3000 is occupied by another process, the Launch Agent will fail silently — check `logs/launchd-err.log` for errors

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
| 012 | `012_sell_trades.sql` | Sell trade support. Adds: `action TEXT NOT NULL DEFAULT 'buy'` (CHECK: buy/sell), `exit_price REAL`, `matched_buy_ids UUID[]`, `matched_contracts INTEGER DEFAULT 0`, `realized_pnl_cents REAL`. Widens `result` CHECK to include `'sold'`. Adds index `idx_trades_word_action` on `(word_id, action, side)` for FIFO lookups. All existing trades get `action='buy'` and `matched_contracts=0` via defaults — full backwards compatibility. |

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
- **EXCEPTION: `pnl_cents` is INTEGER** — All P&L values written to `trades.pnl_cents` MUST be `Math.round()`-ed. Sub-cent entry prices produce float P&L values that Supabase silently rejects on INTEGER columns. This applies in `settlement.ts` and `trades/log/route.ts` (sell matching).

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
- After normalization, prices are always integer cents (0-100 scale). **Do not read raw API price fields directly** — always go through `normalizeFill()` which handles the post-2026-03-12 dollar-string format (`yes_price_dollars`) and the pre-maintenance integer-cents format (`yes_price`).
- Fee cost comes as a string dollar amount in `fee_cost` (e.g. `"0.03"`) — multiply by 100 for cents. This field name is unchanged across API versions.
- Settlement `fee_cost` is an aggregate total (informational), NOT an additional fee — do not add it to trade fees
- Position counts are validated against `settlement.yes_count` / `settlement.no_count` (after normalization from `yes_count_fp` / `no_count_fp`) — mismatches indicate a bug in fill processing

**Normalizing Kalshi API fills (post-2026-03-12):**

If the P&L shows $0.00 for all trades despite fees being non-zero, the most likely cause is a Kalshi API field rename. Inspect the raw response from `/portfolio/fills?limit=2` — if you see `count_fp` and `yes_price_dollars` instead of `count` and `yes_price`, update `normalizeFill()` in `src/app/api/pnl/route.ts` accordingly. The pattern is:

```typescript
// Read new field with fallback to old field name
const count = raw.count !== undefined
  ? Number(raw.count)
  : parseFloat((raw.count_fp as string) || "0");

const yes_price = raw.yes_price !== undefined
  ? Number(raw.yes_price)
  : Math.round(parseFloat((raw.yes_price_dollars as string) || "0") * 100);
```

### Supabase

- Default 1000-row limit on queries — always paginate for large datasets
- Use service role key for all server-side writes (bypasses RLS)
- The `transcripts` table has a unique constraint on `(speaker, title, event_date)` — use upsert

### Claude API

- Web search is a **server-side tool** — Anthropic's infrastructure executes searches within the API call. No client-side search needed.
- Handle `pause_turn` stop reason by re-sending the response to resume (the server-side tool loop hit its iteration limit). Text from all continuations is accumulated — earlier continuations' text is preserved.
- `max_tokens` truncation is logged as a warning. If a response is truncated, the JSON may be incomplete and `callAgentForJson` will attempt to recover by asking Claude to fix it — but this may not recover all data.
- JSON responses from Claude may need extraction from code fences — `parseJsonResponse` handles this with 3 fallback strategies
- Retries on 429, 500, 502, 503, 529, and connection errors with exponential backoff (3s base, 4 retries max)
- If JSON parsing fails, `callAgentForJson` auto-retries by asking Claude to fix the malformed JSON

### Research Pipeline

- Phase 1 agents run in parallel via `Promise.allSettled` — individual failures don't crash the pipeline
- Results are saved to Supabase after each phase (non-critical — DB errors are logged but don't stop the pipeline)
- Pipeline supports cancellation: each phase checks `research_runs.status` before proceeding
- Transcript metadata from the historical agent is cached in the `transcripts` table for future runs
- Token usage and cost are tracked cumulatively across all agents and saved to the research run record
- **Completion reporting:** The SSE completion event includes `warnings` array when issues are detected (e.g. partial word score saves, missing/short briefing). Warnings surface in the research page progress messages so the user sees them immediately.
- **Price fetch warning:** If Kalshi price fetch fails when triggering research, a warning is sent via SSE instead of silently defaulting all prices to 0.50 (which produces inaccurate edge calculations)
- **Post-completion behavior:** After a run completes on the research page, the page awaits `fetchData()`, switches to the "research" tab, and scrolls to top — ensuring the results are immediately visible

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

### Briefing Placeholder Recovery

**Problem:** When asking Claude to return a long markdown briefing (800-1500 words) inside a JSON `briefing` field, the model sometimes writes the briefing as markdown prose BEFORE the JSON block, then puts a placeholder like `[Full markdown briefing text above]` inside the JSON field. Since `parseJsonResponse` only extracts the JSON, the actual briefing text is lost.

**This is intermittent** — it depends on the model, prompt length, and response structure. Observed with Sonnet but could happen with any model. It's more likely when the combined output (briefing + word scores + trade recommendations) is very long.

**Two-layer defense in the codebase:**

1. **Synthesizer prompt** (`src/agents/synthesizer.ts`) — Contains an explicit `CRITICAL` instruction: "The 'briefing' field MUST contain the COMPLETE briefing text as an inline JSON string with `\n` for newlines. Do NOT write the briefing separately before the JSON." This prevents the issue in most cases.

2. **Orchestrator recovery** (`src/agents/orchestrator.ts`) — After receiving the synthesis result, checks if the `briefing` field is a placeholder (length < 100, or contains phrases like "briefing text above", "see above", "markdown above"). If detected AND the raw response content has substantial text before the JSON block (>200 chars), extracts that text as the briefing. Logs: `[orchestrator] Recovered briefing from raw response (N chars)`.

3. **Completion warning** — If the final briefing is still missing or suspiciously short (<100 chars) after recovery, a warning is logged AND sent to the frontend via the SSE completion event. The research page displays this as `⚠️ Briefing is missing or incomplete` in the progress messages.

**If a briefing is lost despite these defenses:**
- The word scores and trade recommendations are typically fine (they're structured JSON fields)
- The briefing can be regenerated by re-running research (all other agent results are cached)
- Check `logs/launchd-err.log` for `[orchestrator]` warnings

### W/L Counting in Analytics

**Rule:** Wins = `result === "win"`. Losses = **all other resolved trades** (total resolved minus wins). This includes both `result === "loss"` AND `result === "sold"`.

**Why:** The trade result can be `"win"`, `"loss"`, or `"sold"`. Sold trades represent early exits that typically result in realized losses. The per-trade dropdown UI shows "L" for any non-win trade (`t.result === "win" ? "W" : "L"`). If losses were counted as only `result === "loss"`, the W/L summary would not match the dropdown — sold trades would fall through the cracks.

**Where this applies:**
- Overall stats in `GET /api/analytics/performance` — `losses = resolvedTrades.length - wins`
- Per-event stats in the same route — `eventLosses = eventResolved.length - eventWins`
- The `sold` count was removed from the API response since it's now rolled into losses

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

**Kalshi series ticker migration:** Kalshi has been consolidating speaker-specific series into the generic `KXMENTION` series. For example, Pete Hegseth events previously used the `KXHEGSETHMENTION` series (e.g. `KXHEGSETHMENTION-26MAR06`) but newer events use `KXMENTION` with a speaker prefix (e.g. `KXMENTION-HEGS26MAR13`). Both series remain in the DB for corpus completeness — `KXHEGSETHMENTION` covers historical events, and `KXMENTION` (linked to the same speaker) covers newer ones. This pattern may apply to other speakers over time.

### Corpus Safety — Import & Delete Protections

The corpus system has protections to prevent accidental data loss when importing or deleting series:

**Problem (historical bug, now fixed):** When multiple speakers share the same Kalshi series ticker (e.g. `KXMENTION`), importing events for one speaker would overwrite the `series_id` on events that were manually loaded or belonged to a different speaker's series. Then, deleting that speaker's series would cascade-delete all those claimed events — destroying research runs, trades, and scores that the user had built up. This actually happened in production, causing loss of research and trade data for events that were "claimed" by an unrelated series import and then deleted with that series.

**Protection 1 — Import won't claim other series' events** (`src/app/api/corpus/import-historical/route.ts`):
- Before upserting, the import checks if the event already exists with a `series_id` belonging to a different series
- If so, the event is **skipped** — the import does not overwrite another series' ownership
- Events with `series_id = null` (manually loaded) are still claimed by the import, which is the expected behavior for corpus building

**Protection 2 — Series delete preserves events with research/trades** (`src/app/api/corpus/series/route.ts`):
- When deleting a series, events are split into two groups:
  - **Corpus-only events** (no research runs, no trades) — fully deleted (cascade: event_results, word_scores, trades, words, word_clusters, research_runs, events)
  - **Events with research or trades** — **unlinked** (`series_id` set to `null`) instead of deleted. All research, trades, and scores are preserved.
- The response includes `eventsDeleted` and `eventsUnlinked` counts

**Protection 3 — Single event exclude preserves events with research/trades** (`src/app/api/corpus/series/events/route.ts`):
- Same logic as series delete: events with research_runs or trades are unlinked, not deleted
- The event's ticker is still added to `excluded_tickers` to prevent re-import

### Sell Trade System (FIFO Offset Matching)

The manual trade logging system supports both **buy** and **sell** trades. Sells represent early exits from positions before settlement (e.g. bought YES at 47¢, sold at 31¢ for a loss).

**How it works:**
1. User toggles BUY/SELL in the trade form, selects side (YES/NO), enters price and contracts
2. For sells, the API FIFO-matches against open buys for the same word+side
3. Matched buys have `matched_contracts` incremented and `realized_pnl_cents` accumulated
4. Fully matched buys get `result='sold'` and `pnl_cents` set to the realized P&L
5. The sell trade record stores `matched_buy_ids` for traceability

**P&L tracking — no double-counting:**
- P&L lives on the **buy** row only. Sell rows show `-` in the P&L column.
- A sold buy's `pnl_cents` = total realized P&L from all sells against it
- A partially sold buy that then settles: `pnl_cents` = realized (from sells) + settlement (on remaining contracts)
- Analytics APIs filter to `action = 'buy'` for P&L totals — sell rows are never counted

**Win/loss determination (ResolveEvent P&L summary):**
- Based on **actual P&L**, not the `result` field
- `pnl_cents >= 0` → win, `pnl_cents < 0` → loss
- This means sold trades that lost money (e.g. bought at 47¢, sold at 31¢) correctly count as losses

**Deletion safety:**
- Deleting a sell unwinds the FIFO match (decrements `matched_contracts` on buys, clears `result='sold'`)
- Deleting a buy that has matched sells is blocked (user must delete sells first)
- Editing sells is blocked; editing matched buys is blocked

**Trade type (`components.ts`):**
```typescript
interface Trade {
  id: string;
  word_id: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  entry_price: number;
  contracts: number;
  total_cost_cents: number;
  result: "win" | "loss" | "sold" | null;
  pnl_cents: number | null;
  exit_price: number | null;        // sell price (sell trades only)
  matched_buy_ids: string[] | null; // buy IDs this sell matched (sell trades only)
  matched_contracts: number;        // how many contracts sold (on buys: sold qty; on sells: always = contracts)
  realized_pnl_cents: number | null; // P&L from sells (accumulated on buys, snapshot on sells)
  agent_estimated_probability: number | null;
  agent_edge: number | null;
  created_at: string;
}
```

### Event Date Refresh (Recurring Events)

For recurring events like "What will Karoline Leavitt say in the next press briefing?", Kalshi's `event_date` (derived from `sub_title`) may change after the event is initially loaded. The ticker encodes the **expiry window** (e.g. `KXSECPRESSMENTION-26MAR29` = expires March 29), but the actual briefing may happen on March 10. Kalshi updates the `sub_title` to reflect the actual date after the event occurs.

**Problem:** If the event was loaded before the briefing, our DB stores the old date, causing incorrect calendar/chart placement in analytics.

**Fix:** The settlement check route (`/api/settlement/check`) refreshes `event_date` from Kalshi's current `sub_title` on every check. This runs automatically when the user clicks "Check Settlement" or "Re-check Settlement".

### Settlement & Re-check Flow

The settlement system allows checking market outcomes and resolving trades, with support for **re-checking after initial settlement** (e.g. when trades are added after the first settlement run).

**How settlement works:**

1. User clicks "Check Settlement" on the research page (`ResolveEvent` component)
2. Frontend sends `POST /api/settlement/check` with `{ eventId }`
3. API checks each word's market on Kalshi for settlement results (`GET /markets/{ticker}`)
4. Words already in `event_results` table are skipped (marked `already_settled`)
5. If ALL words have results and no API errors → auto-settles via `settleEvent()` in `src/lib/settlement.ts`
6. `settleEvent()` upserts `event_results`, calculates win/loss and P&L for each **open buy trade** (skips fully sold buys, handles partially sold buys), sets event status to `"completed"`

**Re-check behavior:**

- The "Check Settlement" button **persists** after resolution — it changes label to "Re-check Settlement"
- The settlement status feedback message also persists (not gated by `isResolved`)
- The "Manual Resolve" button hides after resolution (you shouldn't manually override Kalshi data)
- The API route skips the `status != 'completed'` filter when a specific `eventId` is provided, so completed events can be re-checked
- On re-check, words already in `event_results` are skipped. New words that weren't settled before (e.g. markets that settled later) will be picked up. The `settleEvent()` function uses upsert on `(event_id, word_id)`, so re-running is safe.
- **Use case:** Log additional trades after initial settlement, then re-check to settle the new trades

**Key state flow (research page):**

```
isResolved = eventResults.length > 0  // true after first settlement
```

- `ResolveEvent` receives `isResolved` as a prop
- "Check Settlement" button: always visible (not gated by `!isResolved`)
- "Manual Resolve" button: `{!isResolved && ...}` — hidden after resolution
- Settlement status: always visible when present
- P&L summary: `{isResolved && resolvedTrades.length > 0 && ...}` — shown after resolution

### Event Visibility Across Pages — Data Sources & Filtering

Understanding which events appear on which page is critical. Each page has a different data source and filter:

| Page | Data Source | What Events Appear | Key Query |
|------|-------------|-------------------|-----------|
| **Home** (`/`) | Supabase `events` table | Events with at least one `research_runs` row OR one `trades` row | `SELECT event_id FROM research_runs UNION SELECT event_id FROM trades` → fetch events by those IDs |
| **Research** (`/research/[id]`) | Supabase | Any event by UUID (direct navigation) | `SELECT * FROM events WHERE id = :eventId` |
| **Corpus** (`/corpus`) | Supabase | Events with `series_id` pointing to a series owned by the selected speaker | `SELECT * FROM events WHERE series_id IN (speaker's series IDs)` |
| **Analytics** (`/analytics`) | Supabase `trades` table | Events that have at least one logged trade | `SELECT DISTINCT event_id FROM trades` → fetch events by those IDs |
| **Trade Analytics** (`/trade-analytics`) | Supabase `trades` table | Events with resolved trades (`result IS NOT NULL`), grouped by speaker+word | Same as Analytics but grouped differently |
| **P&L** (`/pnl`) | **Kalshi API** (not Supabase) | ALL events the user has traded on Kalshi, regardless of DB state | `/portfolio/fills` + `/historical/fills` + `/portfolio/settlements` from Kalshi API. Event titles resolved from Supabase first, then Kalshi API fallback |

**Key implications:**
- An event can appear on the **P&L page but nowhere else** if the user traded it on Kalshi but never loaded it into the app's database
- An event must be **loaded via the home page** (or corpus import) to exist in Supabase
- An event loaded but never researched or traded appears **nowhere** in the UI (except direct URL navigation to `/research/[id]`)
- The P&L page is the **most complete** view because it uses Kalshi API as the source of truth
- The Analytics and Trade Analytics pages **only show DB-logged trades**, not all Kalshi trades. There is no automatic sync between Kalshi fills and the `trades` table.

**Two independent trade systems:**
1. **DB trades** (`trades` table) — Manually logged by the user via the Trade Log tab. Used by: Home page list, Analytics, Trade Analytics, Research page settlement
2. **Kalshi API fills** — The actual fills from the Kalshi exchange. Used by: P&L page only

These two systems are **not synchronized**. A trade on Kalshi does not automatically create a row in the `trades` table. The user must manually log trades in the app for them to appear in Analytics/Trade Analytics.

### Global CSS & Tailwind v4 Gotchas

**File:** `src/app/globals.css`

The app uses Tailwind CSS v4 with the `@import "tailwindcss"` directive. There is a critical global CSS override for native `<select>` elements:

```css
select {
  appearance: none;
  background-image: url("data:image/svg+xml,...");  /* Custom SVG chevron */
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 16px;
  padding-right: 28px;
}
```

**Why this exists:** Tailwind CSS v4's preflight resets render native `<select>` elements with oversized dropdown arrows on macOS. This global override restores compact chevrons matching the custom dropdown buttons used elsewhere in the app. **Do NOT remove this CSS block.**

**CRITICAL — Do NOT install or uninstall CSS/Tailwind packages:**
- Installing packages like `@tailwindcss/typography` and then uninstalling them can trigger a `.next` cache rebuild that changes how Tailwind preflight renders globally
- Deleting the `.next` cache forces a full rebuild that may produce different CSS output than the old cache
- If you need to restart the dev server, use `launchctl kickstart -k gui/$(id -u)/com.kalshi.research` — do NOT delete `.next`

**Styling pattern for new components:** Copy the exact Tailwind classes from `EventContext.tsx` as the reference component. Key patterns:
- Section headers: `text-sm font-medium text-zinc-300` in a `px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50` container
- Body text: `text-xs text-zinc-400 leading-relaxed`
- Bullet points: `·` character with `text-zinc-600` + content in `text-zinc-400`
- Cards: `border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden`
- Badges: `text-xs px-2 py-0.5 rounded-full` with color variants

**Dropdown pattern:** All dropdowns should use the custom button+dropdown pattern (not native `<select>`) for consistent styling. See the categories dropdown in `WordTable.tsx` for the reference implementation: `<button>` with an inline SVG chevron (`w-3 h-3`), `fixed inset-0 z-10` overlay for close-on-click, absolute-positioned dropdown panel. The speaker selector in `WordTable` was converted from a native `<select>` to this pattern to match.

### Dead Code Policy

- Unused components should be deleted, not left in the codebase
- If a component is not imported anywhere, it is dead code and should be removed
- The project previously had a `WordAnalysisTable.tsx` component that was never imported — it has been deleted

---

## Known Kalshi API Breaking Changes

This section logs confirmed API changes that have broken the app, and how they were fixed. If the P&L dashboard shows $0.00 across the board after a Kalshi maintenance window, check this section first.

### 2026-03-12 Maintenance — Fill & Settlement Field Rename

**Symptoms observed:**
- P&L overview showed `+$0.00` total profit and `+$0.00` profit after fees, but fees were non-zero (e.g. `$147.02`)
- Calendar showed correct trade counts per day but all daily P&L as `+$0.00`
- No error message — API calls succeeded (HTTP 200)

**Root cause:**
Kalshi renamed multiple fields in the `/portfolio/fills` and `/portfolio/settlements` responses without a deprecation period:

| Old field | New field | Format change |
|---|---|---|
| `count: number` | `count_fp: string` | Integer → decimal string (`34` → `"34.00"`) |
| `yes_price: number` | `yes_price_dollars: string` | Cents int → dollar string (`99` → `"0.9900"`) |
| `no_price: number` | `no_price_dollars: string` | Cents int → dollar string (`1` → `"0.0100"`) |
| `ticker: string` | `market_ticker: string` | Field renamed (ticker may still appear in some responses) |
| Settlement `yes_count: number` | `yes_count_fp: string` | Integer → decimal string |
| Settlement `no_count: number` | `no_count_fp: string` | Integer → decimal string |

Additionally, `/historical/fills` began returning an empty `fills: []` array — all fills are now served exclusively from `/portfolio/fills`.

**Fix applied:**
Added `normalizeFill()` and `normalizeSettlement()` functions in `src/app/api/pnl/route.ts` (lines 40–94) that read new field names with fallback to old names. Raw API responses are normalized to the stable internal `KalshiFill` / `KalshiSettlement` interfaces before any P&L calculation. All downstream code is unchanged.

**How to diagnose future API changes:**
```bash
# Test raw fill response format (replace with your signing logic or use the dev server debug endpoint)
curl -s "https://api.elections.kalshi.com/trade-api/v2/portfolio/fills?limit=2" \
  -H "KALSHI-ACCESS-KEY: ..." \
  -H "KALSHI-ACCESS-TIMESTAMP: ..." \
  -H "KALSHI-ACCESS-SIGNATURE: ..."

# Or hit the built-in debug endpoint (dev server or deployed app):
GET /api/pnl/debug
```

Check: do the raw fills have `count` (old) or `count_fp` (new)? Do they have `yes_price` (old) or `yes_price_dollars` (new)? Update `normalizeFill()` accordingly.
