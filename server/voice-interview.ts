import WebSocket from "ws";
import type { IncomingMessage } from "http";
import { randomUUID } from "crypto";
import { storage, type InterviewStatePatch } from "./storage";
import {
  analyzeWithBarbara,
  createEmptyMetrics,
  generateQuestionSummary,
  detectTopicOverlap,
  generateAdditionalQuestions,
  type TranscriptEntry,
  type QuestionMetrics,
  type BarbaraGuidance,
  type QuestionSummary,
  type TopicOverlapResult,
  type GeneratedAdditionalQuestion,
  type AdditionalQuestionsResult,
} from "./barbara-orchestrator";
import type {
  PersistedTranscriptEntry,
  PersistedBarbaraGuidance,
  PersistedQuestionState,
  QuestionSummary as PersistedQuestionSummary,
  RealtimePerformanceMetrics,
  TokenUsage,
  LatencyMetrics,
  SpeakingTimeMetrics,
  SilenceSegment,
  SilenceContext,
  SilenceStats,
  TranscriptionQualitySignals,
} from "@shared/schema";
import {
  createEmptyQualitySignals,
  updateQualitySignals,
  calculateQualityScore,
  createQualityMetrics,
  getQualityFlags,
  sanitizeGlitchedTranscript,
  shouldReduceVadEagerness,
  shouldRestoreVadEagerness,
  updateGoodUtteranceTracking,
} from "./transcription-quality";
import {
  getRealtimeProvider,
  type RealtimeProvider,
  type RealtimeProviderType,
} from "./realtime-providers";

// Feature flag for additional questions
const ADDITIONAL_QUESTIONS_ENABLED =
  process.env.ADDITIONAL_QUESTIONS_ENABLED !== "false";

function getProvider(
  providerOverride?: RealtimeProviderType | null,
): RealtimeProvider {
  return getRealtimeProvider(providerOverride);
}

interface InterviewState {
  sessionId: string;
  connectionId: string; // Unique ID per state instance - prevents stale event processing from orphaned connections
  currentQuestionIndex: number;
  questions: any[];
  template: any;
  strategicContext: string | null;
  providerWs: WebSocket | null;
  providerType: RealtimeProviderType;
  providerInstance: RealtimeProvider; // Cached provider instance to avoid repeated allocation
  clientWs: WebSocket | null;
  isConnected: boolean;
  lastAIPrompt: string;
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
  // Track pending summary generation promises to await before completion
  pendingSummaryPromises: Map<number | string, Promise<void>>;
  // Response state tracking - prevents concurrent response.create calls
  responseInProgress: boolean;
  responseStartedAt: number | null; // When current response.create was sent
  lastResponseDoneAt: number | null;
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

type TerminationReason =
  | "heartbeat_timeout"
  | "idle_timeout"
  | "max_age_exceeded"
  | "client_disconnected";

// Response state tracking helper - prevents concurrent response.create calls
// Includes timeout-based reset to prevent deadlock if response.done never arrives
const RESPONSE_TIMEOUT_MS = 30000; // 30 seconds max for any response
function canCreateResponse(state: InterviewState): boolean {
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
function safeSend(
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

// Helper to check if a connectionId matches the current state - centralized stale guard
function isCurrentConnection(sessionId: string, connectionId: string): boolean {
  const state = interviewStates.get(sessionId);
  return (
    state !== null && state !== undefined && state.connectionId === connectionId
  );
}

// Realtime API metrics tracking during session
interface MetricsTracker {
  // Token usage (accumulated from response.done events)
  tokens: {
    inputTokens: number;
    outputTokens: number;
    inputAudioTokens: number;
    outputAudioTokens: number;
    inputTextTokens: number;
    outputTextTokens: number;
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
}

function createEmptyMetricsTracker(): MetricsTracker {
  return {
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      inputAudioTokens: 0,
      outputAudioTokens: 0,
      inputTextTokens: 0,
      outputTextTokens: 0,
    },
    latency: {
      transcriptionLatencies: [],
      responseLatencies: [],
      lastSpeechStoppedAt: null,
      lastTranscriptionAt: null,
      waitingForFirstAudio: false,
    },
    alviaSpeaking: {
      totalMs: 0,
      currentResponseStartAt: null,
      turnCount: 0,
    },
    silenceTracking: {
      segments: [],
      lastAlviaEndAt: null,
      lastRespondentEndAt: null,
      lastSpeechStartAt: null,
      accumulator: {
        allDurations: [],
        countByContext: { post_alvia: 0, post_respondent: 0, initial: 0 },
        totalMsByContext: { post_alvia: 0, post_respondent: 0, initial: 0 },
      },
    },
    openaiConnectionCount: 0,
  };
}

// Constants for silence tracking
const MIN_SILENCE_DURATION_MS = 100; // Filter out noise/micro-pauses
const MAX_STORED_SEGMENTS = 100; // Cap stored segments (stats computed from all)

// Record a silence segment when speech resumes
function recordSilenceSegment(
  tracker: MetricsTracker,
  state: InterviewState,
  endAt: number,
): void {
  const { lastAlviaEndAt, lastRespondentEndAt, lastSpeechStartAt } =
    tracker.silenceTracking;

  // If someone was already speaking, no silence to record
  if (lastSpeechStartAt !== null) {
    return;
  }

  // Determine when silence started and its context
  let startAt: number | null = null;
  let context: SilenceContext;

  if (lastAlviaEndAt !== null && lastRespondentEndAt !== null) {
    // Both have spoken before - use the more recent end time
    if (lastAlviaEndAt > lastRespondentEndAt) {
      startAt = lastAlviaEndAt;
      context = "post_alvia";
    } else {
      startAt = lastRespondentEndAt;
      context = "post_respondent";
    }
  } else if (lastAlviaEndAt !== null) {
    startAt = lastAlviaEndAt;
    context = "post_alvia";
  } else if (lastRespondentEndAt !== null) {
    startAt = lastRespondentEndAt;
    context = "post_respondent";
  } else {
    // No prior speech - this is initial silence
    startAt = state.createdAt;
    context = "initial";
  }

  if (startAt === null || endAt <= startAt) {
    return; // Invalid segment
  }

  const durationMs = endAt - startAt;

  // Only record segments >= minimum threshold to filter noise
  if (durationMs < MIN_SILENCE_DURATION_MS) {
    return;
  }

  const segment: SilenceSegment = {
    startAt,
    endAt,
    durationMs,
    context,
    questionIndex: state.currentQuestionIndex ?? null,
  };

  // Update running stats accumulator (tracks ALL observed segments for accurate stats)
  const acc = tracker.silenceTracking.accumulator;
  acc.allDurations.push(durationMs);
  acc.countByContext[context]++;
  acc.totalMsByContext[context] += durationMs;

  // Add segment to stored array (capped at runtime for memory efficiency)
  tracker.silenceTracking.segments.push(segment);

  // Keep only the most recent MAX_STORED_SEGMENTS for detailed analysis
  if (tracker.silenceTracking.segments.length > MAX_STORED_SEGMENTS) {
    tracker.silenceTracking.segments.shift(); // Remove oldest
  }
}

// Calculate statistical summary from silence data
// Uses accumulator for counts/totals (from ALL segments) and durations array for percentiles
function calculateSilenceStats(
  accumulator: MetricsTracker["silenceTracking"]["accumulator"],
): SilenceStats | null {
  const { allDurations, countByContext, totalMsByContext } = accumulator;

  if (allDurations.length === 0) {
    return null;
  }

  // Sort durations for percentile calculations
  const sortedDurations = [...allDurations].sort((a, b) => a - b);
  const count = sortedDurations.length;
  const totalMs = sortedDurations.reduce((sum, d) => sum + d, 0);

  const percentile = (arr: number[], p: number): number => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

  // Build byContext stats from accumulator
  const byContext: Record<
    SilenceContext,
    { count: number; totalMs: number; meanMs: number }
  > = {
    post_alvia: {
      count: countByContext.post_alvia,
      totalMs: totalMsByContext.post_alvia,
      meanMs:
        countByContext.post_alvia > 0
          ? Math.round(totalMsByContext.post_alvia / countByContext.post_alvia)
          : 0,
    },
    post_respondent: {
      count: countByContext.post_respondent,
      totalMs: totalMsByContext.post_respondent,
      meanMs:
        countByContext.post_respondent > 0
          ? Math.round(
              totalMsByContext.post_respondent / countByContext.post_respondent,
            )
          : 0,
    },
    initial: {
      count: countByContext.initial,
      totalMs: totalMsByContext.initial,
      meanMs:
        countByContext.initial > 0
          ? Math.round(totalMsByContext.initial / countByContext.initial)
          : 0,
    },
  };

  return {
    count,
    meanMs: Math.round(totalMs / count),
    medianMs: percentile(sortedDurations, 50),
    p90Ms: percentile(sortedDurations, 90),
    p95Ms: percentile(sortedDurations, 95),
    maxMs: sortedDurations[count - 1],
    byContext,
  };
}

interface SessionWatchdogState {
  interval: ReturnType<typeof setInterval> | null;
}

const watchdogState: SessionWatchdogState = {
  interval: null,
};

const PERSIST_DEBOUNCE_MS = 2000;
const MAX_TRANSCRIPT_IN_MEMORY = 100;

// Session hygiene constants
const HEARTBEAT_INTERVAL_MS = 30_000; // Client sends ping every 30s
const HEARTBEAT_TIMEOUT_MS = 90_000; // Terminate if no ping for 90s (3 missed heartbeats)
const SESSION_IDLE_TIMEOUT_MS = 5 * 60_000; // Terminate after 5 min of no activity
const SESSION_MAX_AGE_MS = 60 * 60_000; // Absolute max session duration: 1 hour
const WATCHDOG_INTERVAL_MS = 30_000; // Run watchdog every 30s
const TERMINATION_WARNING_MS = 30_000; // Warn client 30s before termination

const interviewStates = new Map<string, InterviewState>();

function addTranscriptEntry(
  state: InterviewState,
  entry: TranscriptEntry,
): void {
  // Add to full persistence buffer (never truncated)
  state.fullTranscriptForPersistence.push(entry as PersistedTranscriptEntry);

  // Add to in-memory log (limited to MAX_TRANSCRIPT_IN_MEMORY for processing)
  state.transcriptLog.push(entry);
  if (state.transcriptLog.length > MAX_TRANSCRIPT_IN_MEMORY) {
    state.transcriptLog = state.transcriptLog.slice(-MAX_TRANSCRIPT_IN_MEMORY);
  }
}

function detectQuestionRepeat(
  state: InterviewState,
  questionIndex: number,
): boolean {
  const recentAlviaUtterances = state.transcriptLog
    .filter((e) => e.speaker === "alvia" && e.questionIndex === questionIndex)
    .slice(-4);

  if (recentAlviaUtterances.length < 2) return false;

  const getKeywords = (text: string): Set<string> => {
    const stopWords = new Set([
      "a",
      "an",
      "the",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "under",
      "and",
      "but",
      "if",
      "or",
      "because",
      "until",
      "while",
      "although",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "its",
      "our",
      "their",
      "this",
      "that",
      "these",
      "those",
      "what",
      "which",
      "who",
      "whom",
      "whose",
      "so",
      "just",
      "now",
      "then",
      "here",
      "there",
      "when",
      "where",
      "why",
      "how",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "not",
      "only",
      "same",
      "than",
      "too",
      "very",
      "please",
      "thank",
      "thanks",
      "sorry",
      "okay",
      "ok",
      "yes",
      "yeah",
    ]);
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w)),
    );
  };

  const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 && b.size === 0) return 0;
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return intersection.size / union.size;
  };

  for (let i = 0; i < recentAlviaUtterances.length - 1; i++) {
    for (let j = i + 1; j < recentAlviaUtterances.length; j++) {
      const kw1 = getKeywords(recentAlviaUtterances[i].text);
      const kw2 = getKeywords(recentAlviaUtterances[j].text);
      if (jaccardSimilarity(kw1, kw2) > 0.6) {
        return true;
      }
    }
  }

  return false;
}

function scheduleDebouncedPersist(sessionId: string): void {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  if (state.pendingPersistTimeout) {
    clearTimeout(state.pendingPersistTimeout);
  }

  state.pendingPersistTimeout = setTimeout(() => {
    flushPersist(sessionId);
  }, PERSIST_DEBOUNCE_MS);
}

async function flushPersist(sessionId: string): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  if (state.pendingPersistTimeout) {
    clearTimeout(state.pendingPersistTimeout);
    state.pendingPersistTimeout = null;
  }

  // Normalize questionSummaries to avoid sparse array nulls during JSON serialization
  // Each summary has its questionIndex stored, so we can reconstruct the array on restore
  // Filter out nulls to create a clean array for persistence
  const normalizedSummaries = state.questionSummaries
    .map((s, idx) => (s ? { ...s, questionIndex: idx } : null))
    .filter((s): s is QuestionSummary => s !== null);

  // During AQ phase, currentQuestionIndex is a synthetic value (questions.length + aqIndex).
  // We must persist the actual template question index (capped at last question) to avoid
  // corruption on restore. AQ state is tracked separately via additionalQuestionPhase + currentAdditionalQuestionIndex.
  const templateQuestionCount = state.questions.length;
  const persistableQuestionIndex = state.isInAdditionalQuestionsPhase
    ? templateQuestionCount - 1 // Cap to last template question during AQ phase
    : state.currentQuestionIndex;

  // Use fullTranscriptForPersistence to avoid data loss from in-memory truncation
  const patch: InterviewStatePatch = {
    liveTranscript: state.fullTranscriptForPersistence,
    lastBarbaraGuidance: state.lastBarbaraGuidance,
    questionStates: state.questionStates,
    questionSummaries: normalizedSummaries,
    currentQuestionIndex: persistableQuestionIndex,
    // Also persist AQ state for proper restoration
    additionalQuestionPhase: state.isInAdditionalQuestionsPhase,
    additionalQuestions:
      state.additionalQuestions.length > 0
        ? state.additionalQuestions
        : undefined,
    currentAdditionalQuestionIndex: state.isInAdditionalQuestionsPhase
      ? state.currentAdditionalQuestionIndex
      : undefined,
  };

  try {
    await storage.persistInterviewState(sessionId, patch);
    state.lastPersistAt = Date.now();
    console.log(
      `[Persist] State saved for session: ${sessionId}, transcript entries: ${state.fullTranscriptForPersistence.length}`,
    );
  } catch (error) {
    console.error(`[Persist] Error saving state for ${sessionId}:`, error);
  }
}

async function persistBarbaraGuidance(
  sessionId: string,
  guidance: BarbaraGuidance,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const persistedGuidance: PersistedBarbaraGuidance = {
    action: guidance.action,
    message: guidance.message,
    confidence: guidance.confidence,
    timestamp: Date.now(),
    questionIndex: state.currentQuestionIndex,
  };

  state.lastBarbaraGuidance = persistedGuidance;

  if (guidance.action === "suggest_next_question") {
    const questionState = state.questionStates.find(
      (qs) => qs.questionIndex === state.currentQuestionIndex,
    );
    if (questionState) {
      questionState.barbaraSuggestedMoveOn = true;
    }
  }

  try {
    // Normalize questionSummaries to avoid sparse array nulls
    const normalizedSummaries = state.questionSummaries
      .map((s, idx) => (s ? { ...s, questionIndex: idx } : null))
      .filter((s): s is QuestionSummary => s !== null);

    // Persist with all relevant fields to avoid overwriting concurrent summary persistence
    await storage.persistInterviewState(sessionId, {
      lastBarbaraGuidance: persistedGuidance,
      questionStates: state.questionStates,
      questionSummaries: normalizedSummaries,
    });
    console.log(`[Persist] Barbara guidance saved for session: ${sessionId}`);
  } catch (error) {
    console.error(
      `[Persist] Error saving Barbara guidance for ${sessionId}:`,
      error,
    );
  }
}

