import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { 
  insertProjectSchema, 
  insertTemplateSchema, 
  insertQuestionSchema,
  insertCollectionSchema,
  insertRespondentSchema,
  insertSessionSchema,
  insertSegmentSchema
} from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication first
  await setupAuth(app);
  registerAuthRoutes(app);

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
      const analytics = await storage.getAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
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

  const createProjectSchema = insertProjectSchema.extend({
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
  app.get("/api/projects/:projectId/templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getTemplatesByProject(req.params.projectId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  const createTemplateWithQuestionsSchema = insertTemplateSchema.extend({
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

  const createCollectionSchema = insertCollectionSchema.extend({
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
      
      // Update with started timestamp
      const updatedSession = await storage.updateSession(session.id, {
        startedAt: new Date(),
      });

      res.status(201).json(updatedSession);
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

  return httpServer;
}
