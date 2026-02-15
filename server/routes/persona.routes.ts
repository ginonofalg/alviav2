import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { insertPersonaSchema } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import {
  getPersona,
  getPersonasByProject,
  createPersona,
  updatePersona,
  archivePersona,
} from "../storage/simulation";

const personaCreateSchema = insertPersonaSchema.omit({ projectId: true }).extend({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  ageRange: z.string().max(50).optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  attitude: z.enum(["cooperative", "reluctant", "neutral", "evasive", "enthusiastic"]).default("cooperative"),
  verbosity: z.enum(["low", "medium", "high"]).default("medium"),
  domainKnowledge: z.enum(["none", "basic", "intermediate", "expert"]).default("basic"),
  traits: z.array(z.string()).default([]),
  communicationStyle: z.string().max(500).optional().nullable(),
  backgroundStory: z.string().max(2000).optional().nullable(),
  topicsToAvoid: z.array(z.string()).default([]),
  biases: z.array(z.string()).default([]),
  populationBriefId: z.string().optional().nullable(),
});

export function registerPersonaRoutes(app: Express) {
  app.get("/api/projects/:projectId/personas", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      const result = await getPersonasByProject(req.params.projectId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching personas:", error);
      res.status(500).json({ message: "Failed to fetch personas" });
    }
  });

  app.get("/api/personas/:id", isAuthenticated, async (req: any, res) => {
    try {
      const persona = await getPersona(req.params.id);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToProject(userId, persona.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(persona);
    } catch (error) {
      console.error("Error fetching persona:", error);
      res.status(500).json({ message: "Failed to fetch persona" });
    }
  });

  app.post("/api/projects/:projectId/personas", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      const parseResult = personaCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      const persona = await createPersona({
        ...parseResult.data,
        projectId: req.params.projectId,
      });
      res.status(201).json(persona);
    } catch (error) {
      console.error("Error creating persona:", error);
      res.status(500).json({ message: "Failed to create persona" });
    }
  });

  app.patch("/api/personas/:id", isAuthenticated, async (req: any, res) => {
    try {
      const persona = await getPersona(req.params.id);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToProject(userId, persona.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      const partialSchema = personaCreateSchema.partial();
      const parseResult = partialSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      const updated = await updatePersona(req.params.id, parseResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating persona:", error);
      res.status(500).json({ message: "Failed to update persona" });
    }
  });

  app.delete("/api/personas/:id", isAuthenticated, async (req: any, res) => {
    try {
      const persona = await getPersona(req.params.id);
      if (!persona) {
        return res.status(404).json({ message: "Persona not found" });
      }
      const userId = req.user.claims.sub;
      const hasAccess = await storage.verifyUserAccessToProject(userId, persona.projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      await archivePersona(req.params.id);
      res.json({ message: "Persona archived" });
    } catch (error) {
      console.error("Error archiving persona:", error);
      res.status(500).json({ message: "Failed to archive persona" });
    }
  });
}
