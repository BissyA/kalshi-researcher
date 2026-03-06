"use client";

import { useState } from "react";
import type { Trade, WordScore, Word } from "@/types/components";

interface LoggedTradesProps {
  trades: Trade[];
  wordScores: WordScore[];
  words: Word[];
  onTradeUpdated?: () => void;
}

export function LoggedTrades({ trades, wordScores, words, onTradeUpdated }: LoggedTradesProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftEntry, setDraftEntry] = useState("");
  const [draftQty, setDraftQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (trades.length === 0) return null;

  async function deleteTrade(tradeId: string) {
    if (!confirm("Delete this trade?")) return;
    setDeletingId(tradeId);
    try {
      const res = await fetch(`/api/trades/${tradeId}`, { method: "DELETE" });
      if (res.ok) onTradeUpdated?.();
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setDraftEntry(String(Math.round(trade.entry_price * 100)));
    setDraftQty(String(trade.contracts));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(trade: Trade) {
    const newEntryCents = parseInt(draftEntry);
    const newQty = parseInt(draftQty);
    if (isNaN(newEntryCents) || newEntryCents <= 0 || newEntryCents >= 100) return;
    if (isNaN(newQty) || newQty <= 0) return;

    const newEntryPrice = newEntryCents / 100;
    if (newEntryPrice === trade.entry_price && newQty === trade.contracts) {
      setEditingId(null);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryPrice: newEntryPrice, contracts: newQty }),
      });
      if (res.ok) {
        setEditingId(null);
        onTradeUpdated?.();
      }
    } finally {
      setSaving(false);
    }
  }

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
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const word =
                  wordScores.find((s) => s.word_id === trade.word_id)?.words?.word ??
                  words.find((w) => w.id === trade.word_id)?.word ??
                  "?";
                const isEditing = editingId === trade.id;
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
                      {isEditing ? (
                        <input
                          type="number"
                          value={draftEntry}
                          onChange={(e) => setDraftEntry(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(trade);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="w-16 px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                          min={1}
                          max={99}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-white hover:underline decoration-dashed underline-offset-2"
                          onClick={() => startEdit(trade)}
                        >
                          {Math.round(trade.entry_price * 100)}¢
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {isEditing ? (
                        <input
                          type="number"
                          value={draftQty}
                          onChange={(e) => setDraftQty(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(trade);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="w-16 px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                          min={1}
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-white hover:underline decoration-dashed underline-offset-2"
                          onClick={() => startEdit(trade)}
                        >
                          {trade.contracts}
                        </span>
                      )}
                    </td>
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
                    <td className="px-2 py-3">
                      <div className="flex gap-1 items-center">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(trade)}
                              disabled={saving}
                              className="text-green-400 hover:text-green-300 text-xs px-1"
                              title="Save"
                            >
                              {saving ? "..." : "✓"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => deleteTrade(trade.id)}
                            disabled={deletingId === trade.id}
                            className="text-red-500/60 hover:text-red-400 text-xs px-1"
                            title="Delete trade"
                          >
                            {deletingId === trade.id ? "..." : "✕"}
                          </button>
                        )}
                      </div>
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
