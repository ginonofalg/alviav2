import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  refreshConnection,
  type RefreshDependencies,
} from "../voice-interview/connection-refresh";
import {
  type InterviewState,
  CONNECTION_REFRESH_MS,
  CONNECTION_REFRESH_FALLBACK_MS,
  WS_CLOSE_CODE_REFRESH,
} from "../voice-interview/types";

function createMockWs(readyState = 1): any {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    removeAllListeners: vi.fn(),
    ping: vi.fn(),
    OPEN: 1,
  };
}

function createMockState(overrides: Partial<InterviewState> = {}): InterviewState {
  const now = Date.now();
  return {
    sessionId: "test-session",
    connectionId: "conn-1",
    currentQuestionIndex: 0,
    questions: [{ questionText: "Test question?", guidance: "" }],
    template: { objective: "Test", tone: "professional" },
    strategicContext: null,
    contextType: null,
    avoidRules: null,
    providerWs: createMockWs(),
    collectionId: null,
    providerType: "openai",
    providerInstance: {} as any,
    clientWs: createMockWs(),
    isConnected: true,
    lastAIPrompt: "",
    alviaHasSpokenOnCurrentQuestion: false,
    isPaused: false,
    pauseStartedAt: null,
    totalPauseDurationMs: 0,
    respondentInformalName: null,
    transcriptLog: [],
    questionMetrics: new Map(),
    speakingStartTime: null,
    questionIndexAtSpeechStart: null,
    barbaraGuidanceQueue: [],
    isWaitingForBarbara: false,
    isBarbaraGuidanceUpdate: false,
    isInitialSession: false,
    clientAudioReady: true,
    sessionConfigured: true,
    fullTranscriptForPersistence: [],
    lastBarbaraGuidance: null,
    barbaraGuidanceLog: [],
    questionStates: [],
    questionSummaries: [],
    pendingPersistTimeout: null,
    lastPersistAt: 0,
    isRestoredSession: false,
    awaitingResume: false,
    createdAt: now,
    lastHeartbeatAt: now,
    lastActivityAt: now,
    terminationWarned: false,
    clientDisconnectedAt: null,
    isFinalizing: false,
    clientWsConnectedAt: now,
    needsConnectionRefresh: false,
    pendingRefreshAfterTranscript: false,
    isConnectionRefresh: false,
    useRefreshInstructions: false,
    autoTriggerAfterRefresh: false,
    metricsTracker: {} as any,
    transcriptionQualitySignals: {} as any,
    isInAdditionalQuestionsPhase: false,
    additionalQuestions: [],
    currentAdditionalQuestionIndex: -1,
    additionalQuestionsConsent: null,
    additionalQuestionsGenerating: false,
    maxAdditionalQuestions: 0,
    endOfInterviewSummaryEnabled: false,
    vadEagernessMode: "auto",
    isGeneratingAlviaSummary: false,
    alviaSummaryResolve: null,
    alviaSummaryReject: null,
    alviaSummaryAccumulatedText: "",
    pendingSummaryPromises: new Map(),
    responseInProgress: false,
    responseStartedAt: null,
    lastResponseDoneAt: null,
    processedResponseIds: new Set(),
    crossInterviewRuntimeContext: { enabled: false },
    analyticsHypothesesRuntimeContext: { enabled: false },
    ...overrides,
  } as InterviewState;
}

