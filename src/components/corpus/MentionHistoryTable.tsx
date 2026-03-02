"use client";

import { useState } from "react";
import type { MentionHistoryRow } from "@/types/corpus";

interface MentionHistoryTableProps {
  data: MentionHistoryRow[];
  loading: boolean;
}

type SortKey = "word" | "yes" | "no" | "total" | "rate";

function rateColor(rate: number): string {
  if (rate >= 0.6) return "text-green-400";
  if (rate >= 0.3) return "text-yellow-400";
  if (rate > 0) return "text-red-400";
  return "text-zinc-500";
}

function rateBg(rate: number): string {
  if (rate >= 0.6) return "bg-green-900/40 text-green-400";
  if (rate >= 0.3) return "bg-yellow-900/40 text-yellow-400";
  if (rate > 0) return "bg-red-900/40 text-red-400";
  return "bg-zinc-800 text-zinc-500";
}

export function MentionHistoryTable({ data, loading }: MentionHistoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const filtered = search.trim()
    ? data.filter((row) => row.word.toLowerCase().includes(search.trim().toLowerCase()))
    : data;

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    switch (sortKey) {
      case "word":
        return dir * a.word.localeCompare(b.word);
      case "yes":
        return dir * (a.yesCount - b.yesCount);
      case "no":
        return dir * (a.noCount - b.noCount);
      case "total":
        return dir * (a.totalEvents - b.totalEvents);
      case "rate":
        return dir * (a.mentionRate - b.mentionRate);
      default:
        return 0;
    }
  });

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " \u2191" : " \u2193";
  }

  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <p className="text-zinc-400 text-sm">Loading mention history...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <p className="text-zinc-400 text-sm">
          No mention history data yet. Import historical data from Kalshi to populate this table.
        </p>
      </div>
    );
  }

  const isDefaultSort = sortKey === "total" && !sortAsc;

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search words..."
        className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
      />
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {!isDefaultSort && (
        <div className="flex items-center justify-end px-4 py-2 bg-zinc-900/60 border-b border-zinc-800">
          <button
            onClick={() => {
              setSortKey("total");
              setSortAsc(false);
            }}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Reset sort
          </button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80">
            {(
              [
                ["word", "Word / Phrase"],
                ["yes", "Yes"],
                ["no", "No"],
                ["total", "Total"],
                ["rate", "Mention Rate"],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className={`px-4 py-3 text-left font-medium cursor-pointer hover:text-white transition-colors ${
                  key === "word" ? "text-zinc-300" : "text-zinc-400 text-right"
                }`}
              >
                {label}
                {sortArrow(key)}
              </th>
            ))}
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isExpanded = expandedWord === row.word;
            return (
              <RowGroup
                key={row.word}
                row={row}
                isExpanded={isExpanded}
                onToggle={() =>
                  setExpandedWord(isExpanded ? null : row.word)
                }
              />
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function RowGroup({
  row,
  isExpanded,
  onToggle,
}: {
  row: MentionHistoryRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 font-medium text-white">{row.word}</td>
        <td className="px-4 py-3 text-right text-green-400">{row.yesCount}</td>
        <td className="px-4 py-3 text-right text-red-400">{row.noCount}</td>
        <td className="px-4 py-3 text-right text-zinc-300">{row.totalEvents}</td>
        <td className="px-4 py-3 text-right">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${rateBg(
              row.mentionRate
            )}`}
          >
            {(row.mentionRate * 100).toFixed(0)}%
          </span>
        </td>
        <td className="px-4 py-3 text-right text-zinc-500">
          {isExpanded ? "\u25B2" : "\u25BC"}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="bg-zinc-900/60 px-4 py-0">
            <div className="py-3">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Event-by-Event Results
              </h4>
              <div className="space-y-1.5">
                {row.events.map((evt) => (
                  <div
                    key={evt.eventId + evt.eventTicker}
                    className="flex items-center justify-between text-xs border border-zinc-800/50 rounded px-3 py-2 bg-zinc-900/40"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-300">{evt.eventTitle}</span>
                      <span className="text-zinc-600 ml-2">
                        {evt.eventTicker}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      {evt.eventDate && (
                        <span className="text-zinc-500">
                          {new Date(evt.eventDate).toLocaleDateString()}
                        </span>
                      )}
                      <span
                        className={`font-semibold ${
                          evt.wasMentioned ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {evt.wasMentioned ? "MENTIONED" : "NOT MENTIONED"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
