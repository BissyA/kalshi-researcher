"use client";

import { useState, useEffect, useCallback } from "react";
import type { DbTranscript, DbTranscriptSegment, DbTranscriptSection } from "@/types/database";
import { CleaningStep } from "./CleaningStep";
import { SectioningStep } from "./SectioningStep";
import { WordDetectionStep } from "./WordDetectionStep";
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

type WorkflowStep = "upload" | "clean" | "section" | "detect";

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
  const [uploadMode, setUploadMode] = useState<"pdf" | "text" | "youtube">("pdf");
  const [uploadYoutubeUrl, setUploadYoutubeUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Event options for dropdown
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);

  // Workflow state
  const [segments, setSegments] = useState<DbTranscriptSegment[]>([]);
  const [sections, setSections] = useState<DbTranscriptSection[]>([]);

  const selected = transcripts.find((t) => t.id === selectedId) ?? null;

  // Determine current workflow step
  function getActiveStep(t: DbTranscript | null): WorkflowStep {
    if (!t) return "upload";
    if (t.cleaning_status === "approved" && t.sectioning_status === "approved") return "detect";
    if (t.cleaning_status === "approved") return "section";
    return "clean";
  }

  const activeStep = getActiveStep(selected);

  // Fetch transcripts
  const fetchTranscripts = useCallback(async () => {
    if (!speakerId) { setTranscripts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/transcripts?speakerId=${speakerId}&limit=200`);
      const data = await res.json();
      setTranscripts(data.transcripts ?? []);
    } catch {
      setTranscripts([]);
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
      setUploadYoutubeUrl("");
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

  // Completed transcript — full-width results view
  if (selected && selected.completed) {
    return (
      <TranscriptResultsView
        transcript={selected}
        onBack={() => setSelectedId(null)}
        onDelete={async () => {
          await handleDelete(selected.id);
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
                (uploadMode === "youtube" && !uploadYoutubeUrl.trim())
              }
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs rounded transition-colors"
            >
              {uploading ? "Uploading..." : uploadMode === "pdf" ? "Upload PDF" : "Upload Text"}
            </button>
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
            transcripts.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/50 transition-colors ${
                  t.id === selectedId
                    ? "bg-zinc-800/50"
                    : "hover:bg-zinc-900/50"
                }`}
              >
                <div className="text-xs text-zinc-300 font-medium truncate">
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
                  {t.completed ? (
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
            ))
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

            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {(["clean", "section", "detect"] as const).map((step, i) => {
                const labels = { clean: "1. Clean", section: "2. Section", detect: "3. Detect Words" };
                const isActive = activeStep === step;
                const isDone =
                  (step === "clean" && selected.cleaning_status === "approved") ||
                  (step === "section" && selected.sectioning_status === "approved");

                return (
                  <div key={step} className="flex items-center">
                    {i > 0 && <div className="w-6 h-px bg-zinc-700 mx-1" />}
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full ${
                        isActive
                          ? "bg-indigo-600 text-white"
                          : isDone
                            ? "bg-green-900/30 text-green-400"
                            : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {isDone ? `${labels[step]} ✓` : labels[step]}
                    </span>
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
                  await fetchTranscripts();
                }}
              />
            )}

            {activeStep === "detect" && (
              <WordDetectionStep
                transcriptId={selected.id}
                eventId={selected.event_id}
                sections={sections}
                onSave={async () => {
                  // Mark transcript as completed
                  await fetch(`/api/transcripts/${selected.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ completed: true }),
                  });
                  await fetchTranscripts();
                  setSelectedId(null);
                }}
                onDelete={async () => {
                  await handleDelete(selected.id);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
