import type {
  HistoricalResult,
  AgendaResult,
  NewsCycleResult,
  EventFormatResult,
} from "@/types/research";

export type SourceType = "transcript" | "news" | "agenda" | "event" | "statement";

export interface ResearchSource {
  title: string;
  url?: string;
  date?: string;
  type: SourceType;
  detail?: string;
}

interface SourcesTabProps {
  sources: ResearchSource[];
}

const typeConfig: Record<SourceType, { label: string; color: string }> = {
  transcript: { label: "Transcript", color: "bg-blue-900/50 text-blue-400" },
  news: { label: "News", color: "bg-amber-900/50 text-amber-400" },
  agenda: { label: "Agenda", color: "bg-green-900/50 text-green-400" },
  event: { label: "Event", color: "bg-purple-900/50 text-purple-400" },
  statement: { label: "Statement", color: "bg-rose-900/50 text-rose-400" },
};

export function extractSources(
  historicalResult: HistoricalResult | null,
  agendaResult: AgendaResult | null,
  newsCycleResult: NewsCycleResult | null,
  eventFormatResult: EventFormatResult | null
): ResearchSource[] {
  const sources: ResearchSource[] = [];

  // Historical agent — transcripts
  if (historicalResult?.transcriptsFound) {
    for (const t of historicalResult.transcriptsFound) {
      sources.push({
        title: t.title,
        url: t.url || undefined,
        date: t.date || undefined,
        type: "transcript",
        detail: t.source && t.source !== "cached" ? t.source : undefined,
      });
    }
  }

  // Agenda agent — policy/preview sources
  if (agendaResult?.sourcesFound) {
    for (const s of agendaResult.sourcesFound) {
      sources.push({
        title: s.title,
        url: s.url || undefined,
        date: s.date || undefined,
        type: "agenda",
        detail: s.source || undefined,
      });
    }
  }

  // News cycle agent — trending topics with sources
  if (newsCycleResult?.trendingTopics) {
    for (const topic of newsCycleResult.trendingTopics) {
      if (topic.sources && topic.sources.length > 0) {
        for (const src of topic.sources) {
          // Sources can be URLs or names — try to detect
          const isUrl = src.startsWith("http");
          sources.push({
            title: isUrl ? topic.topic : src,
            url: isUrl ? src : undefined,
            type: "news",
            detail: topic.topic,
          });
        }
      } else {
        sources.push({
          title: topic.topic,
          type: "news",
          detail: topic.description,
        });
      }
    }
  }

  // News cycle agent — recent speaker statements
  if (newsCycleResult?.recentSpeakerStatements) {
    for (const stmt of newsCycleResult.recentSpeakerStatements) {
      sources.push({
        title: stmt.summary,
        date: stmt.date || undefined,
        type: "statement",
        detail: stmt.platform || undefined,
      });
    }
  }

  // Event format agent — comparable events
  if (eventFormatResult?.comparableEvents) {
    for (const evt of eventFormatResult.comparableEvents) {
      sources.push({
        title: evt.title,
        date: evt.date || undefined,
        type: "event",
        detail: `${evt.durationMinutes} min, ${evt.format}`,
      });
    }
  }

  return sources;
}

export function SourcesTab({ sources }: SourcesTabProps) {
  if (sources.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <p className="text-zinc-400 text-sm">
          No sources available yet.
        </p>
        <p className="text-zinc-500 text-xs mt-1">
          Run research to have the agents gather sources.
        </p>
      </div>
    );
  }

  // Group by type
  const grouped = new Map<SourceType, ResearchSource[]>();
  for (const s of sources) {
    const list = grouped.get(s.type) ?? [];
    list.push(s);
    grouped.set(s.type, list);
  }

  // Display order
  const typeOrder: SourceType[] = ["transcript", "agenda", "news", "statement", "event"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Sources</h2>
        <div className="flex items-center gap-2">
          {typeOrder
            .filter((t) => grouped.has(t))
            .map((t) => (
              <span
                key={t}
                className={`text-xs px-2 py-0.5 rounded-full ${typeConfig[t].color}`}
              >
                {grouped.get(t)!.length} {typeConfig[t].label}
              </span>
            ))}
        </div>
      </div>

      <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800/50">
        {sources.map((s, i) => (
          <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 flex items-center gap-3">
              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${typeConfig[s.type].color}`}
              >
                {typeConfig[s.type].label}
              </span>
              <div className="min-w-0">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {s.title}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-white">
                    {s.title}
                  </span>
                )}
                {s.detail && (
                  <span className="text-xs text-zinc-600 ml-2">{s.detail}</span>
                )}
              </div>
            </div>
            {s.date && (
              <span className="text-xs text-zinc-500 shrink-0">{s.date}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
