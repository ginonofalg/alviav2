import WebSocket from "ws";
import type { IncomingMessage } from "http";
import { storage, type InterviewStatePatch } from "./storage";
import {
  analyzeWithBarbara,
  createEmptyMetrics,
  generateQuestionSummary,
  detectTopicOverlap,
  type TranscriptEntry,
  type QuestionMetrics,
  type BarbaraGuidance,
  type QuestionSummary,
  type TopicOverlapResult,
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
} from "@shared/schema";

// the newest OpenAI model is "gpt-realtime" for realtime voice conversations
const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime";

interface InterviewState {
  sessionId: string;
  currentQuestionIndex: number;
  questions: any[];
  template: any;
  openaiWs: WebSocket | null;
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
  // Persistence state
  fullTranscriptForPersistence: PersistedTranscriptEntry[]; // Complete transcript history - never truncated
  lastBarbaraGuidance: PersistedBarbaraGuidance | null;
  questionStates: PersistedQuestionState[];
  questionSummaries: QuestionSummary[]; // Index-based: questionSummaries[questionIndex] = summary
  pendingPersistTimeout: ReturnType<typeof setTimeout> | null;
  lastPersistAt: number;
  isRestoredSession: boolean;
  // Session hygiene tracking
  createdAt: number;
  lastHeartbeatAt: number;
  lastActivityAt: number; // Any meaningful activity (audio, interaction, AI response)
  terminationWarned: boolean; // Whether client has been warned about impending termination
  clientDisconnectedAt: number | null; // When client WS closed (for watchdog to handle)
  // Realtime API performance metrics
  metricsTracker: MetricsTracker;
}

