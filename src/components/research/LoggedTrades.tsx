import type { Trade, WordScore, Word } from "@/types/components";

interface LoggedTradesProps {
  trades: Trade[];
  wordScores: WordScore[];
  words: Word[];
}

export function LoggedTrades({ trades, wordScores, words }: LoggedTradesProps) {
  if (trades.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">
        Logged Trades ({trades.length})
      </h2>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Word</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Side</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Entry</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Qty</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Cost</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Agent Est.</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Result</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const word =
                  wordScores.find((s) => s.word_id === trade.word_id)?.words?.word ??
                  words.find((w) => w.id === trade.word_id)?.word ??
                  "?";
                return (
                  <tr key={trade.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 text-white">{word}</td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        trade.side === "yes" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {trade.side.toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 font-mono">
                      {Math.round(trade.entry_price * 100)}¢
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{trade.contracts}</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono">
                      {trade.total_cost_cents}¢
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono">
                      {trade.agent_estimated_probability
                        ? `${Math.round(trade.agent_estimated_probability * 100)}%`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {trade.result ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            trade.result === "win"
                              ? "bg-green-900/50 text-green-400"
                              : "bg-red-900/50 text-red-400"
                          }`}
                        >
                          {trade.result}
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono ${
                        (trade.pnl_cents ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {trade.pnl_cents != null ? `${trade.pnl_cents}¢` : "-"}
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
