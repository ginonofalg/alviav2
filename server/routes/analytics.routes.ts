import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import type { CollectionAnalytics, TemplateAnalytics, ProjectAnalytics } from "@shared/schema";
import { z } from "zod";
import type { SessionScope } from "@shared/types/simulation";
import {
  filterSessionsByScope,
  buildSessionsWithSummaries,
  checkCollectionStaleness,
  refreshCollectionAnalytics,
  buildCollectionsData,
  refreshTemplateAnalytics,
  buildTemplatesData,
  refreshProjectAnalytics,
} from "./analytics-helpers";

const sessionScopeSchema = z.enum(["real", "simulated", "combined"]).default("combined");

function parseSessionScope(query: any): SessionScope {
  const result = sessionScopeSchema.safeParse(query.sessionScope);
  return result.success ? result.data : "combined";
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
      const isStale = checkCollectionStaleness(collection, completedSessions.length, scope);
      
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

      const project = await storage.getProject(template.projectId);
      const result = await refreshCollectionAnalytics(collection, template, project, questions, completedSessions, scope);

      res.json({
        analytics: result.analytics,
        lastAnalyzedAt: new Date(),
        analyzedSessionCount: result.analyzedSessionCount,
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

      const scopedCollections = collections.filter(c => c.analyzedSessionScope === scope);
      const isStale = !template.lastAnalyzedAt || !scopeMatches
        || scopedCollections.some(c => {
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
      const collectionsData = await buildCollectionsData(collections, scope);
      const collectionsWithAnalytics = collectionsData.filter(c => c.analytics !== null && c.collection.analyzedSessionScope === scope);

      if (collectionsWithAnalytics.length === 0) {
        return res.status(400).json({ 
          message: "No collections with analytics available. Please refresh analytics for at least one collection first.",
          missingAnalytics: collections.length,
        });
      }

      const result = await refreshTemplateAnalytics(template, collectionsData, questions, scope);

      res.json({
        analytics: result.analytics,
        lastAnalyzedAt: new Date(),
        analyzedCollectionCount: result.analyzedCollectionCount,
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

      const scopedTemplates = templates.filter(t => t.analyzedSessionScope === scope);
      const isStale = !project.lastAnalyzedAt || !scopeMatches
        || scopedTemplates.some(t => {
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
      const templatesData = await buildTemplatesData(templates, scope);
      const templatesWithAnalytics = templatesData.filter(t => t.analytics !== null && t.template.analyzedSessionScope === scope);

      if (templatesWithAnalytics.length === 0) {
        return res.status(400).json({ 
          message: "No templates with analytics available. Please refresh analytics for at least one template first.",
          missingAnalytics: templates.length,
        });
      }

      const result = await refreshProjectAnalytics(project, templatesData, scope);

      res.json({
        analytics: result.analytics,
        lastAnalyzedAt: new Date(),
        analyzedTemplateCount: result.analyzedTemplateCount,
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
              const isStale = checkCollectionStaleness(collection, completedSessions.length, scope);
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
          const scopedCollectionsForTemplate = collections.filter(c => c.analyzedSessionScope === scope);
          const templateIsStale = template.lastAnalyzedAt 
            ? scopedCollectionsForTemplate.some(c => c.lastAnalyzedAt && c.lastAnalyzedAt > template.lastAnalyzedAt!)
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
      const scopedTemplatesForProject = templates.filter(t => t.analyzedSessionScope === scope);
      const projectIsStale = project.lastAnalyzedAt 
        ? scopedTemplatesForProject.some(t => t.lastAnalyzedAt && t.lastAnalyzedAt > project.lastAnalyzedAt!)
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
      
      for (const template of templates) {
        const collections = await storage.getCollectionsByTemplate(template.id);
        const questions = await storage.getQuestionsByTemplate(template.id);
        
        for (const collection of collections) {
          const sessions = await storage.getSessionsByCollection(collection.id);
          const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
          
          if (completedSessions.length === 0) continue;
          
          const isStale = checkCollectionStaleness(collection, completedSessions.length, scope);
          
          if (isStale) {
            try {
              console.log("[Cascade Refresh] Refreshing collection:", collection.name);
              await refreshCollectionAnalytics(collection, template, project, questions, completedSessions, scope);
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

        const collectionsWithAnalytics = collectionsData.filter(c => c.analytics !== null && c.collection.analyzedSessionScope === scope);
        
        if (collectionsWithAnalytics.length === 0) continue;

        try {
          console.log("[Cascade Refresh] Refreshing template:", template.name);
          await refreshTemplateAnalytics(template, collectionsData, questions, scope);
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

      const freshTemplates = await storage.getTemplatesByProject(project.id);
      const templatesData = await buildTemplatesData(freshTemplates, scope);
      const templatesWithAnalytics = templatesData.filter(t => t.analytics !== null && t.template.analyzedSessionScope === scope);

      if (templatesWithAnalytics.length > 0) {
        try {
          console.log("[Cascade Refresh] Refreshing project:", project.name);
          await refreshProjectAnalytics(project, templatesData, scope);
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
          const isStale = checkCollectionStaleness(collection, completedSessions.length, scope);
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
      const scopedCollectionsForDeps = collections.filter(c => c.analyzedSessionScope === scope);
      
      const templateIsStale = template.lastAnalyzedAt 
        ? scopedCollectionsForDeps.some(c => c.lastAnalyzedAt && c.lastAnalyzedAt > template.lastAnalyzedAt!)
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

      for (const collection of collections) {
        const sessions = await storage.getSessionsByCollection(collection.id);
        const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
        
        if (completedSessions.length === 0) continue;
        
        const isStale = checkCollectionStaleness(collection, completedSessions.length, scope);
        
        if (isStale) {
          try {
            console.log("[Cascade Refresh] Refreshing collection:", collection.name);
            await refreshCollectionAnalytics(collection, template, project, questions, completedSessions, scope);
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

      const freshCollections = await storage.getCollectionsByTemplate(template.id);
      const collectionsData = await buildCollectionsData(freshCollections, scope);
      const collectionsWithAnalytics = collectionsData.filter(c => c.analytics !== null && c.collection.analyzedSessionScope === scope);

      if (collectionsWithAnalytics.length > 0) {
        try {
          console.log("[Cascade Refresh] Refreshing template:", template.name);
          await refreshTemplateAnalytics(template, collectionsData, questions, scope);
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
