import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { handleVoiceInterview } from "./voice-interview";
import { generateResumeToken, hashToken, getTokenExpiryDate, isTokenExpired } from "./resume-token";
import { 
  getBarbaraConfig, 
  updateBarbaraConfig, 
  updateAnalysisConfig, 
  updateTopicOverlapConfig, 
  updateSummarisationConfig,
  ALLOWED_MODELS,
  generateCrossInterviewAnalysis
} from "./barbara-orchestrator";
import { getInfographicService } from "./infographic-service";
import { InfographicPromptBuilder } from "./infographic-prompts";
import { 
  insertProjectSchema, 
  insertTemplateSchema, 
  insertQuestionSchema,
  insertCollectionSchema,
  insertRespondentSchema,
  insertSessionSchema,
  insertSegmentSchema,
  type ReviewRatings,
  type QuestionSummary,
  type CollectionAnalytics
} from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication first
  await setupAuth(app);
  registerAuthRoutes(app);

  // Setup WebSocket server for voice interviews
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/interview" });
  
  wss.on("connection", (ws, req) => {
    console.log("[WebSocket] New connection on /ws/interview");
    handleVoiceInterview(ws, req);
  });

  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error);
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Analytics
  app.get("/api/analytics", isAuthenticated, async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const collectionId = req.query.collectionId as string | undefined;
      
      const analytics = await storage.getAnalytics({ projectId, collectionId });
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Collection Analytics - Get analytics for a specific collection
  app.get("/api/collections/:collectionId/analytics", isAuthenticated, async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const sessions = await storage.getSessionsByCollection(req.params.collectionId);
      const completedSessions = sessions.filter(s => s.status === "completed");
      
      const isStale = !collection.lastAnalyzedAt || 
        completedSessions.length !== collection.analyzedSessionCount;
      
      res.json({
        analytics: collection.analyticsData as CollectionAnalytics | null,
        lastAnalyzedAt: collection.lastAnalyzedAt,
        analyzedSessionCount: collection.analyzedSessionCount || 0,
        currentSessionCount: completedSessions.length,
        isStale,
      });
    } catch (error) {
      console.error("Error fetching collection analytics:", error);
      res.status(500).json({ message: "Failed to fetch collection analytics" });
    }
  });

  // Collection Analytics - Trigger cross-interview analysis
  app.post("/api/collections/:collectionId/analytics/refresh", isAuthenticated, async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const template = await storage.getTemplate(collection.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const questions = await storage.getQuestionsByTemplate(template.id);
      const sessions = await storage.getSessionsByCollection(req.params.collectionId);
      const completedSessions = sessions.filter(s => s.status === "completed");

      if (completedSessions.length === 0) {
        return res.status(400).json({ message: "No completed sessions to analyze" });
      }

      const sessionsWithSummaries = completedSessions.map(s => {
        // Calculate duration from timestamps if totalDurationMs is not set
        let durationMs = s.totalDurationMs || 0;
        if (durationMs === 0 && s.startedAt && s.completedAt) {
          const startTime = new Date(s.startedAt).getTime();
          const endTime = new Date(s.completedAt).getTime();
          durationMs = endTime - startTime;
        }
        return {
          sessionId: s.id,
          questionSummaries: (s.questionSummaries as QuestionSummary[]) || [],
          durationMs,
        };
      });

      console.log("[Analytics] Starting analysis for collection:", req.params.collectionId);
      console.log("[Analytics] Sessions to analyze:", completedSessions.length);
      console.log("[Analytics] Total summaries:", sessionsWithSummaries.reduce((sum, s) => sum + s.questionSummaries.length, 0));

      const project = await storage.getProject(template.projectId);
      const analysisResult = await generateCrossInterviewAnalysis({
        sessions: sessionsWithSummaries,
        templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
        templateObjective: project?.objective || "",
      });

      const analyticsData: CollectionAnalytics = {
        ...analysisResult,
        generatedAt: Date.now(),
      };

      await storage.updateCollection(req.params.collectionId, {
        lastAnalyzedAt: new Date(),
        analyzedSessionCount: completedSessions.length,
        analyticsData,
      } as any);

      res.json({
        analytics: analyticsData,
        lastAnalyzedAt: new Date(),
        analyzedSessionCount: completedSessions.length,
        currentSessionCount: completedSessions.length,
        isStale: false,
      });
    } catch (error) {
      console.error("Error generating collection analytics:", error);
      res.status(500).json({ message: "Failed to generate collection analytics" });
    }
  });

  // Serve static infographics
  app.use('/infographics', express.static(path.join(__dirname, '../generated-infographics')));

  // Generate collection summary infographic
  app.post("/api/collections/:collectionId/infographic/summary", isAuthenticated, async (req, res) => {
    try {
      const { collectionId } = req.params;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      if (!collection.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh analytics first." });
      }

      const analytics = collection.analyticsData as CollectionAnalytics;
      const prompt = InfographicPromptBuilder.buildCollectionSummary(
        collection.name,
        analytics
      );

      console.log("[Infographic] Generating summary for collection:", collectionId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  // Generate theme network infographic
  app.post("/api/collections/:collectionId/infographic/themes", isAuthenticated, async (req, res) => {
    try {
      const { collectionId } = req.params;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      if (!collection.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh analytics first." });
      }

      const analytics = collection.analyticsData as CollectionAnalytics;
      const prompt = InfographicPromptBuilder.buildThemeNetwork(
        collection.name,
        analytics.themes
      );

      console.log("[Infographic] Generating theme network for collection:", collectionId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  // Generate key findings infographic
  app.post("/api/collections/:collectionId/infographic/findings", isAuthenticated, async (req, res) => {
    try {
      const { collectionId } = req.params;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      if (!collection.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh analytics first." });
      }

      const analytics = collection.analyticsData as CollectionAnalytics;
      const prompt = InfographicPromptBuilder.buildKeyFindings(
        collection.name,
        analytics
      );

      console.log("[Infographic] Generating key findings for collection:", collectionId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  // Projects
  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getProjectsByUser(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  const createProjectSchema = insertProjectSchema.omit({ workspaceId: true }).extend({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    objective: z.string().max(1000).optional(),
    avoidRules: z.array(z.string()).optional(),
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = createProjectSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      // Ensure user has a workspace
      let workspaces = await storage.getWorkspacesByOwner(userId);
      if (workspaces.length === 0) {
        const workspace = await storage.createWorkspace({
          name: "My Workspace",
          ownerId: userId,
        });
        workspaces = [workspace];
      }

      const project = await storage.createProject({
        ...parseResult.data,
        workspaceId: workspaces[0].id,
      });
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const partialSchema = createProjectSchema.partial();
      const parseResult = partialSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const project = await storage.updateProject(req.params.id, parseResult.data);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  // Templates
  app.get("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.get("/api/projects/:projectId/templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getTemplatesByProject(req.params.projectId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  const createTemplateWithQuestionsSchema = insertTemplateSchema.omit({ projectId: true }).extend({
    name: z.string().min(1).max(100),
    questions: z.array(z.object({
      questionText: z.string().min(1),
      questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
      guidance: z.string().optional(),
      scaleMin: z.number().optional(),
      scaleMax: z.number().optional(),
      multiSelectOptions: z.array(z.string()).optional(),
      timeHintSeconds: z.number().optional(),
      isRequired: z.boolean().default(true),
    })).optional(),
  });

  app.post("/api/projects/:projectId/templates", isAuthenticated, async (req, res) => {
    try {
      const parseResult = createTemplateWithQuestionsSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { questions: questionData, ...templateData } = parseResult.data;
      
      const template = await storage.createTemplate({
        ...templateData,
        projectId: req.params.projectId,
      });

      if (questionData && questionData.length > 0) {
        const questionsToCreate = questionData.map((q, index) => ({
          ...q,
          templateId: template.id,
          orderIndex: index,
        }));
        await storage.createQuestions(questionsToCreate);
      }

      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.get("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      const questions = await storage.getQuestionsByTemplate(template.id);
      res.json({ ...template, questions });
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  const updateTemplateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    objective: z.string().max(1000).optional(),
    tone: z.string().optional(),
    constraints: z.string().optional(),
    questions: z.array(z.object({
      questionText: z.string().min(1),
      questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
      guidance: z.string().optional(),
      scaleMin: z.number().optional(),
      scaleMax: z.number().optional(),
      multiSelectOptions: z.array(z.string()).optional(),
      timeHintSeconds: z.number().optional(),
      isRequired: z.boolean().default(true),
    })).optional(),
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const parseResult = updateTemplateSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const { questions: questionData, ...templateData } = parseResult.data;

      const updatedTemplate = await storage.updateTemplate(req.params.id, templateData);

      if (questionData) {
        await storage.deleteQuestionsByTemplate(req.params.id);
        if (questionData.length > 0) {
          const questionsToCreate = questionData.map((q, index) => ({
            ...q,
            templateId: req.params.id,
            orderIndex: index,
          }));
          await storage.createQuestions(questionsToCreate);
        }
      }

      const questions = await storage.getQuestionsByTemplate(req.params.id);
      res.json({ ...updatedTemplate, questions });
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Collections
  app.get("/api/collections", isAuthenticated, async (req, res) => {
    try {
      const collections = await storage.getAllCollections();
      
      // Add stats to each collection
      const collectionsWithStats = await Promise.all(
        collections.map(async (collection) => {
          const sessions = await storage.getSessionsByCollection(collection.id);
          return {
            ...collection,
            totalSessions: sessions.length,
            completedSessions: sessions.filter(s => s.status === "completed").length,
          };
        })
      );
      
      res.json(collectionsWithStats);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  app.get("/api/projects/:projectId/collections", isAuthenticated, async (req, res) => {
    try {
      const collections = await storage.getCollectionsByProject(req.params.projectId);
      res.json(collections);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  app.get("/api/collections/:id", async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      // Get template and project info
      const template = await storage.getTemplate(collection.templateId);
      let project = null;
      if (template) {
        project = await storage.getProject(template.projectId);
      }
      
      res.json({ ...collection, template, project });
    } catch (error) {
      console.error("Error fetching collection:", error);
      res.status(500).json({ message: "Failed to fetch collection" });
    }
  });

  const createCollectionSchema = insertCollectionSchema.omit({ templateId: true }).extend({
    name: z.string().min(1).max(100),
    targetResponses: z.number().min(1).optional(),
  });

  app.post("/api/templates/:templateId/collections", isAuthenticated, async (req, res) => {
    try {
      const parseResult = createCollectionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const collection = await storage.createCollection({
        ...parseResult.data,
        templateId: req.params.templateId,
      });
      res.status(201).json(collection);
    } catch (error) {
      console.error("Error creating collection:", error);
      res.status(500).json({ message: "Failed to create collection" });
    }
  });

  // Sessions
  app.get("/api/sessions", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const sessions = await storage.getAllSessions(limit);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", isAuthenticated, async (req, res) => {
    try {
      const session = await storage.getSessionWithSegments(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Public route for interview access (respondents don't need auth)
  app.get("/api/interview/:sessionId", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const collection = await storage.getCollection(session.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      const template = await storage.getTemplate(collection.templateId);
      const questions = await storage.getQuestionsByTemplate(collection.templateId);
      
      res.json({
        session,
        collection,
        template,
        questions,
      });
    } catch (error) {
      console.error("Error fetching interview:", error);
      res.status(500).json({ message: "Failed to fetch interview" });
    }
  });

  // Resume session by token (for returning respondents)
  app.get("/api/interview/resume/:token", async (req, res) => {
    try {
      const tokenHash = hashToken(req.params.token);
      const session = await storage.getSessionByResumeToken(tokenHash);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found or token invalid" });
      }
      
      if (isTokenExpired(session.resumeTokenExpiresAt)) {
        return res.status(410).json({ message: "Resume token has expired" });
      }
      
      // Only allow resuming paused or in_progress sessions
      if (!["paused", "in_progress", "consent_given"].includes(session.status)) {
        return res.status(400).json({ 
          message: "Session cannot be resumed", 
          status: session.status 
        });
      }
      
      const collection = await storage.getCollection(session.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      const template = await storage.getTemplate(collection.templateId);
      const questions = await storage.getQuestionsByTemplate(collection.templateId);
      
      res.json({
        session,
        collection,
        template,
        questions,
        isResume: true,
      });
    } catch (error) {
      console.error("Error resuming interview:", error);
      res.status(500).json({ message: "Failed to resume interview" });
    }
  });

  app.get("/api/sessions/:sessionId/questions", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const collection = await storage.getCollection(session.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      const questions = await storage.getQuestionsByTemplate(collection.templateId);
      res.json(questions);
    } catch (error) {
      console.error("Error fetching session questions:", error);
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  // GET /api/collections/:collectionId/sessions - Get sessions for a collection
  app.get("/api/collections/:collectionId/sessions", isAuthenticated, async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const sessions = await storage.getSessionsByCollection(req.params.collectionId);
      
      // Enrich sessions with respondent info
      const sessionsWithRespondents = await Promise.all(
        sessions.map(async (session) => {
          const respondent = await storage.getRespondent(session.respondentId);
          return {
            ...session,
            respondent: respondent ? {
              fullName: respondent.fullName,
              informalName: respondent.informalName,
            } : undefined,
          };
        })
      );
      
      res.json(sessionsWithRespondents);
    } catch (error) {
      console.error("Error fetching collection sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // PATCH /api/respondents/:respondentId/names - Update respondent names (public route for respondents)
  const updateRespondentNamesSchema = z.object({
    fullName: z.string().max(200).nullable().optional(),
    informalName: z.string().max(100).nullable().optional(),
  });

  app.patch("/api/respondents/:respondentId/names", async (req, res) => {
    try {
      const parseResult = updateRespondentNamesSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const respondent = await storage.updateRespondent(req.params.respondentId, {
        fullName: parseResult.data.fullName ?? undefined,
        informalName: parseResult.data.informalName ?? undefined,
      });

      if (!respondent) {
        return res.status(404).json({ message: "Respondent not found" });
      }

      res.json(respondent);
    } catch (error) {
      console.error("Error updating respondent names:", error);
      res.status(500).json({ message: "Failed to update names" });
    }
  });

  const startSessionSchema = z.object({
    consents: z.object({
      participation: z.boolean(),
      audioRecording: z.boolean().optional(),
      dataProcessing: z.boolean(),
    }).optional(),
  });

  // Public route for respondents to start sessions (no auth required)
  app.post("/api/collections/:collectionId/sessions", async (req: any, res) => {
    try {
      const parseResult = startSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      if (!collection.isActive) {
        return res.status(400).json({ message: "This collection is no longer accepting responses" });
      }

      // Check if user is authenticated (optional)
      const userId = req.user?.claims?.sub || null;
      
      // Check for existing respondent by userId if authenticated
      let respondent;
      if (userId) {
        const existingRespondent = await storage.getRespondentByUserId(req.params.collectionId, userId);
        if (existingRespondent) {
          respondent = existingRespondent;
          // Update consent timestamp
          await storage.updateRespondent(respondent.id, {
            consentGivenAt: new Date(),
          });
        } else {
          respondent = await storage.createRespondent({
            collectionId: req.params.collectionId,
            userId,
          });
          await storage.updateRespondent(respondent.id, {
            consentGivenAt: new Date(),
          });
        }
      } else {
        // Anonymous respondent - create new each time
        respondent = await storage.createRespondent({
          collectionId: req.params.collectionId,
        });
        await storage.updateRespondent(respondent.id, {
          consentGivenAt: new Date(),
        });
      }

      const session = await storage.createSession({
        collectionId: req.params.collectionId,
        respondentId: respondent.id,
        status: "consent_given",
      });
      
      // Generate resume token for browser recovery
      const resumeToken = generateResumeToken();
      const tokenHash = hashToken(resumeToken);
      const expiresAt = getTokenExpiryDate();
      await storage.setResumeToken(session.id, tokenHash, expiresAt);
      
      // Update with started timestamp
      const updatedSession = await storage.updateSession(session.id, {
        startedAt: new Date(),
      });

      res.status(201).json({ ...updatedSession, resumeToken });
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  const updateSessionSchema = z.object({
    status: z.enum(["pending", "consent_given", "in_progress", "paused", "completed", "abandoned"]).optional(),
    currentQuestionIndex: z.number().optional(),
    totalDurationMs: z.number().optional(),
    satisfactionRating: z.number().min(1).max(5).optional(),
    closingComments: z.string().optional(),
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const parseResult = updateSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const updateData: any = { ...parseResult.data };
      
      // Set timestamps based on status changes
      if (updateData.status === "completed") {
        updateData.completedAt = new Date();
      } else if (updateData.status === "paused") {
        updateData.pausedAt = new Date();
      } else if (updateData.status === "in_progress") {
        updateData.pausedAt = null;
      }
      
      const session = await storage.updateSession(req.params.id, updateData);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  // Segments
  const createSegmentSchema = insertSegmentSchema.extend({
    questionId: z.string().min(1),
  });

  app.post("/api/sessions/:sessionId/segments", async (req, res) => {
    try {
      const parseResult = createSegmentSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const segment = await storage.createSegment({
        ...parseResult.data,
        sessionId: req.params.sessionId,
      });
      res.status(201).json(segment);
    } catch (error) {
      console.error("Error creating segment:", error);
      res.status(500).json({ message: "Failed to create segment" });
    }
  });

  const updateSegmentSchema = z.object({
    transcript: z.string().optional(),
    summaryBullets: z.array(z.string()).optional(),
    keyQuotes: z.any().optional(),
    extractedValues: z.any().optional(),
    confidence: z.number().min(0).max(100).optional(),
    qualityFlags: z.array(z.string()).optional(),
  });

  app.patch("/api/segments/:id", async (req, res) => {
    try {
      const parseResult = updateSegmentSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const segment = await storage.updateSegment(req.params.id, parseResult.data);
      if (!segment) {
        return res.status(404).json({ message: "Segment not found" });
      }
      res.json(segment);
    } catch (error) {
      console.error("Error updating segment:", error);
      res.status(500).json({ message: "Failed to update segment" });
    }
  });

  // Post-interview review endpoints
  const reviewRatingsSchema = z.object({
    questionClarity: z.number().min(1).max(5).nullable().optional(),
    alviaUnderstanding: z.number().min(1).max(5).nullable().optional(),
    conversationFlow: z.number().min(1).max(5).nullable().optional(),
    comfortLevel: z.number().min(1).max(5).nullable().optional(),
    technicalQuality: z.number().min(1).max(5).nullable().optional(),
    overallExperience: z.number().min(1).max(5).nullable().optional(),
  });

  const submitReviewSchema = z.object({
    ratings: reviewRatingsSchema.optional(),
    segmentComments: z.array(z.object({
      segmentId: z.string().min(1),
      comment: z.string().max(2000),
    })).optional(),
    closingComments: z.string().max(5000).optional(),
    skipped: z.boolean().optional(),
  });

  // Helper to validate review access (authenticated user OR valid token)
  async function validateReviewAccess(sessionId: string, tokenHeader: string | undefined, req: any): Promise<{ valid: boolean; session: any; error?: string; statusCode?: number }> {
    const session = await storage.getSession(sessionId);
    if (!session) {
      return { valid: false, session: null, error: "Session not found", statusCode: 404 };
    }

    // Check if user is authenticated (staff access)
    if (req.isAuthenticated?.()) {
      return { valid: true, session };
    }

    // Check for token-based access
    if (tokenHeader) {
      const tokenHash = crypto.createHash("sha256").update(tokenHeader).digest("hex");
      if (session.reviewAccessToken === tokenHash) {
        if (session.reviewAccessExpiresAt && new Date() > session.reviewAccessExpiresAt) {
          return { valid: false, session, error: "Review window has expired", statusCode: 410 };
        }
        return { valid: true, session };
      }
    }

    // Check if review was already completed (no token needed for immediate review after interview)
    if (session.reviewCompletedAt) {
      return { valid: false, session, error: "Review already submitted", statusCode: 400 };
    }

    // Allow access for immediate review (within same session, no token required for fresh completed sessions)
    if (session.status === "completed" && !session.reviewAccessToken) {
      return { valid: true, session };
    }

    return { valid: false, session: null, error: "Unauthorized", statusCode: 401 };
  }

  // GET /api/sessions/:id/review - Fetch review data (requires auth or valid token)
  app.get("/api/sessions/:id/review", async (req, res) => {
    try {
      const tokenHeader = req.headers["x-review-token"] as string | undefined;
      const { valid, session, error, statusCode } = await validateReviewAccess(req.params.id, tokenHeader, req);
      
      if (!valid) {
        return res.status(statusCode || 401).json({ message: error });
      }

      if (session.status !== "completed") {
        return res.status(400).json({ message: "Session not completed" });
      }

      // Fetch full session
      const fullSession = await storage.getSession(req.params.id);
      if (!fullSession) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Get the collection to find template and questions
      const collection = await storage.getCollection(fullSession.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Get questions for this template
      const questions = await storage.getQuestionsByTemplate(collection.templateId);
      
      // Build per-question data from session's stored transcript and summaries
      const liveTranscript = (fullSession.liveTranscript || []) as Array<{ speaker: string; text: string; timestamp: number; questionIndex: number }>;
      const questionSummaries = (fullSession.questionSummaries || []) as Array<{ questionIndex: number; respondentSummary: string; keyInsights: string[] }>;

      // Group transcript entries by question index
      const transcriptByQuestion = new Map<number, string>();
      for (const entry of liveTranscript) {
        const existing = transcriptByQuestion.get(entry.questionIndex) || "";
        const speaker = entry.speaker === "alvia" ? "Alvia" : "You";
        transcriptByQuestion.set(entry.questionIndex, existing + `${speaker}: ${entry.text}\n\n`);
      }

      // Map summaries by question index
      const summaryByQuestion = new Map<number, { respondentSummary: string; keyInsights: string[] }>();
      for (const summary of questionSummaries) {
        summaryByQuestion.set(summary.questionIndex, {
          respondentSummary: summary.respondentSummary,
          keyInsights: summary.keyInsights,
        });
      }

      // Get existing review comments
      const reviewComments = (fullSession.reviewComments || {}) as Record<string, string>;

      // Build segments from questions with their transcript and summary data
      const segments = questions.map((q, index) => {
        const summary = summaryByQuestion.get(index);
        return {
          id: `q-${index}`,
          questionId: q.id,
          transcript: transcriptByQuestion.get(index) || null,
          summaryBullets: summary?.keyInsights || null,
          respondentComment: reviewComments[String(index)] || null,
          question: {
            questionText: q.questionText,
            questionType: q.questionType,
          },
        };
      });

      // Return limited data for respondents
      const safeSession = {
        id: fullSession.id,
        status: fullSession.status,
        closingComments: fullSession.closingComments,
        reviewRatings: fullSession.reviewRatings,
        reviewCompletedAt: fullSession.reviewCompletedAt,
        segments,
      };

      res.json(safeSession);
    } catch (error) {
      console.error("Error fetching review data:", error);
      res.status(500).json({ message: "Failed to fetch review data" });
    }
  });

  // POST /api/sessions/:id/review - Submit review (requires auth or valid token)
  app.post("/api/sessions/:id/review", async (req, res) => {
    try {
      const parseResult = submitReviewSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const tokenHeader = req.headers["x-review-token"] as string | undefined;
      const { valid, session, error, statusCode } = await validateReviewAccess(req.params.id, tokenHeader, req);
      
      if (!valid) {
        return res.status(statusCode || 401).json({ message: error });
      }

      // Already completed check
      if (session.reviewCompletedAt) {
        return res.status(400).json({ message: "Review already submitted" });
      }

      const { ratings, segmentComments, closingComments, skipped } = parseResult.data;

      // Convert segment comments to reviewComments format (questionIndex -> comment)
      let reviewComments: Record<string, string> | null = null;
      if (segmentComments && !skipped) {
        reviewComments = {};
        for (const { segmentId, comment } of segmentComments) {
          // segmentId is in format "q-{index}"
          const indexStr = segmentId.replace("q-", "");
          reviewComments[indexStr] = comment;
        }
      }

      // Update session with review data - clear token after submission
      const updated = await storage.submitSessionReview(req.params.id, {
        reviewRatings: skipped ? null : (ratings as ReviewRatings),
        closingComments: skipped ? null : closingComments,
        reviewComments: skipped ? null : reviewComments,
        reviewSkipped: skipped ?? false,
        reviewCompletedAt: new Date(),
        reviewAccessToken: null,
        reviewAccessExpiresAt: null,
      });

      res.json({ success: true, session: updated });
    } catch (error) {
      console.error("Error submitting review:", error);
      res.status(500).json({ message: "Failed to submit review" });
    }
  });

  // POST /api/sessions/:id/review/generate-link - Generate return link
  app.post("/api/sessions/:id/review/generate-link", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Generate random token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      await storage.setReviewAccessToken(session.id, tokenHash, expiresAt);

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

      res.json({
        token,
        expiresAt,
        url: `${baseUrl}/review/${token}`,
      });
    } catch (error) {
      console.error("Error generating review link:", error);
      res.status(500).json({ message: "Failed to generate review link" });
    }
  });

  // GET /api/review/:token - Validate token and get session ID
  app.get("/api/review/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const session = await storage.getSessionByReviewToken(tokenHash);

      if (!session) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }

      if (session.reviewAccessExpiresAt && new Date() > session.reviewAccessExpiresAt) {
        return res.status(410).json({ message: "This review link has expired" });
      }

      res.json({ sessionId: session.id });
    } catch (error) {
      console.error("Error validating review token:", error);
      res.status(500).json({ message: "Failed to validate token" });
    }
  });

  // Barbara Configuration API
  const barbaraUseCaseConfigSchema = z.object({
    model: z.enum(ALLOWED_MODELS as unknown as [string, ...string[]]).optional(),
    verbosity: z.enum(["low", "medium", "high"]).optional(),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  });

  const barbaraConfigSchema = z.object({
    analysis: barbaraUseCaseConfigSchema.optional(),
    topicOverlap: barbaraUseCaseConfigSchema.optional(),
    summarisation: barbaraUseCaseConfigSchema.optional(),
  });

  // GET /api/barbara/config - Get current Barbara configuration
  app.get("/api/barbara/config", isAuthenticated, async (req, res) => {
    try {
      const config = getBarbaraConfig();
      res.json(config);
    } catch (error) {
      console.error("Error fetching Barbara config:", error);
      res.status(500).json({ message: "Failed to fetch Barbara configuration" });
    }
  });

  // PATCH /api/barbara/config - Update Barbara configuration (all use cases)
  app.patch("/api/barbara/config", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateBarbaraConfig(parseResult.data);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating Barbara config:", error);
      res.status(500).json({ message: "Failed to update Barbara configuration" });
    }
  });

  // PATCH /api/barbara/config/analysis - Update analysis configuration
  app.patch("/api/barbara/config/analysis", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateAnalysisConfig(parseResult.data);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating analysis config:", error);
      res.status(500).json({ message: "Failed to update analysis configuration" });
    }
  });

  // PATCH /api/barbara/config/topic-overlap - Update topic overlap configuration
  app.patch("/api/barbara/config/topic-overlap", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateTopicOverlapConfig(parseResult.data);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating topic overlap config:", error);
      res.status(500).json({ message: "Failed to update topic overlap configuration" });
    }
  });

  // PATCH /api/barbara/config/summarisation - Update summarisation configuration
  app.patch("/api/barbara/config/summarisation", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateSummarisationConfig(parseResult.data);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating summarisation config:", error);
      res.status(500).json({ message: "Failed to update summarisation configuration" });
    }
  });

  return httpServer;
}
