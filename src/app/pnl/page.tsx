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

// ── Types ──

interface Summary {
  totalTrades: number;
  totalPnlCents: number;
  totalFeesCents: number;
  totalPnlAfterFeesCents: number;
  totalFills: number;
}

interface CumulativePnlPoint {
  date: string;
  cumulativeCents: number;
  dailyCents: number;
}

interface DailyPnl {
  date: string;
  pnlCents: number;
  feesCents: number;
  pnlAfterFeesCents: number;
  tradeCount: number;
}

interface ProcessedTrade {
  ticker: string;
  side: "yes" | "no";
  quantity: number;
  entryPriceCents: number;
  exitPriceCents: number;
  feeCents: number;
  pnlCents: number;
  pnlAfterFeesCents: number;
  openTimestamp: string;
  closeTimestamp: string;
}

interface EventGroup {
  eventTicker: string;
  trades: ProcessedTrade[];
  pnlCents: number;
  feesCents: number;
  pnlAfterFeesCents: number;
  firstDate: string;
  lastDate: string;
}

type TabId = "overview" | "calendar";

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

// ── Calendar helpers ──

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

// ── Main Page ──

export default function PnlPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cumulativePnl, setCumulativePnl] = useState<CumulativePnlPoint[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [events, setEvents] = useState<EventGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Calendar month navigation
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  async function fetchPnl(bustCache = false) {
    try {
      const url = bustCache ? "/api/pnl?refresh=1" : "/api/pnl";
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch P&L data");
      }
      const data = await res.json();
      setSummary(data.summary);
      setCumulativePnl(data.cumulativePnl ?? []);
      setDailyPnl(data.dailyPnl ?? []);
      setEvents(data.events ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchPnl();
  }, []);

  // Build daily P&L map for calendar
  const dailyPnlMap = useMemo(() => {
    const map = new Map<string, DailyPnl>();
    for (const d of dailyPnl) map.set(d.date, d);
    return map;
  }, [dailyPnl]);

  // Monthly stats for calendar header
  const monthlyStats = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    let pnl = 0;
    let trades = 0;
    let tradingDays = 0;
    let winDays = 0;
    for (const d of dailyPnl) {
      if (d.date.startsWith(prefix)) {
        pnl += d.pnlAfterFeesCents;
        trades += d.tradeCount;
        tradingDays++;
        if (d.pnlAfterFeesCents > 0) winDays++;
      }
    }
    return { pnl, trades, tradingDays, winRate: tradingDays > 0 ? Math.round((winDays / tradingDays) * 100) : 0 };
  }, [dailyPnl, calYear, calMonth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400">Loading P&L data from Kalshi...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">P&L</h1>
        <button
          onClick={() => { setRefreshing(true); fetchPnl(true); }}
          disabled={refreshing}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit">
        {(["overview", "calendar"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab === "overview" ? "Overview" : "Calendar"}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && summary && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Total Trades</p>
              <p className="text-2xl font-bold text-white mt-1">{summary.totalTrades}</p>
            </div>
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Total Profit</p>
              <p className={`text-2xl font-bold mt-1 ${pnlColor(summary.totalPnlCents)}`}>
                {dollars(summary.totalPnlCents)}
              </p>
            </div>
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Total Fees</p>
              <p className="text-2xl font-bold text-orange-400 mt-1">
                ${(summary.totalFeesCents / 100).toFixed(2)}
              </p>
            </div>
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Profit After Fees</p>
              <p className={`text-2xl font-bold mt-1 ${pnlColor(summary.totalPnlAfterFeesCents)}`}>
                {dollars(summary.totalPnlAfterFeesCents)}
              </p>
            </div>
          </div>

          {/* P&L Chart */}
          {cumulativePnl.length > 0 && (
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

        </div>
      )}

      {/* ── Calendar Tab ── */}

      {activeTab === "calendar" && (
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
            <div className="grid grid-cols-7 bg-zinc-900 border-b border-zinc-800">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                <div key={day} className="px-2 py-3 text-center text-xs font-medium text-zinc-500">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {getCalendarDays(calYear, calMonth).map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="border-b border-r border-zinc-800/50 h-24 bg-zinc-950/50" />;
                }

                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayData = dailyPnlMap.get(dateStr);
                const isToday = dateStr === now.toISOString().slice(0, 10);

                return (
                  <div
                    key={dateStr}
                    className={`border-b border-r border-zinc-800/50 h-24 p-2 relative ${
                      dayData ? pnlBg(dayData.pnlAfterFeesCents) : ""
                    } ${isToday ? "ring-1 ring-purple-500/50" : ""}`}
                  >
                    <span className={`text-xs ${isToday ? "text-purple-400 font-bold" : "text-zinc-500"}`}>
                      {day}
                    </span>
                    {dayData && (
                      <div className="mt-2">
                        <div className={`text-sm font-semibold ${pnlColor(dayData.pnlAfterFeesCents)}`}>
                          {dollars(dayData.pnlAfterFeesCents)}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {dayData.tradeCount} trade{dayData.tradeCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Per-Event Table (always visible) ── */}
      {events.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">Per-Event Performance</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">Event</th>
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">Date</th>
                  <th className="px-4 py-3 text-right text-zinc-400 font-medium">Trades</th>
                  <th className="px-4 py-3 text-right text-zinc-400 font-medium">P&L</th>
                  <th className="px-4 py-3 text-right text-zinc-400 font-medium">Fees</th>
                  <th className="px-4 py-3 text-right text-zinc-400 font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const isExpanded = expandedEvents.has(ev.eventTicker);
                      return (
                        <React.Fragment key={ev.eventTicker}>
                          <tr
                            className="border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                            onClick={() => {
                              setExpandedEvents((prev) => {
                                const next = new Set(prev);
                                if (next.has(ev.eventTicker)) next.delete(ev.eventTicker);
                                else next.add(ev.eventTicker);
                                return next;
                              });
                            }}
                          >
                            <td className="px-2 py-3 text-zinc-500 text-center">
                              <span
                                className="inline-block transition-transform duration-200"
                                style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                              >
                                &#9654;
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white font-mono text-xs">{ev.eventTicker}</td>
                            <td className="px-4 py-3 text-zinc-400">
                              {new Date(ev.lastDate).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-zinc-400 text-right">{ev.trades.length}</td>
                            <td className={`px-4 py-3 text-right font-mono ${pnlColor(ev.pnlCents)}`}>
                              {dollars(ev.pnlCents)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-orange-400">
                              ${(ev.feesCents / 100).toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-semibold ${pnlColor(ev.pnlAfterFeesCents)}`}>
                              {dollars(ev.pnlAfterFeesCents)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="p-0">
                                <div className="bg-zinc-950 border-t border-zinc-800/50 px-8 py-3">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-zinc-500">
                                        <th className="px-3 py-2 text-left font-medium">Ticker</th>
                                        <th className="px-3 py-2 text-left font-medium">Side</th>
                                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                                        <th className="px-3 py-2 text-right font-medium">Entry</th>
                                        <th className="px-3 py-2 text-right font-medium">Exit</th>
                                        <th className="px-3 py-2 text-right font-medium">P&L</th>
                                        <th className="px-3 py-2 text-right font-medium">Fees</th>
                                        <th className="px-3 py-2 text-right font-medium">Net</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ev.trades.map((t, i) => (
                                        <tr key={i} className="border-t border-zinc-800/30">
                                          <td className="px-3 py-2 text-zinc-300 font-mono">{t.ticker}</td>
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
                                          <td className="px-3 py-2 text-zinc-400 text-right">{t.quantity}</td>
                                          <td className="px-3 py-2 text-zinc-400 text-right font-mono">
                                            {t.entryPriceCents}c
                                          </td>
                                          <td className="px-3 py-2 text-zinc-400 text-right font-mono">
                                            {t.exitPriceCents}c
                                          </td>
                                          <td className={`px-3 py-2 text-right font-mono ${pnlColor(t.pnlCents)}`}>
                                            {dollars(t.pnlCents)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono text-orange-400">
                                            ${(t.feeCents / 100).toFixed(2)}
                                          </td>
                                          <td className={`px-3 py-2 text-right font-mono ${pnlColor(t.pnlAfterFeesCents)}`}>
                                            {dollars(t.pnlAfterFeesCents)}
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
