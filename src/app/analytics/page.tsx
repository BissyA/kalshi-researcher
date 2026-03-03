"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

interface OverallStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlCents: number;
  totalPnlDollars: string;
}

interface TradeDetail {
  word: string;
  side: string;
  entryPrice: number;
  contracts: number;
  result: string | null;
  pnlCents: number;
  agentEdge: number | null;
  agentProbability: number | null;
  historicalRate: number | null;
  historicalEdge: number | null;
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
  trades: TradeDetail[];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-zinc-300 font-medium mb-1">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [eventPerformance, setEventPerformance] = useState<EventPerf[]>([]);
  const [calibrationData, setCalibrationData] = useState<CalibrationBucket[]>(
    []
  );
  const [edgeAnalysis, setEdgeAnalysis] = useState<EdgeBucket[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
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

  // Transform calibration data for Recharts
  const calibrationChartData = calibrationData
    .filter((b) => b.total > 0)
    .map((bucket) => {
      const lower = parseInt(bucket.bucket) / 100;
      const midpoint = lower + 0.05;
      return {
        name: `${bucket.bucket}%`,
        expected: Math.round(midpoint * 100),
        actual: bucket.actualRate !== null ? Math.round(bucket.actualRate * 100) : 0,
        total: bucket.total,
      };
    });

  // Transform edge data for Recharts
  const edgeChartData = edgeAnalysis
    .filter((b) => b.trades > 0)
    .map((ea) => ({
      name: ea.bucket,
      avgPnl: ea.avgPnlCents / 100,
      trades: ea.trades,
      totalPnl: ea.totalPnlCents / 100,
    }));

  // Transform event performance for P&L over time chart
  const pnlTimeData = eventPerformance
    .filter((ep) => ep.totalTrades > 0)
    .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""))
    .map((ep) => ({
      name: ep.title.length > 20 ? ep.title.slice(0, 20) + "..." : ep.title,
      pnl: ep.pnlCents / 100,
      trades: ep.totalTrades,
    }));

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
                  <th className="w-8 px-2 py-3" />
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
                {eventPerformance.map((ep) => {
                  const isExpanded = expandedEvents.has(ep.eventId);
                  return (
                    <React.Fragment key={ep.eventId}>
                      <tr
                        className="border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                        onClick={() => {
                          setExpandedEvents((prev) => {
                            const next = new Set(prev);
                            if (next.has(ep.eventId)) next.delete(ep.eventId);
                            else next.add(ep.eventId);
                            return next;
                          });
                        }}
                      >
                        <td className="px-2 py-3 text-zinc-500 text-center">
                          <span
                            className="inline-block transition-transform duration-200"
                            style={{
                              transform: isExpanded
                                ? "rotate(90deg)"
                                : "rotate(0deg)",
                            }}
                          >
                            &#9654;
                          </span>
                        </td>
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
                            ep.pnlCents >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          ${(ep.pnlCents / 100).toFixed(2)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="bg-zinc-950 border-t border-zinc-800/50 px-8 py-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-zinc-500">
                                    <th className="px-3 py-2 text-left font-medium">
                                      Word
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Side
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Entry Price
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Contracts
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Mention Rate
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Edge
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Result
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      P&L
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ep.trades.map((t, i) => (
                                    <tr
                                      key={i}
                                      className="border-t border-zinc-800/30"
                                    >
                                      <td className="px-3 py-2 text-zinc-300">
                                        {t.word}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                            t.side === "yes"
                                              ? "bg-green-900/40 text-green-400"
                                              : "bg-red-900/40 text-red-400"
                                          }`}
                                        >
                                          {t.side}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-zinc-400 font-mono">
                                        {t.entryPrice.toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-zinc-400">
                                        {t.contracts}
                                      </td>
                                      <td className="px-3 py-2 text-zinc-400 font-mono">
                                        {t.historicalRate != null
                                          ? `${Math.round(t.historicalRate * 100)}%`
                                          : "-"}
                                      </td>
                                      <td
                                        className={`px-3 py-2 font-mono ${
                                          t.historicalEdge != null && t.historicalEdge >= 0
                                            ? "text-green-400"
                                            : t.historicalEdge != null
                                              ? "text-red-400"
                                              : "text-zinc-400"
                                        }`}
                                      >
                                        {t.historicalEdge != null
                                          ? `${t.historicalEdge >= 0 ? "+" : ""}${(t.historicalEdge * 100).toFixed(1)}%`
                                          : "-"}
                                      </td>
                                      <td className="px-3 py-2">
                                        {t.result ? (
                                          <span
                                            className={
                                              t.result === "win"
                                                ? "text-green-400"
                                                : "text-red-400"
                                            }
                                          >
                                            {t.result === "win" ? "W" : "L"}
                                          </span>
                                        ) : (
                                          <span className="text-zinc-600">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td
                                        className={`px-3 py-2 font-mono ${
                                          t.pnlCents >= 0
                                            ? "text-green-400"
                                            : "text-red-400"
                                        }`}
                                      >
                                        ${(t.pnlCents / 100).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calibration Chart */}
      {calibrationChartData.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Calibration (Agent Probability vs Actual)
          </h2>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={calibrationChartData}
                margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickLine={{ stroke: "#3f3f46" }}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickLine={{ stroke: "#3f3f46" }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<DarkTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
                  iconType="square"
                />
                <Bar
                  dataKey="expected"
                  name="Expected"
                  fill="#3f3f46"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="actual"
                  name="Actual"
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-1 text-[10px] text-zinc-600">
              {calibrationChartData.map((d) => (
                <span key={d.name}>n={d.total}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edge vs P&L Chart */}
      {edgeChartData.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Edge vs P&L</h2>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={edgeChartData}
                margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickLine={{ stroke: "#3f3f46" }}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickLine={{ stroke: "#3f3f46" }}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                />
                <Tooltip content={<DarkTooltip />} />
                <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
                <Bar dataKey="avgPnl" name="Avg P&L" radius={[2, 2, 0, 0]}>
                  {edgeChartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.avgPnl >= 0 ? "#4ade80" : "#f87171"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-1 text-[10px] text-zinc-600">
              {edgeChartData.map((d) => (
                <span key={d.name}>
                  {d.name}: {d.trades} trades
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* P&L Over Time */}
      {pnlTimeData.length >= 2 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">P&L by Event</h2>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={pnlTimeData}
                margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickLine={{ stroke: "#3f3f46" }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickLine={{ stroke: "#3f3f46" }}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                />
                <Tooltip content={<DarkTooltip />} />
                <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
                <Bar dataKey="pnl" name="P&L" radius={[2, 2, 0, 0]}>
                  {pnlTimeData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
