import { 
  workspaces, projects, interviewTemplates, questions, collections,
  respondents, interviewSessions, segments, redactionMaps, workspaceMembers,
  type Workspace, type InsertWorkspace, type Project, type InsertProject,
  type InterviewTemplate, type InsertTemplate, type Question, type InsertQuestion,
  type Collection, type InsertCollection, type Respondent, type InsertRespondent,
  type InterviewSession, type InsertSession, type Segment, type InsertSegment,
  type WorkspaceMember, type PersistedTranscriptEntry, type PersistedBarbaraGuidance,
  type PersistedQuestionState
} from "@shared/schema";

export interface InterviewStatePatch {
  liveTranscript?: PersistedTranscriptEntry[];
  lastBarbaraGuidance?: PersistedBarbaraGuidance | null;
  questionStates?: PersistedQuestionState[];
  currentQuestionIndex?: number;
  status?: InterviewSession["status"];
  pausedAt?: Date | null;
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
  getAllCollections(): Promise<Collection[]>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: string, collection: Partial<InsertCollection>): Promise<Collection | undefined>;
  
  // Respondents
  getRespondent(id: string): Promise<Respondent | undefined>;
  getRespondentByEmail(collectionId: string, email: string): Promise<Respondent | undefined>;
  getRespondentByUserId(collectionId: string, userId: string): Promise<Respondent | undefined>;
  getRespondentsByCollection(collectionId: string): Promise<Respondent[]>;
  createRespondent(respondent: InsertRespondent): Promise<Respondent>;
  updateRespondent(id: string, respondent: Partial<InsertRespondent> & { consentGivenAt?: Date }): Promise<Respondent | undefined>;
  
  // Sessions
  getSession(id: string): Promise<InterviewSession | undefined>;
  getSessionWithSegments(id: string): Promise<(InterviewSession & { segments: (Segment & { question: Question })[] }) | undefined>;
  getSessionsByCollection(collectionId: string): Promise<InterviewSession[]>;
  getSessionsByRespondent(respondentId: string): Promise<InterviewSession[]>;
  getAllSessions(limit?: number): Promise<InterviewSession[]>;
  createSession(session: InsertSession): Promise<InterviewSession>;
  updateSession(id: string, session: Partial<InterviewSession>): Promise<InterviewSession | undefined>;
  persistInterviewState(id: string, patch: InterviewStatePatch): Promise<InterviewSession | undefined>;
  
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
  getAnalytics(): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageDuration: number;
    completionRate: number;
    topThemes: { theme: string; count: number }[];
    questionStats: { questionText: string; avgConfidence: number; responseCount: number }[];
  }>;
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

  async getRespondentsByCollection(collectionId: string): Promise<Respondent[]> {
    return await db.select().from(respondents).where(eq(respondents.collectionId, collectionId));
  }

  async createRespondent(respondent: InsertRespondent): Promise<Respondent> {
    const [created] = await db.insert(respondents).values(respondent).returning();
    return created;
  }

  async updateRespondent(id: string, respondent: Partial<InsertRespondent> & { consentGivenAt?: Date }): Promise<Respondent | undefined> {
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
    if (patch.currentQuestionIndex !== undefined) {
      updateData.currentQuestionIndex = patch.currentQuestionIndex;
    }
    if (patch.status !== undefined) {
      updateData.status = patch.status;
    }
    if (patch.pausedAt !== undefined) {
      updateData.pausedAt = patch.pausedAt;
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

  async getAnalytics(): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageDuration: number;
    completionRate: number;
    topThemes: { theme: string; count: number }[];
    questionStats: { questionText: string; avgConfidence: number; responseCount: number }[];
  }> {
    const allSessions = await this.getAllSessions();
    const totalSessions = allSessions.length;
    const completedSessions = allSessions.filter(s => s.status === "completed").length;
    
    const durations = allSessions
      .filter(s => s.totalDurationMs && s.totalDurationMs > 0)
      .map(s => s.totalDurationMs!);
    const averageDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length / 60000 
      : 0;
    
    const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

    return {
      totalSessions,
      completedSessions,
      averageDuration,
      completionRate,
      topThemes: [],
      questionStats: [],
    };
  }
}

export const storage = new DatabaseStorage();
