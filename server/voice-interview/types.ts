import WebSocket from "ws";
import {
  getRealtimeProvider,
  type RealtimeProvider,
  type RealtimeProviderType,
} from "../realtime-providers";
import type {
  TranscriptEntry,
  QuestionMetrics,
  BarbaraGuidance,
  QuestionSummary,
  GeneratedAdditionalQuestion,
} from "../barbara-orchestrator";
import type {
  LLMUsageAttribution,
  BarbaraTokensByUseCase,
  PersistedTranscriptEntry,
  PersistedBarbaraGuidance,
  PersistedQuestionState,
  BarbaraGuidanceLogEntry,
  SilenceSegment,
  SilenceContext,
  TranscriptionQualitySignals,
  QualityFlag,
} from "@shared/schema";
import type { VadEagernessMode } from "@shared/types/performance-metrics";

// Feature flag for additional questions
export const ADDITIONAL_QUESTIONS_ENABLED =
  process.env.ADDITIONAL_QUESTIONS_ENABLED !== "false";

export type CompactCrossInterviewTheme = {
  theme: string;
  prevalence: number;
  cue: string;
};

export type CompactFlagCount = {
  flag: QualityFlag;
  count: number;
};

export type CompactQuestionQualityInsight = {
  questionIndex: number;
  responseCount: number;
  avgQualityScore: number;
  responseRichness: "brief" | "moderate" | "detailed";
  avgWordCount: number;
  topFlags: CompactFlagCount[];
  perspectiveRange: "narrow" | "moderate" | "diverse";
};

export type CrossInterviewRuntimeContext = {
  enabled: boolean;
  reason?: string;
  source?: "collection_analytics_snapshot";
  priorSessionCount?: number;
  snapshotGeneratedAt?: number | null;
  themesByQuestion?: Record<number, CompactCrossInterviewTheme[]>;
  emergentThemes?: CompactCrossInterviewTheme[];
  qualityInsightsByQuestion?: Record<number, CompactQuestionQualityInsight>;
};

export const MAX_THEMES_PER_QUESTION = 3;
export const MAX_EMERGENT_THEMES = 2;
export const MAX_CUE_LENGTH = 120;

export const QUALITY_ALERT_THRESHOLD = 65;
export const MIN_RESPONSE_COUNT_FOR_ALERT = 2;
export const MIN_FLAG_COUNT_FOR_ALERT = 2;
export const MAX_TOP_FLAGS_PER_QUESTION = 2;

export type CompactAnalyticsHypothesis = {
  hypothesis: string;
  source: "recommendation" | "action_item" | "strategic_insight";
  priority: "high" | "medium" | "low";
  relatedQuestionIndices: number[];
  relatedThemes: string[];
};

export type AnalyticsHypothesesRuntimeContext = {
  enabled: boolean;
  reason?: string;
  analyticsGeneratedAt?: number | null;
  totalProjectSessions?: number;
  hypotheses?: CompactAnalyticsHypothesis[];
};

export const MAX_ANALYTICS_HYPOTHESES = 8;
export const MAX_HYPOTHESIS_LENGTH = 150;
export const MAX_RELATED_THEMES_PER_HYPOTHESIS = 3;

export function getProvider(
  providerOverride?: RealtimeProviderType | null,
): RealtimeProvider {
  return getRealtimeProvider(providerOverride);
}