function updateQuestionState(
  state: InterviewState,
  questionIndex: number,
  updates: Partial<PersistedQuestionState>,
): void {
  let questionState = state.questionStates.find(
    (qs) => qs.questionIndex === questionIndex,
  );

  if (!questionState) {
    const metrics =
      state.questionMetrics.get(questionIndex) ||
      createEmptyMetrics(questionIndex);
    questionState = {
      questionIndex,
      status: "not_started",
      barbaraSuggestedMoveOn: false,
      wordCount: metrics.wordCount,
      activeTimeMs: metrics.activeTimeMs,
      turnCount: metrics.turnCount,
      followUpCount: metrics.followUpCount ?? 0,
    };
    state.questionStates.push(questionState);
  }

  Object.assign(questionState, updates);

  const metrics = state.questionMetrics.get(questionIndex);
  if (metrics) {
    questionState.wordCount = metrics.wordCount;
    questionState.activeTimeMs = metrics.activeTimeMs;
    questionState.turnCount = metrics.turnCount;
  }
}

async function persistNextQuestion(
  sessionId: string,
  previousIndex: number,
  newIndex: number,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  updateQuestionState(state, previousIndex, { status: "answered" });
  updateQuestionState(state, newIndex, { status: "in_progress" });

  await flushPersist(sessionId);
}

async function generateAndPersistSummary(
  sessionId: string,
  questionIndex: number,
  transcriptSnapshot: TranscriptEntry[], // Pre-captured snapshot to avoid timing issues
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const question = state.questions[questionIndex];
  if (!question) return;

  // Check if summary already exists for this question (prevent duplicates)
  if (state.questionSummaries[questionIndex]) {
    console.log(
      `[Summary] Summary already exists for Q${questionIndex + 1}, skipping`,
    );
    return;
  }

  try {
    const metrics =
      state.questionMetrics.get(questionIndex) ||
      createEmptyMetrics(questionIndex);

    // Log transcript snapshot stats for debugging
    const snapshotForQuestion = transcriptSnapshot.filter(
      (e) => e.questionIndex === questionIndex,
    );
    console.log(
      `[Summary] Generating summary for Q${questionIndex + 1} (session: ${sessionId}), ` +
        `transcript snapshot: ${transcriptSnapshot.length} total entries, ` +
        `${snapshotForQuestion.length} for this question`,
    );

    const summary = await generateQuestionSummary(
      questionIndex,
      question.questionText,
      question.guidance || "",
      transcriptSnapshot, // Use the pre-captured snapshot
      metrics,
      state.template?.objective || "",
    );

    // Ensure array is properly sized to avoid sparse array nulls during serialization
    // Fill all indices up to and including questionIndex with null placeholders
    while (state.questionSummaries.length <= questionIndex) {
      state.questionSummaries.push(null as unknown as QuestionSummary);
    }
    // Now safely assign to the correct index
    state.questionSummaries[questionIndex] = summary;

    console.log(
      `[Summary] Summary completed for Q${questionIndex + 1}: "${summary.respondentSummary.substring(0, 100)}..."`,
    );

    // Normalize array for persistence: filter out undefined/null entries and create a dense map
    const normalizedSummaries = state.questionSummaries
      .map((s, idx) => (s ? { ...s, questionIndex: idx } : null))
      .filter((s): s is QuestionSummary => s !== null);

    // Persist immediately with all relevant fields to avoid overwriting concurrent Barbara guidance
    await storage.persistInterviewState(sessionId, {
      questionSummaries: normalizedSummaries,
      lastBarbaraGuidance: state.lastBarbaraGuidance,
      questionStates: state.questionStates,
    });
    console.log(`[Summary] Summary persisted for Q${questionIndex + 1}`);
  } catch (error) {
    console.error(
      `[Summary] Failed to generate summary for Q${questionIndex + 1}:`,
      error,
    );
    // Fail silently - doesn't affect interview progress
  }
}

export function handleVoiceInterview(
  clientWs: WebSocket,
  req: IncomingMessage,
) {
  // Extract session ID and provider from query string: /ws/interview?sessionId=xxx&provider=openai
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  const providerParamRaw = url.searchParams.get("provider");

  // Validate provider parameter
  const validProviders: RealtimeProviderType[] = ["openai", "grok"];
  const providerParam: RealtimeProviderType | null =
    providerParamRaw &&
    validProviders.includes(providerParamRaw as RealtimeProviderType)
      ? (providerParamRaw as RealtimeProviderType)
      : null;

  if (providerParamRaw && !providerParam) {
    console.warn(
      `[VoiceInterview] Invalid provider "${providerParamRaw}", using default`,
    );
  }

  if (!sessionId) {
    clientWs.close(1008, "Session ID required");
    return;
  }

  // Check for concurrent tab - reject if session already has an active or transitioning connection
  // CRITICAL: Also check CLOSING state to prevent race condition where new connection arrives
  // before old WebSocket 'close' event fires, leading to state overwrite and metric corruption
  const existingState = interviewStates.get(sessionId);
  if (existingState && existingState.clientWs) {
    const wsState = existingState.clientWs.readyState;

    if (wsState === WebSocket.OPEN) {
      console.log(
        `[VoiceInterview] Rejecting concurrent connection for session: ${sessionId} (existing WS is OPEN)`,
      );
      clientWs.send(
        JSON.stringify({
          type: "error",
          code: "SESSION_ACTIVE_ELSEWHERE",
          message: "This interview is already active in another tab or window",
        }),
      );
      clientWs.close(1008, "Session active elsewhere");
      return;
    }

    if (wsState === WebSocket.CLOSING || wsState === WebSocket.CONNECTING) {
      // Race condition prevention: old connection still transitioning
      // Reject and ask client to retry after brief delay
      console.log(
        `[VoiceInterview] Rejecting connection during state transition for session: ${sessionId} ` +
          `(existing WS state: ${wsState === WebSocket.CLOSING ? "CLOSING" : "CONNECTING"}, ` +
          `clientDisconnectedAt: ${existingState.clientDisconnectedAt})`,
      );
      clientWs.send(
        JSON.stringify({
          type: "error",
          code: "SESSION_TRANSITIONING",
          message:
            "Session is transitioning. Please wait a moment and try again.",
          retryAfterMs: 1000, // Suggest 1 second retry delay
        }),
      );
      clientWs.close(1013, "Session transitioning"); // 1013 = Try Again Later
      return;
    }
  }

  // Check if we're reconnecting to a disconnected session (within heartbeat timeout window)
  if (existingState && existingState.clientDisconnectedAt !== null) {
    console.log(
      `[VoiceInterview] Reconnecting to disconnected session: ${sessionId}`,
    );

    // Reuse existing state - update client connection and reset timestamps
    const now = Date.now();
    existingState.clientWs = clientWs;
    existingState.clientDisconnectedAt = null;
    existingState.lastHeartbeatAt = now;
    existingState.lastActivityAt = now;
    existingState.terminationWarned = false;

    // Set up message handlers for reconnected client
    clientWs.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(sessionId, message, clientWs);
      } catch (error) {
        console.error("[VoiceInterview] Error parsing client message:", error);
      }
    });

    clientWs.on("close", (code: number, reason: Buffer) => {
      const state = interviewStates.get(sessionId);
      const timeSinceHeartbeat = state?.lastHeartbeatAt
        ? Date.now() - state.lastHeartbeatAt
        : null;
      const timeSinceActivity = state?.lastActivityAt
        ? Date.now() - state.lastActivityAt
        : null;

      console.log(`[VoiceInterview] Client disconnected: ${sessionId}`, {
        closeCode: code,
        closeReason: reason?.toString() || "(none)",
        timeSinceLastHeartbeat: timeSinceHeartbeat ? `${timeSinceHeartbeat}ms` : "unknown",
        timeSinceLastActivity: timeSinceActivity ? `${timeSinceActivity}ms` : "unknown",
        sessionAge: state ? `${Date.now() - state.createdAt}ms` : "unknown",
        isPaused: state?.isPaused || false,
        questionIndex: state?.currentQuestionIndex,
      });

      if (state) {
        state.clientDisconnectedAt = Date.now();
        state.clientWs = null;
        console.log(
          `[VoiceInterview] Session ${sessionId} marked as disconnected, watchdog will cleanup after heartbeat timeout`,
        );
      }
    });

    clientWs.on("error", (error) => {
      console.error(`[VoiceInterview] Client error for ${sessionId}:`, error);
      const state = interviewStates.get(sessionId);
      if (state) {
        state.clientDisconnectedAt = Date.now();
        state.clientWs = null;
      }
    });

    // Send reconnected message to client with current state (including provider for UI sync)
    clientWs.send(
      JSON.stringify({
        type: "connected",
        sessionId,
        questionIndex: existingState.currentQuestionIndex,
        totalQuestions: existingState.questions.length,
        currentQuestion:
          existingState.questions[existingState.currentQuestionIndex]
            ?.questionText || "",
        isResumed: true,
        persistedTranscript: existingState.fullTranscriptForPersistence,
        provider: existingState.providerType,
        vadEagerness: existingState.transcriptionQualitySignals.vadEagernessReduced ? "low" : "auto",
      }),
    );

    console.log(
      `[VoiceInterview] Session ${sessionId} reconnected successfully`,
    );
    return;
  }

  console.log(`[VoiceInterview] New connection for session: ${sessionId}`);

  // Clean up any orphaned state before creating new one
  if (existingState) {
    console.log(
      `[VoiceInterview] Cleaning up orphaned state for session: ${sessionId}`,
    );
    // Close orphaned providerWs - remove listeners first for instant cleanup
    if (existingState.providerWs) {
      existingState.providerWs.removeAllListeners();
      if (existingState.providerWs.readyState === WebSocket.OPEN) {
        existingState.providerWs.close();
      }
    }
    // Close orphaned clientWs to prevent dangling connections
    if (existingState.clientWs) {
      existingState.clientWs.removeAllListeners();
      if (existingState.clientWs.readyState === WebSocket.OPEN) {
        existingState.clientWs.close(1001, "Session replaced");
      }
    }
    if (existingState.pendingPersistTimeout) {
      clearTimeout(existingState.pendingPersistTimeout);
    }
  }

  // Initialize interview state
  const now = Date.now();
  const connectionId = randomUUID(); // Unique ID for this state instance
  const selectedProviderType =
    providerParam ||
    (process.env.REALTIME_PROVIDER as RealtimeProviderType) ||
    "openai";
  const state: InterviewState = {
    sessionId,
    connectionId,
    currentQuestionIndex: 0,
    questions: [],
    template: null,
    strategicContext: null,
    providerWs: null,
    providerType: selectedProviderType,
    providerInstance: getProvider(selectedProviderType), // Cache provider instance once
    clientWs: clientWs,
    isConnected: false,
    lastAIPrompt: "",
    isPaused: false,
    // Pause duration tracking
    pauseStartedAt: null,
    totalPauseDurationMs: 0,
    // Respondent info
    respondentInformalName: null,
    // Barbara-related state
    transcriptLog: [],
    questionMetrics: new Map(),
    speakingStartTime: null,
    questionIndexAtSpeechStart: null, // Track question at speech start for correct transcript tagging
    barbaraGuidanceQueue: [],
    isWaitingForBarbara: false,
    isBarbaraGuidanceUpdate: false,
    isInitialSession: true,
    // Audio ready handshake - prevents audio cutoff at interview start
    clientAudioReady: false,
    sessionConfigured: false,
    // Persistence state
    fullTranscriptForPersistence: [], // Complete transcript history - never truncated
    lastBarbaraGuidance: null,
    questionStates: [],
    questionSummaries: [], // Index-based array for question summaries
    pendingPersistTimeout: null,
    lastPersistAt: 0,
    isRestoredSession: false,
    awaitingResume: false,
    // Session hygiene tracking
    createdAt: now,
    lastHeartbeatAt: now,
    lastActivityAt: now,
    terminationWarned: false,
    clientDisconnectedAt: null,
    // Realtime API performance metrics
    metricsTracker: createEmptyMetricsTracker(),
    // Transcription quality tracking (noisy environment detection)
    transcriptionQualitySignals: createEmptyQualitySignals(),
    // Additional questions phase state
    isInAdditionalQuestionsPhase: false,
    additionalQuestions: [],
    currentAdditionalQuestionIndex: -1,
    additionalQuestionsConsent: null,
    additionalQuestionsGenerating: false,
    maxAdditionalQuestions: 0, // Will be set from collection later
    pendingSummaryPromises: new Map(),
    // Response state tracking - prevents concurrent response.create calls
    responseInProgress: false,
    responseStartedAt: null,
    lastResponseDoneAt: null,
  };
  interviewStates.set(sessionId, state);

  // Start watchdog if this is the first session
  startSessionWatchdog();

  // Load interview data and connect to realtime provider
  initializeInterview(sessionId, clientWs);

  // Handle messages from client
  clientWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(sessionId, message, clientWs);
    } catch (error) {
      console.error("[VoiceInterview] Error parsing client message:", error);
    }
  });

  clientWs.on("close", (code: number, reason: Buffer) => {
    const state = interviewStates.get(sessionId);
    const timeSinceHeartbeat = state?.lastHeartbeatAt
      ? Date.now() - state.lastHeartbeatAt
      : null;
    const timeSinceActivity = state?.lastActivityAt
      ? Date.now() - state.lastActivityAt
      : null;

    console.log(`[VoiceInterview] Client disconnected: ${sessionId}`, {
      closeCode: code,
      closeReason: reason?.toString() || "(none)",
      timeSinceLastHeartbeat: timeSinceHeartbeat ? `${timeSinceHeartbeat}ms` : "unknown",
      timeSinceLastActivity: timeSinceActivity ? `${timeSinceActivity}ms` : "unknown",
      sessionAge: state ? `${Date.now() - state.createdAt}ms` : "unknown",
      isPaused: state?.isPaused || false,
      questionIndex: state?.currentQuestionIndex,
    });

    // Don't immediately cleanup - mark as disconnected and let watchdog handle
    // This allows for reconnection/resume within heartbeat timeout
    if (state) {
      state.clientDisconnectedAt = Date.now();
      state.clientWs = null;
      console.log(
        `[VoiceInterview] Session ${sessionId} marked as disconnected, watchdog will cleanup after heartbeat timeout`,
      );
    }
  });

  clientWs.on("error", (error) => {
    console.error(`[VoiceInterview] Client error for ${sessionId}:`, error);
    // Same as close - mark as disconnected, let watchdog handle
    const state = interviewStates.get(sessionId);
    if (state) {
      state.clientDisconnectedAt = Date.now();
      state.clientWs = null;
    }
  });
}

