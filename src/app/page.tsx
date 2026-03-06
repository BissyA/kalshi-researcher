"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LoadedEvent {
  id: string;
  kalshi_event_ticker: string;
  title: string;
  speaker: string;
  event_type: string;
  event_date: string;
  status: string;
}

interface LoadedWord {
  id: string;
  ticker: string;
  word: string;
  yesPrice: number;
  noPrice: number;
  lastPrice: number;
  volume: string;
}

interface PreviousEvent {
  id: string;
  title: string;
  speaker: string;
  event_date: string;
  status: string;
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [event, setEvent] = useState<LoadedEvent | null>(null);
  const [words, setWords] = useState<LoadedWord[]>([]);
  const [previousEvents, setPreviousEvents] = useState<PreviousEvent[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [speakers, setSpeakers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [modelPreset, setModelPreset] = useState("sonnet");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  useEffect(() => {
    fetchPreviousEvents();
    fetchSpeakers();
  }, []);

  useEffect(() => {
    if (selectedSpeakerId) {
      fetchCategories(selectedSpeakerId);
    } else {
      setCategories([]);
      setSelectedCategory("");
    }
  }, [selectedSpeakerId]);

  async function fetchCategories(speakerId: string) {
    try {
      const res = await fetch(`/api/corpus/categories?speakerId=${speakerId}`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories ?? []);
      }
    } catch {
      setCategories([]);
    }
  }

  async function fetchSpeakers() {
    try {
      const res = await fetch("/api/corpus/speakers");
      if (res.ok) {
        const data = await res.json();
        setSpeakers(data.speakers ?? []);
      }
    } catch {
      // silently fail
    }
  }

  async function fetchPreviousEvents() {
    try {
      const res = await fetch("/api/events/list");
      if (res.ok) {
        const data = await res.json();
        setPreviousEvents(data.events ?? []);
      }
    } catch {
      // silently fail
    }
  }

  async function loadEvent() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setEvent(null);
    setWords([]);

    try {
      const res = await fetch("/api/events/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load event");
        return;
      }

      setEvent(data.event);
      setWords(data.words);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function startResearch() {
    if (!event) return;
    setResearchLoading(true);
    // Persist speaker selection before navigating
    if (selectedSpeakerId) {
      await fetch("/api/events/speaker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, speakerId: selectedSpeakerId }),
      }).catch(() => {});
    }
    const params = new URLSearchParams({ modelPreset });
    if (selectedCategory) params.set("corpusCategory", selectedCategory);
    router.push(`/research/${event.id}?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Mention Market Research
        </h1>
        <p className="text-zinc-400">
          Paste a Kalshi mention market URL to start researching word
          probabilities.
        </p>
      </div>

      {/* URL Input */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadEvent()}
            placeholder="Paste Kalshi URL or event ticker (e.g. KXTRUMPMENTION-27FEB26)"
            className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={loadEvent}
            disabled={loading || !url.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "Loading..." : "Load Event"}
          </button>
        </div>
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>

      {/* Loaded Event Details */}
      {event && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white">{event.title}</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Ticker: {event.kalshi_event_ticker}
            </p>
          </div>

          <div className="flex gap-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Speaker
              </label>
              <select
                value={selectedSpeakerId}
                onChange={(e) => setSelectedSpeakerId(e.target.value)}
                className="w-full max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">None (no corpus data)</option>
                {speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSpeakerId && categories.length > 0 && (
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Corpus Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">All categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Model Preset
              </label>
              <select
                value={modelPreset}
                onChange={(e) => setModelPreset(e.target.value)}
                className="w-full max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:border-blue-500"
              >
                <option value="opus">Opus (Full) — highest quality</option>
                <option value="hybrid">Hybrid — Opus synthesizer, Sonnet/Haiku agents</option>
                <option value="sonnet">Sonnet (All) — good balance</option>
                <option value="haiku">Haiku (All) — cheapest</option>
              </select>
            </div>
          </div>

          {/* Word List Preview */}
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              {words.length} Word Contracts
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
              {words.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded border border-zinc-700/50 text-sm"
                >
                  <span className="truncate text-zinc-200">{w.word}</span>
                  <span className="text-zinc-400 ml-2 shrink-0">
                    {Math.round(w.yesPrice * 100)}¢
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={startResearch}
            disabled={researchLoading}
            className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors text-lg"
          >
            {researchLoading
              ? "Starting Research..."
              : "Start Baseline Research"}
          </button>
        </div>
      )}

      {/* Previously Researched Events */}
      {previousEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Researched Events
          </h2>
          <div className="space-y-2">
            {previousEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/research/${ev.id}`}
                className="block w-full text-left px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium">{ev.title}</span>
                    <span className="text-zinc-500 text-sm ml-3">
                      {ev.speaker}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-sm">
                      {ev.event_date
                        ? new Date(ev.event_date).toLocaleDateString()
                        : ""}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        ev.status === "researched"
                          ? "bg-green-900/50 text-green-400"
                          : ev.status === "completed"
                            ? "bg-blue-900/50 text-blue-400"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {ev.status}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
