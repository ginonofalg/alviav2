import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Enums
export const questionTypeEnum = pgEnum("question_type", [
  "open",
  "yes_no", 
  "scale",
  "numeric",
  "multi_select"
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "pending",
  "consent_given",
  "in_progress",
  "paused",
  "completed",
  "abandoned"
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "creator",
  "analyst",
  "respondent"
]);

// Context types for strategic context
export const contextTypeEnum = pgEnum("context_type", [
  "content",
  "product", 
  "marketing",
  "cx",
  "other"
]);

// Workspaces
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: varchar("owner_id").notNull(),
  retentionDays: integer("retention_days").default(90),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  role: userRoleEnum("role").notNull().default("analyst"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Projects
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  objective: text("objective"),
  audienceContext: text("audience_context"),
  tone: text("tone").default("professional"),
  timingGuidance: text("timing_guidance"),
  consentAudioRecording: boolean("consent_audio_recording").default(true),
  consentTranscriptOnly: boolean("consent_transcript_only").default(false),
  piiRedactionEnabled: boolean("pii_redaction_enabled").default(true),
  crossInterviewContext: boolean("cross_interview_context").default(false),
  crossInterviewThreshold: integer("cross_interview_threshold").default(5),
  analyticsGuidedHypotheses: boolean("analytics_guided_hypotheses").default(false),
  analyticsHypothesesMinSessions: integer("analytics_hypotheses_min_sessions").default(5),
  avoidRules: text("avoid_rules").array(),
  // Strategic context for tailored analytics
  strategicContext: text("strategic_context"),
  contextType: contextTypeEnum("context_type"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Analytics metadata
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  analyzedTemplateCount: integer("analyzed_template_count").default(0),
  analyticsData: jsonb("analytics_data"),
});

// Interview Templates (versioned)
export const interviewTemplates = pgTable("interview_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  objective: text("objective"),
  tone: text("tone"),
  constraints: text("constraints"),
  isActive: boolean("is_active").default(true),
  defaultRecommendedFollowUps: integer("default_recommended_follow_ups"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Analytics metadata
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  analyzedCollectionCount: integer("analyzed_collection_count").default(0),
  analyticsData: jsonb("analytics_data"),
});

// Questions
export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => interviewTemplates.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  questionText: text("question_text").notNull(),
  questionType: questionTypeEnum("question_type").notNull().default("open"),
  guidance: text("guidance"),
  scaleMin: integer("scale_min"),
  scaleMax: integer("scale_max"),
  multiSelectOptions: text("multi_select_options").array(),
  conditionalLogic: jsonb("conditional_logic"),
  timeHintSeconds: integer("time_hint_seconds"),
  recommendedFollowUps: integer("recommended_follow_ups"),
  isRequired: boolean("is_required").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Collections (launched instance of a template)
export const collections = pgTable("collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => interviewTemplates.id),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  targetResponses: integer("target_responses"),
  voiceProvider: text("voice_provider").default("openai"),
  // Additional Questions configuration (0-3, default 1)
  maxAdditionalQuestions: integer("max_additional_questions").default(1),
  endOfInterviewSummaryEnabled: boolean("end_of_interview_summary_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  // Analytics metadata
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  analyzedSessionCount: integer("analyzed_session_count").default(0),
  analyticsData: jsonb("analytics_data"),
});

// Respondent invitation status enum
export const respondentStatusEnum = pgEnum("respondent_status", [
  "invited",      // Pre-registered, link sent
  "clicked",      // Clicked the link
  "consented",    // Gave consent
  "completed",    // Finished the interview
]);

// Respondents
export const respondents = pgTable("respondents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  userId: varchar("user_id"),
  email: text("email"),
  displayName: text("display_name"),
  fullName: text("full_name"),
  informalName: text("informal_name"),
  profileFields: jsonb("profile_fields"),
  invitationToken: varchar("invitation_token").unique(),
  invitationStatus: respondentStatusEnum("invitation_status").default("invited"),
  invitedAt: timestamp("invited_at").defaultNow(),
  clickedAt: timestamp("clicked_at"),
  consentGivenAt: timestamp("consent_given_at"),
});

