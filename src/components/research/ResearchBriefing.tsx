import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

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

const mdComponents: Components = {
  h1: ({ children }) => (
    <div className="text-sm font-medium text-zinc-300 mt-5 mb-2 border-b border-zinc-800/50 pb-2">{children}</div>
  ),
  h2: ({ children }) => (
    <div className="text-sm font-medium text-zinc-300 mt-5 mb-2 border-b border-zinc-800/50 pb-2">{children}</div>
  ),
  h3: ({ children }) => (
    <div className="text-xs text-zinc-500 font-medium mt-4 mb-2">{children}</div>
  ),
  p: ({ children }) => (
    <p className="text-xs text-zinc-400 leading-relaxed mb-2">{children}</p>
  ),
  strong: ({ children }) => (
    <span className="text-zinc-200 font-medium">{children}</span>
  ),
  em: ({ children }) => (
    <span className="text-zinc-400 italic">{children}</span>
  ),
  ul: ({ children }) => (
    <div className="space-y-1.5 mb-3">{children}</div>
  ),
  ol: ({ children }) => (
    <div className="space-y-1.5 mb-3">{children}</div>
  ),
  li: ({ children }) => (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-zinc-600 mt-0.5">·</span>
      <div className="text-zinc-400 leading-relaxed">{children}</div>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  blockquote: ({ children }) => (
    <div className="border-l-2 border-zinc-700 pl-3 my-2 text-xs text-zinc-500">{children}</div>
  ),
  hr: () => <div className="border-t border-zinc-800/50 my-4" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3 border border-zinc-800 rounded-lg">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-zinc-900/50 border-b border-zinc-800">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left text-xs font-medium text-zinc-400 px-3 py-2">{children}</th>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-zinc-800/50">{children}</tr>
  ),
  td: ({ children }) => (
    <td className="text-xs text-zinc-300 px-3 py-2">{children}</td>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="bg-zinc-900 border border-zinc-800 rounded p-3 overflow-x-auto mb-3">
          <code className="text-xs text-zinc-300 font-mono">{children}</code>
        </pre>
      );
    }
    return <code className="text-zinc-300 font-mono text-xs">{children}</code>;
  },
};

export function ResearchBriefing({
  briefing,
  researchQuality,
  runTimestamp,
  layer,
}: ResearchBriefingProps) {
  if (!briefing) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-8 text-center">
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
      <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Research Briefing</h3>
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

      <div className="px-5 py-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {briefing}
        </ReactMarkdown>
      </div>

      {researchQuality && (
        <div className="px-5 py-3 border-t border-zinc-800/50 bg-zinc-950/30">
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
