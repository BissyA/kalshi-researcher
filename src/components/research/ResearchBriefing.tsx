import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ResearchQuality {
  transcriptsAnalyzed: number;
  sourcesConsulted: number;
  overallConfidence: string;
  caveats: string[];
}

interface ResearchBriefingProps {
  briefing: string | null;
  researchQuality?: ResearchQuality | null;
  runTimestamp?: string | null;
  layer?: string | null;
}

export function ResearchBriefing({
  briefing,
  researchQuality,
  runTimestamp,
  layer,
}: ResearchBriefingProps) {
  if (!briefing) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
        <div className="text-zinc-600 text-3xl mb-3">📋</div>
        <p className="text-zinc-400 text-sm">
          No research briefing available yet.
        </p>
        <p className="text-zinc-500 text-xs mt-1">
          Run new research to generate a detailed analyst briefing.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Research Briefing</h2>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {runTimestamp && (
              <span>Generated: {new Date(runTimestamp).toLocaleString()}</span>
            )}
            {layer && (
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 capitalize">
                {layer}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-white prose-a:text-blue-400 prose-blockquote:border-zinc-700 prose-blockquote:text-zinc-400 prose-hr:border-zinc-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing}</ReactMarkdown>
        </div>
      </div>

      {researchQuality && (
        <div className="px-6 py-3 border-t border-zinc-800/50 bg-zinc-950/30">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>{researchQuality.transcriptsAnalyzed} transcripts analyzed</span>
            <span>{researchQuality.sourcesConsulted} sources consulted</span>
            <span
              className={`px-2 py-0.5 rounded-full ${
                researchQuality.overallConfidence === "high"
                  ? "bg-green-900/50 text-green-400"
                  : researchQuality.overallConfidence === "medium"
                    ? "bg-yellow-900/50 text-yellow-400"
                    : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {researchQuality.overallConfidence} confidence
            </span>
          </div>
          {researchQuality.caveats.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-zinc-600">Caveats: </span>
              <span className="text-xs text-zinc-500">
                {researchQuality.caveats.join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
