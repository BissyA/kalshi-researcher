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
  category: string | null;
  words: WordResult[];
}

interface CategoryWithCount {
  name: string;
  count: number;
}

interface KalshiMarketsTabProps {
  speakerId: string;
  speakerName: string;
  series: SeriesWithStats[];
  loading: boolean;
  categories: CategoryWithCount[];
  onCategoriesChanged: () => void;
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
  categories: categoriesProp,
  onCategoriesChanged,
  onAddSeries,
  onDeleteSeries,
  onImportSeries,
  onRemoveEvent,
}: KalshiMarketsTabProps) {
  const [adding, setAdding] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Expandable series -> events
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [seriesEvents, setSeriesEvents] = useState<SeriesEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Expandable event -> words
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Event filter and removal
  const [eventFilter, setEventFilter] = useState("");
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);

  // Category management
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);

  // Merge DB categories with locally-created ones
  const dbCategoryNames = categoriesProp.map((c) => c.name);
  const categories = [
    ...categoriesProp,
    ...localCategories
      .filter((lc) => !dbCategoryNames.includes(lc))
      .map((lc) => ({ name: lc, count: 0 })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Category CRUD
  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name || categories.some((c) => c.name === name)) return;
    setCreatingCategory(true);
    try {
      setLocalCategories((prev) => [...prev, name].sort());
      setNewCategoryName("");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleRenameCategory(oldName: string) {
    const newName = renameInput.trim();
    if (!newName || newName === oldName) {
      setRenamingCategory(null);
      return;
    }
    setSavingRename(true);
    try {
      const res = await fetch("/api/corpus/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId, oldName, newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMessage({ type: "success", text: `Renamed "${oldName}" to "${newName}" (${data.updated} events updated)` });
      setLocalCategories((prev) => prev.map((c) => c === oldName ? newName : c));
      onCategoriesChanged();
      // Update local events list if expanded
      setSeriesEvents((prev) =>
        prev.map((e) => e.category === oldName ? { ...e, category: newName } : e)
      );
      setRenamingCategory(null);
      setRenameInput("");
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDeleteCategory(name: string) {
    if (!confirm(`Delete category "${name}"? This will unassign it from all events.`)) return;
    setDeletingCategory(name);
    try {
      const res = await fetch(`/api/corpus/categories?speakerId=${speakerId}&name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMessage({ type: "success", text: `Deleted "${name}" (${data.cleared} events cleared)` });
      setLocalCategories((prev) => prev.filter((c) => c !== name));
      onCategoriesChanged();
      // Update local events list
      setSeriesEvents((prev) =>
        prev.map((e) => e.category === name ? { ...e, category: null } : e)
      );
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setDeletingCategory(null);
    }
  }

  // Assign category to event via dropdown
  async function handleAssignCategory(eventId: string, category: string | null) {
    setAssigningEventId(eventId);
    try {
      await fetch("/api/corpus/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds: [eventId], category }),
      });
      setSeriesEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, category } : e))
      );
      onCategoriesChanged();
    } catch {
      // ignore
    } finally {
      setAssigningEventId(null);
    }
  }

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
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-4">
      {/* Add Series + Category Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add Series */}
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Add Kalshi Series for {speakerName}
          </h3>
          <KalshiSeriesSearch onSelect={handleAddFromSearch} disabled={adding} />
          <p className="text-xs text-zinc-600 mt-2">
            Search for a Kalshi series, then click to add it.
          </p>
        </div>

        {/* Category Management */}
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Corpus Categories
          </h3>
          {/* Create new category */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name..."
              className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCategory();
              }}
            />
            <button
              onClick={handleCreateCategory}
              disabled={creatingCategory || !newCategoryName.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Create
            </button>
          </div>
          {/* Category list */}
          {categories.length === 0 ? (
            <p className="text-xs text-zinc-600">
              No categories yet. Create one to start organizing events.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg border border-zinc-700/50"
                >
                  {renamingCategory === cat.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-600 rounded text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCategory(cat.name);
                          if (e.key === "Escape") { setRenamingCategory(null); setRenameInput(""); }
                        }}
                      />
                      <button
                        onClick={() => handleRenameCategory(cat.name)}
                        disabled={savingRename}
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
                      >
                        {savingRename ? "..." : "Save"}
                      </button>
                      <button
                        onClick={() => { setRenamingCategory(null); setRenameInput(""); }}
                        className="px-2 py-1 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-indigo-400 font-medium">
                        {cat.name}
                        <span className="text-zinc-500 ml-1.5">({cat.count})</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setRenamingCategory(cat.name); setRenameInput(cat.name); }}
                          className="px-2 py-1 text-zinc-500 hover:text-zinc-300 text-[10px] hover:bg-zinc-700 rounded transition-colors"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.name)}
                          disabled={deletingCategory === cat.name}
                          className="px-2 py-1 text-red-400/70 hover:text-red-400 text-[10px] hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                        >
                          {deletingCategory === cat.name ? "..." : "Delete"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
                              const isAssigning = assigningEventId === event.id;
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
                                      {/* Category dropdown */}
                                      <select
                                        value={event.category ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value || null;
                                          handleAssignCategory(event.id, val);
                                        }}
                                        disabled={isAssigning}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`px-2 py-1 bg-zinc-800 border rounded text-xs focus:outline-none focus:border-indigo-500 transition-colors ${
                                          event.category
                                            ? "border-indigo-700/50 text-indigo-400"
                                            : "border-zinc-700 text-zinc-500"
                                        } ${isAssigning ? "opacity-50" : ""}`}
                                      >
                                        <option value="">No category</option>
                                        {categories.map((cat) => (
                                          <option key={cat.name} value={cat.name}>
                                            {cat.name}
                                          </option>
                                        ))}
                                      </select>
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
