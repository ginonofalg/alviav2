export type PersistedTranscriptEntry = {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
  questionIndex: number;
  interrupted?: boolean;
};

export type PersistedBarbaraGuidance = {
  action: "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "suggest_environment_check" | "confirm_understanding" | "none";
  message: string;
  confidence: number;
  timestamp: number;
  questionIndex: number;
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
