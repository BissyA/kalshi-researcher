import type { ResearchRun } from "@/types/components";
import { MODEL_PRESET_LABELS } from "@/types/components";

interface RunHistoryProps {
  runs: ResearchRun[];
  expandedRun: string | null;
  onExpandRun: (id: string | null) => void;
  onStopRun: (id: string) => void;
}

export function RunHistory({ runs, expandedRun, onExpandRun, onStopRun }: RunHistoryProps) {
  if (runs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Research Runs</h2>
      <div className="space-y-2">
        {runs.map((run) => {
          const isExpanded = expandedRun === run.id;
          const agentResults = [
            { key: "historical", label: "Historical", data: run.historical_result },
            { key: "agenda", label: "Agenda", data: run.agenda_result },
            { key: "news_cycle", label: "News Cycle", data: run.news_cycle_result },
            { key: "event_format", label: "Event Format", data: run.event_format_result },
            { key: "market_analysis", label: "Market Analysis", data: run.market_analysis_result },
            { key: "clustering", label: "Clustering", data: run.cluster_result },
            { key: "synthesis", label: "Synthesis", data: run.synthesis_result },
          ];
          const completedAgents = agentResults.filter((a) => a.data != null);

          return (
            <div key={run.id} className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
              <button
                onClick={() => onExpandRun(isExpanded ? null : run.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      run.status === "completed"
                        ? "bg-green-900/50 text-green-400"
                        : run.status === "running"
                          ? "bg-yellow-900/50 text-yellow-400"
                          : run.status === "cancelled"
                            ? "bg-zinc-700 text-zinc-400"
                            : "bg-red-900/50 text-red-400"
                    }`}
                  >
                    {run.status}
                  </span>
                  {run.model_used && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-400">
                      {MODEL_PRESET_LABELS[run.model_used] ?? run.model_used}
                    </span>
                  )}
                  <span className="text-zinc-300 capitalize">{run.layer}</span>
                  <span className="text-zinc-500">
                    {new Date(run.triggered_at).toLocaleString()}
                  </span>
                  {completedAgents.length > 0 && (
                    <span className="text-zinc-600 text-xs">
                      {completedAgents.length}/7 agents
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {run.total_cost_cents != null && (
                    <span className="text-zinc-500">
                      ${(run.total_cost_cents / 100).toFixed(2)}
                    </span>
                  )}
                  {run.status === "running" && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onStopRun(run.id);
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-400 hover:bg-red-800/50 transition-colors cursor-pointer"
                    >
                      Stop
                    </span>
                  )}
                  <span className="text-zinc-600 text-xs">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                  {run.error_message && (
                    <div className="text-sm text-red-400 bg-red-950/30 rounded p-3">
                      {run.error_message}
                    </div>
                  )}

                  {run.total_input_tokens != null && (
                    <div className="flex gap-4 text-xs text-zinc-500">
                      <span>Input: {run.total_input_tokens.toLocaleString()} tokens</span>
                      <span>Output: {(run.total_output_tokens ?? 0).toLocaleString()} tokens</span>
                      {run.completed_at && (
                        <span>
                          Duration:{" "}
                          {Math.round(
                            (new Date(run.completed_at).getTime() -
                              new Date(run.triggered_at).getTime()) /
                              1000
                          )}s
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-zinc-400">Agent Results</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {agentResults.map((agent) => (
                        <div
                          key={agent.key}
                          className={`text-xs px-3 py-2 rounded border ${
                            agent.data != null
                              ? "border-green-900/50 bg-green-950/20 text-green-400"
                              : "border-zinc-800 bg-zinc-900/30 text-zinc-600"
                          }`}
                        >
                          {agent.label}
                          <span className="ml-1">
                            {agent.data != null ? "✓" : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {completedAgents.length > 0 && (
                    <details className="text-xs">
                      <summary className="text-zinc-400 cursor-pointer hover:text-zinc-300 py-1">
                        Raw agent data
                      </summary>
                      <pre className="mt-2 p-3 bg-zinc-950 rounded text-zinc-500 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {JSON.stringify(
                          Object.fromEntries(
                            completedAgents.map((a) => [a.key, a.data])
                          ),
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
