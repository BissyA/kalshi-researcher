"use client";

import { useState, useEffect, useCallback } from "react";
import type { DbTranscript, DbTranscriptSegment, DbTranscriptSection } from "@/types/database";
import { CleaningStep } from "./CleaningStep";
import { SectioningStep } from "./SectioningStep";
import { TranscriptResultsView } from "./TranscriptResultsView";

interface TranscriptsTabProps {
  speakerId: string;
  speakerName: string;
}

interface EventOption {
  id: string;
  title: string;
  event_date: string | null;
}

interface Analysis {
  id: string;
  eventId: string;
  eventTitle: string | null;
  eventTicker: string | null;
  eventDate: string | null;
  eventStatus: string | null;
  createdAt: string;
  wordsFound: number;
  totalMentions: number;
}

type WorkflowStep = "upload" | "clean" | "section";

export function TranscriptsTab({ speakerId, speakerName }: TranscriptsTabProps) {
  // Transcript list
  const [transcripts, setTranscripts] = useState<DbTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadEventId, setUploadEventId] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadMode, setUploadMode] = useState<"pdf" | "text" | "youtube" | "x">("pdf");
  const [uploadYoutubeUrl, setUploadYoutubeUrl] = useState("");
  const [uploadXUrl, setUploadXUrl] = useState("");
  const [uploadXUseCookies, setUploadXUseCookies] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Preflight (tools installed?)
  const [xPreflight, setXPreflight] = useState<{ ready: boolean; missing: string[] } | null>(null);

  // Event options for dropdown
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);

  // Workflow state
  const [segments, setSegments] = useState<DbTranscriptSegment[]>([]);
  const [sections, setSections] = useState<DbTranscriptSection[]>([]);
  const [stepOverride, setStepOverride] = useState<WorkflowStep | null>(null);

  // Analyses (per transcript) + which one is currently being viewed
  const [analyses, setAnalyses] = useState<Record<string, Analysis[]>>({});
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [analysisPickerFor, setAnalysisPickerFor] = useState<string | null>(null);
  const [analysisPickerSearch, setAnalysisPickerSearch] = useState("");
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  // Sidebar title search
  const [transcriptSearch, setTranscriptSearch] = useState("");

  const selected = transcripts.find((t) => t.id === selectedId) ?? null;

  function isSelfAnalysis(transcriptEventId: string | null | undefined, analysisEventId: string): boolean {
    return !!transcriptEventId && transcriptEventId === analysisEventId;
  }
  function sortAnalysesSelfFirst(transcriptEventId: string | null | undefined, arr: Analysis[]): Analysis[] {
    return [...arr].sort((a, b) => {
      const aSelf = isSelfAnalysis(transcriptEventId, a.eventId) ? 1 : 0;
      const bSelf = isSelfAnalysis(transcriptEventId, b.eventId) ? 1 : 0;
      if (aSelf !== bSelf) return bSelf - aSelf;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  const selectedAnalyses = selected
    ? sortAnalysesSelfFirst(selected.event_id, analyses[selected.id] ?? [])
    : [];
  const selectedAnalysis = selectedAnalyses.find((a) => a.id === selectedAnalysisId) ?? null;

  // Reset override + analysis selection when switching transcripts
  useEffect(() => {
    setStepOverride(null);
    setSelectedAnalysisId(null);
  }, [selectedId]);

  // Determine current workflow step (2 steps now; sectioning approval marks transcript completed)
  function getActiveStep(t: DbTranscript | null): WorkflowStep {
    if (!t) return "upload";
    if (t.cleaning_status === "approved") return "section";
    return "clean";
  }

  const activeStep: WorkflowStep = stepOverride ?? getActiveStep(selected);

  // Fetch transcripts (+ their analyses in one follow-up batch)
  const fetchTranscripts = useCallback(async () => {
    if (!speakerId) { setTranscripts([]); setAnalyses({}); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/transcripts?speakerId=${speakerId}&limit=200`);
      const data = await res.json();
      const transcriptList: DbTranscript[] = data.transcripts ?? [];
      setTranscripts(transcriptList);

      const ids = transcriptList.map((t) => t.id);
      if (ids.length > 0) {
        const aRes = await fetch(`/api/transcripts/analyses?transcriptIds=${ids.join(",")}`);
        const aData = await aRes.json();
        setAnalyses(aData.analyses ?? {});
      } else {
        setAnalyses({});
      }
    } catch {
      setTranscripts([]);
      setAnalyses({});
    } finally {
      setLoading(false);
    }
  }, [speakerId]);

  useEffect(() => { fetchTranscripts(); }, [fetchTranscripts]);

  // Fetch ALL events for this speaker (corpus + researched + traded)
  const fetchEvents = useCallback(async () => {
    if (!speakerId) { setEventOptions([]); return; }
    try {
      const res = await fetch(`/api/corpus/series/events?speakerId=${speakerId}&all=1`);
      const data = await res.json();
      const events = (data.events ?? []).map((e: EventOption) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
      }));
      // Sort by date descending (most recent first)
      events.sort((a: EventOption, b: EventOption) => {
        if (!a.event_date && !b.event_date) return 0;
        if (!a.event_date) return 1;
        if (!b.event_date) return -1;
        return b.event_date.localeCompare(a.event_date);
      });
      setEventOptions(events);
    } catch {
      setEventOptions([]);
    }
  }, [speakerId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Preflight check when X mode is selected
  useEffect(() => {
    if (uploadMode !== "x" || xPreflight) return;
    (async () => {
      try {
        const res = await fetch("/api/transcripts/x-preflight");
        const data = await res.json();
        setXPreflight({ ready: data.ready, missing: data.missing ?? [] });
      } catch {
        setXPreflight({ ready: false, missing: ["Preflight check failed"] });
      }
    })();
  }, [uploadMode, xPreflight]);

  // Poll in-progress transcriptions every 3s
  const hasInProgress = transcripts.some(
    (t) => t.transcription_status === "downloading" || t.transcription_status === "transcribing"
  );
  useEffect(() => {
    if (!hasInProgress) return;
    const interval = setInterval(() => {
      fetchTranscripts();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasInProgress, fetchTranscripts]);

  // Fetch segments/sections when selected transcript changes
  useEffect(() => {
    if (!selectedId) { setSegments([]); setSections([]); return; }
    (async () => {
      try {
        const [cleanRes, secRes] = await Promise.all([
          fetch(`/api/transcripts/${selectedId}/cleaning`),
          fetch(`/api/transcripts/${selectedId}/sections`),
        ]);
        const cleanData = await cleanRes.json();
        const secData = await secRes.json();
        setSegments(cleanData.segments ?? []);
        setSections(secData.sections ?? []);
      } catch {
        setSegments([]);
        setSections([]);
      }
    })();
  }, [selectedId]);

  // Auto-populate when event is selected
  function handleEventSelect(eventId: string) {
    setUploadEventId(eventId);
    setEventDropdownOpen(false);
    setEventSearch("");
    if (eventId) {
      const event = eventOptions.find((e) => e.id === eventId);
      if (event) {
        setUploadTitle(event.title);
        if (!uploadDate && event.event_date) {
          setUploadDate(event.event_date.split("T")[0]);
        }
      }
    }
  }

  // Handle file drop/select
  function handleFileSelect(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file");
      return;
    }
    setUploadFile(file);
    // Auto-set title from filename only if no event is linked (event title takes priority)
    if (!uploadTitle.trim() && !uploadEventId) {
      setUploadTitle(file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
    }
  }

  // Upload handler
  async function handleUpload() {
    setUploading(true);
    try {
      let res: Response;

      if (uploadMode === "pdf" && uploadFile) {
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("speakerId", speakerId);
        if (uploadEventId) formData.append("eventId", uploadEventId);
        if (uploadTitle.trim()) formData.append("title", uploadTitle.trim());
        if (uploadDate) formData.append("eventDate", uploadDate);
        if (uploadUrl) formData.append("sourceUrl", uploadUrl);

        res = await fetch("/api/transcripts/upload-pdf", {
          method: "POST",
          body: formData,
        });
      } else if (uploadMode === "youtube" && uploadYoutubeUrl.trim()) {
        res = await fetch("/api/transcripts/upload-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerId,
            youtubeUrl: uploadYoutubeUrl.trim(),
            eventId: uploadEventId || null,
            title: uploadTitle.trim() || null,
            eventDate: uploadDate || null,
            sourceUrl: uploadUrl || uploadYoutubeUrl.trim(),
          }),
        });
      } else if (uploadMode === "x" && uploadXUrl.trim()) {
        res = await fetch("/api/transcripts/upload-x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerId,
            xUrl: uploadXUrl.trim(),
            eventId: uploadEventId || null,
            title: uploadTitle.trim() || null,
            eventDate: uploadDate || null,
            sourceUrl: uploadUrl || uploadXUrl.trim(),
            useCookies: uploadXUseCookies,
          }),
        });
      } else if (uploadMode === "text" && uploadText.trim()) {
        res = await fetch("/api/transcripts/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakerId,
            eventId: uploadEventId || null,
            title: uploadTitle.trim(),
            eventDate: uploadDate || null,
            sourceUrl: uploadUrl || null,
            fullText: uploadText,
          }),
        });
      } else {
        setUploading(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Reset form & refresh
      setUploadTitle(""); setUploadDate(""); setUploadUrl("");
      setUploadEventId(""); setUploadText(""); setUploadFile(null);
      setUploadYoutubeUrl(""); setUploadXUrl(""); setUploadXUseCookies(false);
      setShowUpload(false);
      await fetchTranscripts();
      setSelectedId(data.transcript.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Delete handler
  async function handleDelete(transcriptId: string) {
    if (!confirm("Delete this transcript and all its segments/sections?")) return;
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (selectedId === transcriptId) setSelectedId(null);
      await fetchTranscripts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // Status badge helper
  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      pending: "bg-zinc-800 text-zinc-500",
      processing: "bg-yellow-900/30 text-yellow-400",
      cleaned: "bg-blue-900/30 text-blue-400",
      sectioned: "bg-blue-900/30 text-blue-400",
      approved: "bg-green-900/30 text-green-400",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[status] || styles.pending}`}>
        {status}
      </span>
    );
  }

  const filteredEvents = eventOptions.filter((e) =>
    e.title.toLowerCase().includes(eventSearch.toLowerCase())
  );

  if (!speakerId) {
    return (
      <div className="text-sm text-zinc-500 py-8 text-center">
        Select a speaker to manage transcripts
      </div>
    );
  }

  async function handleReopenTranscript(transcriptId: string) {
    const res = await fetch(`/api/transcripts/${transcriptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: false }),
    });
    if (!res.ok) {
      alert("Failed to re-open transcript");
      return;
    }
    setStepOverride("section");
    setSelectedAnalysisId(null);
    await fetchTranscripts();
  }

  async function handleRunAnalysis(transcriptId: string, eventId: string) {
    setRunningAnalysis(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to run analysis");
        return;
      }
      setAnalysisPickerFor(null);
      setAnalysisPickerSearch("");
      await fetchTranscripts();
      setSelectedId(transcriptId);
      setSelectedAnalysisId(data.analysisId);
    } catch {
      alert("Failed to run analysis");
    } finally {
      setRunningAnalysis(false);
    }
  }

  async function handleDeleteAnalysis(analysisId: string) {
    if (!confirm("Delete this analysis and its detection data?")) return;
    const res = await fetch(`/api/transcripts/analyses/${analysisId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete analysis");
      return;
    }
    if (selectedAnalysisId === analysisId) setSelectedAnalysisId(null);
    await fetchTranscripts();
  }

  // Completed transcript + analysis selected — full-width results view scoped to that analysis
  if (selected && selected.completed && selectedAnalysis) {
    return (
      <TranscriptResultsView
        transcript={selected}
        analysisId={selectedAnalysis.id}
        eventTitle={selectedAnalysis.eventTitle}
        isSelfAnalysis={isSelfAnalysis(selected.event_id, selectedAnalysis.eventId)}
        onBack={() => setSelectedAnalysisId(null)}
        onDelete={async () => {
          await handleDelete(selected.id);
        }}
        onReopen={async () => {
          await handleReopenTranscript(selected.id);
        }}
      />
    );
  }

  return (
    <div className="flex gap-4" style={{ minHeight: "600px" }}>
      {/* Left panel — transcript list */}
      <div className="w-80 flex-shrink-0 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-300">
            Transcripts ({transcripts.length})
          </span>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            {showUpload ? "Cancel" : "+ Upload"}
          </button>
        </div>

        {/* Upload form */}
        {showUpload && (
          <div className="p-3 border-b border-zinc-800 space-y-2 bg-zinc-900/30">
            {/* Event link dropdown — first, auto-populates other fields */}
            <div className="relative">
              <button
                onClick={() => setEventDropdownOpen(!eventDropdownOpen)}
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-left focus:outline-none focus:border-zinc-500 flex items-center justify-between"
              >
                <span className={uploadEventId ? "text-white" : "text-zinc-500"}>
                  {uploadEventId
                    ? eventOptions.find((e) => e.id === uploadEventId)?.title?.substring(0, 40) || "Event selected"
                    : "Link to Kalshi event (optional)"}
                </span>
                <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {eventDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setEventDropdownOpen(false)} />
                  <div className="fixed z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg" style={{ width: "600px", maxHeight: "500px", left: "50%", transform: "translateX(-50%)", top: "120px" }}>
                    <input
                      type="text"
                      placeholder="Search events..."
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border-b border-zinc-700 text-white text-sm focus:outline-none rounded-t-lg"
                      autoFocus
                    />
                    <div className="overflow-y-auto" style={{ maxHeight: "448px" }}>
                      <button
                        onClick={() => handleEventSelect("")}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-800"
                      >
                        No event (standalone)
                      </button>
                      {filteredEvents.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => handleEventSelect(e.id)}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-800 flex items-center justify-between gap-3"
                        >
                          <span className="text-zinc-300">{e.title}</span>
                          {e.event_date && (
                            <span className="text-zinc-500 flex-shrink-0">
                              {new Date(e.event_date).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <input
              type="text"
              placeholder="Title"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500"
            />
            <input
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500"
            />
            <input
              type="text"
              placeholder="Source URL (optional)"
              value={uploadUrl}
              onChange={(e) => setUploadUrl(e.target.value)}
              className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500"
            />

            {/* Upload mode toggle */}
            <div className="flex gap-1">
              <button
                onClick={() => setUploadMode("pdf")}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                  uploadMode === "pdf"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => setUploadMode("text")}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                  uploadMode === "text"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Text
              </button>
              <button
                onClick={() => setUploadMode("youtube")}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                  uploadMode === "youtube"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                YouTube
              </button>
              <button
                onClick={() => setUploadMode("x")}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                  uploadMode === "x"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                X
              </button>
            </div>

            {/* PDF drop zone */}
            {uploadMode === "pdf" && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? "border-indigo-500 bg-indigo-900/20"
                    : uploadFile
                      ? "border-green-700 bg-green-900/10"
                      : "border-zinc-700 hover:border-zinc-500"
                }`}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pdf";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleFileSelect(file);
                  };
                  input.click();
                }}
              >
                {uploadFile ? (
                  <div>
                    <p className="text-xs text-green-400 font-medium">{uploadFile.name}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {(uploadFile.size / 1024).toFixed(0)} KB — click or drop to replace
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-zinc-400">Drop PDF here or click to browse</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Factbase / Roll Call PDFs work best</p>
                  </div>
                )}
              </div>
            )}

            {/* YouTube URL input */}
            {uploadMode === "youtube" && (
              <div>
                <input
                  type="text"
                  placeholder="Paste YouTube URL (e.g. youtube.com/watch?v=...)"
                  value={uploadYoutubeUrl}
                  onChange={(e) => setUploadYoutubeUrl(e.target.value)}
                  className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500"
                />
                <p className="text-[10px] text-zinc-600 mt-1">
                  Extracts the auto-generated transcript from the video
                </p>
              </div>
            )}

            {/* X URL input */}
            {uploadMode === "x" && (
              <div>
                <input
                  type="text"
                  placeholder="Paste X URL (broadcasts, spaces, or status with video)"
                  value={uploadXUrl}
                  onChange={(e) => setUploadXUrl(e.target.value)}
                  className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500"
                />
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadXUseCookies}
                    onChange={(e) => setUploadXUseCookies(e.target.checked)}
                    className="w-3 h-3"
                  />
                  <span className="text-[10px] text-zinc-500">
                    Use Brave cookies (required for Spaces &amp; private broadcasts — login to X in Brave first)
                  </span>
                </label>
                {xPreflight && !xPreflight.ready && (
                  <div className="mt-2 px-2 py-1.5 border border-red-800/40 bg-red-900/10 rounded">
                    <p className="text-[10px] text-red-400 font-medium">Setup required:</p>
                    <ul className="text-[10px] text-zinc-400 mt-0.5 space-y-0.5">
                      {xPreflight.missing.map((m, i) => (
                        <li key={i}>· {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] text-zinc-600 mt-1">
                  Downloads audio via yt-dlp and transcribes with local Whisper (~3-5 min for a 45 min speech)
                </p>
              </div>
            )}

            {/* Text paste area */}
            {uploadMode === "text" && (
              <>
                <textarea
                  placeholder="Paste transcript text"
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                  rows={6}
                  className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500 resize-y"
                />
                {uploadText && (
                  <div className="text-[10px] text-zinc-600">
                    {uploadText.trim().split(/\s+/).length.toLocaleString()} words
                  </div>
                )}
              </>
            )}

            <button
              onClick={handleUpload}
              disabled={
                uploading ||
                (uploadMode === "pdf" && !uploadFile) ||
                (uploadMode === "text" && !uploadText.trim()) ||
                (uploadMode === "youtube" && !uploadYoutubeUrl.trim()) ||
                (uploadMode === "x" && (!uploadXUrl.trim() || (xPreflight !== null && !xPreflight.ready)))
              }
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs rounded transition-colors"
            >
              {uploading
                ? "Uploading..."
                : uploadMode === "pdf"
                  ? "Upload PDF"
                  : uploadMode === "youtube"
                    ? "Fetch YouTube"
                    : uploadMode === "x"
                      ? "Start Transcription"
                      : "Upload Text"}
            </button>
          </div>
        )}

        {/* Search bar — live filter by title */}
        {transcripts.length > 0 && (
          <div className="px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/20">
            <input
              type="text"
              value={transcriptSearch}
              onChange={(e) => setTranscriptSearch(e.target.value)}
              placeholder="Search transcripts..."
              className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        )}

        {/* Transcript list */}
        <div className="overflow-y-auto" style={{ maxHeight: "500px" }}>
          {loading ? (
            <div className="p-4 text-xs text-zinc-500 text-center">Loading...</div>
          ) : transcripts.length === 0 ? (
            <div className="p-4 text-xs text-zinc-500 text-center">
              No transcripts for {speakerName}
            </div>
          ) : (
            transcripts
              .filter((t) => !transcriptSearch || (t.title ?? "").toLowerCase().includes(transcriptSearch.toLowerCase()))
              .map((t) => {
              const tAnalyses = sortAnalysesSelfFirst(t.event_id, analyses[t.id] ?? []);
              return (
              <div
                key={t.id}
                className={`border-b border-zinc-800/50 transition-colors ${
                  t.id === selectedId ? "bg-zinc-800/30" : ""
                }`}
              >
                <button
                  onClick={() => {
                    if (t.id === selectedId) { setSelectedId(null); }
                    else { setSelectedId(t.id); setSelectedAnalysisId(null); }
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    t.id === selectedId ? "" : "hover:bg-zinc-900/50"
                  }`}
                >
                  <div className="text-xs text-zinc-300 font-medium leading-snug break-words" title={t.title || "Untitled"}>
                    {t.title || "Untitled"}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {t.event_date && (
                      <span className="text-[10px] text-zinc-600">
                        {new Date(t.event_date).toLocaleDateString()}
                      </span>
                    )}
                    {t.word_count && (
                      <span className="text-[10px] text-zinc-600">
                        {t.word_count.toLocaleString()} words
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {t.transcription_status === "downloading" || t.transcription_status === "transcribing" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/30 text-indigo-400">
                        {t.transcription_status}...
                      </span>
                    ) : t.transcription_status === "failed" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400">
                        failed
                      </span>
                    ) : t.completed ? (
                      <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-400">
                        completed
                      </span>
                      {t.word_count && t.word_count > 0 && (
                        <span className="text-[10px] text-zinc-600">~{Math.round(t.word_count / 145)} min</span>
                      )}
                      </>
                    ) : (
                      <>
                        {statusBadge(t.cleaning_status)}
                        {t.cleaning_status === "approved" && statusBadge(t.sectioning_status)}
                      </>
                    )}
                    {t.needs_review && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">
                        review
                      </span>
                    )}
                  </div>
                </button>

                {/* Analyses for completed transcripts */}
                {t.completed && (
                  <div className="pl-4 pr-2 pb-2 space-y-0.5">
                    {tAnalyses.length === 0 ? (
                      <div className="text-[10px] text-zinc-600 italic px-2 py-1">No analyses yet</div>
                    ) : (
                      tAnalyses.map((a) => {
                        const isSelf = isSelfAnalysis(t.event_id, a.eventId);
                        return (
                        <button
                          key={a.id}
                          onClick={() => { setSelectedId(t.id); setSelectedAnalysisId(a.id); }}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors flex items-start gap-2 ${
                            selectedAnalysisId === a.id
                              ? "bg-indigo-900/40 text-indigo-300"
                              : "text-zinc-400 hover:bg-zinc-800/50"
                          }`}
                          title={a.eventTitle ?? ""}
                        >
                          <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                            isSelf
                              ? "bg-green-900/30 text-green-400"
                              : "bg-indigo-900/30 text-indigo-400"
                          }`}>
                            {isSelf ? "original" : "cross"}
                          </span>
                          <span className="flex-1 leading-snug break-words">{a.eventTitle ?? "Untitled event"}</span>
                          <span className="text-[9px] text-zinc-600 flex-shrink-0 mt-0.5">{a.wordsFound}w</span>
                        </button>
                        );
                      })
                    )}
                    <button
                      onClick={() => { setAnalysisPickerFor(t.id); setAnalysisPickerSearch(""); }}
                      className="w-full text-left px-2 py-1 rounded text-[11px] text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                    >
                      + Run new analysis
                    </button>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel — workflow */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500">
            Select a transcript or upload a new one
          </div>
        ) : (
          <div className="space-y-4">
            {/* Transcript header */}
            <div className="border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-900/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white">{selected.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    {selected.event_date && (
                      <span>{new Date(selected.event_date).toLocaleDateString()}</span>
                    )}
                    {selected.word_count && <span>{selected.word_count.toLocaleString()} words</span>}
                    {selected.source_url && (
                      <a href={selected.source_url} target="_blank" rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300">
                        Source
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="text-xs px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Review banner */}
            {selected.needs_review && selected.review_reason && (
              <div className="border border-amber-800/30 bg-amber-900/10 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-400 font-medium">Categories updated — review needed</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{selected.review_reason}</p>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/transcripts/${selected.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ needs_review: false, review_reason: null }),
                    });
                    await fetchTranscripts();
                  }}
                  className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Transcription progress / failure banner — shown when transcription hasn't finished yet */}
            {(selected.transcription_status === "downloading" || selected.transcription_status === "transcribing") && (
              <div className="border border-indigo-800/30 bg-indigo-900/10 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                  <p className="text-xs text-indigo-300 font-medium">
                    {selected.transcription_status === "downloading" ? "Downloading audio" : "Transcribing audio"}
                  </p>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {selected.transcription_progress || "Starting..."}
                </p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Transcription runs in the background — you can navigate away and come back. Expect ~3-5 min for a 45 min speech on Apple Silicon.
                </p>
              </div>
            )}

            {selected.transcription_status === "failed" && (
              <div className="border border-red-800/40 bg-red-900/10 rounded-lg px-4 py-3">
                <p className="text-xs text-red-400 font-medium">Transcription failed</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {selected.transcription_error || "Unknown error"}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/transcripts/${selected.id}/retry-x`, { method: "POST" });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        alert(data.error || "Retry failed");
                        return;
                      }
                      await fetchTranscripts();
                    }}
                    className="text-[11px] px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className="text-[11px] px-2 py-1 bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* Workflow (Clean/Section) — only for transcripts that haven't been fully set up */}
            {selected.transcription_status !== "downloading" &&
              selected.transcription_status !== "transcribing" &&
              selected.transcription_status !== "failed" &&
              !selected.completed && (
            <>
            <div className="flex items-center gap-1">
              {(["clean", "section"] as const).map((step, i) => {
                const labels = { clean: "1. Clean", section: "2. Section" };
                const isActive = activeStep === step;
                const isDone =
                  (step === "clean" && selected.cleaning_status === "approved") ||
                  (step === "section" && selected.sectioning_status === "approved");

                const isReachable = isActive || isDone;
                return (
                  <div key={step} className="flex items-center">
                    {i > 0 && <div className="w-6 h-px bg-zinc-700 mx-1" />}
                    <button
                      type="button"
                      disabled={!isReachable}
                      onClick={() => isReachable && setStepOverride(step)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        isActive
                          ? "bg-indigo-600 text-white"
                          : isDone
                            ? "bg-green-900/30 text-green-400 hover:bg-green-900/50 cursor-pointer"
                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      }`}
                    >
                      {isDone ? `${labels[step]} ✓` : labels[step]}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Active step content */}
            {activeStep === "clean" && (
              <CleaningStep
                transcriptId={selected.id}
                cleaningStatus={selected.cleaning_status}
                rawText={selected.raw_text || selected.full_text}
                segments={segments}
                onSegmentsChange={setSegments}
                onStatusChange={async () => {
                  setStepOverride(null);
                  await fetchTranscripts();
                }}
              />
            )}

            {activeStep === "section" && (
              <SectioningStep
                transcriptId={selected.id}
                speakerId={speakerId}
                sectioningStatus={selected.sectioning_status}
                sections={sections}
                segments={segments}
                onSectionsChange={setSections}
                onSegmentsChange={setSegments}
                onStatusChange={async () => {
                  setStepOverride(null);
                  await fetchTranscripts();
                }}
              />
            )}

            </>
            )}

            {/* Completed transcript hub — analyses manager */}
            {selected.completed && !selectedAnalysis && (
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-300">Analyses</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReopenTranscript(selected.id)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        selected.needs_review
                          ? "text-amber-300 hover:text-amber-200 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      }`}
                      title={selected.needs_review ? (selected.review_reason ?? "Review needed") : "Re-open for edits"}
                    >
                      {selected.needs_review ? "Review sections" : "Edit sections"}
                    </button>
                    <button
                      onClick={() => { setAnalysisPickerFor(selected.id); setAnalysisPickerSearch(""); }}
                      className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                    >
                      + Run new analysis
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  {selectedAnalyses.length === 0 ? (
                    <div className="text-xs text-zinc-500 text-center py-8">
                      <p>No analyses yet for this transcript.</p>
                      <p className="mt-1 text-zinc-600">Click &ldquo;Run new analysis&rdquo; above to detect a future or past Kalshi event&apos;s strike words against this transcript.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedAnalyses.map((a) => {
                        const isSelf = isSelfAnalysis(selected.event_id, a.eventId);
                        return (
                        <div
                          key={a.id}
                          className="border border-zinc-800 rounded-lg px-3 py-2.5 flex items-start gap-3 hover:bg-zinc-900/30 transition-colors"
                        >
                          <button
                            onClick={() => setSelectedAnalysisId(a.id)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-start gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                                isSelf
                                  ? "bg-green-900/30 text-green-400"
                                  : "bg-indigo-900/30 text-indigo-400"
                              }`}>
                                {isSelf ? "original" : "cross"}
                              </span>
                              <div className="text-xs text-zinc-300 font-medium leading-snug break-words">
                                {a.eventTitle ?? "Untitled event"}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-600">
                              {a.eventDate && <span>{new Date(a.eventDate).toLocaleDateString()}</span>}
                              {a.eventStatus && <span className="uppercase">{a.eventStatus}</span>}
                              <span>{a.wordsFound} words found · {a.totalMentions} mentions</span>
                              <span className="text-zinc-700">run {new Date(a.createdAt).toLocaleDateString()}</span>
                            </div>
                          </button>
                          <button
                            onClick={() => setSelectedAnalysisId(a.id)}
                            className="text-[11px] px-2 py-1 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDeleteAnalysis(a.id)}
                            className="text-[11px] px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event picker overlay for "Run new analysis" */}
      {analysisPickerFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20"
          onClick={() => !runningAnalysis && setAnalysisPickerFor(null)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[560px] max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-sm font-medium text-zinc-200">Pick an event to analyze against</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                The transcript stays as-is. This runs word detection using the selected event&apos;s strike list. Each (transcript, event) analysis is saved independently.
              </p>
            </div>
            <div className="px-4 py-2 border-b border-zinc-800">
              <input
                type="text"
                value={analysisPickerSearch}
                onChange={(e) => setAnalysisPickerSearch(e.target.value)}
                placeholder="Search events..."
                autoFocus
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {eventOptions
                .filter((e) => e.title.toLowerCase().includes(analysisPickerSearch.toLowerCase()))
                .map((e) => {
                  const existing = (analyses[analysisPickerFor] ?? []).find((a) => a.eventId === e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => handleRunAnalysis(analysisPickerFor, e.id)}
                      disabled={runningAnalysis}
                      className="w-full text-left px-4 py-2 border-b border-zinc-800/50 hover:bg-zinc-800/50 disabled:opacity-40 disabled:cursor-wait flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-zinc-200 truncate">{e.title}</div>
                        {e.event_date && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {new Date(e.event_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      {existing && (
                        <span className="text-[10px] text-amber-400 flex-shrink-0">already analyzed — will re-run</span>
                      )}
                    </button>
                  );
                })}
              {eventOptions.length === 0 && (
                <div className="p-4 text-xs text-zinc-500 text-center">No events for this speaker</div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] text-zinc-600">
                {runningAnalysis ? "Running detection..." : `${eventOptions.length} events available`}
              </span>
              <button
                onClick={() => setAnalysisPickerFor(null)}
                disabled={runningAnalysis}
                className="text-[11px] px-2 py-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
