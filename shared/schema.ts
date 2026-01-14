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
  avoidRules: text("avoid_rules").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  createdAt: timestamp("created_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

// Respondents
export const respondents = pgTable("respondents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  userId: varchar("user_id"),
  email: text("email"),
  displayName: text("display_name"),
  profileFields: jsonb("profile_fields"),
  invitedAt: timestamp("invited_at").defaultNow(),
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
}, (table) => [
  index("idx_session_collection").on(table.collectionId),
  index("idx_session_status").on(table.status),
]);

// Segments (per-question responses)
export const segments = pgTable("segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  questionId: varchar("question_id").notNull().references(() => questions.id),
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

// Insert schemas
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTemplateSchema = createInsertSchema(interviewTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true, createdAt: true });
export const insertCollectionSchema = createInsertSchema(collections).omit({ id: true, createdAt: true, closedAt: true });
export const insertRespondentSchema = createInsertSchema(respondents).omit({ id: true, invitedAt: true, consentGivenAt: true });
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
  action: "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "none";
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
