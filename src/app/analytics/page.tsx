"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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
  totalCostCents: number | null;
  result: string | null;
  pnlCents: number;
  agentEdge: number | null;
  agentProbability: number | null;
  historicalRate: number | null;
  mentionYes: number | null;
  mentionTotal: number | null;
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

type ViewTab = "overview" | "calendar";

// ── Helpers ──

function dollars(cents: number): string {
  const sign = cents >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(cents / 100).toFixed(2)}`;
}

function pnlColor(cents: number): string {
  return cents >= 0 ? "text-emerald-400" : "text-red-400";
}

function pnlBg(cents: number): string {
  if (cents > 0) return "bg-emerald-500/10 border-emerald-500/20";
  if (cents < 0) return "bg-red-500/10 border-red-500/20";
  return "";
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
}

export default function AnalyticsPage() {
  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [eventPerformance, setEventPerformance] = useState<EventPerf[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>("overview");
  const [strategy, setStrategy] = useState<"v2" | "v1">("v2");

  // Calendar month navigation
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`/api/analytics/performance?strategy=${strategy}`);
        if (res.ok) {
          const data = await res.json();
          setOverall(data.overall);
          setEventPerformance(data.eventPerformance);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [strategy]);

  // Build cumulative P&L data from eventPerformance (sorted by date)
  const cumulativePnl = useMemo(() => {
    // Group P&L by event date
    const dailyMap = new Map<string, number>();
    for (const ep of eventPerformance) {
      if (!ep.eventDate || ep.pnlCents === 0 && ep.trades.every(t => t.result === null)) continue;
      const date = ep.eventDate.split("T")[0];
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + ep.pnlCents);
    }

    const sorted = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let cumulative = 0;
    return sorted.map(([date, dailyCents]) => {
      cumulative += dailyCents;
      return { date, dailyCents, cumulativeCents: cumulative };
    });
  }, [eventPerformance]);

  // Build daily P&L map for calendar (by event date, using trade count)
  const dailyPnlMap = useMemo(() => {
    const map = new Map<string, { pnlCents: number; tradeCount: number }>();
    for (const ep of eventPerformance) {
      if (!ep.eventDate) continue;
      const date = ep.eventDate.split("T")[0];
      const existing = map.get(date) ?? { pnlCents: 0, tradeCount: 0 };
      existing.pnlCents += ep.pnlCents;
      existing.tradeCount += ep.totalTrades;
      map.set(date, existing);
    }
    return map;
  }, [eventPerformance]);

  // Monthly stats for calendar header
  const monthlyStats = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    let pnl = 0;
    let trades = 0;
    let tradingDays = 0;
    let winDays = 0;
    for (const [date, data] of dailyPnlMap) {
      if (date.startsWith(prefix)) {
        pnl += data.pnlCents;
        trades += data.tradeCount;
        tradingDays++;
        if (data.pnlCents > 0) winDays++;
      }
    }
    return { pnl, trades, tradingDays, winRate: tradingDays > 0 ? Math.round((winDays / tradingDays) * 100) : 0 };
  }, [dailyPnlMap, calYear, calMonth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Performance Analytics</h1>
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setStrategy("v2")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${strategy === "v2" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"}`}
          >
            V2 (Current)
          </button>
          <button
            onClick={() => setStrategy("v1")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${strategy === "v1" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"}`}
          >
            V1 (Legacy)
          </button>
        </div>
      </div>

      {/* Overall Stats */}
      {overall && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {[
            { label: "Total Trades", value: overall.totalTrades },
            { label: "Total Cost", value: `$${(eventPerformance.reduce((s, ep) => s + ep.trades.reduce((s2, t) => s2 + (t.totalCostCents ?? 0), 0), 0) / 100).toFixed(2)}` },
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
            {
              label: "EV",
              value: overall.totalTrades > 0
                ? `$${(overall.totalPnlCents / 100 / overall.totalTrades).toFixed(2)}`
                : "$0.00",
              color:
                overall.totalPnlCents >= 0 ? "text-green-400" : "text-red-400",
            },
            {
              label: "ROI",
              value: (() => {
                const totalCost = eventPerformance.reduce((s, ep) => s + ep.trades.reduce((s2, t) => s2 + (t.totalCostCents ?? 0), 0), 0);
                return totalCost > 0 ? `${((overall.totalPnlCents / totalCost) * 100).toFixed(1)}%` : "-";
              })(),
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

      {/* View Toggle */}
      {overall && overall.totalTrades > 0 && (
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit">
          {(["overview", "calendar"] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setViewTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                viewTab === tab
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab === "overview" ? "Overview" : "Calendar"}
            </button>
          ))}
        </div>
      )}

      {/* ── Overview: P&L Chart ── */}
      {viewTab === "overview" && cumulativePnl.length > 0 && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">Profit Over Time</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={cumulativePnl}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(d: string) => {
                  const dt = new Date(d + "T00:00:00");
                  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                }}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value: unknown, name: unknown) => [
                  `$${(Number(value) / 100).toFixed(2)}`,
                  String(name) === "cumulativeCents" ? "Cumulative P&L" : "Daily P&L",
                ]}
                labelFormatter={(d: unknown) => {
                  const dt = new Date(String(d) + "T00:00:00");
                  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                }}
              />
              <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="cumulativeCents"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                name="cumulativeCents"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Calendar View ── */}
      {viewTab === "calendar" && (
        <div className="space-y-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                else setCalMonth(calMonth - 1);
              }}
              className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center text-lg"
            >
              &lt;
            </button>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white">{formatMonth(calYear, calMonth)}</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Monthly P&L:{" "}
                <span className={pnlColor(monthlyStats.pnl)}>{dollars(monthlyStats.pnl)}</span>
                {monthlyStats.tradingDays > 0 && (
                  <>
                    {" "}&middot; {monthlyStats.tradingDays} trading day{monthlyStats.tradingDays !== 1 ? "s" : ""}
                    {" "}&middot; Win rate: {monthlyStats.winRate}%
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                else setCalMonth(calMonth + 1);
              }}
              className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center text-lg"
            >
              &gt;
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-[repeat(7,1fr)_auto] bg-zinc-900 border-b border-zinc-800">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                <div key={day} className="px-2 py-3 text-center text-xs font-medium text-zinc-500">
                  {day}
                </div>
              ))}
              <div className="w-20 px-2 py-3 text-center text-xs font-medium text-zinc-500">
                WEEK
              </div>
            </div>

            {/* Day cells — chunked into weeks */}
            {(() => {
              const allDays = getCalendarDays(calYear, calMonth);
              const weeks: (number | null)[][] = [];
              for (let i = 0; i < allDays.length; i += 7) {
                weeks.push(allDays.slice(i, i + 7));
              }

              const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

              return weeks.map((week, wi) => {
                let weekPnl = 0;
                let weekHasTrades = false;

                for (const day of week) {
                  if (day === null) continue;
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayData = dailyPnlMap.get(dateStr);
                  if (dayData) {
                    weekPnl += dayData.pnlCents;
                    weekHasTrades = true;
                  }
                }

                return (
                  <div key={`week-${wi}`} className="grid grid-cols-[repeat(7,1fr)_auto]">
                    {week.map((day, di) => {
                      if (day === null) {
                        return <div key={`empty-${wi}-${di}`} className="border-b border-r border-zinc-800/50 h-24 bg-zinc-950/50" />;
                      }

                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const dayData = dailyPnlMap.get(dateStr);
                      const isToday = dateStr === today;

                      return (
                        <div
                          key={dateStr}
                          className={`border-b border-r border-zinc-800/50 h-24 p-2 relative ${
                            dayData ? pnlBg(dayData.pnlCents) : ""
                          } ${isToday ? "ring-1 ring-purple-500/50" : ""}`}
                        >
                          <span className={`text-xs ${isToday ? "text-purple-400 font-bold" : "text-zinc-500"}`}>
                            {day}
                          </span>
                          {dayData && (
                            <div className="mt-2">
                              <div className={`text-sm font-semibold ${pnlColor(dayData.pnlCents)}`}>
                                {dollars(dayData.pnlCents)}
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5">
                                {dayData.tradeCount} trade{dayData.tradeCount !== 1 ? "s" : ""}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Weekly summary cell */}
                    <div className="w-20 border-b border-zinc-800/50 h-24 flex items-center justify-center">
                      {weekHasTrades && (
                        <span className={`text-sm font-semibold ${pnlColor(weekPnl)}`}>
                          {dollars(weekPnl)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
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
                    Cost
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
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    ROI
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
                        <td className="px-4 py-3 text-zinc-400 font-mono">
                          {(() => {
                            const totalCost = ep.trades.reduce((s, t) => s + (t.totalCostCents ?? 0), 0);
                            return `$${(totalCost / 100).toFixed(2)}`;
                          })()}
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
                        <td
                          className={`px-4 py-3 font-mono ${
                            ep.pnlCents >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {(() => {
                            const totalCost = ep.trades.reduce((s, t) => s + (t.totalCostCents ?? 0), 0);
                            return totalCost > 0
                              ? `${((ep.pnlCents / totalCost) * 100).toFixed(1)}%`
                              : "-";
                          })()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="p-0">
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
                                      Cost
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                      Mention Rate
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
                                        {t.totalCostCents != null
                                          ? `${(t.totalCostCents / 100).toFixed(2)}`
                                          : "-"}
                                      </td>
                                      <td className="px-3 py-2 text-zinc-400 font-mono">
                                        {t.historicalRate != null
                                          ? `${Math.round(t.historicalRate * 100)}%${t.mentionTotal != null ? ` (${t.mentionYes}/${t.mentionTotal})` : ""}`
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

    </div>
  );
}
