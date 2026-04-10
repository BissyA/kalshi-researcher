"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DbTranscriptSection } from "@/types/database";

interface SectionWordResult {
  sectionId: string;
  title: string;
  words: { word: string; count: number }[];
}

interface WordDetectionStepProps {
  transcriptId: string;
  eventId: string | null;
  sections: DbTranscriptSection[];
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
}

// Section type colors removed — category color is now primary

export function WordDetectionStep({
  transcriptId,
  eventId,
  sections,
  onSave,
  onDelete,
}: WordDetectionStepProps) {
  const [detecting, setDetecting] = useState(false);
  const [results, setResults] = useState<SectionWordResult[] | null>(null);
  const [customWords, setCustomWords] = useState("");
  const [wordsFound, setWordsFound] = useState(0);
  const [totalMentions, setTotalMentions] = useState(0);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (detecting) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [detecting]);

  // Load saved detections on mount
  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/detect-words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reload: true, eventId }),
      });
      // If no saved results, the detect-words endpoint needs a GET or we check the DB
      // For now, try loading from sections API
      const secRes = await fetch(`/api/transcripts/${transcriptId}/sections`);
      const secData = await secRes.json();

      // Check if we have word detections by querying them
      const detRes = await fetch(`/api/transcripts/${transcriptId}/word-detections`);
      if (detRes.ok) {
        const detData = await detRes.json();
        if (detData.details && detData.details.length > 0) {
          setResults(detData.details);
          setWordsFound(detData.wordsFound ?? 0);
          setTotalMentions(detData.totalMentions ?? 0);
        }
      }
    } catch {
      // No saved results
    }
  }, [transcriptId, eventId]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function handleDetect() {
    setDetecting(true);
    try {
      const body: Record<string, unknown> = {};
      if (eventId) body.eventId = eventId;
      if (!eventId && customWords.trim()) {
        body.words = customWords.split("\n").map((w) => w.trim()).filter(Boolean);
      }

      const res = await fetch(`/api/transcripts/${transcriptId}/detect-words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResults(data.details ?? []);
      setWordsFound(data.wordsFound ?? 0);
      setTotalMentions(data.totalMentions ?? 0);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }

  // Collect all unique words with total counts
  const wordTotals: { word: string; total: number; sectionIds: Set<string> }[] = [];
  if (results) {
    const map = new Map<string, { total: number; sectionIds: Set<string> }>();
    for (const sec of results) {
      for (const w of sec.words) {
        const existing = map.get(w.word) || { total: 0, sectionIds: new Set<string>() };
        existing.total += w.count;
        existing.sectionIds.add(sec.sectionId);
        map.set(w.word, existing);
      }
    }
    for (const [word, data] of map) {
      wordTotals.push({ word, total: data.total, sectionIds: data.sectionIds });
    }
    wordTotals.sort((a, b) => b.total - a.total);
  }

  // Build categories from section category_name (assigned by AI during sectioning)
  interface CategoryInfo {
    name: string;
    topics: { topic: string; sectionId: string }[];
    sectionIds: Set<string>;
  }

  const categories: CategoryInfo[] = [];
  if (results) {
    const catMap = new Map<string, CategoryInfo>();
    for (const sec of results) {
      const sectionMeta = sections.find((s) => s.id === sec.sectionId);
      const category = sectionMeta?.category_name || "Uncategorized";
      const topic = sectionMeta?.title || sec.title;

      const existing = catMap.get(category) || { name: category, topics: [], sectionIds: new Set<string>() };
      existing.topics.push({ topic, sectionId: sec.sectionId });
      existing.sectionIds.add(sec.sectionId);
      catMap.set(category, existing);
    }
    for (const cat of catMap.values()) {
      categories.push(cat);
    }
  }

  const categoryColors: Record<string, string> = {
    "Economy": "bg-green-800/40 text-green-300 border-green-700/50",
    "Foreign Policy": "bg-blue-800/40 text-blue-300 border-blue-700/50",
    "Politics": "bg-red-800/40 text-red-300 border-red-700/50",
    "Law & Order": "bg-orange-800/40 text-orange-300 border-orange-700/50",
    "Q&A": "bg-yellow-800/40 text-yellow-300 border-yellow-700/50",
    "Opening": "bg-indigo-800/40 text-indigo-300 border-indigo-700/50",
    "Closing": "bg-purple-800/40 text-purple-300 border-purple-700/50",
    "Social Issues": "bg-pink-800/40 text-pink-300 border-pink-700/50",
    "Culture": "bg-cyan-800/40 text-cyan-300 border-cyan-700/50",
    "Border": "bg-amber-800/40 text-amber-300 border-amber-700/50",
    "Other": "bg-zinc-800/40 text-zinc-300 border-zinc-700/50",
  };

  const categoryBorderColors: Record<string, string> = {
    "Economy": "border-green-500/60",
    "Foreign Policy": "border-blue-500/60",
    "Politics": "border-red-500/60",
    "Law & Order": "border-orange-500/60",
    "Military / Defense": "border-sky-500/60",
    "Border & Immigration": "border-amber-500/60",
    "Religious & Cultural": "border-violet-500/60",
    "Social Issues": "border-pink-500/60",
    "Culture": "border-cyan-500/60",
    "Domestic Policy": "border-teal-500/60",
    "Uncategorized": "border-zinc-600",
    "Other": "border-zinc-600",
  };

  function getCategoryColor(name: string): string {
    return categoryColors[name] || categoryColors["Other"];
  }

  // Check if a section is highlighted (by word OR category hover)
  function isSectionHighlighted(sectionId: string): boolean {
    if (!hoveredWord && !hoveredCategory) return true;
    if (hoveredWord) {
      return wordTotals.find((w) => w.word === hoveredWord)?.sectionIds.has(sectionId) ?? false;
    }
    if (hoveredCategory) {
      const cat = categories.find((c) => c.name === hoveredCategory);
      return cat?.sectionIds.has(sectionId) ?? false;
    }
    return true;
  }

  // Check if a strike is highlighted (by category hover)
  function isStrikeHighlighted(word: string): boolean {
    if (!hoveredCategory) return true;
    const cat = categories.find((c) => c.name === hoveredCategory);
    if (!cat) return false;
    // Check if this word appears in any section belonging to the hovered category
    const wordInfo = wordTotals.find((w) => w.word === word);
    if (!wordInfo) return false;
    for (const sid of cat.sectionIds) {
      if (wordInfo.sectionIds.has(sid)) return true;
    }
    return false;
  }

  // Get section type from sections prop
  function getSectionType(sectionId: string): string {
    return sections.find((s) => s.id === sectionId)?.section_type ?? "other";
  }

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Step 3: Detect Words</span>
            {results && (
              <span className="text-[10px] text-zinc-500">
                {wordsFound} words found · {totalMentions} total mentions
              </span>
            )}
          </div>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
          >
            {detecting ? `Detecting... ${elapsed}s` : results ? "Re-detect" : "Run Detection"}
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Word input for standalone transcripts */}
        {!eventId && !results && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">
              This transcript isn&apos;t linked to a Kalshi event. Enter the words to detect (one per line):
            </p>
            <textarea
              value={customWords}
              onChange={(e) => setCustomWords(e.target.value)}
              placeholder={"China\nTariff\nAfford / Affordable / Affordability\nBorder"}
              rows={5}
              className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-500 resize-y font-mono"
            />
          </div>
        )}

        {eventId && !results && (
          <p className="text-xs text-zinc-500">
            Words will be pulled from the linked Kalshi event. Click &quot;Run Detection&quot; to scan the transcript.
          </p>
        )}

        {/* MentionsTerminal-style layout */}
        {results && results.length > 0 && wordTotals.length > 0 && (
          <div className="space-y-4">
            {/* Category bar */}
            {categories.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat.name}
                      onMouseEnter={() => { setHoveredCategory(cat.name); setHoveredWord(null); }}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-all cursor-default ${
                        hoveredCategory === cat.name
                          ? getCategoryColor(cat.name)
                          : hoveredCategory && hoveredCategory !== cat.name
                            ? "bg-zinc-900/30 border-zinc-800 text-zinc-600"
                            : getCategoryColor(cat.name)
                      } ${hoveredCategory && hoveredCategory !== cat.name ? "opacity-30" : ""}`}
                    >
                      <span className="font-medium">{cat.name}</span>
                      <span className="ml-1 opacity-60">{cat.topics.length}</span>
                    </button>
                  ))}
                </div>
                {/* Topics for hovered category */}
                {hoveredCategory && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-1">
                    {categories
                      .find((c) => c.name === hoveredCategory)
                      ?.topics.map((t) => (
                        <span
                          key={t.sectionId}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400"
                        >
                          {t.topic}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Strike tags */}
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Strikes</div>
              <div className="flex flex-wrap gap-1.5">
                {wordTotals.map(({ word, total }) => {
                  const strikeActive = hoveredWord === word;
                  const strikeVisible = isStrikeHighlighted(word);
                  return (
                    <button
                      key={word}
                      onMouseEnter={() => { setHoveredWord(word); setHoveredCategory(null); }}
                      onMouseLeave={() => setHoveredWord(null)}
                      className={`text-xs px-2 py-1 rounded-md border transition-all cursor-default ${
                        strikeActive
                          ? "bg-indigo-600/30 border-indigo-500 text-white"
                          : !strikeVisible
                            ? "bg-zinc-900/30 border-zinc-800 text-zinc-600 opacity-30"
                            : hoveredWord && !strikeActive
                              ? "bg-zinc-900/30 border-zinc-800 text-zinc-600"
                              : "bg-zinc-900/50 border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {word}
                      <span className={`ml-1 ${
                        strikeActive ? "text-indigo-300" : "text-zinc-500"
                      }`}>
                        {total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category-grouped section cards */}
            <div className="space-y-4">
              {categories.map((cat) => {
                const catHighlighted = !hoveredCategory || hoveredCategory === cat.name;
                const catColor = getCategoryColor(cat.name);
                // Get the border color for this category
                const catBorderColor = categoryBorderColors[cat.name] || categoryBorderColors["Other"];

                return (
                  <div
                    key={cat.name}
                    className={`transition-all ${!catHighlighted && !hoveredWord ? "opacity-30" : ""}`}
                  >
                    {/* Category header */}
                    <div
                      className={`flex items-center gap-2 mb-1.5 px-1`}
                      onMouseEnter={() => { setHoveredCategory(cat.name); setHoveredWord(null); }}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${catColor}`}>
                        {cat.name}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {cat.topics.length} {cat.topics.length === 1 ? "section" : "sections"}
                      </span>
                    </div>

                    {/* Sections within this category */}
                    <div className="space-y-1 pl-1">
                      {cat.topics.map((topic) => {
                        const sec = results?.find((r) => r.sectionId === topic.sectionId);
                        if (!sec) return null;
                        const sectionType = getSectionType(sec.sectionId);
                        const sectionMeta = sections.find((s) => s.id === sec.sectionId);
                        const isHighlighted = isSectionHighlighted(sec.sectionId);
                        const sectionIdx = results?.findIndex((r) => r.sectionId === sec.sectionId) ?? 0;

                        return (
                          <div
                            key={sec.sectionId}
                            className={`border-l-3 ${catBorderColor} rounded-r-lg px-3 py-2 transition-all ${
                              isHighlighted ? "bg-zinc-900/40" : "bg-zinc-950/50 opacity-30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-zinc-300">
                                    {sec.title}
                                  </span>
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-800/60 text-zinc-500">
                                    {sectionType}
                                  </span>
                                </div>
                                {sectionMeta?.description && (
                                  <p className="text-[10px] text-zinc-500 mt-0.5">{sectionMeta.description}</p>
                                )}
                                {/* Strike tags for this section */}
                                {sec.words.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {sec.words
                                      .sort((a, b) => b.count - a.count)
                                      .map((w) => (
                                        <span
                                          key={w.word}
                                          onMouseEnter={() => { setHoveredWord(w.word); setHoveredCategory(null); }}
                                          onMouseLeave={() => setHoveredWord(null)}
                                          className={`text-[10px] px-1.5 py-0.5 rounded transition-all ${
                                            hoveredWord === w.word
                                              ? "bg-indigo-600/40 text-white"
                                              : "bg-zinc-800/80 text-zinc-400"
                                          }`}
                                        >
                                          {w.word}
                                          {w.count > 1 && (
                                            <span className="text-zinc-500 ml-0.5">×{w.count}</span>
                                          )}
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="text-[10px] text-zinc-600">§{sectionIdx + 1}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {results && wordTotals.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-4">
            No words detected in any section.
          </p>
        )}

        {/* Final Save / Delete buttons */}
        {results && (
          <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
            <button
              onClick={async () => {
                if (!confirm("Delete this transcript and all its data? This cannot be undone.")) return;
                setDeleting(true);
                try { await onDelete(); } finally { setDeleting(false); }
              }}
              disabled={deleting}
              className="text-xs px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/30 rounded transition-colors"
            >
              {deleting ? "Deleting..." : "Discard Transcript"}
            </button>
            <button
              onClick={async () => {
                setSaving(true);
                try { await onSave(); } finally { setSaving(false); }
              }}
              disabled={saving}
              className="text-xs px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded font-medium transition-colors"
            >
              {saving ? "Saving..." : "Save Transcript"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
