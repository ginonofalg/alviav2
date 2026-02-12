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

export type GuidanceAdherenceResult = "followed" | "partially_followed" | "not_followed" | "not_applicable" | "unscored";

export type BarbaraGuidanceLogEntry = {
  index: number;
  action: BarbaraGuidanceAction;
  messageSummary: string;
  confidence: number;
  injected: boolean;
  timestamp: number;
  questionIndex: number;
  triggerTurnIndex: number;
  adherence?: GuidanceAdherenceResult;
  adherenceReason?: string;
  alviaResponseSnippet?: string;
};

export type GuidanceAdherenceSummary = {
  totalGuidanceEvents: number;
  injectedCount: number;
  scoredCount: number;
  followedCount: number;
  partiallyFollowedCount: number;
  notFollowedCount: number;
  notApplicableCount: number;
  overallAdherenceRate: number;
  byAction: Record<BarbaraGuidanceAction, {
    total: number;
    injected: number;
    followed: number;
    adherenceRate: number;
  }>;
  computedAt: number;
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
