export type PersistedTranscriptEntry = {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
  questionIndex: number;
  interrupted?: boolean;
};

export type BarbaraGuidanceAction =
  | "probe_followup"
  | "suggest_next_question"
  | "acknowledge_prior"
  | "confirm_understanding"
  | "suggest_environment_check"
  | "time_reminder"
  | "none";

export type PersistedBarbaraGuidance = {
  action: BarbaraGuidanceAction;
  message: string;
  confidence: number;
  timestamp: number;
  questionIndex: number;
};

export type BarbaraGuidanceLogEntry = {
  index: number;
  action: BarbaraGuidanceAction;
  messageSummary: string;
  confidence: number;
  injected: boolean;
  timestamp: number;
  questionIndex: number;
  triggerTurnIndex: number;
};

export type PersistedQuestionState = {
  questionIndex: number;
  status: "not_started" | "in_progress" | "answered" | "skipped";
  barbaraSuggestedMoveOn: boolean;
  wordCount: number;
  activeTimeMs: number;
  turnCount: number;
  followUpCount: number;
};

export type QualityFlag = "incomplete" | "ambiguous" | "contradiction" | "distress_cue" | "off_topic" | "low_engagement";

export type SessionReviewFlag = "needs_review" | "flagged_quality" | "verified" | "excluded";
