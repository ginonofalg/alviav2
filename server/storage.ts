import { 
  workspaces, projects, interviewTemplates, questions, collections,
  respondents, interviewSessions, segments, redactionMaps, workspaceMembers,
  inviteList, waitlistEntries,
  type Workspace, type InsertWorkspace, type Project, type InsertProject,
  type InterviewTemplate, type InsertTemplate, type Question, type InsertQuestion,
  type Collection, type InsertCollection, type Respondent, type InsertRespondent,
  type InterviewSession, type InsertSession, type Segment, type InsertSegment,
  type WorkspaceMember, type PersistedTranscriptEntry, type PersistedBarbaraGuidance,
  type PersistedQuestionState, type QuestionSummary, type ReviewRatings,
  type AggregatedAnalytics, type ProjectSummaryWithAnalytics, type StalenessStatus,
  type ProjectAnalytics, type TemplateAnalytics, type CollectionAnalytics,
  type AggregatedStrategicInsight, type AggregatedKeyFinding, 
  type AggregatedCrossTemplateTheme, type AggregatedContextualRecommendation,
  type AggregatedConsensusPoint, type AggregatedDivergencePoint,
  type TemplateStaleness, type CollectionStaleness,
  type RealtimePerformanceMetrics, type TranscriptionQualityMetrics,
  type InviteListEntry, type InsertInviteListEntry,
  type WaitlistEntry, type InsertWaitlistEntry
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
}

export interface EnrichedSession extends InterviewSession {
  collectionName: string;
  templateName: string;
  projectName: string;
  respondentName: string | null;
}
import { db } from "./db";
import { eq, desc, and, sql, count } from "drizzle-orm";

export interface IStorage {
  // Workspaces
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByOwner(ownerId: string): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  
  // Projects
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByWorkspace(workspaceId: string): Promise<Project[]>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  
  // Templates
  getTemplate(id: string): Promise<InterviewTemplate | undefined>;
  getTemplatesByProject(projectId: string): Promise<InterviewTemplate[]>;
  getTemplatesByUser(userId: string): Promise<InterviewTemplate[]>;
  getAllTemplates(): Promise<InterviewTemplate[]>;
  createTemplate(template: InsertTemplate): Promise<InterviewTemplate>;
  updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<InterviewTemplate | undefined>;
  
  // Questions
  getQuestion(id: string): Promise<Question | undefined>;
  getQuestionsByTemplate(templateId: string): Promise<Question[]>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  updateQuestion(id: string, question: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<void>;
  deleteQuestionsByTemplate(templateId: string): Promise<void>;
  
  // Collections
  getCollection(id: string): Promise<Collection | undefined>;
  getCollectionsByTemplate(templateId: string): Promise<Collection[]>;
  getCollectionsByProject(projectId: string): Promise<Collection[]>;
  getCollectionsByUser(userId: string): Promise<Collection[]>;
  getAllCollections(): Promise<Collection[]>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: string, collection: Partial<InsertCollection>): Promise<Collection | undefined>;
  
  // Respondents
  getRespondent(id: string): Promise<Respondent | undefined>;
  getRespondentByEmail(collectionId: string, email: string): Promise<Respondent | undefined>;
  getRespondentByUserId(collectionId: string, userId: string): Promise<Respondent | undefined>;
  getRespondentByToken(token: string): Promise<Respondent | undefined>;
  getRespondentsByCollection(collectionId: string): Promise<Respondent[]>;
  createRespondent(respondent: InsertRespondent): Promise<Respondent>;
  createRespondents(respondentsList: InsertRespondent[]): Promise<Respondent[]>;
  updateRespondent(id: string, respondent: Partial<InsertRespondent> & { consentGivenAt?: Date; clickedAt?: Date; invitationStatus?: string }): Promise<Respondent | undefined>;
  
  // Sessions
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
  
  // Review methods
  updateSegmentComment(segmentId: string, comment: string): Promise<Segment | undefined>;
  setReviewAccessToken(sessionId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  getSessionByReviewToken(tokenHash: string): Promise<InterviewSession | undefined>;
  submitSessionReview(id: string, data: {
    reviewRatings?: ReviewRatings;
    closingComments?: string;
    reviewSkipped?: boolean;
    reviewCompletedAt?: Date;
  }): Promise<InterviewSession | undefined>;
  
  // Segments
  getSegment(id: string): Promise<Segment | undefined>;
  getSegmentsBySession(sessionId: string): Promise<Segment[]>;
  createSegment(segment: InsertSegment): Promise<Segment>;
  updateSegment(id: string, segment: Partial<InsertSegment>): Promise<Segment | undefined>;
  
  // Stats
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
  getAnalytics(): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageDuration: number;
    completionRate: number;
    topThemes: { theme: string; count: number }[];
    questionStats: { questionText: string; avgConfidence: number; responseCount: number }[];
  }>;
  
  getAggregatedAnalytics(userId: string): Promise<AggregatedAnalytics>;
  
  // Ownership verification helpers
  verifyUserAccessToProject(userId: string, projectId: string): Promise<boolean>;
  verifyUserAccessToTemplate(userId: string, templateId: string): Promise<boolean>;
  verifyUserAccessToCollection(userId: string, collectionId: string): Promise<boolean>;
  verifyUserAccessToSession(userId: string, sessionId: string): Promise<boolean>;
  
  // Invite List & Waitlist
  isEmailInvited(email: string): Promise<boolean>;
  getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined>;
  createWaitlistEntry(entry: InsertWaitlistEntry): Promise<WaitlistEntry>;
  addToInviteList(entry: InsertInviteListEntry): Promise<InviteListEntry>;
}