async function initializeInterview(sessionId: string, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  try {
    // Load session data
    const session = await storage.getSession(sessionId);
    if (!session) {
      clientWs.send(
        JSON.stringify({ type: "error", message: "Session not found" }),
      );
      clientWs.close();
      return;
    }

    const collection = await storage.getCollection(session.collectionId);
    if (!collection) {
      clientWs.send(
        JSON.stringify({ type: "error", message: "Collection not found" }),
      );
      clientWs.close();
      return;
    }

    const template = await storage.getTemplate(collection.templateId);
    const questions = await storage.getQuestionsByTemplate(
      collection.templateId,
    );

    // Load project data for strategic context
    const project = template?.projectId
      ? await storage.getProject(template.projectId)
      : null;

    // Load respondent data for personalization
    const respondent = await storage.getRespondent(session.respondentId);
    state.respondentInformalName = respondent?.informalName || null;

    state.template = template;
    state.strategicContext = project?.strategicContext || null;
    state.questions = questions;
    state.currentQuestionIndex = session.currentQuestionIndex || 0;
    state.maxAdditionalQuestions = collection.maxAdditionalQuestions ?? 1; // Default to 1 if not set

    // Restore persisted state if available
    const hasPersistedState =
      session.liveTranscript &&
      Array.isArray(session.liveTranscript) &&
      session.liveTranscript.length > 0;

    if (hasPersistedState) {
      console.log(
        `[VoiceInterview] Restoring persisted state for session: ${sessionId}`,
      );
      state.isRestoredSession = true;
      // Set awaitingResume so audio is not forwarded until user explicitly resumes
      // This prevents OpenAI VAD from auto-responding to leaked/stray audio
      state.awaitingResume = true;

      // Restore FULL transcript to persistence buffer (never truncated - prevents data loss)
      const persistedTranscript =
        session.liveTranscript as PersistedTranscriptEntry[];
      state.fullTranscriptForPersistence = [...persistedTranscript];

      // Only keep last MAX_TRANSCRIPT_IN_MEMORY entries in memory for processing
      state.transcriptLog = persistedTranscript.slice(
        -MAX_TRANSCRIPT_IN_MEMORY,
      ) as TranscriptEntry[];

      // Restore Barbara guidance
      if (session.lastBarbaraGuidance) {
        state.lastBarbaraGuidance =
          session.lastBarbaraGuidance as PersistedBarbaraGuidance;
      }

      // Restore question states
      if (session.questionStates && Array.isArray(session.questionStates)) {
        state.questionStates =
          session.questionStates as PersistedQuestionState[];

        // Rebuild questionMetrics from persisted states
        for (const qs of state.questionStates) {
          state.questionMetrics.set(qs.questionIndex, {
            questionIndex: qs.questionIndex,
            wordCount: qs.wordCount,
            activeTimeMs: qs.activeTimeMs,
            turnCount: qs.turnCount,
            startedAt: null,
            followUpCount: qs.followUpCount ?? 0,
            recommendedFollowUps: null,
          });
        }
      }

      // Restore question summaries (index-based array)
      // Filter out null/undefined entries that may exist from sparse array serialization
      if (
        session.questionSummaries &&
        Array.isArray(session.questionSummaries)
      ) {
        const rawSummaries =
          session.questionSummaries as (QuestionSummary | null)[];
        // Rebuild as proper index-based array, filtering out nulls
        state.questionSummaries = [];
        rawSummaries.forEach((summary) => {
          if (summary && summary.questionIndex !== undefined) {
            state.questionSummaries[summary.questionIndex] = summary;
          }
        });
        const validCount = state.questionSummaries.filter(
          (s) => s != null,
        ).length;
        console.log(
          `[VoiceInterview] Restored ${validCount} question summaries (from ${rawSummaries.length} entries)`,
        );
      }

      // Restore Additional Questions (AQ) state if session was in AQ phase
      if (session.additionalQuestionPhase && session.additionalQuestions) {
        const aqData =
          session.additionalQuestions as GeneratedAdditionalQuestion[];
        if (Array.isArray(aqData) && aqData.length > 0) {
          state.additionalQuestions = aqData;
          state.isInAdditionalQuestionsPhase = true;
          state.additionalQuestionsConsent = true; // They must have consented to be in AQ phase
          state.currentAdditionalQuestionIndex =
            session.currentAdditionalQuestionIndex ?? 0;

          console.log(
            `[VoiceInterview] Restored AQ state: phase=true, aqIndex=${state.currentAdditionalQuestionIndex}/${aqData.length} questions`,
          );
        }
      }

      console.log(
        `[VoiceInterview] Restored ${state.fullTranscriptForPersistence.length} transcript entries (${state.transcriptLog.length} in memory), question ${state.currentQuestionIndex + 1}/${questions.length}`,
      );
    } else {
      // Initialize metrics for first question (new session)
      state.questionMetrics.set(0, createEmptyMetrics(0));
      updateQuestionState(state, 0, { status: "in_progress" });
    }

    // Connect to Realtime API provider
    connectToRealtimeProvider(sessionId, clientWs);
  } catch (error) {
    console.error("[VoiceInterview] Error initializing:", error);
    clientWs.send(
      JSON.stringify({
        type: "error",
        message: "Failed to initialize interview",
      }),
    );
  }
}

function connectToRealtimeProvider(sessionId: string, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  // Use cached provider instance from state
  const provider = state.providerInstance;

  console.log(
    `[VoiceInterview] Connecting to ${provider.displayName} for session: ${sessionId}`,
  );

  const providerWs = new WebSocket(provider.getWebSocketUrl(), {
    headers: provider.getWebSocketHeaders(),
  });

  state.providerWs = providerWs;
  state.providerType = provider.name;

  state.metricsTracker.openaiConnectionCount++;

  providerWs.on("open", () => {
    console.log(
      `[VoiceInterview] Connected to ${provider.displayName} for session: ${sessionId}`,
    );
    state.isConnected = true;

    const currentQuestion = state.questions[state.currentQuestionIndex];

    let instructions: string;
    if (state.isRestoredSession && state.transcriptLog.length > 0) {
      instructions = buildResumeInstructions(state);
      console.log(
        `[VoiceInterview] Using resume instructions for restored session: ${sessionId}`,
      );
    } else {
      const metrics = state.questionMetrics.get(state.currentQuestionIndex);
      const recommendedFollowUps =
        currentQuestion?.recommendedFollowUps ??
        state.template?.defaultRecommendedFollowUps ??
        null;
      instructions = buildInterviewInstructions(
        state.template,
        currentQuestion,
        state.currentQuestionIndex,
        state.questions.length,
        undefined,
        state.respondentInformalName,
        state.questions,
        { followUpCount: metrics?.followUpCount ?? 0, recommendedFollowUps },
        state.strategicContext,
      );
    }

    const sessionConfig = provider.buildSessionConfig(instructions);

    providerWs.send(
      JSON.stringify({
        type: "session.update",
        session: sessionConfig,
      }),
    );

    // Re-apply VAD eagerness if it was reduced before provider reconnection
    // This ensures the provider's turn_detection.eagerness matches our state
    if (
      state.transcriptionQualitySignals.vadEagernessReduced &&
      provider.supportsSemanticVAD()
    ) {
      console.log(
        `[VoiceInterview] Re-applying VAD eagerness "low" after provider reconnect for session: ${sessionId}`,
      );
      providerWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              create_response: true,
              interrupt_response: true,
            },
          },
        }),
      );
    }

    // Check if we're resuming an AQ session and need to restore AQ state
    if (
      state.isInAdditionalQuestionsPhase &&
      state.additionalQuestions.length > 0
    ) {
      const aqIndex = state.currentAdditionalQuestionIndex;
      const aq = state.additionalQuestions[aqIndex];

      if (aq) {
        // Update provider with AQ-specific instructions
        const aqInstructions = buildAQInstructions(
          state.template,
          aq,
          aqIndex,
          state.additionalQuestions.length,
          state.respondentInformalName,
        );
        const aqSessionConfig = provider.buildSessionConfig(aqInstructions);
        providerWs.send(
          JSON.stringify({
            type: "session.update",
            session: aqSessionConfig,
          }),
        );

        console.log(
          `[VoiceInterview] Restored AQ phase for session ${sessionId}: AQ ${aqIndex + 1}/${state.additionalQuestions.length}`,
        );

        // Send AQ state to client
        clientWs.send(
          JSON.stringify({
            type: "additional_questions_ready",
            questionCount: state.additionalQuestions.length,
            questions: state.additionalQuestions.map((q, idx) => ({
              index: idx,
              questionText: q.questionText,
              rationale: q.rationale,
            })),
          }),
        );

        clientWs.send(
          JSON.stringify({
            type: "additional_question_started",
            questionIndex: aqIndex,
            questionText: aq.questionText,
            rationale: aq.rationale,
            totalAQs: state.additionalQuestions.length,
          }),
        );
      }
    }

    clientWs.send(
      JSON.stringify({
        type: "connected",
        sessionId,
        questionIndex: state.currentQuestionIndex,
        totalQuestions: state.questions.length,
        currentQuestion: currentQuestion?.questionText,
        isResumed: state.isRestoredSession,
        persistedTranscript: state.isRestoredSession
          ? state.fullTranscriptForPersistence
          : undefined,
        provider: provider.name,
        // Include AQ state for reconnecting clients
        isInAQPhase: state.isInAdditionalQuestionsPhase,
        aqQuestions: state.isInAdditionalQuestionsPhase
          ? state.additionalQuestions.map((q, idx) => ({
              index: idx,
              questionText: q.questionText,
              rationale: q.rationale,
            }))
          : undefined,
        currentAQIndex: state.isInAdditionalQuestionsPhase
          ? state.currentAdditionalQuestionIndex
          : undefined,
        vadEagerness: state.transcriptionQualitySignals.vadEagernessReduced ? "low" : "auto",
      }),
    );
  });

  // Capture connectionId in closure to detect stale events from orphaned connections
  const capturedConnectionId = state.connectionId;

  providerWs.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());
      // Pass connectionId to detect and ignore events from orphaned connections
      handleProviderEvent(sessionId, capturedConnectionId, event);
    } catch (error) {
      console.error(
        `[VoiceInterview] Error parsing ${provider.displayName} message:`,
        error,
      );
    }
  });

  providerWs.on("close", () => {
    console.log(
      `[VoiceInterview] ${provider.displayName} connection closed for session: ${sessionId}`,
    );

    // Guard against stale closure - only update current state
    if (!isCurrentConnection(sessionId, capturedConnectionId)) {
      console.log(
        `[VoiceInterview] Ignoring close event from orphaned provider connection for ${sessionId}`,
      );
      return;
    }

    // Get current state (closure 'state' may reference orphaned object)
    const currentState = interviewStates.get(sessionId);
    if (currentState) {
      currentState.isConnected = false;
      // Reset responseInProgress on disconnect to prevent deadlock
      if (currentState.responseInProgress) {
        console.log(
          `[VoiceInterview] Resetting responseInProgress on disconnect for ${sessionId}`,
        );
        currentState.responseInProgress = false;
        currentState.responseStartedAt = null;
      }
      // Use safeSend with current clientWs from state (not stale closure)
      safeSend(
        currentState.clientWs,
        { type: "disconnected" },
        `providerWs close ${sessionId}`,
      );
    }
  });

  providerWs.on("error", (error) => {
    console.error(
      `[VoiceInterview] ${provider.displayName} error for ${sessionId}:`,
      error,
    );

    // Guard against stale closure - only notify current client
    if (!isCurrentConnection(sessionId, capturedConnectionId)) {
      console.log(
        `[VoiceInterview] Ignoring error event from orphaned provider connection for ${sessionId}`,
      );
      return;
    }

    // Get current clientWs from state (not stale closure)
    const currentState = interviewStates.get(sessionId);
    if (currentState) {
      safeSend(
        currentState.clientWs,
        { type: "error", message: "Voice service error" },
        `providerWs error ${sessionId}`,
      );
    }
  });
}

