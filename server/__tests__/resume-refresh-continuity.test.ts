import { describe, it, expect } from "vitest";
import {
  buildResumeInstructions,
  buildRefreshInstructions,
} from "../voice-interview/instructions";
import type { InterviewState } from "../voice-interview/types";
import type { QuestionSummary } from "@shared/types/question-types";

function createMockWs(): any {
  return { readyState: 1, send() {}, close() {}, removeAllListeners() {}, ping() {}, OPEN: 1 };
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

function makeSummary(overrides: Partial<QuestionSummary> = {}): QuestionSummary {
  return {
    questionIndex: 0,
    questionText: "Previous question?",
    respondentSummary: "They answered.",
    keyInsights: [],
    completenessAssessment: "complete",
    relevantToFutureQuestions: [],
    wordCount: 10,
    turnCount: 2,
    activeTimeMs: 30000,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("Resume/Refresh Continuity", () => {
  it("resume includes continuity cues when question summaries exist", () => {
    const state = createMockState({
      currentQuestionIndex: 1,
      questions: [
        { questionText: "How do you feel about remote work?", guidance: "" },
        { questionText: "What challenges does remote work create for collaboration?", guidance: "" },
      ],
      questionSummaries: [
        makeSummary({
          questionIndex: 0,
          questionText: "How do you feel about remote work?",
          relevantToFutureQuestions: [
            "frustration with remote collaboration tools breaking down",
          ],
        }),
      ],
    });

    const output = buildResumeInstructions(state);
    expect(output).toContain("RELEVANT EARLIER DISCUSSION");
    expect(output).toContain("frustration with remote collaboration tools breaking down");
  });

  it("resume omits continuity when no relevant cues exist", () => {
    const state = createMockState({
      currentQuestionIndex: 0,
      questions: [{ questionText: "What is your role?", guidance: "" }],
      questionSummaries: [],
    });

    const output = buildResumeInstructions(state);
    expect(output).toContain("CONVERSATION CONTINUITY");
    expect(output).not.toContain("RELEVANT EARLIER DISCUSSION");
  });

  it("refresh includes continuity cues when question summaries exist", () => {
    const state = createMockState({
      currentQuestionIndex: 1,
      questions: [
        { questionText: "How do you feel about remote work?", guidance: "" },
        { questionText: "What challenges does remote work create for collaboration?", guidance: "" },
      ],
      questionSummaries: [
        makeSummary({
          questionIndex: 0,
          questionText: "How do you feel about remote work?",
          relevantToFutureQuestions: [
            "remote collaboration is their biggest daily challenge",
          ],
        }),
      ],
    });

    const output = buildRefreshInstructions(state);
    expect(output).toContain("RELEVANT EARLIER DISCUSSION");
    expect(output).toContain("remote collaboration is their biggest daily challenge");
  });

  it("AQ phase respects question bound — excludes summaries at or past bound", () => {
    const state = createMockState({
      currentQuestionIndex: 2,
      questions: [
        { questionText: "What is your role?", guidance: "" },
        { questionText: "How do you handle teamwork?", guidance: "" },
        { questionText: "Describe your leadership style?", guidance: "" },
      ],
      isInAdditionalQuestionsPhase: true,
      additionalQuestions: [
        { questionText: "How does teamwork affect your leadership approach?", guidance: "" } as any,
        { questionText: "What teamwork improvements would you suggest?", guidance: "" } as any,
      ],
      currentAdditionalQuestionIndex: 1,
      questionSummaries: [
        makeSummary({
          questionIndex: 0,
          questionText: "What is your role?",
          relevantToFutureQuestions: ["teamwork is central to their daily role"],
        }),
        makeSummary({
          questionIndex: 1,
          questionText: "How do you handle teamwork?",
          relevantToFutureQuestions: ["teamwork improvements they want include better tools"],
        }),
        makeSummary({
          questionIndex: 2,
          questionText: "Describe your leadership style?",
          relevantToFutureQuestions: ["teamwork under their leadership is collaborative"],
        }),
        makeSummary({
          questionIndex: 3,
          questionText: "How does teamwork affect your leadership approach?",
          relevantToFutureQuestions: ["teamwork drives all their leadership decisions"],
          isAdditionalQuestion: true,
          additionalQuestionIndex: 0,
        }),
      ],
    });

    const output = buildResumeInstructions(state);

    expect(output).toContain("teamwork is central to their daily role");
    expect(output).not.toContain("teamwork drives all their leadership decisions");
  });

  it("cap is respected — at most 2 cues appear", () => {
    const summaries: QuestionSummary[] = [];
    for (let i = 0; i < 6; i++) {
      summaries.push(
        makeSummary({
          questionIndex: i,
          questionText: `Question ${i} about leadership`,
          relevantToFutureQuestions: [
            `leadership insight number ${i} about management`,
          ],
        }),
      );
    }

    const state = createMockState({
      currentQuestionIndex: 6,
      questions: [
        ...Array.from({ length: 6 }, (_, i) => ({ questionText: `Question ${i} about leadership`, guidance: "" })),
        { questionText: "What is your overall leadership management philosophy?", guidance: "" },
      ],
      questionSummaries: summaries,
    });

    const output = buildResumeInstructions(state);
    const cueMatches = output.match(/Earlier they mentioned:/g) || [];
    expect(cueMatches.length).toBeLessThanOrEqual(2);
    expect(cueMatches.length).toBeGreaterThan(0);
  });
});