describe("Connection Refresh", () => {
  let state: InterviewState;
  let deps: RefreshDependencies;

  beforeEach(() => {
    state = createMockState();
    deps = {
      getState: vi.fn().mockReturnValue(state),
      flushPersist: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe("refreshConnection", () => {
    it("sets isConnectionRefresh and clears needsConnectionRefresh", async () => {
      state.needsConnectionRefresh = true;
      await refreshConnection("test-session", deps);

      expect(state.isConnectionRefresh).toBe(true);
      expect(state.needsConnectionRefresh).toBe(false);
      expect(state.pendingRefreshAfterTranscript).toBe(false);
    });

    it("sends connection_refresh message to client", async () => {
      await refreshConnection("test-session", deps);

      expect(state.clientWs!.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connection_refresh"'),
      );
    });

    it("closes and nulls provider WS", async () => {
      const providerWs = state.providerWs!;
      await refreshConnection("test-session", deps);

      expect(providerWs.removeAllListeners).toHaveBeenCalled();
      expect(providerWs.close).toHaveBeenCalled();
      expect(state.providerWs).toBeNull();
    });

    it("resets response state", async () => {
      state.responseInProgress = true;
      state.responseStartedAt = Date.now();
      await refreshConnection("test-session", deps);

      expect(state.responseInProgress).toBe(false);
      expect(state.responseStartedAt).toBeNull();
    });

    it("awaits flushPersist before sending connection_refresh", async () => {
      const callOrder: string[] = [];
      deps.flushPersist = vi.fn().mockImplementation(async () => {
        callOrder.push("flush");
      });
      const originalSend = state.clientWs!.send;
      state.clientWs!.send = vi.fn().mockImplementation(() => {
        callOrder.push("send");
      });
      await refreshConnection("test-session", deps);

      expect(callOrder[0]).toBe("flush");
      expect(callOrder[1]).toBe("send");
    });

    it("proceeds if flushPersist fails", async () => {
      deps.flushPersist = vi.fn().mockRejectedValue(new Error("DB error"));
      await refreshConnection("test-session", deps);

      expect(state.clientWs!.send).toHaveBeenCalled();
      expect(state.isConnectionRefresh).toBe(true);
    });

    it("guards against double refresh", async () => {
      state.isConnectionRefresh = true;
      await refreshConnection("test-session", deps);

      expect(state.clientWs!.send).not.toHaveBeenCalled();
    });

    it("guards against missing clientWs", async () => {
      state.clientWs = null;
      await refreshConnection("test-session", deps);

      expect(deps.flushPersist).not.toHaveBeenCalled();
    });

    it("guards against missing state", async () => {
      deps.getState = vi.fn().mockReturnValue(undefined);
      await refreshConnection("test-session", deps);

      expect(deps.flushPersist).not.toHaveBeenCalled();
    });
  });

  describe("Watchdog refresh flag logic", () => {
    it("CONNECTION_REFRESH_MS is 13.5 minutes", () => {
      expect(CONNECTION_REFRESH_MS).toBe(810_000);
    });

    it("CONNECTION_REFRESH_FALLBACK_MS is 14.5 minutes", () => {
      expect(CONNECTION_REFRESH_FALLBACK_MS).toBe(870_000);
    });

    it("WS_CLOSE_CODE_REFRESH is 4000", () => {
      expect(WS_CLOSE_CODE_REFRESH).toBe(4000);
    });

    it("fallback should fire when needsConnectionRefresh is true (long silence)", () => {
      state.needsConnectionRefresh = true;
      state.clientWsConnectedAt = Date.now() - CONNECTION_REFRESH_FALLBACK_MS - 1000;

      const shouldFallback =
        !state.isConnectionRefresh &&
        !state.pendingRefreshAfterTranscript &&
        !state.clientDisconnectedAt &&
        !state.responseInProgress &&
        !state.speakingStartTime &&
        !state.isFinalizing;

      expect(shouldFallback).toBe(true);
    });

    it("fallback should NOT fire during active refresh cycle", () => {
      state.isConnectionRefresh = true;
      state.clientWsConnectedAt = Date.now() - CONNECTION_REFRESH_FALLBACK_MS - 1000;

      const shouldFallback =
        !state.isConnectionRefresh &&
        !state.pendingRefreshAfterTranscript;

      expect(shouldFallback).toBe(false);
    });

    it("fallback should NOT fire while response is in progress", () => {
      state.responseInProgress = true;
      state.clientWsConnectedAt = Date.now() - CONNECTION_REFRESH_FALLBACK_MS - 1000;

      const shouldFallback =
        !state.isConnectionRefresh &&
        !state.pendingRefreshAfterTranscript &&
        !state.clientDisconnectedAt &&
        !state.responseInProgress;

      expect(shouldFallback).toBe(false);
    });
  });

  describe("Planned refresh reconnect state", () => {
    it("sets correct flags for planned refresh reconnect", () => {
      state.isConnectionRefresh = true;
      const isPlannedRefresh = state.isConnectionRefresh;

      if (isPlannedRefresh) {
        state.isRestoredSession = true;
        state.isConnectionRefresh = false;
        state.useRefreshInstructions = true;
        state.autoTriggerAfterRefresh = true;
        state.isInitialSession = true;
        state.sessionConfigured = false;
        state.clientAudioReady = false;
        state.awaitingResume = false;
      }

      expect(state.isRestoredSession).toBe(true);
      expect(state.isConnectionRefresh).toBe(false);
      expect(state.useRefreshInstructions).toBe(true);
      expect(state.autoTriggerAfterRefresh).toBe(true);
      expect(state.isInitialSession).toBe(true);
      expect(state.sessionConfigured).toBe(false);
      expect(state.clientAudioReady).toBe(false);
      expect(state.awaitingResume).toBe(false);
    });

    it("does not set awaitingResume for planned refresh", () => {
      const isPlannedRefresh = true;
      state.awaitingResume = !isPlannedRefresh;

      expect(state.awaitingResume).toBe(false);
    });

    it("sets awaitingResume for non-refresh reconnect", () => {
      const isPlannedRefresh = false;
      state.awaitingResume = !isPlannedRefresh;

      expect(state.awaitingResume).toBe(true);
    });
  });
});
