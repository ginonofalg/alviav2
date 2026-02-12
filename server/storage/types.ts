import type {
  Workspace, InsertWorkspace, Project, InsertProject,
  InterviewTemplate, InsertTemplate, Question, InsertQuestion,
  Collection, InsertCollection, Respondent, InsertRespondent,
  InterviewSession, InsertSession, Segment, InsertSegment,
  PersistedTranscriptEntry, PersistedBarbaraGuidance,
  PersistedQuestionState, QuestionSummary, ReviewRatings,
  AggregatedAnalytics,
  RealtimePerformanceMetrics, TranscriptionQualityMetrics,
  InviteListEntry, InsertInviteListEntry,
  WaitlistEntry, InsertWaitlistEntry,
  AlviaSessionSummary, BarbaraSessionSummary,
  LlmUsageEvent, InsertLlmUsageEvent, UsageRollup,
  BarbaraGuidanceLogEntry, GuidanceAdherenceSummary
} from "@shared/schema";

export interface InterviewStatePatch {
  liveTranscript?: PersistedTranscriptEntry[];
  lastBarbaraGuidance?: PersistedBarbaraGuidance | null;
  questionStates?: PersistedQuestionState[];
  questionSummaries?: QuestionSummary[];
  currentQuestionIndex?: number;
  status?: InterviewSession["status"];
  pausedAt?: Date | null;
  completedAt?: Date | null;
  performanceMetrics?: RealtimePerformanceMetrics;
  transcriptionQualityMetrics?: TranscriptionQualityMetrics;
  additionalQuestions?: unknown;
  additionalQuestionPhase?: boolean;
  currentAdditionalQuestionIndex?: number;
  totalDurationMs?: number;
  alviaSummary?: AlviaSessionSummary;
  barbaraSessionSummary?: BarbaraSessionSummary;
  barbaraGuidanceLog?: BarbaraGuidanceLogEntry[];
  guidanceAdherenceSummary?: GuidanceAdherenceSummary;
}

export interface EnrichedSession extends InterviewSession {
  collectionName: string;
  templateName: string;
  projectName: string;
  respondentName: string | null;
}

export interface IStorage {
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByOwner(ownerId: string): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByWorkspace(workspaceId: string): Promise<Project[]>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  
  getTemplate(id: string): Promise<InterviewTemplate | undefined>;
  getTemplatesByProject(projectId: string): Promise<InterviewTemplate[]>;
  getTemplatesByUser(userId: string): Promise<InterviewTemplate[]>;
  getAllTemplates(): Promise<InterviewTemplate[]>;
  createTemplate(template: InsertTemplate): Promise<InterviewTemplate>;
  updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<InterviewTemplate | undefined>;
  
  getQuestion(id: string): Promise<Question | undefined>;
  getQuestionsByTemplate(templateId: string): Promise<Question[]>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  updateQuestion(id: string, question: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<void>;
  deleteQuestionsByTemplate(templateId: string): Promise<void>;
  
  getCollection(id: string): Promise<Collection | undefined>;
  getCollectionsByTemplate(templateId: string): Promise<Collection[]>;
  getCollectionsByProject(projectId: string): Promise<Collection[]>;
  getCollectionsByUser(userId: string): Promise<Collection[]>;
  getAllCollections(): Promise<Collection[]>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: string, collection: Partial<InsertCollection>): Promise<Collection | undefined>;
  
  getRespondent(id: string): Promise<Respondent | undefined>;
  getRespondentByEmail(collectionId: string, email: string): Promise<Respondent | undefined>;
  getRespondentByUserId(collectionId: string, userId: string): Promise<Respondent | undefined>;
  getRespondentByToken(token: string): Promise<Respondent | undefined>;
  getRespondentsByCollection(collectionId: string): Promise<Respondent[]>;
  createRespondent(respondent: InsertRespondent): Promise<Respondent>;
  createRespondents(respondentsList: InsertRespondent[]): Promise<Respondent[]>;
  updateRespondent(id: string, respondent: Partial<InsertRespondent> & { consentGivenAt?: Date; clickedAt?: Date; invitationStatus?: string }): Promise<Respondent | undefined>;
  
