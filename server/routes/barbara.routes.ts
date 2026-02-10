import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import {
  getBarbaraConfig,
  updateBarbaraConfig,
  updateAnalysisConfig,
  updateTopicOverlapConfig,
  updateSummarisationConfig,
  updateSessionSummaryConfig,
  generateSessionSummary,
  ALLOWED_MODELS,
  type TranscriptEntry,
  type BarbaraConfig,
  type BarbaraUseCaseConfig,
} from "../barbara-orchestrator";
import type { LLMUsageAttribution } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export function registerBarbaraRoutes(app: Express) {
  const barbaraUseCaseConfigSchema = z.object({
    model: z.enum(ALLOWED_MODELS as unknown as [string, ...string[]]).optional(),
    verbosity: z.enum(["low", "medium", "high"]).optional(),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  });

  const barbaraConfigSchema = z.object({
    analysis: barbaraUseCaseConfigSchema.optional(),
    topicOverlap: barbaraUseCaseConfigSchema.optional(),
    summarisation: barbaraUseCaseConfigSchema.optional(),
    sessionSummary: barbaraUseCaseConfigSchema.optional(),
  });

  app.get("/api/barbara/config", isAuthenticated, async (req, res) => {
    try {
      const config = getBarbaraConfig();
      res.json(config);
    } catch (error) {
      console.error("Error fetching Barbara config:", error);
      res.status(500).json({ message: "Failed to fetch Barbara configuration" });
    }
  });

  app.patch("/api/barbara/config", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateBarbaraConfig(parseResult.data as Partial<BarbaraConfig>);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating Barbara config:", error);
      res.status(500).json({ message: "Failed to update Barbara configuration" });
    }
  });

  app.patch("/api/barbara/config/analysis", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateAnalysisConfig(parseResult.data as Partial<BarbaraUseCaseConfig>);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating analysis config:", error);
      res.status(500).json({ message: "Failed to update analysis configuration" });
    }
  });

  app.patch("/api/barbara/config/topic-overlap", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateTopicOverlapConfig(parseResult.data as Partial<BarbaraUseCaseConfig>);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating topic overlap config:", error);
      res.status(500).json({ message: "Failed to update topic overlap configuration" });
    }
  });

  app.patch("/api/barbara/config/summarisation", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateSummarisationConfig(parseResult.data as Partial<BarbaraUseCaseConfig>);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating summarisation config:", error);
      res.status(500).json({ message: "Failed to update summarisation configuration" });
    }
  });

  app.patch("/api/barbara/config/session-summary", isAuthenticated, async (req, res) => {
    try {
      const parseResult = barbaraUseCaseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updatedConfig = updateSessionSummaryConfig(parseResult.data as Partial<BarbaraUseCaseConfig>);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating session summary config:", error);
      res.status(500).json({ message: "Failed to update session summary configuration" });
    }
  });

  app.post("/api/sessions/:id/generate-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const hasAccess = await storage.verifyUserAccessToCollection(userId, session.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (session.status !== "completed") {
        return res.status(400).json({ message: "Session must be completed to generate summary" });
      }

      const collection = await storage.getCollection(session.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const template = await storage.getTemplate(collection.templateId);
      const project = template?.projectId ? await storage.getProject(template.projectId) : null;
      const questions = await storage.getQuestionsByTemplate(collection.templateId);

      const transcript = (session.liveTranscript || []) as TranscriptEntry[];
      const questionSummaries = ((session.questionSummaries || []) as any[]).filter(Boolean);

      if (transcript.length === 0) {
        return res.status(400).json({ message: "No transcript data available for summary generation" });
      }

      const sessionSummaryUsageContext: LLMUsageAttribution = {
        projectId: project?.id ?? null,
        templateId: template?.id ?? null,
        collectionId: session.collectionId,
        sessionId: req.params.id,
      };
      const result = await generateSessionSummary({
        transcript,
        questionSummaries,
        templateObjective: template?.objective || "General research interview",
        projectObjective: project?.objective || undefined,
        strategicContext: project?.strategicContext || undefined,
        questions: questions.map((q) => ({
          text: q.questionText,
          guidance: q.guidance || null,
        })),
      }, sessionSummaryUsageContext);

      await storage.persistInterviewState(req.params.id, {
        barbaraSessionSummary: result,
      });

      res.json(result);
    } catch (error) {
      console.error("Error generating session summary:", error);
      res.status(500).json({ message: "Failed to generate session summary" });
    }
  });
}
