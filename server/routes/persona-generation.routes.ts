import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import {
  researchPopulation,
  synthesizePersonas,
  validatePersonaDiversity,
  buildCorrectionPrompt,
} from "../persona-generation";
import type { PopulationBrief } from "../persona-generation";
const researchRateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkResearchRateLimit(projectId: string): boolean {
  const now = Date.now();
  const entry = researchRateLimits.get(projectId);
  if (!entry || now > entry.resetAt) {
    researchRateLimits.set(projectId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

const uploadedFileSchema = z.object({
  data: z.string().max(3_000_000),
  fileName: z.string().max(255),
  mimeType: z.enum(["text/csv", "text/plain", "application/pdf"]),
});

const researchInputSchema = z.object({
  researchPrompt: z.string().min(20).max(2000),
  additionalContext: z.string().max(8000).optional(),
  uploadedFile: uploadedFileSchema.optional(),
});

const synthesizeInputSchema = z.object({
  briefId: z.string().min(1),
  personaCount: z.number().int().min(3).max(10).default(5),
  diversityMode: z.enum(["balanced", "maximize"]).default("balanced"),
  edgeCases: z.boolean().default(false),
});

export function registerPersonaGenerationRoutes(app: Express) {
  app.post("/api/projects/:projectId/personas/research", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!checkResearchRateLimit(projectId)) {
        return res.status(429).json({
          message: "Rate limit exceeded. Maximum 5 research requests per project per hour.",
        });
      }

      const parseResult = researchInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: fromError(parseResult.error).toString() });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const workspace = await storage.getWorkspace(project.workspaceId);
      const workspaceId = workspace?.id ?? project.workspaceId;

      const { brief, citations, ungrounded } = await researchPopulation({
        researchPrompt: parseResult.data.researchPrompt,
        project,
        additionalContext: parseResult.data.additionalContext,
        uploadedFile: parseResult.data.uploadedFile,
        attribution: { workspaceId, projectId },
      });

      const briefRecord = await storage.createPopulationBrief({
        projectId,
        researchPrompt: parseResult.data.researchPrompt,
        additionalContext: parseResult.data.additionalContext ?? null,
        brief: brief as any,
        confidence: brief.confidence,
      });

      res.json({
        briefId: briefRecord.id,
        brief,
        citations,
        ungrounded,
      });
    } catch (error: any) {
      console.error("[PersonaGeneration] Research error:", error);
      if (error?.message?.includes("aborted") || error?.name === "AbortError") {
        return res.status(504).json({ message: "Research timed out. Please try again with a more specific prompt." });
      }
      const status = error?.status ?? error?.statusCode;
      if (status === 429) {
        return res.status(429).json({ message: "The AI service is temporarily overloaded. Please wait a minute and try again." });
      }
      if (status === 401 || status === 403) {
        return res.status(502).json({ message: "AI service authentication failed. Please check the OpenAI API key configuration." });
      }
      res.status(500).json({ message: "Failed to research population. Please try again." });
    }
  });

  app.post("/api/projects/:projectId/personas/synthesize", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parseResult = synthesizeInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: fromError(parseResult.error).toString() });
      }

      const { briefId, personaCount, diversityMode, edgeCases } = parseResult.data;

      const briefRecord = await storage.getPopulationBrief(briefId);
      if (!briefRecord || briefRecord.projectId !== projectId) {
        return res.status(404).json({ message: "Population brief not found" });
      }

      const brief = briefRecord.brief as unknown as PopulationBrief;
      const workspace = await storage.getWorkspace(
        (await storage.getProject(projectId))?.workspaceId ?? "",
      );
      const workspaceId = workspace?.id ?? "";

      const config = { personaCount, diversityMode, edgeCases };
      const attribution = { workspaceId, projectId };

      let personas = await synthesizePersonas({ brief, config, attribution });
      let validationWarnings: string[] = [];

      const validation = validatePersonaDiversity(personas, diversityMode);
      if (!validation.valid) {
        const correctionPrompt = buildCorrectionPrompt(validation.errors);
        personas = await synthesizePersonas({ brief, config, attribution, correctionPrompt });

        const retryValidation = validatePersonaDiversity(personas, diversityMode);
        if (!retryValidation.valid) {
          validationWarnings = retryValidation.errors.map((e) => `Diversity issue: ${e}`);
          console.warn("[PersonaGeneration] Retry still failed validation:", retryValidation.errors);
        }
      }

      res.json({
        personas,
        validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
      });
    } catch (error: any) {
      console.error("[PersonaGeneration] Synthesis error:", error);
      if (error?.message?.includes("aborted") || error?.name === "AbortError") {
        return res.status(504).json({ message: "Persona generation timed out. Please try again." });
      }
      res.status(500).json({ message: "Failed to generate personas. Please try again." });
    }
  });
}
