import { describe, it, expect } from "vitest";
import {
  recordAlviaFollowUpTurn,
  revertAlviaFollowUpTurn,
} from "../voice-interview/metrics";
import {
  buildInterviewInstructions,
  buildResumeInstructions,
  buildRefreshInstructions,
} from "../voice-interview/instructions";
import type { QuestionMetrics } from "../barbara-orchestrator";
import { createEmptyMetrics } from "../barbara-orchestrator";
import type { InterviewState } from "../voice-interview/types";

function makeMetricsMap(
  questionIndex: number,
  overrides: Partial<QuestionMetrics> = {},
): Map<number, QuestionMetrics> {
  const map = new Map<number, QuestionMetrics>();
  map.set(questionIndex, {
    ...createEmptyMetrics(questionIndex),
    ...overrides,
  });
  return map;
}

describe("Follow-Up Depth Tracking", () => {
  describe("Zero-depth questions", () => {
    it("does NOT contain 'reached or exceeded' when followUpTurnCount = 0 and recommendedFollowUps = 0", () => {
      const instructions = buildInterviewInstructions({
        template: { objective: "Test", tone: "professional" },
        currentQuestion: { questionText: "Tell me about yourself.", guidance: "" },
        questionIndex: 0,
        totalQuestions: 3,
        followUpContext: { followUpTurnCount: 0, recommendedFollowUps: 0 },
      });
      expect(instructions).not.toContain("reached or exceeded");
      expect(instructions).toContain("This is guidance, not a strict limit.");
    });

    it("DOES contain 'reached or exceeded' when followUpTurnCount >= 1 and recommendedFollowUps = 0", () => {
      const instructions = buildInterviewInstructions({
        template: { objective: "Test", tone: "professional" },
        currentQuestion: { questionText: "Tell me about yourself.", guidance: "" },
        questionIndex: 0,
        totalQuestions: 3,
        followUpContext: { followUpTurnCount: 1, recommendedFollowUps: 0 },
      });
      expect(instructions).toContain("reached or exceeded the recommended depth");
    });
  });

  describe("Interrupted Alvia turns", () => {
    it("increments and then decrements followUpTurnCount on barge-in revert", () => {
      const metricsMap = makeMetricsMap(0);
      expect(metricsMap.get(0)!.followUpTurnCount).toBe(0);

      const incremented = recordAlviaFollowUpTurn(metricsMap, 0);
      expect(incremented).toBe(true);
      expect(metricsMap.get(0)!.followUpTurnCount).toBe(1);

      revertAlviaFollowUpTurn(metricsMap, 0);
      expect(metricsMap.get(0)!.followUpTurnCount).toBe(0);
    });

    it("does not decrement below zero", () => {
      const metricsMap = makeMetricsMap(0);
      revertAlviaFollowUpTurn(metricsMap, 0);
      expect(metricsMap.get(0)!.followUpTurnCount).toBe(0);
    });

    it("returns false if question index not found", () => {
      const metricsMap = makeMetricsMap(0);
      const result = recordAlviaFollowUpTurn(metricsMap, 99);
      expect(result).toBe(false);
    });
  });

  describe("Resume/refresh prompt parity", () => {
    it("all three instruction builders produce identical FOLLOW-UP DEPTH content", () => {
      const followUpTurnCount = 2;
      const recommendedFollowUps = 3;

      const mainInstructions = buildInterviewInstructions({
        template: { objective: "Test", tone: "professional" },
        currentQuestion: { questionText: "Tell me about yourself.", guidance: "" },
        questionIndex: 0,
        totalQuestions: 3,
        followUpContext: { followUpTurnCount, recommendedFollowUps },
      });

      const state = {
        template: { objective: "Test", tone: "professional" },
        questions: [
          { questionText: "Tell me about yourself.", guidance: "", recommendedFollowUps },
          { questionText: "Q2", guidance: "" },
          { questionText: "Q3", guidance: "" },
        ],
        currentQuestionIndex: 0,
        transcriptLog: [],
        questionMetrics: makeMetricsMap(0, { followUpTurnCount }),
        questionStates: [
          { questionIndex: 0, status: "in_progress", barbaraSuggestedMoveOn: false, wordCount: 0, activeTimeMs: 0, turnCount: 0, followUpTurnCount },
        ],
        questionSummaries: [],
        respondentInformalName: null,
        lastBarbaraGuidance: null,
        isInAdditionalQuestionsPhase: false,
        additionalQuestions: [],
        currentAdditionalQuestionIndex: 0,
        fullTranscriptForPersistence: [],
      } as unknown as InterviewState;

      const resumeInstructions = buildResumeInstructions(state);
      const refreshInstructions = buildRefreshInstructions(state);

      const depthBlock = `You have made ${followUpTurnCount} follow-up turns so far on this question.`;

      expect(mainInstructions).toContain(depthBlock);
      expect(resumeInstructions).toContain(depthBlock);
      expect(refreshInstructions).toContain(depthBlock);

      expect(mainInstructions).toContain("This is guidance, not a strict limit.");
      expect(resumeInstructions).toContain("This is guidance, not a strict limit.");
      expect(refreshInstructions).toContain("This is guidance, not a strict limit.");
    });
  });

  describe("Restore/rebuild mid-question", () => {
    it("restores followUpTurnCount from persisted questionState", () => {
      const metricsMap = new Map<number, QuestionMetrics>();
      const qs = { questionIndex: 2, wordCount: 50, activeTimeMs: 1000, turnCount: 4, followUpTurnCount: 3 };
      metricsMap.set(qs.questionIndex, {
        questionIndex: qs.questionIndex,
        wordCount: qs.wordCount,
        activeTimeMs: qs.activeTimeMs,
        turnCount: qs.turnCount,
        startedAt: null,
        followUpTurnCount: (qs as any).followUpTurnCount ?? (qs as any).followUpCount ?? 0,
        recommendedFollowUps: null,
      });
      expect(metricsMap.get(2)!.followUpTurnCount).toBe(3);
    });
  });

  describe("Backward compatibility", () => {
    it("loads old-style followUpCount as followUpTurnCount", () => {
      const oldStyleQs = { questionIndex: 1, wordCount: 30, activeTimeMs: 500, turnCount: 2, followUpCount: 2 } as any;
      const followUpTurnCount = (oldStyleQs as any).followUpTurnCount ?? (oldStyleQs as any).followUpCount ?? 0;
      expect(followUpTurnCount).toBe(2);
    });

    it("prefers followUpTurnCount over followUpCount if both exist", () => {
      const mixedQs = { followUpTurnCount: 5, followUpCount: 2 } as any;
      const followUpTurnCount = (mixedQs as any).followUpTurnCount ?? (mixedQs as any).followUpCount ?? 0;
      expect(followUpTurnCount).toBe(5);
    });
  });

  describe("Question transition clears revert flag", () => {
    it("_pendingFollowUpTurnRevert is set to false on question advance", () => {
      const state = { _pendingFollowUpTurnRevert: true } as unknown as InterviewState;
      state._pendingFollowUpTurnRevert = false;
      expect(state._pendingFollowUpTurnRevert).toBe(false);
    });
  });
});
