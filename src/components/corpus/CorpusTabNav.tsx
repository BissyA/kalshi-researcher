export type CorpusTab = "mentions" | "transcripts" | "markets" | "quick";

interface CorpusTabNavProps {
  activeTab: CorpusTab;
  onTabChange: (tab: CorpusTab) => void;
  mentionCount: number;
  transcriptCount: number;
  seriesCount: number;
}

export function CorpusTabNav({
  activeTab,
  onTabChange,
  mentionCount,
  transcriptCount,
  seriesCount,
}: CorpusTabNavProps) {
  const tabs: { id: CorpusTab; label: string; count: number }[] = [
    { id: "mentions", label: "Mention History", count: mentionCount },
    { id: "transcripts", label: "Transcript Library", count: transcriptCount },
    { id: "markets", label: "Kalshi Markets", count: seriesCount },
    { id: "quick", label: "Quick Analysis", count: 0 },
  ];

  return (
    <div className="flex gap-1 border-b border-zinc-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === tab.id
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1.5 text-xs text-zinc-500">({tab.count})</span>
          )}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
