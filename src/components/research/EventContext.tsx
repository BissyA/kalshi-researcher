import type {
  EventFormatResult,
  AgendaResult,
  NewsCycleResult,
} from "@/types/research";

interface EventContextProps {
  eventFormat: EventFormatResult | null;
  agenda: AgendaResult | null;
  newsCycle: NewsCycleResult | null;
}

function formatLabel(format: string) {
  switch (format) {
    case "scripted":
      return "Scripted";
    case "unscripted":
      return "Unscripted";
    case "mixed":
      return "Mixed";
    case "interview":
      return "Interview";
    default:
      return format;
  }
}

function likelihoodBadge(likelihood: string) {
  switch (likelihood) {
    case "very_likely":
      return { label: "Very Likely", color: "bg-green-900/50 text-green-400 border-green-800" };
    case "likely":
      return { label: "Likely", color: "bg-blue-900/50 text-blue-400 border-blue-800" };
    case "possible":
      return { label: "Possible", color: "bg-yellow-900/50 text-yellow-400 border-yellow-800" };
    case "unlikely":
      return { label: "Unlikely", color: "bg-zinc-800 text-zinc-400 border-zinc-700" };
    default:
      return { label: likelihood, color: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  }
}

function relevanceBadge(relevance: string) {
  switch (relevance) {
    case "high":
      return { label: "High", color: "text-red-400" };
    case "medium":
      return { label: "Medium", color: "text-yellow-400" };
    case "low":
      return { label: "Low", color: "text-zinc-400" };
    default:
      return { label: relevance, color: "text-zinc-400" };
  }
}

const likelihoodOrder: Record<string, number> = {
  very_likely: 0,
  likely: 1,
  possible: 2,
  unlikely: 3,
};

export function EventContext({ eventFormat, agenda, newsCycle }: EventContextProps) {
  const hasAnyData = eventFormat || agenda || newsCycle;

  if (!hasAnyData) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <p className="text-zinc-400 text-sm">
          No event context available yet.
        </p>
        <p className="text-zinc-500 text-xs mt-1">
          Run research to generate event context and analysis.
        </p>
      </div>
    );
  }

  // Sort topics by likelihood
  const sortedTopics = agenda?.topicWordMapping
    ? Object.entries(agenda.topicWordMapping)
        .sort(([, a], [, b]) => (likelihoodOrder[a.likelihood] ?? 99) - (likelihoodOrder[b.likelihood] ?? 99))
    : [];

  // Sort trending topics by relevance
  const sortedTrending = newsCycle?.trendingTopics
    ? [...newsCycle.trendingTopics].sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.relevanceToEvent] ?? 99) - (order[b.relevanceToEvent] ?? 99);
      })
    : [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Event Context</h2>

      {/* ── Section A: Event Structure ── */}
      {eventFormat && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50">
            <h3 className="text-sm font-medium text-zinc-300">Event Structure</h3>
          </div>

          {/* Key facts row */}
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Format</div>
              <div className="text-sm font-medium text-white">{formatLabel(eventFormat.format)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Duration</div>
              <div className="text-sm font-medium text-white">
                ~{eventFormat.estimatedDurationMinutes} min
              </div>
              <div className="text-xs text-zinc-500">
                ({eventFormat.durationRange.min}–{eventFormat.durationRange.max} min)
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Q&A</div>
              <div className={`text-sm font-medium ${eventFormat.hasQandA ? "text-green-400" : "text-zinc-400"}`}>
                {eventFormat.hasQandA ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Live</div>
              <div className={`text-sm font-medium ${eventFormat.isLive ? "text-green-400" : "text-zinc-400"}`}>
                {eventFormat.isLive ? "Yes" : "No"}
              </div>
            </div>
          </div>

          {/* Format & duration explanations */}
          {(eventFormat.implications.formatEffect || eventFormat.implications.durationEffect) && (
            <div className="px-5 py-3 border-t border-zinc-800/30 space-y-2">
              {eventFormat.implications.formatEffect && (
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {eventFormat.implications.formatEffect}
                </p>
              )}
              {eventFormat.implications.durationEffect && (
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {eventFormat.implications.durationEffect}
                </p>
              )}
            </div>
          )}

          {/* Trading weight footer */}
          <div className="px-5 py-3 border-t border-zinc-800/30 bg-zinc-950/30">
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span>
                Historical weight:{" "}
                <span className="text-white font-medium">
                  {Math.round(eventFormat.implications.scriptedWeight * 100)}%
                </span>
              </span>
              <span>
                Current context weight:{" "}
                <span className="text-white font-medium">
                  {Math.round(eventFormat.implications.currentContextWeight * 100)}%
                </span>
              </span>
              <span>
                Word count:{" "}
                <span className={`font-medium ${
                  eventFormat.implications.overallWordCountExpectation === "high"
                    ? "text-green-400"
                    : eventFormat.implications.overallWordCountExpectation === "medium"
                      ? "text-yellow-400"
                      : "text-zinc-400"
                }`}>
                  {eventFormat.implications.overallWordCountExpectation}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section B: Event Analysis ── */}
      {(agenda || newsCycle) && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50">
            <h3 className="text-sm font-medium text-zinc-300">Event Analysis</h3>
          </div>

          {/* Breaking news alert */}
          {newsCycle?.breakingNewsAlert && (
            <div className="px-5 py-3 bg-red-950/30 border-b border-red-900/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Breaking</span>
                <span className="text-sm text-red-200">{newsCycle.breakingNewsAlert}</span>
              </div>
            </div>
          )}

          {/* Agenda & Purpose */}
          {agenda && (
            <div className="px-5 py-4 border-b border-zinc-800/30">
              <div className="text-xs text-zinc-500 font-medium mb-2">Agenda & Purpose</div>
              {agenda.overallNotes && (
                <p className="text-sm text-zinc-300 leading-relaxed mb-3">
                  {agenda.overallNotes}
                </p>
              )}
              {agenda.sourcesFound.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs text-zinc-500">Sources</div>
                  {agenda.sourcesFound.map((src, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-zinc-600 mt-0.5">·</span>
                      <div>
                        <span className="text-zinc-300">{src.title}</span>
                        <span className="text-zinc-500">
                          {" "}({src.source}{src.date ? `, ${src.date}` : ""})
                        </span>
                        {src.summary && (
                          <span className="text-zinc-400"> — {src.summary}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Exogenous Events */}
          {sortedTrending.length > 0 && (
            <div className="px-5 py-4 border-b border-zinc-800/30">
              <div className="text-xs text-zinc-500 font-medium mb-3">Exogenous Events</div>
              <div className="space-y-3">
                {sortedTrending.map((topic, i) => {
                  const badge = relevanceBadge(topic.relevanceToEvent);
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm text-white font-medium">{topic.topic}</span>
                        <span className={`text-xs font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {topic.description}
                      </p>
                      {topic.relatedWords.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {topic.relatedWords.map((word) => (
                            <span
                              key={word}
                              className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300"
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Statements */}
          {newsCycle?.recentSpeakerStatements && newsCycle.recentSpeakerStatements.length > 0 && (
            <div className="px-5 py-4 border-b border-zinc-800/30">
              <div className="text-xs text-zinc-500 font-medium mb-2">Recent Statements</div>
              <div className="space-y-2">
                {newsCycle.recentSpeakerStatements.map((stmt, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-zinc-600 mt-0.5">·</span>
                    <div>
                      <span className="text-zinc-400">{stmt.platform}</span>
                      {stmt.date && <span className="text-zinc-500"> ({stmt.date})</span>}
                      <span className="text-zinc-300"> — {stmt.summary}</span>
                      {stmt.wordsUsed.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {stmt.wordsUsed.map((word) => (
                            <span
                              key={word}
                              className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300"
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Likely Topics */}
          {sortedTopics.length > 0 && (
            <div className="px-5 py-4">
              <div className="text-xs text-zinc-500 font-medium mb-3">Likely Topics</div>
              <div className="space-y-3">
                {sortedTopics.map(([topic, data]) => {
                  const badge = likelihoodBadge(data.likelihood);
                  return (
                    <div key={topic}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm text-white font-medium">{topic}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {data.evidence}
                      </p>
                      {data.relatedWords.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {data.relatedWords.map((word) => (
                            <span
                              key={word}
                              className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300"
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
