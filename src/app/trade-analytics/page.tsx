"use client";

import React, { useState, useEffect } from "react";

interface TradeDetail {
  eventTitle: string;
  eventDate: string | null;
  entry: number;
  side: string;
  result: string;
  pnlCents: number;
}

interface WordRow {
  word: string;
  speakerName: string;
  side: string;
  trades: number;
  avgEntry: number;
  mentionRate: number | null;
  mentionYes: number | null;
  mentionTotal: number | null;
  winRate: number;
  wins: number;
  losses: number;
  pnlCents: number;
  entries: number[];
  tradeDetails: TradeDetail[];
}

interface SpeakerSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlCents: number;
  totalPnlDollars: string;
  ev: string;
}

interface SpeakerData {
  speakerId: string;
  speakerName: string;
  summary: SpeakerSummary;
  words: WordRow[];
}

export default function TradeAnalyticsPage() {
  const [speakers, setSpeakers] = useState<SpeakerData[]>([]);
  const [allData, setAllData] = useState<SpeakerData | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("all");
  const [expandedWords, setExpandedWords] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/analytics/trade-analytics");
        if (res.ok) {
          const data = await res.json();
          setSpeakers(data.speakers);
          setAllData(data.all);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400">Loading trade analytics...</div>
      </div>
    );
  }

  const currentData =
    selectedSpeaker === "all"
      ? allData
      : speakers.find((s) => s.speakerId === selectedSpeaker) ?? null;

  if (!currentData || currentData.summary.totalTrades === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Trade Analytics</h1>
          <SpeakerSelect
            speakers={speakers}
            selected={selectedSpeaker}
            onChange={setSelectedSpeaker}
          />
        </div>
        <div className="text-center py-12 text-zinc-500">
          No resolved trades yet. Log and resolve trades to see analytics.
        </div>
      </div>
    );
  }

  const { summary, words } = currentData;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Trade Analytics</h1>
        <SpeakerSelect
          speakers={speakers}
          selected={selectedSpeaker}
          onChange={setSelectedSpeaker}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Total Trades", value: summary.totalTrades },
          { label: "Wins", value: summary.wins },
          { label: "Losses", value: summary.losses },
          {
            label: "Win Rate",
            value: `${Math.round(summary.winRate * 100)}%`,
          },
          {
            label: "Total P&L",
            value: `$${summary.totalPnlDollars}`,
            color:
              summary.totalPnlCents >= 0 ? "text-green-400" : "text-red-400",
          },
          {
            label: "EV",
            value: `$${summary.ev}`,
            color:
              parseFloat(summary.ev) >= 0 ? "text-green-400" : "text-red-400",
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

      {/* Word Performance Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Per-Word Performance
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search words..."
          className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  Word
                </th>
                {selectedSpeaker === "all" && (
                  <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                    Speaker
                  </th>
                )}
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  Side
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  # Trades
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  Avg Entry
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  Mention Rate
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  Win Rate
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  P&L
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                  EV
                </th>
              </tr>
            </thead>
            <tbody>
              {words.filter((w) => !search.trim() || w.word.toLowerCase().includes(search.trim().toLowerCase())).map((w, idx) => {
                const rowKey = `${w.speakerName}|${w.word}|${idx}`;
                const isExpanded = expandedWords.has(rowKey);
                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className="border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                      onClick={() => {
                        setExpandedWords((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowKey)) next.delete(rowKey);
                          else next.add(rowKey);
                          return next;
                        });
                      }}
                    >
                      <td className="px-2 py-3 text-zinc-500 text-center">
                        <span
                          className="inline-block transition-transform duration-200"
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        >
                          &#9654;
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {w.word}
                      </td>
                      {selectedSpeaker === "all" && (
                        <td className="px-4 py-3 text-zinc-400">{w.speakerName}</td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            w.side === "yes"
                              ? "bg-green-900/40 text-green-400"
                              : w.side === "no"
                                ? "bg-red-900/40 text-red-400"
                                : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {w.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{w.trades}</td>
                      <td className="px-4 py-3 text-zinc-400 font-mono">
                        <span className="relative group cursor-help border-b border-dashed border-zinc-600">
                          {Math.round(w.avgEntry * 100)}¢
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 whitespace-nowrap shadow-lg">
                            {w.entries.map((e, i) => (
                              <span key={i}>
                                {i > 0 && <span className="text-zinc-500">, </span>}
                                {Math.round(e * 100)}¢
                              </span>
                            ))}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-mono whitespace-nowrap">
                        {w.mentionRate != null
                          ? <><span className="inline-block w-10 text-right">{Math.round(w.mentionRate * 100)}%</span>{" "}<span className="text-zinc-500">({w.mentionYes}/{w.mentionTotal})</span></>
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-mono whitespace-nowrap">
                        <span className="inline-block w-10 text-right">{Math.round(w.winRate * 100)}%</span>
                        {" "}
                        <span className="text-zinc-500">
                          ({w.wins}W / {w.losses}L)
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 font-mono ${
                          w.pnlCents >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        ${(w.pnlCents / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {w.mentionRate != null && w.side !== "mixed"
                          ? (() => {
                              const trueProb = w.side === "yes" ? w.mentionRate : 1 - w.mentionRate;
                              const isPositive = w.avgEntry < trueProb;
                              return (
                                <span className={isPositive ? "text-green-400" : "text-red-400"}>
                                  {isPositive ? "+EV" : "-EV"}
                                </span>
                              );
                            })()
                          : "-"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={selectedSpeaker === "all" ? 10 : 9} className="p-0">
                          <div className="bg-zinc-950 border-t border-zinc-800/50 px-8 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-zinc-500">
                                  <th className="px-3 py-2 text-left font-medium">Event</th>
                                  <th className="px-3 py-2 text-left font-medium">Side</th>
                                  <th className="px-3 py-2 text-left font-medium">Date</th>
                                  <th className="px-3 py-2 text-left font-medium">Entry</th>
                                  <th className="px-3 py-2 text-left font-medium">Result</th>
                                  <th className="px-3 py-2 text-left font-medium">P&L</th>
                                </tr>
                              </thead>
                              <tbody>
                                {w.tradeDetails.map((td, i) => (
                                  <tr key={i} className="border-t border-zinc-800/30">
                                    <td className="px-3 py-2 text-zinc-300">{td.eventTitle}</td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                          td.side === "yes"
                                            ? "bg-green-900/40 text-green-400"
                                            : "bg-red-900/40 text-red-400"
                                        }`}
                                      >
                                        {td.side}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-zinc-400">
                                      {td.eventDate
                                        ? new Date(td.eventDate).toLocaleDateString()
                                        : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-zinc-400 font-mono">
                                      {Math.round(td.entry * 100)}¢
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={
                                          td.result === "win"
                                            ? "text-green-400"
                                            : "text-red-400"
                                        }
                                      >
                                        {td.result === "win" ? "W" : "L"}
                                      </span>
                                    </td>
                                    <td
                                      className={`px-3 py-2 font-mono ${
                                        td.pnlCents >= 0 ? "text-green-400" : "text-red-400"
                                      }`}
                                    >
                                      ${(td.pnlCents / 100).toFixed(2)}
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
    </div>
  );
}

function SpeakerSelect({
  speakers,
  selected,
  onChange,
}: {
  speakers: SpeakerData[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="all">All Speakers</option>
      {speakers.map((s) => (
        <option key={s.speakerId} value={s.speakerId}>
          {s.speakerName}
        </option>
      ))}
    </select>
  );
}
