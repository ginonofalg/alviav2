import type { QualityFlag } from "./interview-state";

export type KeyQuote = {
  quote: string;
  speaker: "respondent" | "alvia";
  startTimeMs?: number;
  endTimeMs?: number;
  audioRef?: string;
};

export type ExtractedValues = {
  yesNo?: boolean;
  scale?: number;
  numeric?: number;
  multiSelect?: string[];
};

export type VerbatimStatement = {
  quote: string;
  context: string;
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
  themeTag?: string;
};

export type QuestionSummary = {
  questionIndex: number;
  questionText: string;
  respondentSummary: string;
  keyInsights: string[];
  completenessAssessment: string;
  relevantToFutureQuestions: string[];
  wordCount: number;
  turnCount: number;
  activeTimeMs: number;
  timestamp: number;
  qualityFlags?: QualityFlag[];
  qualityScore?: number;
  qualityNotes?: string;
  verbatims?: VerbatimStatement[];
  isAdditionalQuestion?: boolean;
  additionalQuestionIndex?: number;
};

export type GeneratedAdditionalQuestion = {
  questionText: string;
  rationale: string;
  questionType: "open";
  index: number;
};

export type AdditionalQuestionsData = {
  questions: GeneratedAdditionalQuestion[];
  generatedAt: number;
  barbaraModel: string;
  declinedByRespondent?: boolean;
  completedCount?: number;
  usedCrossInterviewContext?: boolean;
  priorSessionCount?: number;
};
