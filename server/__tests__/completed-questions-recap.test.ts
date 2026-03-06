import { describe, it, expect } from "vitest";
import {
  buildCompletedQuestionsRecap,
  buildInterviewInstructions,
  buildResumeInstructions,
  buildRefreshInstructions,
} from "../voice-interview/instructions";
import type { QuestionSummary } from "@shared/types/question-types";
import type { InterviewState } from "../voice-interview/types";

function makeSummary(overrides: Partial<QuestionSummary> = {}): QuestionSummary {
  return {
    questionIndex: 0,
    questionText: "How do you feel about remote work?",
    respondentSummary: "They strongly prefer remote work, citing flexibility.",
    keyInsights: ["values autonomy", "worked remotely for 3 years", "mentions isolation"],
    completenessAssessment: "Complete",
    relevantToFutureQuestions: [],
    wordCount: 120,
    turnCount: 4,
    activeTimeMs: 60000,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeMinimalInterviewState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    sessionId: "test-session",
    template: { objective: "Test interview", tone: "professional" },
    questions: [
      { questionText: "Q1 text", guidance: "" },
      { questionText: "Q2 text", guidance: "" },
      { questionText: "Q3 text", guidance: "" },
    ],
    currentQuestionIndex: 1,
    transcriptLog: [
      { speaker: "alvia", text: "Hello, welcome!", questionIndex: 0, timestamp: Date.now() },
      { speaker: "respondent", text: "Thanks!", questionIndex: 0, timestamp: Date.now() },
    ],
    fullTranscriptForPersistence: [],
    questionSummaries: [],
    questionStates: [],
    questionMetrics: new Map(),
    respondentInformalName: null,
    lastBarbaraGuidance: undefined,
    barbaraGuidanceLog: [],
    isRestoredSession: true,
    isConnected: false,
    awaitingResume: false,
    useRefreshInstructions: false,
    alviaHasSpokenOnCurrentQuestion: true,
    isInitialSession: false,
    vadEagernessMode: "auto",
    strategicContext: null,
    additionalQuestions: [],
    isInAdditionalQuestionsPhase: false,
    currentAdditionalQuestionIndex: 0,
    additionalQuestionsConsent: false,
    ...overrides,
  } as unknown as InterviewState;
}

describe("buildCompletedQuestionsRecap", () => {
  it("returns null when questionSummaries is empty", () => {
    expect(buildCompletedQuestionsRecap([], 0)).toBeNull();
  });

  it("returns null on Q1 (no completed questions)", () => {
    const summaries = [makeSummary({ questionIndex: 0 })];
    expect(buildCompletedQuestionsRecap(summaries, 0)).toBeNull();
  });

  it("returns recap from Q2 onwards", () => {
    const summaries = [makeSummary({ questionIndex: 0 })];
    const result = buildCompletedQuestionsRecap(summaries, 1);
    expect(result).not.toBeNull();
    expect(result).toContain("COMPLETED QUESTIONS RECAP");
    expect(result).toContain("Q1");
    expect(result).toContain("They strongly prefer remote work");
  });

  it("formats multiple summaries in order", () => {
    const summaries = [
      makeSummary({ questionIndex: 2, questionText: "Q3 question", respondentSummary: "Third answer" }),
      makeSummary({ questionIndex: 0, questionText: "Q1 question", respondentSummary: "First answer" }),
      makeSummary({ questionIndex: 1, questionText: "Q2 question", respondentSummary: "Second answer" }),
    ];
    const result = buildCompletedQuestionsRecap(summaries, 3)!;
    const q1Pos = result.indexOf("Q1");
    const q2Pos = result.indexOf("Q2");
    const q3Pos = result.indexOf("Q3");
    expect(q1Pos).toBeLessThan(q2Pos);
    expect(q2Pos).toBeLessThan(q3Pos);
  });

  it("handles null entries in sparse array gracefully", () => {
    const summaries: QuestionSummary[] = [
      makeSummary({ questionIndex: 0 }),
    ];
    (summaries as any)[1] = null;
    summaries[2] = makeSummary({ questionIndex: 2, questionText: "Q3 question" });

    const filtered = summaries.filter((s) => s != null);
    const result = buildCompletedQuestionsRecap(filtered, 3);
    expect(result).not.toBeNull();
    expect(result).toContain("Q1");
    expect(result).toContain("Q3");
  });

  it("excludes additional question summaries", () => {
    const summaries = [
      makeSummary({ questionIndex: 0 }),
      makeSummary({ questionIndex: 1, isAdditionalQuestion: true, questionText: "AQ question" }),
    ];
    const result = buildCompletedQuestionsRecap(summaries, 3)!;
    expect(result).toContain("Q1");
    expect(result).not.toContain("AQ question");
  });

  it("caps key insights at 2 per question", () => {
    const summaries = [
      makeSummary({
        questionIndex: 0,
        keyInsights: ["insight one", "insight two", "insight three"],
      }),
    ];
    const result = buildCompletedQuestionsRecap(summaries, 1)!;
    expect(result).toContain("insight one");
    expect(result).toContain("insight two");
    expect(result).not.toContain("insight three");
  });

  it("truncates long question text at 80 chars", () => {
    const longText = "A".repeat(120);
    const summaries = [
      makeSummary({ questionIndex: 0, questionText: longText }),
    ];
    const result = buildCompletedQuestionsRecap(summaries, 1)!;
    expect(result).not.toContain(longText);
    expect(result).toContain("\u2026");
  });

  it("does not include summaries for current or future questions", () => {
    const summaries = [
      makeSummary({ questionIndex: 0, questionText: "Past question" }),
      makeSummary({ questionIndex: 2, questionText: "Current question" }),
      makeSummary({ questionIndex: 3, questionText: "Future question" }),
    ];
    const result = buildCompletedQuestionsRecap(summaries, 2)!;
    expect(result).toContain("Past question");
    expect(result).not.toContain("Current question");
    expect(result).not.toContain("Future question");
  });
});