// Interview Sessions
export const interviewSessions = pgTable("interview_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull().references(() => collections.id),
  respondentId: varchar("respondent_id").notNull().references(() => respondents.id),
  status: sessionStatusEnum("status").notNull().default("pending"),
  currentQuestionIndex: integer("current_question_index").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  pausedAt: timestamp("paused_at"),
  totalDurationMs: integer("total_duration_ms").default(0),
  satisfactionRating: integer("satisfaction_rating"),
  closingComments: text("closing_comments"),
  createdAt: timestamp("created_at").defaultNow(),
  // State persistence for reconnection/resume
  liveTranscript: jsonb("live_transcript"),
  lastBarbaraGuidance: jsonb("last_barbara_guidance"),
  questionStates: jsonb("question_states"),
  questionSummaries: jsonb("question_summaries"),
  // Resume token for browser recovery
  resumeTokenHash: text("resume_token_hash"),
  resumeTokenExpiresAt: timestamp("resume_token_expires_at"),
  // Post-interview review fields
  reviewCompletedAt: timestamp("review_completed_at"),
  reviewAccessToken: text("review_access_token"),
  reviewAccessExpiresAt: timestamp("review_access_expires_at"),
  reviewSkipped: boolean("review_skipped").default(false),
  reviewRatings: jsonb("review_ratings"),
  reviewComments: jsonb("review_comments"), // Type: Record<string, string> - questionIndex -> comment
  // Researcher tools
  researcherNotes: text("researcher_notes"),
  reviewFlags: text("review_flags").array(), // Values: "needs_review", "flagged_quality", "verified", "excluded"
  // Realtime API monitoring metrics
  performanceMetrics: jsonb("performance_metrics"),
  // Transcription quality metrics (for noisy environment detection)
  transcriptionQualityMetrics: jsonb("transcription_quality_metrics"),
  // Additional Questions state
  additionalQuestions: jsonb("additional_questions"), // Type: AdditionalQuestionsData - stores generated AQs and metadata
  additionalQuestionPhase: boolean("additional_question_phase").default(false), // True when in AQ phase (for resume support)
  currentAdditionalQuestionIndex: integer("current_additional_question_index"), // Which AQ is currently being asked (0-based)
  alviaSummary: jsonb("alvia_summary"),
  barbaraSessionSummary: jsonb("barbara_session_summary"),
}, (table) => [
  index("idx_session_collection").on(table.collectionId),
  index("idx_session_status").on(table.status),
]);

