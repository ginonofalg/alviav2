import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, pgEnum, index, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

// LLM provider enum for usage tracking
export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "xai",
  "gemini"
]);

// LLM usage event status
export const llmUsageStatusEnum = pgEnum("llm_usage_status", [
  "success",
  "missing_usage",
  "timeout",
  "error"
]);

// Context types for strategic context
export const contextTypeEnum = pgEnum("context_type", [
  "content",
  "product", 
  "marketing",
  "cx",
  "other"
]);

// Simulation enums
export const personaAttitudeEnum = pgEnum("persona_attitude", [
  "cooperative",
  "reluctant",
  "neutral",
  "evasive",
  "enthusiastic"
]);

export const personaVerbosityEnum = pgEnum("persona_verbosity", [
  "low",
  "medium",
  "high"
]);

export const personaDomainKnowledgeEnum = pgEnum("persona_domain_knowledge", [
  "none",
  "basic",
  "intermediate",
  "expert"
]);

export const simulationRunStatusEnum = pgEnum("simulation_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled"
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
  analyzedSessionScope: text("analyzed_session_scope"),
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
  analyzedSessionScope: text("analyzed_session_scope"),
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
  analyzedSessionScope: text("analyzed_session_scope"),
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
  isSimulated: boolean("is_simulated").default(false),
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
  barbaraGuidanceLog: jsonb("barbara_guidance_log"),
  guidanceAdherenceSummary: jsonb("guidance_adherence_summary"),
  isSimulated: boolean("is_simulated").default(false),
  personaId: varchar("persona_id").references(() => personas.id, { onDelete: "set null" }),
  simulationRunId: varchar("simulation_run_id").references(() => simulationRuns.id, { onDelete: "set null" }),
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

export type Segment = typeof segments.$inferSelect;
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
export type RedactionMap = typeof redactionMaps.$inferSelect;
export type InsertRedactionMap = z.infer<typeof insertRedactionMapSchema>;

// ============================================================
// Simulation: Personas and Simulation Runs
// ============================================================

export const personas = pgTable("personas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  populationBriefId: varchar("population_brief_id").references(() => populationBriefs.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  ageRange: text("age_range"),
  gender: text("gender"),
  occupation: text("occupation"),
  location: text("location"),
  attitude: personaAttitudeEnum("attitude").notNull().default("cooperative"),
  verbosity: personaVerbosityEnum("verbosity").notNull().default("medium"),
  domainKnowledge: personaDomainKnowledgeEnum("domain_knowledge").notNull().default("basic"),
  traits: text("traits").array().default(sql`'{}'::text[]`),
  communicationStyle: text("communication_style"),
  backgroundStory: text("background_story"),
  topicsToAvoid: text("topics_to_avoid").array().default(sql`'{}'::text[]`),
  biases: text("biases").array().default(sql`'{}'::text[]`),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_persona_project").on(table.projectId),
]);

export const simulationRuns = pgTable("simulation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  launchedBy: varchar("launched_by").notNull(),
  status: simulationRunStatusEnum("status").notNull().default("pending"),
  personaIds: text("persona_ids").array().notNull(),
  enableBarbara: boolean("enable_barbara").default(true),
  enableSummaries: boolean("enable_summaries").default(true),
  enableAdditionalQuestions: boolean("enable_additional_questions").default(true),
  totalSimulations: integer("total_simulations").notNull(),
  completedSimulations: integer("completed_simulations").default(0),
  failedSimulations: integer("failed_simulations").default(0),
  errorMessage: text("error_message"),
  progress: jsonb("progress"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_simulation_run_collection").on(table.collectionId),
]);

export const personasRelations = relations(personas, ({ one }) => ({
  project: one(projects, {
    fields: [personas.projectId],
    references: [projects.id],
  }),
}));

export const simulationRunsRelations = relations(simulationRuns, ({ one }) => ({
  collection: one(collections, {
    fields: [simulationRuns.collectionId],
    references: [collections.id],
  }),
}));

export const populationBriefs = pgTable("population_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  researchPrompt: text("research_prompt").notNull(),
  additionalContext: text("additional_context"),
  brief: jsonb("brief"),
  confidence: text("confidence"),
  isUngrounded: boolean("is_ungrounded").default(false).notNull(),
  citations: jsonb("citations"),
  status: text("status").notNull().default("researching"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_population_brief_project").on(table.projectId),
]);

export const populationBriefsRelations = relations(populationBriefs, ({ one }) => ({
  project: one(projects, {
    fields: [populationBriefs.projectId],
    references: [projects.id],
  }),
}));

export const insertPopulationBriefSchema = createInsertSchema(populationBriefs).omit({ id: true, createdAt: true });
export type PopulationBriefRecord = typeof populationBriefs.$inferSelect;
export type InsertPopulationBrief = z.infer<typeof insertPopulationBriefSchema>;

