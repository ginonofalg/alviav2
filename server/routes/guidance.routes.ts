import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { aggregateGuidance } from "../guidance-aggregation";
import type { GuidanceAggregationScopeInfo, GuidanceAggregationWindow } from "@shared/types";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  topN: z.coerce.number().int().min(1).max(50).default(10),
}).refine(
  (data) => {
    if (data.from && data.to && new Date(data.from) > new Date(data.to)) return false;
    return true;
  },
  { message: "from must be before to" },
);

function parseQuery(raw: Record<string, unknown>) {
  return querySchema.safeParse({
    from: raw.from || undefined,
    to: raw.to || undefined,
    topN: raw.topN || undefined,
  });
}

function buildWindow(from?: string, to?: string): GuidanceAggregationWindow {
  return { from, to };
}

function sessionProjection(session: any) {
  return {
    id: session.id,
    collectionId: session.collectionId,
    status: session.status,
    barbaraGuidanceLog: session.barbaraGuidanceLog,
    liveTranscript: session.liveTranscript,
  };
}

export function registerGuidanceRoutes(app: Express) {
  app.get("/api/guidance/collection/:collectionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { collectionId } = req.params;

      const hasAccess = await storage.verifyUserAccessToCollection(userId, collectionId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const parsed = parseQuery(req.query);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });

      const { from, to, topN } = parsed.data;
      const scope: GuidanceAggregationScopeInfo = { level: "collection", id: collectionId };
      const sessions = await storage.getSessionsByCollection(collectionId);

      const result = aggregateGuidance(
        sessions.map(sessionProjection),
        scope,
        buildWindow(from, to),
        topN,
      );
      res.json(result);
    } catch (error) {
      console.error("Error in guidance collection aggregation:", error);
      res.status(500).json({ message: "Failed to aggregate guidance data" });
    }
  });

  app.get("/api/guidance/template/:templateId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { templateId } = req.params;

      const hasAccess = await storage.verifyUserAccessToTemplate(userId, templateId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const parsed = parseQuery(req.query);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });

      const { from, to, topN } = parsed.data;
      const scope: GuidanceAggregationScopeInfo = { level: "template", id: templateId };
      const cols = await storage.getCollectionsByTemplate(templateId);

      const allSessions = [];
      for (const col of cols) {
        const sessions = await storage.getSessionsByCollection(col.id);
        allSessions.push(...sessions.map(sessionProjection));
      }

      const result = aggregateGuidance(allSessions, scope, buildWindow(from, to), topN);
      res.json(result);
    } catch (error) {
      console.error("Error in guidance template aggregation:", error);
      res.status(500).json({ message: "Failed to aggregate guidance data" });
    }
  });

  app.get("/api/guidance/project/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const parsed = parseQuery(req.query);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });

      const { from, to, topN } = parsed.data;
      const scope: GuidanceAggregationScopeInfo = { level: "project", id: projectId };
      const cols = await storage.getCollectionsByProject(projectId);

      const allSessions = [];
      for (const col of cols) {
        const sessions = await storage.getSessionsByCollection(col.id);
        allSessions.push(...sessions.map(sessionProjection));
      }

      const result = aggregateGuidance(allSessions, scope, buildWindow(from, to), topN);
      res.json(result);
    } catch (error) {
      console.error("Error in guidance project aggregation:", error);
      res.status(500).json({ message: "Failed to aggregate guidance data" });
    }
  });
}