// Segments (per-question responses)
export const segments = pgTable("segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  questionId: varchar("question_id").references(() => questions.id), // Nullable for additional questions
  // Additional Question fields (used when questionId is null)
  additionalQuestionIndex: integer("additional_question_index"), // 0-based index within AQs (AQ1=0, AQ2=1, etc.)
  additionalQuestionText: text("additional_question_text"), // The dynamically generated question text
  transcript: text("transcript"),
  audioRef: text("audio_ref"),
  startTimeMs: integer("start_time_ms"),
  endTimeMs: integer("end_time_ms"),
  summaryBullets: text("summary_bullets").array(),
  keyQuotes: jsonb("key_quotes"),
  extractedValues: jsonb("extracted_values"),
  confidence: integer("confidence"),
  qualityFlags: text("quality_flags").array(),
  respondentComment: text("respondent_comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Redaction Map
export const redactionMaps = pgTable("redaction_maps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  originalToken: text("original_token").notNull(),
  pseudonymToken: text("pseudonym_token").notNull(),
  tokenType: text("token_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  templates: many(interviewTemplates),
}));

export const interviewTemplatesRelations = relations(interviewTemplates, ({ one, many }) => ({
  project: one(projects, {
    fields: [interviewTemplates.projectId],
    references: [projects.id],
  }),
  questions: many(questions),
  collections: many(collections),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  template: one(interviewTemplates, {
    fields: [questions.templateId],
    references: [interviewTemplates.id],
  }),
  segments: many(segments),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  template: one(interviewTemplates, {
    fields: [collections.templateId],
    references: [interviewTemplates.id],
  }),
  respondents: many(respondents),
  sessions: many(interviewSessions),
}));

export const respondentsRelations = relations(respondents, ({ one, many }) => ({
  collection: one(collections, {
    fields: [respondents.collectionId],
    references: [collections.id],
  }),
  sessions: many(interviewSessions),
}));

export const interviewSessionsRelations = relations(interviewSessions, ({ one, many }) => ({
  collection: one(collections, {
    fields: [interviewSessions.collectionId],
    references: [collections.id],
  }),
  respondent: one(respondents, {
    fields: [interviewSessions.respondentId],
    references: [respondents.id],
  }),
  segments: many(segments),
  redactionMaps: many(redactionMaps),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  session: one(interviewSessions, {
    fields: [segments.sessionId],
    references: [interviewSessions.id],
  }),
  question: one(questions, {
    fields: [segments.questionId],
    references: [questions.id],
  }),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
}));

export const redactionMapsRelations = relations(redactionMaps, ({ one }) => ({
  session: one(interviewSessions, {
    fields: [redactionMaps.sessionId],
    references: [interviewSessions.id],
  }),
}));

// Invite List - emails allowed to use the platform
export const inviteList = pgTable("invite_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  addedBy: varchar("added_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Waitlist Entries - users who authenticated but are not invited
export const waitlistEntries = pgTable("waitlist_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  replitUserId: varchar("replit_user_id"),
  consentNewsletter: boolean("consent_newsletter").default(false),
  consentMarketing: boolean("consent_marketing").default(false),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

// Insert schemas for invite/waitlist
export const insertInviteListSchema = createInsertSchema(inviteList).omit({ id: true, createdAt: true });
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries).omit({ id: true, submittedAt: true });

// Types for invite/waitlist
export type InviteListEntry = typeof inviteList.$inferSelect;
export type InsertInviteListEntry = z.infer<typeof insertInviteListSchema>;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;

// Insert schemas
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTemplateSchema = createInsertSchema(interviewTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true, createdAt: true });
export const insertCollectionSchema = createInsertSchema(collections).omit({ id: true, createdAt: true, closedAt: true });
export const insertRespondentSchema = createInsertSchema(respondents).omit({ id: true, invitedAt: true, clickedAt: true, consentGivenAt: true });

// Schema for inviting a new respondent (minimal required fields)
export const inviteRespondentSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  informalName: z.string().optional(),
});
export const insertSessionSchema = createInsertSchema(interviewSessions).omit({ id: true, createdAt: true, startedAt: true, completedAt: true, pausedAt: true });
export const insertSegmentSchema = createInsertSchema(segments).omit({ id: true, createdAt: true });
export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({ id: true, createdAt: true });
export const insertRedactionMapSchema = createInsertSchema(redactionMaps).omit({ id: true, createdAt: true });

// Types
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InterviewTemplate = typeof interviewTemplates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Respondent = typeof respondents.$inferSelect;
export type InsertRespondent = z.infer<typeof insertRespondentSchema>;
export type InterviewSession = typeof interviewSessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

// Session with respondent info for display
export interface SessionWithRespondent extends InterviewSession {
  respondent?: {
    fullName: string | null;
    informalName: string | null;
  };
}
export type Segment = typeof segments.$inferSelect;
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
export type RedactionMap = typeof redactionMaps.$inferSelect;
export type InsertRedactionMap = z.infer<typeof insertRedactionMapSchema>;

// Key quote type
export type KeyQuote = {
  quote: string;
  speaker: "respondent" | "alvia";
  startTimeMs?: number;
  endTimeMs?: number;
  audioRef?: string;
};

// Extracted values type
export type ExtractedValues = {
  yesNo?: boolean;
  scale?: number;
  numeric?: number;
  multiSelect?: string[];
};

