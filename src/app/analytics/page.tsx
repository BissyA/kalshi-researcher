"use client";

import { useState, useEffect } from "react";

interface OverallStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlCents: number;
  totalPnlDollars: string;
}

interface EventPerf {
  eventId: string;
  title: string;
  eventDate: string;
  status: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  pnlCents: number;
}

interface CalibrationBucket {
  bucket: string;
  total: number;
  mentioned: number;
  actualRate: number | null;
}

interface EdgeBucket {
  bucket: string;
  trades: number;
  totalPnlCents: number;
  avgPnlCents: number;
}

export default function AnalyticsPage() {
  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [eventPerformance, setEventPerformance] = useState<EventPerf[]>([]);
  const [calibrationData, setCalibrationData] = useState<CalibrationBucket[]>([]);
  const [edgeAnalysis, setEdgeAnalysis] = useState<EdgeBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/analytics/performance");
        if (res.ok) {
          const data = await res.json();
          setOverall(data.overall);
          setEventPerformance(data.eventPerformance);
          setCalibrationData(data.calibrationData);
          setEdgeAnalysis(data.edgeAnalysis);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Performance Analytics</h1>

      {/* Overall Stats */}
      {overall && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Trades", value: overall.totalTrades },
            { label: "Wins", value: overall.wins },
            { label: "Losses", value: overall.losses },
            {
              label: "Win Rate",
              value: `${Math.round(overall.winRate * 100)}%`,
            },
            {
              label: "Total P&L",
              value: `$${overall.totalPnlDollars}`,
              color:
                overall.totalPnlCents >= 0 ? "text-green-400" : "text-red-400",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4"
            >
              <p className="text-sm text-zinc-400">{stat.label}</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  "color" in stat && stat.color ? stat.color : "text-white"
                }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {overall && overall.totalTrades === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No completed trades yet. Log trades from the research dashboard to see
          analytics.
        </div>
      )}

      {/* Per-Event Performance */}
      {eventPerformance.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Per-Event Performance
          </h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Event
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Trades
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    W/L
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Win Rate
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    P&L
                  </th>
                </tr>
              </thead>
              <tbody>
                {eventPerformance.map((ep) => (
                  <tr
                    key={ep.eventId}
                    className="border-b border-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-white">{ep.title}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {ep.eventDate
                        ? new Date(ep.eventDate).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {ep.totalTrades}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {ep.wins}/{ep.losses}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {ep.totalTrades > 0
                        ? `${Math.round(ep.winRate * 100)}%`
                        : "-"}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono ${
                        ep.pnlCents >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      ${(ep.pnlCents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calibration Data */}
      {calibrationData.some((b) => b.total > 0) && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Calibration (Agent Probability vs Actual)
          </h2>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <div className="grid grid-cols-10 gap-1 h-48 items-end">
              {calibrationData.map((bucket) => {
                const height = bucket.actualRate
                  ? `${bucket.actualRate * 100}%`
                  : "0%";
                const midpoint = parseInt(bucket.bucket) / 100 + 0.05;

                return (
                  <div
                    key={bucket.bucket}
                    className="flex flex-col items-center"
                  >
                    <div className="w-full flex flex-col items-center justify-end h-40">
                      {/* Expected (diagonal reference) */}
                      <div
                        className="w-full bg-zinc-700/30 rounded-t relative"
                        style={{ height: `${midpoint * 100}%` }}
                      >
                        {/* Actual */}
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-blue-500/60 rounded-t"
                          style={{ height }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-1">
                      {bucket.bucket.split("-")[0]}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      n={bucket.total}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-zinc-700/30 rounded" />
                <span>Expected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500/60 rounded" />
                <span>Actual</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edge Analysis */}
      {edgeAnalysis.some((b) => b.trades > 0) && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Edge vs P&L
          </h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Edge Bucket
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Trades
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Total P&L
                  </th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Avg P&L
                  </th>
                </tr>
              </thead>
              <tbody>
                {edgeAnalysis.map((ea) => (
                  <tr
                    key={ea.bucket}
                    className="border-b border-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-zinc-300 font-mono">
                      {ea.bucket}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{ea.trades}</td>
                    <td
                      className={`px-4 py-3 font-mono ${
                        ea.totalPnlCents >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      ${(ea.totalPnlCents / 100).toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono ${
                        ea.avgPnlCents >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      ${(ea.avgPnlCents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
