"use client";

import { useEffect, useState, useCallback } from "react";
import { SpeakerSelector } from "@/components/corpus/SpeakerSelector";
import { CorpusTabNav, type CorpusTab } from "@/components/corpus/CorpusTabNav";
import { MentionSummaryStats } from "@/components/corpus/MentionSummaryStats";
import { MentionHistoryTable } from "@/components/corpus/MentionHistoryTable";
import { KalshiMarketsTab } from "@/components/corpus/KalshiMarketsTab";
import { QuickAnalysisTab } from "@/components/corpus/QuickAnalysisTab";
import { TranscriptsTab } from "@/components/corpus/TranscriptsTab";
import type { MentionHistoryRow, SeriesWithStats } from "@/types/corpus";

interface Speaker {
  id: string;
  name: string;
}

export default function CorpusPage() {
  // Speaker state
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [activeTab, setActiveTab] = useState<CorpusTab>("mentions");

  // Mention history state
  const [mentionData, setMentionData] = useState<MentionHistoryRow[]>([]);
  const [mentionLoading, setMentionLoading] = useState(true);
  const [totalSettledEvents, setTotalSettledEvents] = useState(0);

  // Category filter state
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  // Series state (for Kalshi Markets tab)
  const [series, setSeries] = useState<SeriesWithStats[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);

  // Transcript count (for tab badge)
  const [transcriptCount, setTranscriptCount] = useState(0);

  // Derived
  const selectedSpeaker = speakers.find((s) => s.id === selectedSpeakerId);

  // Fetch speakers on mount
  const fetchSpeakers = useCallback(async () => {
    try {
      const res = await fetch("/api/corpus/speakers");
      const data = await res.json();
      setSpeakers(data.speakers ?? []);
    } catch {
      setSpeakers([]);
    }
  }, []);

  useEffect(() => {
    fetchSpeakers();
  }, [fetchSpeakers]);

  // Fetch categories when speaker changes
  const fetchCategories = useCallback(async () => {
    if (!selectedSpeakerId) {
      setCategories([]);
      setSelectedCategory("");
      return;
    }
    try {
      const res = await fetch(`/api/corpus/categories?speakerId=${selectedSpeakerId}`);
      const data = await res.json();
      // Support both old format (string[]) and new format ({ name, count }[])
      const cats = (data.categories ?? []).map((c: string | { name: string; count: number }) =>
        typeof c === "string" ? { name: c, count: 0 } : c
      );
      setCategories(cats);
    } catch {
      setCategories([]);
    }
  }, [selectedSpeakerId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Fetch mention history when speaker or category changes
  const fetchMentionHistory = useCallback(async () => {
    setMentionLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSpeakerId) params.set("speakerId", selectedSpeakerId);
      if (selectedCategory) params.set("category", selectedCategory);
      const res = await fetch(`/api/corpus/mention-history?${params}`);
      const data = await res.json();
      setMentionData(data.rows ?? []);
      setTotalSettledEvents(data.totalSettledEvents ?? 0);
    } catch {
      setMentionData([]);
    } finally {
      setMentionLoading(false);
    }
  }, [selectedSpeakerId, selectedCategory]);

  useEffect(() => {
    fetchMentionHistory();
  }, [fetchMentionHistory]);

  // Fetch series for selected speaker
  const fetchSeries = useCallback(async () => {
    if (!selectedSpeakerId) {
      setSeries([]);
      return;
    }
    setSeriesLoading(true);
    try {
      const res = await fetch(`/api/corpus/series?speakerId=${selectedSpeakerId}`);
      const data = await res.json();
      setSeries(data.series ?? []);
    } catch {
      setSeries([]);
    } finally {
      setSeriesLoading(false);
    }
  }, [selectedSpeakerId]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Fetch transcript count when speaker changes
  const fetchTranscriptCount = useCallback(async () => {
    if (!selectedSpeakerId) { setTranscriptCount(0); return; }
    try {
      const res = await fetch(`/api/transcripts?speakerId=${selectedSpeakerId}&limit=1`);
      const data = await res.json();
      setTranscriptCount(data.total ?? 0);
    } catch {
      setTranscriptCount(0);
    }
  }, [selectedSpeakerId]);

  useEffect(() => {
    fetchTranscriptCount();
  }, [fetchTranscriptCount]);

  // Handlers
  async function handleAddSpeaker(name: string) {
    const res = await fetch("/api/corpus/speakers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchSpeakers();
    setSelectedSpeakerId(data.speaker.id);
  }

  async function handleAddSeries(seriesTicker: string, displayName: string) {
    const res = await fetch("/api/corpus/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speakerId: selectedSpeakerId,
        seriesTicker,
        displayName: displayName || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchSeries();
  }

  async function handleDeleteSeries(seriesId: string) {
    const res = await fetch(`/api/corpus/series?id=${seriesId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchSeries();
    await fetchMentionHistory();
  }

  async function handleRemoveEvent(eventId: string, seriesId: string) {
    const res = await fetch(
      `/api/corpus/series/events?eventId=${eventId}&seriesId=${seriesId}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchSeries();
    await fetchMentionHistory();
  }

  async function handleImportSeries(seriesId: string) {
    const res = await fetch("/api/corpus/import-historical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchSeries();
    await fetchMentionHistory();
    return {
      eventsImported: data.eventsImported ?? 0,
      wordsImported: data.wordsImported ?? 0,
      resultsImported: data.resultsImported ?? 0,
      errors: data.errors ?? [],
    };
  }

  // Computed values
  const avgMentionRate =
    mentionData.length > 0
      ? mentionData.reduce((sum, r) => sum + r.mentionRate, 0) / mentionData.length
      : 0;
  const topWord =
    mentionData.length > 0
      ? [...mentionData].sort((a, b) => b.mentionRate - a.mentionRate)[0]?.word ?? null
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Corpus</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Word mention history and Kalshi market management
          </p>
        </div>
        <SpeakerSelector
          speakers={speakers}
          selectedId={selectedSpeakerId}
          onSelect={setSelectedSpeakerId}
          onAddSpeaker={handleAddSpeaker}
        />
      </div>

      {/* Tabs */}
      <CorpusTabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        mentionCount={mentionData.length}
        seriesCount={series.length}
        transcriptCount={transcriptCount}
      />

      {/* Mention History Tab */}
      {activeTab === "mentions" && (
        <div className="space-y-4">
          {selectedSpeakerId && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-zinc-400">Category:</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500"
              >
                <option value="">All Events</option>
                {categories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
              {selectedCategory && (
                <span className="text-xs text-indigo-400 bg-indigo-900/30 px-2 py-1 rounded">
                  Filtered: {selectedCategory}
                </span>
              )}
            </div>
          )}
          <MentionSummaryStats
            totalWords={mentionData.length}
            totalSettledEvents={totalSettledEvents}
            avgMentionRate={avgMentionRate}
            topWord={topWord}
          />
          <MentionHistoryTable data={mentionData} loading={mentionLoading} />
        </div>
      )}

      {/* Kalshi Markets Tab */}
      {activeTab === "markets" && (
        <KalshiMarketsTab
          speakerId={selectedSpeakerId}
          speakerName={selectedSpeaker?.name ?? ""}
          series={series}
          loading={seriesLoading}
          categories={categories}
          onCategoriesChanged={() => { fetchCategories(); fetchMentionHistory(); }}
          onAddSeries={handleAddSeries}
          onDeleteSeries={handleDeleteSeries}
          onImportSeries={handleImportSeries}
          onRemoveEvent={handleRemoveEvent}
        />
      )}

      {/* Transcripts Tab */}
      {activeTab === "transcripts" && (
        <TranscriptsTab
          speakerId={selectedSpeakerId}
          speakerName={selectedSpeaker?.name ?? ""}
        />
      )}

      {/* Quick Analysis Tab */}
      {activeTab === "quick" && (
        <QuickAnalysisTab mentionData={mentionData} speakerId={selectedSpeakerId} />
      )}
    </div>
  );
}
