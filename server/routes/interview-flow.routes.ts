import type { Express } from "express";
import { storage } from "../storage";
import { generateResumeToken, hashToken, getTokenExpiryDate } from "../resume-token";
import { insertSegmentSchema } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export function registerInterviewFlowRoutes(app: Express) {
  const updateRespondentNamesSchema = z.object({
    fullName: z.string().max(200).nullable().optional(),
    informalName: z.string().max(100).nullable().optional(),
  });

  app.patch("/api/respondents/:respondentId/names", async (req, res) => {
    try {
      const parseResult = updateRespondentNamesSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const updates: { fullName?: string; informalName?: string } = {};
      if (parseResult.data.fullName) {
        updates.fullName = parseResult.data.fullName;
      }
      if (parseResult.data.informalName) {
        updates.informalName = parseResult.data.informalName;
      }

      if (Object.keys(updates).length === 0) {
        const existingRespondent = await storage.getRespondent(req.params.respondentId);
        if (!existingRespondent) {
          return res.status(404).json({ message: "Respondent not found" });
        }
        return res.json(existingRespondent);
      }

      const respondent = await storage.updateRespondent(req.params.respondentId, updates);

      if (!respondent) {
        return res.status(404).json({ message: "Respondent not found" });
      }

      res.json(respondent);
    } catch (error) {
      console.error("Error updating respondent names:", error);
      res.status(500).json({ message: "Failed to update names" });
    }
  });

  const startSessionSchema = z.object({
    consents: z.object({
      participation: z.boolean(),
      audioRecording: z.boolean().optional(),
      dataProcessing: z.boolean(),
    }).optional(),
  });

  app.post("/api/collections/:collectionId/sessions", async (req: any, res) => {
    try {
      const parseResult = startSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      if (!collection.isActive) {
        return res.status(400).json({ message: "This collection is no longer accepting responses" });
      }

      const userId = req.user?.claims?.sub || null;
      
      let respondent;
      if (userId) {
        const existingRespondent = await storage.getRespondentByUserId(req.params.collectionId, userId);
        if (existingRespondent) {
          respondent = existingRespondent;
          await storage.updateRespondent(respondent.id, {
            consentGivenAt: new Date(),
          });
        } else {
          respondent = await storage.createRespondent({
            collectionId: req.params.collectionId,
            userId,
          });
          await storage.updateRespondent(respondent.id, {
            consentGivenAt: new Date(),
          });
        }
      } else {
        respondent = await storage.createRespondent({
          collectionId: req.params.collectionId,
        });
        await storage.updateRespondent(respondent.id, {
          consentGivenAt: new Date(),
        });
      }

      const session = await storage.createSession({
        collectionId: req.params.collectionId,
        respondentId: respondent.id,
        status: "consent_given",
      });
      
      const resumeToken = generateResumeToken();
      const tokenHash = hashToken(resumeToken);
      const expiresAt = getTokenExpiryDate();
      await storage.setResumeToken(session.id, tokenHash, expiresAt);
      
      const updatedSession = await storage.updateSession(session.id, {
        startedAt: new Date(),
      });

      res.status(201).json({ ...updatedSession, resumeToken });
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  const startByTokenSchema = z.object({
    token: z.string().min(1, "Token is required"),
  });
  
  app.post("/api/collections/:collectionId/start-by-token", async (req, res) => {
    try {
      const parseResult = startByTokenSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { token } = parseResult.data;
      
      const respondent = await storage.getRespondentByToken(token);
      if (!respondent) {
        return res.status(404).json({ message: "Invalid invitation token" });
      }
      
      if (respondent.collectionId !== req.params.collectionId) {
        return res.status(400).json({ message: "Token does not match this collection" });
      }
      
      const collection = await storage.getCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      if (!collection.isActive) {
        return res.status(400).json({ message: "This collection is no longer accepting responses" });
      }
      
      await storage.updateRespondent(respondent.id, {
        consentGivenAt: new Date(),
        invitationStatus: "consented",
      });
      
      const session = await storage.createSession({
        collectionId: req.params.collectionId,
        respondentId: respondent.id,
        status: "consent_given",
      });
      
      const resumeToken = generateResumeToken();
      const tokenHash = hashToken(resumeToken);
      const expiresAt = getTokenExpiryDate();
      await storage.setResumeToken(session.id, tokenHash, expiresAt);
      
      const updatedSession = await storage.updateSession(session.id, {
        startedAt: new Date(),
      });

      res.status(201).json({ ...updatedSession, resumeToken, respondent });
    } catch (error) {
      console.error("Error starting session by token:", error);
      res.status(500).json({ message: "Failed to start session" });
    }
  });

  app.get("/api/invitation/:token", async (req, res) => {
    try {
      const respondent = await storage.getRespondentByToken(req.params.token);
      if (!respondent) {
        return res.status(404).json({ message: "Invalid invitation token" });
      }
      
      const collection = await storage.getCollection(respondent.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      if (respondent.invitationStatus === "invited") {
        await storage.updateRespondent(respondent.id, {
          invitationStatus: "clicked",
          clickedAt: new Date(),
        });
      }
      
      const template = await storage.getTemplate(collection.templateId);
      
      res.json({
        respondent: {
          id: respondent.id,
          fullName: respondent.fullName,
          informalName: respondent.informalName,
          email: respondent.email,
        },
        collection: {
          id: collection.id,
          name: collection.name,
          isActive: collection.isActive,
        },
        template: template ? {
          id: template.id,
          name: template.name,
        } : null,
      });
    } catch (error) {
      console.error("Error looking up invitation:", error);
      res.status(500).json({ message: "Failed to lookup invitation" });
    }
  });

  const updateSessionSchema = z.object({
    status: z.enum(["pending", "consent_given", "in_progress", "paused", "completed", "abandoned"]).optional(),
    currentQuestionIndex: z.number().optional(),
    totalDurationMs: z.number().optional(),
    satisfactionRating: z.number().min(1).max(5).optional(),
    closingComments: z.string().optional(),
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const parseResult = updateSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const updateData: any = { ...parseResult.data };
      
      if (updateData.status === "completed") {
        updateData.completedAt = new Date();
      } else if (updateData.status === "paused") {
        updateData.pausedAt = new Date();
      } else if (updateData.status === "in_progress") {
        updateData.pausedAt = null;
      }
      
      const session = await storage.updateSession(req.params.id, updateData);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (updateData.status === "completed" && session.respondentId) {
        try {
          await storage.updateRespondent(session.respondentId, {
            invitationStatus: "completed",
          });
        } catch (e) {
          console.warn("Could not update respondent status:", e);
        }
      }
      
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  const createSegmentSchema = insertSegmentSchema.extend({
    questionId: z.string().min(1),
  });

  app.post("/api/sessions/:sessionId/segments", async (req, res) => {
    try {
      const parseResult = createSegmentSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const segment = await storage.createSegment({
        ...parseResult.data,
        sessionId: req.params.sessionId,
      });
      res.status(201).json(segment);
    } catch (error) {
      console.error("Error creating segment:", error);
      res.status(500).json({ message: "Failed to create segment" });
    }
  });

  const updateSegmentSchema = z.object({
    transcript: z.string().optional(),
    summaryBullets: z.array(z.string()).optional(),
    keyQuotes: z.any().optional(),
    extractedValues: z.any().optional(),
    confidence: z.number().min(0).max(100).optional(),
    qualityFlags: z.array(z.string()).optional(),
  });

  app.patch("/api/segments/:id", async (req, res) => {
    try {
      const parseResult = updateSegmentSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const segment = await storage.updateSegment(req.params.id, parseResult.data);
      if (!segment) {
        return res.status(404).json({ message: "Segment not found" });
      }
      res.json(segment);
    } catch (error) {
      console.error("Error updating segment:", error);
      res.status(500).json({ message: "Failed to update segment" });
    }
  });
}
