import type { WordScore, Cluster, SortKey, PriceData } from "@/types/components";
import { edgeColor, confBadge } from "@/lib/ui-utils";

interface WordAnalysisTableProps {
  wordScores: WordScore[];
  clusters: Cluster[];
  livePrices: Record<string, PriceData>;
  filterCluster: string;
  onFilterClusterChange: (cluster: string) => void;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
  expandedWord: string | null;
  onExpandWord: (id: string | null) => void;
  researchRunning: boolean;
}

export function WordAnalysisTable({
  wordScores,
  clusters,
  livePrices,
  filterCluster,
  onFilterClusterChange,
  sortKey,
  sortAsc,
  onSort,
  expandedWord,
  onExpandWord,
  researchRunning,
}: WordAnalysisTableProps) {
  function getLivePrice(score: WordScore): number | null {
    const ticker = score.words?.kalshi_market_ticker;
    if (!ticker || !livePrices[ticker]) return null;
    return livePrices[ticker].yesAsk;
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      onSort(key); // parent toggles direction
    } else {
      onSort(key);
    }
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
        case "confidence": {
          const confOrder = { high: 3, medium: 2, low: 1 };
          aVal = confOrder[a.confidence as keyof typeof confOrder] ?? 0;
          bVal = confOrder[b.confidence as keyof typeof confOrder] ?? 0;
          break;
        }
        default:
          aVal = 0;
          bVal = 0;
      }

      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  if (wordScores.length === 0) {
    if (researchRunning) return null;
    return (
      <div className="text-center py-12 text-zinc-500">
        No research data yet. Click &ldquo;Start Research&rdquo; to begin.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Word Analysis</h2>

      {/* Cluster Filter */}
      {clusters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-400">Filter:</span>
          <button
            onClick={() => onFilterClusterChange("all")}
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
              onClick={() => onFilterClusterChange(c.id)}
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
            onClick={() => onFilterClusterChange("none")}
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

      {/* Table */}
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
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Live</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Hist.</th>
              </tr>
            </thead>
            <tbody>
              {sortedScores.map((score) => {
                const clusterName = clusters.find(
                  (c) => c.id === score.words?.cluster_id
                )?.cluster_name;
                const livePrice = getLivePrice(score);
                const isExpanded = expandedWord === score.id;

                return (
                  <tr key={score.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onExpandWord(isExpanded ? null : score.id)}
                        className="text-left"
                      >
                        <span className="text-white font-medium">
                          {isExpanded ? "▼ " : "▶ "}
                          {score.words?.word}
                        </span>
                        {clusterName && (
                          <span className="text-xs text-zinc-500 ml-2">
                            {clusterName}
                          </span>
                        )}
                      </button>
                      {isExpanded && (
                        <div className="mt-3 p-3 bg-zinc-800/50 rounded text-xs space-y-2">
                          <div>
                            <p className="text-zinc-500 font-medium mb-1">Agent Reasoning:</p>
                            <p className="text-zinc-300">{score.reasoning}</p>
                          </div>
                          {score.key_evidence && score.key_evidence.length > 0 && (
                            <div>
                              <p className="text-zinc-500 font-medium mb-1">Key Evidence:</p>
                              <ul className="list-disc list-inside text-zinc-400 space-y-1">
                                {score.key_evidence.map((ev, i) => (
                                  <li key={i}>
                                    {typeof ev === "string" ? ev : JSON.stringify(ev)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-700/50">
                            <div>
                              <span className="text-zinc-600">Historical</span>
                              <p className="text-zinc-300 font-mono">
                                {Math.round((score.historical_probability ?? 0) * 100)}%
                              </p>
                            </div>
                            <div>
                              <span className="text-zinc-600">Agenda</span>
                              <p className="text-zinc-300 font-mono">
                                {Math.round((score.agenda_probability ?? 0) * 100)}%
                              </p>
                            </div>
                            <div>
                              <span className="text-zinc-600">News</span>
                              <p className="text-zinc-300 font-mono">
                                {Math.round((score.news_cycle_probability ?? 0) * 100)}%
                              </p>
                            </div>
                            <div>
                              <span className="text-zinc-600">Base Rate</span>
                              <p className="text-zinc-300 font-mono">
                                {Math.round((score.base_rate_probability ?? 0) * 100)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white font-mono">
                      {Math.round((score.combined_probability ?? 0) * 100)}%
                    </td>
                    <td className="px-4 py-3 text-zinc-400 font-mono">
                      {Math.round((score.market_yes_price ?? 0) * 100)}¢
                    </td>
                    <td className={`px-4 py-3 font-mono font-medium ${edgeColor(score.edge ?? 0)}`}>
                      {score.edge > 0 ? "+" : ""}
                      {Math.round((score.edge ?? 0) * 100)}¢
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${confBadge(score.confidence)}`}>
                        {score.confidence}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {livePrice != null ? (
                        <span className={
                          livePrice > (score.market_yes_price ?? 0)
                            ? "text-green-400"
                            : livePrice < (score.market_yes_price ?? 0)
                              ? "text-red-400"
                              : "text-zinc-400"
                        }>
                          {Math.round(livePrice * 100)}¢
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono">
                      {Math.round((score.historical_probability ?? 0) * 100)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
