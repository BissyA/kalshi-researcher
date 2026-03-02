import type { ResearchSummary } from "@/types/components";

interface AgentOutputAccordionProps {
  researchSummary: ResearchSummary | null;
}

const agentPanels = [
  { key: "historical", label: "Historical Transcript Agent" },
  { key: "agenda", label: "Agenda / Preview Agent" },
  { key: "newsCycle", label: "News Cycle Agent" },
  { key: "eventFormat", label: "Event Format Agent" },
  { key: "marketAnalysis", label: "Market Analysis Agent" },
  { key: "clusters", label: "Word Clustering Agent" },
  { key: "synthesis", label: "Synthesizer Agent" },
] as const;

export function AgentOutputAccordion({ researchSummary }: AgentOutputAccordionProps) {
  if (!researchSummary) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Agent Raw Outputs</h2>

      <div className="space-y-1">
        {agentPanels.map((panel) => {
          const data = researchSummary[panel.key as keyof ResearchSummary];
          const hasData = data != null;

          return (
            <details
              key={panel.key}
              className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden group"
            >
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors list-none">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 text-xs group-open:rotate-90 transition-transform">
                    ▶
                  </span>
                  <span className="text-sm text-zinc-300">{panel.label}</span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    hasData
                      ? "bg-green-900/50 text-green-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {hasData ? "Completed" : "No data"}
                </span>
              </summary>
              {hasData && (
                <div className="border-t border-zinc-800 px-4 py-3">
                  <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
