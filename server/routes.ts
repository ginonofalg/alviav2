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
  updateTemplateAnalyticsConfig,
  updateProjectAnalyticsConfig,
  ALLOWED_MODELS,
  generateCrossInterviewAnalysis,
  generateTemplateAnalytics,
  generateProjectAnalytics,
  generateTemplateFromProject,
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
  type CollectionAnalytics,
  type TemplateAnalytics,
  type ProjectAnalytics,
} from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// Feature flag for additional questions
const ADDITIONAL_QUESTIONS_ENABLED = process.env.ADDITIONAL_QUESTIONS_ENABLED !== "false";

const __filename = import.meta.url ? fileURLToPath(import.meta.url) : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

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

  // Enhanced dashboard stats with more insights
  app.get("/api/dashboard/enhanced-stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getEnhancedDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching enhanced dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch enhanced stats" });
    }
  });

  // Analytics - legacy basic stats endpoint (requires projectId or collectionId for scoping)
  app.get("/api/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = req.query.projectId as string | undefined;
      const collectionId = req.query.collectionId as string | undefined;
      
      // Require at least one scope parameter to prevent cross-tenant data exposure
      if (!projectId && !collectionId) {
        return res.status(400).json({ message: "Either projectId or collectionId is required" });
      }
      
      // Verify ownership of the requested scope
      if (projectId) {
        const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      if (collectionId) {
        const hasAccess = await storage.verifyUserAccessToCollection(userId, collectionId);
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      const analytics = await storage.getAnalytics({ projectId, collectionId });
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Aggregated Analytics - command center with insights across all projects
  app.get("/api/analytics/aggregated", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const aggregated = await storage.getAggregatedAnalytics(userId);
      res.json(aggregated);
    } catch (error) {
      console.error("Error fetching aggregated analytics:", error);
      res.status(500).json({ message: "Failed to fetch aggregated analytics" });
    }
  });

  // Collection Analytics - Get analytics for a specific collection
  app.get("/api/collections/:collectionId/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
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
  app.post("/api/collections/:collectionId/analytics/refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
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

  // Template Analytics
  app.get("/api/templates/:templateId/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const collections = await storage.getCollectionsByTemplate(template.id);
      const collectionsWithAnalytics = collections.filter(c => c.analyticsData !== null);

      // Check staleness: any collection refreshed after template's lastAnalyzedAt
      const isStale = template.lastAnalyzedAt 
        ? collections.some(c => {
            const collectionAnalyzedAt = c.lastAnalyzedAt;
            return collectionAnalyzedAt && collectionAnalyzedAt > template.lastAnalyzedAt!;
          })
        : collectionsWithAnalytics.length > 0;

      res.json({
        analytics: template.analyticsData as TemplateAnalytics | null,
        lastAnalyzedAt: template.lastAnalyzedAt,
        analyzedCollectionCount: template.analyzedCollectionCount || 0,
        currentCollectionCount: collectionsWithAnalytics.length,
        totalCollectionCount: collections.length,
        isStale,
        missingAnalytics: collections.filter(c => c.analyticsData === null).length,
      });
    } catch (error) {
      console.error("Error fetching template analytics:", error);
      res.status(500).json({ message: "Failed to fetch template analytics" });
    }
  });

  app.post("/api/templates/:templateId/analytics/refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const questions = await storage.getQuestionsByTemplate(template.id);
      const collections = await storage.getCollectionsByTemplate(template.id);

      // Get session counts and analytics for each collection
      const collectionsData = await Promise.all(
        collections.map(async (collection) => {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = sessions.filter(s => s.status === "completed");
          return {
            collection,
            analytics: collection.analyticsData as CollectionAnalytics | null,
            sessionCount: completedSessions.length,
          };
        })
      );

      const collectionsWithAnalytics = collectionsData.filter(c => c.analytics !== null);

      if (collectionsWithAnalytics.length === 0) {
        return res.status(400).json({ 
          message: "No collections with analytics available. Please refresh analytics for at least one collection first.",
          missingAnalytics: collections.length,
        });
      }

      console.log("[Template Analytics] Generating for template:", template.name);
      console.log("[Template Analytics] Collections with analytics:", collectionsWithAnalytics.length);

      const analysisResult = await generateTemplateAnalytics({
        collections: collectionsData,
        templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
        templateName: template.name,
      });

      const analyticsData: TemplateAnalytics = {
        ...analysisResult,
        generatedAt: Date.now(),
      };

      await storage.updateTemplate(template.id, {
        lastAnalyzedAt: new Date(),
        analyzedCollectionCount: collectionsWithAnalytics.length,
        analyticsData,
      } as any);

      res.json({
        analytics: analyticsData,
        lastAnalyzedAt: new Date(),
        analyzedCollectionCount: collectionsWithAnalytics.length,
        currentCollectionCount: collectionsWithAnalytics.length,
        totalCollectionCount: collections.length,
        isStale: false,
        missingAnalytics: collections.length - collectionsWithAnalytics.length,
      });
    } catch (error) {
      console.error("Error generating template analytics:", error);
      res.status(500).json({ message: "Failed to generate template analytics" });
    }
  });

  // Project Analytics
  app.get("/api/projects/:projectId/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const templates = await storage.getTemplatesByProject(project.id);
      const templatesWithAnalytics = templates.filter(t => t.analyticsData !== null);

      // Check staleness: any template refreshed after project's lastAnalyzedAt
      const isStale = project.lastAnalyzedAt 
        ? templates.some(t => {
            const templateAnalyzedAt = t.lastAnalyzedAt;
            return templateAnalyzedAt && templateAnalyzedAt > project.lastAnalyzedAt!;
          })
        : templatesWithAnalytics.length > 0;

      res.json({
        analytics: project.analyticsData as ProjectAnalytics | null,
        lastAnalyzedAt: project.lastAnalyzedAt,
        analyzedTemplateCount: project.analyzedTemplateCount || 0,
        currentTemplateCount: templatesWithAnalytics.length,
        totalTemplateCount: templates.length,
        isStale,
        missingAnalytics: templates.filter(t => t.analyticsData === null).length,
      });
    } catch (error) {
      console.error("Error fetching project analytics:", error);
      res.status(500).json({ message: "Failed to fetch project analytics" });
    }
  });

  app.post("/api/projects/:projectId/analytics/refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const templates = await storage.getTemplatesByProject(project.id);

      // Get collection counts, session totals, and questions for each template
      const templatesData = await Promise.all(
        templates.map(async (template) => {
          const collections = await storage.getCollectionsByTemplate(template.id);
          const questions = await storage.getQuestionsByTemplate(template.id);
          let totalSessions = 0;
          for (const collection of collections) {
            const sessions = await storage.getSessionsByCollection(collection.id);
            totalSessions += sessions.filter(s => s.status === "completed").length;
          }
          return {
            template,
            questions,
            analytics: template.analyticsData as TemplateAnalytics | null,
            collectionCount: collections.length,
            totalSessions,
          };
        })
      );

      const templatesWithAnalytics = templatesData.filter(t => t.analytics !== null);

      if (templatesWithAnalytics.length === 0) {
        return res.status(400).json({ 
          message: "No templates with analytics available. Please refresh analytics for at least one template first.",
          missingAnalytics: templates.length,
        });
      }

      console.log("[Project Analytics] Generating for project:", project.name);
      console.log("[Project Analytics] Templates with analytics:", templatesWithAnalytics.length);

      const analysisResult = await generateProjectAnalytics({
        templates: templatesData,
        projectName: project.name,
        projectObjective: project.objective || "",
        strategicContext: project.strategicContext || undefined,
        contextType: project.contextType || undefined,
      });

      const analyticsData: ProjectAnalytics = {
        ...analysisResult,
        generatedAt: Date.now(),
      };

      await storage.updateProject(project.id, {
        lastAnalyzedAt: new Date(),
        analyzedTemplateCount: templatesWithAnalytics.length,
        analyticsData,
      } as any);

      res.json({
        analytics: analyticsData,
        lastAnalyzedAt: new Date(),
        analyzedTemplateCount: templatesWithAnalytics.length,
        currentTemplateCount: templatesWithAnalytics.length,
        totalTemplateCount: templates.length,
        isStale: false,
        missingAnalytics: templates.length - templatesWithAnalytics.length,
      });
    } catch (error) {
      console.error("Error generating project analytics:", error);
      res.status(500).json({ message: "Failed to generate project analytics" });
    }
  });

  // Project Analytics - Check dependencies (what needs refreshing)
  app.get("/api/projects/:projectId/analytics/dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const templates = await storage.getTemplatesByProject(project.id);
      
      const templatesData = await Promise.all(
        templates.map(async (template) => {
          const collections = await storage.getCollectionsByTemplate(template.id);
          
          const collectionsData = await Promise.all(
            collections.map(async (collection) => {
              const sessions = await storage.getSessionsByCollection(collection.id);
              const completedSessions = sessions.filter(s => s.status === "completed");
              
              const isStale = !collection.lastAnalyzedAt || 
                completedSessions.length !== collection.analyzedSessionCount;
              const hasData = completedSessions.length > 0;
              
              return {
                id: collection.id,
                name: collection.name,
                isStale: isStale && hasData,
                hasData,
                lastAnalyzedAt: collection.lastAnalyzedAt,
                totalSessions: completedSessions.length,
                analyzedSessions: collection.analyzedSessionCount || 0,
                newSessions: Math.max(0, completedSessions.length - (collection.analyzedSessionCount || 0)),
              };
            })
          );

          const collectionsWithAnalytics = collections.filter(c => c.analyticsData !== null);
          const templateIsStale = template.lastAnalyzedAt 
            ? collections.some(c => c.lastAnalyzedAt && c.lastAnalyzedAt > template.lastAnalyzedAt!)
            : collectionsWithAnalytics.length > 0;
          const hasRefreshableCollections = collectionsData.some(c => c.hasData);

          return {
            id: template.id,
            name: template.name,
            isStale: templateIsStale && hasRefreshableCollections,
            hasData: collectionsWithAnalytics.length > 0 || hasRefreshableCollections,
            lastAnalyzedAt: template.lastAnalyzedAt,
            collections: collectionsData.filter(c => c.hasData),
            staleCollectionCount: collectionsData.filter(c => c.isStale).length,
          };
        })
      );

      const staleCollections = templatesData.flatMap(t => t.collections.filter(c => c.isStale));
      const staleTemplates = templatesData.filter(t => t.isStale || t.staleCollectionCount > 0);

      const templatesWithAnalytics = templates.filter(t => t.analyticsData !== null);
      const projectIsStale = project.lastAnalyzedAt 
        ? templates.some(t => t.lastAnalyzedAt && t.lastAnalyzedAt > project.lastAnalyzedAt!)
        : templatesWithAnalytics.length > 0;

      res.json({
        projectId: project.id,
        projectName: project.name,
        projectStale: projectIsStale,
        templates: templatesData.filter(t => t.hasData),
        summary: {
          staleCollections: staleCollections.length,
          staleTemplates: staleTemplates.length,
          totalRefreshesNeeded: staleCollections.length + staleTemplates.length + (projectIsStale ? 1 : 0),
          hasAnyStale: staleCollections.length > 0 || staleTemplates.length > 0 || projectIsStale,
        },
      });
    } catch (error) {
      console.error("Error fetching project analytics dependencies:", error);
      res.status(500).json({ message: "Failed to fetch analytics dependencies" });
    }
  });

  // Project Analytics - Cascade refresh (refresh all stale dependencies then project)
  app.post("/api/projects/:projectId/analytics/cascade-refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const results = {
        collectionsRefreshed: 0,
        templatesRefreshed: 0,
        projectRefreshed: false,
        errors: [] as Array<{ level: string; id: string; name: string; error: string }>,
      };

      const templates = await storage.getTemplatesByProject(project.id);
      
      // Step 1: Refresh all stale collections
      for (const template of templates) {
        const collections = await storage.getCollectionsByTemplate(template.id);
        const questions = await storage.getQuestionsByTemplate(template.id);
        
        for (const collection of collections) {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = sessions.filter(s => s.status === "completed");
          
          if (completedSessions.length === 0) continue;
          
          const isStale = !collection.lastAnalyzedAt || 
            completedSessions.length !== collection.analyzedSessionCount;
          
          if (isStale) {
            try {
              console.log("[Cascade Refresh] Refreshing collection:", collection.name);
              
              const sessionsWithSummaries = completedSessions.map(s => {
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

              const analysisResult = await generateCrossInterviewAnalysis({
                sessions: sessionsWithSummaries,
                templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
                templateObjective: project.objective || "",
              });

              const analyticsData: CollectionAnalytics = {
                ...analysisResult,
                generatedAt: Date.now(),
              };

              await storage.updateCollection(collection.id, {
                lastAnalyzedAt: new Date(),
                analyzedSessionCount: completedSessions.length,
                analyticsData,
              } as any);

              results.collectionsRefreshed++;
            } catch (error: any) {
              console.error("[Cascade Refresh] Collection error:", collection.name, error);
              results.errors.push({
                level: "collection",
                id: collection.id,
                name: collection.name,
                error: error.message || "Unknown error",
              });
            }
          }
        }
      }

      // Step 2: Refresh all templates (they are now stale because collections were refreshed)
      for (const template of templates) {
        const collections = await storage.getCollectionsByTemplate(template.id);
        const questions = await storage.getQuestionsByTemplate(template.id);
        
        const collectionsData = await Promise.all(
          collections.map(async (collection) => {
            const freshCollection = await storage.getCollection(collection.id);
            const sessions = await storage.getSessionsByCollection(collection.id);
            const completedSessions = sessions.filter(s => s.status === "completed");
            return {
              collection: freshCollection!,
              analytics: freshCollection?.analyticsData as CollectionAnalytics | null,
              sessionCount: completedSessions.length,
            };
          })
        );

        const collectionsWithAnalytics = collectionsData.filter(c => c.analytics !== null);
        
        if (collectionsWithAnalytics.length === 0) continue;

        try {
          console.log("[Cascade Refresh] Refreshing template:", template.name);
          
          const analysisResult = await generateTemplateAnalytics({
            collections: collectionsData,
            templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
            templateName: template.name,
          });

          const analyticsData: TemplateAnalytics = {
            ...analysisResult,
            generatedAt: Date.now(),
          };

          await storage.updateTemplate(template.id, {
            lastAnalyzedAt: new Date(),
            analyzedCollectionCount: collectionsWithAnalytics.length,
            analyticsData,
          } as any);

          results.templatesRefreshed++;
        } catch (error: any) {
          console.error("[Cascade Refresh] Template error:", template.name, error);
          results.errors.push({
            level: "template",
            id: template.id,
            name: template.name,
            error: error.message || "Unknown error",
          });
        }
      }

      // Step 3: Refresh project analytics
      const freshTemplates = await storage.getTemplatesByProject(project.id);
      const templatesData = await Promise.all(
        freshTemplates.map(async (template) => {
          const collections = await storage.getCollectionsByTemplate(template.id);
          const questions = await storage.getQuestionsByTemplate(template.id);
          let totalSessions = 0;
          for (const collection of collections) {
            const sessions = await storage.getSessionsByCollection(collection.id);
            totalSessions += sessions.filter(s => s.status === "completed").length;
          }
          return {
            template,
            questions,
            analytics: template.analyticsData as TemplateAnalytics | null,
            collectionCount: collections.length,
            totalSessions,
          };
        })
      );

      const templatesWithAnalytics = templatesData.filter(t => t.analytics !== null);

      if (templatesWithAnalytics.length > 0) {
        try {
          console.log("[Cascade Refresh] Refreshing project:", project.name);
          
          const analysisResult = await generateProjectAnalytics({
            templates: templatesData,
            projectName: project.name,
            projectObjective: project.objective || "",
            strategicContext: project.strategicContext || undefined,
            contextType: project.contextType || undefined,
          });

          const projectAnalyticsData: ProjectAnalytics = {
            ...analysisResult,
            generatedAt: Date.now(),
          };

          await storage.updateProject(project.id, {
            lastAnalyzedAt: new Date(),
            analyzedTemplateCount: templatesWithAnalytics.length,
            analyticsData: projectAnalyticsData,
          } as any);

          results.projectRefreshed = true;
        } catch (error: any) {
          console.error("[Cascade Refresh] Project error:", project.name, error);
          results.errors.push({
            level: "project",
            id: project.id,
            name: project.name,
            error: error.message || "Unknown error",
          });
        }
      }

      // Return final analytics state
      const updatedProject = await storage.getProject(project.id);
      
      res.json({
        success: results.errors.length === 0,
        results,
        analytics: updatedProject?.analyticsData as ProjectAnalytics | null,
        lastAnalyzedAt: updatedProject?.lastAnalyzedAt,
        analyzedTemplateCount: updatedProject?.analyzedTemplateCount || 0,
        currentTemplateCount: templatesWithAnalytics.length,
        totalTemplateCount: templates.length,
        isStale: false,
        missingAnalytics: templates.length - templatesWithAnalytics.length,
      });
    } catch (error) {
      console.error("Error in cascade refresh:", error);
      res.status(500).json({ message: "Failed to cascade refresh analytics" });
    }
  });

  // Template Analytics - Check dependencies
  app.get("/api/templates/:templateId/analytics/dependencies", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const collections = await storage.getCollectionsByTemplate(template.id);
      
      const collectionsData = await Promise.all(
        collections.map(async (collection) => {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = sessions.filter(s => s.status === "completed");
          
          const isStale = !collection.lastAnalyzedAt || 
            completedSessions.length !== collection.analyzedSessionCount;
          const hasData = completedSessions.length > 0;
          
          return {
            id: collection.id,
            name: collection.name,
            isStale: isStale && hasData,
            hasData,
            lastAnalyzedAt: collection.lastAnalyzedAt,
            totalSessions: completedSessions.length,
            analyzedSessions: collection.analyzedSessionCount || 0,
            newSessions: Math.max(0, completedSessions.length - (collection.analyzedSessionCount || 0)),
          };
        })
      );

      const staleCollections = collectionsData.filter(c => c.isStale);
      const collectionsWithAnalytics = collections.filter(c => c.analyticsData !== null);
      
      const templateIsStale = template.lastAnalyzedAt 
        ? collections.some(c => c.lastAnalyzedAt && c.lastAnalyzedAt > template.lastAnalyzedAt!)
        : collectionsWithAnalytics.length > 0;

      res.json({
        templateId: template.id,
        templateName: template.name,
        templateStale: templateIsStale,
        collections: collectionsData.filter(c => c.hasData),
        summary: {
          staleCollections: staleCollections.length,
          totalRefreshesNeeded: staleCollections.length + (templateIsStale ? 1 : 0),
          hasAnyStale: staleCollections.length > 0 || templateIsStale,
        },
      });
    } catch (error) {
      console.error("Error fetching template analytics dependencies:", error);
      res.status(500).json({ message: "Failed to fetch analytics dependencies" });
    }
  });

  // Template Analytics - Cascade refresh
  app.post("/api/templates/:templateId/analytics/cascade-refresh", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const project = await storage.getProject(template.projectId);
      const results = {
        collectionsRefreshed: 0,
        templateRefreshed: false,
        errors: [] as Array<{ level: string; id: string; name: string; error: string }>,
      };

      const collections = await storage.getCollectionsByTemplate(template.id);
      const questions = await storage.getQuestionsByTemplate(template.id);

      // Step 1: Refresh all stale collections
      for (const collection of collections) {
        const sessions = await storage.getSessionsByCollection(collection.id);
        const completedSessions = sessions.filter(s => s.status === "completed");
        
        if (completedSessions.length === 0) continue;
        
        const isStale = !collection.lastAnalyzedAt || 
          completedSessions.length !== collection.analyzedSessionCount;
        
        if (isStale) {
          try {
            console.log("[Cascade Refresh] Refreshing collection:", collection.name);
            
            const sessionsWithSummaries = completedSessions.map(s => {
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

            const analysisResult = await generateCrossInterviewAnalysis({
              sessions: sessionsWithSummaries,
              templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
              templateObjective: project?.objective || "",
            });

            const analyticsData: CollectionAnalytics = {
              ...analysisResult,
              generatedAt: Date.now(),
            };

            await storage.updateCollection(collection.id, {
              lastAnalyzedAt: new Date(),
              analyzedSessionCount: completedSessions.length,
              analyticsData,
            } as any);

            results.collectionsRefreshed++;
          } catch (error: any) {
            console.error("[Cascade Refresh] Collection error:", collection.name, error);
            results.errors.push({
              level: "collection",
              id: collection.id,
              name: collection.name,
              error: error.message || "Unknown error",
            });
          }
        }
      }

      // Step 2: Refresh template
      const freshCollections = await storage.getCollectionsByTemplate(template.id);
      const collectionsData = await Promise.all(
        freshCollections.map(async (collection) => {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = sessions.filter(s => s.status === "completed");
          return {
            collection,
            analytics: collection.analyticsData as CollectionAnalytics | null,
            sessionCount: completedSessions.length,
          };
        })
      );

      const collectionsWithAnalytics = collectionsData.filter(c => c.analytics !== null);

      if (collectionsWithAnalytics.length > 0) {
        try {
          console.log("[Cascade Refresh] Refreshing template:", template.name);
          
          const analysisResult = await generateTemplateAnalytics({
            collections: collectionsData,
            templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
            templateName: template.name,
          });

          const templateAnalyticsData: TemplateAnalytics = {
            ...analysisResult,
            generatedAt: Date.now(),
          };

          await storage.updateTemplate(template.id, {
            lastAnalyzedAt: new Date(),
            analyzedCollectionCount: collectionsWithAnalytics.length,
            analyticsData: templateAnalyticsData,
          } as any);

          results.templateRefreshed = true;
        } catch (error: any) {
          console.error("[Cascade Refresh] Template error:", template.name, error);
          results.errors.push({
            level: "template",
            id: template.id,
            name: template.name,
            error: error.message || "Unknown error",
          });
        }
      }

      // Return final analytics state
      const updatedTemplate = await storage.getTemplate(template.id);
      
      res.json({
        success: results.errors.length === 0,
        results,
        analytics: updatedTemplate?.analyticsData as TemplateAnalytics | null,
        lastAnalyzedAt: updatedTemplate?.lastAnalyzedAt,
        analyzedCollectionCount: updatedTemplate?.analyzedCollectionCount || 0,
        currentCollectionCount: collectionsWithAnalytics.length,
        totalCollectionCount: collections.length,
        isStale: false,
        missingAnalytics: collections.length - collectionsWithAnalytics.length,
      });
    } catch (error) {
      console.error("Error in template cascade refresh:", error);
      res.status(500).json({ message: "Failed to cascade refresh analytics" });
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

  // Project-level infographic endpoints
  app.post("/api/projects/:projectId/infographic/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!project.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh project analytics first." });
      }

      const analytics = project.analyticsData as ProjectAnalytics;
      const prompt = InfographicPromptBuilder.buildProjectSummary(
        project.name,
        analytics
      );

      console.log("[Infographic] Generating project summary for:", projectId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Project summary generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/projects/:projectId/infographic/themes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!project.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh project analytics first." });
      }

      const analytics = project.analyticsData as ProjectAnalytics;
      const prompt = InfographicPromptBuilder.buildProjectThemeNetwork(
        project.name,
        analytics
      );

      console.log("[Infographic] Generating project theme network for:", projectId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Project themes generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/projects/:projectId/infographic/insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!project.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh project analytics first." });
      }

      const analytics = project.analyticsData as ProjectAnalytics;
      const prompt = InfographicPromptBuilder.buildProjectStrategicInsights(
        project.name,
        analytics
      );

      console.log("[Infographic] Generating project strategic insights for:", projectId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Project insights generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  // Projects
  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getProjectsByUser(userId);
      
      // Enrich projects with template and session counts
      const projectsWithCounts = await Promise.all(
        projects.map(async (project) => {
          const templates = await storage.getTemplatesByProject(project.id);
          let totalSessions = 0;
          
          for (const template of templates) {
            const collections = await storage.getCollectionsByTemplate(template.id);
            for (const collection of collections) {
              const sessions = await storage.getSessionsByCollection(collection.id);
              totalSessions += sessions.length;
            }
          }
          
          return {
            ...project,
            templateCount: templates.length,
            sessionCount: totalSessions
          };
        })
      );
      
      res.json(projectsWithCounts);
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
      
      // Calculate template and session counts
      const templates = await storage.getTemplatesByProject(project.id);
      let sessionCount = 0;
      for (const template of templates) {
        const collections = await storage.getCollectionsByTemplate(template.id);
        for (const collection of collections) {
          const sessions = await storage.getSessionsByCollection(collection.id);
          sessionCount += sessions.filter(s => s.status === "completed").length;
        }
      }
      
      res.json({
        ...project,
        templateCount: templates.length,
        sessionCount,
      });
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
    strategicContext: z.string().max(2000).optional(),
    contextType: z.enum(["content", "product", "marketing", "cx", "other"]).optional(),
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
  app.get("/api/templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await storage.getTemplatesByUser(userId);
      const templatesWithCounts = await Promise.all(
        templates.map(async (template) => {
          const questions = await storage.getQuestionsByTemplate(template.id);
          return {
            ...template,
            questionCount: questions.length,
          };
        })
      );
      res.json(templatesWithCounts);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.get("/api/projects/:projectId/templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const templates = await storage.getTemplatesByProject(req.params.projectId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  const createTemplateWithQuestionsSchema = insertTemplateSchema.omit({ projectId: true }).extend({
    name: z.string().min(1).max(100),
    defaultRecommendedFollowUps: z.number().min(0).max(10).optional(),
    questions: z.array(z.object({
      questionText: z.string().min(1),
      questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
      guidance: z.string().optional(),
      scaleMin: z.number().optional(),
      scaleMax: z.number().optional(),
      multiSelectOptions: z.array(z.string()).optional(),
      timeHintSeconds: z.number().optional(),
      recommendedFollowUps: z.number().min(0).max(10).optional(),
      isRequired: z.boolean().default(true),
    })).optional(),
  });

  app.post("/api/projects/:projectId/templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
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

  // Generate template using AI based on project metadata
  app.post("/api/projects/:projectId/generate-template", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = req.params.projectId;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get project data
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Generate template using AI
      const generatedTemplate = await generateTemplateFromProject({
        projectName: project.name,
        description: project.description,
        objective: project.objective,
        audienceContext: project.audienceContext,
        contextType: project.contextType,
        strategicContext: project.strategicContext,
        tone: project.tone,
      });
      
      res.json(generatedTemplate);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template. Please try again." });
    }
  });

  app.get("/api/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
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
    defaultRecommendedFollowUps: z.number().min(0).max(10).optional().nullable(),
    questions: z.array(z.object({
      questionText: z.string().min(1),
      questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
      guidance: z.string().optional(),
      scaleMin: z.number().optional(),
      scaleMax: z.number().optional(),
      multiSelectOptions: z.array(z.string()).optional(),
      timeHintSeconds: z.number().optional(),
      recommendedFollowUps: z.number().min(0).max(10).optional().nullable(),
      isRequired: z.boolean().default(true),
    })).optional(),
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
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
  app.get("/api/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { templateId } = req.query;
      
      let collections;
      if (templateId && typeof templateId === "string") {
        // Verify user has access to this template
        const hasAccess = await storage.verifyUserAccessToTemplate(userId, templateId);
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
        collections = await storage.getCollectionsByTemplate(templateId);
      } else {
        collections = await storage.getCollectionsByUser(userId);
      }
      
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

  app.get("/api/projects/:projectId/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const collections = await storage.getCollectionsByProject(req.params.projectId);
      res.json(collections);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  app.get("/api/collections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
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

  // Update collection settings
  const updateCollectionSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    targetResponses: z.number().min(1).max(10000).nullable().optional(),
    isActive: z.boolean().optional(),
    voiceProvider: z.enum(["openai", "grok"]).optional(),
    maxAdditionalQuestions: z.number().min(0).max(3).optional(),
  });

  app.patch("/api/collections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parseResult = updateCollectionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updated = await storage.updateCollection(req.params.id, parseResult.data);
      if (!updated) {
        return res.status(500).json({ message: "Failed to update collection" });
      }

      // Get template and project info for response
      const template = await storage.getTemplate(updated.templateId);
      let project = null;
      if (template) {
        project = await storage.getProject(template.projectId);
      }

      res.json({ ...updated, template, project });
    } catch (error) {
      console.error("Error updating collection:", error);
      res.status(500).json({ message: "Failed to update collection" });
    }
  });

  const createCollectionSchema = insertCollectionSchema.omit({ templateId: true }).extend({
    name: z.string().min(1).max(100),
    targetResponses: z.number().min(1).optional(),
    maxAdditionalQuestions: z.number().min(0).max(3).default(1),
  });

  app.post("/api/templates/:templateId/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
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

  // Respondent Invitation Management
  app.get("/api/collections/:collectionId/respondents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const respondentList = await storage.getRespondentsByCollection(req.params.collectionId);
      res.json(respondentList);
    } catch (error) {
      console.error("Error fetching respondents:", error);
      res.status(500).json({ message: "Failed to fetch respondents" });
    }
  });

  // Schema for inviting respondents
  const inviteRespondentSchema = z.object({
    email: z.string().email().optional().nullable(),
    fullName: z.string().max(200).optional().nullable(),
    informalName: z.string().max(100).optional().nullable(),
  }).refine(data => data.email || data.fullName, {
    message: "Either email or full name is required",
  });

  // Invite a single respondent
  app.post("/api/collections/:collectionId/respondents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const parseResult = inviteRespondentSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { email, fullName, informalName } = parseResult.data;
      
      // Check if respondent already exists by email
      if (email) {
        const existing = await storage.getRespondentByEmail(req.params.collectionId, email);
        if (existing) {
          return res.status(400).json({ message: "A respondent with this email already exists" });
        }
      }
      
      // Generate unique invitation token (192 bits of entropy)
      const invitationToken = crypto.randomBytes(24).toString('base64url');
      
      const respondent = await storage.createRespondent({
        collectionId: req.params.collectionId,
        email: email || null,
        fullName: fullName || null,
        informalName: informalName || null,
        invitationToken,
        invitationStatus: "invited",
      });
      
      res.status(201).json(respondent);
    } catch (error) {
      console.error("Error inviting respondent:", error);
      res.status(500).json({ message: "Failed to invite respondent" });
    }
  });

  // Schema for bulk invite
  const bulkInviteSchema = z.object({
    respondents: z.array(z.object({
      email: z.string().email().optional().nullable(),
      fullName: z.string().max(200).optional().nullable(),
      informalName: z.string().max(100).optional().nullable(),
    })).min(1, "At least one respondent is required").max(500, "Maximum 500 respondents per batch"),
  });

  // Bulk invite respondents (from CSV data)
  app.post("/api/collections/:collectionId/respondents/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const parseResult = bulkInviteSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { respondents: inputRespondents } = parseResult.data;
      
      // Filter out duplicates by email within the batch and check existing
      const existingEmails = new Set<string>();
      const existingRespondents = await storage.getRespondentsByCollection(req.params.collectionId);
      existingRespondents.forEach(r => {
        if (r.email) existingEmails.add(r.email.toLowerCase());
      });
      
      const toCreate: Array<{
        collectionId: string;
        email: string | null;
        fullName: string | null;
        informalName: string | null;
        invitationToken: string;
        invitationStatus: "invited";
      }> = [];
      const skipped: string[] = [];
      const seenEmails = new Set<string>();
      
      for (const r of inputRespondents) {
        const email = r.email?.toLowerCase().trim();
        
        // Skip if already exists or duplicate in batch
        if (email && (existingEmails.has(email) || seenEmails.has(email))) {
          skipped.push(email);
          continue;
        }
        
        if (email) seenEmails.add(email);
        
        toCreate.push({
          collectionId: req.params.collectionId,
          email: r.email?.trim() || null,
          fullName: r.fullName?.trim() || null,
          informalName: r.informalName?.trim() || null,
          invitationToken: crypto.randomBytes(24).toString('base64url'),
          invitationStatus: "invited",
        });
      }
      
      const created = await storage.createRespondents(toCreate);
      
      res.status(201).json({
        created: created.length,
        skipped: skipped.length,
        skippedEmails: skipped,
        respondents: created,
      });
    } catch (error) {
      console.error("Error bulk inviting respondents:", error);
      res.status(500).json({ message: "Failed to bulk invite respondents" });
    }
  });

  // Sessions
  app.get("/api/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const sessions = await storage.getSessionsByUser(userId, limit);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSessionWithRespondent(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Delete session
  app.delete("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteSession(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete session" });
      }
      
      res.json({ success: true, message: "Session deleted successfully" });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  // Update researcher notes
  app.patch("/api/sessions/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { notes } = req.body;
      const session = await storage.updateSession(req.params.id, { 
        researcherNotes: notes 
      });
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating notes:", error);
      res.status(500).json({ message: "Failed to update notes" });
    }
  });

  // Update review flags
  app.patch("/api/sessions/:id/flags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { flags } = req.body;
      if (!Array.isArray(flags)) {
        return res.status(400).json({ message: "flags must be an array" });
      }
      const validFlags = ["needs_review", "flagged_quality", "verified", "excluded"];
      const invalidFlags = flags.filter((f: string) => !validFlags.includes(f));
      if (invalidFlags.length > 0) {
        return res.status(400).json({ message: `Invalid flags: ${invalidFlags.join(", ")}` });
      }
      
      const session = await storage.updateSession(req.params.id, { 
        reviewFlags: flags 
      });
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating flags:", error);
      res.status(500).json({ message: "Failed to update flags" });
    }
  });

  // Override session status
  app.patch("/api/sessions/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { status } = req.body;
      const validStatuses = ["pending", "consent_given", "in_progress", "paused", "completed", "abandoned"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: `Invalid status: ${status}` });
      }
      
      const session = await storage.updateSession(req.params.id, { status });
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Export session data (JSON/CSV)
  app.get("/api/sessions/:id/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const format = req.query.format as string || "json";
      const session = await storage.getSessionWithRespondent(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const collection = await storage.getCollection(session.collectionId);
      const template = collection ? await storage.getTemplate(collection.templateId) : null;
      const questions = collection ? await storage.getQuestionsByTemplate(collection.templateId) : [];

      const exportData = {
        session: {
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          totalDurationMs: session.totalDurationMs,
          satisfactionRating: session.satisfactionRating,
          closingComments: session.closingComments,
          researcherNotes: session.researcherNotes,
          reviewFlags: session.reviewFlags,
        },
        respondent: session.respondent ? {
          email: session.respondent.email,
          fullName: session.respondent.fullName,
          displayName: session.respondent.displayName,
          profileFields: session.respondent.profileFields,
        } : null,
        collection: collection?.name,
        template: template?.name,
        questionSummaries: session.questionSummaries,
        transcript: session.liveTranscript,
        questions: questions.map(q => ({ text: q.questionText, type: q.questionType })),
        additionalQuestions: session.additionalQuestions || null,
      };

      if (format === "csv") {
        const transcript = (session.liveTranscript as any[]) || [];
        const csvRows = [
          ["timestamp", "speaker", "question", "text"],
          ...transcript.map((entry: any) => [
            new Date(entry.timestamp).toISOString(),
            entry.speaker,
            `Q${entry.questionIndex + 1}`,
            `"${(entry.text || "").replace(/"/g, '""')}"`,
          ]),
        ];
        const csv = csvRows.map(row => row.join(",")).join("\n");
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="session-${session.id.slice(0, 8)}.csv"`);
        return res.send(csv);
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="session-${session.id.slice(0, 8)}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting session:", error);
      res.status(500).json({ message: "Failed to export session" });
    }
  });

  // Get sibling session IDs for navigation
  app.get("/api/sessions/:id/siblings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const siblings = await storage.getSiblingSessionIds(req.params.id);
      res.json(siblings);
    } catch (error) {
      console.error("Error fetching siblings:", error);
      res.status(500).json({ message: "Failed to fetch siblings" });
    }
  });

  // Generate resume link for incomplete sessions
  app.post("/api/sessions/:id/resume-link", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!["paused", "in_progress", "consent_given", "pending"].includes(session.status)) {
        return res.status(400).json({ message: "Session is already completed or abandoned" });
      }

      const token = generateResumeToken();
      const tokenHash = hashToken(token);
      const expiresAt = getTokenExpiryDate(7 * 24 * 60 * 60 * 1000); // 7 days

      await storage.setResumeToken(session.id, tokenHash, expiresAt);

      const resumeUrl = `${req.protocol}://${req.get("host")}/interview/resume/${token}`;
      
      res.json({ 
        resumeUrl,
        expiresAt,
        token,
      });
    } catch (error) {
      console.error("Error generating resume link:", error);
      res.status(500).json({ message: "Failed to generate resume link" });
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
      const respondent = await storage.getRespondent(session.respondentId);
      
      // Include AQ state if session is in AQ phase
      const aqState = session.additionalQuestionPhase && session.additionalQuestions
        ? {
            isInAQPhase: true,
            aqQuestions: (session.additionalQuestions as any[]).map((q: any, idx: number) => ({
              index: idx,
              questionText: q.questionText,
              rationale: q.rationale,
            })),
            currentAQIndex: session.currentAdditionalQuestionIndex ?? 0,
          }
        : undefined;
      
      res.json({
        session,
        collection,
        template,
        questions,
        respondent,
        features: {
          additionalQuestionsEnabled: ADDITIONAL_QUESTIONS_ENABLED,
        },
        aqState,
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
        features: {
          additionalQuestionsEnabled: ADDITIONAL_QUESTIONS_ENABLED,
        },
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

  // GET /api/sessions/:sessionId/metrics - Get session performance metrics
  app.get("/api/sessions/:sessionId/metrics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Verify ownership
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.sessionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Return performance metrics if available
      if (!session.performanceMetrics) {
        return res.status(404).json({ 
          message: "No performance metrics available for this session",
          hasMetrics: false 
        });
      }

      res.json({
        hasMetrics: true,
        metrics: session.performanceMetrics,
        sessionStatus: session.status,
        sessionDuration: session.completedAt && session.startedAt 
          ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
          : null,
      });
    } catch (error) {
      console.error("Error fetching session metrics:", error);
      res.status(500).json({ message: "Failed to fetch session metrics" });
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

      // Build update object, filtering out null/undefined/empty values
      const updates: { fullName?: string; informalName?: string } = {};
      if (parseResult.data.fullName) {
        updates.fullName = parseResult.data.fullName;
      }
      if (parseResult.data.informalName) {
        updates.informalName = parseResult.data.informalName;
      }

      // If no actual values to update, just return the current respondent
      if (Object.keys(updates).length === 0) {
        const existingRespondent = await storage.getRespondent(req.params.respondentId);
        if (!existingRespondent) {
          return res.status(404).json({ message: "Respondent not found" });
        }
        return res.json(existingRespondent);
      }

      const respondent = await storage.updateRespondent(req.params.respondentId, updates);

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

  // Start session from invitation token (pre-registered respondent)
  // This is called when the user submits the consent form with a token
  const startByTokenSchema = z.object({
    token: z.string().min(1, "Token is required"),
  });
  
  app.post("/api/collections/:collectionId/start-by-token", async (req, res) => {
    try {
      const parseResult = startByTokenSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { token } = parseResult.data;
      
      // Find respondent by token using constant-time comparison via database
      const respondent = await storage.getRespondentByToken(token);
      if (!respondent) {
        return res.status(404).json({ message: "Invalid invitation token" });
      }
      
      // Verify respondent belongs to this collection
      if (respondent.collectionId !== req.params.collectionId) {
        return res.status(400).json({ message: "Token does not match this collection" });
      }
      
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      if (!collection.isActive) {
        return res.status(400).json({ message: "This collection is no longer accepting responses" });
      }
      
      // Update to consented status now that they've submitted the consent form
      await storage.updateRespondent(respondent.id, {
        consentGivenAt: new Date(),
        invitationStatus: "consented",
      });
      
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

      res.status(201).json({ ...updatedSession, resumeToken, respondent });
    } catch (error) {
      console.error("Error starting session by token:", error);
      res.status(500).json({ message: "Failed to start session" });
    }
  });

  // Lookup invitation by token (for pre-filling respondent info on join page)
  app.get("/api/invitation/:token", async (req, res) => {
    try {
      const respondent = await storage.getRespondentByToken(req.params.token);
      if (!respondent) {
        return res.status(404).json({ message: "Invalid invitation token" });
      }
      
      const collection = await storage.getCollection(respondent.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      // Mark as clicked if first time
      if (respondent.invitationStatus === "invited") {
        await storage.updateRespondent(respondent.id, {
          invitationStatus: "clicked",
          clickedAt: new Date(),
        });
      }
      
      const template = await storage.getTemplate(collection.templateId);
      
      res.json({
        respondent: {
          id: respondent.id,
          fullName: respondent.fullName,
          informalName: respondent.informalName,
          email: respondent.email,
        },
        collection: {
          id: collection.id,
          name: collection.name,
          isActive: collection.isActive,
        },
        template: template ? {
          id: template.id,
          name: template.name,
        } : null,
      });
    } catch (error) {
      console.error("Error looking up invitation:", error);
      res.status(500).json({ message: "Failed to lookup invitation" });
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
      
      // Update respondent status to "completed" when session completes
      if (updateData.status === "completed" && session.respondentId) {
        try {
          await storage.updateRespondent(session.respondentId, {
            invitationStatus: "completed",
          });
        } catch (e) {
          console.warn("Could not update respondent status:", e);
        }
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
          isAdditionalQuestion: false,
        };
      });

      // Build additional question segments if any
      // AQ data structure uses questionText and rationale fields
      const additionalQuestions = (fullSession.additionalQuestions || []) as Array<{ 
        questionText: string; 
        rationale: string;
        transcript?: string;
        summaryBullets?: string[];
      }>;
      const aqSegments = additionalQuestions.map((aq, index) => {
        const aqIndex = questions.length + index;
        const summary = summaryByQuestion.get(aqIndex);
        // Use transcript from AQ data if available, otherwise fall back to transcriptByQuestion
        const aqTranscript = aq.transcript || transcriptByQuestion.get(aqIndex) || null;
        return {
          id: `aq-${index}`,
          questionId: null,
          transcript: aqTranscript,
          summaryBullets: aq.summaryBullets || summary?.keyInsights || null,
          respondentComment: reviewComments[`aq-${index}`] || null,
          question: {
            questionText: aq.questionText,
            questionType: "open",
          },
          isAdditionalQuestion: true,
          additionalQuestionIndex: index,
          rationale: aq.rationale,
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
        additionalQuestionSegments: aqSegments,
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
      // Regular questions use "q-{index}" format, AQ segments use "aq-{index}" format
      let reviewComments: Record<string, string> | null = null;
      if (segmentComments && !skipped) {
        reviewComments = {};
        for (const { segmentId, comment } of segmentComments) {
          if (segmentId.startsWith("aq-")) {
            // Preserve AQ segment IDs as-is (e.g., "aq-0" -> "aq-0")
            reviewComments[segmentId] = comment;
          } else {
            // Regular questions: strip "q-" prefix (e.g., "q-0" -> "0")
            const indexStr = segmentId.replace("q-", "");
            reviewComments[indexStr] = comment;
          }
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
