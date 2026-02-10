import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { hashToken, isTokenExpired } from "../resume-token";

const ADDITIONAL_QUESTIONS_ENABLED = process.env.ADDITIONAL_QUESTIONS_ENABLED !== "false";

export function registerInterviewAccessRoutes(app: Express) {
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

  app.get("/api/sessions/:sessionId/metrics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const hasAccess = await storage.verifyUserAccessToSession(userId, req.params.sessionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

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

  app.get("/api/collections/:collectionId/sessions", isAuthenticated, async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const sessions = await storage.getSessionsByCollection(req.params.collectionId);
      
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
}