export interface InterviewState {
  sessionId: string;
  connectionId: string; // Unique ID per state instance - prevents stale event processing from orphaned connections
  currentQuestionIndex: number;
  questions: any[];
  template: any;
  strategicContext: string | null;
  contextType: string | null;
  avoidRules: string[] | null;
  providerWs: WebSocket | null;
  collectionId: string | null;
  providerType: RealtimeProviderType;
  providerInstance: RealtimeProvider; // Cached provider instance to avoid repeated allocation
  clientWs: WebSocket | null;
  isConnected: boolean;
  lastAIPrompt: string;
  alviaHasSpokenOnCurrentQuestion: boolean;
  isPaused: boolean;
  // Pause duration tracking for accurate silence metrics
  pauseStartedAt: number | null;
  totalPauseDurationMs: number;
  // Respondent info
  respondentInformalName: string | null;
  // Barbara-related state
  transcriptLog: TranscriptEntry[]; // Limited to MAX_TRANSCRIPT_IN_MEMORY for processing
  questionMetrics: Map<number, QuestionMetrics>;
  speakingStartTime: number | null;
  questionIndexAtSpeechStart: number | null; // Track which question the user was answering when they started speaking
  barbaraGuidanceQueue: BarbaraGuidance[];
  isWaitingForBarbara: boolean;
  isBarbaraGuidanceUpdate: boolean;
  isInitialSession: boolean;
  // Audio ready handshake - prevents audio cutoff at interview start
  clientAudioReady: boolean;
  sessionConfigured: boolean;
  // Persistence state
  fullTranscriptForPersistence: PersistedTranscriptEntry[]; // Complete transcript history - never truncated
  lastBarbaraGuidance: PersistedBarbaraGuidance | null;
  barbaraGuidanceLog: BarbaraGuidanceLogEntry[];
  questionStates: PersistedQuestionState[];
  questionSummaries: QuestionSummary[]; // Index-based: questionSummaries[questionIndex] = summary
  pendingPersistTimeout: ReturnType<typeof setTimeout> | null;
  lastPersistAt: number;
  isRestoredSession: boolean;
  // Awaiting resume flag - set for restored sessions, cleared on resume_interview
  // While true, audio is not forwarded to provider to prevent auto-responses via VAD
  awaitingResume: boolean;
  // Session hygiene tracking
  createdAt: number;
  lastHeartbeatAt: number;
  lastActivityAt: number; // Any meaningful activity (audio, interaction, AI response)
  terminationWarned: boolean; // Whether client has been warned about impending termination
  clientDisconnectedAt: number | null; // When client WS closed (for watchdog to handle)
  isFinalizing: boolean; // True when finalizeInterview() is in progress — prevents disconnect/watchdog interference
  // Realtime API performance metrics
  metricsTracker: MetricsTracker;
  // Transcription quality tracking (noisy environment detection)
  transcriptionQualitySignals: TranscriptionQualitySignals;
  // Additional questions phase state
  isInAdditionalQuestionsPhase: boolean;
  additionalQuestions: GeneratedAdditionalQuestion[];
  currentAdditionalQuestionIndex: number;
  additionalQuestionsConsent: boolean | null; // null = not yet asked, true/false = answered
  additionalQuestionsGenerating: boolean;
  maxAdditionalQuestions: number;
  endOfInterviewSummaryEnabled: boolean;
  vadEagernessMode: VadEagernessMode;
  isGeneratingAlviaSummary: boolean;
  alviaSummaryResolve: ((text: string) => void) | null;
  alviaSummaryReject: ((error: Error) => void) | null;
  alviaSummaryAccumulatedText: string;
  // Track pending summary generation promises to await before completion
  pendingSummaryPromises: Map<number | string, Promise<void>>;
  // Response state tracking - prevents concurrent response.create calls
  responseInProgress: boolean;
  responseStartedAt: number | null; // When current response.create was sent
  lastResponseDoneAt: number | null;
  // Cross-interview context snapshot (precomputed at init, never updated during session)
  crossInterviewRuntimeContext: CrossInterviewRuntimeContext;
  // Analytics-guided hypothesis testing context (precomputed at init, never updated during session)
  analyticsHypothesesRuntimeContext: AnalyticsHypothesesRuntimeContext;
  // Client-side performance metrics (e.g., calibration data)
  performanceMetrics?: {
    calibration?: {
      baseline: number;
      threshold: number;
      sampleCount: number;
      variance: number;
      timestamp: number;
    };
  };
}

export function buildUsageAttribution(state: InterviewState): LLMUsageAttribution {
  return {
    sessionId: state.sessionId,
    collectionId: state.collectionId || null,
    templateId: state.template?.id || null,
    projectId: state.template?.projectId || null,
    workspaceId: null,
  };
}

export type TerminationReason =
  | "heartbeat_timeout"
  | "idle_timeout"
  | "max_age_exceeded"
  | "client_disconnected";

// Response state tracking helper - prevents concurrent response.create calls
// Includes timeout-based reset to prevent deadlock if response.done never arrives
export const RESPONSE_TIMEOUT_MS = 30000; // 30 seconds max for any response
export function canCreateResponse(state: InterviewState): boolean {
  if (!state.responseInProgress) {
    return true;
  }
  // Check if current response has been pending too long (covers first response hanging)
  if (state.responseStartedAt) {
    const timeSinceResponseStarted = Date.now() - state.responseStartedAt;
    if (timeSinceResponseStarted > RESPONSE_TIMEOUT_MS) {
      console.warn(
        `[Response] Resetting stale responseInProgress (${timeSinceResponseStarted}ms since response.create)`,
      );
      state.responseInProgress = false;
      state.responseStartedAt = null;
      return true;
    }
  }
  return false;
}

