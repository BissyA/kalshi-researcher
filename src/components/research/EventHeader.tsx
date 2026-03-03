import type { Event } from "@/types/components";
import type { WsStatus } from "@/hooks/useLivePrices";

function statusDot(status: WsStatus) {
  switch (status) {
    case "connected":
      return "bg-green-400";
    case "connecting":
      return "bg-yellow-400 animate-pulse";
    case "disconnected":
      return "bg-zinc-600";
    default:
      return "bg-zinc-600";
  }
}

interface EventHeaderProps {
  event: Event;
  hasBaseline: boolean;
  hasCurrent: boolean;
  researchRunning: boolean;
  wsStatus: WsStatus;
  lastPriceUpdate: number | null;
  hasMarketTickers: boolean;
  speakers: Array<{ id: string; name: string }>;
  selectedSpeakerId: string;
  onSpeakerChange: (speakerId: string) => void;
  onTriggerResearch: (layer: "baseline" | "current") => void;
}

export function EventHeader({
  event,
  hasBaseline,
  hasCurrent,
  researchRunning,
  wsStatus,
  lastPriceUpdate,
  hasMarketTickers,
  speakers,
  selectedSpeakerId,
  onSpeakerChange,
  onTriggerResearch,
}: EventHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white">{event.title}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
          <span>{event.speaker}</span>
          <span>
            {event.event_date
              ? new Date(event.event_date).toLocaleDateString()
              : "Date TBD"}
          </span>
          {event.estimated_duration_minutes && (
            <span>~{event.estimated_duration_minutes} min</span>
          )}
          {hasMarketTickers && (
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusDot(wsStatus)}`} />
              <span className="text-xs">
                {wsStatus === "connected"
                  ? "Live"
                  : wsStatus === "connecting"
                    ? "Connecting..."
                    : "Offline"}
              </span>
              {lastPriceUpdate && (
                <span className="text-xs text-zinc-600">
                  {new Date(lastPriceUpdate).toLocaleTimeString()}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <select
          value={selectedSpeakerId}
          onChange={(e) => onSpeakerChange(e.target.value)}
          disabled={researchRunning}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
        >
          <option value="">No speaker (corpus)</option>
          {speakers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          {hasBaseline && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-900/50 text-green-400">
              Baseline
            </span>
          )}
          {hasCurrent && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-900/50 text-blue-400">
              Current
            </span>
          )}
        </div>
        <button
          onClick={() => onTriggerResearch(hasBaseline ? "current" : "baseline")}
          disabled={researchRunning}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {researchRunning
            ? "Running..."
            : hasBaseline
              ? "Update Research"
              : "Start Research"}
        </button>
      </div>
    </div>
  );
}
