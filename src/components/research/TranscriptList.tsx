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

interface TranscriptListProps {
  transcripts: Transcript[];
  selectedId: string | null;
  onSelect: (transcript: Transcript) => void;
  onDelete: (id: string) => void;
  eventWords: string[];
  showDownload?: boolean;
}

export function TranscriptList({
  transcripts,
  selectedId,
  onSelect,
  onDelete,
  eventWords,
  showDownload = false,
}: TranscriptListProps) {
  if (transcripts.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <div className="text-zinc-600 text-3xl mb-3">📚</div>
        <p className="text-zinc-400 text-sm">No transcripts in the library yet.</p>
        <p className="text-zinc-500 text-xs mt-1">
          Upload a transcript or run research to populate the library.
        </p>
      </div>
    );
  }

  // Count event words found in each transcript
  function countMarketWords(transcript: Transcript): Array<{ word: string; count: number }> {
    const text = transcript.full_text;
    if (!text || text === "(metadata only)") return [];

    const found: Array<{ word: string; count: number }> = [];
    for (const word of eventWords) {
      const variants = word.split(/\s*\/\s*/).map((v) => v.trim());
      let totalCount = 0;
      for (const variant of variants) {
        const regex = new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const matches = text.match(regex);
        if (matches) totalCount += matches.length;
      }
      if (totalCount > 0) {
        found.push({ word, count: totalCount });
      }
    }
    return found.sort((a, b) => b.count - a.count);
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">
        Transcripts ({transcripts.length})
      </h3>
      <div className="space-y-2">
        {transcripts.map((t) => {
          const isSelected = selectedId === t.id;
          const hasFullText = t.full_text && t.full_text !== "(metadata only)";
          const marketWords = hasFullText ? countMarketWords(t) : [];

          return (
            <div
              key={t.id}
              className={`border rounded-lg p-4 transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-950/20"
                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">📄</span>
                    <h4 className="text-sm font-medium text-white truncate">
                      {t.title ?? "Untitled"}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    {t.event_date && <span>{t.event_date}</span>}
                    {t.event_type && (
                      <span className="capitalize">{t.event_type.replace(/_/g, " ")}</span>
                    )}
                    {t.word_count && <span>{t.word_count.toLocaleString()} words</span>}
                    {t.source_url && (
                      <span className="text-zinc-600 truncate max-w-48">
                        {new URL(t.source_url).hostname}
                      </span>
                    )}
                  </div>
                  {/* Market words found */}
                  {marketWords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {marketWords.slice(0, 8).map(({ word, count }) => (
                        <span
                          key={word}
                          className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300"
                        >
                          {word} ({count}x)
                        </span>
                      ))}
                      {marketWords.length > 8 && (
                        <span className="text-xs text-zinc-500">
                          +{marketWords.length - 8} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {hasFullText && (
                    <button
                      onClick={() => onSelect(t)}
                      className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                    >
                      {isSelected ? "Close" : "View Full Text"}
                    </button>
                  )}
                  {showDownload && hasFullText && (
                    <a
                      href={`/api/transcripts/${t.id}/download`}
                      download
                      className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                    >
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => onDelete(t.id)}
                    className="text-xs px-2 py-1 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
