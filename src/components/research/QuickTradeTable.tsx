import { useState, useMemo } from "react";
import type { Word, Trade, PriceData } from "@/types/components";

interface TradeForm {
  side: "yes" | "no";
  entryPrice: number;
  contracts: number;
  totalCost: number;
}

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

export function QuickTradeTable({
  words,
  livePrices,
  trades,
  tradeFormWordId,
  tradeForm,
  tradeLoading,
  onTradeFormWordId,
  onTradeFormChange,
  onSubmitTrade,
}: QuickTradeTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"word" | "price">("word");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => {
    return words
      .map((w) => {
        const price = livePrices[w.kalshi_market_ticker];
        const yesPrice = price?.yesAsk ?? null;
        const noPrice = price?.noAsk ?? (yesPrice != null ? 1 - yesPrice : null);
        const wordTrades = trades.filter((t) => t.word_id === w.id);
        return { ...w, yesPrice, noPrice, tradeCount: wordTrades.length };
      })
      .filter((w) => !search || w.word.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sortKey === "word") {
          return sortAsc
            ? a.word.localeCompare(b.word)
            : b.word.localeCompare(a.word);
        }
        const aP = a.yesPrice ?? 0;
        const bP = b.yesPrice ?? 0;
        return sortAsc ? aP - bP : bP - aP;
      });
  }, [words, livePrices, trades, search, sortKey, sortAsc]);

  function handleSort(key: "word" | "price") {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "word"); }
  }

  if (words.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No word contracts loaded for this event.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Log Trades</h3>
        <input
          type="text"
          placeholder="Search words..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-48"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900/80 text-zinc-400 text-left">
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-200"
                onClick={() => handleSort("word")}
              >
                Word {sortKey === "word" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-200"
                onClick={() => handleSort("price")}
              >
                Yes Price {sortKey === "price" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3">No Price</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.map((w) => (
              <tr key={w.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 text-white font-medium">{w.word}</td>
                <td className="px-4 py-3 text-zinc-300 font-mono">
                  {w.yesPrice != null ? `${Math.round(w.yesPrice * 100)}¢` : "-"}
                </td>
                <td className="px-4 py-3 text-zinc-400 font-mono">
                  {w.noPrice != null ? `${Math.round(w.noPrice * 100)}¢` : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      const price = w.yesPrice ?? 0.5;
                      const rounded = Math.round(price * 100) / 100;
                      onTradeFormChange({
                        side: "yes",
                        entryPrice: rounded,
                        contracts: 1,
                        totalCost: rounded,
                      });
                      onTradeFormWordId(tradeFormWordId === w.id ? null : w.id);
                    }}
                    className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                  >
                    Trade{w.tradeCount > 0 ? ` (${w.tradeCount})` : ""}
                  </button>
                  {tradeFormWordId === w.id && (
                    <div className="mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded space-y-2 text-left">
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
                          onClick={() => onSubmitTrade(w.id)}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
