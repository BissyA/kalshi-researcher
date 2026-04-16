"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { DbTranscript, DbTranscriptSection, DbTranscriptSegment } from "@/types/database";
import type { TranscriptSet } from "@/types/corpus";
import { TranscriptSetList } from "./TranscriptSetList";
import { TranscriptSelector } from "./TranscriptSelector";
import { CompositeTranscriptView } from "./CompositeTranscriptView";
import { TranscriptResultsView } from "@/components/corpus/TranscriptResultsView";

interface SectionWordResult {
  sectionId: string;
  title: string;
  words: { word: string; count: number }[];
}

interface TranscriptMeta {
  id: string;
  title: string;
  eventDate: string | null;
  wordCount: number;
}

interface CompareTabProps {
  eventId: string;
  speakerId: string;
}

export function CompareTab({ eventId, speakerId }: CompareTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlSetId = searchParams.get("setId");
  const urlView = searchParams.get("view");

  // ── Set management state ──
  const [sets, setSets] = useState<TranscriptSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [activeSet, setActiveSet] = useState<TranscriptSet | null>(null);

  // ── Toggle: "combined" or a transcript ID ── (URL-backed so Cmd+click opens in new tab)
  const [activeToggle, setActiveToggle] = useState<string>(urlView || "combined");

  // Build a URL for a given setId + view, preserving the tab= and other search params
  const buildUrl = useCallback((setId: string | null, view: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "compare");
    if (setId) params.set("setId", setId); else params.delete("setId");
    if (view && view !== "combined") params.set("view", view); else params.delete("view");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [searchParams, pathname]);

  // ── Dropdown open/close ──
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [dropdownOpen]);

  // ── Available transcripts for the speaker ──
  const [availableTranscripts, setAvailableTranscripts] = useState<DbTranscript[]>([]);

  // ── Composite view data ──
  const [compTranscripts, setCompTranscripts] = useState<TranscriptMeta[]>([]);
  const [compSections, setCompSections] = useState<DbTranscriptSection[]>([]);
  const [compSegments, setCompSegments] = useState<DbTranscriptSegment[]>([]);
  const [compDetections, setCompDetections] = useState<SectionWordResult[]>([]);
  const [compEventWords, setCompEventWords] = useState<{ word: string }[]>([]);
  const [compMissingIds, setCompMissingIds] = useState<string[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [runningMissing, setRunningMissing] = useState(false);

  // ── Mention data (Kalshi rates + per-event detail for expandable rows) ──
  const [mentionData, setMentionData] = useState<Record<string, { rate: number; yes: number; total: number; events: import("@/types/corpus").MentionEventDetail[] }>>({});

  // ── Individual transcript for toggle view ──
  const [individualTranscript, setIndividualTranscript] = useState<DbTranscript | null>(null);
  const [individualAnalysisId, setIndividualAnalysisId] = useState<string | null>(null);
  const [individualAnalysisLoading, setIndividualAnalysisLoading] = useState(false);
  const [individualAnalysisEventTitle, setIndividualAnalysisEventTitle] = useState<string | null>(null);
  const [individualAnalysisIsSelf, setIndividualAnalysisIsSelf] = useState(false);
  const [runningIndividualAnalysis, setRunningIndividualAnalysis] = useState(false);

  // ── Fetch sets for this event ──
  const fetchSets = useCallback(async () => {
    setSetsLoading(true);
    try {
      const res = await fetch(`/api/events/transcript-sets?eventId=${eventId}`);
      const data = await res.json();
      setSets(data.sets ?? []);
    } catch {
      // ignore
    } finally {
      setSetsLoading(false);
    }
  }, [eventId]);

  // ── Fetch available transcripts for the speaker ──
  const fetchTranscripts = useCallback(async () => {
    if (!speakerId) return;
    try {
      const res = await fetch(`/api/transcripts?speakerId=${speakerId}&limit=200`);
      const data = await res.json();
      setAvailableTranscripts(data.transcripts ?? []);
    } catch {
      // ignore
    }
  }, [speakerId]);

  // ── Fetch mention data (Kalshi rates) ──
  const fetchMentionData = useCallback(async () => {
    if (!speakerId) return;
    try {
      const res = await fetch(`/api/corpus/mention-history?speakerId=${speakerId}`);
      const data = await res.json();
      const lookup: Record<string, { rate: number; yes: number; total: number; events: import("@/types/corpus").MentionEventDetail[] }> = {};
      for (const row of data.rows ?? []) {
        lookup[row.word.toLowerCase()] = {
          rate: row.mentionRate,
          yes: row.yesCount,
          total: row.totalEvents,
          events: row.events ?? [],
        };
      }
      setMentionData(lookup);
    } catch {
      // ignore
    }
  }, [speakerId]);

  useEffect(() => { fetchSets(); }, [fetchSets]);
  useEffect(() => { fetchTranscripts(); }, [fetchTranscripts]);
  useEffect(() => { fetchMentionData(); }, [fetchMentionData]);

  // Sync activeSet from ?setId= param — runs after sets load
  useEffect(() => {
    if (!urlSetId) return;
    const target = sets.find((s) => s.id === urlSetId);
    if (target && activeSet?.id !== urlSetId) {
      setActiveSet(target);
    }
  }, [urlSetId, sets, activeSet?.id]);

  // Sync activeToggle from ?view= whenever the URL changes
  useEffect(() => {
    setActiveToggle(urlView || "combined");
  }, [urlView]);

  // ── Fetch composite data when viewing a set ──
  const fetchCompositeData = useCallback(async (transcriptIds: string[]) => {
    if (transcriptIds.length === 0) {
      setCompTranscripts([]);
      setCompSections([]);
      setCompSegments([]);
      setCompDetections([]);
      setCompEventWords([]);
      setCompMissingIds([]);
      return;
    }
    setCompLoading(true);
    try {
      const res = await fetch(
        `/api/transcripts/compare?ids=${transcriptIds.join(",")}&eventId=${eventId}&speakerId=${speakerId}`
      );
      const data = await res.json();
      setCompTranscripts(data.transcripts ?? []);
      setCompSections(data.sections ?? []);
      setCompSegments(data.segments ?? []);
      setCompDetections(data.wordDetections ?? []);
      setCompEventWords(data.eventWords ?? []);
      setCompMissingIds(data.missingTranscriptIds ?? []);
    } catch {
      // ignore
    } finally {
      setCompLoading(false);
    }
  }, [speakerId, eventId]);

  async function handleRunMissingAnalyses() {
    if (compMissingIds.length === 0) return;
    setRunningMissing(true);
    try {
      await Promise.all(compMissingIds.map((tid) =>
        fetch(`/api/transcripts/${tid}/analyses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        })
      ));
      if (activeSet) await fetchCompositeData(activeSet.transcript_ids);
    } catch {
      alert("Some analyses failed to run");
    } finally {
      setRunningMissing(false);
    }
  }

  // Re-fetch composite data when set or its transcript IDs change
  useEffect(() => {
    if (activeSet) {
      fetchCompositeData(activeSet.transcript_ids);
    }
  }, [activeSet?.transcript_ids.join(",") ?? "", fetchCompositeData]);

  // ── Load individual transcript when toggle changes ──
  useEffect(() => {
    if (activeToggle === "combined") {
      setIndividualTranscript(null);
      setIndividualAnalysisId(null);
      setIndividualAnalysisEventTitle(null);
      setIndividualAnalysisIsSelf(false);
      return;
    }
    // Find in available transcripts
    const t = availableTranscripts.find((tr) => tr.id === activeToggle);
    if (t) {
      setIndividualTranscript(t);
    } else {
      // Fetch it
      fetch(`/api/transcripts/${activeToggle}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data?.transcript) setIndividualTranscript(data.transcript); })
        .catch(() => {});
    }
  }, [activeToggle, availableTranscripts]);

  // ── Resolve which analysis to show for the individual transcript (prefer the one against the current research event) ──
  const resolveIndividualAnalysis = useCallback(async (transcriptId: string) => {
    setIndividualAnalysisLoading(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/analyses`);
      const data = await res.json();
      const list = (data.analyses ?? []) as Array<{ id: string; eventId: string; eventTitle: string | null }>;
      // Strict match: only use an analysis against the currently-researched event. No fallback,
      // so the empty state prompts the user to run one rather than silently showing a different event.
      const preferred = list.find((a) => a.eventId === eventId) ?? null;
      if (preferred) {
        setIndividualAnalysisId(preferred.id);
        setIndividualAnalysisEventTitle(preferred.eventTitle);
        setIndividualAnalysisIsSelf(preferred.eventId === (individualTranscript?.event_id ?? null));
      } else {
        setIndividualAnalysisId(null);
        setIndividualAnalysisEventTitle(null);
        setIndividualAnalysisIsSelf(false);
      }
    } catch {
      setIndividualAnalysisId(null);
    } finally {
      setIndividualAnalysisLoading(false);
    }
  }, [eventId, individualTranscript?.event_id]);

  useEffect(() => {
    if (activeToggle === "combined" || !individualTranscript) return;
    resolveIndividualAnalysis(individualTranscript.id);
  }, [activeToggle, individualTranscript, resolveIndividualAnalysis]);

  async function handleRunIndividualAnalysis() {
    if (!individualTranscript) return;
    setRunningIndividualAnalysis(true);
    try {
      const res = await fetch(`/api/transcripts/${individualTranscript.id}/analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to run analysis");
        return;
      }
      await resolveIndividualAnalysis(individualTranscript.id);
    } finally {
      setRunningIndividualAnalysis(false);
    }
  }

  // Reset toggle to combined when switching sets (unless URL already specifies a view for the new set)
  useEffect(() => {
    if (!urlView) setActiveToggle("combined");
  }, [activeSet?.id, urlView]);

  // ── Set CRUD handlers ──

  async function handleCreateSet(name: string) {
    try {
      const res = await fetch("/api/events/transcript-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name, transcriptIds: [] }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create set");
        return;
      }
      const data = await res.json();
      setSets((prev) => [...prev, data.set]);
      setActiveSet(data.set);
    } catch {
      // ignore
    }
  }

  async function handleDeleteSet(setId: string) {
    try {
      await fetch(`/api/events/transcript-sets/${setId}`, { method: "DELETE" });
      setSets((prev) => prev.filter((s) => s.id !== setId));
      if (activeSet?.id === setId) {
        setActiveSet(null);
      }
    } catch {
      // ignore
    }
  }

  async function handleUpdateTranscriptIds(setId: string, transcriptIds: string[]) {
    try {
      const res = await fetch(`/api/events/transcript-sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const updated = data.set as TranscriptSet;
      setSets((prev) => prev.map((s) => (s.id === setId ? updated : s)));
      if (activeSet?.id === setId) {
        setActiveSet(updated);
      }
    } catch {
      // ignore
    }
  }

  // ── Render ──

  if (!speakerId) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Select a speaker on the Research tab to compare transcripts.
      </div>
    );
  }

  // Set view with toggle
  if (activeSet) {
    const currentSet = activeSet;

    // Build toggle label for each transcript — most recent first, full date + short title
    const toggleLabels = [...compTranscripts]
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return b.eventDate.localeCompare(a.eventDate);
      })
      .map((t) => ({
        id: t.id,
        title: t.title,
        dateLabel: t.eventDate
          ? new Date(t.eventDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
          : "",
      }));

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveSet(null);
                router.replace(buildUrl(null, "combined"), { scroll: false });
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Back
            </button>
            <h3 className="text-sm font-medium text-zinc-200">{currentSet.name}</h3>
          </div>
        </div>

        {/* Transcript selector */}
        <TranscriptSelector
          available={availableTranscripts}
          selected={currentSet.transcript_ids}
          onSelectionChange={(ids) => handleUpdateTranscriptIds(currentSet.id, ids)}
        />

        {compLoading ? (
          <div className="py-12 text-center text-sm text-zinc-500">Loading transcript data...</div>
        ) : currentSet.transcript_ids.length === 0 ? (
          <div className="py-12 text-center border border-zinc-800 rounded-lg">
            <div className="text-sm text-zinc-500 mb-2">No transcripts selected</div>
            <div className="text-xs text-zinc-600">
              Use the selector above to add completed transcripts to this set.
            </div>
          </div>
        ) : (
          <>
            {/* View toggle: Combined pill + dropdown to pick an individual transcript */}
            {compTranscripts.length > 0 && (() => {
              const currentIndividual = activeToggle !== "combined"
                ? toggleLabels.find((t) => t.id === activeToggle)
                : null;
              return (
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                  {/* Combined — a Link so Cmd+click opens a fresh tab at the set's combined view */}
                  <Link
                    href={buildUrl(activeSet.id, "combined")}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                      e.preventDefault();
                      setActiveToggle("combined");
                      router.replace(buildUrl(activeSet.id, "combined"), { scroll: false });
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      activeToggle === "combined"
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    Combined
                  </Link>

                  {/* Dropdown for individual transcripts */}
                  <div ref={dropdownRef} className="relative flex-1 max-w-[560px]">
                    <button
                      onClick={() => setDropdownOpen((o) => !o)}
                      className={`w-full px-3 py-1.5 text-xs rounded border transition-colors flex items-center justify-between gap-2 ${
                        currentIndividual
                          ? "bg-zinc-900 border-indigo-700 text-zinc-200"
                          : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
                        {currentIndividual ? (
                          <>
                            <span className="text-[10px] text-zinc-500 flex-shrink-0">{currentIndividual.dateLabel}</span>
                            <span className="truncate">{currentIndividual.title}</span>
                          </>
                        ) : (
                          <span className="text-zinc-500">View an individual transcript…</span>
                        )}
                      </span>
                      <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {dropdownOpen && (
                      <div className="absolute z-40 left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 max-h-80 overflow-y-auto">
                        <div className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-wide">
                          {toggleLabels.length} transcript{toggleLabels.length === 1 ? "" : "s"} · ⌘/ctrl-click to open in new tab
                        </div>
                        {toggleLabels.map((t) => {
                          const isActive = activeToggle === t.id;
                          return (
                            <Link
                              key={t.id}
                              href={buildUrl(activeSet.id, t.id)}
                              onClick={(e) => {
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                                e.preventDefault();
                                setActiveToggle(t.id);
                                setDropdownOpen(false);
                                router.replace(buildUrl(activeSet.id, t.id), { scroll: false });
                              }}
                              className={`block w-full text-left px-3 py-2 text-xs transition-colors ${
                                isActive
                                  ? "bg-indigo-900/40 text-indigo-300"
                                  : "text-zinc-300 hover:bg-zinc-800"
                              }`}
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="text-[10px] text-zinc-500 flex-shrink-0 w-24">{t.dateLabel}</span>
                                <span className="leading-snug break-words">{t.title}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Combined view */}
            {activeToggle === "combined" && (
              <>
                {/* Missing analyses banner — transcripts in the set without an analysis against this event */}
                {compMissingIds.length > 0 && (
                  <div className="border border-amber-800/40 bg-amber-900/10 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-amber-300 font-medium">
                        {compMissingIds.length} of {currentSet.transcript_ids.length} transcript{compMissingIds.length === 1 ? "" : "s"} ha{compMissingIds.length === 1 ? "s" : "ve"} no analysis for this event
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        They&apos;re excluded from the Combined view until analyses run against this event&apos;s strikes.
                      </p>
                    </div>
                    <button
                      onClick={handleRunMissingAnalyses}
                      disabled={runningMissing}
                      className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors flex-shrink-0"
                    >
                      {runningMissing ? "Running..." : `Run analysis for ${compMissingIds.length === 1 ? "it" : `all ${compMissingIds.length}`}`}
                    </button>
                  </div>
                )}
                {compTranscripts.length === 0 ? (
                  <div className="py-12 text-center border border-zinc-800 rounded-lg text-sm text-zinc-500">
                    {compMissingIds.length > 0
                      ? "No transcripts in this set have been analyzed against this event yet."
                      : "No data to display."}
                  </div>
                ) : (
                  <CompositeTranscriptView
                    transcripts={compTranscripts}
                    sections={compSections}
                    segments={compSegments}
                    wordDetections={compDetections}
                    eventWords={compEventWords}
                    mentionData={mentionData}
                  />
                )}
              </>
            )}

            {/* Individual transcript view */}
            {activeToggle !== "combined" && individualTranscript && (
              individualAnalysisLoading ? (
                <div className="py-12 text-center text-sm text-zinc-500">Loading analysis...</div>
              ) : individualAnalysisId ? (
                <TranscriptResultsView
                  key={individualAnalysisId}
                  transcript={individualTranscript}
                  analysisId={individualAnalysisId}
                  eventTitle={individualAnalysisEventTitle}
                  isSelfAnalysis={individualAnalysisIsSelf}
                  onBack={() => {
                    setActiveToggle("combined");
                    router.replace(buildUrl(currentSet.id, "combined"), { scroll: false });
                  }}
                  onDelete={async () => {
                    const newIds = currentSet.transcript_ids.filter((id) => id !== activeToggle);
                    await handleUpdateTranscriptIds(currentSet.id, newIds);
                    setActiveToggle("combined");
                    router.replace(buildUrl(currentSet.id, "combined"), { scroll: false });
                  }}
                />
              ) : (
                <div className="border border-zinc-800 rounded-lg p-8 text-center space-y-3">
                  <div className="text-sm text-zinc-300 font-medium">{individualTranscript.title}</div>
                  <p className="text-xs text-zinc-500">
                    This transcript has no analysis yet for the current event&apos;s strike words.
                    Run one to see Structure and Word Analysis scoped to this event.
                  </p>
                  <button
                    onClick={handleRunIndividualAnalysis}
                    disabled={runningIndividualAnalysis}
                    className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
                  >
                    {runningIndividualAnalysis ? "Running..." : "Run analysis against this event"}
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>
    );
  }

  // Set list (default)
  return (
    <TranscriptSetList
      sets={sets}
      onSelectSet={(set) => {
        setActiveSet(set);
        router.replace(buildUrl(set.id, "combined"), { scroll: false });
      }}
      onCreateSet={handleCreateSet}
      onDeleteSet={handleDeleteSet}
      loading={setsLoading}
    />
  );
}
