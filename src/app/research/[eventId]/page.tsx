"use client";

import { useState, useEffect, useCallback, use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLivePrices } from "@/hooks/useLivePrices";
import type {
  Event,
  WordScore,
  Cluster,
  ResearchRun,
  ResearchSummary,
  Trade,
  Word,
  EventResult,
  SortKey,
  TabId,
} from "@/types/components";
import type {
  HistoricalResult,
  AgendaResult,
  NewsCycleResult,
  EventFormatResult,
  RecentRecordingsResult,
} from "@/types/research";
import type { MentionHistoryRow } from "@/types/corpus";

import { RecentRecordings } from "@/components/research/RecentRecordings";
import { EventHeader } from "@/components/research/EventHeader";
import { ProgressMessages } from "@/components/research/ProgressMessages";
import { TabNavigation } from "@/components/research/TabNavigation";
import { EventContext } from "@/components/research/EventContext";
import { WordTable } from "@/components/research/WordTable";
import { AgentOutputAccordion } from "@/components/research/AgentOutputAccordion";
import { WordScoresTable } from "@/components/research/WordScoresTable";
import { LoggedTrades } from "@/components/research/LoggedTrades";
import { ResolveEvent } from "@/components/research/ResolveEvent";
import { RunHistory } from "@/components/research/RunHistory";
import { SourcesTab, extractSources } from "@/components/research/SourcesTab";
import { ResearchNotes } from "@/components/research/ResearchNotes";
import { QuickTradeTable } from "@/components/research/QuickTradeTable";
// Briefing tab removed — AI opinions were hurting trading performance