function buildInterviewInstructions(
  template: any,
  currentQuestion: any,
  questionIndex: number,
  totalQuestions: number,
  barbaraGuidance?: string,
  respondentName?: string | null,
  allQuestions?: Array<{ questionText: string }>,
  followUpContext?: {
    followUpCount: number;
    recommendedFollowUps: number | null;
  },
  strategicContext?: string | null,
): string {
  const objective = template?.objective || "Conduct a thorough interview";
  const tone = template?.tone || "professional";
  const guidance = currentQuestion?.guidance || "";

  // Build personalization context - only use name at the very start, not repeatedly
  const nameContext = respondentName
    ? `The respondent's name is "${respondentName}". Only use their name once at the very beginning of the interview as a greeting. After that, do NOT use their name again - just continue the conversation naturally without addressing them by name.`
    : "The respondent has not provided their name. Address them in a friendly but general manner.";

  // Build upcoming questions list to avoid duplicating follow-ups
  const upcomingQuestions = allQuestions
    ? allQuestions
        .slice(questionIndex + 1)
        .map((q, i) => `Q${questionIndex + 2 + i}: ${q.questionText}`)
        .join("\n")
    : "";

  let instructions = `You are Alvia, a friendly and professional AI interviewer. Your role is to conduct a voice interview in English.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

RESPONDENT:
${nameContext}

CURRENT QUESTION TO ASK:
"${currentQuestion?.questionText || "Please share your thoughts."}"

GUIDANCE FOR THIS QUESTION:
${guidance || "Listen carefully and probe for more details when appropriate."}
${
  followUpContext?.recommendedFollowUps !== null &&
  followUpContext?.recommendedFollowUps !== undefined
    ? `
FOLLOW-UP DEPTH GUIDANCE:
The researcher recommends approximately ${followUpContext.recommendedFollowUps} follow-up probe${followUpContext.recommendedFollowUps === 1 ? "" : "s"} for this question.
You've asked ${followUpContext.followUpCount} so far. This is guidance, not a strict limit.
`
    : ""
}${
    upcomingQuestions
      ? `
UPCOMING QUESTIONS (DO NOT ask follow-ups that overlap with these - they will be covered later):
${upcomingQuestions}
`
      : ""
  }
INSTRUCTIONS:
1. ${questionIndex === 0 ? `Start with a warm greeting${respondentName ? `, using their name "${respondentName}"` : ""}. Introduce yourself as Alvia and briefly explain the interview purpose: "${objective}". Then ask the first question.` : "Ask the current question naturally."}
2. Listen to the respondent's answer carefully.
3. Ask follow-up questions if the answer is too brief or unclear.
4. IMPORTANT: make sure these follow-up questions don't overlap with an UPCOMING QUESTION.
5. Use the GUIDANCE FOR THIS QUESTION to know what depth of answer is expected. Remember, this is a voice conversation, so don't expect a perfect response vs the GUIDANCE. Balance between probing for more detail and the length of the conversation about the CURRENT QUESTION.
6. Be encouraging and conversational, matching the ${tone} tone.
7. Keep responses concise - this is a voice conversation.
8. If the orchestrator's guidance is that the respondent has given a complete answer or suggests moving to the next question, say "Thank you for that answer" and signal you're ready for the next question.
9. When the orchestrator talks about the next question or moving on, she means the next question in the list above, not your next follow-up
10. The interviewee will click the Next Question button when ready to move on. You can refer to this button as "the Next Question button below" if appropriate.
11. If the current question is the last one (e.g. Current Question: 5 of 5), don't talk about moving to the next question - just wrap up the interview naturally. Tell the respondent they can "click the Complete Interview button below" to finish.`;

  if (barbaraGuidance) {
    instructions += `\n\ORCHESTRATOR'S GUIDANCE (Barbara):
${barbaraGuidance}
 Note: This guidance is based on analysis of the conversation up to a moment ago. The respondent may have said something new since then - incorporate this guidance naturally when appropriate, not necessarily immediately.`;
  }

  instructions += `

ORCHESTRATOR MESSAGES:
You will occasionally receive messages wrapped in [ORCHESTRATOR: ...] brackets. These are internal guidance from Barbara, your orchestrator. When you see these:
- DO NOT read them aloud or acknowledge receiving them
- DO NOT respond as if the respondent said them
- Simply follow the guidance naturally as if it were your own thought
- Seamlessly continue the conversation with the respondent
- The guidance may be based on a slightly earlier point in the conversation - use your judgment on timing

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return instructions;
}

function buildOverlapInstruction(
  result: TopicOverlapResult,
  questionText: string,
): string {
  const topics = result.overlappingTopics.slice(0, 2).join(" and ");

  switch (result.coverageLevel) {
    case "fully_covered":
      return `The respondent already covered ${topics} thoroughly earlier. Acknowledge this and ask if they'd like to add anything new, or if they're ready to move on. The question for reference: "${questionText}"`;
    case "partially_covered":
      return `The respondent touched on ${topics} earlier. Briefly acknowledge this connection and invite any additional thoughts, then read the question: "${questionText}"`;
    case "mentioned":
    default:
      return `The respondent mentioned ${topics} earlier. Briefly acknowledge this, then read the question: "${questionText}"`;
  }
}

function buildResumeInstructions(state: InterviewState): string {
  const template = state.template;
  const currentQuestion = state.questions[state.currentQuestionIndex];
  const questionIndex = state.currentQuestionIndex;
  const totalQuestions = state.questions.length;
  const respondentName = state.respondentInformalName;

  const objective = template?.objective || "Conduct a thorough interview";
  const tone = template?.tone || "professional";
  const strategicContext = state.strategicContext;
  const guidance = currentQuestion?.guidance || "";

  // Build transcript summary (last 10-15 entries)
  const recentTranscript = state.transcriptLog.slice(-15);
  const transcriptSummary = recentTranscript
    .map((entry) => `[${entry.speaker.toUpperCase()}]: ${entry.text}`)
    .join("\n");

  // Check question state
  const questionState = state.questionStates.find(
    (qs) => qs.questionIndex === questionIndex,
  );
  const status = questionState?.status || "in_progress";
  const barbaraSuggestedMoveOn = questionState?.barbaraSuggestedMoveOn || false;

  // Build personalization context - only use name once when welcoming back
  const nameContext = respondentName
    ? `The respondent's name is "${respondentName}". Use their name once in the welcome-back greeting, then do not use it again.`
    : "The respondent has not provided their name. Address them in a friendly but general manner.";

  // Build upcoming questions list to avoid duplicating follow-ups
  const upcomingQuestions = state.questions
    .slice(questionIndex + 1)
    .map((q, i) => `Q${questionIndex + 2 + i}: ${q.questionText}`)
    .join("\n");

  // Follow-up depth tracking
  const recommendedFollowUps =
    currentQuestion?.recommendedFollowUps ??
    state.template?.defaultRecommendedFollowUps ??
    null;
  const followUpCount =
    state.questionMetrics.get(state.currentQuestionIndex)?.followUpCount ?? 0;

  // Last Barbara guidance from before disconnection
  const lastBarbaraGuidance = state.lastBarbaraGuidance?.message;

  let instructions = `You are Alvia, a friendly and professional AI interviewer. This interview is RESUMING after a connection interruption.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

RESPONDENT:
${nameContext}

TRANSCRIPT SUMMARY (recent conversation):
${transcriptSummary || "(No previous conversation recorded)"}

CURRENT QUESTION: "${currentQuestion?.questionText || "Please share your thoughts."}"
QUESTION STATUS: ${status}

GUIDANCE FOR THIS QUESTION:
${guidance || "Listen carefully and probe for more details when appropriate."}
${
  recommendedFollowUps !== null && recommendedFollowUps !== undefined
    ? `
FOLLOW-UP DEPTH GUIDANCE:
The researcher recommends approximately ${recommendedFollowUps} follow-up probe${recommendedFollowUps === 1 ? "" : "s"} for this question.
You've asked ${followUpCount} so far. This is guidance, not a strict limit.
`
    : ""
}${
    upcomingQuestions
      ? `
UPCOMING QUESTIONS (DO NOT ask follow-ups that overlap with these - they will be covered later):
${upcomingQuestions}
`
      : ""
  }`;

  if (barbaraSuggestedMoveOn) {
    instructions += `
NOTE: Before the interruption, the respondent had given a comprehensive answer and you offered to move to the next question.
`;
  }

  instructions += `
RESUME INSTRUCTIONS:
1. Welcome them back briefly and warmly${respondentName ? `, using their name "${respondentName}"` : ""}. Keep your welcome-back greeting concise.
2. ${
    barbaraSuggestedMoveOn
      ? "The respondent had already given a comprehensive answer before the interruption. Ask if they'd like to add anything or move to the next question."
      : "Briefly remind them what you were discussing and invite them to continue their response. Do NOT repeat the full question unless specifically needed."
  }
3. Listen to the respondent's answer carefully.
4. Ask follow-up questions if the answer is too brief or unclear.
5. IMPORTANT: make sure these follow-up questions don't overlap with an UPCOMING QUESTION.
6. Use the GUIDANCE FOR THIS QUESTION to know what depth of answer is expected. Remember, this is a voice conversation, so don't expect a perfect response vs the GUIDANCE. Balance between probing for more detail and the length of the conversation about the CURRENT QUESTION.
7. Be encouraging and conversational, matching the ${tone} tone.
8. Keep responses concise - this is a voice conversation.
9. If the orchestrator's guidance is that the respondent has given a complete answer or suggests moving to the next question, say "Thank you for that answer" and signal you're ready for the next question.
10. When the orchestrator talks about the next question or moving on, she means the next question in the list above, not your next follow-up.
11. The respondent will click the Next Question button when ready to move on. You can refer to this button as "the Next Question button below" if appropriate.
12. If the current question is the last one (e.g. Current Question: ${totalQuestions} of ${totalQuestions}), don't talk about moving to the next question - just wrap up the interview naturally. Tell the respondent they can "click the Complete Interview button below" to finish.`;

  if (lastBarbaraGuidance) {
    instructions += `

ORCHESTRATOR'S GUIDANCE (Barbara):
${lastBarbaraGuidance}
Note: This guidance was provided before the connection interruption. The respondent may need a moment to re-engage - incorporate this guidance naturally when appropriate.`;
  }

  instructions += `

ORCHESTRATOR MESSAGES:
You will occasionally receive messages wrapped in [ORCHESTRATOR: ...] brackets. These are internal guidance from Barbara, your orchestrator. When you see these:
- DO NOT read them aloud or acknowledge receiving them
- DO NOT respond as if the respondent said them
- Simply follow the guidance naturally as if it were your own thought
- Seamlessly continue the conversation with the respondent
- The guidance may be based on a slightly earlier point in the conversation - use your judgment on timing

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return instructions;
}

async function handleProviderEvent(
  sessionId: string,
  connectionId: string,
  event: any,
) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  // CRITICAL: Stale connection guard - ignore events from orphaned provider connections
  // This prevents race conditions where an old providerWs (still closing) sends events
  // that corrupt the new state's timing/metrics
  if (state.connectionId !== connectionId) {
    console.warn(
      `[VoiceInterview] Ignoring stale event from orphaned connection. ` +
        `Event: ${event.type}, staleConnectionId: ${connectionId.slice(0, 8)}, ` +
        `currentConnectionId: ${state.connectionId.slice(0, 8)}, session: ${sessionId}`,
    );
    return;
  }

  // Get current clientWs from state (not closure) to handle reconnections correctly
  const clientWs = state.clientWs;
  if (!clientWs || clientWs.readyState !== WebSocket.OPEN) {
    // Client disconnected - skip sending, but still process internal state updates
    // Only return for events that purely send to client
    if (
      [
        "response.audio.delta",
        "response.output_audio.delta",
        "response.audio_transcript.delta",
        "response.output_audio_transcript.delta",
      ].includes(event.type)
    ) {
      return;
    }
  }

  switch (event.type) {
    case "session.created":
    case "conversation.created":
      console.log(
        `[VoiceInterview] Session/conversation created for ${sessionId}`,
      );
      // Don't trigger response here - wait for session.updated after configuration
      break;

    case "session.updated":
      console.log(`[VoiceInterview] Session updated for ${sessionId}`);
      // Only trigger response on initial session setup, not Barbara guidance updates
      if (state.isInitialSession) {
        state.sessionConfigured = true;
        // Check if client audio is ready - if so, trigger the initial response
        // If not, the audio_ready message handler will trigger it
        // BUT: For restored sessions, skip auto-trigger - wait for resume_interview from client
        if (
          state.clientAudioReady &&
          state.providerWs &&
          state.providerWs.readyState === WebSocket.OPEN
        ) {
          state.isInitialSession = false; // Mark initial setup complete

          // Skip auto-trigger for restored sessions - user must click mic to trigger resume
          if (state.isRestoredSession) {
            console.log(
              `[VoiceInterview] Restored session - waiting for user to click mic to resume for ${sessionId}`,
            );
            break;
          }

          if (!canCreateResponse(state)) {
            console.log(
              `[Response] Skipping initial response - response already in progress for ${sessionId}`,
            );
          } else {
            state.responseInProgress = true;
            state.responseStartedAt = Date.now();
            console.log(
              `[VoiceInterview] Client ready, triggering initial response for ${sessionId}`,
            );
            state.providerWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text", "audio"],
                },
              }),
            );
          }
        } else {
          console.log(
            `[VoiceInterview] Session configured, waiting for client audio_ready for ${sessionId}`,
          );
        }
      }
      // Reset Barbara guidance flag after any session update
      state.isBarbaraGuidanceUpdate = false;
      break;

    case "response.audio.delta":
    case "response.output_audio.delta": {
      const now = Date.now();
      // Update activity - AI speaking keeps session alive
      state.lastActivityAt = now;
      state.terminationWarned = false;

      // Track response latency (time from transcription to first audio)
      if (
        state.metricsTracker.latency.waitingForFirstAudio &&
        state.metricsTracker.latency.lastTranscriptionAt
      ) {
        const responseLatency =
          now - state.metricsTracker.latency.lastTranscriptionAt;
        state.metricsTracker.latency.responseLatencies.push(responseLatency);
        state.metricsTracker.latency.waitingForFirstAudio = false;
      }

      // Track Alvia speaking time - mark start of this response
      if (state.metricsTracker.alviaSpeaking.currentResponseStartAt === null) {
        state.metricsTracker.alviaSpeaking.currentResponseStartAt = now;

        // Record silence segment that just ended (Alvia starting to speak)
        recordSilenceSegment(state.metricsTracker, state, now);
        state.metricsTracker.silenceTracking.lastSpeechStartAt = now;
      }

      // Forward audio chunks to client
      clientWs?.send(
        JSON.stringify({
          type: "audio",
          delta: event.delta,
        }),
      );
      break;
    }

    case "response.audio.done":
    case "response.output_audio.done": {
      const now = Date.now();
      // Track Alvia speaking time - accumulate duration
      if (state.metricsTracker.alviaSpeaking.currentResponseStartAt !== null) {
        const elapsed =
          now - state.metricsTracker.alviaSpeaking.currentResponseStartAt;
        state.metricsTracker.alviaSpeaking.totalMs += elapsed;
        state.metricsTracker.alviaSpeaking.turnCount++;
        state.metricsTracker.alviaSpeaking.currentResponseStartAt = null;
      }

      // Track silence - Alvia finished speaking
      state.metricsTracker.silenceTracking.lastAlviaEndAt = now;
      state.metricsTracker.silenceTracking.lastSpeechStartAt = null;

      clientWs?.send(JSON.stringify({ type: "audio_done" }));
      break;
    }

    case "response.audio_transcript.delta":
    case "response.output_audio_transcript.delta":
      // AI's speech transcript
      clientWs?.send(
        JSON.stringify({
          type: "ai_transcript",
          delta: event.delta,
        }),
      );
      break;

    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done":
      // Store the last AI prompt for resume functionality
      if (event.transcript) {
        state.lastAIPrompt = event.transcript;
        // Add to transcript log (both in-memory and persistence buffer)
        addTranscriptEntry(state, {
          speaker: "alvia",
          text: event.transcript,
          timestamp: Date.now(),
          questionIndex: state.currentQuestionIndex,
        });
        // Schedule debounced persist
        scheduleDebouncedPersist(sessionId);
      }
      clientWs?.send(
        JSON.stringify({
          type: "ai_transcript_done",
          transcript: event.transcript,
        }),
      );
      break;

    case "conversation.item.input_audio_transcription.completed":
      // User's speech transcript (from Whisper)
      // Lag-by-one-turn: Barbara analysis is non-blocking; guidance applies to NEXT turn
      (async () => {
        // Track transcription latency (time from speech_stopped to transcription completed)
        if (state.metricsTracker.latency.lastSpeechStoppedAt) {
          const transcriptionLatency =
            Date.now() - state.metricsTracker.latency.lastSpeechStoppedAt;
          state.metricsTracker.latency.transcriptionLatencies.push(
            transcriptionLatency,
          );
          state.metricsTracker.latency.lastSpeechStoppedAt = null;
        }

        // Record transcription timestamp and prepare for response latency measurement
        state.metricsTracker.latency.lastTranscriptionAt = Date.now();
        state.metricsTracker.latency.waitingForFirstAudio = true;

        if (event.transcript) {
          // CRITICAL: Use questionIndexAtSpeechStart if available to avoid race condition
          // where user clicks "next_question" before transcription completes
          const correctQuestionIndex =
            state.questionIndexAtSpeechStart ?? state.currentQuestionIndex;

          // Transcription quality detection (noisy environment handling)
          const wasQuestionRepeated = detectQuestionRepeat(
            state,
            correctQuestionIndex,
          );
          // Get question type for short-utterance tracking (skip for yes_no, scale, numeric)
          const currentQuestionForQuality = state.questions[correctQuestionIndex];
          const qualityResult = updateQualitySignals(
            state.transcriptionQualitySignals,
            event.transcript,
            wasQuestionRepeated,
            currentQuestionForQuality?.type,
          );
          state.transcriptionQualitySignals = qualityResult.signals;

          if (qualityResult.detectedIssues.length > 0) {
            console.log(
              `[TranscriptionQuality] Session ${sessionId}: ${qualityResult.detectedIssues.join(", ")}`,
            );
          }

          // Trigger environment check if quality signals indicate issues
          // Re-triggering allowed after cooldown (5 utterances) by resetting the guard
          if (
            qualityResult.shouldTriggerEnvironmentCheck &&
            state.transcriptionQualitySignals.environmentCheckTriggered &&
            state.transcriptionQualitySignals.utterancesSinceEnvironmentCheck >= 5
          ) {
            state.transcriptionQualitySignals.environmentCheckTriggered = false;
          }

          if (
            qualityResult.shouldTriggerEnvironmentCheck &&
            !state.transcriptionQualitySignals.environmentCheckTriggered
          ) {
            state.transcriptionQualitySignals.environmentCheckTriggered = true;
            state.transcriptionQualitySignals.environmentCheckTriggeredAt =
              Date.now();
            state.transcriptionQualitySignals.utterancesSinceEnvironmentCheck = 0;

            console.log(
              `[TranscriptionQuality] Triggering environment check for session ${sessionId}`,
            );

            // Send quality warning to client
            const currentClientWs = interviewStates.get(sessionId)?.clientWs;
            currentClientWs?.send(
              JSON.stringify({
                type: "transcription_quality_warning",
                issues: qualityResult.detectedIssues,
                qualityScore: calculateQualityScore(
                  state.transcriptionQualitySignals,
                ),
              }),
            );

            // Inject environment check guidance for Alvia
            injectEnvironmentCheckGuidance(state, sessionId);
          }

          // Sanitize transcript to remove connection glitches (e.g., "we we we we...")
          const sanitizedTranscript = sanitizeGlitchedTranscript(
            event.transcript,
          );

          // Update good utterance tracking for VAD recovery (uses sanitized transcript)
          updateGoodUtteranceTracking(
            state.transcriptionQualitySignals,
            sanitizedTranscript,
          );

          // VAD eagerness adjustment (separate from environment check - different problems)
          // Reduce eagerness when we detect VAD timing issues (short utterance streak without hallucinations)
          if (shouldReduceVadEagerness(state.transcriptionQualitySignals)) {
            state.transcriptionQualitySignals.vadEagernessReduced = true;
            state.transcriptionQualitySignals.vadEagernessReducedAt = Date.now();
            state.transcriptionQualitySignals.consecutiveGoodUtterances = 0;
            sendVadEagernessUpdate(state, sessionId, "low");
          }

          // Restore eagerness when quality improves (10 consecutive good utterances)
          if (shouldRestoreVadEagerness(state.transcriptionQualitySignals)) {
            state.transcriptionQualitySignals.vadEagernessReduced = false;
            state.transcriptionQualitySignals.vadEagernessReducedAt = null;
            state.transcriptionQualitySignals.consecutiveGoodUtterances = 0;
            sendVadEagernessUpdate(state, sessionId, "auto");
          }

          // Add to transcript log (both in-memory and persistence buffer)
          addTranscriptEntry(state, {
            speaker: "respondent",
            text: sanitizedTranscript,
            timestamp: Date.now(),
            questionIndex: correctQuestionIndex,
          });

          // Clear the speech start tracking
          state.questionIndexAtSpeechStart = null;

          // Update question metrics and state
          const metrics =
            state.questionMetrics.get(state.currentQuestionIndex) ||
            createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += sanitizedTranscript
            .split(/\s+/)
            .filter((w: string) => w.length > 0).length;
          metrics.turnCount++;
          state.questionMetrics.set(state.currentQuestionIndex, metrics);

          // Update question state with metrics
          updateQuestionState(state, state.currentQuestionIndex, {
            status: "in_progress",
          });

          // Schedule debounced persist
          scheduleDebouncedPersist(sessionId);

          // Trigger Barbara analysis asynchronously (non-blocking)
          // Her guidance will apply to the NEXT turn, not this one
          // Response is automatically created by provider due to create_response: true
          triggerBarbaraAnalysis(sessionId).catch((error) => {
            console.error(`[Barbara] Analysis failed for ${sessionId}:`, error);
          });
        }
        // Re-fetch clientWs from state in case of reconnection during async processing
        const currentClientWs = interviewStates.get(sessionId)?.clientWs;
        currentClientWs?.send(
          JSON.stringify({
            type: "user_transcript",
            transcript: event.transcript,
          }),
        );
      })();
      break;

    case "input_audio_buffer.speech_started": {
      const now = Date.now();
      // Start timing when user starts speaking and capture the current question index
      // This ensures transcript entries are tagged with the question they were answering,
      // not the question that's current when the transcription completes (race condition fix)
      if (!state.isPaused) {
        state.speakingStartTime = now;
        state.questionIndexAtSpeechStart = state.currentQuestionIndex;
      }

      // Record silence segment that just ended (respondent starting to speak)
      recordSilenceSegment(state.metricsTracker, state, now);
      state.metricsTracker.silenceTracking.lastSpeechStartAt = now;

      clientWs?.send(JSON.stringify({ type: "user_speaking_started" }));
      break;
    }

    case "input_audio_buffer.speech_stopped": {
      const now = Date.now();
      // Stop timing and accumulate - use questionIndexAtSpeechStart for consistency
      if (state.speakingStartTime && !state.isPaused) {
        const elapsed = now - state.speakingStartTime;
        // Use the question index at speech start to correctly attribute time
        const correctQuestionIndex =
          state.questionIndexAtSpeechStart ?? state.currentQuestionIndex;
        const metrics =
          state.questionMetrics.get(correctQuestionIndex) ||
          createEmptyMetrics(correctQuestionIndex);
        metrics.activeTimeMs += elapsed;
        state.questionMetrics.set(correctQuestionIndex, metrics);
        state.speakingStartTime = null;
        // Note: don't clear questionIndexAtSpeechStart here - transcription may still be pending
      }

      // Track timestamp for transcription latency measurement
      state.metricsTracker.latency.lastSpeechStoppedAt = now;

      // Track silence - respondent finished speaking
      state.metricsTracker.silenceTracking.lastRespondentEndAt = now;
      state.metricsTracker.silenceTracking.lastSpeechStartAt = null;

      clientWs?.send(JSON.stringify({ type: "user_speaking_stopped" }));
      break;
    }

    case "response.done": {
      // Reset response tracking state - allows next response.create
      state.responseInProgress = false;
      state.responseStartedAt = null;
      state.lastResponseDoneAt = Date.now();

      // Use cached provider instance to avoid allocation on every response
      const tokenUsage = state.providerInstance.parseTokenUsage(event);
      if (tokenUsage) {
        state.metricsTracker.tokens.inputTokens += tokenUsage.inputTokens;
        state.metricsTracker.tokens.outputTokens += tokenUsage.outputTokens;
        state.metricsTracker.tokens.inputAudioTokens +=
          tokenUsage.inputAudioTokens;
        state.metricsTracker.tokens.outputAudioTokens +=
          tokenUsage.outputAudioTokens;
        state.metricsTracker.tokens.inputTextTokens +=
          tokenUsage.inputTextTokens;
        state.metricsTracker.tokens.outputTextTokens +=
          tokenUsage.outputTextTokens;
        console.log(
          `[Metrics] Token usage for ${sessionId} (${state.providerInstance.displayName}): input=${tokenUsage.inputTokens}, output=${tokenUsage.outputTokens}`,
        );
      }
      clientWs?.send(JSON.stringify({ type: "response_done" }));
      break;
    }

    case "error": {
      const errorCode = event.error?.code;
      const errorMessage = event.error?.message || "Voice service error";

      // Handle specific recoverable errors gracefully
      if (errorCode === "conversation_already_has_active_response") {
        // This error means we tried to create a response while one was in progress
        // Log but don't change responseInProgress - the active response will finish and trigger response.done
        console.warn(
          `[VoiceInterview] Response already in progress for ${sessionId}, waiting for response.done`,
        );
        // Don't send error to client - this is recoverable
        break;
      }

      // Generic error - log and propagate to client
      console.error(`[VoiceInterview] Provider error:`, event.error);
      clientWs?.send(
        JSON.stringify({
          type: "error",
          message: errorMessage,
        }),
      );
      break;
    }
  }
}

// Reduced timeout since Barbara analysis is now non-blocking (lag-by-one-turn architecture)
// Barbara has more time to analyze since her guidance applies to the NEXT turn
const BARBARA_TIMEOUT_MS = 5000;

function injectEnvironmentCheckGuidance(
  state: InterviewState,
  sessionId: string,
): void {
  const guidanceMessage = `AUDIO QUALITY CONCERN: You are having difficulty hearing the respondent clearly due to background noise or audio quality issues. 
Politely say something like: "I'm sorry, I'm having a little trouble hearing you clearly. Would you be able to move somewhere quieter, or speak a bit closer to your microphone?" 
Then continue the interview naturally once they acknowledge.`;

  const environmentGuidance: BarbaraGuidance = {
    action: "suggest_environment_check",
    message: guidanceMessage,
    confidence: 0.95,
    reasoning:
      "Transcription quality signals indicate noisy environment or poor audio",
  };

  state.barbaraGuidanceQueue.push(environmentGuidance);

  state.lastBarbaraGuidance = {
    ...environmentGuidance,
    timestamp: Date.now(),
    questionIndex: state.currentQuestionIndex,
  } as PersistedBarbaraGuidance;

  if (state.providerWs?.readyState === WebSocket.OPEN) {
    const basePrompt = state.lastAIPrompt || "";
    const updatedPrompt = `${basePrompt}\n\n${guidanceMessage}`;

    state.providerWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: updatedPrompt,
        },
      }),
    );

    console.log(
      `[TranscriptionQuality] Injected environment check guidance for session ${sessionId}`,
    );
  }

  const currentClientWs = interviewStates.get(sessionId)?.clientWs;
  currentClientWs?.send(
    JSON.stringify({
      type: "barbara_guidance",
      guidance: environmentGuidance,
    }),
  );
}

function sendVadEagernessUpdate(
  state: InterviewState,
  sessionId: string,
  eagerness: "auto" | "low",
): void {
  if (!state.providerInstance.supportsSemanticVAD()) {
    return;
  }

  if (state.providerWs?.readyState !== WebSocket.OPEN) {
    return;
  }

  state.providerWs.send(
    JSON.stringify({
      type: "session.update",
      session: {
        turn_detection: {
          type: "semantic_vad",
          eagerness: eagerness,
          create_response: true,
          interrupt_response: true,
        },
      },
    }),
  );

  // Also notify client of eagerness change (for debugging indicator)
  if (state.clientWs?.readyState === WebSocket.OPEN) {
    state.clientWs.send(
      JSON.stringify({
        type: "vad_eagerness_update",
        eagerness: eagerness,
      }),
    );
  }

  console.log(
    `[VadEagerness] Session ${sessionId}: Changed eagerness to "${eagerness}"`,
  );
}

async function triggerBarbaraAnalysis(
  sessionId: string,
): Promise<BarbaraGuidance | null> {
  const state = interviewStates.get(sessionId);
  if (!state || state.isWaitingForBarbara) return null;

  // Don't analyze if we don't have enough transcript
  if (state.transcriptLog.length < 2) return null;

  state.isWaitingForBarbara = true;
  console.log(`[Barbara] Analyzing conversation for session: ${sessionId}`);

  try {
    const currentQuestion = state.questions[state.currentQuestionIndex];
    const metrics =
      state.questionMetrics.get(state.currentQuestionIndex) ||
      createEmptyMetrics(state.currentQuestionIndex);

    // Wrap Barbara call with timeout - store timeout ID to clear on success
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<BarbaraGuidance>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Barbara timeout")),
        BARBARA_TIMEOUT_MS,
      );
    });

    const analysisPromise = analyzeWithBarbara({
      transcriptLog: state.transcriptLog,
      previousQuestionSummaries: state.questionSummaries.filter(
        (s) => s != null,
      ),
      currentQuestionIndex: state.currentQuestionIndex,
      currentQuestion: {
        text: currentQuestion?.questionText || "",
        guidance: currentQuestion?.guidance || "",
      },
      allQuestions: state.questions.map((q: any) => ({
        text: q.questionText || "",
        guidance: q.guidance || "",
      })),
      questionMetrics: metrics,
      templateObjective: state.template?.objective || "",
      templateTone: state.template?.tone || "professional",
    });

    const guidance = await Promise.race([analysisPromise, timeoutPromise]);

    // Clear the timeout to prevent memory leak from lingering timers
    clearTimeout(timeoutId!);

    console.log(`[Barbara] Guidance for ${sessionId}:`);
    console.log(
      `  Action: ${guidance.action} (confidence: ${guidance.confidence})`,
    );
    console.log(`  Message: ${guidance.message}`);
    console.log(`  Reasoning: ${guidance.reasoning}`);

    // Only inject guidance if Barbara has something meaningful to say
    if (guidance.action !== "none" && guidance.confidence > 0.6) {
      state.barbaraGuidanceQueue.push(guidance);

      // For suggest_next_question, craft a flexible message that works regardless of timing
      let guidanceMessage = guidance.message;
      if (guidance.action === "suggest_next_question") {
        guidanceMessage =
          "Based on the conversation so far, the respondent has provided a comprehensive answer to this question. When there's a natural pause or you finish responding to their latest point, warmly offer to move on. You might say something like: 'Thank you for sharing that. Is there anything else you'd like to add, or shall we move to the next question?' Wait for their response - they will click the Next Question button when ready.";
      }

      // Inject guidance by updating session instructions (system context)
      if (state.providerWs && state.providerWs.readyState === WebSocket.OPEN) {
        const recommendedFollowUps =
          currentQuestion?.recommendedFollowUps ??
          state.template?.defaultRecommendedFollowUps ??
          null;
        const updatedInstructions = buildInterviewInstructions(
          state.template,
          currentQuestion,
          state.currentQuestionIndex,
          state.questions.length,
          guidanceMessage,
          state.respondentInformalName,
          state.questions,
          { followUpCount: metrics.followUpCount, recommendedFollowUps },
          state.strategicContext,
        );

        // Log the complete Alvia prompt when Barbara issues guidance
        console.log(
          `\n[Alvia] Complete prompt with Barbara's guidance for ${sessionId}:`,
        );
        console.log("=".repeat(80));
        console.log(updatedInstructions);
        console.log("=".repeat(80) + "\n");

        state.providerWs.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: updatedInstructions,
            },
          }),
        );
      }

      // Increment follow-up count when probe_followup action is taken
      if (guidance.action === "probe_followup") {
        metrics.followUpCount++;
        // Update persisted question state with new follow-up count
        updateQuestionState(state, state.currentQuestionIndex, {
          followUpCount: metrics.followUpCount,
        });
        console.log(
          `[Barbara] Follow-up count for Q${state.currentQuestionIndex + 1}: ${metrics.followUpCount}` +
            (metrics.recommendedFollowUps !== null
              ? ` (recommended: ${metrics.recommendedFollowUps})`
              : ""),
        );
      }

      // Notify client about Barbara's guidance (for debugging/transparency)
      // Also signal to highlight the Next Question button when appropriate
      state.clientWs?.send(
        JSON.stringify({
          type: "barbara_guidance",
          action: guidance.action,
          message: guidance.message,
          confidence: guidance.confidence,
          highlightNextQuestion: guidance.action === "suggest_next_question",
        }),
      );

      // Persist Barbara guidance immediately
      await persistBarbaraGuidance(sessionId, guidance);

      return guidance;
    }

    return null;
  } catch (error) {
    if ((error as Error).message === "Barbara timeout") {
      console.warn(`[Barbara] Analysis timed out for session: ${sessionId}`);
    } else {
      console.error(`[Barbara] Error during analysis:`, error);
    }
    return null;
  } finally {
    state.isWaitingForBarbara = false;
  }
}

