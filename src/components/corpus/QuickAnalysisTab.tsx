"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useLivePrices } from "@/hooks/useLivePrices";
import type { MentionHistoryRow, MentionEventDetail } from "@/types/corpus";
import { edgeColor } from "@/lib/ui-utils";

interface QuickWord {
  marketTicker: string;
  word: string;
  yesBid: number;
  yesAsk: number;
  lastPrice: number;
  volume: string;
}

interface QuickAnalysisTabProps {
  mentionData: MentionHistoryRow[];
  speakerId: string;
}

interface SavedSearch {
  url: string;
  eventTitle: string;
  eventTicker: string;
}

const STORAGE_KEY = "kalshi-quick-analysis";

function getStorageKey(speakerId: string) {
  return speakerId ? `${STORAGE_KEY}-${speakerId}` : STORAGE_KEY;
}

function loadSavedSearches(speakerId: string): SavedSearch[] {
  try {
    const stored = localStorage.getItem(getStorageKey(speakerId));
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate from old single-object format { url: string } to new array format
      if (Array.isArray(parsed)) return parsed as SavedSearch[];
      // Old format — clear it
      localStorage.removeItem(getStorageKey(speakerId));
    }
  } catch {
    // corrupt or unavailable
  }
  return [];
}

function persistSearches(speakerId: string, searches: SavedSearch[]) {
  try {
    localStorage.setItem(getStorageKey(speakerId), JSON.stringify(searches));
  } catch {
    // full or unavailable
  }
}

type SortKey = "word" | "price" | "rate" | "edge";

export function QuickAnalysisTab({ mentionData, speakerId }: QuickAnalysisTabProps) {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved searches list
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Active analysis state
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [words, setWords] = useState<QuickWord[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  // Live prices via WebSocket
  const marketTickers = useMemo(() => words.map((w) => w.marketTicker), [words]);
  const { prices: livePrices, status: wsStatus } = useLivePrices(marketTickers);

  // Build a lookup from normalized word → mention rate + events
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

  // Load saved searches from localStorage on mount / speaker change
  useEffect(() => {
    const searches = loadSavedSearches(speakerId);
    setSavedSearches(searches);
    // Auto-select the first saved search
    if (searches.length > 0) {
      setActiveIndex(0);
      fetchPrices(searches[0].url);
    } else {
      setActiveIndex(null);
      setWords([]);
      setEventTitle(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerId]);

  const fetchPrices = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    setWords([]);
    setEventTitle(null);

    try {
      const res = await fetch(
        `/api/corpus/quick-prices?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load event");
      setEventTitle(data.eventTitle);
      setWords(data.words ?? []);
      return { eventTitle: data.eventTitle as string, eventTicker: data.eventTicker as string };
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleLoad() {
    const url = urlInput.trim();
    if (!url) return;

    const result = await fetchPrices(url);
    if (!result) return;

    // Check if this URL is already saved
    const existing = savedSearches.findIndex((s) => s.url === url);
    if (existing !== -1) {
      // Already saved — just select it
      setActiveIndex(existing);
      return;
    }

    // Add to saved searches (newest first)
    const newEntry: SavedSearch = {
      url,
      eventTitle: result.eventTitle,
      eventTicker: result.eventTicker,
    };
    const updated = [newEntry, ...savedSearches];
    setSavedSearches(updated);
    persistSearches(speakerId, updated);
    setActiveIndex(0);
    setUrlInput("");
  }

  function handleSelectSearch(index: number) {
    if (index === activeIndex) return;
    setActiveIndex(index);
    setExpandedWord(null);
    fetchPrices(savedSearches[index].url);
  }

  function handleRemoveSearch(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = savedSearches.filter((_, i) => i !== index);
    setSavedSearches(updated);
    persistSearches(speakerId, updated);

    if (activeIndex === index) {
      // Removed the active one — select next available or clear
      if (updated.length > 0) {
        const newIndex = Math.min(index, updated.length - 1);
        setActiveIndex(newIndex);
        fetchPrices(updated[newIndex].url);
      } else {
        setActiveIndex(null);
        setWords([]);
        setEventTitle(null);
      }
    } else if (activeIndex !== null && activeIndex > index) {
      setActiveIndex(activeIndex - 1);
    }
  }

  // Merge initial prices with live WS updates
  const rows = useMemo(() => {
    return words.map((w) => {
      const live = livePrices[w.marketTicker];
      const currentPrice = live ? live.yesAsk : w.yesAsk;
      const currentAsk = live ? live.yesAsk : w.yesAsk;
      const mention = mentionRateMap.get(w.word.toLowerCase());
      const historicalRate = mention?.rate ?? null;
      const edge = historicalRate !== null ? historicalRate - currentPrice : null;

      return {
        word: w.word,
        marketTicker: w.marketTicker,
        currentPrice,
        currentAsk,
        historicalRate,
        historicalTotal: mention?.total ?? null,
        historicalYes: mention?.yesCount ?? null,
        events: mention?.events ?? [],
        edge,
      };
    });
  }, [words, livePrices, mentionRateMap]);

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

  const wsIndicator =
    wsStatus === "connected"
      ? "bg-green-500"
      : wsStatus === "connecting"
        ? "bg-yellow-500"
        : "bg-zinc-600";

  return (
    <div className="space-y-4">
      {/* URL Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="Paste Kalshi mention market URL or event ticker..."
          className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={handleLoad}
          disabled={loading || !urlInput.trim()}
          className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Loading..." : "Analyze"}
        </button>
      </div>

      {error && (
        <div className="border border-red-900/50 bg-red-900/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Saved searches list */}
      {savedSearches.length > 0 && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800/50">
          {savedSearches.map((search, i) => (
            <div
              key={search.url}
              onClick={() => handleSelectSearch(i)}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                activeIndex === i
                  ? "bg-zinc-800/60 text-white"
                  : "bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {activeIndex === i && (
                  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${wsIndicator}`} />
                )}
                <span className="text-sm font-medium truncate">{search.eventTitle}</span>
                <span className="text-xs text-zinc-600 flex-shrink-0">{search.eventTicker}</span>
              </div>
              <button
                onClick={(e) => handleRemoveSearch(i, e)}
                className="text-zinc-600 hover:text-red-400 text-xs ml-3 flex-shrink-0 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active analysis */}
      {eventTitle && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{eventTitle}</h3>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className={`inline-block w-2 h-2 rounded-full ${wsIndicator}`} />
            {wsStatus === "connected"
              ? "Live"
              : wsStatus === "connecting"
                ? "Connecting..."
                : "Offline"}
          </div>
        </div>
      )}

      {words.length > 0 && (
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
                  <QuickRowGroup
                    key={row.marketTicker}
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
      )}

      {/* Summary when we have data */}
      {words.length > 0 && (
        <QuickSummary rows={rows} />
      )}

      {/* Empty state */}
      {savedSearches.length === 0 && !loading && !error && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
          <p className="text-zinc-400 text-sm">
            Paste a Kalshi mention market URL above to compare live prices against historical mention rates.
          </p>
        </div>
      )}
    </div>
  );
}