// Interview state persistence types
export type PersistedTranscriptEntry = {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
  questionIndex: number;
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

// Transcription quality tracking types (for noisy environment detection)
export type TranscriptionQualityFlag =
  | "garbled_audio"
  | "environment_noise"
  | "repeated_clarification"
  | "foreign_language_hallucination"
  | "repeated_word_glitch";

// Tracks quality flags for a single utterance (for sliding window)
export type UtteranceQualityFlags = {
  hadForeignLanguage: boolean;
  hadIncoherence: boolean;
  hadRepeatedWordGlitch: boolean;
  hadShortUtterance: boolean;
};

export type TranscriptionQualitySignals = {
  shortUtteranceStreak: number;
  foreignLanguageCount: number;
  questionRepeatCount: number;
  incoherentPhraseCount: number;
  repeatedWordGlitchCount: number;
  totalRespondentUtterances: number;
  environmentCheckTriggered: boolean;
  environmentCheckTriggeredAt: number | null;
  utterancesSinceEnvironmentCheck: number;
  consecutiveGoodUtterances: number;
  vadEagernessReduced: boolean;
  vadEagernessReducedAt: number | null;
  // Sliding window of recent utterance quality (last 5)
  recentUtteranceQuality: UtteranceQualityFlags[];
};

export type TranscriptionQualityMetrics = {
  signals: TranscriptionQualitySignals;
  qualityScore: number;  // 0-100
  flagsDetected: TranscriptionQualityFlag[];
  environmentCheckCount: number;
};

// Realtime API Performance Metrics
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTextTokens: number;
  outputTextTokens: number;
};

export type LatencyMetrics = {
  avgTranscriptionLatencyMs: number;    // speech_stopped → transcription completed
  avgResponseLatencyMs: number;          // transcription completed → first audio delta
  maxTranscriptionLatencyMs: number;
  maxResponseLatencyMs: number;
  transcriptionSamples: number;
  responseSamples: number;
};

// Silence segment context - when in the conversation flow did silence occur
export type SilenceContext = 
  | 'post_alvia'          // After Alvia finished speaking, before respondent started
  | 'post_respondent'     // After respondent stopped, before Alvia responded
  | 'initial';            // Before any speech in the session

// Individual silence segment captured during an interview
export type SilenceSegment = {
  startAt: number;                       // Timestamp when silence began
  endAt: number;                         // Timestamp when silence ended
  durationMs: number;                    // Calculated duration
  context: SilenceContext;               // When this silence occurred
  questionIndex: number | null;          // Which question was active, if any
};

// Aggregated statistics about silence segments
export type SilenceStats = {
  count: number;
  meanMs: number;
  medianMs: number;
  p90Ms: number;
  p95Ms: number;
  maxMs: number;
  byContext: Record<SilenceContext, { count: number; totalMs: number; meanMs: number }>;
};

export type SpeakingTimeMetrics = {
  respondentSpeakingMs: number;          // Total respondent speaking time
  alviaSpeakingMs: number;               // Total Alvia speaking time (estimated from audio responses)
  silenceMs: number;                     // Calculated: session duration - speaking times (includes pause time, kept for backward compatibility)
  respondentTurnCount: number;
  alviaTurnCount: number;
  silenceSegments?: SilenceSegment[];    // Individual silence segments (capped at 100 for storage)
  silenceStats?: SilenceStats | null;    // Aggregated statistics computed from all segments
  // Pause-aware metrics for accurate silence analysis
  totalPauseDurationMs?: number;         // Time spent paused (not streaming audio)
  activeSilenceMs?: number;              // Silence during active streaming only (excludes pause time)
  activeSessionDurationMs?: number;      // Session duration minus pause time
};

export type RealtimePerformanceMetrics = {
  sessionId: string;
  recordedAt: number;                    // Timestamp when metrics were finalized
  tokenUsage: TokenUsage;
  latency: LatencyMetrics;
  speakingTime: SpeakingTimeMetrics;
  sessionDurationMs: number;             // Total session duration
  openaiConnectionCount: number;         // Number of OpenAI WS connections (ideally 1)
  terminationReason?: string;            // How the session ended
};

