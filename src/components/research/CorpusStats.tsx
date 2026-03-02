interface CorpusStatsProps {
  totalTranscripts: number;
  totalWords: number;
  speaker: string;
  dateRange: { earliest: string; latest: string } | null;
}

export function CorpusStats({
  totalTranscripts,
  totalWords,
  speaker,
  dateRange,
}: CorpusStatsProps) {
  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 px-5 py-3">
      <div className="flex items-center gap-6 text-sm">
        <span className="text-zinc-300">
          <span className="text-white font-medium">{totalTranscripts}</span> transcripts
        </span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-300">
          <span className="text-white font-medium">{totalWords.toLocaleString()}</span> total words
        </span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-300">
          Speaker: <span className="text-white font-medium">{speaker}</span>
        </span>
        {dateRange && (
          <>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 text-xs">
              {dateRange.earliest} — {dateRange.latest}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
