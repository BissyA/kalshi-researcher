export function edgeColor(edge: number): string {
  if (edge > 0.15) return "text-green-400";
  if (edge > 0.05) return "text-green-300";
  if (edge > 0) return "text-green-200";
  if (edge > -0.05) return "text-red-200";
  if (edge > -0.15) return "text-red-300";
  return "text-red-400";
}

export function confBadge(conf: string): string {
  switch (conf) {
    case "high":
      return "bg-green-900/50 text-green-400";
    case "medium":
      return "bg-yellow-900/50 text-yellow-400";
    case "low":
      return "bg-zinc-800 text-zinc-400";
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}

export function correlationBadge(level: string): { color: string; label: string } {
  switch (level) {
    case "high":
      return { color: "bg-green-900/50 text-green-400 border-green-800", label: "High Corr" };
    case "medium":
      return { color: "bg-yellow-900/50 text-yellow-400 border-yellow-800", label: "Med Corr" };
    case "low":
      return { color: "bg-zinc-800 text-zinc-400 border-zinc-700", label: "Low Corr" };
    default:
      return { color: "bg-zinc-800 text-zinc-400 border-zinc-700", label: level };
  }
}
