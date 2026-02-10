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
  generateSessionSummary,
  type BarbaraAnalysisInput,
  type TranscriptEntry,
  type QuestionMetrics,
  type BarbaraGuidance,
  type QuestionSummary,
  type TopicOverlapResult,
  type GeneratedAdditionalQuestion,
  type AdditionalQuestionsResult,
} from "./barbara-orchestrator";
import {
  recordLlmUsageEvent,
  emptyTokenBucket,
  addToTokenBucket,
} from "./llm-usage";
import type {
  LLMUsageAttribution,
  BarbaraTokensByUseCase,
} from "@shared/schema";
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
  AlviaSessionSummary,
  QualityFlag,
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

import {
  ADDITIONAL_QUESTIONS_ENABLED,
  getProvider,
  type InterviewState,
  buildUsageAttribution,
  type TerminationReason,
  RESPONSE_TIMEOUT_MS,
  canCreateResponse,
  safeSend,
  type MetricsTracker,
  watchdogState,
  PERSIST_DEBOUNCE_MS,
  MAX_TRANSCRIPT_IN_MEMORY,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_MAX_AGE_MS,
  WATCHDOG_INTERVAL_MS,
  TERMINATION_WARNING_MS,
  WS_PING_INTERVAL_MS,
  type CrossInterviewRuntimeContext,
  type AnalyticsHypothesesRuntimeContext,
  type CompactQuestionQualityInsight,
} from "./voice-interview/types";
import {
  buildAnalyticsHypothesesRuntimeContext,
  buildCrossInterviewRuntimeContext,
} from "./voice-interview/context-builders";
import {
  createEmptyMetricsTracker,
  recordSilenceSegment,
  calculateSilenceStats,
} from "./voice-interview/metrics";
import {
  buildInterviewInstructions,
  buildOverlapInstruction,
  buildResumeInstructions,
} from "./voice-interview/instructions";
import {
  sanitizeAlviaTranscript,
  addTranscriptEntry,
  detectQuestionRepeat,
} from "./voice-interview/transcript";

// Helper to check if a connectionId matches the current state - centralized stale guard
function isCurrentConnection(sessionId: string, connectionId: string): boolean {
  const state = interviewStates.get(sessionId);
  return (
    state !== null && state !== undefined && state.connectionId === connectionId
  );
}

