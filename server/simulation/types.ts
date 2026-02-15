import type { TranscriptEntry, QuestionSummary } from "../barbara-orchestrator";
import type { Question, Collection, InterviewTemplate, Project, Persona } from "@shared/schema";

export interface SimulationContext {
  project: Project;
  template: InterviewTemplate;
  collection: Collection;
  questions: Question[];
  persona: Persona;
  runId: string;
  enableBarbara: boolean;
  enableSummaries: boolean;
  enableAdditionalQuestions: boolean;
  alviaModel: string;
  personaModel: string;
  maxTurnsPerQuestion: number;
  maxAQTurnsPerQuestion: number;
  interTurnDelayMs: number;
}

export interface SimulationTranscript {
  entries: TranscriptEntry[];
  questionSummaries: QuestionSummary[];
}

export interface SimulationQuestionMetrics {
  questionIndex: number;
  wordCount: number;
  turnCount: number;
  followUpCount: number;
  startedAt: number;
}

export interface SimulationProgress {
  currentQuestionIndex: number;
  totalQuestions: number;
  phase: "questions" | "additional_questions" | "summaries" | "complete";
  additionalQuestionIndex?: number;
  totalAdditionalQuestions?: number;
}

export const SIMULATION_LIMITS = {
  MAX_PERSONAS_PER_RUN: 10,
  MAX_CONCURRENT_RUNS: 2,
  PER_QUESTION_TIMEOUT_MS: 5 * 60 * 1000,
  PER_SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  HARD_CAP_TURNS_PER_QUESTION: 12,
} as const;
