export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  sub_title?: string;
  mutually_exclusive: boolean;
  category: string;
  strike_date?: string | null;
  markets?: KalshiMarket[];
}

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  status: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  no_bid_dollars: string;
  no_ask_dollars: string;
  last_price_dollars: string;
  volume_fp: string;
  open_interest_fp: string;
  open_time: string;
  close_time: string;
}

export type MarketStatus = "active" | "closed" | "determined" | "finalized";

export interface WordContract {
  ticker: string;
  eventTicker: string;
  word: string;
  title: string;
  yesBidDollars: string;
  yesAskDollars: string;
  noBidDollars: string;
  noAskDollars: string;
  lastPriceDollars: string;
  volume: string;
  openInterest: string;
  status: MarketStatus;
}
