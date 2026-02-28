import type { Express } from "express";
import { isAuthenticated, getUserId } from "../auth";
import { storage } from "../storage";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import {
  researchPopulation,
  synthesizePersonas,
  validatePersonaDiversity,
  buildCorrectionPrompt,
} from "../persona-generation";
import type { PopulationBrief, DiversityMode } from "../persona-generation";
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

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
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
    const requestStart = Date.now();
    const { projectId } = req.params;
    console.log(`[PersonaGeneration] POST /research received | project=${projectId}`);

    try {
      const userId = getUserId(req);

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        console.warn(`[PersonaGeneration] Access denied | project=${projectId} | user=${userId}`);
        return res.status(403).json({ message: "Access denied" });
      }

      if (!checkResearchRateLimit(projectId)) {
        console.warn(`[PersonaGeneration] Rate limit exceeded | project=${projectId}`);
        return res.status(429).json({
          message: "Rate limit exceeded. Maximum 5 research requests per project per hour.",
        });
      }

      const parseResult = researchInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        console.warn(`[PersonaGeneration] Validation failed | project=${projectId} | error=${fromError(parseResult.error).toString()}`);
        return res.status(400).json({ message: fromError(parseResult.error).toString() });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const workspace = await storage.getWorkspace(project.workspaceId);
      const workspaceId = workspace?.id ?? project.workspaceId;

      const briefRecord = await storage.createPopulationBrief({
        projectId,
        researchPrompt: parseResult.data.researchPrompt,
        additionalContext: parseResult.data.additionalContext ?? null,
        isUngrounded: false,
        status: "researching",
      });

      console.log(`[PersonaGeneration] Created pending brief ${briefRecord.id} | project=${projectId} | elapsed=${elapsed(requestStart)}`);

      res.json({ briefId: briefRecord.id, status: "researching" });

      runResearchInBackground({
        briefId: briefRecord.id,
        projectId,
        project,
        workspaceId,
        researchPrompt: parseResult.data.researchPrompt,
        additionalContext: parseResult.data.additionalContext,
        uploadedFile: parseResult.data.uploadedFile,
        requestStart,
      });
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      console.error(`[PersonaGeneration] POST /research failed | project=${projectId} | error=${errorMsg} | status=${error?.status ?? "unknown"} | elapsed=${elapsed(requestStart)}`);
      res.status(500).json({ message: `Research failed: ${errorMsg}` });
    }
  });

  app.get("/api/projects/:projectId/personas/research/:briefId/status", isAuthenticated, async (req: any, res) => {
    const { projectId, briefId } = req.params;
    try {
      const userId = getUserId(req);
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const briefRecord = await storage.getPopulationBrief(briefId);
      if (!briefRecord || briefRecord.projectId !== projectId) {
        return res.status(404).json({ message: "Research job not found" });
      }

      if (briefRecord.status === "completed") {
        const brief = briefRecord.brief as unknown as PopulationBrief;
        console.log(`[PersonaGeneration] Research status: completed | brief=${briefId}`);
        return res.json({
          status: "completed",
          briefId: briefRecord.id,
          brief,
          citations: (briefRecord.citations as any[]) ?? [],
          ungrounded: briefRecord.isUngrounded,
        });
      }

      if (briefRecord.status === "failed") {
        console.log(`[PersonaGeneration] Research status: failed | brief=${briefId} | error=${briefRecord.errorMessage}`);
        return res.json({
          status: "failed",
          briefId: briefRecord.id,
          errorMessage: briefRecord.errorMessage ?? "Research failed unexpectedly.",
        });
      }

      const ageMs = Date.now() - new Date(briefRecord.createdAt!).getTime();
      const MAX_RESEARCH_AGE_MS = 15 * 60 * 1000;
      if (ageMs > MAX_RESEARCH_AGE_MS) {
        console.warn(`[PersonaGeneration] Research stuck for ${Math.round(ageMs / 1000)}s, auto-failing | brief=${briefId}`);
        try {
          await storage.updatePopulationBrief(briefId, {
            status: "failed",
            errorMessage: "Research took too long and was automatically cancelled. Please try again.",
          });
        } catch (e) {
          console.error(`[PersonaGeneration] Failed to auto-fail stuck research | brief=${briefId}`, e);
        }
        return res.json({
          status: "failed",
          briefId: briefRecord.id,
          errorMessage: "Research took too long and was automatically cancelled. Please try again.",
        });
      }

      console.log(`[PersonaGeneration] Research status: researching | brief=${briefId} | age=${Math.round(ageMs / 1000)}s`);
      res.json({ status: "researching", briefId: briefRecord.id });
    } catch (error) {
      console.error("[PersonaGeneration] GET /research/:briefId/status failed:", error);
      res.status(500).json({ message: "Failed to check research status" });
    }
  });

  app.get("/api/projects/:projectId/personas/briefs", isAuthenticated, async (req: any, res) => {
    const { projectId } = req.params;
    try {
      const userId = getUserId(req);
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const briefs = await storage.getPopulationBriefsByProject(projectId);
      const summaries = briefs
        .filter((rec) => rec.status === "completed" && rec.brief)
        .map((rec) => {
          const b = rec.brief as unknown as PopulationBrief;
          return {
            id: rec.id,
            researchPrompt: rec.researchPrompt,
            targetPopulation: b.targetPopulation,
            confidence: rec.confidence,
            isUngrounded: rec.isUngrounded,
            sourceCount: b.sources?.length ?? 0,
            suggestedProfileCount: b.suggestedPersonaProfiles?.length ?? 0,
            behavioralPatternCount: b.behavioralPatterns?.length ?? 0,
            demographicDimensionCount: b.demographics?.distributions?.length ?? 0,
            createdAt: rec.createdAt,
          };
        });
      res.json(summaries);
    } catch (error) {
      console.error("[PersonaGeneration] GET /briefs failed:", error);
      res.status(500).json({ message: "Failed to fetch population briefs" });
    }
  });

  app.get("/api/projects/:projectId/personas/briefs/:briefId", isAuthenticated, async (req: any, res) => {
    const { projectId, briefId } = req.params;
    try {
      const userId = getUserId(req);
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const briefRecord = await storage.getPopulationBrief(briefId);
      if (!briefRecord || briefRecord.projectId !== projectId) {
        return res.status(404).json({ message: "Population brief not found" });
      }
      res.json(briefRecord);
    } catch (error) {
      console.error("[PersonaGeneration] GET /briefs/:briefId failed:", error);
      res.status(500).json({ message: "Failed to fetch population brief" });
    }
  });

  app.post("/api/projects/:projectId/personas/synthesize", isAuthenticated, async (req: any, res) => {
    const requestStart = Date.now();
    const { projectId } = req.params;
    console.log(`[PersonaGeneration] POST /synthesize received | project=${projectId}`);

    try {
      const userId = getUserId(req);

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parseResult = synthesizeInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        console.warn(`[PersonaGeneration] Synthesize validation failed | project=${projectId} | error=${fromError(parseResult.error).toString()}`);
        return res.status(400).json({ message: fromError(parseResult.error).toString() });
      }

      const { briefId, personaCount, diversityMode, edgeCases } = parseResult.data;

      const briefRecord = await storage.getPopulationBrief(briefId);
      if (!briefRecord || briefRecord.projectId !== projectId) {
        return res.status(404).json({ message: "Population brief not found" });
      }

      if (briefRecord.status !== "completed" || !briefRecord.brief) {
        return res.status(400).json({ message: "Population brief is not ready yet. Please wait for research to complete." });
      }

      const brief = briefRecord.brief as unknown as PopulationBrief;
      const workspace = await storage.getWorkspace(
        (await storage.getProject(projectId))?.workspaceId ?? "",
      );
      const workspaceId = workspace?.id ?? "";

      const job = await storage.createSynthesisJob({
        projectId,
        briefId,
        personaCount,
        diversityMode,
        edgeCases,
        status: "synthesizing",
      });

      console.log(`[PersonaGeneration] Synthesis job created | jobId=${job.id} | project=${projectId} | briefId=${briefId} | personaCount=${personaCount}`);

      res.json({ jobId: job.id, status: "synthesizing" });

      runSynthesisInBackground({
        jobId: job.id,
        projectId,
        brief,
        config: { personaCount, diversityMode, edgeCases },
        attribution: { workspaceId, projectId },
        requestStart,
      });
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      console.error(`[PersonaGeneration] POST /synthesize failed | project=${projectId} | error=${errorMsg}`);
      res.status(500).json({ message: `Persona generation failed: ${errorMsg}` });
    }
  });

  app.get("/api/projects/:projectId/personas/synthesize/:jobId/status", isAuthenticated, async (req: any, res) => {
    const { projectId, jobId } = req.params;
    try {
      const userId = getUserId(req);
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const job = await storage.getSynthesisJob(jobId);
      if (!job || job.projectId !== projectId) {
        return res.status(404).json({ message: "Synthesis job not found" });
      }

      if (job.status === "completed") {
        console.log(`[PersonaGeneration] Synthesis status: completed | job=${jobId}`);
        return res.json({
          status: "completed",
          jobId: job.id,
          personas: (job.personas as any[]) ?? [],
          validationWarnings: (job.validationWarnings as string[]) ?? [],
        });
      }

      if (job.status === "failed") {
        console.log(`[PersonaGeneration] Synthesis status: failed | job=${jobId} | error=${job.errorMessage}`);
        return res.json({
          status: "failed",
          jobId: job.id,
          errorMessage: job.errorMessage ?? "Synthesis failed unexpectedly.",
        });
      }

      const ageMs = Date.now() - new Date(job.createdAt!).getTime();
      const MAX_SYNTHESIS_AGE_MS = 10 * 60 * 1000;
      if (ageMs > MAX_SYNTHESIS_AGE_MS) {
        console.warn(`[PersonaGeneration] Synthesis stuck for ${Math.round(ageMs / 1000)}s, auto-failing | job=${jobId}`);
        try {
          await storage.updateSynthesisJob(jobId, {
            status: "failed",
            errorMessage: "Persona generation took too long and was automatically cancelled. Please try again.",
          });
        } catch (e) {
          console.error(`[PersonaGeneration] Failed to auto-fail stuck synthesis | job=${jobId}`, e);
        }
        return res.json({
          status: "failed",
          jobId: job.id,
          errorMessage: "Persona generation took too long and was automatically cancelled. Please try again.",
        });
      }

      console.log(`[PersonaGeneration] Synthesis status: synthesizing | job=${jobId} | age=${Math.round(ageMs / 1000)}s`);
      res.json({ status: "synthesizing", jobId: job.id });
    } catch (error) {
      console.error("[PersonaGeneration] GET /synthesize/:jobId/status failed:", error);
      res.status(500).json({ message: "Failed to check synthesis status" });
    }
  });
}