async function handleClientMessage(
  sessionId: string,
  message: any,
  clientWs: WebSocket,
) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  // Handle heartbeat immediately, before other processing
  if (message.type === "heartbeat.ping") {
    state.lastHeartbeatAt = Date.now();
    // Reset warning flag on activity
    state.terminationWarned = false;
    clientWs.send(JSON.stringify({ type: "heartbeat.pong" }));
    return;
  }

  // Handle audio_ready - client signals its audio context is ready to receive audio
  if (message.type === "audio_ready") {
    console.log(`[VoiceInterview] Client audio ready for ${sessionId}`);
    state.clientAudioReady = true;
    // Check if session is already configured - if so, trigger the initial response
    // BUT: For restored/resumed sessions, do NOT auto-trigger - wait for resume_interview from client
    if (
      state.isInitialSession &&
      state.sessionConfigured &&
      state.providerWs &&
      state.providerWs.readyState === WebSocket.OPEN
    ) {
      // Skip auto-trigger for restored sessions - user must click mic to trigger resume
      if (state.isRestoredSession) {
        console.log(
          `[VoiceInterview] Restored session - waiting for user to click mic to resume for ${sessionId}`,
        );
        state.isInitialSession = false;
        return;
      }

      state.isInitialSession = false;
      if (!canCreateResponse(state)) {
        console.log(
          `[Response] Skipping initial response (audio_ready) - response already in progress for ${sessionId}`,
        );
      } else {
        state.responseInProgress = true;
        state.responseStartedAt = Date.now();
        console.log(
          `[VoiceInterview] Session configured, triggering initial response for ${sessionId}`,
        );
        state.providerWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
            },
          }),
        );
      }
    }
    return;
  }

  if (!state.providerWs) return;

  switch (message.type) {
    case "audio":
      // Gate audio forwarding on pause/resume state
      // IMPORTANT: Check BEFORE updating lastActivityAt so leaked audio doesn't keep session alive
      if (state.isPaused || state.awaitingResume) {
        // Don't forward audio while paused or waiting for explicit resume
        // This prevents OpenAI VAD from auto-responding to stray audio
        break;
      }
      // Update activity timestamp AFTER gating check
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;
      // Forward audio from client to provider
      if (state.providerWs.readyState === WebSocket.OPEN) {
        state.providerWs.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: message.audio,
          }),
        );
      }
      break;

    case "commit_audio":
      // Commit audio buffer - response will be created after transcription + Barbara analysis
      // With server_vad and create_response: false, the transcription handler triggers the response
      if (state.providerWs.readyState === WebSocket.OPEN) {
        state.providerWs.send(
          JSON.stringify({
            type: "input_audio_buffer.commit",
          }),
        );
        // Don't trigger response.create here - it will be triggered after Barbara analysis
        // in the conversation.item.input_audio_transcription.completed handler
      }
      break;

    case "text_input":
      // Update activity timestamp
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;
      // Handle text input from keyboard (use async IIFE to await Barbara)
      (async () => {
        if (
          state.providerWs &&
          state.providerWs.readyState === WebSocket.OPEN &&
          message.text
        ) {
          // Sanitize transcript to remove connection glitches (e.g., "we we we we...")
          const sanitizedText = sanitizeGlitchedTranscript(message.text);

          // Add to transcript log (both in-memory and persistence buffer)
          addTranscriptEntry(state, {
            speaker: "respondent",
            text: sanitizedText,
            timestamp: Date.now(),
            questionIndex: state.currentQuestionIndex,
          });

          // Update metrics
          const metrics =
            state.questionMetrics.get(state.currentQuestionIndex) ||
            createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += sanitizedText
            .split(/\s+/)
            .filter((w: string) => w.length > 0).length;
          metrics.turnCount++;
          state.questionMetrics.set(state.currentQuestionIndex, metrics);

          // Update question state
          updateQuestionState(state, state.currentQuestionIndex, {
            status: "in_progress",
          });

          // Schedule debounced persist
          scheduleDebouncedPersist(sessionId);

          // Add user text as a conversation item
          state.providerWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: message.text,
                  },
                ],
              },
            }),
          );

          // Trigger Barbara analysis asynchronously (non-blocking)
          // Her guidance will apply to the NEXT turn, not this one
          triggerBarbaraAnalysis(sessionId).catch((error) => {
            console.error(`[Barbara] Analysis failed for ${sessionId}:`, error);
          });

          // For text input, we still need to manually trigger response
          // (unlike audio mode where create_response: true handles it)
          if (
            state.providerWs &&
            state.providerWs.readyState === WebSocket.OPEN
          ) {
            if (!canCreateResponse(state)) {
              console.log(
                `[Response] Skipping text input response - response already in progress for ${sessionId}`,
              );
            } else {
              state.responseInProgress = true;
              state.responseStartedAt = Date.now();
              state.providerWs.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    modalities: ["text", "audio"],
                  },
                }),
              );
            }
          }
        }
      })();
      break;

    case "pause_interview":
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;
      state.isPaused = true;
      // Track pause start time for accurate silence metrics
      state.pauseStartedAt = Date.now();
      // Clear any buffered audio in provider to prevent ghost responses from accumulated audio
      // This ensures pause takes effect immediately even if there's audio already buffered
      if (state.providerWs && state.providerWs.readyState === WebSocket.OPEN) {
        state.providerWs.send(
          JSON.stringify({
            type: "input_audio_buffer.clear",
          }),
        );
      }
      // Stop timing if currently speaking
      if (state.speakingStartTime) {
        const elapsed = Date.now() - state.speakingStartTime;
        const metrics =
          state.questionMetrics.get(state.currentQuestionIndex) ||
          createEmptyMetrics(state.currentQuestionIndex);
        metrics.activeTimeMs += elapsed;
        state.questionMetrics.set(state.currentQuestionIndex, metrics);
        state.speakingStartTime = null;
      }
      // Flush pending persist immediately on pause
      flushPersist(sessionId);
      // Also update session status in database
      storage.persistInterviewState(sessionId, {
        status: "paused",
        pausedAt: new Date(),
      });
      console.log(
        `[VoiceInterview] Interview paused for session: ${sessionId}`,
      );
      break;

    case "resume_interview": {
      // FIRST: Accumulate pause duration before clearing pause state
      // This ensures accurate silence metrics that distinguish pause time from active silence
      if (state.pauseStartedAt) {
        const pauseDuration = Date.now() - state.pauseStartedAt;
        state.totalPauseDurationMs += pauseDuration;
        console.log(
          `[VoiceInterview] Pause duration: ${pauseDuration}ms, total paused: ${state.totalPauseDurationMs}ms`,
        );
        state.pauseStartedAt = null;
      }

      // Reset silence tracking reference points to avoid inflated silence segments
      // that would otherwise include the pause time (when no audio was streaming)
      const tracker = state.metricsTracker;
      const now = Date.now();
      tracker.silenceTracking.lastAlviaEndAt = now;
      tracker.silenceTracking.lastRespondentEndAt = now;

      state.lastActivityAt = now;
      state.terminationWarned = false;
      // Handle resume from pause - Alvia decides what to say based on transcript context
      state.isPaused = false;
      // Clear awaitingResume flag so audio forwarding is re-enabled
      state.awaitingResume = false;
      // Update session status back to in_progress
      storage.persistInterviewState(sessionId, {
        status: "in_progress",
        pausedAt: null,
      });
      console.log(
        `[VoiceInterview] Interview resuming for session: ${sessionId}`,
      );

      if (state.providerWs && state.providerWs.readyState === WebSocket.OPEN) {
        const currentQuestion = state.questions[state.currentQuestionIndex];

        // Check the transcript to determine how to resume
        // Look at recent Alvia messages to see if she already welcomed back after a pause
        const recentTranscript = state.transcriptLog.slice(-5);
        const lastAlviaMessage = recentTranscript
          .filter((entry) => entry.speaker === "alvia")
          .pop();

        // Build context for Alvia to decide what to say
        const transcriptContext = recentTranscript
          .map((entry) => `[${entry.speaker.toUpperCase()}]: ${entry.text}`)
          .join("\n");

        const currentQuestionText =
          currentQuestion?.questionText || "the question";

        // Let Alvia decide based on transcript context
        state.providerWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `[ORCHESTRATOR: The interview was paused and has now resumed. Review the recent transcript context below and decide how to welcome back the respondent:

RECENT TRANSCRIPT:
${transcriptContext || "(No recent messages)"}

CURRENT QUESTION: "${currentQuestionText}"

INSTRUCTIONS: 
- If your last message already repeated or summarized the question (from a previous resume), DO NOT repeat the question again. Simply say something brief like "Welcome back! Please go ahead and continue your response whenever you're ready."
- If the question hasn't been restated recently, briefly remind them of what you were discussing and invite them to continue.
- Be warm and encouraging, but keep it concise.]`,
                },
              ],
            },
          }),
        );

        // Trigger AI response
        if (!canCreateResponse(state)) {
          console.log(
            `[Response] Skipping resume response - response already in progress for ${sessionId}`,
          );
        } else {
          state.responseInProgress = true;
          state.responseStartedAt = Date.now();
          state.providerWs.send(
            JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["text", "audio"],
              },
            }),
          );
        }
      }
      break;
    }

    case "next_question":
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;
      // Move to next question
      if (state.currentQuestionIndex < state.questions.length - 1) {
        const previousIndex = state.currentQuestionIndex;

        // CRITICAL: Capture transcript snapshot BEFORE updating currentQuestionIndex
        // This ensures the summary generation has the correct transcript state
        const transcriptSnapshot = [
          ...state.fullTranscriptForPersistence,
        ] as TranscriptEntry[];

        // Trigger summarization in background with the pre-captured snapshot
        generateAndPersistSummary(
          sessionId,
          previousIndex,
          transcriptSnapshot,
        ).catch(() => {
          // Error already logged in generateAndPersistSummary
        });

        // Immediately move to next question (don't wait for summary)
        state.currentQuestionIndex++;
        const nextQuestion = state.questions[state.currentQuestionIndex];

        // Initialize metrics for new question
        state.questionMetrics.set(
          state.currentQuestionIndex,
          createEmptyMetrics(state.currentQuestionIndex),
        );

        // Clear Barbara's last guidance as we're moving to a new question
        state.lastBarbaraGuidance = null;

        // Persist question state changes immediately
        persistNextQuestion(
          sessionId,
          previousIndex,
          state.currentQuestionIndex,
        );

        // Update session instructions for new question
        const newMetrics = state.questionMetrics.get(
          state.currentQuestionIndex,
        );
        const recommendedFollowUps =
          nextQuestion?.recommendedFollowUps ??
          state.template?.defaultRecommendedFollowUps ??
          null;
        const instructions = buildInterviewInstructions(
          state.template,
          nextQuestion,
          state.currentQuestionIndex,
          state.questions.length,
          undefined,
          state.respondentInformalName,
          state.questions,
          {
            followUpCount: newMetrics?.followUpCount ?? 0,
            recommendedFollowUps,
          },
          state.strategicContext,
        );

        if (state.providerWs.readyState === WebSocket.OPEN) {
          // Update session with new question context
          state.providerWs.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: instructions,
              },
            }),
          );

          // Handle overlap detection and response asynchronously
          (async () => {
            let transitionInstruction = `The respondent has clicked Next Question - the previous question is now COMPLETE. Do NOT ask follow-ups about it. Simply give a brief acknowledgment (one or two words like "Great" or "Thank you") and then ask this question aloud: "${nextQuestion?.questionText}"`;

            // Add confirmation checkpoint if transcription quality is low
            const qualityScore = calculateQualityScore(
              state.transcriptionQualitySignals,
            );
            if (
              qualityScore < 70 &&
              state.transcriptionQualitySignals.totalRespondentUtterances > 3
            ) {
              const previousQuestion = state.questions[previousIndex];
              const recentRespondentText = state.transcriptLog
                .filter(
                  (e) =>
                    e.questionIndex === previousIndex &&
                    e.speaker === "respondent",
                )
                .slice(-3)
                .map((e) => e.text)
                .join(" ");

              if (recentRespondentText.length > 20) {
                const briefSummary = recentRespondentText.slice(0, 150);
                transitionInstruction = `The respondent has clicked Next Question. IMPORTANT: Before moving on, briefly confirm what you heard since audio quality may have been unclear. Say something like: "Before we continue - I want to make sure I understood you correctly. It sounds like you said [paraphrase key points from: "${briefSummary}..."]. Is that right?" Then, once confirmed, ask the next question: "${nextQuestion?.questionText}"`;
                console.log(
                  `[TranscriptionQuality] Adding confirmation checkpoint for Q${previousIndex + 1} (score: ${qualityScore})`,
                );
              }
            }

            // Gather context for overlap detection
            const completedSummaries = state.questionSummaries.filter(
              (s): s is QuestionSummary => s != null,
            );

            // Get recent respondent statements from the question we just left (last 10 entries)
            const recentTranscript = state.transcriptLog
              .filter(
                (e) =>
                  e.questionIndex === previousIndex &&
                  e.speaker === "respondent",
              )
              .slice(-10);

            // Only attempt detection if we have some context
            if (completedSummaries.length > 0 || recentTranscript.length > 0) {
              console.log(
                `[TopicOverlap] Checking Q${state.currentQuestionIndex + 1} against ${completedSummaries.length} summaries and ${recentTranscript.length} transcript entries`,
              );
              try {
                const overlapResult = await detectTopicOverlap(
                  nextQuestion?.questionText || "",
                  completedSummaries,
                  recentTranscript,
                );

                if (
                  overlapResult?.hasOverlap &&
                  overlapResult.overlappingTopics.length > 0
                ) {
                  transitionInstruction = buildOverlapInstruction(
                    overlapResult,
                    nextQuestion?.questionText || "",
                  );
                  console.log(
                    `[TopicOverlap] Detected: ${overlapResult.overlappingTopics.join(", ")} (${overlapResult.coverageLevel})`,
                  );
                } else {
                  console.log(
                    `[TopicOverlap] No overlap detected for Q${state.currentQuestionIndex + 1}`,
                  );
                }
              } catch (error) {
                console.error("[TopicOverlap] Error during detection:", error);
                // Continue with default instruction on error
              }
            }

            // Trigger Alvia to read the new question aloud
            console.log(
              `[TopicOverlap] Transition instruction: ${transitionInstruction.substring(0, 150)}...`,
            );
            if (
              state.providerWs &&
              state.providerWs.readyState === WebSocket.OPEN
            ) {
              // Inject the transition instruction as a conversation item first
              state.providerWs.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: `[ORCHESTRATOR: ${transitionInstruction}]`,
                      },
                    ],
                  },
                }),
              );
              // Then trigger the response
              if (!canCreateResponse(state)) {
                console.log(
                  `[Response] Skipping topic overlap response - response already in progress for ${sessionId}`,
                );
              } else {
                state.responseInProgress = true;
                state.responseStartedAt = Date.now();
                state.providerWs.send(
                  JSON.stringify({
                    type: "response.create",
                    response: {
                      modalities: ["text", "audio"],
                    },
                  }),
                );
              }
            } else {
              console.warn(
                "[TopicOverlap] WebSocket closed before sending transition instruction",
              );
            }
          })();
        }

        clientWs.send(
          JSON.stringify({
            type: "question_changed",
            questionIndex: state.currentQuestionIndex,
            totalQuestions: state.questions.length,
            currentQuestion: nextQuestion?.questionText,
          }),
        );
      } else {
        // On last question - check if AQs are enabled and should be offered
        // Instead of bypassing AQ entirely, prompt the client to show the consent dialog
        const shouldOfferAQ =
          ADDITIONAL_QUESTIONS_ENABLED &&
          state.maxAdditionalQuestions > 0 &&
          !state.additionalQuestionsConsent &&
          !state.isInAdditionalQuestionsPhase;

        if (shouldOfferAQ) {
          // Send message to prompt AQ consent dialog on the client
          clientWs.send(
            JSON.stringify({
              type: "prompt_additional_questions_consent",
              message:
                "Please confirm whether you'd like additional questions.",
            }),
          );
        } else {
          // AQs disabled or already handled - complete the interview
          await storage.persistInterviewState(sessionId, {
            status: "completed",
            completedAt: new Date(),
          });
          clientWs.send(JSON.stringify({ type: "interview_complete" }));
          cleanupSession(sessionId, "completed");
        }
      }
      break;

    case "end_interview": {
      state.lastActivityAt = Date.now();
      // Trigger summarization for final question and await it before cleanup
      // Capture transcript snapshot for the final question
      const endFinalTranscriptSnapshot = [
        ...state.fullTranscriptForPersistence,
      ] as TranscriptEntry[];
      const endFinalQuestionIdx = state.currentQuestionIndex;

      // Track the summary promise and await it before completing
      const endSummaryPromise = generateAndPersistSummary(
        sessionId,
        endFinalQuestionIdx,
        endFinalTranscriptSnapshot,
      );
      state.pendingSummaryPromises.set(endFinalQuestionIdx, endSummaryPromise);

      // Await all pending summaries (including the final one)
      await awaitPendingSummaries(sessionId);

      // Update session status to completed
      await storage.persistInterviewState(sessionId, {
        status: "completed",
        completedAt: new Date(),
      });
      clientWs.send(JSON.stringify({ type: "interview_complete" }));
      cleanupSession(sessionId, "completed");
      break;
    }

    case "request_additional_questions":
      // User consented to additional questions - start Barbara analysis
      state.lastActivityAt = Date.now();
      state.additionalQuestionsConsent = true;
      state.additionalQuestionsGenerating = true;

      // First, trigger summary generation for the final question (current question)
      // Capture transcript snapshot BEFORE AQ generation
      const finalQuestionTranscriptSnapshot = [
        ...state.fullTranscriptForPersistence,
      ] as TranscriptEntry[];

      // Start summary generation for final question and track the promise
      const finalQuestionIdx = state.currentQuestionIndex;
      const summaryPromise = generateAndPersistSummary(
        sessionId,
        finalQuestionIdx,
        finalQuestionTranscriptSnapshot,
      ).catch((err) => {
        console.error(`[AQ] Error generating final question summary:`, err);
      });
      state.pendingSummaryPromises.set(finalQuestionIdx, summaryPromise);

      clientWs.send(
        JSON.stringify({
          type: "additional_questions_generating",
          message:
            "Barbara is analyzing your interview to identify follow-up questions...",
        }),
      );

      // Pause the provider during AQ generation to prevent stale responses
      // Send a session update with "waiting" instructions
      if (state.providerWs && state.providerWs.readyState === WebSocket.OPEN) {
        const waitingInstructions = `You are currently paused while we prepare follow-up questions. 
If the respondent speaks, politely acknowledge and let them know you'll be with them shortly. 
Say something like: "Just a moment while we prepare some follow-up questions for you."
Do not attempt to answer any questions or continue the interview.`;

        const waitingSessionConfig =
          state.providerInstance.buildSessionConfig(waitingInstructions);
        state.providerWs.send(
          JSON.stringify({
            type: "session.update",
            session: waitingSessionConfig,
          }),
        );
        console.log(
          `[AQ] Sent waiting instructions to provider for session: ${sessionId}`,
        );
      }

      // Generate additional questions asynchronously
      // Use a safe send helper to prevent errors on closed WebSocket
      const safeSend = (data: object) => {
        try {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(data));
            return true;
          }
          console.log(
            `[AQ] WebSocket not open (state: ${clientWs.readyState}), skipping send for ${sessionId}`,
          );
          return false;
        } catch (err) {
          console.error(
            `[AQ] Error sending to WebSocket for ${sessionId}:`,
            err,
          );
          return false;
        }
      };

      (async () => {
        try {
          const aqResult =
            await generateAdditionalQuestionsForSession(sessionId);

          // Check if session still exists (could have been cleaned up by watchdog)
          const currentState = interviewStates.get(sessionId);
          if (!currentState) {
            console.log(
              `[AQ] Session ${sessionId} no longer exists, aborting AQ flow`,
            );
            return;
          }

          if (!aqResult || aqResult.questions.length === 0) {
            // No additional questions generated
            currentState.additionalQuestionsGenerating = false;
            safeSend({
              type: "additional_questions_none",
              message:
                "Your interview was comprehensive - no additional questions needed.",
            });

            // Await pending summaries before completing
            await awaitPendingSummaries(sessionId);

            // Add a 3-second delay so the user can see the "no additional questions" message
            // before navigating to the review page
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Complete the interview
            await storage.persistInterviewState(sessionId, {
              status: "completed",
              completedAt: new Date(),
              additionalQuestionPhase: false,
            });
            safeSend({ type: "interview_complete" });
            cleanupSession(sessionId, "completed");
          } else {
            // Store the questions and enter AQ phase
            currentState.additionalQuestions = aqResult.questions;
            currentState.isInAdditionalQuestionsPhase = true;
            currentState.currentAdditionalQuestionIndex = 0;
            currentState.additionalQuestionsGenerating = false;

            // Persist AQ to database
            await storage.persistInterviewState(sessionId, {
              additionalQuestions: aqResult.questions,
              additionalQuestionPhase: true,
            });

            safeSend({
              type: "additional_questions_ready",
              questionCount: aqResult.questions.length,
              questions: aqResult.questions.map((q, idx) => ({
                index: idx,
                questionText: q.questionText,
                rationale: q.rationale,
              })),
            });

            // Start the first additional question
            await startAdditionalQuestion(sessionId, 0);
          }
        } catch (error) {
          console.error(
            `[AQ] Error generating additional questions for ${sessionId}:`,
            error,
          );

          // Check if session still exists
          const currentState = interviewStates.get(sessionId);
          if (currentState) {
            currentState.additionalQuestionsGenerating = false;
          }

          safeSend({
            type: "additional_questions_none",
            message:
              "Unable to generate additional questions. Your interview is complete.",
          });

          // Await pending summaries before completing
          await awaitPendingSummaries(sessionId);

          await storage.persistInterviewState(sessionId, {
            status: "completed",
            completedAt: new Date(),
          });
          safeSend({ type: "interview_complete" });
          cleanupSession(sessionId, "completed");
        }
      })();
      break;

    case "decline_additional_questions":
      // User declined additional questions - complete the interview
      state.lastActivityAt = Date.now();
      state.additionalQuestionsConsent = false;

      // Await pending summaries before completing
      await awaitPendingSummaries(sessionId);

      await storage.persistInterviewState(sessionId, {
        status: "completed",
        completedAt: new Date(),
        additionalQuestionPhase: false,
      });
      clientWs.send(JSON.stringify({ type: "interview_complete" }));
      cleanupSession(sessionId, "completed");
      break;

    case "next_additional_question":
      // Move to next additional question or complete
      state.lastActivityAt = Date.now();

      if (state.isInAdditionalQuestionsPhase) {
        const currentAQIdx = state.currentAdditionalQuestionIndex;
        const nextAQIndex = currentAQIdx + 1;

        // Save transcript for current AQ before moving on
        const aqTranscriptSnapshot = [
          ...state.fullTranscriptForPersistence,
        ] as TranscriptEntry[];
        await persistAQTranscript(
          sessionId,
          currentAQIdx,
          aqTranscriptSnapshot,
        );

        // Generate summary for current AQ (runs async, tracked for completion)
        const aqSummaryPromise = generateAndPersistAQSummary(
          sessionId,
          currentAQIdx,
          aqTranscriptSnapshot,
        );
        state.pendingSummaryPromises.set(
          `aq-${currentAQIdx}`,
          aqSummaryPromise,
        );

        if (nextAQIndex < state.additionalQuestions.length) {
          await startAdditionalQuestion(sessionId, nextAQIndex);
        } else {
          // All additional questions complete
          state.isInAdditionalQuestionsPhase = false;

          // Await any pending summaries before completing
          await awaitPendingSummaries(sessionId);

          await storage.persistInterviewState(sessionId, {
            status: "completed",
            completedAt: new Date(),
            additionalQuestionPhase: false,
          });
          clientWs.send(JSON.stringify({ type: "interview_complete" }));
          cleanupSession(sessionId, "completed");
        }
      }
      break;

    case "end_additional_questions":
      // User wants to end early (skip remaining AQs)
      state.lastActivityAt = Date.now();

      if (state.isInAdditionalQuestionsPhase) {
        // Save transcript for current AQ before ending
        const currentAQTranscript = [
          ...state.fullTranscriptForPersistence,
        ] as TranscriptEntry[];
        await persistAQTranscript(
          sessionId,
          state.currentAdditionalQuestionIndex,
          currentAQTranscript,
        );

        // Generate summary for current AQ (tracked for completion)
        const endAQSummaryPromise = generateAndPersistAQSummary(
          sessionId,
          state.currentAdditionalQuestionIndex,
          currentAQTranscript,
        );
        state.pendingSummaryPromises.set(
          `aq-${state.currentAdditionalQuestionIndex}`,
          endAQSummaryPromise,
        );

        state.isInAdditionalQuestionsPhase = false;

        // Await any pending summaries before completing
        await awaitPendingSummaries(sessionId);

        await storage.persistInterviewState(sessionId, {
          status: "completed",
          completedAt: new Date(),
          additionalQuestionPhase: false,
        });
        clientWs.send(JSON.stringify({ type: "interview_complete" }));
        cleanupSession(sessionId, "completed");
      }
      break;

    case "client_silence_detected":
      // Client detected extended silence (30+ seconds) and paused audio streaming
      // This is informational - the client handles the pause/resume logic
      // The server just notes this for metrics and keeps the session active
      console.log(
        `[VoiceInterview] Client silence detected for session: ${sessionId} (${message.durationSeconds}s)`,
      );
      // Keep session alive but note the silence state
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;
      break;

    case "client_resuming_audio":
      // Client detected speech after silence and is sending buffered audio
      // The buffered audio contains the first moments of speech (captured during silence)
      // to avoid losing audio due to the delay between speech detection and resumption
      console.log(
        `[VoiceInterview] Client resuming audio with buffer for session: ${sessionId}`,
      );
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;

      // Forward the buffered audio to the provider first
      if (
        message.bufferedAudio &&
        state.providerWs?.readyState === WebSocket.OPEN
      ) {
        state.providerWs.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: message.bufferedAudio,
          }),
        );
      }
      break;

    case "client_calibration_complete":
      // Client completed ambient noise calibration for silence detection threshold
      console.log(
        `[VoiceInterview] Client calibration complete for session: ${sessionId} — baseline: ${message.baseline?.toFixed(4)}, threshold: ${message.threshold?.toFixed(4)}, samples: ${message.sampleCount}`,
      );
      // Store calibration data in performance metrics for diagnostics
      if (!state.performanceMetrics) {
        state.performanceMetrics = {};
      }
      state.performanceMetrics.calibration = {
        baseline: message.baseline,
        threshold: message.threshold,
        sampleCount: message.sampleCount,
        variance: message.variance,
        timestamp: Date.now(),
      };
      break;
  }
}

