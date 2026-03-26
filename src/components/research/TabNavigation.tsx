import type { TabId } from "@/types/components";

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tradeCount: number;
  sourceCount: number;
}

const tabs: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "research", label: "Research", icon: "📋" },
  { id: "briefing", label: "Briefing", icon: "📝" },
  { id: "sources", label: "Sources", icon: "📎" },
  { id: "tradelog", label: "Trade Log", icon: "📊" },
];

export function TabNavigation({
  activeTab,
  onTabChange,
  tradeCount,
  sourceCount,
}: TabNavigationProps) {
  return (
    <div className="border-b border-zinc-800">
      <div className="flex gap-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const badge =
            tab.id === "tradelog" && tradeCount > 0
              ? tradeCount
              : tab.id === "sources" && sourceCount > 0
                ? sourceCount
                : null;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                isActive
                  ? "text-white border-b-2 border-blue-500 bg-zinc-900/50"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
              {badge != null && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
