import type { Express } from "express";
import { isAuthenticated, getUserId } from "../auth";
import { storage } from "../storage";
import { generateTemplateFromProject } from "../barbara-orchestrator";
import { insertTemplateSchema } from "@shared/schema";
import type { LLMUsageAttribution } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export function registerTemplateRoutes(app: Express) {
  app.get("/api/templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const templates = await storage.getTemplatesByUser(userId);
      const templatesWithCounts = await Promise.all(
        templates.map(async (template) => {
          const questions = await storage.getQuestionsByTemplate(template.id);
          return {
            ...template,
            questionCount: questions.length,
          };
        })
      );
      res.json(templatesWithCounts);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.get("/api/projects/:projectId/templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const templates = await storage.getTemplatesByProject(req.params.projectId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  const createTemplateWithQuestionsSchema = insertTemplateSchema.omit({ projectId: true }).extend({
    name: z.string().min(1).max(100),
    defaultRecommendedFollowUps: z.number().min(0).max(10).optional(),
    questions: z.array(z.object({
      questionText: z.string().min(1),
      questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
      guidance: z.string().optional(),
      scaleMin: z.number().optional(),
      scaleMax: z.number().optional(),
      multiSelectOptions: z.array(z.string()).optional(),
      timeHintSeconds: z.number().optional(),
      recommendedFollowUps: z.number().min(0).max(10).optional(),
      isRequired: z.boolean().default(true),
    })).optional(),
  });

  app.post("/api/projects/:projectId/templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const parseResult = createTemplateWithQuestionsSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { questions: questionData, ...templateData } = parseResult.data;
      
      const template = await storage.createTemplate({
        ...templateData,
        projectId: req.params.projectId,
      });

      if (questionData && questionData.length > 0) {
        const questionsToCreate = questionData.map((q, index) => ({
          ...q,
          templateId: template.id,
          orderIndex: index,
        }));
        await storage.createQuestions(questionsToCreate);
      }

      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.post("/api/projects/:projectId/generate-template", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const projectId = req.params.projectId;
      
      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const templateGenUsageContext: LLMUsageAttribution = {
        projectId: projectId,
      };
      const generatedTemplate = await generateTemplateFromProject({
        projectName: project.name,
        description: project.description,
        objective: project.objective,
        audienceContext: project.audienceContext,
        contextType: project.contextType,
        strategicContext: project.strategicContext,
        tone: project.tone,
      }, templateGenUsageContext);
      
      res.json(generatedTemplate);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template. Please try again." });
    }
  });

  app.get("/api/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const questions = await storage.getQuestionsByTemplate(template.id);
      res.json({ ...template, questions });
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  const updateTemplateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    objective: z.string().max(1000).optional(),
    tone: z.string().optional(),
    constraints: z.string().optional(),
    defaultRecommendedFollowUps: z.number().min(0).max(10).optional().nullable(),
    questions: z.array(z.object({
      questionText: z.string().min(1),
      questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
      guidance: z.string().optional(),
      scaleMin: z.number().optional(),
      scaleMax: z.number().optional(),
      multiSelectOptions: z.array(z.string()).optional(),
      timeHintSeconds: z.number().optional(),
      recommendedFollowUps: z.number().min(0).max(10).optional().nullable(),
      isRequired: z.boolean().default(true),
    })).optional(),
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const hasAccess = await storage.verifyUserAccessToTemplate(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parseResult = updateTemplateSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const { questions: questionData, ...templateData } = parseResult.data;

      const updatedTemplate = await storage.updateTemplate(req.params.id, templateData);

      if (questionData) {
        await storage.deleteQuestionsByTemplate(req.params.id);
        if (questionData.length > 0) {
          const questionsToCreate = questionData.map((q, index) => ({
            ...q,
            templateId: req.params.id,
            orderIndex: index,
          }));
          await storage.createQuestions(questionsToCreate);
        }
      }

      const questions = await storage.getQuestionsByTemplate(req.params.id);
      res.json({ ...updatedTemplate, questions });
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });
}
