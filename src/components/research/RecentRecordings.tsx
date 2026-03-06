import type { RecentRecordingsResult } from "@/types/research";

interface RecentRecordingsProps {
  recordings: RecentRecordingsResult | null;
}

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("youtube")) return "▶";
  if (p.includes("c-span")) return "📺";
  return "🔗";
}

export function RecentRecordings({ recordings }: RecentRecordingsProps) {
  if (!recordings || recordings.recordings.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Recent Recordings</h2>

      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50">
          <h3 className="text-sm font-medium text-zinc-300">
            Watch past events to prepare
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            {recordings.recordings.length} most recent similar recordings
          </p>
        </div>

        <div className="divide-y divide-zinc-800/50">
          {recordings.recordings.map((rec, i) => (
            <a
              key={i}
              href={rec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 px-5 py-4 hover:bg-zinc-800/30 transition-colors group"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg group-hover:bg-zinc-700 transition-colors">
                {platformIcon(rec.platform)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors truncate">
                    {rec.title}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{rec.date}</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {rec.platform}
                  </span>
                  {rec.durationMinutes && (
                    <span>{rec.durationMinutes} min</span>
                  )}
                </div>

                {rec.description && (
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">
                    {rec.description}
                  </p>
                )}
              </div>

              <div className="flex-shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors mt-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
