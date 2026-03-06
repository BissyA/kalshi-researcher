// ── Agent Output Types ──

export interface HistoricalResult {
  transcriptsFound: Array<{
    title: string;
    date: string;
    source: string;
    url: string;
    wordCount: number;
    summary: string;
    wordMentions?: Record<string, number>;
  }>;
  wordFrequencies: Record<
    string,
    {
      appearedInCount: number;
      totalTranscripts: number;
      frequency: number;
      contextNotes: string;
      averageOccurrences: number;
    }
  >;
  overallNotes: string;
}

export interface AgendaResult {
  sourcesFound: Array<{
    title: string;
    source: string;
    url: string;
    date: string;
    summary: string;
    topicsIdentified: string[];
  }>;
  topicWordMapping: Record<
    string,
    {
      relatedWords: string[];
      likelihood: "very_likely" | "likely" | "possible" | "unlikely";
      evidence: string;
    }
  >;
  wordImplications: Record<
    string,
    {
      agendaBoost: number;
      reasoning: string;
    }
  >;
  overallNotes: string;
}

export interface NewsCycleResult {
  trendingTopics: Array<{
    topic: string;
    description: string;
    relevanceToEvent: "high" | "medium" | "low";
    sources: string[];
    relatedWords: string[];
  }>;
  recentSpeakerStatements: Array<{
    date: string;
    platform: string;
    summary: string;
    wordsUsed: string[];
  }>;
  wordImplications: Record<
    string,
    {
      newsCycleBoost: number;
      reasoning: string;
    }
  >;
  breakingNewsAlert: string | null;
}

export interface EventFormatResult {
  estimatedDurationMinutes: number;
  durationRange: { min: number; max: number };
  format: "scripted" | "unscripted" | "mixed" | "interview";
  hasQandA: boolean;
  hasAudienceInteraction: boolean;
  isLive: boolean;
  comparableEvents: Array<{
    title: string;
    date: string;
    durationMinutes: number;
    format: string;
  }>;
  implications: {
    durationEffect: string;
    formatEffect: string;
    overallWordCountExpectation: "low" | "medium" | "high";
    scriptedWeight: number;
    currentContextWeight: number;
  };
}

export interface MarketAnalysisResult {
  marketImpliedTopics: Array<{
    topic: string;
    impliedByWords: string[];
    marketImpliedProbability: number;
  }>;
  pricingAssessments: Record<
    string,
    {
      currentPrice: number;
      generalAssessment: "overpriced" | "fairly_priced" | "underpriced";
      reasoning: string;
    }
  >;
  correlatedPairs: Array<{
    word1: string;
    word2: string;
    priceDifference: number;
    correlation: "high" | "medium" | "low";
    note: string;
  }>;
  overallMarketNotes: string;
}

export interface ClusterResult {
  clusters: Array<{
    name: string;
    theme: string;
    words: string[];
    intraCorrelation: "high" | "medium" | "low";
    correlationNote: string;
    tradingImplication: string;
    narrative?: string;
  }>;
  standaloneWords: Array<{
    word: string;
    reason: string;
  }>;
  crossClusterCorrelations: Array<{
    cluster1: string;
    cluster2: string;
    correlation: string;
    note: string;
  }>;
}

export interface RecentRecordingsResult {
  recordings: Array<{
    title: string;
    date: string;
    url: string;
    platform: string;
    durationMinutes: number | null;
    description: string;
  }>;
  selectionRationale: string;
  searchQueries: string[];
}

export interface SynthesisResult {
  briefing?: string;
  wordScores: Array<{
    word: string;
    ticker: string;
    historicalProbability: number;
    agendaProbability: number;
    newsCycleProbability: number;
    baseRateProbability: number;
    combinedProbability: number;
    marketYesPrice: number;
    edge: number;
    confidence: "high" | "medium" | "low";
    reasoning: string;
    keyEvidence: string[];
    clusterName: string | null;
  }>;
  topRecommendations: {
    strongYes: Array<{ word: string; edge: number; reasoning: string }>;
    strongNo: Array<{ word: string; edge: number; reasoning: string }>;
  };
  researchQuality: {
    transcriptsAnalyzed: number;
    sourcesConsulted: number;
    overallConfidence: "high" | "medium" | "low";
    caveats: string[];
  };
}

// ── Corpus Types ──

export interface CorpusEventDetail {
  eventTitle: string;
  eventDate: string | null;
  eventTicker: string;
  wasMentioned: boolean;
  category: string | null;
}

export interface CorpusMentionRate {
  mentionRate: number;
  yesCount: number;
  totalEvents: number;
  events: CorpusEventDetail[];
}

// ── Orchestrator Types ──

export type ModelPreset = "opus" | "hybrid" | "sonnet" | "haiku";

export interface OrchestratorInput {
  event: {
    id: string;
    kalshiEventTicker: string;
    title: string;
    speaker: string;
    eventType: string;
    eventDate: string;
    venue?: string;
  };
  words: Array<{
    id: string;
    ticker: string;
    word: string;
    yesPrice: number;
    noPrice: number;
  }>;
  layer: "baseline" | "current";
  modelPreset?: ModelPreset;
  existingResearch?: {
    historicalResult?: HistoricalResult;
    agendaResult?: AgendaResult;
    eventFormatResult?: EventFormatResult;
    marketAnalysisResult?: MarketAnalysisResult;
  };
  corpusMentionRates?: Record<string, CorpusMentionRate>;
  corpusMentionRatesAll?: Record<string, CorpusMentionRate>;
  corpusCategories?: string[];
  corpusTotalEvents?: number;
}

export interface OrchestratorOutput {
  wordScores: SynthesisResult["wordScores"];
  clusters: ClusterResult["clusters"];
  eventFormat: {
    estimatedDurationMinutes: number;
    format: string;
    implications: string;
  };
  researchSummary: {
    historical: string;
    agenda: string;
    newsCycle: string;
    marketAnalysis: string;
  };
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostCents: number;
  };
}

export type AgentName =
  | "historical"
  | "agenda"
  | "news_cycle"
  | "event_format"
  | "market_analysis"
  | "recent_recordings"
  | "clustering"
  | "synthesizer";

export interface ResearchProgress {
  runId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  completedAgents: AgentName[];
  currentAgent?: AgentName;
  error?: string;
}
