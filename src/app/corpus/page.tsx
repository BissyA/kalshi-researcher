"use client";

import { useEffect, useState, useCallback } from "react";
import { SpeakerSelector } from "@/components/corpus/SpeakerSelector";
import { CorpusTabNav, type CorpusTab } from "@/components/corpus/CorpusTabNav";
import { MentionSummaryStats } from "@/components/corpus/MentionSummaryStats";
import { MentionHistoryTable } from "@/components/corpus/MentionHistoryTable";
import { KalshiMarketsTab } from "@/components/corpus/KalshiMarketsTab";
import { QuickAnalysisTab } from "@/components/corpus/QuickAnalysisTab";
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

  // Series state (for Kalshi Markets tab)
  const [series, setSeries] = useState<SeriesWithStats[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);

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

  // Fetch mention history when speaker changes
  const fetchMentionHistory = useCallback(async () => {
    setMentionLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSpeakerId) params.set("speakerId", selectedSpeakerId);
      const res = await fetch(`/api/corpus/mention-history?${params}`);
      const data = await res.json();
      setMentionData(data.rows ?? []);
      setTotalSettledEvents(data.totalSettledEvents ?? 0);
    } catch {
      setMentionData([]);
    } finally {
      setMentionLoading(false);
    }
  }, [selectedSpeakerId]);

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
      />

      {/* Mention History Tab */}
      {activeTab === "mentions" && (
        <div className="space-y-4">
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
          onAddSeries={handleAddSeries}
          onDeleteSeries={handleDeleteSeries}
          onImportSeries={handleImportSeries}
          onRemoveEvent={handleRemoveEvent}
        />
      )}

      {/* Quick Analysis Tab */}
      {activeTab === "quick" && (
        <QuickAnalysisTab mentionData={mentionData} speakerId={selectedSpeakerId} />
      )}
    </div>
  );
}