const interviewStates = new Map<string, InterviewState>();


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
      buildUsageAttribution(state),
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

    // Set awaitingResume for server-side defense-in-depth
    // This gates audio forwarding until the client explicitly sends a resume signal
    // Prevents any stray audio from triggering OpenAI VAD after reconnection
    existingState.awaitingResume = true;

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
        timeSinceLastHeartbeat: timeSinceHeartbeat
          ? `${timeSinceHeartbeat}ms`
          : "unknown",
        timeSinceLastActivity: timeSinceActivity
          ? `${timeSinceActivity}ms`
          : "unknown",
        sessionAge: state ? `${Date.now() - state.createdAt}ms` : "unknown",
        isPaused: state?.isPaused || false,
        questionIndex: state?.currentQuestionIndex,
      });

      if (state) {
        state.clientWs = null;
        if (state.isFinalizing) {
          console.log(
            `[VoiceInterview] Session ${sessionId} client disconnected during finalization — skipping disconnect marking`,
          );
        } else {
          state.clientDisconnectedAt = Date.now();
          console.log(
            `[VoiceInterview] Session ${sessionId} marked as disconnected, watchdog will cleanup after heartbeat timeout`,
          );
        }
      }
    });

    clientWs.on("error", (error) => {
      console.error(`[VoiceInterview] Client error for ${sessionId}:`, error);
      const state = interviewStates.get(sessionId);
      if (state) {
        state.clientWs = null;
        if (!state.isFinalizing) {
          state.clientDisconnectedAt = Date.now();
        }
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
        vadEagerness: existingState.transcriptionQualitySignals
          .vadEagernessReduced
          ? "low"
          : "auto",
        // Include pause/resume state for client reconnection logic
        awaitingResume: existingState.awaitingResume,
        isPaused: existingState.isPaused,
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
    collectionId: null,
    providerType: selectedProviderType,
    providerInstance: getProvider(selectedProviderType), // Cache provider instance once
    clientWs: clientWs,
    isConnected: false,
    lastAIPrompt: "",
    alviaHasSpokenOnCurrentQuestion: false,
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
    isFinalizing: false,
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
    endOfInterviewSummaryEnabled: false, // Will be set from collection later
    isGeneratingAlviaSummary: false,
    alviaSummaryResolve: null,
    alviaSummaryReject: null,
    alviaSummaryAccumulatedText: "",
    pendingSummaryPromises: new Map(),
    // Response state tracking - prevents concurrent response.create calls
    responseInProgress: false,
    responseStartedAt: null,
    lastResponseDoneAt: null,
    crossInterviewRuntimeContext: { enabled: false, reason: "not_initialized" },
    analyticsHypothesesRuntimeContext: {
      enabled: false,
      reason: "not_initialized",
    },
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
      timeSinceLastHeartbeat: timeSinceHeartbeat
        ? `${timeSinceHeartbeat}ms`
        : "unknown",
      timeSinceLastActivity: timeSinceActivity
        ? `${timeSinceActivity}ms`
        : "unknown",
      sessionAge: state ? `${Date.now() - state.createdAt}ms` : "unknown",
      isPaused: state?.isPaused || false,
      questionIndex: state?.currentQuestionIndex,
    });

    // Don't immediately cleanup - mark as disconnected and let watchdog handle
    // This allows for reconnection/resume within heartbeat timeout
    if (state) {
      state.clientWs = null;
      if (state.isFinalizing) {
        console.log(
          `[VoiceInterview] Session ${sessionId} client disconnected during finalization — skipping disconnect marking`,
        );
      } else {
        state.clientDisconnectedAt = Date.now();
        console.log(
          `[VoiceInterview] Session ${sessionId} marked as disconnected, watchdog will cleanup after heartbeat timeout`,
        );
      }
    }
  });

  clientWs.on("error", (error) => {
    console.error(`[VoiceInterview] Client error for ${sessionId}:`, error);
    // Same as close - mark as disconnected, let watchdog handle
    const state = interviewStates.get(sessionId);
    if (state) {
      state.clientWs = null;
      if (!state.isFinalizing) {
        state.clientDisconnectedAt = Date.now();
      }
    }
  });

  // Handle pong responses to server-initiated protocol pings
  // This confirms the WebSocket connection is alive at the protocol level
  clientWs.on("pong", () => {
    const state = interviewStates.get(sessionId);
    if (state) {
      // Update heartbeat timestamp - protocol-level pong confirms connection is alive
      state.lastHeartbeatAt = Date.now();
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
    state.collectionId = collection.id;
    state.strategicContext = project?.strategicContext || null;
    state.questions = questions;
    state.currentQuestionIndex = session.currentQuestionIndex || 0;
    state.maxAdditionalQuestions = collection.maxAdditionalQuestions ?? 1; // Default to 1 if not set
    state.endOfInterviewSummaryEnabled =
      collection.endOfInterviewSummaryEnabled ?? false;

    state.crossInterviewRuntimeContext = buildCrossInterviewRuntimeContext(
      project,
      collection,
    );
    if (state.crossInterviewRuntimeContext.enabled) {
      const ctx = state.crossInterviewRuntimeContext;
      const questionCount = Object.keys(ctx.themesByQuestion || {}).length;
      const emergentCount = (ctx.emergentThemes || []).length;
      const qualityAlertCount = Object.keys(
        ctx.qualityInsightsByQuestion || {},
      ).length;
      console.log(
        `[CrossInterview] Enabled for session ${sessionId}: ${ctx.priorSessionCount} prior sessions, ${questionCount} questions with themes, ${emergentCount} emergent themes, ${qualityAlertCount} questions with quality alerts`,
      );
    } else {
      console.log(
        `[CrossInterview] Disabled for session ${sessionId}: ${state.crossInterviewRuntimeContext.reason}`,
      );
    }

    const templateQuestions = questions.map((q: any) => ({
      text: q.questionText,
      guidance: q.guidance || null,
    }));
    state.analyticsHypothesesRuntimeContext =
      buildAnalyticsHypothesesRuntimeContext(project, templateQuestions);
    if (state.analyticsHypothesesRuntimeContext.enabled) {
      const hCtx = state.analyticsHypothesesRuntimeContext;
      console.log(
        `[AnalyticsHypotheses] Enabled for session ${sessionId}: ${hCtx.hypotheses?.length} hypotheses from ${hCtx.totalProjectSessions} project sessions (analytics generated at ${hCtx.analyticsGeneratedAt ? new Date(hCtx.analyticsGeneratedAt).toISOString() : "unknown"})`,
      );
    } else {
      console.log(
        `[AnalyticsHypotheses] Disabled for session ${sessionId}: ${state.analyticsHypothesesRuntimeContext.reason}`,
      );
    }

    // Determine if this is a restored session based on session status or progress
    // This catches all cases: in_progress, paused, or any session with question progress
    const isRestoredSession =
      session.status === "in_progress" ||
      session.status === "paused" ||
      (session.currentQuestionIndex && session.currentQuestionIndex > 0);

    // Check if we also have persisted transcript data
    const hasPersistedTranscript =
      session.liveTranscript &&
      Array.isArray(session.liveTranscript) &&
      session.liveTranscript.length > 0;

    if (isRestoredSession) {
      console.log(
        `[VoiceInterview] Restoring session: ${sessionId} (status=${session.status}, questionIndex=${session.currentQuestionIndex})`,
      );
      state.isRestoredSession = true;
      // Set awaitingResume so audio is not forwarded until user explicitly resumes
      // This prevents OpenAI VAD from auto-responding to leaked/stray audio
      // Critical: Set based on session state, not transcript length, to catch early disconnects
      state.awaitingResume = true;

      // Restore FULL transcript to persistence buffer if available (never truncated - prevents data loss)
      if (hasPersistedTranscript) {
        const persistedTranscript =
          session.liveTranscript as PersistedTranscriptEntry[];
        state.fullTranscriptForPersistence = [...persistedTranscript];

        // Only keep last MAX_TRANSCRIPT_IN_MEMORY entries in memory for processing
        state.transcriptLog = persistedTranscript.slice(
          -MAX_TRANSCRIPT_IN_MEMORY,
        ) as TranscriptEntry[];
      }

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

      // Derive alviaHasSpokenOnCurrentQuestion from restored transcript
      state.alviaHasSpokenOnCurrentQuestion =
        state.fullTranscriptForPersistence.some(
          (entry) =>
            entry.speaker === "alvia" &&
            entry.questionIndex === state.currentQuestionIndex,
        );

      console.log(
        `[VoiceInterview] Restored ${state.fullTranscriptForPersistence.length} transcript entries (${state.transcriptLog.length} in memory), question ${state.currentQuestionIndex + 1}/${questions.length}, alviaSpoken=${state.alviaHasSpokenOnCurrentQuestion}`,
      );
    } else {
      // Initialize metrics for first question (new session)
      state.questionMetrics.set(0, createEmptyMetrics(0));
      updateQuestionState(state, 0, { status: "in_progress" });
    }

    // Connect to Realtime API provider
    connectToRealtimeProvider(sessionId, clientWs);
  } catch (error) {
    console.error("[VoiceInterview] Error initialising:", error);
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
        state.alviaHasSpokenOnCurrentQuestion,
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
      const vadUpdate = provider.buildTurnDetectionUpdate("low");
      if (vadUpdate) {
        providerWs.send(
          JSON.stringify({
            type: "session.update",
            session: vadUpdate,
          }),
        );
      }
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
        vadEagerness: state.transcriptionQualitySignals.vadEagernessReduced
          ? "low"
          : "auto",
        // Include pause/resume state for client reconnection logic
        awaitingResume: state.awaitingResume,
        isPaused: state.isPaused,
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
              JSON.stringify(state.providerInstance.buildResponseCreate()),
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

    case "response.text.delta":
    case "response.output_text.delta": {
      if (state.isGeneratingAlviaSummary && event.delta) {
        state.alviaSummaryAccumulatedText += event.delta;
      }
      break;
    }

    case "response.audio_transcript.delta":
    case "response.output_audio_transcript.delta":
      // AI's speech transcript
      clientWs?.send(
        JSON.stringify({
          type: "ai_transcript",
          delta: event.delta
            ? event.delta.replace(/[\u2014\u2013]/g, ";")
            : event.delta,
        }),
      );
      break;

    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done": {
      const cleanedTranscript = event.transcript
        ? sanitizeAlviaTranscript(event.transcript)
        : event.transcript;
      // Store the last AI prompt for resume functionality
      if (cleanedTranscript) {
        state.lastAIPrompt = cleanedTranscript;
        state.alviaHasSpokenOnCurrentQuestion = true;
        // Add to transcript log (both in-memory and persistence buffer)
        addTranscriptEntry(state, {
          speaker: "alvia",
          text: cleanedTranscript,
          timestamp: Date.now(),
          questionIndex: state.currentQuestionIndex,
        });
        // Schedule debounced persist
        scheduleDebouncedPersist(sessionId);
      }
      clientWs?.send(
        JSON.stringify({
          type: "ai_transcript_done",
          transcript: cleanedTranscript,
        }),
      );
      break;
    }

    case "conversation.item.input_audio_transcription.completed":
      // User's speech transcript (from transcription model)
      // Record transcription token usage if reported by the API
      if (event.usage) {
        const txAttribution = buildUsageAttribution(state);
        const txProvider =
          state.providerInstance.name === "grok"
            ? ("xai" as const)
            : ("openai" as const);
        recordLlmUsageEvent(
          txAttribution,
          txProvider,
          state.providerInstance.getTranscriptionModelName(),
          "alvia_transcription",
          {
            promptTokens: event.usage.input_tokens || 0,
            completionTokens: event.usage.output_tokens || 0,
            totalTokens:
              event.usage.total_tokens ||
              (event.usage.input_tokens || 0) +
                (event.usage.output_tokens || 0),
            inputAudioTokens:
              event.usage.input_token_details?.audio_tokens || 0,
            outputAudioTokens: 0,
          },
          "success",
        ).catch((err) =>
          console.error(
            "[LLM Usage] Failed to record alvia_transcription event:",
            err,
          ),
        );
      }
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
          const currentQuestionForQuality =
            state.questions[correctQuestionIndex];
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
            state.transcriptionQualitySignals.utterancesSinceEnvironmentCheck >=
              5
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
            state.transcriptionQualitySignals.vadEagernessReducedAt =
              Date.now();
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

      // Flush dangling Alvia speaking metrics on barge-in:
      // If the user interrupts while Alvia is mid-speech, response.audio.done
      // may not fire for the cancelled response, leaving currentResponseStartAt
      // dangling. Accumulate partial speaking time and update silence tracking now.
      if (state.metricsTracker.alviaSpeaking.currentResponseStartAt !== null) {
        const elapsed =
          now - state.metricsTracker.alviaSpeaking.currentResponseStartAt;
        state.metricsTracker.alviaSpeaking.totalMs += elapsed;
        state.metricsTracker.alviaSpeaking.turnCount++;
        state.metricsTracker.alviaSpeaking.currentResponseStartAt = null;
        state.metricsTracker.silenceTracking.lastAlviaEndAt = now;
        state.metricsTracker.silenceTracking.lastSpeechStartAt = null;
      }

      // Record silence segment that just ended (respondent starting to speak)
      recordSilenceSegment(state.metricsTracker, state, now);
      state.metricsTracker.silenceTracking.lastSpeechStartAt = now;

      // Mark the last AI transcript entry as interrupted for persistence
      if (state.fullTranscriptForPersistence.length > 0) {
        const lastEntry =
          state.fullTranscriptForPersistence[
            state.fullTranscriptForPersistence.length - 1
          ];
        if (lastEntry.speaker === "alvia") {
          lastEntry.interrupted = true;
        }
      }

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

      if (state.isGeneratingAlviaSummary) {
        const responseStatus = event.response?.status;
        const responseModalities =
          event.response?.output_modalities ??
          event.response?.modalities;
        const isTextResponse =
          responseModalities?.includes("text") ||
          !responseModalities;

        if (!isTextResponse) {
          console.log(
            `[AlviaSummary] Ignoring stale non-text response.done for ${sessionId} (modalities: ${JSON.stringify(responseModalities)}, status: ${responseStatus})`,
          );
          break;
        }

        if (responseStatus === "cancelled" || responseStatus === "failed") {
          console.error(
            `[AlviaSummary] Summary response ${responseStatus} for ${sessionId} — rejecting`,
          );
          if (state.alviaSummaryReject) {
            state.alviaSummaryReject(
              new Error(`Alvia summary response ${responseStatus}`),
            );
          }
          state.isGeneratingAlviaSummary = false;
          state.alviaSummaryResolve = null;
          state.alviaSummaryReject = null;
          break;
        }

        if (responseStatus !== "completed") {
          console.warn(
            `[AlviaSummary] Unexpected response status for ${sessionId}: ${responseStatus} — waiting for completed`,
          );
          break;
        }

        const outputItems = event.response?.output ?? [];
        let extractedText: string | undefined;

        for (const outputItem of outputItems) {
          if (outputItem?.content) {
            const textContent = outputItem.content.find(
              (c: any) => c.type === "text",
            );
            if (textContent?.text) {
              extractedText = textContent.text;
              break;
            }
          }
          if (outputItem?.text) {
            extractedText = outputItem.text;
            break;
          }
        }

        if (!extractedText && state.alviaSummaryAccumulatedText) {
          console.log(
            `[AlviaSummary] Using accumulated delta text for ${sessionId} (${state.alviaSummaryAccumulatedText.length} chars) — output items had no inline text`,
          );
          extractedText = state.alviaSummaryAccumulatedText;
        }

        if (extractedText && state.alviaSummaryResolve) {
          state.alviaSummaryResolve(extractedText);
        } else {
          const outputDiag = outputItems.map((item: any) => ({
            type: item?.type,
            role: item?.role,
            status: item?.status,
            contentTypes: item?.content?.map((c: any) => c?.type),
            hasText: !!item?.text,
            keys: Object.keys(item || {}),
          }));
          console.error(
            `[AlviaSummary] No text found in completed response for ${sessionId}. Output structure: ${JSON.stringify(outputDiag)}, accumulated delta chars: ${state.alviaSummaryAccumulatedText.length}`,
          );
          if (state.alviaSummaryReject) {
            state.alviaSummaryReject(
              new Error(`No text content in completed Alvia summary response (${outputItems.length} output items)`),
            );
          }
        }
        state.isGeneratingAlviaSummary = false;
        state.alviaSummaryResolve = null;
        state.alviaSummaryReject = null;
        break;
      }

      clientWs?.send(JSON.stringify({ type: "response_done" }));
      break;
    }

    case "error": {
      const errorCode = event.error?.code;
      const errorMessage = event.error?.message || "Voice service error";

      if (errorCode === "conversation_already_has_active_response") {
        console.warn(
          `[VoiceInterview] Response already in progress for ${sessionId}, waiting for response.done`,
        );
        if (state.isGeneratingAlviaSummary && state.alviaSummaryReject) {
          console.error(
            `[AlviaSummary] Summary response.create rejected — active response collision for ${sessionId}`,
          );
          state.alviaSummaryReject(
            new Error("Cannot create summary response: active response in progress"),
          );
          state.isGeneratingAlviaSummary = false;
          state.alviaSummaryResolve = null;
          state.alviaSummaryReject = null;
        }
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
const BARBARA_TIMEOUT_MS = 10000;

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
    const currentQuestion = state.questions[state.currentQuestionIndex];
    const metrics = state.questionMetrics.get(state.currentQuestionIndex);
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
      { followUpCount: metrics?.followUpCount ?? 0, recommendedFollowUps },
      state.strategicContext,
      state.alviaHasSpokenOnCurrentQuestion,
    );

    state.providerWs.send(
      JSON.stringify({
        type: "session.update",
        session:
          state.providerInstance.buildInstructionsUpdate(updatedInstructions),
      }),
    );

    console.log(
      `[TranscriptionQuality] Injected environment check guidance via full instruction rebuild for session ${sessionId}`,
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

  const vadUpdate = state.providerInstance.buildTurnDetectionUpdate(eagerness);
  if (!vadUpdate) {
    return;
  }

  state.providerWs.send(
    JSON.stringify({
      type: "session.update",
      session: vadUpdate,
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
  console.log(`[Barbara] Analysing conversation for session: ${sessionId}`);

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

    const barbaraInput: BarbaraAnalysisInput = {
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
    };

    const ctx = state.crossInterviewRuntimeContext;
    if (ctx.enabled) {
      const questionThemes =
        ctx.themesByQuestion?.[state.currentQuestionIndex] || [];
      const emergentThemes = ctx.emergentThemes || [];

      const isAdditionalQuestion =
        state.currentQuestionIndex >= state.questions.length;
      const currentQuestionQuality = !isAdditionalQuestion
        ? ctx.qualityInsightsByQuestion?.[state.currentQuestionIndex]
        : undefined;

      const upcomingQualityAlerts: CompactQuestionQualityInsight[] = [];
      if (ctx.qualityInsightsByQuestion && !isAdditionalQuestion) {
        const templateQuestionCount = state.questions.length;
        for (
          let i = state.currentQuestionIndex + 1;
          i < templateQuestionCount && upcomingQualityAlerts.length < 3;
          i++
        ) {
          const insight = ctx.qualityInsightsByQuestion[i];
          if (insight) {
            upcomingQualityAlerts.push(insight);
          }
        }
      }

      const hasThemeContext =
        questionThemes.length > 0 || emergentThemes.length > 0;
      const hasQualityContext =
        currentQuestionQuality !== undefined ||
        upcomingQualityAlerts.length > 0;

      if (hasThemeContext || hasQualityContext) {
        barbaraInput.crossInterviewContext = {
          priorSessionCount: ctx.priorSessionCount!,
          snapshotGeneratedAt: ctx.snapshotGeneratedAt ?? null,
          questionThemes,
          emergentThemes,
          currentQuestionQuality: currentQuestionQuality
            ? {
                questionIndex: currentQuestionQuality.questionIndex,
                responseCount: currentQuestionQuality.responseCount,
                avgQualityScore: currentQuestionQuality.avgQualityScore,
                responseRichness: currentQuestionQuality.responseRichness,
                avgWordCount: currentQuestionQuality.avgWordCount,
                topFlags: currentQuestionQuality.topFlags,
                perspectiveRange: currentQuestionQuality.perspectiveRange,
              }
            : undefined,
          upcomingQualityAlerts:
            upcomingQualityAlerts.length > 0
              ? upcomingQualityAlerts.map((q) => ({
                  questionIndex: q.questionIndex,
                  responseCount: q.responseCount,
                  avgQualityScore: q.avgQualityScore,
                  responseRichness: q.responseRichness,
                  avgWordCount: q.avgWordCount,
                  topFlags: q.topFlags,
                  perspectiveRange: q.perspectiveRange,
                }))
              : undefined,
        };
        console.log(
          `[CrossInterview] Injecting ${questionThemes.length} question themes + ${emergentThemes.length} emergent themes for Q${state.currentQuestionIndex + 1}`,
        );
        console.log(
          `[CrossInterview] Injecting quality insights for Q${state.currentQuestionIndex + 1}: current=${currentQuestionQuality ? 1 : 0}, upcoming=${upcomingQualityAlerts.length}`,
        );
      }
    }

    const hCtx = state.analyticsHypothesesRuntimeContext;
    if (hCtx.enabled && hCtx.hypotheses?.length) {
      barbaraInput.analyticsHypotheses = {
        totalProjectSessions: hCtx.totalProjectSessions!,
        analyticsGeneratedAt: hCtx.analyticsGeneratedAt ?? null,
        hypotheses: hCtx.hypotheses.map((h) => ({
          hypothesis: h.hypothesis,
          source: h.source,
          priority: h.priority,
          isCurrentQuestionRelevant:
            h.relatedQuestionIndices.includes(state.currentQuestionIndex) ||
            h.relatedQuestionIndices.length === 0,
        })),
      };
      console.log(
        `[AnalyticsHypotheses] Injecting ${hCtx.hypotheses.length} hypotheses for Q${state.currentQuestionIndex + 1}`,
      );
    }

    const analysisPromise = analyzeWithBarbara(
      barbaraInput,
      buildUsageAttribution(state),
    );

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
          state.alviaHasSpokenOnCurrentQuestion,
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
            session:
              state.providerInstance.buildInstructionsUpdate(
                updatedInstructions,
              ),
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
          JSON.stringify(state.providerInstance.buildResponseCreate()),
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
                JSON.stringify(state.providerInstance.buildResponseCreate()),
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
            JSON.stringify(state.providerInstance.buildResponseCreate()),
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
        state.alviaHasSpokenOnCurrentQuestion = false;
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
          state.alviaHasSpokenOnCurrentQuestion,
        );

        if (state.providerWs.readyState === WebSocket.OPEN) {
          // Update session with new question context
          state.providerWs.send(
            JSON.stringify({
              type: "session.update",
              session:
                state.providerInstance.buildInstructionsUpdate(instructions),
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
                  buildUsageAttribution(state),
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
                  JSON.stringify(state.providerInstance.buildResponseCreate()),
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
          await finalizeInterview(sessionId);
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

      await finalizeInterview(sessionId);
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
            "Barbara is analysing your interview to identify follow-up questions...",
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

            await finalizeInterview(sessionId, {
              additionalQuestionPhase: false,
            });
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

          await finalizeInterview(sessionId);
        }
      })();
      break;

    case "decline_additional_questions":
      // User declined additional questions - complete the interview
      state.lastActivityAt = Date.now();
      state.additionalQuestionsConsent = false;

      {
        // Generate summary for the final question before completing
        const declineTranscriptSnapshot = [
          ...state.fullTranscriptForPersistence,
        ] as TranscriptEntry[];
        const declineFinalQuestionIdx = state.currentQuestionIndex;

        const declineSummaryPromise = generateAndPersistSummary(
          sessionId,
          declineFinalQuestionIdx,
          declineTranscriptSnapshot,
        );
        state.pendingSummaryPromises.set(
          declineFinalQuestionIdx,
          declineSummaryPromise,
        );
      }

      // Await all pending summaries (including the final one just triggered)
      await awaitPendingSummaries(sessionId);

      await finalizeInterview(sessionId, { additionalQuestionPhase: false });
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

          await finalizeInterview(sessionId, {
            additionalQuestionPhase: false,
          });
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

        await finalizeInterview(sessionId, { additionalQuestionPhase: false });
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

      // Gate audio forwarding on pause/resume state (same as regular audio path)
      // This prevents buffered audio from bypassing the pause/awaiting-resume gate
      if (state.isPaused || state.awaitingResume) {
        console.log(
          `[VoiceInterview] Discarding client_resuming_audio while paused/awaiting resume for session: ${sessionId}`,
        );
        break;
      }

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

  const result = await generateAdditionalQuestions(
    {
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
      analyticsHypotheses: state.analyticsHypothesesRuntimeContext.enabled
        ? state.analyticsHypothesesRuntimeContext.hypotheses?.map((h) => ({
            hypothesis: h.hypothesis,
            source: h.source,
            priority: h.priority,
          }))
        : undefined,
    },
    buildUsageAttribution(state),
  );

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
        session: state.providerInstance.buildInstructionsUpdate(aqInstruction),
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
        JSON.stringify(state.providerInstance.buildResponseCreate()),
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

  return `You are Alvia, a warm and professional AI interviewer. You are continuing the main interview conversation with a few more questions, in a British accent. You are polite, encouraging, but also firm and challenge when necessary.

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
- Keep this portion brief but thorough, aim for 1-2 follow-up probes maximum
- Acknowledge insights with genuine interest
- Continue the conversation naturally without announcing a topic change or transition; do not say things like "let's shift gears", "I'd like to move on to", or "now I have some follow-up questions"

STYLE POLICY (IMPORTANT):
- USE British English, varied sentence length.

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
      buildUsageAttribution(state),
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
    barbaraTokens: tracker.barbaraTokens,
  };

  const realtimeAttribution = buildUsageAttribution(state);
  const providerForUsage = state.providerInstance;
  const usageProvider =
    providerForUsage.name === "grok" ? ("xai" as const) : ("openai" as const);
  recordLlmUsageEvent(
    realtimeAttribution,
    usageProvider,
    providerForUsage.getModelName(),
    "alvia_realtime",
    {
      promptTokens: tracker.tokens.inputTextTokens,
      completionTokens: tracker.tokens.outputTextTokens,
      totalTokens: tracker.tokens.inputTokens + tracker.tokens.outputTokens,
      inputAudioTokens: tracker.tokens.inputAudioTokens,
      outputAudioTokens: tracker.tokens.outputAudioTokens,
    },
    "success",
  ).catch((err) =>
    console.error("[LLM Usage] Failed to record alvia_realtime event:", err),
  );

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

async function waitForResponseIdle(
  state: InterviewState,
  sessionId: string,
  maxWaitMs: number = 5000,
): Promise<boolean> {
  if (!state.responseInProgress) return true;

  console.log(
    `[AlviaSummary] Waiting for active response to complete before summary for ${sessionId}`,
  );

  const pollInterval = 100;
  const deadline = Date.now() + maxWaitMs;

  while (state.responseInProgress && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  if (state.responseInProgress) {
    console.warn(
      `[AlviaSummary] Timed out waiting for response idle after ${maxWaitMs}ms for ${sessionId}`,
    );
    return false;
  }

  console.log(
    `[AlviaSummary] Response idle achieved for ${sessionId}, proceeding with summary`,
  );
  return true;
}

async function generateAlviaSummary(sessionId: string): Promise<string | null> {
  const state = interviewStates.get(sessionId);
  if (
    !state ||
    !state.providerWs ||
    state.providerWs.readyState !== WebSocket.OPEN
  ) {
    console.warn(
      `[AlviaSummary] Cannot generate — provider WS not open for ${sessionId} (state: ${state ? "exists" : "missing"}, ws: ${state?.providerWs ? state.providerWs.readyState : "null"})`,
    );
    return null;
  }

  const ALVIA_SUMMARY_TIMEOUT_MS = 30000;
  const RESPONSE_IDLE_WAIT_MS = 5000;

  try {
    const isIdle = await waitForResponseIdle(state, sessionId, RESPONSE_IDLE_WAIT_MS);
    if (!isIdle) {
      console.error(
        `[AlviaSummary] Aborting summary — response still in progress after ${RESPONSE_IDLE_WAIT_MS}ms for ${sessionId}`,
      );
      return null;
    }

    if (!state.providerWs || state.providerWs.readyState !== WebSocket.OPEN) {
      console.warn(
        `[AlviaSummary] Provider WS closed while waiting for idle for ${sessionId}`,
      );
      return null;
    }

    state.isGeneratingAlviaSummary = true;
    state.alviaSummaryAccumulatedText = "";

    const templateObjective =
      state.template?.objective || "General research interview";
    const project = state.template?.projectId
      ? await storage.getProject(state.template.projectId)
      : null;
    const projectObjective = project?.objective || "";

    const summaryPrompt = `You are Alvia. You just finished conducting an interview.
The interview objective was: ${templateObjective}
${projectObjective ? `The broader research objective: ${projectObjective}` : ""}

Based on your conversation, provide a JSON summary:
{
  "themes": [{ "theme": "short name", "description": "one sentence" }],
  "overallSummary": "3-5 sentence narrative of key takeaways",
  "objectiveSatisfaction": {
    "assessment": "How well did this interview address the research objectives?",
    "coveredAreas": ["Areas well covered"],
    "gaps": ["Areas that weren't adequately explored"]
  }
}

Respond with ONLY the JSON object. No other text.`;

    const summaryPromise = new Promise<string>((resolve, reject) => {
      state.alviaSummaryResolve = resolve;
      state.alviaSummaryReject = reject;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Alvia summary timed out after 30s")),
        ALVIA_SUMMARY_TIMEOUT_MS,
      );
    });

    const textOnlyConfig =
      state.providerInstance.buildTextOnlySessionConfig(summaryPrompt);
    state.providerWs.send(
      JSON.stringify({
        type: "session.update",
        session: textOnlyConfig,
      }),
    );

    state.providerWs.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: summaryPrompt,
            },
          ],
        },
      }),
    );

    state.providerWs.send(
      JSON.stringify(state.providerInstance.buildTextOnlyResponseCreate()),
    );

    console.log(
      `[AlviaSummary] Summary request sent for ${sessionId}, waiting for response...`,
    );

    const result = await Promise.race([summaryPromise, timeoutPromise]);
    console.log(
      `[AlviaSummary] Generated summary for ${sessionId} (${result.length} chars)`,
    );
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AlviaSummary] Failed for ${sessionId}: ${errorMsg}`);
    state.isGeneratingAlviaSummary = false;
    state.alviaSummaryResolve = null;
    state.alviaSummaryReject = null;
    return null;
  }
}

async function triggerBarbaraSessionSummary(
  sessionId: string,
  transcriptSnapshot: TranscriptEntry[],
  summariesSnapshot: QuestionSummary[],
  state: InterviewState,
): Promise<void> {
  try {
    const project = state.template?.projectId
      ? await storage.getProject(state.template.projectId)
      : null;

    const result = await generateSessionSummary(
      {
        transcript: transcriptSnapshot,
        questionSummaries: summariesSnapshot,
        templateObjective:
          state.template?.objective || "General research interview",
        projectObjective: project?.objective || undefined,
        strategicContext: state.strategicContext || undefined,
        questions: state.questions.map((q: any) => ({
          text: q.questionText,
          guidance: q.guidance || null,
        })),
      },
      buildUsageAttribution(state),
    );

    await storage.persistInterviewState(sessionId, {
      barbaraSessionSummary: result,
    });

    console.log(`[BarbaraSummary] Session summary persisted for ${sessionId}`);
  } catch (error) {
    console.error(`[BarbaraSummary] Failed for ${sessionId}:`, error);
  }
}

async function finalizeInterview(
  sessionId: string,
  extraPatch?: Partial<InterviewStatePatch>,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  state.isFinalizing = true;

  const clientWs = state.clientWs;

  if (clientWs && clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({ type: "interview_complete" }));
  }

  await storage.persistInterviewState(sessionId, {
    status: "completed",
    completedAt: new Date(),
    ...extraPatch,
  });
  console.log(
    `[VoiceInterview] Session ${sessionId} marked completed before summary generation`,
  );

  if (state.endOfInterviewSummaryEnabled) {
    const transcriptSnapshot = [
      ...state.fullTranscriptForPersistence,
    ] as TranscriptEntry[];
    const summariesSnapshot = state.questionSummaries.filter(
      (s): s is QuestionSummary => s != null,
    );
    const stateSnapshot = {
      ...state,
      template: state.template,
      strategicContext: state.strategicContext,
      questions: [...state.questions],
    };

    const alviaSummaryPromise = generateAlviaSummary(sessionId).then(
      async (alviaSummaryText) => {
        if (alviaSummaryText) {
          try {
            const parsed = JSON.parse(alviaSummaryText) as AlviaSessionSummary;
            parsed.generatedAt = Date.now();
            parsed.model =
              state.providerType === "openai"
                ? "gpt-4o-mini-realtime"
                : "grok-3-fast";
            parsed.provider = state.providerType;
            await storage.persistInterviewState(sessionId, {
              alviaSummary: parsed,
            });
            console.log(`[AlviaSummary] Persisted for ${sessionId}`);
          } catch (parseError) {
            const fallback: AlviaSessionSummary = {
              themes: [],
              overallSummary: alviaSummaryText,
              objectiveSatisfaction: {
                assessment: "Unable to parse structured response",
                coveredAreas: [],
                gaps: [],
              },
              generatedAt: Date.now(),
              model:
                state.providerType === "openai"
                  ? "gpt-4o-mini-realtime"
                  : "grok-3-fast",
              provider: state.providerType,
            };
            await storage.persistInterviewState(sessionId, {
              alviaSummary: fallback,
            });
            console.warn(
              `[AlviaSummary] Stored raw text fallback for ${sessionId}`,
            );
          }
        }
      },
    );

    const barbaraSummaryPromise = triggerBarbaraSessionSummary(
      sessionId,
      transcriptSnapshot,
      summariesSnapshot,
      stateSnapshot as InterviewState,
    );

    try {
      await Promise.allSettled([alviaSummaryPromise, barbaraSummaryPromise]);
    } catch (error) {
      console.error(
        `[SessionSummary] Error during summary generation for ${sessionId}:`,
        error,
      );
    }
  }

  cleanupSession(sessionId, "completed");
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

  // Start WebSocket protocol-level ping interval
  // This prevents infrastructure timeouts (load balancers, proxies) that may not respect
  // application-level heartbeats - they specifically look for ws ping/pong frames
  watchdogState.pingInterval = setInterval(() => {
    sendProtocolPings();
  }, WS_PING_INTERVAL_MS);

  console.log(
    "[SessionWatchdog] Started - checking every",
    WATCHDOG_INTERVAL_MS / 1000,
    "seconds, WS pings every",
    WS_PING_INTERVAL_MS / 1000,
    "seconds",
  );
}

function stopSessionWatchdog(): void {
  if (watchdogState.interval) {
    clearInterval(watchdogState.interval);
    watchdogState.interval = null;
  }
  if (watchdogState.pingInterval) {
    clearInterval(watchdogState.pingInterval);
    watchdogState.pingInterval = null;
  }
  console.log("[SessionWatchdog] Stopped - no active sessions");
}

function sendProtocolPings(): void {
  const now = Date.now();
  let pingsSent = 0;
  let errors = 0;

  for (const [sessionId, state] of interviewStates) {
    // Only ping connected clients
    if (state.clientWs && state.clientWs.readyState === WebSocket.OPEN) {
      try {
        state.clientWs.ping();
        pingsSent++;
      } catch (error) {
        errors++;
        console.error(`[WS-Ping] Failed to ping client ${sessionId}:`, error);
      }
    }
  }

  if (pingsSent > 0 || errors > 0) {
    console.log(`[WS-Ping] Sent ${pingsSent} protocol pings, ${errors} errors`);
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
    // Skip sessions that are in the process of finalizing (completing + generating summaries)
    if (state.isFinalizing) continue;

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