type TerminationReason =
  | "heartbeat_timeout"
  | "idle_timeout"
  | "max_age_exceeded"
  | "client_disconnected";

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

  // Use fullTranscriptForPersistence to avoid data loss from in-memory truncation
  const patch: InterviewStatePatch = {
    liveTranscript: state.fullTranscriptForPersistence,
    lastBarbaraGuidance: state.lastBarbaraGuidance,
    questionStates: state.questionStates,
    questionSummaries: normalizedSummaries,
    currentQuestionIndex: state.currentQuestionIndex,
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
  // Extract session ID from query string: /ws/interview?sessionId=xxx
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    clientWs.close(1008, "Session ID required");
    return;
  }

  // Check for concurrent tab - reject if session already has an active connection
  const existingState = interviewStates.get(sessionId);
  if (
    existingState &&
    existingState.clientWs &&
    existingState.clientWs.readyState === WebSocket.OPEN
  ) {
    console.log(
      `[VoiceInterview] Rejecting concurrent connection for session: ${sessionId}`,
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

    clientWs.on("close", () => {
      console.log(`[VoiceInterview] Client disconnected: ${sessionId}`);
      const state = interviewStates.get(sessionId);
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

    // Send reconnected message to client with current state
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
    if (
      existingState.openaiWs &&
      existingState.openaiWs.readyState === WebSocket.OPEN
    ) {
      existingState.openaiWs.close();
    }
    if (existingState.pendingPersistTimeout) {
      clearTimeout(existingState.pendingPersistTimeout);
    }
  }

  // Initialize interview state
  const now = Date.now();
  const state: InterviewState = {
    sessionId,
    currentQuestionIndex: 0,
    questions: [],
    template: null,
    openaiWs: null,
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
    // Persistence state
    fullTranscriptForPersistence: [], // Complete transcript history - never truncated
    lastBarbaraGuidance: null,
    questionStates: [],
    questionSummaries: [], // Index-based array for question summaries
    pendingPersistTimeout: null,
    lastPersistAt: 0,
    isRestoredSession: false,
    // Session hygiene tracking
    createdAt: now,
    lastHeartbeatAt: now,
    lastActivityAt: now,
    terminationWarned: false,
    clientDisconnectedAt: null,
    // Realtime API performance metrics
    metricsTracker: createEmptyMetricsTracker(),
  };
  interviewStates.set(sessionId, state);

  // Start watchdog if this is the first session
  startSessionWatchdog();

  // Load interview data and connect to OpenAI
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

  clientWs.on("close", () => {
    console.log(`[VoiceInterview] Client disconnected: ${sessionId}`);
    // Don't immediately cleanup - mark as disconnected and let watchdog handle
    // This allows for reconnection/resume within heartbeat timeout
    const state = interviewStates.get(sessionId);
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

    // Load respondent data for personalization
    const respondent = await storage.getRespondent(session.respondentId);
    state.respondentInformalName = respondent?.informalName || null;

    state.template = template;
    state.questions = questions;
    state.currentQuestionIndex = session.currentQuestionIndex || 0;

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

      console.log(
        `[VoiceInterview] Restored ${state.fullTranscriptForPersistence.length} transcript entries (${state.transcriptLog.length} in memory), question ${state.currentQuestionIndex + 1}/${questions.length}`,
      );
    } else {
      // Initialize metrics for first question (new session)
      state.questionMetrics.set(0, createEmptyMetrics(0));
      updateQuestionState(state, 0, { status: "in_progress" });
    }

    // Connect to OpenAI Realtime API
    connectToOpenAI(sessionId, clientWs);
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

function connectToOpenAI(sessionId: string, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    clientWs.send(
      JSON.stringify({
        type: "error",
        message: "OpenAI API key not configured",
      }),
    );
    return;
  }

  console.log(
    `[VoiceInterview] Connecting to OpenAI for session: ${sessionId}`,
  );

  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  state.openaiWs = openaiWs;

  // Track OpenAI connection count for metrics
  state.metricsTracker.openaiConnectionCount++;

  openaiWs.on("open", () => {
    console.log(
      `[VoiceInterview] Connected to OpenAI for session: ${sessionId}`,
    );
    state.isConnected = true;

    // Configure the session
    const currentQuestion = state.questions[state.currentQuestionIndex];

    // Use resume instructions if restoring a session with transcript history
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
      );
    }

    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: instructions,
          voice: "cedar",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_noise_reduction: {
            type: "near_field",
          },
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          turn_detection: {
            //type: "server_vad",
            //threshold: 0.3,
            //silence_duration_ms: 800,
            //prefix_padding_ms: 150,
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true, // Alvia responds immediately; Barbara's guidance applies to NEXT turn
            interrupt_response: true,
          },
        },
      }),
    );

    // Notify client that connection is ready
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
      }),
    );
  });

  openaiWs.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());
      handleOpenAIEvent(sessionId, event, clientWs);
    } catch (error) {
      console.error("[VoiceInterview] Error parsing OpenAI message:", error);
    }
  });

  openaiWs.on("close", () => {
    console.log(
      `[VoiceInterview] OpenAI connection closed for session: ${sessionId}`,
    );
    state.isConnected = false;
    clientWs.send(JSON.stringify({ type: "disconnected" }));
  });

  openaiWs.on("error", (error) => {
    console.error(`[VoiceInterview] OpenAI error for ${sessionId}:`, error);
    clientWs.send(
      JSON.stringify({ type: "error", message: "Voice service error" }),
    );
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

  let instructions = `You are Alvia, a friendly and professional AI interviewer. Your role is to conduct a voice interview.

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
You've asked ${followUpContext.followUpCount} so far. This is guidance, not a strict limit - prioritize getting a substantive answer, but be mindful of moving on once sufficient depth is reached.
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
1. ${questionIndex === 0 ? `Start with a warm greeting${respondentName ? `, using their name "${respondentName}"` : ""} and briefly explain the interview purpose: "${objective}". Then ask the first question.` : "Ask the current question naturally."}
2. Listen to the respondent's answer carefully.
3. Ask follow-up questions if the answer is too brief or unclear.
4. IMPORTANT: make sure these follow-up questions don't overlap with an UPCOMING QUESTION.
5. Use the GUIDANCE FOR THIS QUESTION to know what depth of answer is expected. Remember, this is a voice conversation, so don't expect a perfect response vs the GUIDANCE. Balance between probing for more detail and the length of the conversation about the CURRENT QUESTION.
6. Be encouraging and conversational, matching the ${tone} tone.
7. Keep responses concise - this is a voice conversation.
8. If the ochestrator's guidance is that the respondent has given a complete answer or suggests moving to the next question, say "Thank you for that answer" and signal you're ready for the next question.
9. When the ochestrator talks about the next question or moving on, she means the next template question, not the next follow-up
10. The interviewee will click the Next Question button when ready to move on. You can refer to this button as "the Next Question button below" if appropriate.
11. If the current question is the last one (e.g. Current Question: 5 of 5), don't talk about moving to the next question - just wrap up the interview naturally. The interview can "click the Complete Interview button below" to finish.`;

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
    : "The respondent has not provided their name.";

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
`;

  if (barbaraSuggestedMoveOn) {
    instructions += `
NOTE: Before the interruption, the respondent had given a comprehensive answer and you offered to move to the next question.
`;
  }

  instructions += `
RESUME INSTRUCTIONS:
1. Welcome them back briefly and warmly${respondentName ? `, using their name "${respondentName}"` : ""}.
2. ${
    barbaraSuggestedMoveOn
      ? "Ask if they'd like to continue where they left off or move to the next question."
      : "Briefly remind them what you were discussing and invite them to continue their response."
  }
3. Do NOT repeat the full question unless specifically needed.
4. Be encouraging and match the ${tone} tone.
5. Keep your welcome-back message concise.

ORCHESTRATOR MESSAGES:
You will occasionally receive messages wrapped in [ORCHESTRATOR: ...] brackets. These are internal guidance from Barbara, your orchestrator. When you see these:
- DO NOT read them aloud or acknowledge receiving them
- DO NOT respond as if the respondent said them
- Simply follow the guidance naturally as if it were your own thought
- Seamlessly continue the conversation with the respondent

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return instructions;
}

async function handleOpenAIEvent(
  sessionId: string,
  event: any,
  clientWs: WebSocket,
) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  switch (event.type) {
    case "session.created":
      console.log(`[VoiceInterview] Session created for ${sessionId}`);
      // Don't trigger response here - wait for session.updated after configuration
      break;

    case "session.updated":
      console.log(`[VoiceInterview] Session updated for ${sessionId}`);
      // Only trigger response on initial session setup, not Barbara guidance updates
      if (
        state.isInitialSession &&
        state.openaiWs &&
        state.openaiWs.readyState === WebSocket.OPEN
      ) {
        state.isInitialSession = false; // Mark initial setup complete
        state.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
            },
          }),
        );
      }
      // Reset Barbara guidance flag after any session update
      state.isBarbaraGuidanceUpdate = false;
      break;

    case "response.audio.delta": {
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
      clientWs.send(
        JSON.stringify({
          type: "audio",
          delta: event.delta,
        }),
      );
      break;
    }

    case "response.audio.done": {
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

      clientWs.send(JSON.stringify({ type: "audio_done" }));
      break;
    }

    case "response.audio_transcript.delta":
      // AI's speech transcript
      clientWs.send(
        JSON.stringify({
          type: "ai_transcript",
          delta: event.delta,
        }),
      );
      break;

    case "response.audio_transcript.done":
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
      clientWs.send(
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

          // Add to transcript log (both in-memory and persistence buffer)
          addTranscriptEntry(state, {
            speaker: "respondent",
            text: event.transcript,
            timestamp: Date.now(),
            questionIndex: correctQuestionIndex,
          });

          // Clear the speech start tracking
          state.questionIndexAtSpeechStart = null;

          // Update question metrics and state
          const metrics =
            state.questionMetrics.get(state.currentQuestionIndex) ||
            createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += event.transcript
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
          // Response is automatically created by OpenAI due to create_response: true
          triggerBarbaraAnalysis(sessionId, clientWs).catch((error) => {
            console.error(`[Barbara] Analysis failed for ${sessionId}:`, error);
          });
        }
        clientWs.send(
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

      clientWs.send(JSON.stringify({ type: "user_speaking_started" }));
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

      clientWs.send(JSON.stringify({ type: "user_speaking_stopped" }));
      break;
    }

    case "response.done":
      // Capture token usage from OpenAI response
      const usage = event.response?.usage;
      if (usage) {
        state.metricsTracker.tokens.inputTokens += usage.input_tokens || 0;
        state.metricsTracker.tokens.outputTokens += usage.output_tokens || 0;
        state.metricsTracker.tokens.inputAudioTokens +=
          usage.input_token_details?.audio_tokens || 0;
        state.metricsTracker.tokens.outputAudioTokens +=
          usage.output_token_details?.audio_tokens || 0;
        state.metricsTracker.tokens.inputTextTokens +=
          usage.input_token_details?.text_tokens || 0;
        state.metricsTracker.tokens.outputTextTokens +=
          usage.output_token_details?.text_tokens || 0;
        console.log(
          `[Metrics] Token usage for ${sessionId}: input=${usage.input_tokens}, output=${usage.output_tokens}`,
        );
      }
      clientWs.send(JSON.stringify({ type: "response_done" }));
      break;

    case "error":
      console.error(`[VoiceInterview] OpenAI error:`, event.error);
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: event.error?.message || "Voice service error",
        }),
      );
      break;
  }
}

