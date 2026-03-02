"use client";

import { useState } from "react";

interface FrequencyData {
  count: number;
  total: number;
  frequency: number;
  avgMentions: number;
}

interface FrequencyTableProps {
  frequencies: Record<string, FrequencyData>;
  eventWords: string[];
}

type FreqSortKey = "word" | "frequency" | "count" | "avg";

export function FrequencyTable({ frequencies, eventWords }: FrequencyTableProps) {
  const [sortKey, setSortKey] = useState<FreqSortKey>("frequency");
  const [sortAsc, setSortAsc] = useState(false);

  const rows = eventWords
    .map((word) => ({
      word,
      ...(frequencies[word] ?? { count: 0, total: 0, frequency: 0, avgMentions: 0 }),
    }))
    .sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortKey) {
        case "word":
          aVal = a.word.toLowerCase();
          bVal = b.word.toLowerCase();
          return sortAsc
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
        case "frequency":
          aVal = a.frequency;
          bVal = b.frequency;
          break;
        case "count":
          aVal = a.count;
          bVal = b.count;
          break;
        case "avg":
          aVal = a.avgMentions;
          bVal = b.avgMentions;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  function handleSort(key: FreqSortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function freqColor(freq: number): string {
    if (freq >= 0.8) return "text-green-400";
    if (freq >= 0.5) return "text-green-300";
    if (freq >= 0.3) return "text-yellow-400";
    if (freq > 0) return "text-red-300";
    return "text-zinc-600";
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">
        Word Frequency Across Corpus
      </h3>
      <p className="text-xs text-zinc-500">
        How often each word from the current event&apos;s market appears across all transcripts.
      </p>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                {[
                  { key: "word" as FreqSortKey, label: "Word" },
                  { key: "count" as FreqSortKey, label: "Appears In" },
                  { key: "frequency" as FreqSortKey, label: "Freq %" },
                  { key: "avg" as FreqSortKey, label: "Avg Count" },
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.word} className="border-b border-zinc-800/50">
                  <td className="px-4 py-2 text-white font-medium">{row.word}</td>
                  <td className="px-4 py-2 text-zinc-400 font-mono text-xs">
                    {row.count}/{row.total}
                  </td>
                  <td className={`px-4 py-2 font-mono text-xs font-medium ${freqColor(row.frequency)}`}>
                    {Math.round(row.frequency * 100)}%
                  </td>
                  <td className="px-4 py-2 text-zinc-400 font-mono text-xs">
                    {row.avgMentions > 0 ? `${row.avgMentions.toFixed(1)}x / speech` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
