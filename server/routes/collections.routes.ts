import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { insertCollectionSchema } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export function registerCollectionRoutes(app: Express) {
  app.get("/api/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { templateId } = req.query;
      
      let collections;
      if (templateId && typeof templateId === "string") {
        const hasAccess = await storage.verifyUserAccessToTemplate(userId, templateId);
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
        collections = await storage.getCollectionsByTemplate(templateId);
      } else {
        collections = await storage.getCollectionsByUser(userId);
      }
      
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
      
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
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

  const updateCollectionSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    targetResponses: z.number().min(1).max(10000).nullable().optional(),
    isActive: z.boolean().optional(),
    voiceProvider: z.enum(["openai", "grok"]).optional(),
    maxAdditionalQuestions: z.number().min(0).max(3).optional(),
    endOfInterviewSummaryEnabled: z.boolean().optional(),
  });

  app.patch("/api/collections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

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
    endOfInterviewSummaryEnabled: z.boolean().default(false),
  });

  app.post("/api/templates/:templateId/collections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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
}
