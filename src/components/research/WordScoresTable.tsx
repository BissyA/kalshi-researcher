import type { WordScore, Cluster, Trade, SortKey, PriceData } from "@/types/components";
import { edgeColor, confBadge } from "@/lib/ui-utils";

interface TradeForm {
  side: "yes" | "no";
  entryPrice: number;
  contracts: number;
  totalCost: number;
}

interface WordScoresTableProps {
  wordScores: WordScore[];
  clusters: Cluster[];
  livePrices: Record<string, PriceData>;
  trades: Trade[];
  tradeFormWordId: string | null;
  tradeForm: TradeForm;
  tradeLoading: boolean;
  onTradeFormWordId: (id: string | null) => void;
  onTradeFormChange: (form: TradeForm) => void;
  onSubmitTrade: (wordId: string) => void;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
  filterCluster: string;
  onFilterClusterChange: (cluster: string) => void;
  researchRunning: boolean;
}

export function WordScoresTable({
  wordScores,
  clusters,
  livePrices,
  trades,
  tradeFormWordId,
  tradeForm,
  tradeLoading,
  onTradeFormWordId,
  onTradeFormChange,
  onSubmitTrade,
  sortKey,
  sortAsc,
  onSort,
  filterCluster,
  onFilterClusterChange,
  researchRunning,
}: WordScoresTableProps) {
  function getLivePrice(score: WordScore): number | null {
    const ticker = score.words?.kalshi_market_ticker;
    if (!ticker || !livePrices[ticker]) return null;
    return livePrices[ticker].yesAsk;
  }

  function handleSort(key: SortKey) {
    onSort(key);
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
        No research data yet. Run research first to see word scores.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Trade</th>
              </tr>
            </thead>
            <tbody>
              {sortedScores.map((score) => {
                const clusterName = clusters.find(
                  (c) => c.id === score.words?.cluster_id
                )?.cluster_name;
                const livePrice = getLivePrice(score);
                const wordTrades = trades.filter((t) => t.word_id === score.word_id);

                return (
                  <tr key={score.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">
                        {score.words?.word}
                      </span>
                      {clusterName && (
                        <span className="text-xs text-zinc-500 ml-2">
                          {clusterName}
                        </span>
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
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const price = livePrice ?? score.market_yes_price ?? 0.5;
                          const rounded = Math.round(price * 100) / 100;
                          onTradeFormChange({
                            side: "yes",
                            entryPrice: rounded,
                            contracts: 1,
                            totalCost: rounded * 1,
                          });
                          onTradeFormWordId(
                            tradeFormWordId === score.word_id ? null : score.word_id
                          );
                        }}
                        className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                      >
                        Trade{wordTrades.length > 0 ? ` (${wordTrades.length})` : ""}
                      </button>
                      {tradeFormWordId === score.word_id && (
                        <div
                          className="mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded space-y-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                onTradeFormChange({ ...tradeForm, side: "yes", totalCost: tradeForm.entryPrice * tradeForm.contracts })
                              }
                              className={`flex-1 py-1 rounded text-xs font-medium ${
                                tradeForm.side === "yes"
                                  ? "bg-green-600 text-white"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              YES
                            </button>
                            <button
                              onClick={() =>
                                onTradeFormChange({ ...tradeForm, side: "no", totalCost: tradeForm.entryPrice * tradeForm.contracts })
                              }
                              className={`flex-1 py-1 rounded text-xs font-medium ${
                                tradeForm.side === "no"
                                  ? "bg-red-600 text-white"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              NO
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-zinc-500">Price</label>
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                max="0.999"
                                value={tradeForm.entryPrice}
                                onChange={(e) => {
                                  const price = parseFloat(e.target.value) || 0;
                                  onTradeFormChange({
                                    ...tradeForm,
                                    entryPrice: price,
                                    totalCost: price * tradeForm.contracts,
                                  });
                                }}
                                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-500">Contracts</label>
                              <input
                                type="number"
                                min="1"
                                value={tradeForm.contracts}
                                onChange={(e) => {
                                  const contracts = parseInt(e.target.value) || 1;
                                  onTradeFormChange({
                                    ...tradeForm,
                                    contracts,
                                    totalCost: tradeForm.entryPrice * contracts,
                                  });
                                }}
                                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-500">Cost ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={tradeForm.totalCost || ""}
                                onChange={(e) =>
                                  onTradeFormChange({
                                    ...tradeForm,
                                    totalCost: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-xs"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">
                              Cost: ${tradeForm.totalCost}
                            </span>
                            <button
                              onClick={() => onSubmitTrade(score.word_id)}
                              disabled={tradeLoading}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white text-xs rounded"
                            >
                              {tradeLoading ? "..." : "Log Trade"}
                            </button>
                          </div>
                        </div>
                      )}
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
