import type { RecentRecordingsResult } from "@/types/research";

interface AvailableContent {
  date?: string;
  type?: string;
  sources?: string[];
  location?: string;
  participants?: string[];
  topic?: string;
  interviewer?: string;
}

interface FallbackResult {
  status?: string;
  message?: string;
  recommendations?: string[];
  available_content?: AvailableContent[];
}

interface RecentRecordingsProps {
  recordings: (RecentRecordingsResult & FallbackResult) | null;
}

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("youtube")) return "▶";
  if (p.includes("c-span")) return "📺";
  return "🔗";
}

export function RecentRecordings({ recordings }: RecentRecordingsProps) {
  if (!recordings) return null;

  const hasRecordings = recordings.recordings?.length > 0;
  const hasAvailableContent = (recordings.available_content?.length ?? 0) > 0;

  if (!hasRecordings && !hasAvailableContent) return null;

  // Full recordings with links
  if (hasRecordings) {
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

  // Fallback: available content without direct links
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Recent Events</h2>

      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50">
          <h3 className="text-sm font-medium text-zinc-300">
            Known recent events (no direct links found)
          </h3>
          {recordings.message && (
            <p className="text-xs text-zinc-500 mt-1">{recordings.message}</p>
          )}
        </div>

        <div className="divide-y divide-zinc-800/50">
          {recordings.available_content!.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-4 px-5 py-4"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg text-zinc-500">
                {item.type?.toLowerCase().includes("press") ? "📋" : "🎤"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white mb-1">
                  {item.type}
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                  {item.date && <span>{item.date}</span>}
                  {item.location && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {item.location}
                    </span>
                  )}
                  {item.sources?.map((src) => (
                    <span key={src} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {src}
                    </span>
                  ))}
                </div>

                {(item.participants?.length ?? 0) > 0 && (
                  <p className="text-xs text-zinc-400 mt-1.5">
                    {item.participants!.join(", ")}
                  </p>
                )}

                {item.topic && (
                  <p className="text-xs text-zinc-400 mt-1">
                    Topic: {item.topic}
                  </p>
                )}

                {item.interviewer && (
                  <p className="text-xs text-zinc-400 mt-1">
                    Interviewer: {item.interviewer}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {(recordings.recommendations?.length ?? 0) > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800/50 bg-zinc-900/50">
            <div className="text-xs text-zinc-500 font-medium mb-1.5">Where to find recordings</div>
            <ul className="space-y-1">
              {recordings.recommendations!.map((rec, i) => (
                <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                  <span className="text-zinc-600 mt-0.5">·</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
