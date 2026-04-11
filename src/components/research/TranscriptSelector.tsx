"use client";

import { useState, useMemo } from "react";
import type { DbTranscript } from "@/types/database";

interface TranscriptSelectorProps {
  available: DbTranscript[];
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
  maxSelections?: number;
}

export function TranscriptSelector({
  available,
  selected,
  onSelectionChange,
  maxSelections = 10,
}: TranscriptSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const completed = useMemo(
    () => available.filter((t) => t.completed).sort((a, b) => {
      const da = a.event_date ? new Date(a.event_date).getTime() : 0;
      const db = b.event_date ? new Date(b.event_date).getTime() : 0;
      return db - da;
    }),
    [available]
  );

  const filtered = useMemo(() => {
    if (!search) return completed;
    const s = search.toLowerCase();
    return completed.filter((t) => t.title?.toLowerCase().includes(s));
  }, [completed, search]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onSelectionChange(selected.filter((s) => s !== id));
    } else if (selected.length < maxSelections) {
      onSelectionChange([...selected, id]);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        <span>{selected.length}/{maxSelections} transcripts selected</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-[500px] max-h-[400px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-zinc-800">
              <input
                type="text"
                placeholder="Search transcripts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="overflow-y-auto max-h-[340px] p-1">
              {filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">
                  {completed.length === 0
                    ? "No completed transcripts for this speaker"
                    : "No transcripts match your search"}
                </div>
              )}
              {filtered.map((t) => {
                const isSelected = selected.includes(t.id);
                const atMax = selected.length >= maxSelections && !isSelected;
                return (
                  <div
                    key={t.id}
                    onClick={() => !atMax && toggle(t.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-600/20 text-white"
                        : atMax
                          ? "text-zinc-600 cursor-not-allowed"
                          : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-indigo-600 border-indigo-500" : "border-zinc-600"
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{t.title}</div>
                      <div className="text-[10px] text-zinc-500">
                        {t.event_date
                          ? new Date(t.event_date).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
                          : "No date"}
                        {t.word_count ? ` · ${t.word_count.toLocaleString()} words` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
