"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import type { DbTranscript, DbTranscriptSection, DbTranscriptSegment } from "@/types/database";
import type { MentionEventDetail } from "@/types/corpus";

interface SectionWordResult {
  sectionId: string;
  title: string;
  words: { word: string; count: number }[];
}

interface TranscriptResultsViewProps {
  transcript: DbTranscript;
  analysisId?: string;
  eventTitle?: string | null;
  isSelfAnalysis?: boolean;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onReopen?: () => Promise<void>;
}

const categoryColors: Record<string, string> = {
  "Economy": "bg-green-800/40 text-green-300 border-green-700/50",
  "Foreign Policy": "bg-blue-800/40 text-blue-300 border-blue-700/50",
  "Politics": "bg-red-800/40 text-red-300 border-red-700/50",
  "Law & Order": "bg-orange-800/40 text-orange-300 border-orange-700/50",
  "Military / Defense": "bg-sky-800/40 text-sky-300 border-sky-700/50",
  "Border & Immigration": "bg-amber-800/40 text-amber-300 border-amber-700/50",
  "Religious & Cultural": "bg-violet-800/40 text-violet-300 border-violet-700/50",
  "Social Issues": "bg-pink-800/40 text-pink-300 border-pink-700/50",
  "Healthcare": "bg-emerald-800/40 text-emerald-300 border-emerald-700/50",
  "Culture": "bg-cyan-800/40 text-cyan-300 border-cyan-700/50",
  "General": "bg-zinc-700/40 text-zinc-300 border-zinc-600/50",
  "Values": "bg-violet-800/40 text-violet-300 border-violet-700/50",
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
  "Healthcare": "border-emerald-500/60",
  "Culture": "border-cyan-500/60",
  "General": "border-zinc-500/60",
  "Values": "border-violet-500/60",
  "Other": "border-zinc-600",
  "Uncategorized": "border-zinc-600",
};

function getCategoryColor(name: string): string {
  return categoryColors[name] || categoryColors["Other"];
}

function getCategoryBorder(name: string): string {
  return categoryBorderColors[name] || categoryBorderColors["Other"];
}

interface CategoryInfo {
  name: string;
  topics: { topic: string; sectionId: string }[];
  sectionIds: Set<string>;
}