// Helper function to generate additional questions for a session
async function generateAdditionalQuestionsForSession(
  sessionId: string,
): Promise<AdditionalQuestionsResult | null> {
  const state = interviewStates.get(sessionId);
  if (!state) {
    console.error(`[AQ] No state found for session: ${sessionId}`);
    return null;
  }

  // Check feature flag first
  if (!ADDITIONAL_QUESTIONS_ENABLED) {
    console.log(`[AQ] Additional questions feature is disabled`);
    return {
      questions: [],
      barbaraModel: "",
      usedCrossInterviewContext: false,
      priorSessionCount: 0,
    };
  }

  // Don't generate if maxAdditionalQuestions is 0
  if (state.maxAdditionalQuestions <= 0) {
    console.log(
      `[AQ] Session ${sessionId} has maxAdditionalQuestions=0, skipping`,
    );
    return {
      questions: [],
      barbaraModel: "",
      usedCrossInterviewContext: false,
      priorSessionCount: 0,
    };
  }

  console.log(
    `[AQ] Generating up to ${state.maxAdditionalQuestions} additional questions for session: ${sessionId}`,
  );

  // Prepare the input for Barbara
  const templateQuestions = state.questions.map((q: any) => ({
    text: q.questionText,
    guidance: q.guidance || null,
  }));

  const projectObjective =
    state.template?.objective ||
    "Gather qualitative insights from this interview.";
  const audienceContext = state.template?.audienceContext || null;
  const tone = state.template?.tone || null;

  // Wait for any pending summaries to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  const result = await generateAdditionalQuestions({
    transcriptLog: state.fullTranscriptForPersistence,
    templateQuestions,
    questionSummaries: state.questionSummaries.filter(
      (s): s is QuestionSummary => s != null,
    ),
    projectObjective,
    audienceContext,
    tone,
    maxQuestions: state.maxAdditionalQuestions,
    crossInterviewContext: {
      enabled: false, // TODO: Implement cross-interview context in future iteration
    },
  });

  console.log(
    `[AQ] Generated ${result.questions.length} additional questions for session: ${sessionId}`,
  );
  return result;
}

