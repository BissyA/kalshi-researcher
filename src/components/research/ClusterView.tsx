import type { Cluster, WordScore } from "@/types/components";
import type { ClusterResult } from "@/types/research";
import { edgeColor, correlationBadge } from "@/lib/ui-utils";

interface ClusterViewProps {
  clusters: Cluster[];
  clusterResult: ClusterResult | null;
  wordScores: WordScore[];
}

export function ClusterView({ clusters, clusterResult, wordScores }: ClusterViewProps) {
  if (clusters.length === 0) return null;

  // Merge DB cluster data with rich JSONB data from the research run
  const enrichedClusters = clusters.map((dbCluster) => {
    const richCluster = clusterResult?.clusters?.find(
      (rc) => rc.name.toLowerCase() === dbCluster.cluster_name.toLowerCase()
    );

    // Get word scores that belong to this cluster
    const clusterWordScores = wordScores.filter(
      (ws) => ws.words?.cluster_id === dbCluster.id
    );

    return {
      ...dbCluster,
      narrative: richCluster?.correlationNote ?? dbCluster.correlation_note ?? "",
      tradingImplication: richCluster?.tradingImplication ?? "",
      intraCorrelation: richCluster?.intraCorrelation ?? "medium",
      words: clusterWordScores,
    };
  });

  // Unclustered words
  const unclusteredScores = wordScores.filter((ws) => !ws.words?.cluster_id);

  const standaloneWords = clusterResult?.standaloneWords ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Word Clusters</h2>

      <div className="space-y-4">
        {enrichedClusters.map((cluster) => {
          const badge = correlationBadge(cluster.intraCorrelation);

          return (
            <div
              key={cluster.id}
              className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden"
            >
              {/* Cluster Header */}
              <div className="px-5 py-4 border-b border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs inline-block w-2 h-2 rounded-full ${
                      cluster.intraCorrelation === "high" ? "bg-green-400" :
                      cluster.intraCorrelation === "medium" ? "bg-yellow-400" : "bg-zinc-500"
                    }`} />
                    <h3 className="text-base font-semibold text-white">
                      {cluster.cluster_name}
                    </h3>
                    <span className="text-xs text-zinc-500">{cluster.theme}</span>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full border ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>

              {/* Narrative */}
              {cluster.narrative && (
                <div className="px-5 py-3 border-b border-zinc-800/30">
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {cluster.narrative}
                  </p>
                </div>
              )}

              {/* Mini Table */}
              {cluster.words.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900/50">
                        <th className="px-5 py-2 text-left text-xs text-zinc-500 font-medium">
                          Word
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">
                          Hist%
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">
                          Prob.
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">
                          Price
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">
                          Edge
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cluster.words
                        .sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0))
                        .map((ws) => (
                          <tr key={ws.id} className="border-t border-zinc-800/30">
                            <td className="px-5 py-2 text-white font-medium">
                              {ws.words?.word}
                            </td>
                            <td className="px-3 py-2 text-zinc-400 font-mono text-xs">
                              {Math.round((ws.historical_probability ?? 0) * 100)}%
                            </td>
                            <td className="px-3 py-2 text-white font-mono text-xs">
                              {Math.round((ws.combined_probability ?? 0) * 100)}%
                            </td>
                            <td className="px-3 py-2 text-zinc-400 font-mono text-xs">
                              {Math.round((ws.market_yes_price ?? 0) * 100)}¢
                            </td>
                            <td
                              className={`px-3 py-2 font-mono text-xs font-medium ${edgeColor(ws.edge ?? 0)}`}
                            >
                              {ws.edge > 0 ? "+" : ""}
                              {Math.round((ws.edge ?? 0) * 100)}¢
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Trading Implication */}
              {cluster.tradingImplication && (
                <div className="px-5 py-3 border-t border-zinc-800/30 bg-zinc-950/30">
                  <p className="text-xs text-zinc-400">
                    <span className="text-zinc-500 font-medium">Trading implication: </span>
                    {cluster.tradingImplication}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {/* Unclustered Words */}
        {unclusteredScores.length > 0 && (
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800/50">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                <h3 className="text-base font-semibold text-white">
                  Unclustered Words
                </h3>
                <span className="text-xs text-zinc-500">
                  {unclusteredScores.length} words not in a thematic group
                </span>
              </div>
            </div>

            {standaloneWords.length > 0 && (
              <div className="px-5 py-3 border-b border-zinc-800/30">
                <p className="text-sm text-zinc-400">
                  These words don&apos;t belong to a clear thematic group. Evaluate individually.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900/50">
                    <th className="px-5 py-2 text-left text-xs text-zinc-500 font-medium">Word</th>
                    <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">Hist%</th>
                    <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">Prob.</th>
                    <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">Price</th>
                    <th className="px-3 py-2 text-left text-xs text-zinc-500 font-medium">Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {unclusteredScores
                    .sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0))
                    .map((ws) => (
                      <tr key={ws.id} className="border-t border-zinc-800/30">
                        <td className="px-5 py-2 text-white font-medium">{ws.words?.word}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono text-xs">
                          {Math.round((ws.historical_probability ?? 0) * 100)}%
                        </td>
                        <td className="px-3 py-2 text-white font-mono text-xs">
                          {Math.round((ws.combined_probability ?? 0) * 100)}%
                        </td>
                        <td className="px-3 py-2 text-zinc-400 font-mono text-xs">
                          {Math.round((ws.market_yes_price ?? 0) * 100)}¢
                        </td>
                        <td className={`px-3 py-2 font-mono text-xs font-medium ${edgeColor(ws.edge ?? 0)}`}>
                          {ws.edge > 0 ? "+" : ""}{Math.round((ws.edge ?? 0) * 100)}¢
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