// Reduced timeout since Barbara analysis is now non-blocking (lag-by-one-turn architecture)
// Barbara has more time to analyze since her guidance applies to the NEXT turn
const BARBARA_TIMEOUT_MS = 5000;

async function triggerBarbaraAnalysis(
  sessionId: string,
  clientWs: WebSocket,
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

    // Wrap Barbara call with timeout
    const timeoutPromise = new Promise<BarbaraGuidance>((_, reject) => {
      setTimeout(
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
      if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
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
        );

        // Log the complete Alvia prompt when Barbara issues guidance
        console.log(
          `\n[Alvia] Complete prompt with Barbara's guidance for ${sessionId}:`,
        );
        console.log("=".repeat(80));
        console.log(updatedInstructions);
        console.log("=".repeat(80) + "\n");

        state.openaiWs.send(
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
      clientWs.send(
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

  if (!state.openaiWs) return;

  switch (message.type) {
    case "audio":
      // Update activity timestamp on audio
      state.lastActivityAt = Date.now();
      state.terminationWarned = false;
      // Forward audio from client to OpenAI
      if (state.openaiWs.readyState === WebSocket.OPEN) {
        state.openaiWs.send(
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
      if (state.openaiWs.readyState === WebSocket.OPEN) {
        state.openaiWs.send(
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
          state.openaiWs &&
          state.openaiWs.readyState === WebSocket.OPEN &&
          message.text
        ) {
          // Add to transcript log (both in-memory and persistence buffer)
          addTranscriptEntry(state, {
            speaker: "respondent",
            text: message.text,
            timestamp: Date.now(),
            questionIndex: state.currentQuestionIndex,
          });

          // Update metrics
          const metrics =
            state.questionMetrics.get(state.currentQuestionIndex) ||
            createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += message.text
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
          state.openaiWs.send(
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
          triggerBarbaraAnalysis(sessionId, clientWs).catch((error) => {
            console.error(`[Barbara] Analysis failed for ${sessionId}:`, error);
          });

          // For text input, we still need to manually trigger response
          // (unlike audio mode where create_response: true handles it)
          if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
            state.openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text", "audio"],
                },
              }),
            );
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
      // Update session status back to in_progress
      storage.persistInterviewState(sessionId, {
        status: "in_progress",
        pausedAt: null,
      });
      console.log(
        `[VoiceInterview] Interview resuming for session: ${sessionId}`,
      );

      if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
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
        state.openaiWs.send(
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
        state.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
            },
          }),
        );
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
        );

        if (state.openaiWs.readyState === WebSocket.OPEN) {
          // Update session with new question context
          state.openaiWs.send(
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
              state.openaiWs &&
              state.openaiWs.readyState === WebSocket.OPEN
            ) {
              // Inject the transition instruction as a conversation item first
              state.openaiWs.send(
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
              state.openaiWs.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    modalities: ["text", "audio"],
                  },
                }),
              );
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
        // Update session status to completed before sending message
        await storage.persistInterviewState(sessionId, {
          status: "completed",
          completedAt: new Date(),
        });
        clientWs.send(JSON.stringify({ type: "interview_complete" }));
        cleanupSession(sessionId, "completed");
      }
      break;

    case "end_interview":
      state.lastActivityAt = Date.now();
      // Trigger summarization for final question in background before cleanup
      // Capture transcript snapshot for the final question
      const finalTranscriptSnapshot = [
        ...state.fullTranscriptForPersistence,
      ] as TranscriptEntry[];
      generateAndPersistSummary(
        sessionId,
        state.currentQuestionIndex,
        finalTranscriptSnapshot,
      ).catch(() => {
        // Error already logged in generateAndPersistSummary
      });
      // Update session status to completed
      await storage.persistInterviewState(sessionId, {
        status: "completed",
        completedAt: new Date(),
      });
      clientWs.send(JSON.stringify({ type: "interview_complete" }));
      cleanupSession(sessionId, "completed");
      break;
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

  // Persist metrics to database
  storage
    .persistInterviewState(sessionId, { performanceMetrics })
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

    if (state.openaiWs) {
      state.openaiWs.close();
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