// Helper function to start an additional question
async function startAdditionalQuestion(
  sessionId: string,
  aqIndex: number,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state || !state.clientWs || !state.providerWs) {
    console.error(
      `[AQ] Cannot start AQ - missing state or WebSocket for session: ${sessionId}`,
    );
    return;
  }

  const aq = state.additionalQuestions[aqIndex];
  if (!aq) {
    console.error(
      `[AQ] No additional question found at index ${aqIndex} for session: ${sessionId}`,
    );
    return;
  }

  state.currentAdditionalQuestionIndex = aqIndex;
  // Set currentQuestionIndex to questions.length + aqIndex so transcript entries are properly tagged
  state.currentQuestionIndex = state.questions.length + aqIndex;
  console.log(
    `[AQ] Starting additional question ${aqIndex + 1}/${state.additionalQuestions.length} for session: ${sessionId} (questionIndex: ${state.currentQuestionIndex})`,
  );

  // Notify client which AQ is starting
  state.clientWs.send(
    JSON.stringify({
      type: "additional_question_started",
      questionIndex: aqIndex,
      totalQuestions: state.additionalQuestions.length,
      questionText: aq.questionText,
    }),
  );

  // Update Alvia's instructions for the additional question
  const aqInstruction = buildAQInstructions(
    state.template,
    aq,
    aqIndex,
    state.additionalQuestions.length,
    state.respondentInformalName,
  );

  if (state.providerWs.readyState === WebSocket.OPEN) {
    // Update session with AQ context
    state.providerWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: aqInstruction,
        },
      }),
    );

    // Inject the question as a conversation item and trigger response
    state.providerWs.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `[ORCHESTRATOR: This is additional question ${aqIndex + 1} of ${state.additionalQuestions.length}. Ask this question in a natural, conversational way: "${aq.questionText}"]`,
            },
          ],
        },
      }),
    );

    if (!canCreateResponse(state)) {
      console.log(
        `[Response] Skipping additional question response - response already in progress for ${sessionId}`,
      );
    } else {
      state.responseInProgress = true;
      state.responseStartedAt = Date.now();
      state.providerWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
          },
        }),
      );
    }
  }
}

// Helper function to build Alvia instructions for additional questions
function buildAQInstructions(
  template: any,
  aq: GeneratedAdditionalQuestion,
  aqIndex: number,
  totalAQs: number,
  respondentName: string | null,
): string {
  const respondentAddress = respondentName || "the respondent";

  return `You are Alvia, a warm and professional AI interviewer. You are now in the ADDITIONAL QUESTIONS phase of the interview.

CONTEXT:
- This is additional question ${aqIndex + 1} of ${totalAQs}
- These questions were generated by Barbara (our research analyst) based on gaps or interesting threads from the main interview
- The respondent has consented to answer additional questions

CURRENT QUESTION TO ASK:
"${aq.questionText}"

GUIDELINES:
- Ask this question naturally, as if it's a natural extension of the conversation
- Use a conversational, friendly tone
- Listen actively and probe gently if ${respondentAddress} gives brief answers
- Don't repeat questions that were already covered in the main interview
- Keep this portion brief but thorough - aim for 1-2 follow-up probes maximum
- Acknowledge insights with genuine interest

TONE: ${template?.tone || "Professional and conversational"}
`;
}

// Helper function to await all pending summary promises before interview completion
async function awaitPendingSummaries(sessionId: string): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state || state.pendingSummaryPromises.size === 0) return;

  console.log(
    `[Summary] Awaiting ${state.pendingSummaryPromises.size} pending summaries for session: ${sessionId}`,
  );

  try {
    await Promise.all(state.pendingSummaryPromises.values());
    console.log(
      `[Summary] All pending summaries completed for session: ${sessionId}`,
    );
  } catch (error) {
    console.error(`[Summary] Error awaiting pending summaries:`, error);
  }

  // Clear the map after all promises resolve
  state.pendingSummaryPromises.clear();
}

// Helper function to persist transcript for additional questions
async function persistAQTranscript(
  sessionId: string,
  aqIndex: number,
  transcriptSnapshot: TranscriptEntry[],
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  try {
    // Calculate the questionIndex for this AQ
    const aqQuestionIndex = state.questions.length + aqIndex;

    // Filter transcript entries for this specific AQ
    const aqEntries = transcriptSnapshot.filter(
      (e) => e.questionIndex === aqQuestionIndex,
    );

    if (aqEntries.length === 0) {
      console.log(
        `[AQ Transcript] No transcript entries found for AQ${aqIndex + 1}`,
      );
      return;
    }

    // Format transcript as string
    const transcriptText = aqEntries
      .map((e) => {
        const speaker = e.speaker === "alvia" ? "Alvia" : "You";
        return `${speaker}: ${e.text}`;
      })
      .join("\n\n");

    console.log(
      `[AQ Transcript] Storing transcript for AQ${aqIndex + 1} with ${aqEntries.length} entries`,
    );

    // Update the additionalQuestions array with the transcript
    const updatedAQs = [...state.additionalQuestions];
    if (updatedAQs[aqIndex]) {
      (updatedAQs[aqIndex] as any).transcript = transcriptText;
    }
    state.additionalQuestions = updatedAQs as typeof state.additionalQuestions;

    // Persist to database
    await storage.persistInterviewState(sessionId, {
      additionalQuestions: updatedAQs,
    });

    console.log(
      `[AQ Transcript] Successfully stored transcript for AQ${aqIndex + 1}`,
    );
  } catch (error) {
    console.error(
      `[AQ Transcript] Error storing transcript for AQ${aqIndex + 1}:`,
      error,
    );
  }
}

