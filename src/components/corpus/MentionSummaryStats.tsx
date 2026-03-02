interface MentionSummaryStatsProps {
  totalWords: number;
  totalSettledEvents: number;
  avgMentionRate: number;
  topWord: string | null;
}

export function MentionSummaryStats({
  totalWords,
  totalSettledEvents,
  avgMentionRate,
  topWord,
}: MentionSummaryStatsProps) {
  const stats = [
    { label: "Words Tracked", value: totalWords },
    { label: "Settled Events", value: totalSettledEvents },
    {
      label: "Avg Mention Rate",
      value: `${(avgMentionRate * 100).toFixed(1)}%`,
    },
    { label: "Top Word", value: topWord ?? "-" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4"
        >
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            {stat.label}
          </p>
          <p className="text-xl font-semibold text-white mt-1">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