export default function ResearchDashboard({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const searchParams = useSearchParams();
  const modelPreset = searchParams.get("modelPreset") || "sonnet";
  const initialCorpusCategories = searchParams.get("corpusCategories") || searchParams.get("corpusCategory") || "";

  // ── Core state ──
  const [event, setEvent] = useState<Event | null>(null);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [researchSummary, setResearchSummary] = useState<ResearchSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Corpus speaker state ──
  const [speakers, setSpeakers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const [mentionData, setMentionData] = useState<MentionHistoryRow[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [corpusCategories, setCorpusCategories] = useState<string[]>(
    initialCorpusCategories ? initialCorpusCategories.split(",").filter(Boolean).filter((c) => c !== "__all__") : []
  );
  const [categories, setCategories] = useState<string[]>([]);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<TabId>("research");
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [sortAsc, setSortAsc] = useState(false);
  const [researchRunning, setResearchRunning] = useState(false);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [filterCluster, setFilterCluster] = useState<string>("all");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // ── Trade state ──
  const [trades, setTrades] = useState<Trade[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [tradeFormWordId, setTradeFormWordId] = useState<string | null>(null);
  const [tradeForm, setTradeForm] = useState({ action: "buy" as "buy" | "sell", side: "yes" as "yes" | "no", entryPrice: 0.5, contracts: 1, totalCost: 0.5 });
  const [tradeLoading, setTradeLoading] = useState(false);

  // ── Resolution state ──
  const [eventResults, setEventResults] = useState<EventResult[]>([]);
  const [mentionResults, setMentionResults] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState(false);
  const [showResolvePanel, setShowResolvePanel] = useState(false);
  const [checkingSettlement, setCheckingSettlement] = useState(false);
  const [settlementStatus, setSettlementStatus] = useState<{
    message: string;
    settledWords: number;
    totalWords: number;
    settled: boolean;
  } | null>(null);

  // ── Market refresh state ──
  const [refreshingMarkets, setRefreshingMarkets] = useState(false);

  // ── Live prices ──
  const marketTickers = useMemo(() => {
    const fromScores = wordScores.map((s) => s.words?.kalshi_market_ticker).filter(Boolean);
    const fromWords = words.map((w) => w.kalshi_market_ticker).filter(Boolean);
    return [...new Set([...fromScores, ...fromWords])];
  }, [wordScores, words]);
  const { prices: livePrices, status: wsStatus, lastUpdate: lastPriceUpdate } = useLivePrices(marketTickers);

  // ── Derived values ──
  const latestCompletedRun = runs.find((r) => r.status === "completed") ?? null;
  const eventFormatResult = (latestCompletedRun?.event_format_result as EventFormatResult) ?? null;
  const agendaResult = (latestCompletedRun?.agenda_result as AgendaResult) ?? null;
  const newsCycleResult = (latestCompletedRun?.news_cycle_result as NewsCycleResult) ?? null;
  const recentRecordingsResult = (latestCompletedRun?.recent_recordings_result as RecentRecordingsResult) ?? null;
  const hasBaseline = runs.some((r) => r.layer === "baseline" && r.status === "completed");
  const hasCurrent = runs.some((r) => r.layer === "current" && r.status === "completed");
  const isResolved = eventResults.length > 0;

  // Extract all sources from the latest completed research run
  const researchSources = useMemo(() => {
    if (!latestCompletedRun) return [];
    return extractSources(
      (latestCompletedRun.historical_result as HistoricalResult) ?? null,
      (latestCompletedRun.agenda_result as AgendaResult) ?? null,
      (latestCompletedRun.news_cycle_result as NewsCycleResult) ?? null,
      (latestCompletedRun.event_format_result as EventFormatResult) ?? null
    );
  }, [latestCompletedRun]);
  const sourceCount = researchSources.length;

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/${eventId}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvent(data.event);
      setWordScores(data.wordScores ?? []);
      setClusters(data.clusters ?? []);
      setRuns(data.runs ?? []);
      setResearchSummary(data.researchSummary);
      setTrades(data.trades ?? []);
      setWords(data.words ?? []);
      // Restore persisted speaker selection
      if (data.event?.speaker_id && !selectedSpeakerId) {
        setSelectedSpeakerId(data.event.speaker_id);
      }
      if (data.eventResults?.length > 0) {
        setEventResults(data.eventResults);
        const resultsMap: Record<string, boolean> = {};
        for (const er of data.eventResults) {
          resultsMap[er.word_id] = er.was_mentioned;
        }
        setMentionResults(resultsMap);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Corpus speaker fetching ──
  useEffect(() => {
    async function fetchSpeakers() {
      try {
        const res = await fetch("/api/corpus/speakers");
        const data = await res.json();
        setSpeakers(data.speakers ?? []);
      } catch {
        // silently fail
      }
    }
    fetchSpeakers();
  }, []);

  // Fetch categories when speaker changes
  useEffect(() => {
    if (!selectedSpeakerId) {
      setCategories([]);
      return;
    }
    async function fetchCats() {
      try {
        const res = await fetch(`/api/corpus/categories?speakerId=${selectedSpeakerId}`);
        const data = await res.json();
        const cats = (data.categories ?? []).map((c: string | { name: string }) =>
          typeof c === "string" ? c : c.name
        );
        setCategories(cats);
      } catch {
        setCategories([]);
      }
    }
    fetchCats();
  }, [selectedSpeakerId]);

  const fetchMentionHistory = useCallback(async () => {
    if (!selectedSpeakerId) {
      setMentionData([]);
      return;
    }
    setMentionLoading(true);
    try {
      const params = new URLSearchParams({ speakerId: selectedSpeakerId });
      const realCategories = corpusCategories.filter((c) => c !== "__all__");
      if (realCategories.length > 0) params.set("category", realCategories.join(","));
      const res = await fetch(`/api/corpus/mention-history?${params}`);
      const data = await res.json();
      setMentionData(data.rows ?? []);
    } catch {
      setMentionData([]);
    } finally {
      setMentionLoading(false);
    }
  }, [selectedSpeakerId, corpusCategories]);

  useEffect(() => {
    fetchMentionHistory();
  }, [fetchMentionHistory]);

  // ── Callbacks ──
  async function triggerResearch(layer: "baseline" | "current") {
    setResearchRunning(true);
    setProgressMessages([`Starting ${layer} research...`]);

    try {
      const res = await fetch("/api/research/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, layer, speakerId: selectedSpeakerId || undefined, modelPreset, corpusCategories: corpusCategories.length > 0 ? corpusCategories : undefined }),
      });

      if (!res.ok || !res.body) {
        setProgressMessages((prev) => [...prev, "Failed to start research"]);
        setResearchRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "progress") {
                const agents = data.completedAgents?.join(", ") ?? "";
                setProgressMessages((prev) => [
                  ...prev,
                  `Completed: ${agents}${data.currentAgent ? ` | Running: ${data.currentAgent}` : ""}`,
                ]);
              } else if (data.type === "completed") {
                const msgs = [
                  `Research complete! ${data.wordScoresCount} scores, ${data.clustersCount} clusters. Cost: ${data.tokenUsage?.estimatedCostCents}¢`,
                ];
                if (data.warnings?.length > 0) {
                  msgs.push(`⚠️ ${data.warnings.join(" | ")}`);
                }
                setProgressMessages((prev) => [...prev, ...msgs]);
              } else if (data.type === "error") {
                setProgressMessages((prev) => [...prev, `Error: ${data.error}`]);
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setProgressMessages((prev) => [...prev, `Error: ${(err as Error).message}`]);
    }

    setResearchRunning(false);
    await fetchData();
    // Show the research output after run completes
    setActiveTab("research");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function stopRun(runId: string) {
    try {
      const res = await fetch("/api/research/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (res.ok) {
        setResearchRunning(false);
        setProgressMessages((prev) => [...prev, "Research cancelled."]);
        fetchData();
      }
    } catch {
      // silently fail
    }
  }

  async function submitTrade(wordId: string) {
    setTradeLoading(true);
    try {
      const res = await fetch("/api/trades/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          wordId,
          action: tradeForm.action,
          side: tradeForm.side,
          entryPrice: tradeForm.entryPrice,
          contracts: tradeForm.contracts,
          totalCostCents: tradeForm.totalCost * 100,
        }),
      });
      if (res.ok) {
        setTradeFormWordId(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "Failed to log trade");
      }
    } catch {
      alert("Network error logging trade");
    }
    setTradeLoading(false);
  }

  async function submitResults() {
    setResolving(true);
    try {
      const results = words.map((w) => ({
        wordId: w.id,
        wasMentioned: mentionResults[w.id] ?? false,
      }));
      const res = await fetch("/api/trades/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, results }),
      });
      if (res.ok) {
        setShowResolvePanel(false);
        fetchData();
      }
    } catch {
      // silently fail
    }
    setResolving(false);
  }

  async function checkSettlement() {
    setCheckingSettlement(true);
    setSettlementStatus(null);
    try {
      const res = await fetch("/api/settlement/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) {
        const data = await res.json();
        const eventResult = data.results?.[0];
        if (eventResult) {
          setSettlementStatus({
            message: eventResult.settled
              ? `Event settled! ${eventResult.settlement?.tradesSettled ?? 0} trade(s) resolved.`
              : `${eventResult.settledWords}/${eventResult.totalWords} markets settled so far.`,
            settledWords: eventResult.settledWords,
            totalWords: eventResult.totalWords,
            settled: eventResult.settled,
          });
          if (eventResult.settled) {
            fetchData();
          }
        } else {
          setSettlementStatus({ message: "No data returned for this event.", settledWords: 0, totalWords: 0, settled: false });
        }
      } else {
        setSettlementStatus({ message: "Failed to check settlement.", settledWords: 0, totalWords: 0, settled: false });
      }
    } catch {
      setSettlementStatus({ message: "Network error checking settlement.", settledWords: 0, totalWords: 0, settled: false });
    }
    setCheckingSettlement(false);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400">Loading research data...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">Event not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Always visible: Header + Progress */}
      <EventHeader
        event={event}
        hasBaseline={hasBaseline}
        hasCurrent={hasCurrent}
        researchRunning={researchRunning}
        wsStatus={wsStatus}
        lastPriceUpdate={lastPriceUpdate}
        hasMarketTickers={marketTickers.length > 0}
        speakers={speakers}
        selectedSpeakerId={selectedSpeakerId}
        onSpeakerChange={(speakerId: string) => {
          setSelectedSpeakerId(speakerId);
          // Persist speaker selection to event record
          fetch("/api/events/speaker", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId, speakerId: speakerId || null }),
          }).catch(() => {});
        }}
        onTriggerResearch={triggerResearch}
      />

      <ProgressMessages messages={progressMessages} />

      {/* Tab Navigation */}
      <TabNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tradeCount={trades.length}
        sourceCount={sourceCount}
      />

      {/* ── Research Tab ── */}
      {activeTab === "research" && (
        <div className="space-y-6">
          <EventContext
            eventFormat={eventFormatResult}
            agenda={agendaResult}
            newsCycle={newsCycleResult}
          />

          <RecentRecordings recordings={recentRecordingsResult} />

          <WordTable
            wordScores={wordScores}
            livePrices={livePrices}
            mentionData={mentionData}
            mentionLoading={mentionLoading}
            speakers={speakers}
            selectedSpeakerId={selectedSpeakerId}
            onSpeakerChange={(speakerId: string) => {
              setSelectedSpeakerId(speakerId);
              // Persist speaker selection to event record
              fetch("/api/events/speaker", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eventId, speakerId: speakerId || null }),
              }).catch(() => {});
            }}
            categories={categories}
            selectedCategories={corpusCategories}
            onCategoriesChange={setCorpusCategories}
            allWords={words}
            refreshing={refreshingMarkets}
            onRefreshMarkets={async () => {
              setRefreshingMarkets(true);
              try {
                const res = await fetch("/api/events/refresh-markets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ eventId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                if (data.newWords > 0) {
                  setWords(data.words ?? []);
                }
              } catch {
                // silently fail
              } finally {
                setRefreshingMarkets(false);
              }
            }}
          />

          {isResolved && (
            <LoggedTrades
              trades={trades}
              wordScores={wordScores}
              words={words}
              onTradeUpdated={fetchData}
            />
          )}

          <ResearchNotes
            eventId={eventId}
            preEventNotes={event.pre_event_notes}
            postEventNotes={event.post_event_notes}
          />

          <AgentOutputAccordion researchSummary={researchSummary} />
        </div>
      )}

      {/* ── Sources Tab ── */}
      {activeTab === "sources" && (
        <SourcesTab sources={researchSources} />
      )}

      {/* ── Trade Log Tab ── */}
      {activeTab === "tradelog" && (
        <div className="space-y-6">
          {wordScores.length > 0 ? (
            <WordScoresTable
              wordScores={wordScores}
              clusters={clusters}
              livePrices={livePrices}
              trades={trades}
              tradeFormWordId={tradeFormWordId}
              tradeForm={tradeForm}
              tradeLoading={tradeLoading}
              onTradeFormWordId={setTradeFormWordId}
              onTradeFormChange={setTradeForm}
              onSubmitTrade={submitTrade}
              sortKey={sortKey}
              sortAsc={sortAsc}
              onSort={handleSort}
              filterCluster={filterCluster}
              onFilterClusterChange={setFilterCluster}
              researchRunning={researchRunning}
            />
          ) : (
            <QuickTradeTable
              words={words}
              livePrices={livePrices}
              trades={trades}
              tradeFormWordId={tradeFormWordId}
              tradeForm={tradeForm}
              tradeLoading={tradeLoading}
              onTradeFormWordId={setTradeFormWordId}
              onTradeFormChange={setTradeForm}
              onSubmitTrade={submitTrade}
            />
          )}

          <LoggedTrades
            trades={trades}
            wordScores={wordScores}
            words={words}
            onTradeUpdated={fetchData}
          />

          <ResolveEvent
            trades={trades}
            words={words}
            eventResults={eventResults}
            isResolved={isResolved}
            mentionResults={mentionResults}
            onMentionResultsChange={setMentionResults}
            onSubmitResults={submitResults}
            resolving={resolving}
            showResolvePanel={showResolvePanel}
            onToggleResolvePanel={() => setShowResolvePanel(!showResolvePanel)}
            checkingSettlement={checkingSettlement}
            settlementStatus={settlementStatus}
            onCheckSettlement={checkSettlement}
          />
        </div>
      )}

      {/* Always visible: Run History */}
      <RunHistory
        runs={runs}
        expandedRun={expandedRun}
        onExpandRun={(id) => setExpandedRun(expandedRun === id ? null : id)}
        onStopRun={stopRun}
      />
    </div>
  );
}