// Helper function to generate and persist summary for additional questions
async function generateAndPersistAQSummary(
  sessionId: string,
  aqIndex: number,
  transcriptSnapshot: TranscriptEntry[],
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const aq = state.additionalQuestions[aqIndex];
  if (!aq) {
    console.log(`[AQ Summary] No AQ found at index ${aqIndex}`);
    return;
  }

  // Check if summary already exists for this AQ
  if ((aq as any).summaryBullets && (aq as any).summaryBullets.length > 0) {
    console.log(
      `[AQ Summary] Summary already exists for AQ${aqIndex + 1}, skipping`,
    );
    return;
  }

  try {
    // Calculate the questionIndex for this AQ (offset by template question count)
    const aqQuestionIndex = state.questions.length + aqIndex;

    // Filter transcript entries for this specific AQ
    const aqEntries = transcriptSnapshot.filter(
      (e) => e.questionIndex === aqQuestionIndex,
    );

    // Count respondent entries and words
    const respondentEntries = aqEntries.filter(
      (e) => e.speaker === "respondent",
    );
    const wordCount = respondentEntries.reduce(
      (sum, e) => sum + (e.text?.split(/\s+/).length || 0),
      0,
    );

    console.log(
      `[AQ Summary] Generating summary for AQ${aqIndex + 1} (session: ${sessionId}), ` +
        `transcript snapshot: ${transcriptSnapshot.length} total entries, ` +
        `${aqEntries.length} for this AQ, ${respondentEntries.length} respondent entries, ${wordCount} words`,
    );

    // Look up existing metrics from state (accumulated during AQ speech)
    // Fall back to building minimal metrics if not found
    const existingMetrics = state.questionMetrics.get(aqQuestionIndex);
    const aqMetrics: QuestionMetrics = existingMetrics
      ? {
          ...existingMetrics,
          // Override word/turn counts from transcript in case metrics are stale
          wordCount,
          turnCount: respondentEntries.length,
        }
      : {
          questionIndex: aqQuestionIndex,
          turnCount: respondentEntries.length,
          wordCount,
          activeTimeMs: 0,
          followUpCount: 0,
          startedAt: Date.now(),
          recommendedFollowUps: 0,
        };

    // Generate summary using the existing function
    const summary = await generateQuestionSummary(
      aqQuestionIndex,
      aq.questionText,
      aq.rationale || "", // Use rationale as guidance
      transcriptSnapshot,
      aqMetrics,
      state.template?.objective || "",
    );

    // Store full summary data in the AQ object (not just bullets)
    const updatedAQs = [...state.additionalQuestions];
    if (updatedAQs[aqIndex]) {
      const aqObj = updatedAQs[aqIndex] as any;
      // Core summary fields
      aqObj.summaryBullets = summary.keyInsights;
      aqObj.respondentSummary = summary.respondentSummary;
      aqObj.completenessAssessment = summary.completenessAssessment;
      // Metrics
      aqObj.wordCount = summary.wordCount;
      aqObj.turnCount = summary.turnCount;
      aqObj.activeTimeMs = summary.activeTimeMs;
      // Quality assessment
      aqObj.qualityScore = summary.qualityScore;
      aqObj.qualityFlags = summary.qualityFlags;
      aqObj.qualityNotes = summary.qualityNotes;
      // Verbatims
      aqObj.verbatims = summary.verbatims;
    }
    state.additionalQuestions = updatedAQs as typeof state.additionalQuestions;

    // Also store in questionSummaries so it appears on the session detail page
    const aqSummary: QuestionSummary = {
      ...summary,
      isAdditionalQuestion: true,
      additionalQuestionIndex: aqIndex,
    };

    // Ensure array is properly sized to avoid sparse array issues
    while (state.questionSummaries.length <= aqQuestionIndex) {
      state.questionSummaries.push(null as unknown as QuestionSummary);
    }
    state.questionSummaries[aqQuestionIndex] = aqSummary;

    console.log(
      `[AQ Summary] Summary completed for AQ${aqIndex + 1}: "${summary.respondentSummary?.substring(0, 100) || ""}..."`,
    );

    // Normalize summaries for persistence: filter out undefined/null entries
    const normalizedSummaries = state.questionSummaries
      .map((s, idx) => (s ? { ...s, questionIndex: idx } : null))
      .filter((s): s is QuestionSummary => s !== null);

    // Persist BOTH additionalQuestions and questionSummaries
    await storage.persistInterviewState(sessionId, {
      additionalQuestions: updatedAQs,
      questionSummaries: normalizedSummaries,
      lastBarbaraGuidance: state.lastBarbaraGuidance,
      questionStates: state.questionStates,
    });
    console.log(`[AQ Summary] Summary persisted for AQ${aqIndex + 1}`);
  } catch (error) {
    console.error(
      `[AQ Summary] Failed to generate summary for AQ${aqIndex + 1}:`,
      error,
    );
    // Fail silently - doesn't affect interview progress
  }
}

function finalizeAndPersistMetrics(
  sessionId: string,
  terminationReason?: string,
): void {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const tracker = state.metricsTracker;
  const now = Date.now();

  // If session ends while paused, accumulate final pause duration
  if (state.pauseStartedAt) {
    const finalPauseDuration = now - state.pauseStartedAt;
    state.totalPauseDurationMs += finalPauseDuration;
    state.pauseStartedAt = null;
    console.log(
      `[VoiceInterview] Final pause duration: ${finalPauseDuration}ms, total paused: ${state.totalPauseDurationMs}ms`,
    );
  }

  const sessionDurationMs = now - state.createdAt;

  // Calculate pause-aware metrics for accurate silence analysis
  const totalPauseDurationMs = state.totalPauseDurationMs;
  const activeSessionDurationMs = sessionDurationMs - totalPauseDurationMs;

  // Calculate respondent speaking time from question metrics
  let respondentSpeakingMs = 0;
  let respondentTurnCount = 0;
  state.questionMetrics.forEach((metrics) => {
    respondentSpeakingMs += metrics.activeTimeMs;
    respondentTurnCount += metrics.turnCount;
  });

  // Calculate silence time (approximation: session duration - speaking times)
  // This includes pause time for backward compatibility
  const silenceMs = Math.max(
    0,
    sessionDurationMs - respondentSpeakingMs - tracker.alviaSpeaking.totalMs,
  );

  // Calculate active silence (silence during active streaming only, excludes pause time)
  const activeSilenceMs = Math.max(
    0,
    activeSessionDurationMs -
      respondentSpeakingMs -
      tracker.alviaSpeaking.totalMs,
  );

  // Calculate silence statistics from accumulator (includes ALL observed segments)
  const silenceSegments = tracker.silenceTracking.segments; // Capped recent segments for storage
  const silenceStats = calculateSilenceStats(
    tracker.silenceTracking.accumulator,
  );
  const totalSilenceCount =
    tracker.silenceTracking.accumulator.allDurations.length;

  // Calculate average latencies
  const transcriptionLatencies = tracker.latency.transcriptionLatencies;
  const responseLatencies = tracker.latency.responseLatencies;

  const avgTranscriptionLatencyMs =
    transcriptionLatencies.length > 0
      ? transcriptionLatencies.reduce((a, b) => a + b, 0) /
        transcriptionLatencies.length
      : 0;
  const avgResponseLatencyMs =
    responseLatencies.length > 0
      ? responseLatencies.reduce((a, b) => a + b, 0) / responseLatencies.length
      : 0;
  const maxTranscriptionLatencyMs =
    transcriptionLatencies.length > 0 ? Math.max(...transcriptionLatencies) : 0;
  const maxResponseLatencyMs =
    responseLatencies.length > 0 ? Math.max(...responseLatencies) : 0;

  // Build the final metrics object
  const performanceMetrics: RealtimePerformanceMetrics = {
    sessionId,
    recordedAt: now,
    tokenUsage: {
      inputTokens: tracker.tokens.inputTokens,
      outputTokens: tracker.tokens.outputTokens,
      inputAudioTokens: tracker.tokens.inputAudioTokens,
      outputAudioTokens: tracker.tokens.outputAudioTokens,
      inputTextTokens: tracker.tokens.inputTextTokens,
      outputTextTokens: tracker.tokens.outputTextTokens,
    },
    latency: {
      avgTranscriptionLatencyMs,
      avgResponseLatencyMs,
      maxTranscriptionLatencyMs,
      maxResponseLatencyMs,
      transcriptionSamples: transcriptionLatencies.length,
      responseSamples: responseLatencies.length,
    },
    speakingTime: {
      respondentSpeakingMs,
      alviaSpeakingMs: tracker.alviaSpeaking.totalMs,
      silenceMs,
      respondentTurnCount,
      alviaTurnCount: tracker.alviaSpeaking.turnCount,
      silenceSegments: silenceSegments,
      silenceStats: silenceStats ?? undefined,
      // Pause-aware metrics for accurate silence analysis
      totalPauseDurationMs,
      activeSilenceMs,
      activeSessionDurationMs,
    },
    sessionDurationMs,
    openaiConnectionCount: tracker.openaiConnectionCount,
    terminationReason,
  };

  // Log metrics summary with pause-aware breakdown
  const activeSilencePercent =
    activeSessionDurationMs > 0
      ? ((activeSilenceMs / activeSessionDurationMs) * 100).toFixed(1)
      : "N/A";
  console.log(`[Metrics] Final metrics for ${sessionId}:`, {
    duration: `${Math.round(sessionDurationMs / 1000)}s`,
    activeDuration: `${Math.round(activeSessionDurationMs / 1000)}s`,
    totalPaused: `${Math.round(totalPauseDurationMs / 1000)}s`,
    tokens: `${tracker.tokens.inputTokens} in / ${tracker.tokens.outputTokens} out`,
    avgLatency: `transcription=${Math.round(avgTranscriptionLatencyMs)}ms, response=${Math.round(avgResponseLatencyMs)}ms`,
    speaking: `respondent=${Math.round(respondentSpeakingMs / 1000)}s, alvia=${Math.round(tracker.alviaSpeaking.totalMs / 1000)}s`,
    activeSilence: `${Math.round(activeSilenceMs / 1000)}s (${activeSilencePercent}%)`,
    silenceSegments: `${silenceSegments.length} stored / ${totalSilenceCount} total observed`,
  });

  // Build transcription quality metrics from current signals
  const transcriptionQualityMetrics = createQualityMetrics(
    state.transcriptionQualitySignals,
  );

  console.log(`[TranscriptionQuality] Final metrics for ${sessionId}:`, {
    score: transcriptionQualityMetrics.qualityScore,
    flags: transcriptionQualityMetrics.flagsDetected,
    signals: {
      shortUtteranceStreak:
        state.transcriptionQualitySignals.shortUtteranceStreak,
      foreignLanguageCount:
        state.transcriptionQualitySignals.foreignLanguageCount,
      questionRepeatCount:
        state.transcriptionQualitySignals.questionRepeatCount,
      incoherentPhraseCount:
        state.transcriptionQualitySignals.incoherentPhraseCount,
      totalUtterances:
        state.transcriptionQualitySignals.totalRespondentUtterances,
    },
  });

  // Persist metrics to database (including totalDurationMs for data integrity)
  storage
    .persistInterviewState(sessionId, {
      performanceMetrics,
      transcriptionQualityMetrics,
      totalDurationMs: sessionDurationMs,
    })
    .catch((error) => {
      console.error(
        `[Metrics] Failed to persist metrics for ${sessionId}:`,
        error,
      );
    });
}

async function cleanupSession(sessionId: string, terminationReason?: string) {
  const state = interviewStates.get(sessionId);
  if (state) {
    // Finalize and persist performance metrics
    finalizeAndPersistMetrics(sessionId, terminationReason);

    // Flush any pending persist before cleanup
    await flushPersist(sessionId);

    if (state.providerWs) {
      state.providerWs.close();
    }
    if (state.clientWs && state.clientWs.readyState === WebSocket.OPEN) {
      state.clientWs.close();
    }
    interviewStates.delete(sessionId);
    console.log(`[VoiceInterview] Session cleaned up: ${sessionId}`);

    // Stop watchdog if no more sessions
    if (interviewStates.size === 0) {
      stopSessionWatchdog();
    }
  }
}

function startSessionWatchdog(): void {
  if (watchdogState.interval) {
    // Already running
    return;
  }

  watchdogState.interval = setInterval(() => {
    runWatchdogCycle();
  }, WATCHDOG_INTERVAL_MS);

  console.log(
    "[SessionWatchdog] Started - checking every",
    WATCHDOG_INTERVAL_MS / 1000,
    "seconds",
  );
}

function stopSessionWatchdog(): void {
  if (watchdogState.interval) {
    clearInterval(watchdogState.interval);
    watchdogState.interval = null;
    console.log("[SessionWatchdog] Stopped - no active sessions");
  }
}

function runWatchdogCycle(): void {
  const now = Date.now();
  const sessionsToTerminate: Array<{
    sessionId: string;
    reason: TerminationReason;
  }> = [];
  const sessionsToWarn: string[] = [];

  const sessionEntries = Array.from(interviewStates.entries());
  for (const [sessionId, state] of sessionEntries) {
    const age = now - state.createdAt;
    const timeSinceHeartbeat = now - state.lastHeartbeatAt;
    const timeSinceActivity = now - state.lastActivityAt;

    let reason: TerminationReason | null = null;

    // Check conditions in order of severity
    if (age > SESSION_MAX_AGE_MS) {
      reason = "max_age_exceeded";
    } else if (state.clientDisconnectedAt !== null) {
      // Client disconnected - terminate after heartbeat timeout from disconnect time
      const timeSinceDisconnect = now - state.clientDisconnectedAt;
      if (timeSinceDisconnect > HEARTBEAT_TIMEOUT_MS) {
        reason = "client_disconnected";
      }
    } else if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      reason = "heartbeat_timeout";
    } else if (timeSinceActivity > SESSION_IDLE_TIMEOUT_MS) {
      reason = "idle_timeout";
    }

    if (reason) {
      sessionsToTerminate.push({ sessionId, reason });
    } else if (!state.terminationWarned) {
      // Check if we should warn about impending termination
      const timeUntilMaxAge = SESSION_MAX_AGE_MS - age;
      const timeUntilIdle = SESSION_IDLE_TIMEOUT_MS - timeSinceActivity;
      const timeUntilHeartbeatTimeout =
        HEARTBEAT_TIMEOUT_MS - timeSinceHeartbeat;

      const minTimeRemaining = Math.min(
        timeUntilMaxAge,
        timeUntilIdle,
        timeUntilHeartbeatTimeout,
      );

      if (minTimeRemaining <= TERMINATION_WARNING_MS && minTimeRemaining > 0) {
        sessionsToWarn.push(sessionId);
      }
    }
  }

  // Warn sessions about impending termination
  for (const sessionId of sessionsToWarn) {
    warnSessionTermination(sessionId);
  }

  // Terminate stale sessions
  for (const { sessionId, reason } of sessionsToTerminate) {
    terminateSession(sessionId, reason);
  }
}

function warnSessionTermination(sessionId: string): void {
  const state = interviewStates.get(sessionId);
  if (!state || state.terminationWarned) return;

  state.terminationWarned = true;

  const message = {
    type: "session_warning",
    reason: "inactivity",
    message:
      "Your session will end soon due to inactivity. Please interact to keep it active.",
    timeoutMs: TERMINATION_WARNING_MS,
  };

  if (state.clientWs && state.clientWs.readyState === WebSocket.OPEN) {
    state.clientWs.send(JSON.stringify(message));
    console.log(`[SessionWatchdog] Warning sent to session: ${sessionId}`);
  }
}

async function terminateSession(
  sessionId: string,
  reason: TerminationReason,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  console.log(
    `[SessionWatchdog] Terminating session ${sessionId} - reason: ${reason}`,
  );

  // Notify client about termination (if client is still connected)
  const reasonMessages: Record<TerminationReason, string> = {
    heartbeat_timeout: "Connection lost - no heartbeat received",
    idle_timeout: "Session ended due to inactivity",
    max_age_exceeded: "Maximum session duration reached",
    client_disconnected: "Connection closed - session will be cleaned up",
  };

  if (state.clientWs && state.clientWs.readyState === WebSocket.OPEN) {
    state.clientWs.send(
      JSON.stringify({
        type: "session_terminated",
        reason,
        message: reasonMessages[reason],
        canResume: reason !== "max_age_exceeded", // Allow resume for idle/heartbeat/disconnect, not for max age
      }),
    );
  }

  // Wait for any in-flight summary promises to complete before cleanup
  // This prevents data loss if watchdog terminates during AQ generation
  try {
    await awaitPendingSummaries(sessionId);
  } catch (error) {
    console.error(
      `[SessionWatchdog] Error awaiting pending summaries for ${sessionId}:`,
      error,
    );
  }

  // Update session status to indicate it was terminated
  try {
    await storage.persistInterviewState(sessionId, {
      status: "paused",
      pausedAt: new Date(),
    });
  } catch (error) {
    console.error(
      `[SessionWatchdog] Failed to persist terminated status for ${sessionId}:`,
      error,
    );
  }

  // Clean up
  await cleanupSession(sessionId, reason);
}