async function runResearchInBackground(params: {
  briefId: string;
  projectId: string;
  project: any;
  workspaceId: string;
  researchPrompt: string;
  additionalContext?: string;
  uploadedFile?: { data: string; fileName: string; mimeType: string };
  requestStart: number;
}) {
  const { briefId, projectId, project, workspaceId, researchPrompt, additionalContext, uploadedFile, requestStart } = params;

  try {
    console.log(`[PersonaGeneration] Background research starting | brief=${briefId} | project=${projectId}`);

    const { brief, citations, ungrounded } = await researchPopulation({
      researchPrompt,
      project,
      additionalContext,
      uploadedFile,
      attribution: { workspaceId, projectId },
    });

    await storage.updatePopulationBrief(briefId, {
      brief: brief as any,
      confidence: brief.confidence,
      isUngrounded: ungrounded ?? false,
      citations: citations as any,
      status: "completed",
    });

    console.log(`[PersonaGeneration] Background research completed | brief=${briefId} | project=${projectId} | confidence=${brief.confidence} | citations=${citations.length} | elapsed=${elapsed(requestStart)}`);
  } catch (error: any) {
    const errorMsg = error?.message ?? String(error);
    console.error(`[PersonaGeneration] Background research failed | brief=${briefId} | project=${projectId} | error=${errorMsg} | elapsed=${elapsed(requestStart)}`);

    try {
      let userMessage = "Research failed unexpectedly. Please try again.";
      if (error?.message?.includes("aborted") || error?.name === "AbortError") {
        userMessage = "Research timed out. Please try again with a more specific prompt.";
      }
      const status = error?.status ?? error?.statusCode;
      if (status === 429) {
        userMessage = "The AI service is temporarily overloaded. Please wait a minute and try again.";
      }
      if (status === 401 || status === 403) {
        userMessage = "AI service authentication failed. Please check the OpenAI API key configuration.";
      }

      await storage.updatePopulationBrief(briefId, {
        status: "failed",
        errorMessage: userMessage,
      });
    } catch (updateError) {
      console.error(`[PersonaGeneration] Failed to update brief status to failed | brief=${briefId}`, updateError);
    }
  }
}

