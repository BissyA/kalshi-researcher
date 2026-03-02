"use client";

import { useState } from "react";

interface TranscriptUploadProps {
  defaultSpeaker: string;
  onUploadComplete: () => void;
}

const eventTypes = [
  "rally",
  "address_to_congress",
  "press_conference",
  "interview",
  "remarks",
  "other",
];

export function TranscriptUpload({
  defaultSpeaker,
  onUploadComplete,
}: TranscriptUploadProps) {
  const [speaker, setSpeaker] = useState(defaultSpeaker);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fullText, setFullText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;

  async function handleSubmit() {
    if (!speaker.trim() || !title.trim() || !fullText.trim()) {
      setError("Speaker, title, and transcript text are required.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const res = await fetch("/api/transcripts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker: speaker.trim(),
          title: title.trim(),
          eventType: eventType || null,
          eventDate: eventDate || null,
          sourceUrl: sourceUrl.trim() || null,
          fullText: fullText.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Upload Transcript</h3>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/30 rounded p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Speaker</label>
          <input
            type="text"
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Remarks in Laredo, TX"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
          >
            <option value="">Select type...</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Event Date</label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">
          Source URL (optional)
        </label>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-zinc-500">Transcript Text</label>
          {wordCount > 0 && (
            <span className="text-xs text-zinc-600">
              {wordCount.toLocaleString()} words
            </span>
          )}
        </div>
        <textarea
          value={fullText}
          onChange={(e) => setFullText(e.target.value)}
          placeholder="Paste the full transcript text here..."
          rows={12}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm font-mono resize-y"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={uploading || !speaker.trim() || !title.trim() || !fullText.trim()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {uploading ? "Uploading..." : "Upload & Analyze"}
      </button>
    </div>
  );
}
