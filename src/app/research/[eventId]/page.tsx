"use client";

import { useState, useEffect, useCallback, use } from "react";

interface Event {
  id: string;
  title: string;
  speaker: string;
  event_type: string;
  event_date: string;
  estimated_duration_minutes: number | null;
  status: string;
}

interface WordScore {
  id: string;
  word_id: string;
  combined_probability: number;
  historical_probability: number;
  agenda_probability: number;
  news_cycle_probability: number;
  base_rate_probability: number;
  market_yes_price: number;
  edge: number;
  confidence: string;
  reasoning: string;
  key_evidence: string[];
  words: {
    word: string;
    kalshi_market_ticker: string;
    cluster_id: string | null;
  };
}

interface Cluster {
  id: string;
  cluster_name: string;
  theme: string;
  correlation_note: string;
}

interface ResearchRun {
  id: string;
  layer: string;
  status: string;
  triggered_at: string;
  completed_at: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  error_message: string | null;
}

interface ResearchSummary {
  historical: unknown;
  agenda: unknown;
  newsCycle: unknown;
  eventFormat: unknown;
  marketAnalysis: unknown;
  clusters: unknown;
  synthesis: unknown;
}

type SortKey = "word" | "combined" | "edge" | "market" | "confidence";

export default function ResearchDashboard({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [researchSummary, setResearchSummary] = useState<ResearchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const [researchRunning, setResearchRunning] = useState(false);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [showSummary, setShowSummary] = useState<string | null>(null);
  const [filterCluster, setFilterCluster] = useState<string>("all");

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
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function triggerResearch(layer: "baseline" | "current") {
    setResearchRunning(true);
    setProgressMessages([`Starting ${layer} research...`]);

    try {
      const res = await fetch("/api/research/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, layer }),
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
                setProgressMessages((prev) => [
                  ...prev,
                  `Research complete! ${data.wordScoresCount} scores, ${data.clustersCount} clusters. Cost: ${data.tokenUsage?.estimatedCostCents}¢`,
                ]);
              } else if (data.type === "error") {
                setProgressMessages((prev) => [
                  ...prev,
                  `Error: ${data.error}`,
                ]);
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setProgressMessages((prev) => [
        ...prev,
        `Error: ${(err as Error).message}`,
      ]);
    }

    setResearchRunning(false);
    fetchData(); // Reload data
  }

  const sortedScores = [...wordScores]
    .filter(
      (s) =>
        filterCluster === "all" ||
        s.words?.cluster_id === filterCluster ||
        (filterCluster === "none" && !s.words?.cluster_id)
    )
    .sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortKey) {
        case "word":
          aVal = a.words?.word ?? "";
          bVal = b.words?.word ?? "";
          return sortAsc
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
        case "combined":
          aVal = a.combined_probability ?? 0;
          bVal = b.combined_probability ?? 0;
          break;
        case "edge":
          aVal = Math.abs(a.edge ?? 0);
          bVal = Math.abs(b.edge ?? 0);
          break;
        case "market":
          aVal = a.market_yes_price ?? 0;
          bVal = b.market_yes_price ?? 0;
          break;
        case "confidence":
          const confOrder = { high: 3, medium: 2, low: 1 };
          aVal =
            confOrder[a.confidence as keyof typeof confOrder] ?? 0;
          bVal =
            confOrder[b.confidence as keyof typeof confOrder] ?? 0;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function edgeColor(edge: number) {
    if (edge > 0.15) return "text-green-400";
    if (edge > 0.05) return "text-green-300";
    if (edge > 0) return "text-green-200";
    if (edge > -0.05) return "text-red-200";
    if (edge > -0.15) return "text-red-300";
    return "text-red-400";
  }

  function confBadge(conf: string) {
    switch (conf) {
      case "high":
        return "bg-green-900/50 text-green-400";
      case "medium":
        return "bg-yellow-900/50 text-yellow-400";
      case "low":
        return "bg-zinc-800 text-zinc-400";
      default:
        return "bg-zinc-800 text-zinc-400";
    }
  }

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

  const latestRun = runs[0];
  const hasBaseline = runs.some(
    (r) => r.layer === "baseline" && r.status === "completed"
  );
  const hasCurrent = runs.some(
    (r) => r.layer === "current" && r.status === "completed"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{event.title}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
            <span>{event.speaker}</span>
            <span>
              {event.event_date
                ? new Date(event.event_date).toLocaleDateString()
                : "Date TBD"}
            </span>
            {event.estimated_duration_minutes && (
              <span>~{event.estimated_duration_minutes} min</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {hasBaseline && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-900/50 text-green-400">
                Baseline
              </span>
            )}
            {hasCurrent && (
              <span className="text-xs px-2 py-1 rounded-full bg-blue-900/50 text-blue-400">
                Current
              </span>
            )}
          </div>
          <button
            onClick={() =>
              triggerResearch(hasBaseline ? "current" : "baseline")
            }
            disabled={researchRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {researchRunning
              ? "Running..."
              : hasBaseline
                ? "Update Research"
                : "Start Research"}
          </button>
        </div>
      </div>

      {/* Progress Messages */}
      {progressMessages.length > 0 && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4 max-h-40 overflow-y-auto">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">
            Research Progress
          </h3>
          {progressMessages.map((msg, i) => (
            <p key={i} className="text-xs text-zinc-400 font-mono">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Research Summary Panels */}
      {researchSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: "historical", label: "Historical", data: researchSummary.historical },
            { key: "agenda", label: "Agenda", data: researchSummary.agenda },
            { key: "newsCycle", label: "News Cycle", data: researchSummary.newsCycle },
            { key: "eventFormat", label: "Event Format", data: researchSummary.eventFormat },
          ].map((panel) => (
            <button
              key={panel.key}
              onClick={() =>
                setShowSummary(showSummary === panel.key ? null : panel.key)
              }
              className={`text-left p-3 rounded-lg border transition-colors ${
                showSummary === panel.key
                  ? "border-blue-500 bg-blue-950/30"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
              }`}
            >
              <span className="text-sm font-medium text-zinc-300">
                {panel.label}
              </span>
              <p className="text-xs text-zinc-500 mt-1">
                {panel.data ? "Click to expand" : "Not available"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Expanded Summary */}
      {showSummary && researchSummary && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300">
              {showSummary.charAt(0).toUpperCase() + showSummary.slice(1)} Details
            </h3>
            <button
              onClick={() => setShowSummary(null)}
              className="text-zinc-500 hover:text-white text-sm"
            >
              Close
            </button>
          </div>
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
            {JSON.stringify(
              researchSummary[showSummary as keyof ResearchSummary],
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Cluster Filter */}
      {clusters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-400">Filter:</span>
          <button
            onClick={() => setFilterCluster("all")}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              filterCluster === "all"
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All
          </button>
          {clusters.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterCluster(c.id)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filterCluster === c.id
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {c.cluster_name}
            </button>
          ))}
          <button
            onClick={() => setFilterCluster("none")}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              filterCluster === "none"
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            Unclustered
          </button>
        </div>
      )}

      {/* Word Scores Table */}
      {wordScores.length > 0 ? (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  {[
                    { key: "word" as SortKey, label: "Word" },
                    { key: "combined" as SortKey, label: "Est. %" },
                    { key: "market" as SortKey, label: "Market" },
                    { key: "edge" as SortKey, label: "Edge" },
                    { key: "confidence" as SortKey, label: "Conf." },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer hover:text-white transition-colors"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Hist.
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Agenda
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedScores.map((score) => {
                  const clusterName = clusters.find(
                    (c) => c.id === score.words?.cluster_id
                  )?.cluster_name;

                  return (
                    <tr key={score.id} className="border-b border-zinc-800/50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setExpandedWord(
                              expandedWord === score.id ? null : score.id
                            )
                          }
                          className="text-left"
                        >
                          <span className="text-white font-medium">
                            {score.words?.word}
                          </span>
                          {clusterName && (
                            <span className="text-xs text-zinc-500 ml-2">
                              {clusterName}
                            </span>
                          )}
                        </button>
                        {expandedWord === score.id && (
                          <div className="mt-3 p-3 bg-zinc-800/50 rounded text-xs space-y-2">
                            <p className="text-zinc-300">{score.reasoning}</p>
                            {score.key_evidence &&
                              score.key_evidence.length > 0 && (
                                <div>
                                  <p className="text-zinc-500 font-medium mb-1">
                                    Key Evidence:
                                  </p>
                                  <ul className="list-disc list-inside text-zinc-400 space-y-1">
                                    {score.key_evidence.map((ev, i) => (
                                      <li key={i}>{ev}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white font-mono">
                        {Math.round((score.combined_probability ?? 0) * 100)}%
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-mono">
                        {Math.round((score.market_yes_price ?? 0) * 100)}¢
                      </td>
                      <td
                        className={`px-4 py-3 font-mono font-medium ${edgeColor(score.edge ?? 0)}`}
                      >
                        {score.edge > 0 ? "+" : ""}
                        {Math.round((score.edge ?? 0) * 100)}¢
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${confBadge(score.confidence)}`}
                        >
                          {score.confidence}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono">
                        {Math.round(
                          (score.historical_probability ?? 0) * 100
                        )}
                        %
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono">
                        {score.agenda_probability != null
                          ? `${score.agenda_probability > 0 ? "+" : ""}${Math.round(score.agenda_probability * 100)}%`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !researchRunning && (
          <div className="text-center py-12 text-zinc-500">
            No research data yet. Click &ldquo;Start Research&rdquo; to begin.
          </div>
        )
      )}

      {/* Clusters Panel */}
      {clusters.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Word Clusters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clusters.map((c) => (
              <div
                key={c.id}
                className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4"
              >
                <h3 className="text-sm font-semibold text-white">
                  {c.cluster_name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">{c.theme}</p>
                {c.correlation_note && (
                  <p className="text-xs text-zinc-500 mt-2 italic">
                    {c.correlation_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run History */}
      {runs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Research Runs</h2>
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      run.status === "completed"
                        ? "bg-green-900/50 text-green-400"
                        : run.status === "running"
                          ? "bg-yellow-900/50 text-yellow-400"
                          : "bg-red-900/50 text-red-400"
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="text-zinc-300 capitalize">{run.layer}</span>
                  <span className="text-zinc-500">
                    {new Date(run.triggered_at).toLocaleString()}
                  </span>
                </div>
                {run.total_cost_cents != null && (
                  <span className="text-zinc-500">
                    Cost: ${(run.total_cost_cents / 100).toFixed(2)}
                  </span>
                )}
                {run.error_message && (
                  <span className="text-red-400 text-xs truncate max-w-xs">
                    {run.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
