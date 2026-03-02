"use client";

import { useMemo } from "react";

interface Transcript {
  id: string;
  speaker: string;
  event_type: string | null;
  event_date: string | null;
  title: string | null;
  source_url: string | null;
  full_text: string;
  word_count: number | null;
}

interface TranscriptViewerProps {
  transcript: Transcript;
  highlightWords?: string[];
  onClose: () => void;
}

export function TranscriptViewer({
  transcript,
  highlightWords = [],
  onClose,
}: TranscriptViewerProps) {
  const isMetadataOnly =
    !transcript.full_text || transcript.full_text === "(metadata only)";

  // Count word occurrences
  const wordCounts = useMemo(() => {
    if (isMetadataOnly || highlightWords.length === 0) return [];
    const counts: Array<{ word: string; count: number }> = [];
    for (const word of highlightWords) {
      const variants = word.split(/\s*\/\s*/).map((v) => v.trim());
      let total = 0;
      for (const variant of variants) {
        const regex = new RegExp(
          variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi"
        );
        const matches = transcript.full_text.match(regex);
        if (matches) total += matches.length;
      }
      if (total > 0) {
        counts.push({ word, count: total });
      }
    }
    return counts.sort((a, b) => b.count - a.count);
  }, [transcript.full_text, highlightWords, isMetadataOnly]);

  // Highlight words in text
  const highlightedText = useMemo(() => {
    if (isMetadataOnly || highlightWords.length === 0)
      return transcript.full_text;

    // Build regex from all variants of all words
    const allVariants: string[] = [];
    for (const word of highlightWords) {
      const variants = word.split(/\s*\/\s*/).map((v) => v.trim());
      allVariants.push(...variants);
    }

    if (allVariants.length === 0) return transcript.full_text;

    const escapedVariants = allVariants.map((v) =>
      v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const regex = new RegExp(`(${escapedVariants.join("|")})`, "gi");
    return transcript.full_text.replace(
      regex,
      `<mark class="bg-yellow-500/30 text-yellow-200 px-0.5 rounded">$1</mark>`
    );
  }, [transcript.full_text, highlightWords, isMetadataOnly]);

  return (
    <div className="border border-blue-500/50 rounded-lg bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/70">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              📄 {transcript.title ?? "Untitled"}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
              <span>Speaker: {transcript.speaker}</span>
              {transcript.event_date && <span>{transcript.event_date}</span>}
              {transcript.event_type && (
                <span className="capitalize">
                  {transcript.event_type.replace(/_/g, " ")}
                </span>
              )}
              {transcript.word_count && (
                <span>{transcript.word_count.toLocaleString()} words</span>
              )}
            </div>
            {transcript.source_url && (
              <div className="mt-1">
                <a
                  href={transcript.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {transcript.source_url}
                </a>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-sm px-2 py-1"
          >
            Close
          </button>
        </div>

        {/* Word counts */}
        {wordCounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {wordCounts.map(({ word, count }) => (
              <span
                key={word}
                className="text-xs px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-800/50"
              >
                {word} ({count}x)
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 max-h-[600px] overflow-y-auto">
        {isMetadataOnly ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">
              Full transcript text not available.
            </p>
            <p className="text-zinc-600 text-xs mt-1">
              This transcript only has metadata. Upload the full text to view it
              here.
            </p>
          </div>
        ) : (
          <div
            className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono"
            dangerouslySetInnerHTML={{ __html: highlightedText }}
          />
        )}
      </div>
    </div>
  );
}
