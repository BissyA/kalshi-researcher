"use client";

import { useState, useEffect, useRef } from "react";
import type { DbTranscriptSegment } from "@/types/database";

interface CleaningStepProps {
  transcriptId: string;
  cleaningStatus: string;
  rawText: string;
  segments: DbTranscriptSegment[];
  onSegmentsChange: (segments: DbTranscriptSegment[]) => void;
  onStatusChange: () => Promise<void>;
}

export function CleaningStep({
  transcriptId,
  cleaningStatus,
  rawText,
  segments,
  onSegmentsChange,
  onStatusChange,
}: CleaningStepProps) {
  const [cleaning, setCleaning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cleaning) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cleaning]);

  // Start AI cleaning
  async function handleClean() {
    setCleaning(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/clean`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSegmentsChange(data.segments ?? []);
      await onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cleaning failed");
    } finally {
      setCleaning(false);
    }
  }

  // Toggle a segment's speaker status
  function toggleSegment(segmentId: string) {
    const updated = segments.map((s) =>
      s.id === segmentId ? { ...s, is_speaker_content: !s.is_speaker_content } : s
    );
    onSegmentsChange(updated);
    setPendingChanges((prev) => ({
      ...prev,
      [segmentId]: true,
    }));
  }

  // Save adjustments
  async function handleSaveAdjustments() {
    const changedIds = Object.keys(pendingChanges);
    if (changedIds.length === 0) return;

    setSaving(true);
    try {
      const segmentUpdates = changedIds.map((id) => {
        const seg = segments.find((s) => s.id === id);
        return { id, is_speaker_content: seg?.is_speaker_content };
      });

      const res = await fetch(`/api/transcripts/${transcriptId}/cleaning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust", segments: segmentUpdates }),
      });
      if (!res.ok) throw new Error("Save failed");
      setPendingChanges({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Approve cleaning
  async function handleApprove() {
    // Save pending changes first
    if (Object.keys(pendingChanges).length > 0) {
      await handleSaveAdjustments();
    }

    setApproving(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/cleaning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error("Approve failed");
      await onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  }

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const speakerCount = segments.filter((s) => s.is_speaker_content).length;
  const nonSpeakerCount = segments.filter((s) => !s.is_speaker_content).length;

  const isMetadataOnly = !rawText || rawText === "(metadata only)" || rawText.length < 200;

  // Pending state — show raw text preview + clean button
  if (cleaningStatus === "pending" || segments.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-300">Step 1: Clean Transcript</span>
          {!isMetadataOnly && (
            <button
              onClick={handleClean}
              disabled={cleaning}
              className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
            >
              {cleaning ? `Cleaning... ${elapsed}s` : "Start AI Cleaning"}
            </button>
          )}
        </div>
        <div className="p-4">
          {isMetadataOnly ? (
            <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4">
              <p className="text-xs text-yellow-400 font-medium mb-1">Metadata-only transcript</p>
              <p className="text-xs text-zinc-500">
                This transcript is a summary cached by the AI research agent, not a full verbatim transcript. To use the cleaning workflow, upload the actual transcript text by creating a new transcript.
              </p>
              {rawText && rawText !== "(metadata only)" && (
                <p className="text-xs text-zinc-400 mt-2 italic">&quot;{rawText}&quot;</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-3">
                The AI will identify which parts of the transcript were spoken by the target speaker vs. interviewers, moderators, and other participants. You&apos;ll review the results before approving.
              </p>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3 max-h-96 overflow-y-auto">
                <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                  {rawText?.substring(0, 5000)}
                  {rawText && rawText.length > 5000 && (
                    <span className="text-zinc-600">{"\n\n"}... ({rawText.length.toLocaleString()} chars total)</span>
                  )}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Cleaned — show segments with toggle + approve
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Step 1: Clean Transcript</span>
            <span className="text-[10px] text-zinc-500">
              {speakerCount} speaker · {nonSpeakerCount} non-speaker segments
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasPendingChanges && (
              <button
                onClick={handleSaveAdjustments}
                disabled={saving}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
            <button
              onClick={handleClean}
              disabled={cleaning}
              className="text-xs px-2 py-1 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
            >
              {cleaning ? `Re-cleaning... ${elapsed}s` : "Re-clean"}
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
            >
              {approving ? "Approving..." : "Approve Cleaning"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-0.5 max-h-[700px] overflow-y-auto">
        <p className="text-xs text-zinc-500 mb-3">
          Click the toggle on any segment to change whether it&apos;s counted as speaker content. Non-speaker segments (orange border) won&apos;t count for word detection.
        </p>
        {segments.map((seg) => (
          <div
            key={seg.id}
            className={`flex gap-2 group ${
              seg.is_speaker_content
                ? ""
                : "border-l-2 border-orange-500/50 bg-zinc-800/30 pl-2"
            }`}
          >
            <button
              onClick={() => toggleSegment(seg.id)}
              className={`flex-shrink-0 mt-1 w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                seg.is_speaker_content
                  ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                  : "bg-orange-900/30 text-orange-400 hover:bg-orange-900/50"
              }`}
              title={seg.is_speaker_content ? "Mark as non-speaker" : "Mark as speaker"}
            >
              {seg.is_speaker_content ? "S" : "X"}
            </button>
            <div className="flex-1 min-w-0 py-0.5">
              {!seg.is_speaker_content && seg.attribution && (
                <span className="text-[10px] text-orange-400 font-medium mr-1">
                  [{seg.attribution}]
                </span>
              )}
              <span className={`text-xs leading-relaxed ${
                seg.is_speaker_content ? "text-zinc-300" : "text-zinc-500 italic"
              }`}>
                {seg.text}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