export const synthesisJobs = pgTable("synthesis_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  briefId: varchar("brief_id").notNull()
    .references(() => populationBriefs.id, { onDelete: "cascade" }),
  personaCount: integer("persona_count").notNull(),
  diversityMode: text("diversity_mode").notNull().default("balanced"),
  edgeCases: boolean("edge_cases").notNull().default(false),
  status: text("status").notNull().default("synthesizing"),
  personas: jsonb("personas"),
  validationWarnings: jsonb("validation_warnings"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_synthesis_job_project").on(table.projectId),
]);

export const insertSynthesisJobSchema = createInsertSchema(synthesisJobs).omit({ id: true, createdAt: true });
export type SynthesisJobRecord = typeof synthesisJobs.$inferSelect;
export type InsertSynthesisJob = z.infer<typeof insertSynthesisJobSchema>;

export const insertPersonaSchema = createInsertSchema(personas).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSimulationRunSchema = createInsertSchema(simulationRuns).omit({ id: true, createdAt: true });

export type Persona = typeof personas.$inferSelect;
export type InsertPersona = z.infer<typeof insertPersonaSchema>;
export type SimulationRunRecord = typeof simulationRuns.$inferSelect;
export type InsertSimulationRun = z.infer<typeof insertSimulationRunSchema>;

// ============================================================
// LLM Usage Events (Billing Ledger)
// ============================================================

export const llmUsageEvents = pgTable("llm_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: varchar("workspace_id"),
  projectId: varchar("project_id"),
  templateId: varchar("template_id"),
  collectionId: varchar("collection_id"),
  sessionId: varchar("session_id"),
  provider: llmProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  useCase: text("use_case").notNull(),
  status: llmUsageStatusEnum("status").notNull().default("success"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  inputAudioTokens: integer("input_audio_tokens").notNull().default(0),
  outputAudioTokens: integer("output_audio_tokens").notNull().default(0),
  inputTokensTotal: integer("input_tokens_total").notNull().default(0),
  outputTokensTotal: integer("output_tokens_total").notNull().default(0),
  inputCachedTokens: integer("input_cached_tokens").notNull().default(0),
  rawUsage: jsonb("raw_usage"),
  requestId: text("request_id"),
  latencyMs: integer("latency_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_usage_session").on(table.sessionId, table.createdAt),
  index("idx_usage_collection").on(table.collectionId, table.createdAt),
  index("idx_usage_template").on(table.templateId, table.createdAt),
  index("idx_usage_project").on(table.projectId, table.createdAt),
  index("idx_usage_workspace").on(table.workspaceId, table.createdAt),
  index("idx_usage_provider_model").on(table.provider, table.model, table.createdAt),
  index("idx_usage_created_at").on(table.createdAt),
]);

export const insertLlmUsageEventSchema = createInsertSchema(llmUsageEvents).omit({ id: true, createdAt: true });
export type LlmUsageEvent = typeof llmUsageEvents.$inferSelect;
export type InsertLlmUsageEvent = z.infer<typeof insertLlmUsageEventSchema>;

export const llmUsageRollups = pgTable("llm_usage_rollups", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucketStart: timestamp("bucket_start").notNull(),
  workspaceId: varchar("workspace_id").notNull().default(""),
  projectId: varchar("project_id").notNull().default(""),
  templateId: varchar("template_id").notNull().default(""),
  collectionId: varchar("collection_id").notNull().default(""),
  sessionId: varchar("session_id").notNull().default(""),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  useCase: text("use_case").notNull(),
  status: text("status").notNull(),
  callCount: integer("call_count").notNull().default(0),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  inputAudioTokens: integer("input_audio_tokens").notNull().default(0),
  outputAudioTokens: integer("output_audio_tokens").notNull().default(0),
  inputTokensTotal: integer("input_tokens_total").notNull().default(0),
  outputTokensTotal: integer("output_tokens_total").notNull().default(0),
  inputCachedTokens: integer("input_cached_tokens").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  latencyMsSum: integer("latency_ms_sum").notNull().default(0),
  latencyMsMin: integer("latency_ms_min"),
  latencyMsMax: integer("latency_ms_max"),
  firstEventAt: timestamp("first_event_at").notNull(),
  lastEventAt: timestamp("last_event_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_rollup_bucket_dims").on(
    table.bucketStart,
    table.workspaceId,
    table.projectId,
    table.templateId,
    table.collectionId,
    table.sessionId,
    table.provider,
    table.model,
    table.useCase,
    table.status,
  ),
  index("idx_rollup_session").on(table.sessionId),
  index("idx_rollup_collection").on(table.collectionId),
  index("idx_rollup_template").on(table.templateId),
  index("idx_rollup_project").on(table.projectId),
  index("idx_rollup_workspace").on(table.workspaceId),
]);

export const insertLlmUsageRollupSchema = createInsertSchema(llmUsageRollups).omit({ id: true, updatedAt: true });
export type LlmUsageRollup = typeof llmUsageRollups.$inferSelect;
export type InsertLlmUsageRollup = z.infer<typeof insertLlmUsageRollupSchema>;

export * from "./types";