describe("Recap integration in instruction builders", () => {
  const template = { objective: "Test interview", tone: "professional" };
  const question = { questionText: "What challenges do you face?", guidance: "" };
  const summaries = [
    makeSummary({ questionIndex: 0, questionText: "How do you feel about remote work?" }),
  ];

  it("buildInterviewInstructions includes recap when summaries exist for Q2+", () => {
    const instructions = buildInterviewInstructions({
      template,
      currentQuestion: question,
      questionIndex: 1,
      totalQuestions: 3,
      allQuestions: [{ questionText: "Q1" }, question, { questionText: "Q3" }],
      questionSummaries: summaries,
    });
    expect(instructions).toContain("COMPLETED QUESTIONS RECAP");
    expect(instructions).toContain("remote work");
  });

  it("buildInterviewInstructions omits recap on Q1", () => {
    const instructions = buildInterviewInstructions({
      template,
      currentQuestion: question,
      questionIndex: 0,
      totalQuestions: 3,
      allQuestions: [question],
    });
    expect(instructions).not.toContain("COMPLETED QUESTIONS RECAP");
  });

  it("buildResumeInstructions includes recap when summaries exist", () => {
    const state = makeMinimalInterviewState({
      questionSummaries: summaries,
      currentQuestionIndex: 1,
    });
    const instructions = buildResumeInstructions(state);
    expect(instructions).toContain("COMPLETED QUESTIONS RECAP");
    expect(instructions).toContain("remote work");
    expect(instructions).toContain("TRANSCRIPT SUMMARY");
    expect(instructions).toContain("RESUMING");
  });

  it("buildRefreshInstructions includes recap when summaries exist", () => {
    const state = makeMinimalInterviewState({
      questionSummaries: summaries,
      currentQuestionIndex: 1,
    });
    const instructions = buildRefreshInstructions(state);
    expect(instructions).toContain("COMPLETED QUESTIONS RECAP");
    expect(instructions).toContain("remote work");
    expect(instructions).toContain("CONTINUATION INSTRUCTIONS");
  });

  it("resume path omits recap on Q1", () => {
    const state = makeMinimalInterviewState({
      questionSummaries: [],
      currentQuestionIndex: 0,
    });
    const instructions = buildResumeInstructions(state);
    expect(instructions).not.toContain("COMPLETED QUESTIONS RECAP");
  });
});
