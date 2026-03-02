"use client";

import { useState, useEffect, useRef } from "react";

interface KalshiSeries {
  ticker: string;
  title: string;
  category: string;
  frequency: string;
}

interface KalshiSeriesSearchProps {
  onSelect: (ticker: string, title: string) => void;
  disabled?: boolean;
}

export function KalshiSeriesSearch({ onSelect, disabled }: KalshiSeriesSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KalshiSeries[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch results on query change (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/corpus/kalshi-series?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.series ?? []);
        setTotal(data.total ?? 0);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(s: KalshiSeries) {
    onSelect(s.ticker, s.title);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder="Search Kalshi series (e.g., mention, trump, vance...)"
        disabled={disabled}
        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 placeholder-zinc-500 disabled:opacity-50"
      />
      {loading && (
        <div className="absolute right-3 top-2.5">
          <span className="inline-block w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
        </div>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {total > 50 && (
            <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800">
              Showing 50 of {total} results — refine your search
            </div>
          )}
          {results.map((s) => (
            <button
              key={s.ticker}
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-mono">{s.ticker}</span>
                <span className="text-xs text-zinc-600">{s.category}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{s.title}</p>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && !loading && results.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3">
          <p className="text-xs text-zinc-500 text-center">No series found for &quot;{query}&quot;</p>
        </div>
      )}
    </div>
  );
}