// Defensive WebSocket send helper - safely sends messages with readyState check and error handling
// Prevents crashes from stale closure WebSockets that may have closed between event and handler
export function safeSend(
  ws: WebSocket | null,
  message: string | object,
  context?: string,
): boolean {
  if (!ws) {
    return false;
  }
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    const data =
      typeof message === "string" ? message : JSON.stringify(message);
    ws.send(data);
    return true;
  } catch (error) {
    console.warn(
      `[safeSend] Failed to send${context ? ` (${context})` : ""}: ${error}`,
    );
    return false;
  }
}

// Realtime API metrics tracking during session
export interface MetricsTracker {
  // Token usage (accumulated from response.done events)
  tokens: {
    inputTokens: number;
    outputTokens: number;
    inputAudioTokens: number;
    outputAudioTokens: number;
    inputTextTokens: number;
    outputTextTokens: number;
    rawResponses: unknown[];
  };
  // Latency tracking
  latency: {
    transcriptionLatencies: number[]; // Each measurement: speech_stopped → transcription completed
    responseLatencies: number[]; // Each measurement: transcription → first audio delta
    lastSpeechStoppedAt: number | null; // Timestamp when user stopped speaking
    lastTranscriptionAt: number | null; // Timestamp when transcription completed
    waitingForFirstAudio: boolean; // Flag to capture first audio delta latency
  };
  // Alvia speaking time
  alviaSpeaking: {
    totalMs: number;
    currentResponseStartAt: number | null; // When current response audio started
    turnCount: number;
  };
  // Silence segment tracking for VAD threshold tuning
  silenceTracking: {
    segments: SilenceSegment[]; // Recent segments (capped at MAX_STORED_SEGMENTS)
    lastAlviaEndAt: number | null; // When Alvia last finished speaking
    lastRespondentEndAt: number | null; // When respondent last stopped speaking
    lastSpeechStartAt: number | null; // When anyone last started speaking (to detect if in-speech)
    // Running stats accumulator (computed from ALL observed segments, not just stored)
    accumulator: {
      allDurations: number[]; // All durations for percentile calculation
      countByContext: Record<SilenceContext, number>;
      totalMsByContext: Record<SilenceContext, number>;
    };
  };
  // Connection tracking
  openaiConnectionCount: number;
  // Barbara token usage tracking
  barbaraTokens: BarbaraTokensByUseCase;
  // VAD eagerness tracking for dynamic switching
  eagernessTracking: {
    initialMode: VadEagernessMode;
    currentMode: VadEagernessMode;
    switchedAt: number | null;
    switchReason: string | null;
    rapidBargeInCount: number;
    totalBargeInCount: number;
    recentTurnBargeIns: boolean[];
    eagernessDowngraded: boolean;
    respondentTurnCount: number;
  };
}

export interface SessionWatchdogState {
  interval: ReturnType<typeof setInterval> | null;
  pingInterval: ReturnType<typeof setInterval> | null; // WebSocket protocol-level pings
}

export const watchdogState: SessionWatchdogState = {
  interval: null,
  pingInterval: null,
};

export const PERSIST_DEBOUNCE_MS = 2000;
export const MAX_TRANSCRIPT_IN_MEMORY = 50;

// Session hygiene constants
export const HEARTBEAT_INTERVAL_MS = 30_000; // Client sends ping every 30s
export const HEARTBEAT_TIMEOUT_MS = 90_000; // Terminate if no ping for 90s (3 missed heartbeats)
export const SESSION_IDLE_TIMEOUT_MS = 5 * 60_000; // Terminate after 5 min of no activity
export const SESSION_MAX_AGE_MS = 60 * 60_000; // Absolute max session duration: 1 hour
export const WATCHDOG_INTERVAL_MS = 30_000; // Run watchdog every 30s
export const TERMINATION_WARNING_MS = 30_000; // Warn client 30s before termination
// WebSocket protocol-level ping interval - prevents infrastructure (load balancer/proxy) timeouts
export const WS_PING_INTERVAL_MS = 30_000; // Send ws.ping() every 30s to keep connection alive at protocol level
