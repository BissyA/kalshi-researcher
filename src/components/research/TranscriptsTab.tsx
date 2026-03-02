"use client";

import { useState, useEffect, useCallback } from "react";
import { CorpusStats } from "./CorpusStats";
import { FrequencyTable } from "./FrequencyTable";
import { TranscriptList } from "./TranscriptList";
import { TranscriptViewer } from "./TranscriptViewer";
import { TranscriptUpload } from "./TranscriptUpload";

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

interface TranscriptsTabProps {
  speaker: string;
  eventWords: string[];
}

export function TranscriptsTab({ speaker, eventWords }: TranscriptsTabProps) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [frequencies, setFrequencies] = useState<
    Record<string, { count: number; total: number; frequency: number; avgMentions: number }>
  >({});

  const fetchTranscripts = useCallback(async () => {
    try {
      const res = await fetch(`/api/transcripts?speaker=${encodeURIComponent(speaker)}`);
      const data = await res.json();
      setTranscripts(data.transcripts ?? []);
    } catch (err) {
      console.error("Failed to fetch transcripts:", err);
    } finally {
      setLoading(false);
    }
  }, [speaker]);

  const fetchFrequencies = useCallback(async () => {
    if (eventWords.length === 0) return;
    try {
      const wordsParam = eventWords.join(",");
      const res = await fetch(
        `/api/transcripts/frequencies?words=${encodeURIComponent(wordsParam)}&speaker=${encodeURIComponent(speaker)}`
      );
      const data = await res.json();
      setFrequencies(data.frequencies ?? {});
    } catch (err) {
      console.error("Failed to fetch frequencies:", err);
    }
  }, [eventWords, speaker]);

  useEffect(() => {
    fetchTranscripts();
    fetchFrequencies();
  }, [fetchTranscripts, fetchFrequencies]);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/transcripts/${id}`, { method: "DELETE" });
      await fetchTranscripts();
      await fetchFrequencies();
      if (selectedTranscript?.id === id) {
        setSelectedTranscript(null);
      }
    } catch (err) {
      console.error("Failed to delete transcript:", err);
    }
  };

  const handleUploadComplete = () => {
    setShowUploadForm(false);
    fetchTranscripts();
    fetchFrequencies();
  };

  // Corpus stats
  const totalWords = transcripts.reduce((sum, t) => sum + (t.word_count ?? 0), 0);
  const dates = transcripts
    .map((t) => t.event_date)
    .filter(Boolean)
    .sort() as string[];
  const dateRange =
    dates.length > 0
      ? { earliest: dates[0], latest: dates[dates.length - 1] }
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400">Loading transcripts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Transcript Library</h2>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showUploadForm ? "Cancel" : "Upload Transcript"}
        </button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <TranscriptUpload
          defaultSpeaker={speaker}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {/* Corpus Stats */}
      <CorpusStats
        totalTranscripts={transcripts.length}
        totalWords={totalWords}
        speaker={speaker}
        dateRange={dateRange}
      />

      {/* Frequency Table */}
      {eventWords.length > 0 && Object.keys(frequencies).length > 0 && (
        <FrequencyTable frequencies={frequencies} eventWords={eventWords} />
      )}

      {/* Transcript Viewer */}
      {selectedTranscript && (
        <TranscriptViewer
          transcript={selectedTranscript}
          highlightWords={eventWords}
          onClose={() => setSelectedTranscript(null)}
        />
      )}

      {/* Transcript List */}
      <TranscriptList
        transcripts={transcripts}
        selectedId={selectedTranscript?.id ?? null}
        onSelect={setSelectedTranscript}
        onDelete={handleDelete}
        eventWords={eventWords}
      />
    </div>
  );
}