export class DatabaseStorage implements IStorage {
  // Workspaces
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspacesByOwner(ownerId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces).where(eq(workspaces.ownerId, ownerId));
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const [created] = await db.insert(workspaces).values(workspace).returning();
    return created;
  }

  // Projects
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    // Get projects from workspaces where user is owner or member
    const userWorkspaces = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId));
    if (userWorkspaces.length === 0) {
      // Create a default workspace for the user
      await db.insert(workspaces).values({
        name: "My Workspace",
        ownerId: userId,
      }).returning();
      return [];
    }
    
    // Query projects for each workspace
    const allProjects: Project[] = [];
    for (const workspace of userWorkspaces) {
      const workspaceProjects = await db.select().from(projects)
        .where(eq(projects.workspaceId, workspace.id))
        .orderBy(desc(projects.updatedAt));
      allProjects.push(...workspaceProjects);
    }
    
    return allProjects;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  // Templates
  async getTemplate(id: string): Promise<InterviewTemplate | undefined> {
    const [template] = await db.select().from(interviewTemplates).where(eq(interviewTemplates.id, id));
    return template;
  }

  async getTemplatesByProject(projectId: string): Promise<InterviewTemplate[]> {
    return await db.select().from(interviewTemplates)
      .where(eq(interviewTemplates.projectId, projectId))
      .orderBy(desc(interviewTemplates.createdAt));
  }

  async getAllTemplates(): Promise<InterviewTemplate[]> {
    return await db.select().from(interviewTemplates)
      .orderBy(desc(interviewTemplates.createdAt));
  }

  async getTemplatesByUser(userId: string): Promise<InterviewTemplate[]> {
    const userProjects = await this.getProjectsByUser(userId);
    if (userProjects.length === 0) return [];
    
    const allTemplates: InterviewTemplate[] = [];
    for (const project of userProjects) {
      const projectTemplates = await this.getTemplatesByProject(project.id);
      allTemplates.push(...projectTemplates);
    }
    return allTemplates;
  }

  async createTemplate(template: InsertTemplate): Promise<InterviewTemplate> {
    const [created] = await db.insert(interviewTemplates).values(template).returning();
    return created;
  }

  async updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<InterviewTemplate | undefined> {
    const [updated] = await db.update(interviewTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(interviewTemplates.id, id))
      .returning();
    return updated;
  }

  // Questions
  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question;
  }

  async getQuestionsByTemplate(templateId: string): Promise<Question[]> {
    return await db.select().from(questions)
      .where(eq(questions.templateId, templateId))
      .orderBy(questions.orderIndex);
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    const [created] = await db.insert(questions).values(question).returning();
    return created;
  }

  async createQuestions(questionList: InsertQuestion[]): Promise<Question[]> {
    if (questionList.length === 0) return [];
    return await db.insert(questions).values(questionList).returning();
  }

  async updateQuestion(id: string, question: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [updated] = await db.update(questions)
      .set(question)
      .where(eq(questions.id, id))
      .returning();
    return updated;
  }

  async deleteQuestion(id: string): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
  }

  async deleteQuestionsByTemplate(templateId: string): Promise<void> {
    await db.delete(questions).where(eq(questions.templateId, templateId));
  }

  // Collections
  async getCollection(id: string): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.id, id));
    return collection;
  }

  async getCollectionsByTemplate(templateId: string): Promise<Collection[]> {
    return await db.select().from(collections)
      .where(eq(collections.templateId, templateId))
      .orderBy(desc(collections.createdAt));
  }

  async getCollectionsByProject(projectId: string): Promise<Collection[]> {
    const templateList = await this.getTemplatesByProject(projectId);
    if (templateList.length === 0) return [];
    
    // Query collections for each template
    const allCollections: Collection[] = [];
    for (const template of templateList) {
      const templateCollections = await db.select().from(collections)
        .where(eq(collections.templateId, template.id))
        .orderBy(desc(collections.createdAt));
      allCollections.push(...templateCollections);
    }
    
    return allCollections;
  }

  async getAllCollections(): Promise<Collection[]> {
    return await db.select().from(collections).orderBy(desc(collections.createdAt));
  }

  async getCollectionsByUser(userId: string): Promise<Collection[]> {
    const userProjects = await this.getProjectsByUser(userId);
    if (userProjects.length === 0) return [];
    
    const allCollections: Collection[] = [];
    for (const project of userProjects) {
      const projectCollections = await this.getCollectionsByProject(project.id);
      allCollections.push(...projectCollections);
    }
    return allCollections;
  }

  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [created] = await db.insert(collections).values(collection).returning();
    return created;
  }

  async updateCollection(id: string, collection: Partial<InsertCollection>): Promise<Collection | undefined> {
    const [updated] = await db.update(collections)
      .set(collection)
      .where(eq(collections.id, id))
      .returning();
    return updated;
  }

  // Respondents
  async getRespondent(id: string): Promise<Respondent | undefined> {
    const [respondent] = await db.select().from(respondents).where(eq(respondents.id, id));
    return respondent;
  }

  async getRespondentByEmail(collectionId: string, email: string): Promise<Respondent | undefined> {
    const [respondent] = await db.select().from(respondents)
      .where(and(eq(respondents.collectionId, collectionId), eq(respondents.email, email)));
    return respondent;
  }

  async getRespondentByUserId(collectionId: string, userId: string): Promise<Respondent | undefined> {
    const [respondent] = await db.select().from(respondents)
      .where(and(eq(respondents.collectionId, collectionId), eq(respondents.userId, userId)));
    return respondent;
  }

  async getRespondentByToken(token: string): Promise<Respondent | undefined> {
    const [respondent] = await db.select().from(respondents)
      .where(eq(respondents.invitationToken, token));
    return respondent;
  }

  async getRespondentsByCollection(collectionId: string): Promise<Respondent[]> {
    return await db.select().from(respondents).where(eq(respondents.collectionId, collectionId)).orderBy(desc(respondents.invitedAt));
  }

  async createRespondent(respondent: InsertRespondent): Promise<Respondent> {
    const [created] = await db.insert(respondents).values(respondent).returning();
    return created;
  }

  async createRespondents(respondentsList: InsertRespondent[]): Promise<Respondent[]> {
    if (respondentsList.length === 0) return [];
    return await db.insert(respondents).values(respondentsList).returning();
  }

  async updateRespondent(id: string, respondent: Partial<InsertRespondent> & { consentGivenAt?: Date; clickedAt?: Date; invitationStatus?: string }): Promise<Respondent | undefined> {
    const [updated] = await db.update(respondents)
      .set(respondent)
      .where(eq(respondents.id, id))
      .returning();
    return updated;
  }

  // Sessions
  async getSession(id: string): Promise<InterviewSession | undefined> {
    const [session] = await db.select().from(interviewSessions).where(eq(interviewSessions.id, id));
    return session;
  }

  async getSessionWithSegments(id: string): Promise<(InterviewSession & { segments: (Segment & { question: Question })[] }) | undefined> {
    const [session] = await db.select().from(interviewSessions).where(eq(interviewSessions.id, id));
    if (!session) return undefined;

    const sessionSegments = await db.select().from(segments)
      .where(eq(segments.sessionId, id))
      .leftJoin(questions, eq(segments.questionId, questions.id));

    return {
      ...session,
      segments: sessionSegments.map(s => ({
        ...s.segments,
        question: s.questions!,
      })),
    };
  }

  async getSessionWithRespondent(id: string): Promise<(InterviewSession & { segments: (Segment & { question: Question })[]; respondent: Respondent | null }) | undefined> {
    const [session] = await db.select().from(interviewSessions).where(eq(interviewSessions.id, id));
    if (!session) return undefined;

    const sessionSegments = await db.select().from(segments)
      .where(eq(segments.sessionId, id))
      .leftJoin(questions, eq(segments.questionId, questions.id));

    const [respondent] = await db.select().from(respondents).where(eq(respondents.id, session.respondentId));

    return {
      ...session,
      segments: sessionSegments.map(s => ({
        ...s.segments,
        question: s.questions!,
      })),
      respondent: respondent || null,
    };
  }

  async getSiblingSessionIds(sessionId: string): Promise<{ prevId: string | null; nextId: string | null }> {
    const session = await this.getSession(sessionId);
    if (!session) return { prevId: null, nextId: null };

    const collectionSessions = await db.select({ id: interviewSessions.id, createdAt: interviewSessions.createdAt })
      .from(interviewSessions)
      .where(eq(interviewSessions.collectionId, session.collectionId))
      .orderBy(desc(interviewSessions.createdAt));

    const currentIndex = collectionSessions.findIndex(s => s.id === sessionId);
    
    return {
      prevId: currentIndex > 0 ? collectionSessions[currentIndex - 1].id : null,
      nextId: currentIndex < collectionSessions.length - 1 ? collectionSessions[currentIndex + 1].id : null,
    };
  }

  async getSessionsByCollection(collectionId: string): Promise<InterviewSession[]> {
    return await db.select().from(interviewSessions)
      .where(eq(interviewSessions.collectionId, collectionId))
      .orderBy(desc(interviewSessions.createdAt));
  }

  async getSessionsByRespondent(respondentId: string): Promise<InterviewSession[]> {
    return await db.select().from(interviewSessions)
      .where(eq(interviewSessions.respondentId, respondentId))
      .orderBy(desc(interviewSessions.createdAt));
  }

  async getAllSessions(limit?: number): Promise<InterviewSession[]> {
    const query = db.select().from(interviewSessions).orderBy(desc(interviewSessions.createdAt));
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getAllSessionsEnriched(limit?: number): Promise<EnrichedSession[]> {
    const baseQuery = db
      .select({
        session: interviewSessions,
        collectionName: collections.name,
        templateName: interviewTemplates.name,
        projectName: projects.name,
        respondentInformalName: respondents.informalName,
        respondentFullName: respondents.fullName,
      })
      .from(interviewSessions)
      .innerJoin(collections, eq(interviewSessions.collectionId, collections.id))
      .innerJoin(interviewTemplates, eq(collections.templateId, interviewTemplates.id))
      .innerJoin(projects, eq(interviewTemplates.projectId, projects.id))
      .leftJoin(respondents, eq(interviewSessions.respondentId, respondents.id))
      .orderBy(desc(interviewSessions.createdAt));

    const rows = limit ? await baseQuery.limit(limit) : await baseQuery;

    return rows.map((row) => ({
      ...row.session,
      collectionName: row.collectionName,
      templateName: row.templateName,
      projectName: row.projectName,
      respondentName: row.respondentInformalName || row.respondentFullName || null,
    }));
  }

  async getSessionsByUser(userId: string, limit?: number): Promise<EnrichedSession[]> {
    const userWorkspaces = await this.getWorkspacesByOwner(userId);
    if (userWorkspaces.length === 0) return [];
    
    const workspaceIds = userWorkspaces.map(w => w.id);
    
    const baseQuery = db
      .select({
        session: interviewSessions,
        collectionName: collections.name,
        templateName: interviewTemplates.name,
        projectName: projects.name,
        respondentInformalName: respondents.informalName,
        respondentFullName: respondents.fullName,
      })
      .from(interviewSessions)
      .innerJoin(collections, eq(interviewSessions.collectionId, collections.id))
      .innerJoin(interviewTemplates, eq(collections.templateId, interviewTemplates.id))
      .innerJoin(projects, eq(interviewTemplates.projectId, projects.id))
      .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .leftJoin(respondents, eq(interviewSessions.respondentId, respondents.id))
      .where(sql`${workspaces.id} IN ${workspaceIds}`)
      .orderBy(desc(interviewSessions.createdAt));

    const rows = limit ? await baseQuery.limit(limit) : await baseQuery;

    return rows.map((row) => ({
      ...row.session,
      collectionName: row.collectionName,
      templateName: row.templateName,
      projectName: row.projectName,
      respondentName: row.respondentInformalName || row.respondentFullName || null,
    }));
  }

  async createSession(session: InsertSession): Promise<InterviewSession> {
    const [created] = await db.insert(interviewSessions).values(session).returning();
    return created;
  }

  async updateSession(id: string, session: Partial<InterviewSession>): Promise<InterviewSession | undefined> {
    const [updated] = await db.update(interviewSessions)
      .set(session)
      .where(eq(interviewSessions.id, id))
      .returning();
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await db.delete(interviewSessions).where(eq(interviewSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async persistInterviewState(id: string, patch: InterviewStatePatch): Promise<InterviewSession | undefined> {
    const updateData: Record<string, unknown> = {};
    
    if (patch.liveTranscript !== undefined) {
      updateData.liveTranscript = patch.liveTranscript;
    }
    if (patch.lastBarbaraGuidance !== undefined) {
      updateData.lastBarbaraGuidance = patch.lastBarbaraGuidance;
    }
    if (patch.questionStates !== undefined) {
      updateData.questionStates = patch.questionStates;
    }
    if (patch.questionSummaries !== undefined) {
      updateData.questionSummaries = patch.questionSummaries;
    }
    if (patch.currentQuestionIndex !== undefined) {
      updateData.currentQuestionIndex = patch.currentQuestionIndex;
    }
    if (patch.status !== undefined) {
      updateData.status = patch.status;
    }
    if (patch.pausedAt !== undefined) {
      updateData.pausedAt = patch.pausedAt;
    }
    if (patch.completedAt !== undefined) {
      updateData.completedAt = patch.completedAt;
    }
    if (patch.performanceMetrics !== undefined) {
      updateData.performanceMetrics = patch.performanceMetrics;
    }
    if (patch.transcriptionQualityMetrics !== undefined) {
      updateData.transcriptionQualityMetrics = patch.transcriptionQualityMetrics;
    }
    if (patch.additionalQuestions !== undefined) {
      updateData.additionalQuestions = patch.additionalQuestions;
    }
    if (patch.additionalQuestionPhase !== undefined) {
      updateData.additionalQuestionPhase = patch.additionalQuestionPhase;
    }
    if (patch.currentAdditionalQuestionIndex !== undefined) {
      updateData.currentAdditionalQuestionIndex = patch.currentAdditionalQuestionIndex;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getSession(id);
    }

    const [updated] = await db.update(interviewSessions)
      .set(updateData)
      .where(eq(interviewSessions.id, id))
      .returning();
    return updated;
  }

  async setResumeToken(sessionId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.update(interviewSessions)
      .set({ resumeTokenHash: tokenHash, resumeTokenExpiresAt: expiresAt })
      .where(eq(interviewSessions.id, sessionId));
  }

  async getSessionByResumeToken(tokenHash: string): Promise<InterviewSession | undefined> {
    const [session] = await db.select()
      .from(interviewSessions)
      .where(eq(interviewSessions.resumeTokenHash, tokenHash));
    return session;
  }

  // Review methods
  async updateSegmentComment(segmentId: string, comment: string): Promise<Segment | undefined> {
    const [updated] = await db.update(segments)
      .set({ respondentComment: comment })
      .where(eq(segments.id, segmentId))
      .returning();
    return updated;
  }

  async setReviewAccessToken(sessionId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.update(interviewSessions)
      .set({ reviewAccessToken: tokenHash, reviewAccessExpiresAt: expiresAt })
      .where(eq(interviewSessions.id, sessionId));
  }

  async getSessionByReviewToken(tokenHash: string): Promise<InterviewSession | undefined> {
    const [session] = await db.select()
      .from(interviewSessions)
      .where(eq(interviewSessions.reviewAccessToken, tokenHash));
    return session;
  }

  async submitSessionReview(id: string, data: {
    reviewRatings?: ReviewRatings | null;
    closingComments?: string | null;
    reviewComments?: Record<string, string> | null;
    reviewSkipped?: boolean;
    reviewCompletedAt?: Date;
    reviewAccessToken?: string | null;
    reviewAccessExpiresAt?: Date | null;
  }): Promise<InterviewSession | undefined> {
    const [updated] = await db.update(interviewSessions)
      .set(data)
      .where(eq(interviewSessions.id, id))
      .returning();
    return updated;
  }

  // Segments
  async getSegment(id: string): Promise<Segment | undefined> {
    const [segment] = await db.select().from(segments).where(eq(segments.id, id));
    return segment;
  }

  async getSegmentsBySession(sessionId: string): Promise<Segment[]> {
    return await db.select().from(segments).where(eq(segments.sessionId, sessionId));
  }

  async createSegment(segment: InsertSegment): Promise<Segment> {
    const [created] = await db.insert(segments).values(segment).returning();
    return created;
  }

  async updateSegment(id: string, segment: Partial<InsertSegment>): Promise<Segment | undefined> {
    const [updated] = await db.update(segments)
      .set(segment)
      .where(eq(segments.id, id))
      .returning();
    return updated;
  }

  // Stats
  async getDashboardStats(userId: string): Promise<{
    projectCount: number;
    collectionCount: number;
    sessionCount: number;
    completedSessions: number;
  }> {
    const projectList = await this.getProjectsByUser(userId);
    const projectCount = projectList.length;

    let collectionCount = 0;
    let sessionCount = 0;
    let completedSessions = 0;

    for (const project of projectList) {
      const collectionList = await this.getCollectionsByProject(project.id);
      collectionCount += collectionList.length;
      
      for (const collection of collectionList) {
        const sessionList = await this.getSessionsByCollection(collection.id);
        sessionCount += sessionList.length;
        completedSessions += sessionList.filter(s => s.status === "completed").length;
      }
    }

    return { projectCount, collectionCount, sessionCount, completedSessions };
  }

  async getEnhancedDashboardStats(userId: string): Promise<{
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
  }> {
    const projectList = await this.getProjectsByUser(userId);
    const projectCount = projectList.length;

    let templateCount = 0;
    let collectionCount = 0;
    let sessionCount = 0;
    let completedSessions = 0;
    const sessionsByStatus: Record<string, number> = {
      pending: 0,
      consent_given: 0,
      in_progress: 0,
      paused: 0,
      completed: 0,
      abandoned: 0,
    };
    const durations: number[] = [];
    const activeCollections: Array<{
      id: string;
      name: string;
      projectName: string;
      targetResponses: number | null;
      actualResponses: number;
      completedResponses: number;
      isActive: boolean;
      createdAt: Date | null;
    }> = [];
    const pausedSessions: Array<{
      id: string;
      respondentName: string | null;
      collectionName: string;
      pausedAt: Date | null;
      pausedDurationHours: number;
    }> = [];
    const abandonedSessions: Array<{
      id: string;
      respondentName: string | null;
      collectionName: string;
      createdAt: Date | null;
    }> = [];
    const inProgressSessions: Array<{
      id: string;
      respondentName: string | null;
      collectionName: string;
      startedAt: Date | null;
    }> = [];
    const staleCollections: Array<{
      id: string;
      name: string;
      projectName: string;
      lastSessionAt: Date | null;
      daysSinceActivity: number;
    }> = [];

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    for (const project of projectList) {
      const templateList = await this.getTemplatesByProject(project.id);
      templateCount += templateList.length;
      
      const collectionList = await this.getCollectionsByProject(project.id);
      collectionCount += collectionList.length;
      
      for (const collection of collectionList) {
        const sessionList = await this.getSessionsByCollection(collection.id);
        sessionCount += sessionList.length;
        
        let lastSessionAt: Date | null = null;
        let collectionCompletedCount = 0;
        
        for (const session of sessionList) {
          sessionsByStatus[session.status] = (sessionsByStatus[session.status] || 0) + 1;
          
          if (session.status === "completed") {
            completedSessions++;
            collectionCompletedCount++;
            if (session.totalDurationMs && session.totalDurationMs > 0) {
              durations.push(session.totalDurationMs);
            } else if (session.startedAt && session.completedAt) {
              const duration = new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
              if (duration > 0) durations.push(duration);
            }
          }
          
          if (session.createdAt && (!lastSessionAt || new Date(session.createdAt) > lastSessionAt)) {
            lastSessionAt = session.createdAt;
          }
          
          const respondent = await this.getRespondent(session.respondentId);
          const respondentName = respondent?.informalName || respondent?.fullName || null;
          
          if (session.status === "paused" && session.pausedAt) {
            const pausedDurationHours = Math.round((now - new Date(session.pausedAt).getTime()) / (1000 * 60 * 60));
            pausedSessions.push({
              id: session.id,
              respondentName,
              collectionName: collection.name,
              pausedAt: session.pausedAt,
              pausedDurationHours,
            });
          }
          
          if (session.status === "abandoned") {
            abandonedSessions.push({
              id: session.id,
              respondentName,
              collectionName: collection.name,
              createdAt: session.createdAt,
            });
          }
          
          if (session.status === "in_progress") {
            inProgressSessions.push({
              id: session.id,
              respondentName,
              collectionName: collection.name,
              startedAt: session.startedAt,
            });
          }
        }
        
        if (collection.isActive) {
          activeCollections.push({
            id: collection.id,
            name: collection.name,
            projectName: project.name,
            targetResponses: collection.targetResponses,
            actualResponses: sessionList.length,
            completedResponses: collectionCompletedCount,
            isActive: collection.isActive ?? true,
            createdAt: collection.createdAt,
          });
        }
        
        if (sessionList.length > 0 && lastSessionAt) {
          const daysSinceActivity = Math.floor((now - new Date(lastSessionAt).getTime()) / ONE_DAY_MS);
          if (daysSinceActivity >= 7 && collection.isActive) {
            staleCollections.push({
              id: collection.id,
              name: collection.name,
              projectName: project.name,
              lastSessionAt,
              daysSinceActivity,
            });
          }
        }
      }
    }

    const avgSessionDurationMs = durations.length > 0 
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) 
      : 0;
    const completionRate = sessionCount > 0 ? Math.round((completedSessions / sessionCount) * 100) : 0;

    pausedSessions.sort((a, b) => b.pausedDurationHours - a.pausedDurationHours);
    staleCollections.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
    activeCollections.sort((a, b) => {
      const aProgress = a.targetResponses ? a.completedResponses / a.targetResponses : 0;
      const bProgress = b.targetResponses ? b.completedResponses / b.targetResponses : 0;
      return bProgress - aProgress;
    });

    return {
      projectCount,
      templateCount,
      collectionCount,
      sessionCount,
      completedSessions,
      sessionsByStatus,
      avgSessionDurationMs,
      completionRate,
      activeCollections: activeCollections.slice(0, 5),
      actionItems: {
        pausedSessions: pausedSessions.slice(0, 5),
        abandonedSessions: abandonedSessions.slice(0, 5),
        inProgressSessions: inProgressSessions.slice(0, 5),
        staleCollections: staleCollections.slice(0, 5),
      },
    };
  }

  async getAnalytics(filters?: { projectId?: string; collectionId?: string }): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageDuration: number;
    completionRate: number;
    topThemes: { theme: string; count: number }[];
    questionStats: { questionText: string; avgConfidence: number; responseCount: number }[];
  }> {
    let allSessions: Awaited<ReturnType<typeof this.getAllSessions>>;
    
    if (filters?.collectionId) {
      allSessions = await this.getSessionsByCollection(filters.collectionId);
    } else if (filters?.projectId) {
      const collections = await this.getCollectionsByProject(filters.projectId);
      const sessionPromises = collections.map(c => this.getSessionsByCollection(c.id));
      const sessionArrays = await Promise.all(sessionPromises);
      allSessions = sessionArrays.flat();
    } else {
      allSessions = await this.getAllSessions();
    }
    const totalSessions = allSessions.length;
    const completedSessionsList = allSessions.filter(s => s.status === "completed");
    const completedSessions = completedSessionsList.length;
    
    const durations = allSessions
      .filter(s => s.startedAt && s.completedAt)
      .map(s => {
        const start = new Date(s.startedAt!).getTime();
        const end = new Date(s.completedAt!).getTime();
        return end - start;
      })
      .filter(d => d > 0);
    const averageDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length / 60000 
      : 0;
    
    const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

    const themeCounts: Map<string, number> = new Map();
    const questionStatsMap: Map<number, { text: string; scores: number[]; count: number }> = new Map();

    for (const session of completedSessionsList) {
      const summaries = (session.questionSummaries as Array<{
        questionIndex: number;
        questionText: string;
        keyInsights: string[];
        qualityScore?: number;
      }>) || [];

      for (const summary of summaries) {
        for (const insight of summary.keyInsights || []) {
          const words = insight.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
          if (words.length > 5) {
            themeCounts.set(words, (themeCounts.get(words) || 0) + 1);
          }
        }

        if (!questionStatsMap.has(summary.questionIndex)) {
          questionStatsMap.set(summary.questionIndex, { 
            text: summary.questionText, 
            scores: [], 
            count: 0 
          });
        }
        const stat = questionStatsMap.get(summary.questionIndex)!;
        stat.count++;
        if (typeof summary.qualityScore === "number") {
          stat.scores.push(summary.qualityScore);
        }
      }
    }

    const topThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([theme, count]) => ({ theme, count }));

    const questionStats = Array.from(questionStatsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, stat]) => ({
        questionText: stat.text,
        avgConfidence: stat.scores.length > 0 
          ? Math.round(stat.scores.reduce((a, b) => a + b, 0) / stat.scores.length)
          : 0,
        responseCount: stat.count,
      }));

    return {
      totalSessions,
      completedSessions,
      averageDuration,
      completionRate,
      topThemes,
      questionStats,
    };
  }

  async getAggregatedAnalytics(userId: string): Promise<AggregatedAnalytics> {
    const projectList = await this.getProjectsByUser(userId);
    
    const projectSummaries: ProjectSummaryWithAnalytics[] = [];
    const strategicInsights: AggregatedStrategicInsight[] = [];
    const keyFindings: AggregatedKeyFinding[] = [];
    const consensusPoints: AggregatedConsensusPoint[] = [];
    const divergencePoints: AggregatedDivergencePoint[] = [];
    const strategicThemes: AggregatedCrossTemplateTheme[] = [];
    const templateStalenessData: TemplateStaleness[] = [];
    const collectionStalenessData: CollectionStaleness[] = [];
    const contextualRecommendations: AggregatedContextualRecommendation[] = [];
    
    let totalTemplates = 0;
    let totalCollections = 0;
    let totalSessions = 0;
    let completedSessions = 0;
    let projectsWithStaleAnalytics = 0;
    let projectsWithNoAnalytics = 0;
    let templatesNeedingRefresh = 0;
    let collectionsNeedingRefresh = 0;
    
    const qualityScores: number[] = [];
    const durations: number[] = [];
    let overallPositive = 0;
    let overallNeutral = 0;
    let overallNegative = 0;
    let sentimentCount = 0;
    
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * ONE_DAY;
    
    const calculateStaleness = (generatedAt: number | null): { status: StalenessStatus; label: string } => {
      if (!generatedAt) return { status: "none", label: "Never" };
      const age = now - generatedAt;
      if (age < ONE_DAY) return { status: "fresh", label: "Today" };
      const days = Math.floor(age / ONE_DAY);
      if (age < SEVEN_DAYS) return { status: "aging", label: `${days} day${days > 1 ? "s" : ""} ago` };
      return { status: "stale", label: `${days} days ago` };
    };
    
    for (const project of projectList) {
      const templates = await this.getTemplatesByProject(project.id);
      const projectCollections = await this.getCollectionsByProject(project.id);
      
      totalTemplates += templates.length;
      totalCollections += projectCollections.length;
      
      let projectSessions = 0;
      let projectCompletedSessions = 0;
      let sessionsAfterRefresh = 0;
      
      const analytics = project.analyticsData as ProjectAnalytics | null;
      const generatedAt = analytics?.generatedAt ?? null;
      
      for (const collection of projectCollections) {
        const sessions = await this.getSessionsByCollection(collection.id);
        projectSessions += sessions.length;
        projectCompletedSessions += sessions.filter(s => s.status === "completed").length;
        
        if (generatedAt) {
          sessionsAfterRefresh += sessions.filter(s => 
            s.startedAt && new Date(s.startedAt).getTime() > generatedAt
          ).length;
        } else {
          sessionsAfterRefresh += sessions.length;
        }
        
        const collectionAnalytics = collection.analyticsData as CollectionAnalytics | null;
        if (!collectionAnalytics?.generatedAt) {
          collectionsNeedingRefresh++;
        } else if (now - collectionAnalytics.generatedAt > SEVEN_DAYS) {
          collectionsNeedingRefresh++;
        }
      }
      
      totalSessions += projectSessions;
      completedSessions += projectCompletedSessions;
      
      let stalenessStatus: StalenessStatus = "none";
      let lastRefreshLabel = "Never";
      
      if (generatedAt) {
        const age = now - generatedAt;
        if (age < ONE_DAY) {
          stalenessStatus = "fresh";
          lastRefreshLabel = "Today";
        } else if (age < SEVEN_DAYS) {
          stalenessStatus = "aging";
          const days = Math.floor(age / ONE_DAY);
          lastRefreshLabel = `${days} day${days > 1 ? "s" : ""} ago`;
          projectsWithStaleAnalytics++;
        } else {
          stalenessStatus = "stale";
          const days = Math.floor(age / ONE_DAY);
          lastRefreshLabel = `${days} days ago`;
          projectsWithStaleAnalytics++;
        }
      } else {
        projectsWithNoAnalytics++;
      }
      
      const projectSummary: ProjectSummaryWithAnalytics = {
        id: project.id,
        name: project.name,
        stalenessStatus,
        analyticsGeneratedAt: generatedAt,
        newSessionsSinceRefresh: sessionsAfterRefresh,
        lastRefreshLabel,
        templateCount: templates.length,
        collectionCount: projectCollections.length,
        totalSessions: projectSessions,
        completedSessions: projectCompletedSessions,
        avgQualityScore: analytics?.projectMetrics?.avgQualityScore ?? null,
        sentimentDistribution: analytics?.projectMetrics?.sentimentDistribution ?? null,
        executiveSummary: analytics?.executiveSummary ? {
          headline: analytics.executiveSummary.headline,
          keyTakeaways: analytics.executiveSummary.keyTakeaways,
        } : null,
        hasContextualRecommendations: !!analytics?.contextualRecommendations,
        contextType: project.contextType ?? null,
      };
      
      projectSummaries.push(projectSummary);
      
      if (analytics) {
        if (analytics.projectMetrics?.avgQualityScore) {
          qualityScores.push(analytics.projectMetrics.avgQualityScore);
        }
        if (analytics.projectMetrics?.avgSessionDuration) {
          durations.push(analytics.projectMetrics.avgSessionDuration);
        }
        if (analytics.projectMetrics?.sentimentDistribution) {
          const sd = analytics.projectMetrics.sentimentDistribution;
          overallPositive += sd.positive;
          overallNeutral += sd.neutral;
          overallNegative += sd.negative;
          sentimentCount++;
        }
        
        if (analytics.strategicInsights) {
          for (const insight of analytics.strategicInsights.slice(0, 5)) {
            strategicInsights.push({
              insight: insight.insight,
              significance: insight.significance,
              sourceProjectId: project.id,
              sourceProjectName: project.name,
              verbatims: insight.verbatims || [],
            });
          }
        }
        
        if (analytics.crossTemplateThemes) {
          for (const theme of analytics.crossTemplateThemes.filter(t => t.isStrategic).slice(0, 5)) {
            strategicThemes.push({
              ...theme,
              sourceProjectId: project.id,
              sourceProjectName: project.name,
            });
          }
        }
        
        if (analytics.contextualRecommendations && project.contextType) {
          contextualRecommendations.push({
            projectId: project.id,
            projectName: project.name,
            contextType: project.contextType,
            actionItems: analytics.contextualRecommendations.actionItems || [],
            curatedVerbatims: analytics.contextualRecommendations.curatedVerbatims || [],
            strategicSummary: analytics.contextualRecommendations.strategicSummary || "",
          });
        }
      }
      
      for (const template of templates) {
        const templateAnalytics = template.analyticsData as TemplateAnalytics | null;
        const templateGeneratedAt = templateAnalytics?.generatedAt ?? null;
        const templateStaleness = calculateStaleness(templateGeneratedAt);
        
        const templateCollections = projectCollections.filter(c => c.templateId === template.id);
        let templateCollectionsNeedingRefresh = 0;
        let templateSessionCount = 0;
        let templateSessionsAfterRefresh = 0;
        
        for (const collection of templateCollections) {
          const collSessions = await this.getSessionsByCollection(collection.id);
          templateSessionCount += collSessions.length;
          
          const collAnalytics = collection.analyticsData as CollectionAnalytics | null;
          const collGeneratedAt = collAnalytics?.generatedAt ?? null;
          const collStaleness = calculateStaleness(collGeneratedAt);
          
          if (collStaleness.status === "stale" || collStaleness.status === "none") {
            templateCollectionsNeedingRefresh++;
          }
          
          if (templateGeneratedAt) {
            templateSessionsAfterRefresh += collSessions.filter(s => 
              s.startedAt && new Date(s.startedAt).getTime() > templateGeneratedAt
            ).length;
          }
          
          collectionStalenessData.push({
            id: collection.id,
            name: collection.name,
            stalenessStatus: collStaleness.status,
            analyticsGeneratedAt: collGeneratedAt,
            newSessionsSinceRefresh: collGeneratedAt 
              ? collSessions.filter(s => s.startedAt && new Date(s.startedAt).getTime() > collGeneratedAt).length 
              : collSessions.length,
            lastRefreshLabel: collStaleness.label,
            sessionCount: collSessions.length,
            sourceProjectId: project.id,
            sourceProjectName: project.name,
            sourceTemplateId: template.id,
            sourceTemplateName: template.name,
          });
          
          if (collAnalytics?.consensusPoints) {
            for (const cp of collAnalytics.consensusPoints.slice(0, 2)) {
              consensusPoints.push({
                topic: cp.topic,
                position: cp.position,
                agreementLevel: cp.agreementLevel,
                verbatims: cp.verbatims || [],
                sourceType: "collection",
                sourceProjectId: project.id,
                sourceProjectName: project.name,
                sourceTemplateId: template.id,
                sourceTemplateName: template.name,
                sourceCollectionId: collection.id,
                sourceCollectionName: collection.name,
              });
            }
          }
          
          if (collAnalytics?.divergencePoints) {
            for (const dp of collAnalytics.divergencePoints.slice(0, 2)) {
              divergencePoints.push({
                topic: dp.topic,
                perspectives: dp.perspectives || [],
                sourceType: "collection",
                sourceProjectId: project.id,
                sourceProjectName: project.name,
                sourceTemplateId: template.id,
                sourceTemplateName: template.name,
                sourceCollectionId: collection.id,
                sourceCollectionName: collection.name,
              });
            }
          }
        }
        
        if (templateStaleness.status === "stale" || templateStaleness.status === "none") {
          templatesNeedingRefresh++;
        }
        
        templateStalenessData.push({
          id: template.id,
          name: template.name,
          stalenessStatus: templateStaleness.status,
          analyticsGeneratedAt: templateGeneratedAt,
          newSessionsSinceRefresh: templateSessionsAfterRefresh,
          lastRefreshLabel: templateStaleness.label,
          collectionCount: templateCollections.length,
          collectionsNeedingRefresh: templateCollectionsNeedingRefresh,
          totalSessions: templateSessionCount,
          sourceProjectId: project.id,
          sourceProjectName: project.name,
        });
        
        if (templateAnalytics?.keyFindings) {
          for (const finding of templateAnalytics.keyFindings.slice(0, 3)) {
            keyFindings.push({
              finding: finding.finding,
              significance: finding.significance,
              supportingVerbatims: finding.supportingVerbatims || [],
              relatedThemes: finding.relatedThemes || [],
              sourceType: "template",
              sourceProjectId: project.id,
              sourceProjectName: project.name,
              sourceTemplateId: template.id,
              sourceTemplateName: template.name,
              sourceCollectionId: finding.sourceCollectionId,
              sourceCollectionName: finding.sourceCollectionName,
            });
          }
        }
        
        if (templateAnalytics?.consensusPoints) {
          for (const cp of templateAnalytics.consensusPoints.slice(0, 2)) {
            consensusPoints.push({
              topic: cp.topic,
              position: cp.position,
              agreementLevel: cp.agreementLevel,
              verbatims: cp.verbatims || [],
              sourceType: "template",
              sourceProjectId: project.id,
              sourceProjectName: project.name,
              sourceTemplateId: template.id,
              sourceTemplateName: template.name,
              sourceCollectionId: cp.sourceCollectionId,
              sourceCollectionName: cp.sourceCollectionName,
            });
          }
        }
        
        if (templateAnalytics?.divergencePoints) {
          for (const dp of templateAnalytics.divergencePoints.slice(0, 2)) {
            divergencePoints.push({
              topic: dp.topic,
              perspectives: dp.perspectives || [],
              sourceType: "template",
              sourceProjectId: project.id,
              sourceProjectName: project.name,
              sourceTemplateId: template.id,
              sourceTemplateName: template.name,
              sourceCollectionId: dp.sourceCollectionId,
              sourceCollectionName: dp.sourceCollectionName,
            });
          }
        }
      }
    }
    
    const avgQualityScore = qualityScores.length > 0 
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
      : null;
    const avgSessionDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    const overallSentiment = sentimentCount > 0 ? {
      positive: Math.round(overallPositive / sentimentCount),
      neutral: Math.round(overallNeutral / sentimentCount),
      negative: Math.round(overallNegative / sentimentCount),
    } : null;
    
    const staleCollections = collectionStalenessData
      .filter(c => c.stalenessStatus === "stale" || c.stalenessStatus === "none")
      .sort((a, b) => (a.analyticsGeneratedAt || 0) - (b.analyticsGeneratedAt || 0))
      .slice(0, 10);
    
    const staleTemplates = templateStalenessData
      .filter(t => t.stalenessStatus === "stale" || t.stalenessStatus === "none")
      .sort((a, b) => (a.analyticsGeneratedAt || 0) - (b.analyticsGeneratedAt || 0))
      .slice(0, 10);
    
    return {
      projects: projectSummaries,
      strategicInsights: strategicInsights.slice(0, 10),
      keyFindings: keyFindings.slice(0, 15),
      consensusPoints: consensusPoints.slice(0, 10),
      divergencePoints: divergencePoints.slice(0, 10),
      strategicThemes: strategicThemes.slice(0, 10),
      templateStaleness: staleTemplates,
      collectionStaleness: staleCollections,
      contextualRecommendations,
      overallMetrics: {
        totalProjects: projectList.length,
        totalTemplates,
        totalCollections,
        totalSessions,
        completedSessions,
        avgQualityScore,
        avgSessionDuration,
        overallSentiment,
      },
      healthIndicators: {
        projectsWithStaleAnalytics,
        projectsWithNoAnalytics,
        templatesNeedingRefresh,
        collectionsNeedingRefresh,
      },
    };
  }

  // Ownership verification helpers
  async verifyUserAccessToProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    if (!project) return false;
    
    const workspace = await this.getWorkspace(project.workspaceId);
    if (!workspace) return false;
    
    return workspace.ownerId === userId;
  }

  async verifyUserAccessToTemplate(userId: string, templateId: string): Promise<boolean> {
    const template = await this.getTemplate(templateId);
    if (!template) return false;
    
    return this.verifyUserAccessToProject(userId, template.projectId);
  }

  async verifyUserAccessToCollection(userId: string, collectionId: string): Promise<boolean> {
    const collection = await this.getCollection(collectionId);
    if (!collection) return false;
    
    return this.verifyUserAccessToTemplate(userId, collection.templateId);
  }

  async verifyUserAccessToSession(userId: string, sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    
    return this.verifyUserAccessToCollection(userId, session.collectionId);
  }

  // Invite List & Waitlist
  async isEmailInvited(email: string): Promise<boolean> {
    // Check if invite-only mode is enabled (defaults to true if not set)
    const inviteOnlyMode = process.env.INVITE_ONLY_MODE !== "false";
    if (!inviteOnlyMode) {
      return true; // Everyone is allowed when invite-only mode is disabled
    }
    
    // Case-insensitive email check
    const normalizedEmail = email.toLowerCase().trim();
    const [entry] = await db.select()
      .from(inviteList)
      .where(sql`LOWER(${inviteList.email}) = ${normalizedEmail}`);
    return !!entry;
  }

  async getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined> {
    const normalizedEmail = email.toLowerCase().trim();
    const [entry] = await db.select()
      .from(waitlistEntries)
      .where(sql`LOWER(${waitlistEntries.email}) = ${normalizedEmail}`);
    return entry;
  }

  async createWaitlistEntry(entry: InsertWaitlistEntry): Promise<WaitlistEntry> {
    // Normalize email before insert
    const normalizedEntry = {
      ...entry,
      email: entry.email.toLowerCase().trim(),
    };
    const [created] = await db.insert(waitlistEntries)
      .values(normalizedEntry)
      .onConflictDoUpdate({
        target: waitlistEntries.email,
        set: {
          firstName: normalizedEntry.firstName,
          lastName: normalizedEntry.lastName,
          consentNewsletter: normalizedEntry.consentNewsletter,
          consentMarketing: normalizedEntry.consentMarketing,
          replitUserId: normalizedEntry.replitUserId,
        },
      })
      .returning();
    return created;
  }

  async addToInviteList(entry: InsertInviteListEntry): Promise<InviteListEntry> {
    const normalizedEntry = {
      ...entry,
      email: entry.email.toLowerCase().trim(),
    };
    const [created] = await db.insert(inviteList)
      .values(normalizedEntry)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
