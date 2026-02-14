import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { generateCrossInterviewAnalysis, generateTemplateAnalytics, generateProjectAnalytics } from "../barbara-orchestrator";
import type { LLMUsageAttribution, QuestionSummary, CollectionAnalytics, TemplateAnalytics, ProjectAnalytics } from "@shared/schema";
import { z } from "zod";
import type { SessionScope } from "@shared/types/simulation";
import type { InterviewSession } from "@shared/schema";

const sessionScopeSchema = z.enum(["real", "simulated", "combined"]).default("real");

function parseSessionScope(query: any): SessionScope {
  const result = sessionScopeSchema.safeParse(query.sessionScope);
  return result.success ? result.data : "real";
}

function filterSessionsByScope(sessions: InterviewSession[], scope: SessionScope): InterviewSession[] {
  if (scope === "combined") return sessions;
  if (scope === "simulated") return sessions.filter(s => s.isSimulated);
  return sessions.filter(s => !s.isSimulated);
}

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const scope = parseSessionScope(req.query);
      const stats = await storage.getDashboardStats(userId, scope);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/dashboard/enhanced-stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const scope = parseSessionScope(req.query);
      const stats = await storage.getEnhancedDashboardStats(userId, scope);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching enhanced dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch enhanced stats" });
    }
  });

  app.get("/api/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = req.query.projectId as string | undefined;
      const collectionId = req.query.collectionId as string | undefined;
      
      if (!projectId && !collectionId) {
        return res.status(400).json({ message: "Either projectId or collectionId is required" });
      }
      
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
      
      const scope = parseSessionScope(req.query);
      const analytics = await storage.getAnalytics({ projectId, collectionId, sessionScope: scope });
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/aggregated", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const scope = parseSessionScope(req.query);
      const aggregated = await storage.getAggregatedAnalytics(userId, scope);
      res.json(aggregated);
    } catch (error) {
      console.error("Error fetching aggregated analytics:", error);
      res.status(500).json({ message: "Failed to fetch aggregated analytics" });
    }
  });

  app.get("/api/collections/:collectionId/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);
      const sessions = await storage.getSessionsByCollection(req.params.collectionId);
      const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
      
      const scopeMatches = collection.analyzedSessionScope === scope;
      const isStale = !collection.lastAnalyzedAt || 
        !scopeMatches ||
        (scopeMatches && completedSessions.length !== collection.analyzedSessionCount);
      
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

  app.post("/api/collections/:collectionId/analytics/refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);

      const template = await storage.getTemplate(collection.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const questions = await storage.getQuestionsByTemplate(template.id);
      const sessions = await storage.getSessionsByCollection(req.params.collectionId);
      const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");

      if (completedSessions.length === 0) {
        return res.status(400).json({ message: "No completed sessions to analyze" });
      }

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

      console.log("[Analytics] Starting analysis for collection:", req.params.collectionId);
      console.log("[Analytics] Sessions to analyze:", completedSessions.length);
      console.log("[Analytics] Total summaries:", sessionsWithSummaries.reduce((sum, s) => sum + s.questionSummaries.length, 0));

      const project = await storage.getProject(template.projectId);
      const collectionUsageContext: LLMUsageAttribution = {
        projectId: template.projectId,
        templateId: template.id,
        collectionId: req.params.collectionId,
      };
      const analysisResult = await generateCrossInterviewAnalysis({
        sessions: sessionsWithSummaries,
        templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
        templateObjective: project?.objective || "",
      }, collectionUsageContext);

      const analyticsData: CollectionAnalytics = {
        ...analysisResult,
        generatedAt: Date.now(),
      };

      await storage.updateCollection(req.params.collectionId, {
        lastAnalyzedAt: new Date(),
        analyzedSessionCount: completedSessions.length,
        analyzedSessionScope: scope,
        analyticsData,
      });

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

  app.get("/api/templates/:templateId/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);
      const scopeMatches = template.analyzedSessionScope === scope;
      const collections = await storage.getCollectionsByTemplate(template.id);
      const collectionsWithAnalytics = collections.filter(c => c.analyticsData !== null && c.analyzedSessionScope === scope);

      const isStale = !template.lastAnalyzedAt || !scopeMatches
        || collections.some(c => {
            const collectionAnalyzedAt = c.lastAnalyzedAt;
            return collectionAnalyzedAt && collectionAnalyzedAt > template.lastAnalyzedAt!;
          });

      res.json({
        analytics: scopeMatches ? template.analyticsData as TemplateAnalytics | null : null,
        lastAnalyzedAt: scopeMatches ? template.lastAnalyzedAt : null,
        analyzedCollectionCount: template.analyzedCollectionCount || 0,
        analyzedSessionScope: template.analyzedSessionScope,
        currentCollectionCount: collectionsWithAnalytics.length,
        totalCollectionCount: collections.length,
        isStale,
        missingAnalytics: collections.filter(c => c.analyticsData === null || c.analyzedSessionScope !== scope).length,
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

      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);

      const questions = await storage.getQuestionsByTemplate(template.id);
      const collections = await storage.getCollectionsByTemplate(template.id);

      const collectionsData = await Promise.all(
        collections.map(async (collection) => {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
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

      const templateUsageContext: LLMUsageAttribution = {
        projectId: template.projectId,
        templateId: template.id,
      };
      const analysisResult = await generateTemplateAnalytics({
        collections: collectionsData,
        templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
        templateName: template.name,
      }, templateUsageContext);

      const analyticsData: TemplateAnalytics = {
        ...analysisResult,
        generatedAt: Date.now(),
      };

      await storage.updateTemplate(template.id, {
        lastAnalyzedAt: new Date(),
        analyzedCollectionCount: collectionsWithAnalytics.length,
        analyzedSessionScope: scope,
        analyticsData,
      });

      res.json({
        analytics: analyticsData,
        lastAnalyzedAt: new Date(),
        analyzedCollectionCount: collectionsWithAnalytics.length,
        analyzedSessionScope: scope,
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

  app.get("/api/projects/:projectId/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);
      const scopeMatches = project.analyzedSessionScope === scope;
      const templates = await storage.getTemplatesByProject(project.id);
      const templatesWithAnalytics = templates.filter(t => t.analyticsData !== null && t.analyzedSessionScope === scope);

      const isStale = !project.lastAnalyzedAt || !scopeMatches
        || templates.some(t => {
            const templateAnalyzedAt = t.lastAnalyzedAt;
            return templateAnalyzedAt && templateAnalyzedAt > project.lastAnalyzedAt!;
          });

      res.json({
        analytics: scopeMatches ? project.analyticsData as ProjectAnalytics | null : null,
        lastAnalyzedAt: scopeMatches ? project.lastAnalyzedAt : null,
        analyzedTemplateCount: project.analyzedTemplateCount || 0,
        analyzedSessionScope: project.analyzedSessionScope,
        currentTemplateCount: templatesWithAnalytics.length,
        totalTemplateCount: templates.length,
        isStale,
        missingAnalytics: templates.filter(t => t.analyticsData === null || t.analyzedSessionScope !== scope).length,
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

      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);

      const templates = await storage.getTemplatesByProject(project.id);

      const templatesData = await Promise.all(
        templates.map(async (template) => {
          const collections = await storage.getCollectionsByTemplate(template.id);
          const questions = await storage.getQuestionsByTemplate(template.id);
          let totalSessions = 0;
          for (const collection of collections) {
            const sessions = await storage.getSessionsByCollection(collection.id);
            totalSessions += filterSessionsByScope(sessions, scope).filter(s => s.status === "completed").length;
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

      const projectUsageContext: LLMUsageAttribution = {
        projectId: project.id,
      };
      const analysisResult = await generateProjectAnalytics({
        templates: templatesData,
        projectName: project.name,
        projectObjective: project.objective || "",
        strategicContext: project.strategicContext || undefined,
        contextType: project.contextType || undefined,
      }, projectUsageContext);

      const analyticsData: ProjectAnalytics = {
        ...analysisResult,
        generatedAt: Date.now(),
      };

      await storage.updateProject(project.id, {
        lastAnalyzedAt: new Date(),
        analyzedTemplateCount: templatesWithAnalytics.length,
        analyzedSessionScope: scope,
        analyticsData,
      });

      res.json({
        analytics: analyticsData,
        lastAnalyzedAt: new Date(),
        analyzedTemplateCount: templatesWithAnalytics.length,
        analyzedSessionScope: scope,
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

  app.get("/api/projects/:projectId/analytics/dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);

      const templates = await storage.getTemplatesByProject(project.id);
      
      const templatesData = await Promise.all(
        templates.map(async (template) => {
          const collections = await storage.getCollectionsByTemplate(template.id);
          
          const collectionsData = await Promise.all(
            collections.map(async (collection) => {
              const sessions = await storage.getSessionsByCollection(collection.id);
              const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
              
              const scopeMatches = collection.analyzedSessionScope === scope;
              const isStale = !collection.lastAnalyzedAt || 
                !scopeMatches ||
                (scopeMatches && completedSessions.length !== collection.analyzedSessionCount);
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

  app.post("/api/projects/:projectId/analytics/cascade-refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scope = parseSessionScope(req.query);

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
          const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
          
          if (completedSessions.length === 0) continue;
          
          const cascadeScopeMatches = collection.analyzedSessionScope === scope;
          const isStale = !collection.lastAnalyzedAt || 
            !cascadeScopeMatches ||
            (cascadeScopeMatches && completedSessions.length !== collection.analyzedSessionCount);
          
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

              const cascadeCollectionUsageContext: LLMUsageAttribution = {
                projectId: project.id,
                templateId: template.id,
                collectionId: collection.id,
              };
              const analysisResult = await generateCrossInterviewAnalysis({
                sessions: sessionsWithSummaries,
                templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
                templateObjective: project.objective || "",
              }, cascadeCollectionUsageContext);

              const analyticsData: CollectionAnalytics = {
                ...analysisResult,
                generatedAt: Date.now(),
              };

              await storage.updateCollection(collection.id, {
                lastAnalyzedAt: new Date(),
                analyzedSessionCount: completedSessions.length,
                analyzedSessionScope: scope,
                analyticsData,
              });

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
            const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
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
          
          const cascadeTemplateUsageContext: LLMUsageAttribution = {
            projectId: project.id,
            templateId: template.id,
          };
          const analysisResult = await generateTemplateAnalytics({
            collections: collectionsData,
            templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
            templateName: template.name,
          }, cascadeTemplateUsageContext);

          const analyticsData: TemplateAnalytics = {
            ...analysisResult,
            generatedAt: Date.now(),
          };

          await storage.updateTemplate(template.id, {
            lastAnalyzedAt: new Date(),
            analyzedCollectionCount: collectionsWithAnalytics.length,
            analyzedSessionScope: scope,
            analyticsData,
          });

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
            totalSessions += filterSessionsByScope(sessions, scope).filter(s => s.status === "completed").length;
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
          
          const cascadeProjectUsageContext: LLMUsageAttribution = {
            projectId: project.id,
          };
          const analysisResult = await generateProjectAnalytics({
            templates: templatesData,
            projectName: project.name,
            projectObjective: project.objective || "",
            strategicContext: project.strategicContext || undefined,
            contextType: project.contextType || undefined,
          }, cascadeProjectUsageContext);

          const projectAnalyticsData: ProjectAnalytics = {
            ...analysisResult,
            generatedAt: Date.now(),
          };

          await storage.updateProject(project.id, {
            lastAnalyzedAt: new Date(),
            analyzedTemplateCount: templatesWithAnalytics.length,
            analyzedSessionScope: scope,
            analyticsData: projectAnalyticsData,
          });

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

  app.get("/api/templates/:templateId/analytics/dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const scope = parseSessionScope(req.query);

      const collections = await storage.getCollectionsByTemplate(template.id);
      
      const collectionsData = await Promise.all(
        collections.map(async (collection) => {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
          
          const scopeMatches = collection.analyzedSessionScope === scope;
          const isStale = !collection.lastAnalyzedAt || 
            !scopeMatches ||
            (scopeMatches && completedSessions.length !== collection.analyzedSessionCount);
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

  app.post("/api/templates/:templateId/analytics/cascade-refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const template = await storage.getTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const project = await storage.getProject(template.projectId);
      const scope = parseSessionScope(req.query);
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
        const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
        
        if (completedSessions.length === 0) continue;
        
        const tplScopeMatches = collection.analyzedSessionScope === scope;
        const isStale = !collection.lastAnalyzedAt || 
          !tplScopeMatches ||
          (tplScopeMatches && completedSessions.length !== collection.analyzedSessionCount);
        
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

            const tplCascadeCollUsageContext: LLMUsageAttribution = {
              projectId: template.projectId,
              templateId: template.id,
              collectionId: collection.id,
            };
            const analysisResult = await generateCrossInterviewAnalysis({
              sessions: sessionsWithSummaries,
              templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
              templateObjective: project?.objective || "",
            }, tplCascadeCollUsageContext);

            const analyticsData: CollectionAnalytics = {
              ...analysisResult,
              generatedAt: Date.now(),
            };

            await storage.updateCollection(collection.id, {
              lastAnalyzedAt: new Date(),
              analyzedSessionCount: completedSessions.length,
              analyzedSessionScope: scope,
              analyticsData,
            });

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
          const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
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
          
          const tplCascadeUsageContext: LLMUsageAttribution = {
            projectId: template.projectId,
            templateId: template.id,
          };
          const analysisResult = await generateTemplateAnalytics({
            collections: collectionsData,
            templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
            templateName: template.name,
          }, tplCascadeUsageContext);

          const templateAnalyticsData: TemplateAnalytics = {
            ...analysisResult,
            generatedAt: Date.now(),
          };

          await storage.updateTemplate(template.id, {
            lastAnalyzedAt: new Date(),
            analyzedCollectionCount: collectionsWithAnalytics.length,
            analyzedSessionScope: scope,
            analyticsData: templateAnalyticsData,
          });

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
}
