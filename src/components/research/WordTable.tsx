"use client";

import { useState, useMemo } from "react";
import type { WordScore, PriceData } from "@/types/components";
import type { MentionHistoryRow, MentionEventDetail } from "@/types/corpus";
import { edgeColor } from "@/lib/ui-utils";

interface WordTableProps {
  wordScores: WordScore[];
  livePrices: Record<string, PriceData>;
  mentionData: MentionHistoryRow[];
  mentionLoading: boolean;
  speakers: Array<{ id: string; name: string }>;
  selectedSpeakerId: string;
  onSpeakerChange: (speakerId: string) => void;
}

type SortKey = "word" | "price" | "rate" | "edge";

function rateBg(rate: number): string {
  if (rate >= 0.6) return "bg-green-900/40 text-green-400";
  if (rate >= 0.3) return "bg-yellow-900/40 text-yellow-400";
  if (rate > 0) return "bg-red-900/40 text-red-400";
  return "bg-zinc-800 text-zinc-500";
}

interface WordRow {
  word: string;
  marketTicker: string;
  currentPrice: number;
  historicalRate: number | null;
  edge: number | null;
  sampleYes: number | null;
  sampleTotal: number | null;
  events: MentionEventDetail[];
}

export function WordTable({
  wordScores,
  livePrices,
  mentionData,
  mentionLoading,
  speakers,
  selectedSpeakerId,
  onSpeakerChange,
}: WordTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  // Build mention rate lookup from corpus data
  const mentionRateMap = useMemo(() => {
    const map = new Map<string, { rate: number; total: number; yesCount: number; events: MentionEventDetail[] }>();
    for (const row of mentionData) {
      map.set(row.word.toLowerCase(), {
        rate: row.mentionRate,
        total: row.totalEvents,
        yesCount: row.yesCount,
        events: row.events,
      });
    }
    return map;
  }, [mentionData]);

  // Build rows merging wordScores + live prices + corpus mention data
  const rows = useMemo(() => {
    return wordScores.map((ws): WordRow => {
      const ticker = ws.words?.kalshi_market_ticker ?? "";
      const live = livePrices[ticker];
      const currentPrice = live ? live.yesBid : ws.market_yes_price;

      const wordName = ws.words?.word ?? "";
      const mention = mentionRateMap.get(wordName.toLowerCase());
      const historicalRate = mention?.rate ?? null;
      const edge = historicalRate !== null ? historicalRate - currentPrice : null;

      return {
        word: wordName,
        marketTicker: ticker,
        currentPrice,
        historicalRate,
        edge,
        sampleYes: mention?.yesCount ?? null,
        sampleTotal: mention?.total ?? null,
        events: mention?.events ?? [],
      };
    });
  }, [wordScores, livePrices, mentionRateMap]);

  // Sort
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "word":
          return dir * a.word.localeCompare(b.word);
        case "price":
          return dir * (a.currentPrice - b.currentPrice);
        case "rate":
          return dir * ((a.historicalRate ?? -1) - (b.historicalRate ?? -1));
        case "edge":
          return dir * ((a.edge ?? -999) - (b.edge ?? -999));
        default:
          return 0;
      }
    });
  }, [rows, sortKey, sortAsc]);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " \u2191" : " \u2193";
  }

  if (wordScores.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <p className="text-zinc-400 text-sm">
          No word data available yet. Run research to generate word analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Word Analysis</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Speaker</label>
          <select
            value={selectedSpeakerId}
            onChange={(e) => onSpeakerChange(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
          >
            <option value="">Select speaker...</option>
            {speakers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {mentionLoading && (
            <span className="text-xs text-zinc-500">Loading...</span>
          )}
        </div>
      </div>

      {!selectedSpeakerId && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-6 text-center">
          <p className="text-zinc-400 text-sm">
            Select a speaker above to load historical mention rates from the corpus.
          </p>
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80">
              {(
                [
                  ["word", "Word"],
                  ["price", "Market Price"],
                  ["rate", "Historical Rate"],
                  ["edge", "Edge"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-4 py-3 font-medium cursor-pointer hover:text-white transition-colors ${
                    key === "word" ? "text-left text-zinc-300" : "text-right text-zinc-400"
                  }`}
                >
                  {label}
                  {sortArrow(key)}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-zinc-400 font-medium">
                Sample
              </th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isExpanded = expandedWord === row.word;
              return (
                <WordRowGroup
                  key={row.marketTicker || row.word}
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

function WordRowGroup({
  row,
  isExpanded,
  onToggle,
}: {
  row: WordRow;
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
        <td className="px-4 py-3 text-right text-zinc-200">
          {(row.currentPrice * 100).toFixed(0)}&cent;
        </td>
        <td className="px-4 py-3 text-right">
          {row.historicalRate !== null ? (
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${rateBg(
                row.historicalRate
              )}`}
            >
              {(row.historicalRate * 100).toFixed(0)}%
            </span>
          ) : (
            <span className="text-zinc-600 text-xs">No data</span>
          )}
        </td>
        <td
          className={`px-4 py-3 text-right font-semibold ${
            row.edge !== null ? edgeColor(row.edge) : "text-zinc-600"
          }`}
        >
          {row.edge !== null
            ? `${row.edge > 0 ? "+" : ""}${(row.edge * 100).toFixed(0)}%`
            : "\u2014"}
        </td>
        <td className="px-4 py-3 text-right text-zinc-500 text-xs">
          {row.sampleTotal !== null
            ? `${row.sampleYes}/${row.sampleTotal}`
            : "\u2014"}
        </td>
        <td className="px-4 py-3 text-right text-zinc-500">
          {row.events.length > 0 ? (isExpanded ? "\u25B2" : "\u25BC") : ""}
        </td>
      </tr>
      {isExpanded && row.events.length > 0 && (
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