  getSession(id: string): Promise<InterviewSession | undefined>;
  getSessionWithSegments(id: string): Promise<(InterviewSession & { segments: (Segment & { question: Question })[] }) | undefined>;
  getSessionWithRespondent(id: string): Promise<(InterviewSession & { segments: (Segment & { question: Question })[]; respondent: Respondent | null }) | undefined>;
  getSessionsByCollection(collectionId: string): Promise<InterviewSession[]>;
  getSessionsByRespondent(respondentId: string): Promise<InterviewSession[]>;
  getSiblingSessionIds(sessionId: string): Promise<{ prevId: string | null; nextId: string | null }>;
  getAllSessions(limit?: number): Promise<InterviewSession[]>;
  getAllSessionsEnriched(limit?: number): Promise<EnrichedSession[]>;
  getSessionsByUser(userId: string, limit?: number): Promise<EnrichedSession[]>;
  createSession(session: InsertSession): Promise<InterviewSession>;
  updateSession(id: string, session: Partial<InterviewSession>): Promise<InterviewSession | undefined>;
  deleteSession(id: string): Promise<boolean>;
  persistInterviewState(id: string, patch: InterviewStatePatch): Promise<InterviewSession | undefined>;
  setResumeToken(sessionId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  getSessionByResumeToken(tokenHash: string): Promise<InterviewSession | undefined>;
  
  updateSegmentComment(segmentId: string, comment: string): Promise<Segment | undefined>;
  setReviewAccessToken(sessionId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  getSessionByReviewToken(tokenHash: string): Promise<InterviewSession | undefined>;
  submitSessionReview(id: string, data: {
    reviewRatings?: ReviewRatings;
    closingComments?: string;
    reviewSkipped?: boolean;
    reviewCompletedAt?: Date;
  }): Promise<InterviewSession | undefined>;
  
  getSegment(id: string): Promise<Segment | undefined>;
  getSegmentsBySession(sessionId: string): Promise<Segment[]>;
  createSegment(segment: InsertSegment): Promise<Segment>;
  updateSegment(id: string, segment: Partial<InsertSegment>): Promise<Segment | undefined>;
  
  getDashboardStats(userId: string): Promise<{
    projectCount: number;
    collectionCount: number;
    sessionCount: number;
    completedSessions: number;
  }>;
  getEnhancedDashboardStats(userId: string): Promise<{
    projectCount: number;
    templateCount: number;
    collectionCount: number;
    sessionCount: number;
    completedSessions: number;
    sessionsByStatus: Record<string, number>;
    avgSessionDurationMs: number;
    completionRate: number;
    activeCollections: Array<{
      id: string;
      name: string;
      projectName: string;
      targetResponses: number | null;
      actualResponses: number;
      completedResponses: number;
      isActive: boolean;
      createdAt: Date | null;
    }>;
    actionItems: {
      pausedSessions: Array<{
        id: string;
        respondentName: string | null;
        collectionName: string;
        pausedAt: Date | null;
        pausedDurationHours: number;
      }>;
      abandonedSessions: Array<{
        id: string;
        respondentName: string | null;
        collectionName: string;
        createdAt: Date | null;
      }>;
      inProgressSessions: Array<{
        id: string;
        respondentName: string | null;
        collectionName: string;
        startedAt: Date | null;
      }>;
      staleCollections: Array<{
        id: string;
        name: string;
        projectName: string;
        lastSessionAt: Date | null;
        daysSinceActivity: number;
      }>;
    };
  }>;
  getAnalytics(filters?: { projectId?: string; collectionId?: string }): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageDuration: number;
    completionRate: number;
    topThemes: { theme: string; count: number }[];
    questionStats: { questionText: string; avgConfidence: number; responseCount: number }[];
  }>;
  
  getAggregatedAnalytics(userId: string): Promise<AggregatedAnalytics>;
  
  verifyUserAccessToProject(userId: string, projectId: string): Promise<boolean>;
  verifyUserAccessToTemplate(userId: string, templateId: string): Promise<boolean>;
  verifyUserAccessToCollection(userId: string, collectionId: string): Promise<boolean>;
  verifyUserAccessToSession(userId: string, sessionId: string): Promise<boolean>;
  
  isEmailInvited(email: string): Promise<boolean>;
  getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined>;
  createWaitlistEntry(entry: InsertWaitlistEntry): Promise<WaitlistEntry>;
  addToInviteList(entry: InsertInviteListEntry): Promise<InviteListEntry>;
  
  createLlmUsageEvent(event: InsertLlmUsageEvent): Promise<LlmUsageEvent>;
  createLlmUsageEvents(events: InsertLlmUsageEvent[]): Promise<LlmUsageEvent[]>;
  createEventAndUpsertRollup(event: InsertLlmUsageEvent): Promise<LlmUsageEvent>;
  getUsageRollupBySession(sessionId: string): Promise<UsageRollup>;
  getUsageRollupByCollection(collectionId: string): Promise<UsageRollup>;
  getUsageRollupByTemplate(templateId: string): Promise<UsageRollup>;
  getUsageRollupByProject(projectId: string): Promise<UsageRollup>;
  getUsageRollupByWorkspace(workspaceId: string): Promise<UsageRollup>;
  getUsageEventsBySession(sessionId: string): Promise<LlmUsageEvent[]>;
  deleteExpiredUsageEvents(retentionDays: number, batchSize: number): Promise<number>;
  reconcileUsageRollups(hoursBack: number): Promise<number>;
}
