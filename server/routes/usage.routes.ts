import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";

export function registerUsageRoutes(app: Express) {
  app.get("/api/usage/session/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.sessionId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const rollup = await storage.getUsageRollupBySession(req.params.sessionId);
      res.json(rollup);
    } catch (error) {
      console.error("Error fetching session usage:", error);
      res.status(500).json({ message: "Failed to fetch session usage" });
    }
  });

  app.get("/api/usage/collection/:collectionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) return res.status(404).json({ message: "Collection not found" });

      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const rollup = await storage.getUsageRollupByCollection(req.params.collectionId);
      res.json(rollup);
    } catch (error) {
      console.error("Error fetching collection usage:", error);
      res.status(500).json({ message: "Failed to fetch collection usage" });
    }
  });

  app.get("/api/usage/template/:templateId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const template = await storage.getTemplate(req.params.templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.templateId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const rollup = await storage.getUsageRollupByTemplate(req.params.templateId);
      res.json(rollup);
    } catch (error) {
      console.error("Error fetching template usage:", error);
      res.status(500).json({ message: "Failed to fetch template usage" });
    }
  });

  app.get("/api/usage/project/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const rollup = await storage.getUsageRollupByProject(req.params.projectId);
      res.json(rollup);
    } catch (error) {
      console.error("Error fetching project usage:", error);
      res.status(500).json({ message: "Failed to fetch project usage" });
    }
  });

  app.get("/api/usage/session/:sessionId/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.sessionId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const events = await storage.getUsageEventsBySession(req.params.sessionId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching session usage events:", error);
      res.status(500).json({ message: "Failed to fetch session usage events" });
    }
  });

  app.post("/api/admin/usage/backfill-rollups", isAuthenticated, async (req: any, res) => {
    try {
      const { backfillRollups, isBackfillInProgress } = await import("../usage-maintenance");
      if (isBackfillInProgress()) {
        res.status(409).json({ message: "Backfill already in progress", status: "already_running" });
        return;
      }
      res.json({ message: "Backfill started", status: "running" });
      backfillRollups().catch((err: Error) => {
        console.error("[Admin] Backfill failed:", err);
      });
    } catch (error) {
      console.error("Error starting backfill:", error);
      res.status(500).json({ message: "Failed to start backfill" });
    }
  });
}
