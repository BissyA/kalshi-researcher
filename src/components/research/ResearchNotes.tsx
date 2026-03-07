"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ResearchNotesProps {
  eventId: string;
  preEventNotes: string | null;
  postEventNotes: string | null;
}

export function ResearchNotes({ eventId, preEventNotes, postEventNotes }: ResearchNotesProps) {
  const [pre, setPre] = useState(preEventNotes ?? "");
  const [post, setPost] = useState(postEventNotes ?? "");
  const [savingPre, setSavingPre] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [savedPre, setSavedPre] = useState(false);
  const [savedPost, setSavedPost] = useState(false);
  const preTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent if data reloads
  useEffect(() => { setPre(preEventNotes ?? ""); }, [preEventNotes]);
  useEffect(() => { setPost(postEventNotes ?? ""); }, [postEventNotes]);

  const save = useCallback(async (field: "pre_event_notes" | "post_event_notes", value: string) => {
    const setSaving = field === "pre_event_notes" ? setSavingPre : setSavingPost;
    const setSaved = field === "pre_event_notes" ? setSavedPre : setSavedPost;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/events/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, field, value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [eventId]);

  function handlePreChange(value: string) {
    setPre(value);
    if (preTimer.current) clearTimeout(preTimer.current);
    preTimer.current = setTimeout(() => save("pre_event_notes", value), 800);
  }

  function handlePostChange(value: string) {
    setPost(value);
    if (postTimer.current) clearTimeout(postTimer.current);
    postTimer.current = setTimeout(() => save("post_event_notes", value), 800);
  }

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (preTimer.current) clearTimeout(preTimer.current);
      if (postTimer.current) clearTimeout(postTimer.current);
    };
  }, []);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="text-sm font-semibold text-zinc-200 mb-4">Research Notes</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pre-event notes */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-medium text-zinc-400">Pre-Event Analysis</label>
            {savingPre && <span className="text-[10px] text-zinc-500">Saving...</span>}
            {savedPre && <span className="text-[10px] text-emerald-500">Saved</span>}
          </div>
          <textarea
            value={pre}
            onChange={(e) => handlePreChange(e.target.value)}
            placeholder="Your thoughts and analysis before the event..."
            className="w-full h-40 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
        </div>

        {/* Post-event notes */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-medium text-zinc-400">Post-Event Review</label>
            {savingPost && <span className="text-[10px] text-zinc-500">Saving...</span>}
            {savedPost && <span className="text-[10px] text-emerald-500">Saved</span>}
          </div>
          <textarea
            value={post}
            onChange={(e) => handlePostChange(e.target.value)}
            placeholder="Reflections on how trades went, lessons learned..."
            className="w-full h-40 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
        </div>
      </div>
    </div>
  );
}
