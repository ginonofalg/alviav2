export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTextTokens: number;
  outputTextTokens: number;
};

export type LatencyMetrics = {
  avgTranscriptionLatencyMs: number;
  avgResponseLatencyMs: number;
  maxTranscriptionLatencyMs: number;
  maxResponseLatencyMs: number;
  transcriptionSamples: number;
  responseSamples: number;
};

export type SilenceContext = 
  | 'post_alvia'
  | 'post_respondent'
  | 'initial';

export type SilenceSegment = {
  startAt: number;
  endAt: number;
  durationMs: number;
  context: SilenceContext;
  questionIndex: number | null;
};

export type SilenceStats = {
  count: number;
  meanMs: number;
  medianMs: number;
  p90Ms: number;
  p95Ms: number;
  maxMs: number;
  byContext: Record<SilenceContext, { count: number; totalMs: number; meanMs: number }>;
};

export type SpeakingTimeMetrics = {
  respondentSpeakingMs: number;
  alviaSpeakingMs: number;
  silenceMs: number;
  respondentTurnCount: number;
  alviaTurnCount: number;
  silenceSegments?: SilenceSegment[];
  silenceStats?: SilenceStats | null;
  totalPauseDurationMs?: number;
  activeSilenceMs?: number;
  activeSessionDurationMs?: number;
};

export type BarbaraTokenBucket = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type BarbaraTokensByUseCase = {
  analysis?: BarbaraTokenBucket;
  topicOverlap?: BarbaraTokenBucket;
  questionSummary?: BarbaraTokenBucket;
  additionalQuestions?: BarbaraTokenBucket;
  sessionSummary?: BarbaraTokenBucket;
  total: BarbaraTokenBucket;
};

export type RealtimePerformanceMetrics = {
  sessionId: string;
  recordedAt: number;
  tokenUsage: TokenUsage;
  latency: LatencyMetrics;
  speakingTime: SpeakingTimeMetrics;
  sessionDurationMs: number;
  openaiConnectionCount: number;
  terminationReason?: string;
  barbaraTokens?: BarbaraTokensByUseCase;
};