// Verbatim statement captured from respondent's speech
export type VerbatimStatement = {
  quote: string;           // The exact statement from the respondent
  context: string;         // Brief context (what prompted this statement)
  sentiment?: "positive" | "negative" | "neutral" | "mixed";
  themeTag?: string;       // e.g., "pricing concerns", "feature request", "user experience"
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
  // Quality analysis (added post-interview or during summarization)
  qualityFlags?: QualityFlag[];
  qualityScore?: number; // 0-100 AI-rated quality
  qualityNotes?: string;
  // Verbatim statements for analytics (themes, sentiment, insights)
  verbatims?: VerbatimStatement[];
  // Additional Question flag (when this summary is for an AQ, not a template question)
  isAdditionalQuestion?: boolean;
  additionalQuestionIndex?: number; // 0-based index within AQs (AQ1=0, AQ2=1)
};

// Additional Questions types - for dynamically generated questions at end of interview
export type GeneratedAdditionalQuestion = {
  questionText: string;
  rationale: string;           // Barbara's reason for asking this question
  questionType: "open";        // AQs are always open-ended
  index: number;               // 0-based index within AQs
};

export type AdditionalQuestionsData = {
  questions: GeneratedAdditionalQuestion[];
  generatedAt: number;         // Timestamp when Barbara generated these
  barbaraModel: string;        // Which model generated the questions
  declinedByRespondent?: boolean; // True if respondent declined to answer AQs
  completedCount?: number;     // How many AQs were actually answered
  // Cross-interview context used (if applicable)
  usedCrossInterviewContext?: boolean;
  priorSessionCount?: number;  // How many prior sessions were considered
};

// End-of-interview session summary types

export type AlviaSessionSummary = {
  themes: Array<{
    theme: string;
    description: string;
  }>;
  overallSummary: string;
  objectiveSatisfaction: {
    assessment: string;
    coveredAreas: string[];
    gaps: string[];
  };
  generatedAt: number;
  model: string;
  provider: string;
};

export type BarbaraSessionSummary = {
  themes: Array<{
    theme: string;
    description: string;
    supportingEvidence: string[];
    sentiment: "positive" | "negative" | "neutral" | "mixed";
  }>;
  overallSummary: string;
  objectiveSatisfaction: {
    rating: number;
    assessment: string;
    coveredObjectives: string[];
    gapsIdentified: string[];
  };
  respondentEngagement: {
    level: "low" | "moderate" | "high";
    notes: string;
  };
  generatedAt: number;
  model: string;
};

// Enhanced analytics types for collection-level insights

export type ThemeSentiment = "positive" | "neutral" | "negative" | "mixed";

export type ThemeVerbatim = {
  quote: string;              // Anonymized quote (PII removed)
  questionIndex: number;      // Which question elicited this
  sessionId: string;          // For "Participant X" labeling
  sentiment: ThemeSentiment;
};

export type EnhancedTheme = {
  id: string;
  theme: string;              // 2-5 word name
  description: string;        // One sentence summary
  count: number;
  sessions: string[];
  prevalence: number;         // Percentage of respondents (0-100)
  verbatims: ThemeVerbatim[]; // 3-7 supporting quotes
  sentiment: ThemeSentiment;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  depth: "mentioned" | "explored" | "deeply_explored";
  depthScore: number;         // 0-100
  relatedQuestions: number[];
  subThemes?: string[];
  isEmergent?: boolean;       // Emerged beyond template questions
};

export type KeyFinding = {
  finding: string;
  significance: string;
  supportingVerbatims: ThemeVerbatim[];
  relatedThemes: string[];
};

export type ConsensusPoint = {
  topic: string;
  position: string;
  agreementLevel: number;     // Percentage who agreed
  verbatims: ThemeVerbatim[];
};

export type DivergencePoint = {
  topic: string;
  perspectives: { position: string; count: number; verbatims: ThemeVerbatim[] }[];
};