interface QuickRow {
  word: string;
  marketTicker: string;
  currentPrice: number;
  currentAsk: number;
  historicalRate: number | null;
  historicalTotal: number | null;
  historicalYes: number | null;
  events: MentionEventDetail[];
  edge: number | null;
}

function QuickRowGroup({
  row,
  isExpanded,
  onToggle,
}: {
  row: QuickRow;
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
            : "—"}
        </td>
        <td className="px-4 py-3 text-right text-zinc-500 text-xs">
          {row.historicalTotal !== null
            ? `${row.historicalYes}/${row.historicalTotal}`
            : "—"}
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

function rateBg(rate: number): string {
  if (rate >= 0.6) return "bg-green-900/40 text-green-400";
  if (rate >= 0.3) return "bg-yellow-900/40 text-yellow-400";
  if (rate > 0) return "bg-red-900/40 text-red-400";
  return "bg-zinc-800 text-zinc-500";
}

function QuickSummary({ rows }: { rows: { word: string; edge: number | null; historicalRate: number | null }[] }) {
  const withEdge = rows.filter((r) => r.edge !== null) as { word: string; edge: number; historicalRate: number }[];
  if (withEdge.length === 0) return null;

  const underpriced = withEdge.filter((r) => r.edge > 0.05).sort((a, b) => b.edge - a.edge);
  const overpriced = withEdge.filter((r) => r.edge < -0.05).sort((a, b) => a.edge - b.edge);
  const matched = withEdge.length - underpriced.length - overpriced.length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Underpriced (YES)</div>
        <div className="text-xl font-bold text-green-400">{underpriced.length}</div>
        {underpriced.length > 0 && (
          <div className="text-xs text-zinc-500 mt-1 truncate">
            Top: {underpriced[0].word} (+{(underpriced[0].edge * 100).toFixed(0)}%)
          </div>
        )}
      </div>
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Overpriced (YES)</div>
        <div className="text-xl font-bold text-red-400">{overpriced.length}</div>
        {overpriced.length > 0 && (
          <div className="text-xs text-zinc-500 mt-1 truncate">
            Top: {overpriced[0].word} ({(overpriced[0].edge * 100).toFixed(0)}%)
          </div>
        )}
      </div>
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Fair (&plusmn;5%)</div>
        <div className="text-xl font-bold text-zinc-300">{matched}</div>
        <div className="text-xs text-zinc-500 mt-1">
          {withEdge.length}/{rows.length} matched
        </div>
      </div>
    </div>
  );
}
