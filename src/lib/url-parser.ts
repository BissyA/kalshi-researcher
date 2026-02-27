/**
 * Extract a Kalshi event ticker from a URL or raw ticker string.
 *
 * Supported formats:
 *   - "KXTRUMPMENTION-27FEB26"                (raw ticker)
 *   - "https://kalshi.com/events/KXTRUMPMENTION-27FEB26"
 *   - "https://kalshi.com/events/KXTRUMPMENTION-27FEB26/markets/KXTRUMPMENTION-27FEB26-ECON"
 */
export function extractEventTicker(input: string): string {
  const trimmed = input.trim();

  // If it looks like a URL, pull the event ticker from the path
  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/").filter(Boolean);
      // /events/TICKER or /events/TICKER/markets/...
      const eventsIdx = segments.indexOf("events");
      if (eventsIdx !== -1 && segments[eventsIdx + 1]) {
        return segments[eventsIdx + 1];
      }
    } catch {
      // fall through to raw string handling
    }
  }

  // Otherwise treat the whole string as a ticker (strip whitespace)
  return trimmed;
}

/**
 * Infer speaker name from a Kalshi event title.
 * e.g. "Trump Address to Congress Mention Market" → "Donald Trump"
 */
export function inferSpeaker(eventTitle: string): string {
  const lower = eventTitle.toLowerCase();
  if (lower.includes("trump")) return "Donald Trump";
  if (lower.includes("vance")) return "JD Vance";
  if (lower.includes("biden")) return "Joe Biden";
  if (lower.includes("harris")) return "Kamala Harris";
  return "";
}

/**
 * Infer event type from title.
 */
export function inferEventType(eventTitle: string): string {
  const lower = eventTitle.toLowerCase();
  if (lower.includes("address to congress") || lower.includes("joint session") || lower.includes("state of the union"))
    return "address_to_congress";
  if (lower.includes("press conference")) return "press_conference";
  if (lower.includes("interview")) return "interview";
  if (lower.includes("rally")) return "rally";
  if (lower.includes("debate")) return "debate";
  if (lower.includes("inaugur")) return "inauguration";
  return "speech";
}

/**
 * Extract word display name from market data.
 */
export function extractWord(
  marketTicker: string,
  eventTicker: string,
  yesSubTitle: string
): string {
  if (yesSubTitle) return yesSubTitle;

  const prefix = eventTicker + "-";
  if (marketTicker.startsWith(prefix)) {
    const word = marketTicker.slice(prefix.length);
    if (word) return word;
  }

  const parts = marketTicker.split("-");
  return parts[parts.length - 1];
}
