"use client";

import { useState } from "react";
import type { TranscriptSet } from "@/types/corpus";

interface TranscriptSetListProps {
  sets: TranscriptSet[];
  onSelectSet: (set: TranscriptSet) => void;
  onCreateSet: (name: string) => void;
  onDeleteSet: (setId: string) => void;
  loading: boolean;
}

export function TranscriptSetList({
  sets,
  onSelectSet,
  onCreateSet,
  onDeleteSet,
  loading,
}: TranscriptSetListProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreateSet(name);
    setNewName("");
    setCreating(false);
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-zinc-500">Loading transcript sets...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Transcript Sets</h3>
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          + New Set
        </button>
      </div>

      {creating && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Set name (e.g. Recent 5 Briefings)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
            className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="text-xs px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            Create
          </button>
          <button
            onClick={() => { setCreating(false); setNewName(""); }}
            className="text-xs px-3 py-2 rounded-md text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {sets.length === 0 && !creating && (
        <div className="py-12 text-center border border-zinc-800 rounded-lg">
          <div className="text-sm text-zinc-500 mb-2">No transcript sets yet</div>
          <div className="text-xs text-zinc-600">
            Create a set to group comparable past transcripts and view them as one aggregated corpus.
          </div>
        </div>
      )}

      {sets.length > 0 && (
        <div className="space-y-2">
          {sets.map((set) => (
            <div
              key={set.id}
              className="flex items-center justify-between px-4 py-3 border border-zinc-800 rounded-lg hover:bg-zinc-900/50 transition-colors cursor-pointer group"
              onClick={() => onSelectSet(set)}
            >
              <div>
                <div className="text-sm font-medium text-zinc-200">{set.name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {set.transcript_ids.length} {set.transcript_ids.length === 1 ? "transcript" : "transcripts"}
                  {" · "}
                  Created {new Date(set.created_at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete set "${set.name}"?`)) onDeleteSet(set.id);
                  }}
                  className="text-xs px-2 py-1 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  Delete
                </button>
                <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