async function runSynthesisInBackground(params: {
  jobId: string;
  projectId: string;
  brief: PopulationBrief;
  config: { personaCount: number; diversityMode: DiversityMode; edgeCases: boolean };
  attribution: { workspaceId: string; projectId: string };
  requestStart: number;
}) {
  const { jobId, projectId, brief, config, attribution, requestStart } = params;

  try {
    console.log(`[PersonaGeneration] Background synthesis starting | job=${jobId} | project=${projectId}`);

    let personas = await synthesizePersonas({ brief, config, attribution });
    let validationWarnings: string[] = [];

    const validation = validatePersonaDiversity(personas, config.diversityMode);
    if (!validation.valid) {
      console.log(`[PersonaGeneration] Diversity validation failed, retrying with correction | job=${jobId} | errors=${validation.errors.length} | elapsed=${elapsed(requestStart)}`);
      const correctionPrompt = buildCorrectionPrompt(validation.errors);
      personas = await synthesizePersonas({ brief, config, attribution, correctionPrompt });

      const retryValidation = validatePersonaDiversity(personas, config.diversityMode);
      if (!retryValidation.valid) {
        validationWarnings = retryValidation.errors.map((e) => `Diversity issue: ${e}`);
        console.warn(`[PersonaGeneration] Retry still failed validation | job=${jobId} | warnings=${validationWarnings.length} | elapsed=${elapsed(requestStart)}`);
      }
    }

    await storage.updateSynthesisJob(jobId, {
      status: "completed",
      personas: personas as any,
      validationWarnings: validationWarnings.length > 0 ? validationWarnings as any : null,
    });

    console.log(`[PersonaGeneration] Background synthesis completed | job=${jobId} | project=${projectId} | personasGenerated=${personas.length} | warnings=${validationWarnings.length} | elapsed=${elapsed(requestStart)}`);
  } catch (error: any) {
    const errorMsg = error?.message ?? String(error);
    console.error(`[PersonaGeneration] Background synthesis failed | job=${jobId} | project=${projectId} | error=${errorMsg} | elapsed=${elapsed(requestStart)}`);

    try {
      let userMessage = "Persona generation failed unexpectedly. Please try again.";
      if (error?.message?.includes("aborted") || error?.name === "AbortError") {
        userMessage = "Persona generation timed out. Please try again.";
      }
      const status = error?.status ?? error?.statusCode;
      if (status === 429) {
        userMessage = "The AI service is temporarily overloaded. Please wait a minute and try again.";
      }
      if (status === 401 || status === 403) {
        userMessage = "AI service authentication failed. Please check the OpenAI API key configuration.";
      }

      await storage.updateSynthesisJob(jobId, {
        status: "failed",
        errorMessage: userMessage,
      });
    } catch (updateError) {
      console.error(`[PersonaGeneration] Failed to update synthesis job status to failed | job=${jobId}`, updateError);
    }
  }
}
