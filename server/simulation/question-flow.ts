import type { Question } from "@shared/schema";
import type { SimulationTurnAction } from "@shared/types/simulation";

export interface QuestionFlowState {
  currentQuestionIndex: number;
  totalQuestions: number;
  followUpCount: number;
  maxTurnsPerQuestion: number;
  barbaraSuggestedNext: boolean;
  inAdditionalQuestionPhase: boolean;
  currentAdditionalQuestionIndex: number;
  totalAdditionalQuestions: number;
}

export function evaluateQuestionFlow(state: QuestionFlowState): SimulationTurnAction {
  if (state.inAdditionalQuestionPhase) {
    if (state.barbaraSuggestedNext || state.followUpCount >= state.maxTurnsPerQuestion) {
      if (state.currentAdditionalQuestionIndex + 1 >= state.totalAdditionalQuestions) {
        return "complete";
      }
      return "next_question";
    }
    return "continue";
  }

  if (state.barbaraSuggestedNext || state.followUpCount >= state.maxTurnsPerQuestion) {
    if (state.currentQuestionIndex + 1 >= state.totalQuestions) {
      return "start_aq";
    }
    return "next_question";
  }

  return "continue";
}

export function evaluateConditionalLogic(
  question: Question,
  previousAnswers: Map<number, string>,
): boolean {
  if (!question.conditionalLogic) return true;

  try {
    const logic = question.conditionalLogic as {
      condition?: string;
      dependsOn?: number;
      showWhen?: string;
    };

    if (logic.dependsOn == null) return true;

    const dependentAnswer = previousAnswers.get(logic.dependsOn);

    if (dependentAnswer === undefined) return false;

    if (logic.showWhen) {
      const normalizedAnswer = dependentAnswer.trim().toLowerCase();
      const normalizedShowWhen = logic.showWhen.trim().toLowerCase();
      const showWhenOptions = normalizedShowWhen.split("|").map(s => s.trim());
      return showWhenOptions.some(option => normalizedAnswer.includes(option));
    }

    if (logic.condition) {
      const normalizedCondition = logic.condition.trim().toLowerCase();
      const normalizedAnswer = dependentAnswer.trim().toLowerCase();

      if (normalizedCondition === "answered") {
        return dependentAnswer.trim().length > 0;
      }
      if (normalizedCondition === "not_answered" || normalizedCondition === "unanswered") {
        return dependentAnswer.trim().length === 0;
      }
      if (normalizedCondition.startsWith("contains:")) {
        const keyword = normalizedCondition.slice("contains:".length).trim();
        return normalizedAnswer.includes(keyword);
      }
      if (normalizedCondition.startsWith("equals:")) {
        const value = normalizedCondition.slice("equals:".length).trim();
        return normalizedAnswer === value;
      }
    }

    return dependentAnswer.trim().length > 0;
  } catch {
    return true;
  }
}

export function getNextQuestionIndex(
  currentIndex: number,
  questions: Question[],
  previousAnswers: Map<number, string>,
): number | null {
  for (let i = currentIndex + 1; i < questions.length; i++) {
    if (evaluateConditionalLogic(questions[i], previousAnswers)) {
      return i;
    }
  }
  return null;
}
