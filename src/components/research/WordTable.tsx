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
  categories?: string[];
  selectedCategories?: string[];
  onCategoriesChange?: (categories: string[]) => void;
  allWords?: Array<{ id: string; word: string; kalshi_market_ticker: string }>;
  onRefreshMarkets?: () => Promise<void>;
  refreshing?: boolean;
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
  categories = [],
  selectedCategories = [],
  onCategoriesChange,
  allWords = [],
  onRefreshMarkets,
  refreshing = false,
}: WordTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);

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

  // Build rows merging wordScores + live prices + corpus mention data + unscored words
  const rows = useMemo(() => {
    const scoredTickers = new Set(
      wordScores.map((ws) => ws.words?.kalshi_market_ticker).filter(Boolean)
    );

    // Rows from word scores (research results)
    const scoredRows = wordScores.map((ws): WordRow => {
      const ticker = ws.words?.kalshi_market_ticker ?? "";
      const live = livePrices[ticker];
      const currentPrice = live ? live.yesAsk : ws.market_yes_price;

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

    // Rows from words in DB that don't have research scores (newly added markets)
    const unscoredRows = allWords
      .filter((w) => !scoredTickers.has(w.kalshi_market_ticker))
      .map((w): WordRow => {
        const live = livePrices[w.kalshi_market_ticker];
        const currentPrice = live ? live.yesAsk : 0;
        const mention = mentionRateMap.get(w.word.toLowerCase());
        const historicalRate = mention?.rate ?? null;
        const edge = historicalRate !== null && currentPrice > 0
          ? historicalRate - currentPrice
          : null;

        return {
          word: w.word,
          marketTicker: w.kalshi_market_ticker,
          currentPrice,
          historicalRate,
          edge,
          sampleYes: mention?.yesCount ?? null,
          sampleTotal: mention?.total ?? null,
          events: mention?.events ?? [],
        };
      });

    return [...scoredRows, ...unscoredRows];
  }, [wordScores, livePrices, mentionRateMap, allWords]);

  // Sort
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  // When specific categories are selected, only show words that exist in that category's corpus
  const filtered = useMemo(() => {
    if (selectedCategories.length === 0) return rows;
    const corpusWords = new Set(mentionData.map((m) => m.word.toLowerCase()));
    return rows.filter((r) => corpusWords.has(r.word.toLowerCase()));
  }, [rows, selectedCategories, mentionData]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortKey, sortAsc]);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " \u2191" : " \u2193";
  }

  if (wordScores.length === 0 && allWords.length === 0) {
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Word Analysis ({sorted.length})</h2>
          {onRefreshMarkets && (
            <button
              onClick={onRefreshMarkets}
              disabled={refreshing}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              title="Fetch latest markets from Kalshi"
            >
              {refreshing ? (
                <>
                  <span className="inline-block w-3 h-3 border border-zinc-500 border-t-white rounded-full animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Markets
                </>
              )}
            </button>
          )}
        </div>
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
          {selectedSpeakerId && categories.length > 0 && onCategoriesChange && (
            <div className="relative ml-3">
              <button
                onClick={() => setCatDropdownOpen(!catDropdownOpen)}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-500 flex items-center gap-2"
              >
                {selectedCategories.length === 0
                  ? "This event"
                  : selectedCategories.length === 1
                  ? selectedCategories[0]
                  : `${selectedCategories.length} selected`}
                <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {catDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCatDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]">
                    {categories.map((cat) => {
                      const isChecked = selectedCategories.includes(cat);
                      return (
                        <label
                          key={cat}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm text-zinc-200"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                onCategoriesChange(selectedCategories.filter((c) => c !== cat));
                              } else {
                                onCategoriesChange([...selectedCategories, cat]);
                              }
                            }}
                            className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                          />
                          {cat}
                        </label>
                      );
                    })}
                    {selectedCategories.length > 0 && (
                      <>
                        <div className="border-t border-zinc-700 my-1" />
                        <button
                          onClick={() => {
                            onCategoriesChange([]);
                            setCatDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                        >
                          Reset to this event
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
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