export type Recommendation = {
  type: "question_improvement" | "explore_deeper" | "coverage_gap" | "needs_probing";
  title: string;
  description: string;
  relatedQuestions?: number[];
  relatedThemes?: string[];
  priority: "high" | "medium" | "low";
};

export type EnhancedQuestionPerformance = {
  questionIndex: number;
  questionText: string;
  avgWordCount: number;
  avgTurnCount: number;
  avgQualityScore: number;
  responseCount: number;
  qualityFlagCounts: Record<QualityFlag, number>;
  primaryThemes: string[];
  verbatims: ThemeVerbatim[];
  perspectiveRange: "narrow" | "moderate" | "diverse";
  responseRichness: "brief" | "moderate" | "detailed";
};

// Collection-level analytics data (stored in collections.analyticsData)
export type CollectionAnalytics = {
  // Enhanced themes with verbatims
  themes: EnhancedTheme[];
  
  // Executive summary / Insight highlights
  keyFindings: KeyFinding[];
  consensusPoints: ConsensusPoint[];
  divergencePoints: DivergencePoint[];
  
  // Question-level data with verbatims
  questionPerformance: EnhancedQuestionPerformance[];
  
  // Recommendations
  recommendations: Recommendation[];
  
  // Overall stats
  overallStats: {
    totalCompletedSessions: number;
    avgSessionDuration: number;
    avgQualityScore: number;
    commonQualityIssues: { flag: QualityFlag; count: number }[];
    sentimentDistribution: { positive: number; neutral: number; negative: number };
    avgThemesPerSession: number;
    themeDepthScore: number;
  };
  
  generatedAt: number;
};

// Collection performance summary for template-level aggregation
export type CollectionPerformanceSummary = {
  collectionId: string;
  collectionName: string;
  sessionCount: number;
  avgQualityScore: number;
  avgSessionDuration: number;
  topThemes: string[];
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  createdAt: string;
};

// Question consistency across collections
export type QuestionConsistency = {
  questionIndex: number;
  questionText: string;
  avgQualityAcrossCollections: number;
  qualityVariance: number; // High variance = inconsistent performance
  avgWordCountAcrossCollections: number;
  bestPerformingCollectionId: string;
  worstPerformingCollectionId: string;
  consistencyRating: "consistent" | "variable" | "inconsistent";
  verbatims: ThemeVerbatim[]; // Representative responses across collections
  primaryThemes: string[]; // Common themes for this question
};

// Aggregated theme with full collection-level detail preserved
export type AggregatedThemeWithDetail = {
  theme: string;
  description: string; // Synthesized from collection descriptions
  totalMentions: number;
  collectionsAppeared: number;
  avgPrevalence: number;
  sentiment: ThemeSentiment;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  verbatims: ThemeVerbatim[]; // All verbatims from collections
  depth: "mentioned" | "explored" | "deeply_explored";
  isEmergent: boolean;
  collectionSources: { collectionId: string; collectionName: string }[];
};

// Key finding with source collection attribution
export type KeyFindingWithSource = KeyFinding & {
  sourceCollectionId: string;
  sourceCollectionName: string;
};

// Consensus point with source collection attribution
export type ConsensusPointWithSource = ConsensusPoint & {
  sourceCollectionId: string;
  sourceCollectionName: string;
};

// Divergence point with source collection attribution
export type DivergencePointWithSource = DivergencePoint & {
  sourceCollectionId: string;
  sourceCollectionName: string;
};

// Template-level analytics data (stored in interviewTemplates.analyticsData)
export type TemplateAnalytics = {
  // Collection comparison
  collectionPerformance: CollectionPerformanceSummary[];
  
  // Question consistency across collections (now with verbatims)
  questionConsistency: QuestionConsistency[];
  
  // Aggregated themes with full collection-level detail preserved
  aggregatedThemes: AggregatedThemeWithDetail[];
  
  // Preserved collection-level insights with source attribution
  keyFindings: KeyFindingWithSource[];
  consensusPoints: ConsensusPointWithSource[];
  divergencePoints: DivergencePointWithSource[];
  
  // Template effectiveness metrics
  templateEffectiveness: {
    totalSessions: number;
    totalCollections: number;
    avgQualityScore: number;
    avgSessionDuration: number;
    avgCompletionRate: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  };
  
  // Recommendations for template improvement
  recommendations: Recommendation[];
  
  generatedAt: number;
};

