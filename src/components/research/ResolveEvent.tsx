import type { Trade, Word, EventResult } from "@/types/components";

interface SettlementStatus {
  message: string;
  settledWords: number;
  totalWords: number;
  settled: boolean;
}

interface ResolveEventProps {
  trades: Trade[];
  words: Word[];
  eventResults: EventResult[];
  isResolved: boolean;
  mentionResults: Record<string, boolean>;
  onMentionResultsChange: (results: Record<string, boolean>) => void;
  onSubmitResults: () => void;
  resolving: boolean;
  showResolvePanel: boolean;
  onToggleResolvePanel: () => void;
  checkingSettlement: boolean;
  settlementStatus: SettlementStatus | null;
  onCheckSettlement: () => void;
}

export function ResolveEvent({
  trades,
  words,
  isResolved,
  mentionResults,
  onMentionResultsChange,
  onSubmitResults,
  resolving,
  showResolvePanel,
  onToggleResolvePanel,
  checkingSettlement,
  settlementStatus,
  onCheckSettlement,
}: ResolveEventProps) {
  if (trades.length === 0 && !isResolved) return null;

  const resolvedTrades = trades.filter((t) => t.result != null);
  const totalPnl = resolvedTrades.reduce((s, t) => s + (t.pnl_cents ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Resolve Event</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onCheckSettlement}
            disabled={checkingSettlement}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            {checkingSettlement ? "Checking..." : isResolved ? "Re-check Settlement" : "Check Settlement"}
          </button>
          {!isResolved && (
            <button
              onClick={onToggleResolvePanel}
              className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
            >
              {showResolvePanel ? "Hide" : "Manual Resolve"}
            </button>
          )}
        </div>
      </div>

      {/* Settlement status feedback */}
      {settlementStatus && (
        <div
          className={`text-sm px-4 py-3 rounded-lg ${
            settlementStatus.settled
              ? "bg-green-900/30 text-green-400 border border-green-800"
              : "bg-zinc-800 text-zinc-300 border border-zinc-700"
          }`}
        >
          {settlementStatus.message}
          {!settlementStatus.settled && settlementStatus.totalWords > 0 && (
            <div className="mt-2 w-full bg-zinc-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{
                  width: `${(settlementStatus.settledWords / settlementStatus.totalWords) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {showResolvePanel && !isResolved && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4 space-y-4">
          <p className="text-sm text-zinc-400">
            Check all words that were mentioned during the event:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
            {words.map((w) => (
              <label
                key={w.id}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded border border-zinc-700/50 cursor-pointer hover:border-zinc-600 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={mentionResults[w.id] ?? false}
                  onChange={(e) =>
                    onMentionResultsChange({
                      ...mentionResults,
                      [w.id]: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <span className="text-sm text-zinc-200">{w.word}</span>
              </label>
            ))}
          </div>
          <button
            onClick={onSubmitResults}
            disabled={resolving}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {resolving ? "Resolving..." : "Submit Results"}
          </button>
        </div>
      )}

      {/* P&L Summary after resolution */}
      {isResolved && resolvedTrades.length > 0 && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-zinc-400">Total P&L</p>
              <p
                className={`text-xl font-bold ${
                  totalPnl >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ${(totalPnl / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Win Rate</p>
              <p className="text-xl font-bold text-white">
                {Math.round(
                  (resolvedTrades.filter((t) => t.result === "win").length /
                    resolvedTrades.length) *
                    100
                )}
                %
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Trades</p>
              <p className="text-xl font-bold text-white">
                {resolvedTrades.filter((t) => t.result === "win").length}W /{" "}
                {resolvedTrades.filter((t) => t.result === "loss").length}L
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
