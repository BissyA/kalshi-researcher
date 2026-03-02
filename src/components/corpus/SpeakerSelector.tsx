"use client";

import { useState } from "react";

interface Speaker {
  id: string;
  name: string;
}

interface SpeakerSelectorProps {
  speakers: Speaker[];
  selectedId: string;
  onSelect: (speakerId: string) => void;
  onAddSpeaker: (name: string) => Promise<void>;
}

export function SpeakerSelector({ speakers, selectedId, onSelect, onAddSpeaker }: SpeakerSelectorProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await onAddSpeaker(newName.trim());
      setNewName("");
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-zinc-400">Speaker</label>
      <select
        value={selectedId}
        onChange={(e) => {
          if (e.target.value === "__add__") {
            setShowAdd(true);
          } else {
            onSelect(e.target.value);
          }
        }}
        className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500"
      >
        <option value="">All Speakers</option>
        {speakers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="__add__">+ Add New Speaker</option>
      </select>

      {showAdd && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Speaker name"
            autoFocus
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 placeholder-zinc-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {adding ? "..." : "Add"}
          </button>
          <button
            onClick={() => { setShowAdd(false); setNewName(""); }}
            className="px-2 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