// Template performance summary for project-level aggregation
export type TemplatePerformanceSummary = {
  templateId: string;
  templateName: string;
  collectionCount: number;
  totalSessions: number;
  avgQualityScore: number;
  topThemes: string[];
  sentimentDistribution: { positive: number; neutral: number; negative: number };
};

// Cross-template theme (themes that appear across multiple templates)
export type CrossTemplateTheme = {
  id: string;
  theme: string;
  description: string;
  templatesAppeared: string[]; // template IDs
  totalMentions: number;
  avgPrevalence: number;
  sentiment: ThemeSentiment;
  isStrategic: boolean; // High-impact theme across multiple interview types
  verbatims: ThemeVerbatim[];
};

// Project-level analytics data (stored in projects.analyticsData)
export type ProjectAnalytics = {
  // Template comparison
  templatePerformance: TemplatePerformanceSummary[];
  
  // Cross-template theme discovery (AI-powered)
  crossTemplateThemes: CrossTemplateTheme[];
  
  // Strategic insights across all templates
  strategicInsights: {
    insight: string;
    significance: string;
    supportingTemplates: string[];
    verbatims: ThemeVerbatim[];
  }[];
  
  // Executive summary
  executiveSummary: {
    headline: string;
    keyTakeaways: string[];
    recommendedActions: string[];
  };
  
  // Project-wide metrics
  projectMetrics: {
    totalTemplates: number;
    totalCollections: number;
    totalSessions: number;
    avgQualityScore: number;
    avgSessionDuration: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  };
  
  // Recommendations
  recommendations: Recommendation[];
  
  // Contextual recommendations (based on strategic context)
  contextualRecommendations?: {
    contextType: string;
    strategicContext: string;
    actionItems: {
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      relatedThemes: string[];
      suggestedContent?: string; // For content-type context
    }[];
    curatedVerbatims: {
      quote: string;
      usageNote: string; // How this quote could be used
      theme: string;
    }[];
    strategicSummary: string;
  };
  
  generatedAt: number;
};

// Post-interview review types
export type ReviewRatings = {
  questionClarity: number | null;
  alviaUnderstanding: number | null;
  conversationFlow: number | null;
  comfortLevel: number | null;
  technicalQuality: number | null;
  overallExperience: number | null;
};

export const RATING_DIMENSIONS = [
  { key: "questionClarity", label: "Question Clarity", description: "Were the interview questions clear and easy to understand?" },
  { key: "alviaUnderstanding", label: "Alvia Understanding", description: "Did Alvia understand your responses well?" },
  { key: "conversationFlow", label: "Conversation Flow", description: "How natural did the conversation feel?" },
  { key: "comfortLevel", label: "Comfort Level", description: "How comfortable were you during the interview?" },
  { key: "technicalQuality", label: "Technical Quality", description: "How was the audio and connection quality?" },
  { key: "overallExperience", label: "Overall Experience", description: "Overall, how was your interview experience?" },
] as const;

export type RatingDimensionKey = typeof RATING_DIMENSIONS[number]["key"];

// Staleness status for analytics
export type StalenessStatus = "fresh" | "aging" | "stale" | "none";

// Entity with staleness metadata
export type EntityWithStaleness = {
  id: string;
  name: string;
  stalenessStatus: StalenessStatus;
  analyticsGeneratedAt: number | null;
  newSessionsSinceRefresh: number;
  lastRefreshLabel: string; // e.g., "3 days ago", "Never"
};

