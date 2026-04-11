"use client";

import { useState, useEffect, useCallback } from "react";
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
  // ── Set management state ──
  const [sets, setSets] = useState<TranscriptSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [activeSet, setActiveSet] = useState<TranscriptSet | null>(null);

  // ── Toggle: "combined" or a transcript ID ──
  const [activeToggle, setActiveToggle] = useState<string>("combined");

  // ── Available transcripts for the speaker ──
  const [availableTranscripts, setAvailableTranscripts] = useState<DbTranscript[]>([]);

  // ── Composite view data ──
  const [compTranscripts, setCompTranscripts] = useState<TranscriptMeta[]>([]);
  const [compSections, setCompSections] = useState<DbTranscriptSection[]>([]);
  const [compSegments, setCompSegments] = useState<DbTranscriptSegment[]>([]);
  const [compDetections, setCompDetections] = useState<SectionWordResult[]>([]);
  const [compEventWords, setCompEventWords] = useState<{ word: string }[]>([]);
  const [compLoading, setCompLoading] = useState(false);

  // ── Mention data (Kalshi rates) ──
  const [mentionData, setMentionData] = useState<Record<string, { rate: number; yes: number; total: number }>>({});

  // ── Individual transcript for toggle view ──
  const [individualTranscript, setIndividualTranscript] = useState<DbTranscript | null>(null);

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
      const lookup: Record<string, { rate: number; yes: number; total: number }> = {};
      for (const row of data.rows ?? []) {
        lookup[row.word.toLowerCase()] = {
          rate: row.mentionRate,
          yes: row.yesCount,
          total: row.totalEvents,
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

  // ── Fetch composite data when viewing a set ──
  const fetchCompositeData = useCallback(async (transcriptIds: string[]) => {
    if (transcriptIds.length === 0) {
      setCompTranscripts([]);
      setCompSections([]);
      setCompSegments([]);
      setCompDetections([]);
      setCompEventWords([]);
      return;
    }
    setCompLoading(true);
    try {
      const res = await fetch(
        `/api/transcripts/compare?ids=${transcriptIds.join(",")}&speakerId=${speakerId}`
      );
      const data = await res.json();
      setCompTranscripts(data.transcripts ?? []);
      setCompSections(data.sections ?? []);
      setCompSegments(data.segments ?? []);
      setCompDetections(data.wordDetections ?? []);
      setCompEventWords(data.eventWords ?? []);
    } catch {
      // ignore
    } finally {
      setCompLoading(false);
    }
  }, [speakerId]);

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

  // Reset toggle to combined when switching sets
  useEffect(() => {
    setActiveToggle("combined");
  }, [activeSet?.id]);

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

    // Build toggle label for each transcript
    const toggleLabels = compTranscripts.map((t) => ({
      id: t.id,
      label: t.eventDate
        ? new Date(t.eventDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
        : t.title?.slice(0, 20) || "Transcript",
    }));

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveSet(null)}
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
            {/* View toggle: Combined | individual transcripts */}
            {compTranscripts.length > 0 && (
              <div className="flex gap-1 border-b border-zinc-800 pb-0">
                <button
                  onClick={() => setActiveToggle("combined")}
                  className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                    activeToggle === "combined"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Combined
                  {activeToggle === "combined" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </button>
                {toggleLabels.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveToggle(t.id)}
                    className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                      activeToggle === t.id
                        ? "text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t.label}
                    {activeToggle === t.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Combined view */}
            {activeToggle === "combined" && (
              <CompositeTranscriptView
                transcripts={compTranscripts}
                sections={compSections}
                segments={compSegments}
                wordDetections={compDetections}
                eventWords={compEventWords}
                mentionData={mentionData}
              />
            )}

            {/* Individual transcript view */}
            {activeToggle !== "combined" && individualTranscript && (
              <TranscriptResultsView
                transcript={individualTranscript}
                onBack={() => setActiveToggle("combined")}
                onDelete={async () => {
                  const newIds = currentSet.transcript_ids.filter((id) => id !== activeToggle);
                  await handleUpdateTranscriptIds(currentSet.id, newIds);
                  setActiveToggle("combined");
                }}
              />
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
      onSelectSet={(set) => setActiveSet(set)}
      onCreateSet={handleCreateSet}
      onDeleteSet={handleDeleteSet}
      loading={setsLoading}
    />
  );
}
