import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { generateResumeToken, hashToken, getTokenExpiryDate } from "../resume-token";
import { z } from "zod";

export function registerSessionRoutes(app: Express) {
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

  app.delete("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
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

  app.patch("/api/sessions/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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

  app.patch("/api/sessions/:id/flags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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

  app.patch("/api/sessions/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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

  app.get("/api/sessions/:id/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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

  app.get("/api/sessions/:id/siblings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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

  const disconnectLogRateLimit = new Map<string, { count: number; resetAt: number }>();
  const isProduction = process.env.NODE_ENV === "production";
  app.post("/api/sessions/:sessionId/disconnect-log", (req, res) => {
    const { sessionId } = req.params;
    const now = Date.now();
    
    let rateInfo = disconnectLogRateLimit.get(sessionId);
    if (!rateInfo || now > rateInfo.resetAt) {
      rateInfo = { count: 0, resetAt: now + 60000 };
      disconnectLogRateLimit.set(sessionId, rateInfo);
    }
    
    if (rateInfo.count >= 10) {
      return res.status(429).end();
    }
    rateInfo.count++;
    
    const diagnostics = req.body || {};
    
    if (isProduction) {
      console.log(`[DisconnectDiag] Session ${sessionId}: code=${diagnostics.closeCode}, clean=${diagnostics.wasClean}, online=${diagnostics.onLine}, visibility=${diagnostics.visibilityState}, focus=${diagnostics.hasFocus}`);
    } else {
      console.log(`[DisconnectDiag] Session ${sessionId}:`, {
        closeCode: diagnostics.closeCode,
        closeReason: diagnostics.closeReason,
        wasClean: diagnostics.wasClean,
        onLine: diagnostics.onLine,
        visibilityState: diagnostics.visibilityState,
        hasFocus: diagnostics.hasFocus,
        timeSinceOpen: diagnostics.timeSinceOpen,
        ip: req.ip || req.headers["x-forwarded-for"],
      });
    }
    
    res.status(204).end();
  });

  app.post("/api/sessions/:id/resume-link", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!["paused", "in_progress", "consent_given", "pending"].includes(session.status)) {
        return res.status(400).json({ message: "Session is already completed or abandoned" });
      }

      const token = generateResumeToken();
      const tokenHash = hashToken(token);
      const expiresAt = getTokenExpiryDate(7 * 24 * 60 * 60 * 1000);

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
}
