"use client";

import { useEffect, useState, useCallback } from "react";
import { SpeakerSelector } from "@/components/corpus/SpeakerSelector";
import { CorpusTabNav, type CorpusTab } from "@/components/corpus/CorpusTabNav";
import { MentionSummaryStats } from "@/components/corpus/MentionSummaryStats";
import { MentionHistoryTable } from "@/components/corpus/MentionHistoryTable";
import { TranscriptSearchBar } from "@/components/corpus/TranscriptSearchBar";
import { KalshiMarketsTab } from "@/components/corpus/KalshiMarketsTab";
import { QuickAnalysisTab } from "@/components/corpus/QuickAnalysisTab";
import { CorpusStats } from "@/components/research/CorpusStats";
import { TranscriptList } from "@/components/research/TranscriptList";
import { TranscriptViewer } from "@/components/research/TranscriptViewer";
import { TranscriptUpload } from "@/components/research/TranscriptUpload";
import type { MentionHistoryRow, SeriesWithStats } from "@/types/corpus";

interface Speaker {
  id: string;
  name: string;
}

interface Transcript {
  id: string;
  speaker: string;
  event_type: string | null;
  event_date: string | null;
  title: string | null;
  source_url: string | null;
  full_text: string;
  word_count: number | null;
  created_at: string;
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

  // Transcript state
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [transcriptTotal, setTranscriptTotal] = useState(0);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [showUpload, setShowUpload] = useState(false);

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

  // Fetch transcripts when speaker or search changes
  const fetchTranscripts = useCallback(async () => {
    setTranscriptLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (selectedSpeaker) params.set("speaker", selectedSpeaker.name);
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/transcripts?${params}`);
      const data = await res.json();
      setTranscripts(data.transcripts ?? []);
      setTranscriptTotal(data.total ?? 0);
    } catch {
      setTranscripts([]);
    } finally {
      setTranscriptLoading(false);
    }
  }, [selectedSpeaker, searchQuery]);

  useEffect(() => {
    fetchTranscripts();
  }, [fetchTranscripts]);

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
    // Auto-select the new speaker
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

  async function handleImportSeries(seriesId: string) {
    const res = await fetch("/api/corpus/import-historical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Refresh both series stats and mention history after import
    await fetchSeries();
    await fetchMentionHistory();
    return {
      eventsImported: data.eventsImported ?? 0,
      wordsImported: data.wordsImported ?? 0,
      resultsImported: data.resultsImported ?? 0,
      errors: data.errors ?? [],
    };
  }

  async function handleDeleteTranscript(id: string) {
    await fetch(`/api/transcripts/${id}`, { method: "DELETE" });
    setSelectedTranscript(null);
    fetchTranscripts();
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

  const totalTranscriptWords = transcripts.reduce(
    (sum, t) => sum + (t.word_count ?? 0),
    0
  );
  const dates = transcripts
    .map((t) => t.event_date)
    .filter(Boolean)
    .sort() as string[];
  const dateRange =
    dates.length > 0
      ? { earliest: dates[0], latest: dates[dates.length - 1] }
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Corpus</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Word mention history, transcript library, and Kalshi market management
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
        transcriptCount={transcriptTotal}
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

      {/* Transcript Library Tab */}
      {activeTab === "transcripts" && (
        <div className="space-y-4">
          <CorpusStats
            totalTranscripts={transcriptTotal}
            totalWords={totalTranscriptWords}
            speaker={selectedSpeaker?.name || "All"}
            dateRange={dateRange}
          />

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <TranscriptSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
            >
              {showUpload ? "Hide Upload" : "Upload Transcript"}
            </button>
          </div>

          {showUpload && (
            <TranscriptUpload
              defaultSpeaker={selectedSpeaker?.name || ""}
              onUploadComplete={() => {
                setShowUpload(false);
                fetchTranscripts();
              }}
            />
          )}

          {selectedTranscript && (
            <TranscriptViewer
              transcript={selectedTranscript}
              onClose={() => setSelectedTranscript(null)}
            />
          )}

          {transcriptLoading ? (
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
              <p className="text-zinc-400 text-sm">Loading transcripts...</p>
            </div>
          ) : (
            <TranscriptList
              transcripts={transcripts}
              selectedId={selectedTranscript?.id ?? null}
              onSelect={setSelectedTranscript}
              onDelete={handleDeleteTranscript}
              eventWords={[]}
              showDownload
            />
          )}
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
        />
      )}

      {/* Quick Analysis Tab */}
      {activeTab === "quick" && (
        <QuickAnalysisTab mentionData={mentionData} speakerId={selectedSpeakerId} />
      )}
    </div>
  );
}
