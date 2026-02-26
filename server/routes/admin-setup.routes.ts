import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { db } from "../db";
import {
  collections,
  interviewTemplates,
  projects,
  questions,
  workspaces,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const questionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
  guidance: z.string().optional(),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  multiSelectOptions: z.array(z.string()).optional(),
  timeHintSeconds: z.number().optional(),
  recommendedFollowUps: z.number().min(0).max(10).optional(),
  isRequired: z.boolean().default(true),
});

const quickSetupSchema = z.object({
  project: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    objective: z.string().max(1000).optional(),
    audienceContext: z.string().optional(),
    tone: z.string().default("professional"),
    timingGuidance: z.string().optional(),
    consentAudioRecording: z.boolean().default(true),
    piiRedactionEnabled: z.boolean().default(true),
    crossInterviewContext: z.boolean().default(false),
    avoidRules: z.array(z.string()).optional(),
    strategicContext: z.string().max(2000).optional(),
    contextType: z.enum(["content", "product", "marketing", "cx", "other"]).optional(),
  }),
  template: z.object({
    name: z.string().min(1).max(100),
    objective: z.string().max(1000).optional(),
    tone: z.string().optional(),
    constraints: z.string().optional(),
    defaultRecommendedFollowUps: z.number().min(0).max(10).optional(),
    questions: z.array(questionSchema).min(1),
  }),
  collection: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    targetResponses: z.number().min(1).optional(),
    voiceProvider: z.string().default("openai"),
    maxAdditionalQuestions: z.number().min(0).max(3).default(1),
    endOfInterviewSummaryEnabled: z.boolean().default(false),
    vadEagernessMode: z.enum(["auto", "high"]).default("auto"),
  }),
});

export function registerAdminSetupRoutes(app: Express) {
  app.post("/api/admin/quick-setup", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const parseResult = quickSetupSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const { project: projectData, template: templateData, collection: collectionData } = parseResult.data;

      const created = await db.transaction(async (tx) => {
        // Get or create workspace
        let ownerWorkspaces = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.ownerId, userId));
        if (ownerWorkspaces.length === 0) {
          const [workspace] = await tx
            .insert(workspaces)
            .values({
              name: "My Workspace",
              ownerId: userId,
            })
            .returning();
          ownerWorkspaces = [workspace];
        }
        const workspaceId = ownerWorkspaces[0].id;

        // Create project
        const [project] = await tx
          .insert(projects)
          .values({
            ...projectData,
            workspaceId,
          })
          .returning();

        // Create template
        const { questions: questionData, ...templateFields } = templateData;
        const [template] = await tx
          .insert(interviewTemplates)
          .values({
            ...templateFields,
            projectId: project.id,
          })
          .returning();

        // Create questions
        const questionsToCreate = questionData.map((q, index) => ({
          ...q,
          templateId: template.id,
          orderIndex: index,
        }));
        const createdQuestions = await tx
          .insert(questions)
          .values(questionsToCreate)
          .returning();

        // Create collection
        const [collection] = await tx
          .insert(collections)
          .values({
            ...collectionData,
            templateId: template.id,
          })
          .returning();

        return {
          workspaceId,
          project,
          template,
          questions: createdQuestions,
          collection,
        };
      });

      res.status(201).json({
        ...created,
        interviewUrl: `/join/${created.collection.id}`,
      });
    } catch (error) {
      console.error("Error in quick setup:", error);
      res.status(500).json({ message: "Failed to create quick setup" });
    }
  });
}
