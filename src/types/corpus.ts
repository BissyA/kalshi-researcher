export interface MentionEventDetail {
  eventId: string;
  eventTitle: string;
  eventDate: string | null;
  eventTicker: string;
  wasMentioned: boolean;
  settledAt: string | null;
}

export interface MentionHistoryRow {
  word: string;
  yesCount: number;
  noCount: number;
  totalEvents: number;
  mentionRate: number;
  events: MentionEventDetail[];
}

export interface HistoricalImportResult {
  eventsImported: number;
  wordsImported: number;
  resultsImported: number;
  errors: string[];
}

export interface SeriesWithStats {
  id: string;
  series_ticker: string;
  display_name: string | null;
  events_count: number;
  words_count: number;
  last_imported_at: string | null;
  created_at: string;
}

export interface SpeakerWithSeries {
  id: string;
  name: string;
  series: SeriesWithStats[];
}