// Project summary for command center
export type ProjectSummaryWithAnalytics = EntityWithStaleness & {
  templateCount: number;
  collectionCount: number;
  totalSessions: number;
  completedSessions: number;
  avgQualityScore: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number } | null;
  executiveSummary: {
    headline: string;
    keyTakeaways: string[];
  } | null;
  hasContextualRecommendations: boolean;
  contextType: string | null;
};

// Strategic insight aggregated from projects
export type AggregatedStrategicInsight = {
  insight: string;
  significance: string;
  sourceProjectId: string;
  sourceProjectName: string;
  verbatims: ThemeVerbatim[];
};

// Key finding aggregated from any level with full attribution
export type AggregatedKeyFinding = {
  finding: string;
  significance: string;
  supportingVerbatims: ThemeVerbatim[];
  relatedThemes: string[];
  sourceType: "project" | "template" | "collection";
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceCollectionId?: string;
  sourceCollectionName?: string;
};

// Cross-template theme aggregated across projects
export type AggregatedCrossTemplateTheme = CrossTemplateTheme & {
  sourceProjectId: string;
  sourceProjectName: string;
  depth?: "mentioned" | "explored" | "deeply_explored";
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
};

// Aggregated consensus point with source attribution
export type AggregatedConsensusPoint = {
  topic: string;
  position: string;
  agreementLevel: number;
  verbatims: ThemeVerbatim[];
  sourceType: "project" | "template" | "collection";
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceCollectionId?: string;
  sourceCollectionName?: string;
};

// Aggregated divergence point with source attribution
export type AggregatedDivergencePoint = {
  topic: string;
  perspectives: { position: string; count: number; verbatims: ThemeVerbatim[] }[];
  sourceType: "project" | "template" | "collection";
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceCollectionId?: string;
  sourceCollectionName?: string;
};

// Template staleness summary
export type TemplateStaleness = EntityWithStaleness & {
  collectionCount: number;
  collectionsNeedingRefresh: number;
  totalSessions: number;
  sourceProjectId: string;
  sourceProjectName: string;
};

// Collection staleness summary  
export type CollectionStaleness = EntityWithStaleness & {
  sessionCount: number;
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId: string;
  sourceTemplateName: string;
};

// Contextual recommendation from projects with strategic context
export type AggregatedContextualRecommendation = {
  projectId: string;
  projectName: string;
  contextType: string;
  actionItems: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    relatedThemes: string[];
  }[];
  curatedVerbatims: {
    quote: string;
    usageNote: string;
    theme: string;
  }[];
  strategicSummary: string;
};

// Top-level aggregated analytics for command center
export type AggregatedAnalytics = {
  // Project summaries with staleness
  projects: ProjectSummaryWithAnalytics[];
  
  // Aggregated strategic insights from all projects
  strategicInsights: AggregatedStrategicInsight[];
  
  // Aggregated key findings from all levels
  keyFindings: AggregatedKeyFinding[];
  
  // Aggregated consensus points from all levels
  consensusPoints: AggregatedConsensusPoint[];
  
  // Aggregated divergence points from all levels
  divergencePoints: AggregatedDivergencePoint[];
  
  // Cross-template themes across all projects
  strategicThemes: AggregatedCrossTemplateTheme[];
  
  // Template-level staleness data
  templateStaleness: TemplateStaleness[];
  
  // Collection-level staleness data (limited to most stale)
  collectionStaleness: CollectionStaleness[];
  
  // Contextual recommendations from projects with strategic context
  contextualRecommendations: AggregatedContextualRecommendation[];
  
  // Overall metrics
  overallMetrics: {
    totalProjects: number;
    totalTemplates: number;
    totalCollections: number;
    totalSessions: number;
    completedSessions: number;
    avgQualityScore: number | null;
    avgSessionDuration: number | null;
    overallSentiment: { positive: number; neutral: number; negative: number } | null;
  };
  
  // Health indicators
  healthIndicators: {
    projectsWithStaleAnalytics: number;
    projectsWithNoAnalytics: number;
    templatesNeedingRefresh: number;
    collectionsNeedingRefresh: number;
  };
};
