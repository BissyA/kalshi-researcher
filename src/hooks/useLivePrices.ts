"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface PriceData {
  yesBid: number;
  yesAsk: number;
  lastPrice: number;
  volume: string;
  openInterest: string;
}

export type WsStatus = "connecting" | "connected" | "disconnected";

interface UseLivePricesResult {
  prices: Record<string, PriceData>;
  status: WsStatus;
  lastUpdate: number | null;
}

export function useLivePrices(marketTickers: string[]): UseLivePricesResult {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const tickersKey = marketTickers.join(",");

  const handleTicker = useCallback((event: MessageEvent) => {
    if (!mountedRef.current) return;
    try {
      const msg = JSON.parse(event.data);
      setPrices((prev) => ({
        ...prev,
        [msg.market_ticker]: {
          yesBid: parseFloat(msg.yes_bid_dollars) || 0,
          yesAsk: parseFloat(msg.yes_ask_dollars) || 0,
          lastPrice: parseFloat(msg.price_dollars) || 0,
          volume: msg.volume_fp ?? "0",
          openInterest: msg.open_interest_fp ?? "0",
        },
      }));
      setLastUpdate(Date.now());
    } catch {
      // Malformed data — ignore
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (marketTickers.length === 0) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");

    const url = `/api/ws/prices?tickers=${encodeURIComponent(tickersKey)}`;
    const es = new EventSource(url);

    es.addEventListener("ticker", handleTicker as EventListener);

    es.addEventListener("status", ((event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.connected === true) {
          setStatus("connected");
        } else if (data.connected === false) {
          setStatus("connecting");
        }
      } catch {
        // ignore
      }
    }) as EventListener);

    es.addEventListener("error", ((event: Event) => {
      if (!mountedRef.current) return;
      const me = event as MessageEvent;
      if (me.data) {
        try {
          // Server-sent error with data
          console.error("WS price error:", JSON.parse(me.data));
        } catch {
          // ignore
        }
      }
    }) as EventListener);

    es.onerror = () => {
      if (!mountedRef.current) return;
      if (es.readyState === EventSource.CONNECTING) {
        setStatus("connecting");
      } else if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
      }
    };

    es.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connecting"); // Wait for Kalshi WS to actually connect
    };

    return () => {
      mountedRef.current = false;
      es.close();
      setStatus("disconnected");
    };
  }, [tickersKey, handleTicker]);

  return { prices, status, lastUpdate };
}
