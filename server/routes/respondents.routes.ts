import type { Express } from "express";
import crypto from "crypto";
import { isAuthenticated, getUserId } from "../auth";
import { storage } from "../storage";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export function registerRespondentRoutes(app: Express) {
  app.get("/api/collections/:collectionId/respondents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const respondentList = await storage.getRespondentsByCollection(req.params.collectionId);
      res.json(respondentList);
    } catch (error) {
      console.error("Error fetching respondents:", error);
      res.status(500).json({ message: "Failed to fetch respondents" });
    }
  });

  const inviteRespondentSchema = z.object({
    email: z.string().email().optional().nullable(),
    fullName: z.string().max(200).optional().nullable(),
    informalName: z.string().max(100).optional().nullable(),
  }).refine(data => data.email || data.fullName, {
    message: "Either email or full name is required",
  });

  app.post("/api/collections/:collectionId/respondents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const parseResult = inviteRespondentSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { email, fullName, informalName } = parseResult.data;
      
      if (email) {
        const existing = await storage.getRespondentByEmail(req.params.collectionId, email);
        if (existing) {
          return res.status(400).json({ message: "A respondent with this email already exists" });
        }
      }
      
      const invitationToken = crypto.randomBytes(24).toString('base64url');
      
      const respondent = await storage.createRespondent({
        collectionId: req.params.collectionId,
        email: email || null,
        fullName: fullName || null,
        informalName: informalName || null,
        invitationToken,
        invitationStatus: "invited",
      });
      
      res.status(201).json(respondent);
    } catch (error) {
      console.error("Error inviting respondent:", error);
      res.status(500).json({ message: "Failed to invite respondent" });
    }
  });

  const bulkInviteSchema = z.object({
    respondents: z.array(z.object({
      email: z.string().email().optional().nullable(),
      fullName: z.string().max(200).optional().nullable(),
      informalName: z.string().max(100).optional().nullable(),
    })).min(1, "At least one respondent is required").max(500, "Maximum 500 respondents per batch"),
  });

  app.post("/api/collections/:collectionId/respondents/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const hasAccess = await storage.verifyUserAccessToCollection(userId, req.params.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const parseResult = bulkInviteSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const { respondents: inputRespondents } = parseResult.data;
      
      const existingEmails = new Set<string>();
      const existingRespondents = await storage.getRespondentsByCollection(req.params.collectionId);
      existingRespondents.forEach(r => {
        if (r.email) existingEmails.add(r.email.toLowerCase());
      });
      
      const toCreate: Array<{
        collectionId: string;
        email: string | null;
        fullName: string | null;
        informalName: string | null;
        invitationToken: string;
        invitationStatus: "invited";
      }> = [];
      const skipped: string[] = [];
      const seenEmails = new Set<string>();
      
      for (const r of inputRespondents) {
        const email = r.email?.toLowerCase().trim();
        
        if (email && (existingEmails.has(email) || seenEmails.has(email))) {
          skipped.push(email);
          continue;
        }
        
        if (email) seenEmails.add(email);
        
        toCreate.push({
          collectionId: req.params.collectionId,
          email: r.email?.trim() || null,
          fullName: r.fullName?.trim() || null,
          informalName: r.informalName?.trim() || null,
          invitationToken: crypto.randomBytes(24).toString('base64url'),
          invitationStatus: "invited",
        });
      }
      
      const created = await storage.createRespondents(toCreate);
      
      res.status(201).json({
        created: created.length,
        skipped: skipped.length,
        skippedEmails: skipped,
        respondents: created,
      });
    } catch (error) {
      console.error("Error bulk inviting respondents:", error);
      res.status(500).json({ message: "Failed to bulk invite respondents" });
    }
  });
}