export function TranscriptResultsView({ transcript, analysisId, eventTitle, isSelfAnalysis, onBack, onDelete, onReopen }: TranscriptResultsViewProps) {
  const [sections, setSections] = useState<DbTranscriptSection[]>([]);
  const [segments, setSegments] = useState<DbTranscriptSegment[]>([]);
  const [results, setResults] = useState<SectionWordResult[]>([]);
  const [wordsFound, setWordsFound] = useState(0);
  const [totalMentions, setTotalMentions] = useState(0);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [pinnedCategories, setPinnedCategories] = useState<Set<string>>(new Set());
  const [pinnedWords, setPinnedWords] = useState<Set<string>>(new Set());
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"structure" | "words" | "transcript">("structure");
  const [sectionSort, setSectionSort] = useState<"speech" | "category">("speech");
  const [loading, setLoading] = useState(true);

  // Mention history (Kalshi rates + per-event detail for expandable rows)
  const [mentionData, setMentionData] = useState<Record<string, { rate: number; yes: number; total: number; events: MentionEventDetail[] }>>({});
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  useEffect(() => { setEventSearch(""); }, [expandedWord]);
  // Event words (strikes for the linked event)
  const [eventWords, setEventWords] = useState<{ word: string }[]>([]);

  // Word analysis sort
  const [wordSortKey, setWordSortKey] = useState<"word" | "count" | "sections" | "kalshiRate">("count");
  const [wordSortAsc, setWordSortAsc] = useState(false);
  const [wordSearch, setWordSearch] = useState("");
  const [wordCategoryFilter, setWordCategoryFilter] = useState<Set<string>>(new Set());

  function toggleWordCategoryFilter(name: string) {
    setWordCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const hasPins = pinnedCategories.size > 0 || pinnedWords.size > 0;

  function togglePinCategory(name: string) {
    setPinnedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function togglePinWord(word: string) {
    setPinnedWords((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word); else next.add(word);
      return next;
    });
  }

  function clearAllPins() {
    setPinnedCategories(new Set());
    setPinnedWords(new Set());
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [secRes, analysisRes, mentionRes] = await Promise.all([
        fetch(`/api/transcripts/${transcript.id}/sections`),
        analysisId
          ? fetch(`/api/transcripts/analyses/${analysisId}`)
          : Promise.resolve(null),
        transcript.speaker_id
          ? fetch(`/api/corpus/mention-history?speakerId=${transcript.speaker_id}`)
          : Promise.resolve(null),
      ]);
      const secData = await secRes.json();
      setSections(secData.sections ?? []);
      setSegments(secData.segments ?? []);

      if (analysisRes) {
        const aData = await analysisRes.json();
        // Build per-section details from analysis-scoped section_word_detections
        const sectionMap = new Map<string, { word: string; count: number }[]>();
        for (const d of aData.sectionDetections ?? []) {
          const list = sectionMap.get(d.section_id) ?? [];
          list.push({ word: d.word, count: d.mention_count });
          sectionMap.set(d.section_id, list);
        }
        const details = (secData.sections ?? []).map((sec: { id: string; title: string }) => ({
          sectionId: sec.id,
          title: sec.title,
          words: sectionMap.get(sec.id) ?? [],
        }));
        setResults(details);
        const trDet = aData.transcriptDetections ?? [];
        setWordsFound(trDet.length);
        setTotalMentions(trDet.reduce((s: number, d: { total_count: number }) => s + (d.total_count ?? 0), 0));
        setEventWords((aData.eventWords ?? []).map((w: { word: string }) => ({ word: w.word })));
      } else {
        setResults([]);
        setWordsFound(0);
        setTotalMentions(0);
        setEventWords([]);
      }

      if (mentionRes) {
        const mentionJson = await mentionRes.json();
        const lookup: Record<string, { rate: number; yes: number; total: number; events: MentionEventDetail[] }> = {};
        for (const row of mentionJson.rows ?? []) {
          lookup[row.word.toLowerCase()] = {
            rate: row.mentionRate,
            yes: row.yesCount,
            total: row.totalEvents,
            events: row.events ?? [],
          };
        }
        setMentionData(lookup);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [transcript.id, transcript.speaker_id, analysisId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build word totals
  const wordTotals: { word: string; total: number; sectionIds: Set<string> }[] = [];
  const wordMap = new Map<string, { total: number; sectionIds: Set<string> }>();
  for (const sec of results) {
    for (const w of sec.words) {
      const existing = wordMap.get(w.word) || { total: 0, sectionIds: new Set<string>() };
      existing.total += w.count;
      existing.sectionIds.add(sec.sectionId);
      wordMap.set(w.word, existing);
    }
  }
  for (const [word, data] of wordMap) {
    wordTotals.push({ word, total: data.total, sectionIds: data.sectionIds });
  }
  wordTotals.sort((a, b) => b.total - a.total);

  // Build categories
  const categories: CategoryInfo[] = [];
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

  // Compute word counts per category (speaker content only)
  const categoryWordCounts = new Map<string, number>();
  let totalSpeakerWords = 0;
  for (const sec of sections) {
    const catName = sec.category_name || "Uncategorized";
    const secSegments = segments.filter((s) => s.section_id === sec.id && s.is_speaker_content);
    const wc = secSegments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
    categoryWordCounts.set(catName, (categoryWordCounts.get(catName) || 0) + wc);
    totalSpeakerWords += wc;
  }

  // Collect all section IDs that match pinned filters
  function getPinnedSectionIds(): Set<string> {
    const ids = new Set<string>();
    for (const catName of pinnedCategories) {
      const cat = categories.find((c) => c.name === catName);
      if (cat) for (const sid of cat.sectionIds) ids.add(sid);
    }
    for (const word of pinnedWords) {
      const wi = wordTotals.find((w) => w.word === word);
      if (wi) for (const sid of wi.sectionIds) ids.add(sid);
    }
    return ids;
  }

  function isSectionHighlighted(sectionId: string): boolean {
    const hasHover = hoveredWord || hoveredCategory;

    // If hovering, show hover result (on top of pins)
    if (hoveredWord) {
      return wordTotals.find((w) => w.word === hoveredWord)?.sectionIds.has(sectionId) ?? false;
    }
    if (hoveredCategory) {
      const cat = categories.find((c) => c.name === hoveredCategory);
      return cat?.sectionIds.has(sectionId) ?? false;
    }

    // If pins active, use pinned filter
    if (hasPins) {
      return getPinnedSectionIds().has(sectionId);
    }

    return true;
  }

  function isStrikeHighlighted(word: string): boolean {
    // Hover category takes priority
    if (hoveredCategory) {
      const cat = categories.find((c) => c.name === hoveredCategory);
      if (!cat) return false;
      const wordInfo = wordTotals.find((w) => w.word === word);
      if (!wordInfo) return false;
      for (const sid of cat.sectionIds) {
        if (wordInfo.sectionIds.has(sid)) return true;
      }
      return false;
    }

    // Pinned categories filter strikes
    if (pinnedCategories.size > 0 && pinnedWords.size === 0 && !hoveredWord) {
      const wordInfo = wordTotals.find((w) => w.word === word);
      if (!wordInfo) return false;
      const pinnedSections = getPinnedSectionIds();
      for (const sid of wordInfo.sectionIds) {
        if (pinnedSections.has(sid)) return true;
      }
      return false;
    }

    // Pinned word
    if (pinnedWords.size > 0) {
      return pinnedWords.has(word);
    }

    return true;
  }

  function isCategoryHighlighted(catName: string): boolean {
    if (hoveredCategory) return hoveredCategory === catName;
    if (hasPins && !hoveredWord) {
      if (pinnedCategories.size > 0) return pinnedCategories.has(catName);
      // If only words are pinned, highlight categories that contain those words
      if (pinnedWords.size > 0) {
        const cat = categories.find((c) => c.name === catName);
        if (!cat) return false;
        for (const word of pinnedWords) {
          const wi = wordTotals.find((w) => w.word === word);
          if (wi) {
            for (const sid of cat.sectionIds) {
              if (wi.sectionIds.has(sid)) return true;
            }
          }
        }
        return false;
      }
    }
    return true;
  }

  function getSectionType(sectionId: string): string {
    return sections.find((s) => s.id === sectionId)?.section_type ?? "other";
  }

  function getSectionSegments(sectionId: string) {
    return segments.filter((s) => s.section_id === sectionId).sort((a, b) => a.order_index - b.order_index);
  }

  function renderSectionCard(sec: SectionWordResult, i: number) {
    const sectionType = getSectionType(sec.sectionId);
    const sectionMeta = sections.find((s) => s.id === sec.sectionId);
    const categoryName = sectionMeta?.category_name || "Uncategorized";
    const catBorder = getCategoryBorder(categoryName);
    const isHighlighted = isSectionHighlighted(sec.sectionId);
    const isExpanded = expandedSection === sec.sectionId;
    const sectionSegs = getSectionSegments(sec.sectionId);

    return (
      <div
        key={sec.sectionId}
        className={`border-l-3 ${catBorder} rounded-r-lg transition-all ${
          isHighlighted ? "bg-zinc-900/40" : "bg-zinc-950/50 opacity-30"
        }`}
      >
        <div
          className="px-3 py-2 cursor-pointer"
          onClick={() => setExpandedSection(isExpanded ? null : sec.sectionId)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-300">{sec.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getCategoryColor(categoryName)}`}>
                  {categoryName}
                </span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-800/60 text-zinc-500">{sectionType}</span>
                <svg className={`w-3 h-3 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {sectionMeta?.description && (
                <p className="text-[10px] text-zinc-500 mt-0.5">{sectionMeta.description}</p>
              )}
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
                          hoveredWord === w.word ? "bg-indigo-600/40 text-white" : "bg-zinc-800/80 text-zinc-400"
                        }`}
                      >
                        {w.word}
                        {w.count > 1 && <span className="text-zinc-500 ml-0.5">×{w.count}</span>}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-zinc-600 flex-shrink-0">§{i + 1}</span>
          </div>
        </div>

        {isExpanded && sectionSegs.length > 0 && (
          <div className="border-t border-zinc-800/50 px-3 py-2 space-y-1.5 max-h-80 overflow-y-auto bg-zinc-950/30">
            {sectionSegs.map((seg) => (
              <div
                key={seg.id}
                className={`text-xs leading-relaxed ${
                  seg.is_speaker_content
                    ? "text-zinc-300"
                    : "text-zinc-500 italic border-l-2 border-orange-500/50 pl-2"
                }`}
              >
                {!seg.is_speaker_content && seg.attribution && (
                  <span className="text-[10px] text-orange-400 font-medium mr-1">[{seg.attribution}]</span>
                )}
                {seg.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-zinc-500">Loading transcript...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Back
          </button>
          <div>
            <h2 className="text-sm font-medium text-white">{transcript.title}</h2>
            {eventTitle && (
              <div className="flex items-start gap-2 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                  isSelfAnalysis
                    ? "bg-green-900/30 text-green-400"
                    : "bg-indigo-900/30 text-indigo-400"
                }`}>
                  {isSelfAnalysis ? "original" : "cross"}
                </span>
                <span className="text-[11px] text-zinc-400 leading-snug">{eventTitle}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-0.5">
              {transcript.event_date && (
                <span>{new Date(transcript.event_date).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</span>
              )}
              <span>{transcript.word_count?.toLocaleString()} words</span>
              {transcript.word_count && transcript.word_count > 0 && (
                <span>~{Math.round(transcript.word_count / 145)} min</span>
              )}
              <span>{sections.length} sections</span>
              <span>{wordsFound} YESs &amp; {eventWords.length > 0 ? eventWords.length - wordsFound : "?"} NOs</span>
              {transcript.source_url && (
                <a href={transcript.source_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Source</a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onReopen && (
            <button
              onClick={async () => {
                const msg = transcript.needs_review
                  ? "Re-open this transcript to re-classify sections? You'll return to the workflow."
                  : "Re-open this transcript for edits? You'll return to the workflow.";
                if (!confirm(msg)) return;
                await onReopen();
              }}
              className={
                transcript.needs_review
                  ? "text-xs px-2 py-1 text-amber-300 hover:text-amber-200 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 rounded transition-colors"
                  : "text-xs px-2 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              }
              title={transcript.needs_review ? transcript.review_reason ?? "Review needed" : "Re-open for edits"}
            >
              {transcript.needs_review ? "Review sections" : "Edit sections"}
            </button>
          )}
          <button
            onClick={async () => {
              if (!confirm("Delete this transcript and all its data?")) return;
              await onDelete();
            }}
            className="text-xs px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(["structure", "words", "transcript"] as const).map((tab) => {
          const labels = { structure: "Structure", words: "Word Analysis", transcript: "Full Transcript" };
          return (
            <button
              key={tab}
              onClick={() => setActiveView(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeView === tab ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {labels[tab]}
              {activeView === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Structure view */}
      {activeView === "structure" && <>

      {/* Categories */}
      {categories.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {categories.map((cat) => {
              const isPinned = pinnedCategories.has(cat.name);
              const highlighted = isCategoryHighlighted(cat.name);
              return (
                <button
                  key={cat.name}
                  onMouseEnter={() => { setHoveredCategory(cat.name); setHoveredWord(null); }}
                  onMouseLeave={() => setHoveredCategory(null)}
                  onClick={() => togglePinCategory(cat.name)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer ${getCategoryColor(cat.name)} ${
                    isPinned ? "ring-1 ring-white/40" : ""
                  } ${!highlighted ? "opacity-30" : ""}`}
                >
                  <span className="font-medium">{cat.name}</span>
                  <span className="ml-1 opacity-60">{cat.topics.length}</span>
                </button>
              );
            })}
            {hasPins && (
              <button
                onClick={clearAllPins}
                className="text-[10px] px-2 py-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          {/* Category distribution bar */}
          {totalSpeakerWords > 0 && (
            <div className="mt-2">
              <div className="flex rounded-md overflow-hidden h-5">
                {categories.map((cat) => {
                  const wc = categoryWordCounts.get(cat.name) || 0;
                  const pct = (wc / totalSpeakerWords) * 100;
                  if (pct < 1) return null;
                  const isPinned = pinnedCategories.has(cat.name);
                  const highlighted = isCategoryHighlighted(cat.name);
                  const bgClass = getCategoryColor(cat.name).split(" ")[0];
                  return (
                    <div
                      key={cat.name}
                      style={{ width: `${pct}%` }}
                      onMouseEnter={() => { setHoveredCategory(cat.name); setHoveredWord(null); }}
                      onMouseLeave={() => setHoveredCategory(null)}
                      onClick={() => togglePinCategory(cat.name)}
                      className={`${bgClass} flex items-center justify-center cursor-pointer transition-all border-r border-zinc-950/50 last:border-r-0 ${
                        !highlighted ? "opacity-20" : ""
                      } ${isPinned ? "ring-1 ring-inset ring-white/40" : ""}`}
                      title={`${cat.name}: ${Math.round(pct)}%`}
                    >
                      {pct >= 8 && (
                        <span className="text-[9px] font-medium text-white/80 truncate px-1">
                          {cat.name} {Math.round(pct)}%
                        </span>
                      )}
                      {pct >= 4 && pct < 8 && (
                        <span className="text-[9px] font-medium text-white/80 truncate px-0.5">
                          {Math.round(pct)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Labels below the bar for small segments */}
              <div className="flex mt-1">
                {categories.map((cat) => {
                  const wc = categoryWordCounts.get(cat.name) || 0;
                  const pct = (wc / totalSpeakerWords) * 100;
                  if (pct < 1) return null;
                  return (
                    <div
                      key={cat.name}
                      style={{ width: `${pct}%` }}
                      className="text-center"
                    >
                      {pct < 8 && (
                        <span className="text-[9px] text-zinc-500">
                          {Math.round(pct)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(hoveredCategory || (pinnedCategories.size > 0 && !hoveredWord)) && (
            <div className="flex flex-wrap gap-1 mt-2 ml-1">
              {(() => {
                const activeCat = hoveredCategory || (pinnedCategories.size === 1 ? [...pinnedCategories][0] : null);
                if (!activeCat) return null;
                return categories
                  .find((c) => c.name === activeCat)
                  ?.topics.map((t) => (
                    <span key={t.sectionId} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {t.topic}
                    </span>
                  ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Strikes */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Strikes</div>
        <div className="flex flex-wrap gap-1.5">
          {wordTotals.map(({ word, total }) => {
            const strikeActive = hoveredWord === word;
            const isPinned = pinnedWords.has(word);
            const strikeVisible = isStrikeHighlighted(word);
            return (
              <button
                key={word}
                onMouseEnter={() => { setHoveredWord(word); setHoveredCategory(null); }}
                onMouseLeave={() => setHoveredWord(null)}
                onClick={() => togglePinWord(word)}
                className={`text-xs px-2 py-1 rounded-md border transition-all cursor-pointer ${
                  strikeActive || isPinned
                    ? "bg-indigo-600/30 border-indigo-500 text-white"
                    : !strikeVisible
                      ? "bg-zinc-900/30 border-zinc-800 text-zinc-600 opacity-30"
                      : hoveredWord && !strikeActive
                        ? "bg-zinc-900/30 border-zinc-800 text-zinc-600"
                        : "bg-zinc-900/50 border-zinc-700 text-zinc-300"
                } ${isPinned ? "ring-1 ring-white/40" : ""}`}
              >
                {word}
                <span className={`ml-1 ${strikeActive || isPinned ? "text-indigo-300" : "text-zinc-500"}`}>{total}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section sort toggle */}
      <div className="flex gap-1">
        {(["speech", "category"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSectionSort(mode)}
            className={`text-xs px-3 py-1.5 rounded transition-colors ${
              sectionSort === mode
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {mode === "speech" ? "Speech Order" : "By Category"}
          </button>
        ))}
      </div>

      {/* Section cards — speech order */}
      {sectionSort === "speech" && (
        <div className="space-y-1.5">
          {results.map((sec, i) => renderSectionCard(sec, i))}
        </div>
      )}

      {/* Section cards — grouped by category */}
      {sectionSort === "category" && (
        <div className="space-y-4">
          {categories.map((cat) => {
            const catHighlighted = !hoveredCategory || hoveredCategory === cat.name;
            return (
              <div
                key={cat.name}
                className={`transition-all ${!catHighlighted && !hoveredWord ? "opacity-30" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${getCategoryColor(cat.name)}`}>
                    {cat.name}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {cat.topics.length} {cat.topics.length === 1 ? "section" : "sections"}
                  </span>
                </div>
                <div className="space-y-1 pl-1">
                  {cat.topics.map((topic) => {
                    const sec = results.find((r) => r.sectionId === topic.sectionId);
                    if (!sec) return null;
                    const idx = results.findIndex((r) => r.sectionId === topic.sectionId);
                    return renderSectionCard(sec, idx);
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>}

      {/* Word Analysis view */}
      {activeView === "words" && (() => {
        // Build word analysis rows
        interface WordAnalysisRow {
          word: string;
          count: number;
          mentioned: boolean;
          sectionCount: number;
          totalSections: number;
          sectionPct: number;
          remarksCount: number;
          qaCount: number;
          dominantCategory: string | null;
          kalshiRate: number | null;
          kalshiYes: number | null;
          kalshiTotal: number | null;
          events: MentionEventDetail[];
        }

        // Get all words (from detections + any event words that weren't detected)
        const detectedWords = new Map<string, { count: number; sectionIds: Set<string> }>();
        for (const sec of results) {
          for (const w of sec.words) {
            const existing = detectedWords.get(w.word) || { count: 0, sectionIds: new Set<string>() };
            existing.count += w.count;
            existing.sectionIds.add(sec.sectionId);
            detectedWords.set(w.word, existing);
          }
        }

        const totalSec = sections.length;
        const rows: WordAnalysisRow[] = [];

        // Build rows for all detected words
        for (const [word, data] of detectedWords) {
          // Count remarks vs qa sections
          let remarksCount = 0;
          let qaCount = 0;
          const catCounts = new Map<string, number>();

          for (const sid of data.sectionIds) {
            const sec = sections.find((s) => s.id === sid);
            if (sec) {
              if (sec.section_type === "qa") qaCount++;
              else remarksCount++;
              const cat = sec.category_name || "Uncategorized";
              catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
            }
          }

          // Dominant category
          let dominantCategory: string | null = null;
          let maxCatCount = 0;
          for (const [cat, count] of catCounts) {
            if (count > maxCatCount) { dominantCategory = cat; maxCatCount = count; }
          }

          const mentionKey = word.toLowerCase();
          const mention = mentionData[mentionKey];

          rows.push({
            word,
            count: data.count,
            mentioned: true,
            sectionCount: data.sectionIds.size,
            totalSections: totalSec,
            sectionPct: totalSec > 0 ? data.sectionIds.size / totalSec : 0,
            remarksCount,
            qaCount,
            dominantCategory,
            kalshiRate: mention?.rate ?? null,
            kalshiYes: mention?.yes ?? null,
            kalshiTotal: mention?.total ?? null,
            events: mention?.events ?? [],
          });
        }

        // Add unmentioned event words (strikes that were not detected in this transcript)
        if (eventWords.length > 0) {
          for (const ew of eventWords) {
            if (!detectedWords.has(ew.word) && !rows.find((r) => r.word.toLowerCase() === ew.word.toLowerCase())) {
              const mentionKey = ew.word.toLowerCase();
              const mention = mentionData[mentionKey];
              rows.push({
                word: ew.word,
                count: 0,
                mentioned: false,
                sectionCount: 0,
                totalSections: totalSec,
                sectionPct: 0,
                remarksCount: 0,
                qaCount: 0,
                dominantCategory: null,
                kalshiRate: mention?.rate ?? null,
                kalshiYes: mention?.yes ?? null,
                kalshiTotal: mention?.total ?? null,
                events: mention?.events ?? [],
              });
            }
          }
        }

        // Available categories in the current row set (for the filter chips)
        const availableCategories = (() => {
          const set = new Set<string>();
          let hasNone = false;
          for (const r of rows) {
            if (r.dominantCategory) set.add(r.dominantCategory);
            else hasNone = true;
          }
          const list = [...set].sort();
          if (hasNone) list.push("__none__");
          return list;
        })();

        // Filter (text + category)
        const NONE_KEY = "__none__";
        const filtered = rows.filter((r) => {
          if (wordSearch && !r.word.toLowerCase().includes(wordSearch.toLowerCase())) return false;
          if (wordCategoryFilter.size > 0) {
            const key = r.dominantCategory ?? NONE_KEY;
            if (!wordCategoryFilter.has(key)) return false;
          }
          return true;
        });

        // Sort
        filtered.sort((a, b) => {
          let cmp = 0;
          switch (wordSortKey) {
            case "word": cmp = a.word.localeCompare(b.word); break;
            case "count": cmp = a.count - b.count; break;
            case "sections": cmp = a.sectionPct - b.sectionPct; break;
            case "kalshiRate": cmp = (a.kalshiRate ?? -1) - (b.kalshiRate ?? -1); break;
          }
          return wordSortAsc ? cmp : -cmp;
        });

        function handleSort(key: typeof wordSortKey) {
          if (wordSortKey === key) setWordSortAsc(!wordSortAsc);
          else { setWordSortKey(key); setWordSortAsc(false); }
        }

        const sortArrow = (key: typeof wordSortKey) =>
          wordSortKey === key ? (wordSortAsc ? " ↑" : " ↓") : "";

        return (
          <div className="space-y-3">
            {/* Category filter chips */}
            {availableCategories.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide mr-1">Filter:</span>
                {availableCategories.map((cat) => {
                  const isActive = wordCategoryFilter.has(cat);
                  const label = cat === NONE_KEY ? "No category" : cat;
                  const activeClass = cat === NONE_KEY
                    ? "bg-zinc-700 text-zinc-200 border-zinc-500"
                    : `${getCategoryColor(cat)} border-transparent ring-1 ring-white/20`;
                  const inactiveClass = "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700";
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleWordCategoryFilter(cat)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${isActive ? activeClass : inactiveClass}`}
                    >
                      {label}
                    </button>
                  );
                })}
                {wordCategoryFilter.size > 0 && (
                  <button
                    onClick={() => setWordCategoryFilter(new Set())}
                    className="text-[10px] px-2 py-0.5 text-zinc-400 hover:text-zinc-200 transition-colors ml-1"
                  >
                    Clear ×
                  </button>
                )}
                <span className="ml-auto text-[10px] text-zinc-600">
                  {filtered.length} of {rows.length} words
                </span>
              </div>
            )}

            <input
              type="text"
              placeholder="Search words..."
              value={wordSearch}
              onChange={(e) => setWordSearch(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left py-2.5 px-3 text-zinc-400 font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort("word")}>
                      Word{sortArrow("word")}
                    </th>
                    <th className="text-center py-2.5 px-2 text-zinc-400 font-medium w-16">
                      Mentioned
                    </th>
                    <th className="text-center py-2.5 px-2 text-zinc-400 font-medium cursor-pointer hover:text-zinc-300 w-16" onClick={() => handleSort("count")}>
                      Count{sortArrow("count")}
                    </th>
                    <th className="text-center py-2.5 px-2 text-zinc-400 font-medium cursor-pointer hover:text-zinc-300 w-24" onClick={() => handleSort("sections")}>
                      Sections{sortArrow("sections")}
                    </th>
                    <th className="text-left py-2.5 px-2 text-zinc-400 font-medium w-32">
                      Dom. Category
                    </th>
                    <th className="text-center py-2.5 px-2 text-zinc-400 font-medium w-20">
                      R / Q
                    </th>
                    <th className="text-center py-2.5 px-2 text-zinc-400 font-medium cursor-pointer hover:text-zinc-300 w-24" onClick={() => handleSort("kalshiRate")}>
                      Kalshi Rate{sortArrow("kalshiRate")}
                    </th>
                    <th className="text-center py-2.5 px-2 text-zinc-400 font-medium w-16">
                      Sample
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isExpanded = expandedWord === row.word;
                    const hasEvents = row.events.length > 0;
                    return (
                    <Fragment key={row.word}>
                    <tr
                      onClick={() => hasEvents && setExpandedWord(isExpanded ? null : row.word)}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-900/30 ${hasEvents ? "cursor-pointer" : ""}`}
                    >
                      <td className="py-2 px-3 text-zinc-300 font-medium">
                        {row.word}
                        {hasEvents && (
                          <span className="text-zinc-600 text-[10px] ml-2">{isExpanded ? "▲" : "▼"}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {row.mentioned ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-400">YES</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400">NO</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center text-zinc-300">{row.count || "—"}</td>
                      <td className="py-2 px-2 text-center">
                        {row.sectionCount > 0 ? (
                          <span className="text-zinc-300">
                            {row.sectionCount}/{row.totalSections}
                            <span className="text-zinc-500 ml-1">({Math.round(row.sectionPct * 100)}%)</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {row.dominantCategory ? (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getCategoryColor(row.dominantCategory)}`}>
                            {row.dominantCategory}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {row.sectionCount > 0 ? (
                          <span className="text-zinc-400">
                            {row.remarksCount}r / {row.qaCount}q
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {row.kalshiRate !== null ? (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            row.kalshiRate >= 0.6 ? "bg-green-900/30 text-green-400" :
                            row.kalshiRate >= 0.3 ? "bg-yellow-900/30 text-yellow-400" :
                            row.kalshiRate > 0 ? "bg-red-900/30 text-red-400" :
                            "bg-zinc-800 text-zinc-500"
                          }`}>
                            {Math.round(row.kalshiRate * 100)}%
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center text-zinc-500">
                        {row.kalshiTotal !== null ? `${row.kalshiYes}/${row.kalshiTotal}` : "—"}
                      </td>
                    </tr>
                    {isExpanded && hasEvents && (() => {
                      const filteredEvents = row.events.filter((evt) =>
                        !eventSearch || (evt.eventTitle ?? "").toLowerCase().includes(eventSearch.toLowerCase())
                      );
                      return (
                      <tr>
                        <td colSpan={8} className="bg-zinc-900/60 px-3 py-3">
                          <div className="flex items-center justify-between mb-2 gap-3">
                            <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                              Event-by-Event Results
                            </h4>
                            <input
                              type="text"
                              value={eventSearch}
                              onChange={(e) => setEventSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Search events..."
                              className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-56"
                            />
                            <span className="text-[10px] text-zinc-600 flex-shrink-0">
                              {filteredEvents.length} of {row.events.length}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {filteredEvents.map((evt) => (
                              <div
                                key={evt.eventId + evt.eventTicker}
                                className="flex items-center justify-between text-xs border border-zinc-800/50 rounded px-3 py-2 bg-zinc-900/40"
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-zinc-300">{evt.eventTitle}</span>
                                  <span className="text-zinc-600 ml-2">{evt.eventTicker}</span>
                                </div>
                                <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                                  {evt.eventDate && (
                                    <span className="text-zinc-500">
                                      {new Date(evt.eventDate).toLocaleDateString()}
                                    </span>
                                  )}
                                  <span className={`font-semibold ${evt.wasMentioned ? "text-green-400" : "text-red-400"}`}>
                                    {evt.wasMentioned ? "MENTIONED" : "NOT MENTIONED"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                      );
                    })()}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">No words found</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Transcript view — plain reading */}
      {activeView === "transcript" && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
            {segments
              .sort((a, b) => a.order_index - b.order_index)
              .map((seg) => (
                <div
                  key={seg.id}
                  className={`flex gap-2 ${
                    seg.is_speaker_content ? "" : "border-l-2 border-orange-500/50 pl-2"
                  }`}
                >
                  <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded text-[10px] font-medium flex items-center justify-center ${
                    seg.is_speaker_content
                      ? "bg-green-900/30 text-green-400"
                      : "bg-orange-900/30 text-orange-400"
                  }`}>
                    {seg.is_speaker_content ? "S" : "X"}
                  </span>
                  <div className={`text-xs leading-relaxed ${
                    seg.is_speaker_content ? "text-zinc-300" : "text-zinc-500 italic"
                  }`}>
                    {!seg.is_speaker_content && seg.attribution && (
                      <span className="text-[10px] text-orange-400 font-medium mr-1">[{seg.attribution}]</span>
                    )}
                    {seg.text}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
