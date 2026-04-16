"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DbTranscriptSegment, DbTranscriptSection } from "@/types/database";

interface SectioningStepProps {
  transcriptId: string;
  speakerId: string;
  sectioningStatus: string;
  sections: DbTranscriptSection[];
  segments: DbTranscriptSegment[];
  onSectionsChange: (sections: DbTranscriptSection[]) => void;
  onSegmentsChange: (segments: DbTranscriptSegment[]) => void;
  onStatusChange: () => Promise<void>;
}

const SECTION_TYPES = ["introduction", "remarks", "qa", "closing", "other"] as const;

const typeColors: Record<string, string> = {
  introduction: "bg-blue-900/30 text-blue-400",
  remarks: "bg-indigo-900/30 text-indigo-400",
  qa: "bg-yellow-900/30 text-yellow-400",
  closing: "bg-purple-900/30 text-purple-400",
  other: "bg-zinc-800 text-zinc-400",
};

export function SectioningStep({
  transcriptId,
  speakerId: _speakerId, // categories are global — prop kept for caller compat
  sectioningStatus,
  sections,
  segments,
  onSectionsChange,
  onSegmentsChange,
  onStatusChange,
}: SectioningStepProps) {
  void _speakerId;
  const [sectioning, setSectioning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const [approvedCats, setApprovedCats] = useState<Set<string>>(new Set());
  const [rejectedCats, setRejectedCats] = useState<Set<string>>(new Set());
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editCatValue, setEditCatValue] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState<string | null>(null);
  const [approvedSpeakerCats, setApprovedSpeakerCats] = useState<string[]>([]);
  const [creatingCatForSection, setCreatingCatForSection] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");

  // Load pending categories (global)
  const fetchPendingCategories = useCallback(async () => {
    try {
      const res = await fetch(`/api/corpus/speakers/categories?status=pending`);
      const data = await res.json();
      setPendingCategories((data.categories ?? []).map((c: { name: string }) => c.name));
    } catch {
      setPendingCategories([]);
    }
  }, []);

  // Load approved categories (global — full library)
  const fetchApprovedCategories = useCallback(async () => {
    try {
      const res = await fetch(`/api/corpus/speakers/categories?status=approved`);
      const data = await res.json();
      setApprovedSpeakerCats((data.categories ?? []).map((c: { name: string }) => c.name));
    } catch {
      setApprovedSpeakerCats([]);
    }
  }, []);

  useEffect(() => { fetchPendingCategories(); fetchApprovedCategories(); }, [fetchPendingCategories, fetchApprovedCategories]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sectioning) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sectioning]);

  // Start AI sectioning
  async function handleSection() {
    setSectioning(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/sections`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSectionsChange(data.sections ?? []);
      onSegmentsChange(data.segments ?? []);
      setApprovedCats(new Set());
      setRejectedCats(new Set());
      await fetchPendingCategories();
      await onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sectioning failed");
    } finally {
      setSectioning(false);
    }
  }

  // Update section type
  async function handleTypeChange(sectionId: string, newType: string) {
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, section_type: newType as DbTranscriptSection["section_type"] } : s
    );
    onSectionsChange(updated);

    try {
      await fetch(`/api/transcripts/${transcriptId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust",
          sections: [{ id: sectionId, section_type: newType }],
        }),
      });
    } catch {
      // Revert on error
    }
  }

  // Save title edit
  async function handleSaveTitle(sectionId: string) {
    if (!editTitleValue.trim()) return;
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, title: editTitleValue.trim() } : s
    );
    onSectionsChange(updated);
    setEditingTitle(null);

    try {
      await fetch(`/api/transcripts/${transcriptId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust",
          sections: [{ id: sectionId, title: editTitleValue.trim() }],
        }),
      });
    } catch {
      // Revert on error
    }
  }

  // Approve sections
  async function handleApprove() {
    // Check if there are unresolved pending categories
    const unresolvedCats = pendingCategories.filter(
      (c) => !approvedCats.has(c) && !rejectedCats.has(c)
    );
    if (unresolvedCats.length > 0) {
      alert(`Please approve or reject all new categories before approving sections: ${unresolvedCats.join(", ")}`);
      return;
    }

    setApproving(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          approvedCategories: [...approvedCats],
          rejectedCategories: [...rejectedCats],
        }),
      });
      if (!res.ok) throw new Error("Approve failed");
      await onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  }

  // Rename a category everywhere — sections, pending list, DB
  async function handleRenameCategory(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) {
      setEditingCatName(null);
      return;
    }
    const trimmed = newName.trim();

    // Update all sections locally
    const updated = sections.map((s) =>
      s.category_name === oldName ? { ...s, category_name: trimmed } : s
    );
    onSectionsChange(updated);

    // Update pending categories list locally
    setPendingCategories((prev) => prev.map((c) => c === oldName ? trimmed : c));

    // Update approved/rejected sets
    if (approvedCats.has(oldName)) {
      const next = new Set(approvedCats);
      next.delete(oldName);
      next.add(trimmed);
      setApprovedCats(next);
    }
    if (rejectedCats.has(oldName)) {
      const next = new Set(rejectedCats);
      next.delete(oldName);
      next.add(trimmed);
      setRejectedCats(next);
    }

    setEditingCatName(null);

    // Update sections in DB
    const sectionsWithOldCat = sections.filter((s) => s.category_name === oldName);
    for (const sec of sectionsWithOldCat) {
      await fetch(`/api/transcripts/${transcriptId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust", sections: [{ id: sec.id, category_name: trimmed }] }),
      });
    }

    // Update canonical category row in DB (global rename)
    await fetch(`/api/corpus/speakers/categories/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName: trimmed }),
    });
  }

  // All unique category names: from sections + approved speaker categories + pending
  const allCategoryNames = [...new Set([
    ...sections
      .map((s) => s.category_name)
      .filter((c): c is string => c !== null && c !== undefined),
    ...approvedSpeakerCats,
    ...pendingCategories,
  ])].sort();

  // Create a new custom category, assign to section, add to pending
  async function handleCreateCategory(sectionId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Check if it already exists
    if (allCategoryNames.includes(trimmed)) {
      // Just assign it to the section
      const updated = sections.map((s) =>
        s.id === sectionId ? { ...s, category_name: trimmed, category_id: null } : s
      );
      onSectionsChange(updated);
      fetch(`/api/transcripts/${transcriptId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust", sections: [{ id: sectionId, category_name: trimmed, category_id: null }] }),
      });
      setCatDropdownOpen(null);
      setCreatingCatForSection(null);
      setNewCatName("");
      return;
    }

    // Create as pending in global categories
    try {
      const res = await fetch(`/api/corpus/speakers/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, status: "pending" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create category");
        return;
      }
    } catch {
      alert("Failed to create category");
      return;
    }

    // Add to pending categories list
    setPendingCategories((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed]);

    // Assign to the section
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, category_name: trimmed, category_id: null } : s
    );
    onSectionsChange(updated);
    fetch(`/api/transcripts/${transcriptId}/sections`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust", sections: [{ id: sectionId, category_name: trimmed, category_id: null }] }),
    });

    setCatDropdownOpen(null);
    setCreatingCatForSection(null);
    setNewCatName("");
  }

  // Get segments for a section
  function getSectionSegments(sectionId: string) {
    return segments
      .filter((s) => s.section_id === sectionId)
      .sort((a, b) => a.order_index - b.order_index);
  }

  // Count words in speaker segments for a section
  function getSectionWordCount(sectionId: string) {
    return getSectionSegments(sectionId)
      .filter((s) => s.is_speaker_content)
      .reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  }

  // No sections yet — show generate button
  if (sectioningStatus === "pending" || sections.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-300">Step 2: Section Transcript</span>
          <button
            onClick={handleSection}
            disabled={sectioning}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
          >
            {sectioning ? `Sectioning... ${elapsed}s` : "Start AI Sectioning"}
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-zinc-500">
            The AI will group the cleaned transcript into logical topic sections. You&apos;ll be able to edit section titles, types, and boundaries before approving.
          </p>
        </div>
      </div>
    );
  }

  // Show sections
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Step 2: Section Transcript</span>
            <span className="text-[10px] text-zinc-500">{sections.length} sections</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSection}
              disabled={sectioning}
              className="text-xs px-2 py-1 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
            >
              {sectioning ? `Re-sectioning... ${elapsed}s` : "Re-section"}
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
            >
              {approving ? "Approving..." : "Approve Sections"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-[700px] overflow-y-auto">
        {/* New categories approval */}
        {pendingCategories.length > 0 && (
          <div className="border border-amber-800/30 bg-amber-900/10 rounded-lg p-3 mb-2">
            <p className="text-xs text-amber-400 font-medium mb-2">
              New categories proposed — approve or reject each:
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingCategories.map((cat) => {
                const isApproved = approvedCats.has(cat);
                const isRejected = rejectedCats.has(cat);
                return (
                  <div key={cat} className="flex items-center gap-1">
                    {editingCatName === cat ? (
                      <input
                        type="text"
                        value={editCatValue}
                        onChange={(e) => setEditCatValue(e.target.value)}
                        onBlur={() => handleRenameCategory(cat, editCatValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCategory(cat, editCatValue);
                          if (e.key === "Escape") setEditingCatName(null);
                        }}
                        className="text-xs px-2 py-1 rounded bg-zinc-800 border border-amber-600 text-white focus:outline-none w-40"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`text-xs px-2 py-1 rounded cursor-text ${
                          isApproved ? "bg-green-900/30 text-green-400" :
                          isRejected ? "bg-red-900/30 text-red-400 line-through" :
                          "bg-amber-900/30 text-amber-300"
                        }`}
                        onDoubleClick={() => { setEditingCatName(cat); setEditCatValue(cat); }}
                        title="Double-click to rename"
                      >
                        {cat}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const next = new Set(approvedCats);
                        if (isApproved) { next.delete(cat); } else { next.add(cat); rejectedCats.delete(cat); setRejectedCats(new Set(rejectedCats)); }
                        setApprovedCats(next);
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                        isApproved ? "bg-green-700 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-green-900/30 hover:text-green-400"
                      }`}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => {
                        const next = new Set(rejectedCats);
                        if (isRejected) { next.delete(cat); } else { next.add(cat); approvedCats.delete(cat); setApprovedCats(new Set(approvedCats)); }
                        setRejectedCats(next);
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                        isRejected ? "bg-red-700 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-red-900/30 hover:text-red-400"
                      }`}
                    >
                      ✗
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sections
          .sort((a, b) => a.order_index - b.order_index)
          .map((section, i) => {
            const sectionSegs = getSectionSegments(section.id);
            const wordCount = getSectionWordCount(section.id);
            const isExpanded = expandedSection === section.id;

            return (
              <div
                key={section.id}
                className="border border-zinc-800 rounded-lg relative"
              >
                {/* Section header */}
                <div
                  className="px-3 py-2.5 bg-zinc-900/50 cursor-pointer flex items-center gap-2"
                  onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                >
                  <span className="text-xs text-zinc-600 w-5">#{i + 1}</span>

                  <span className="flex-1 text-xs font-medium text-zinc-300">
                    {section.title}
                  </span>

                  <div className="inline-flex items-center gap-1 flex-shrink-0 relative">
                    {editingCatName === `section-${section.id}` ? (
                      <input
                        type="text"
                        value={editCatValue}
                        onChange={(e) => setEditCatValue(e.target.value)}
                        onBlur={() => {
                          if (editCatValue.trim() && editCatValue.trim() !== section.category_name) {
                            handleRenameCategory(section.category_name!, editCatValue.trim());
                          }
                          setEditingCatName(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editCatValue.trim() && editCatValue.trim() !== section.category_name) {
                              handleRenameCategory(section.category_name!, editCatValue.trim());
                            }
                            setEditingCatName(null);
                          }
                          if (e.key === "Escape") setEditingCatName(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-indigo-500 text-white focus:outline-none w-36"
                        autoFocus
                      />
                    ) : (
                      <>
                        {/* Category button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCatDropdownOpen(catDropdownOpen === section.id ? null : section.id);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50 transition-colors flex items-center gap-1"
                        >
                          {section.category_name || "Uncategorized"}
                          <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {/* Rename button */}
                        {section.category_name && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCatName(`section-${section.id}`);
                              setEditCatValue(section.category_name!);
                              setCatDropdownOpen(null);
                            }}
                            className="text-[10px] text-zinc-500 hover:text-indigo-400 transition-colors"
                            title="Rename this category"
                          >
                            ✎
                          </button>
                        )}
                        {/* Remove button */}
                        {section.category_name && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const updated = sections.map((s) =>
                                s.id === section.id ? { ...s, category_name: null, category_id: null } : s
                              );
                              onSectionsChange(updated);
                              fetch(`/api/transcripts/${transcriptId}/sections`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "adjust", sections: [{ id: section.id, category_name: null, category_id: null }] }),
                              });
                              setCatDropdownOpen(null);
                            }}
                            className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                            title="Remove category"
                          >
                            ×
                          </button>
                        )}
                        {/* Dropdown */}
                        {catDropdownOpen === section.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setCatDropdownOpen(null); setCreatingCatForSection(null); setNewCatName(""); }} />
                            <div className="absolute z-40 top-6 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] max-h-64 overflow-y-auto">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = sections.map((s) =>
                                    s.id === section.id ? { ...s, category_name: null, category_id: null } : s
                                  );
                                  onSectionsChange(updated);
                                  fetch(`/api/transcripts/${transcriptId}/sections`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "adjust", sections: [{ id: section.id, category_name: null, category_id: null }] }),
                                  });
                                  setCatDropdownOpen(null);
                                }}
                                className="w-full px-3 py-1.5 text-left text-[10px] text-zinc-500 hover:bg-zinc-800"
                              >
                                Uncategorized
                              </button>
                              {allCategoryNames.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = sections.map((s) =>
                                      s.id === section.id ? { ...s, category_name: cat, category_id: null } : s
                                    );
                                    onSectionsChange(updated);
                                    fetch(`/api/transcripts/${transcriptId}/sections`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "adjust", sections: [{ id: section.id, category_name: cat, category_id: null }] }),
                                    });
                                    setCatDropdownOpen(null);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-[10px] hover:bg-zinc-800 ${
                                    section.category_name === cat ? "text-indigo-400" : "text-zinc-300"
                                  }`}
                                >
                                  {cat}
                                </button>
                              ))}
                              {/* Create new category */}
                              <div className="border-t border-zinc-700 mt-1 pt-1">
                                {creatingCatForSection === section.id ? (
                                  <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={newCatName}
                                      onChange={(e) => setNewCatName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleCreateCategory(section.id, newCatName);
                                        if (e.key === "Escape") { setCreatingCatForSection(null); setNewCatName(""); }
                                      }}
                                      placeholder="Category name..."
                                      className="w-full text-[10px] px-2 py-1 rounded bg-zinc-800 border border-indigo-500 text-white focus:outline-none"
                                      autoFocus
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCreatingCatForSection(section.id);
                                      setNewCatName("");
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-[10px] text-indigo-400 hover:bg-zinc-800"
                                  >
                                    + Create new...
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <select
                    value={section.section_type}
                    onChange={(e) => { e.stopPropagation(); handleTypeChange(section.id, e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-[10px] px-1.5 py-0.5 rounded border-0 ${typeColors[section.section_type] || typeColors.other}`}
                  >
                    {SECTION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <span className="text-[10px] text-zinc-600">{wordCount}w</span>
                  <span className="text-[10px] text-zinc-600">{sectionSegs.length} seg</span>

                  <svg
                    className={`w-3 h-3 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Section description */}
                {section.description && (
                  <div className="px-3 py-1.5 border-t border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500">{section.description}</p>
                  </div>
                )}

                {/* Expanded: show segments */}
                {isExpanded && (
                  <div className="border-t border-zinc-800/50 px-3 py-2 space-y-1 max-h-64 overflow-y-auto bg-zinc-950/30">
                    {sectionSegs.length === 0 ? (
                      <p className="text-[10px] text-zinc-600 italic">No segments assigned</p>
                    ) : (
                      sectionSegs.map((seg) => (
                        <div
                          key={seg.id}
                          className={`text-xs leading-relaxed ${
                            seg.is_speaker_content
                              ? "text-zinc-300"
                              : "text-zinc-500 italic border-l-2 border-orange-500/50 pl-2"
                          }`}
                        >
                          {!seg.is_speaker_content && seg.attribution && (
                            <span className="text-[10px] text-orange-400 font-medium mr-1">
                              [{seg.attribution}]
                            </span>
                          )}
                          {seg.text}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
