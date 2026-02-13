import type { Express } from "express";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { storage } from "../storage";
import { parseQuestions } from "../question-parser";
import type { LLMUsageAttribution } from "@shared/schema";

const isAuthenticated = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

const parseQuestionsSchema = z.object({
  rawText: z.string().min(1, "Paste content is required").max(10000, "Content exceeds 10,000 character limit"),
  existingQuestions: z.array(z.string()).optional(),
  templateObjective: z.string().optional(),
});

export function registerParseQuestionsRoutes(app: Express) {
  app.post("/api/projects/:projectId/parse-questions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = req.params.projectId;

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const parseResult = parseQuestionsSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const { rawText, existingQuestions, templateObjective } = parseResult.data;

      const usageContext: LLMUsageAttribution = {
        projectId,
      };

      const result = await parseQuestions({
        rawText,
        existingQuestions,
        templateObjective,
        projectId,
      }, usageContext);

      res.json(result);
    } catch (error: any) {
      console.error("Error parsing questions:", error);
      res.status(500).json({
        message: error?.message === "No content in LLM response"
          ? "Failed to parse questions. The AI returned an empty response. Please try again."
          : "Failed to parse questions. Please try again.",
      });
    }
  });
}
