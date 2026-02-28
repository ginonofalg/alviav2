import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  refreshConnection,
  type RefreshDependencies,
} from "../voice-interview/connection-refresh";
import {
  type InterviewState,
  CONNECTION_REFRESH_MS,
  CONNECTION_REFRESH_FALLBACK_MS,
  CONNECTION_REFRESH_LAST_RESORT_MS,
  WS_CLOSE_CODE_REFRESH,
} from "../voice-interview/types";
import { buildRefreshInstructions } from "../voice-interview/instructions";

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
    refreshResetTimeout: null,
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

  describe("Stale clientWs guard", () => {
    it("does not close a replaced clientWs in the timeout", async () => {
      vi.useFakeTimers();
      await refreshConnection("test-session", deps);

      const oldClientWs = state.clientWs;
      const newClientWs = createMockWs();
      state.clientWs = newClientWs;

      vi.advanceTimersByTime(400);

      expect(oldClientWs!.close).not.toHaveBeenCalled();
      expect(state.clientDisconnectedAt).toBeNull();

      vi.useRealTimers();
    });

    it("closes the original clientWs when it has not been replaced", async () => {
      vi.useFakeTimers();
      await refreshConnection("test-session", deps);

      vi.advanceTimersByTime(400);

      expect(state.clientWs!.close).toHaveBeenCalledWith(4000, "Planned connection refresh");
      expect(state.clientDisconnectedAt).not.toBeNull();

      vi.useRealTimers();
    });
  });

  describe("isConnectionRefresh reset timeout", () => {
    it("sets refreshResetTimeout during refresh", async () => {
      vi.useFakeTimers();
      await refreshConnection("test-session", deps);

      expect(state.refreshResetTimeout).not.toBeNull();

      vi.useRealTimers();
    });

    it("resets isConnectionRefresh after 30s if no reconnect", async () => {
      vi.useFakeTimers();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await refreshConnection("test-session", deps);

      expect(state.isConnectionRefresh).toBe(true);

      vi.advanceTimersByTime(30_000);

      expect(state.isConnectionRefresh).toBe(false);
      expect(state.refreshResetTimeout).toBeNull();

      const resetWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("resetting isConnectionRefresh"),
      );
      expect(resetWarnings).toHaveLength(1);

      warnSpy.mockRestore();
      vi.useRealTimers();
    });

    it("does not reset if isConnectionRefresh was already cleared (reconnect happened)", async () => {
      vi.useFakeTimers();
      await refreshConnection("test-session", deps);

      state.isConnectionRefresh = false;

      vi.advanceTimersByTime(30_000);

      expect(state.isConnectionRefresh).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("Last-resort fallback", () => {
    it("CONNECTION_REFRESH_LAST_RESORT_MS is 14 min 55 sec", () => {
      expect(CONNECTION_REFRESH_LAST_RESORT_MS).toBe(895_000);
    });

    it("last-resort fires even with responseInProgress", () => {
      state.responseInProgress = true;
      state.speakingStartTime = Date.now();
      state.clientWsConnectedAt = Date.now() - CONNECTION_REFRESH_LAST_RESORT_MS - 1000;

      const shouldLastResort =
        !state.isConnectionRefresh &&
        !state.isFinalizing;

      expect(shouldLastResort).toBe(true);
    });

    it("last-resort does NOT fire during active refresh", () => {
      state.isConnectionRefresh = true;
      state.clientWsConnectedAt = Date.now() - CONNECTION_REFRESH_LAST_RESORT_MS - 1000;

      const shouldLastResort =
        !state.isConnectionRefresh &&
        !state.isFinalizing;

      expect(shouldLastResort).toBe(false);
    });

    it("last-resort does NOT fire during finalization", () => {
      state.isFinalizing = true;
      state.clientWsConnectedAt = Date.now() - CONNECTION_REFRESH_LAST_RESORT_MS - 1000;

      const shouldLastResort =
        !state.isConnectionRefresh &&
        !state.isFinalizing;

      expect(shouldLastResort).toBe(false);
    });
  });

  describe("Paused session refresh behavior", () => {
    it("refreshConnection does not alter isPaused", async () => {
      state.isPaused = true;
      await refreshConnection("test-session", deps);

      expect(state.isPaused).toBe(true);
      expect(state.isConnectionRefresh).toBe(true);
    });

    it("isPaused blocks auto-trigger when autoTriggerAfterRefresh was set", () => {
      state.isRestoredSession = true;
      state.autoTriggerAfterRefresh = true;
      state.isPaused = true;

      const shouldSkipForRestore = state.isRestoredSession && !state.autoTriggerAfterRefresh;
      expect(shouldSkipForRestore).toBe(false);

      state.autoTriggerAfterRefresh = false;
      expect(state.isPaused).toBe(true);
    });
  });

  describe("flushPersist timeout cleanup", () => {
    it("does not log timeout warning when persist succeeds quickly", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      deps.flushPersist = vi.fn().mockResolvedValue(undefined);

      await refreshConnection("test-session", deps);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const timeoutWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("flushPersist timed out"),
      );
      expect(timeoutWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe("AQ phase resume context", () => {
    it("uses AQ question text when in additional questions phase", () => {
      const aqState = createMockState({
        isInAdditionalQuestionsPhase: true,
        additionalQuestions: [
          { questionText: "What trends do you see?", rationale: "test", questionType: "open" as const, index: 0 },
          { questionText: "Any final thoughts?", rationale: "test", questionType: "open" as const, index: 1 },
        ],
        currentAdditionalQuestionIndex: 0,
        transcriptLog: [
          { speaker: "alvia", text: "Let me ask you about trends.", timestamp: Date.now(), questionIndex: 3 },
        ],
      });

      const instructions = buildRefreshInstructions(aqState);
      expect(instructions).toContain("What trends do you see?");
      expect(instructions).not.toContain("Test question?");
    });
  });
});
