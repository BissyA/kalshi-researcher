"use client";

import { useState, useCallback } from "react";
import type { SeriesWithStats } from "@/types/corpus";
import { KalshiSeriesSearch } from "@/components/corpus/KalshiSeriesSearch";

interface WordResult {
  word: string;
  wasMentioned: boolean;
}

interface SeriesEvent {
  id: string;
  title: string;
  eventTicker: string;
  eventDate: string | null;
  status: string;
  words: WordResult[];
}

interface KalshiMarketsTabProps {
  speakerId: string;
  speakerName: string;
  series: SeriesWithStats[];
  loading: boolean;
  onAddSeries: (seriesTicker: string, displayName: string) => Promise<void>;
  onDeleteSeries: (seriesId: string) => Promise<void>;
  onImportSeries: (seriesId: string) => Promise<{ eventsImported: number; wordsImported: number; resultsImported: number; errors: string[] }>;
  onRemoveEvent: (eventId: string, seriesId: string) => Promise<void>;
}

export function KalshiMarketsTab({
  speakerId,
  speakerName,
  series,
  loading,
  onAddSeries,
  onDeleteSeries,
  onImportSeries,
  onRemoveEvent,
}: KalshiMarketsTabProps) {
  const [adding, setAdding] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Expandable series → events
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [seriesEvents, setSeriesEvents] = useState<SeriesEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Expandable event → words
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Event filter and removal
  const [eventFilter, setEventFilter] = useState("");
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);

  const fetchSeriesEvents = useCallback(async (seriesId: string) => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/corpus/series/events?seriesId=${seriesId}`);
      const data = await res.json();
      setSeriesEvents(data.events ?? []);
    } catch {
      setSeriesEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  function toggleSeriesExpand(seriesId: string) {
    if (expandedSeriesId === seriesId) {
      setExpandedSeriesId(null);
      setSeriesEvents([]);
      setExpandedEventId(null);
      setEventFilter("");
    } else {
      setExpandedSeriesId(seriesId);
      setExpandedEventId(null);
      setEventFilter("");
      fetchSeriesEvents(seriesId);
    }
  }

  function toggleEventExpand(eventId: string) {
    setExpandedEventId(expandedEventId === eventId ? null : eventId);
  }

  if (!speakerId) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <p className="text-zinc-400 text-sm">Select a speaker to manage their Kalshi market series.</p>
      </div>
    );
  }

  async function handleAddFromSearch(seriesTicker: string, seriesTitle: string) {
    setAdding(true);
    setStatusMessage(null);
    try {
      await onAddSeries(seriesTicker, seriesTitle);
      setStatusMessage({ type: "success", text: `Series "${seriesTicker}" added` });
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setAdding(false);
    }
  }

  async function handleImport(seriesId: string) {
    setImportingId(seriesId);
    setStatusMessage(null);
    try {
      const result = await onImportSeries(seriesId);
      const parts = [
        `${result.eventsImported} events`,
        `${result.wordsImported} words`,
        `${result.resultsImported} results`,
      ];
      let msg = `Imported ${parts.join(", ")}`;
      if (result.errors.length > 0) {
        msg += ` (${result.errors.length} errors)`;
      }
      setStatusMessage({ type: "success", text: msg });
      // If this series is expanded, refresh its events
      if (expandedSeriesId === seriesId) {
        fetchSeriesEvents(seriesId);
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setImportingId(null);
    }
  }

  async function handleDelete(seriesId: string) {
    if (!confirm("Delete this series and all its events, words, and results?")) return;
    setDeletingId(seriesId);
    setStatusMessage(null);
    try {
      await onDeleteSeries(seriesId);
      if (expandedSeriesId === seriesId) {
        setExpandedSeriesId(null);
        setSeriesEvents([]);
      }
      setStatusMessage({ type: "success", text: "Series deleted" });
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRemoveEvent(eventId: string) {
    if (!expandedSeriesId) return;
    const event = seriesEvents.find((e) => e.id === eventId);
    if (!event) return;

    setRemovingEventId(eventId);
    try {
      await onRemoveEvent(eventId, expandedSeriesId);
      await fetchSeriesEvents(expandedSeriesId);
      setStatusMessage({ type: "success", text: "Event removed" });
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setRemovingEventId(null);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-4">
      {/* Add Series */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Add Kalshi Series for {speakerName}
        </h3>
        <KalshiSeriesSearch onSelect={handleAddFromSearch} disabled={adding} />
        <p className="text-xs text-zinc-600 mt-2">
          Search for a Kalshi series, then click to add it. Import its settled events to populate mention data.
        </p>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`text-sm px-4 py-2 rounded-lg ${
          statusMessage.type === "success"
            ? "bg-green-900/30 text-green-400 border border-green-800"
            : "bg-red-900/30 text-red-400 border border-red-800"
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* Series List */}
      {loading ? (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
          <p className="text-zinc-400 text-sm">Loading series...</p>
        </div>
      ) : series.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
          <p className="text-zinc-400 text-sm">No series added yet. Add a Kalshi series ticker above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {series.map((s) => {
            const isExpanded = expandedSeriesId === s.id;
            return (
              <div
                key={s.id}
                className="border border-zinc-800 rounded-lg bg-zinc-900/30"
              >
                {/* Series header */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleSeriesExpand(s.id)}
                      className="flex items-center gap-2 text-left group"
                    >
                      <svg
                        className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors">
                            {s.series_ticker}
                          </span>
                          {s.display_name && (
                            <span className="text-zinc-500 text-sm">
                              — {s.display_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-500">
                          <span>{s.events_count} events</span>
                          <span>{s.words_count} words</span>
                          {s.last_imported_at && (
                            <span>
                              Last imported: {formatDate(s.last_imported_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleImport(s.id)}
                        disabled={importingId === s.id}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {importingId === s.id ? (
                          <>
                            <span className="inline-block w-3 h-3 border border-zinc-500 border-t-white rounded-full animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 text-red-400 text-xs font-medium rounded-lg transition-colors"
                      >
                        {deletingId === s.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded events list */}
                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    {eventsLoading ? (
                      <div className="p-4 text-center">
                        <p className="text-zinc-500 text-xs">Loading events...</p>
                      </div>
                    ) : seriesEvents.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-zinc-500 text-xs">No events imported yet. Click Refresh to import.</p>
                      </div>
                    ) : (
                      <>
                        {/* Event filter */}
                        <div className="px-4 pt-3">
                          <input
                            type="text"
                            value={eventFilter}
                            onChange={(e) => setEventFilter(e.target.value)}
                            placeholder="Filter events by title..."
                            className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                          />
                          {eventFilter && (
                            <p className="text-xs text-zinc-600 mt-1">
                              Showing {seriesEvents.filter((e) => e.title.toLowerCase().includes(eventFilter.toLowerCase())).length} of {seriesEvents.length} events
                            </p>
                          )}
                        </div>
                        <div className="divide-y divide-zinc-800/50">
                          {seriesEvents
                            .filter((e) =>
                              !eventFilter.trim() || e.title.toLowerCase().includes(eventFilter.toLowerCase())
                            )
                            .map((event) => {
                              const isEventExpanded = expandedEventId === event.id;
                              const yesCount = event.words.filter((w) => w.wasMentioned).length;
                              const noCount = event.words.filter((w) => !w.wasMentioned).length;
                              const isRemoving = removingEventId === event.id;
                              return (
                                <div key={event.id}>
                                  {/* Event row */}
                                  <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                                    <button
                                      onClick={() => toggleEventExpand(event.id)}
                                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                                    >
                                      <svg
                                        className={`w-3 h-3 text-zinc-600 transition-transform flex-shrink-0 ${isEventExpanded ? "rotate-90" : ""}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                      <div className="min-w-0">
                                        {event.eventTicker ? (
                                          <a
                                            href={`https://kalshi.com/markets/${event.eventTicker.toLowerCase().replace(/-.*$/, "")}/${event.eventTicker.toLowerCase()}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-sm text-zinc-300 hover:text-blue-400 block truncate"
                                          >
                                            {event.title}
                                          </a>
                                        ) : (
                                          <span className="text-sm text-zinc-300 block truncate">{event.title}</span>
                                        )}
                                        <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-600">
                                          <span>{formatDate(event.eventDate)}</span>
                                          <span className="text-green-500/70">{yesCount}Y</span>
                                          <span className="text-red-500/70">{noCount}N</span>
                                        </div>
                                      </div>
                                    </button>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                      <span className={`text-xs px-2 py-0.5 rounded ${
                                        event.status === "completed"
                                          ? "bg-zinc-800 text-zinc-400"
                                          : "bg-yellow-900/30 text-yellow-400"
                                      }`}>
                                        {event.status}
                                      </span>
                                      <button
                                        onClick={() => handleRemoveEvent(event.id)}
                                        disabled={isRemoving}
                                        className="px-2 py-1 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                        title="Remove this event from the series (will not be re-imported)"
                                      >
                                        {isRemoving ? "..." : "x"}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expanded word results */}
                                  {isEventExpanded && event.words.length > 0 && (
                                    <div className="px-4 pb-3 pl-10">
                                      <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-lg overflow-hidden">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b border-zinc-800/50">
                                              <th className="text-left py-1.5 px-3 text-zinc-500 font-medium">Word</th>
                                              <th className="text-center py-1.5 px-3 text-zinc-500 font-medium w-20">Mentioned</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-zinc-800/30">
                                            {event.words.map((w) => (
                                              <tr key={w.word}>
                                                <td className="py-1 px-3 text-zinc-300">{w.word}</td>
                                                <td className="py-1 px-3 text-center">
                                                  {w.wasMentioned ? (
                                                    <span className="text-green-400 font-semibold">Y</span>
                                                  ) : (
                                                    <span className="text-red-400 font-semibold">N</span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
