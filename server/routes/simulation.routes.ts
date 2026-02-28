import type { Express } from "express";
import { isAuthenticated, getUserId } from "../auth";
import { storage } from "../storage";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import {
  createSimulationRun,
  getSimulationRun,
  getSimulationRunsByCollection,
  getPersona,
} from "../storage/simulation";
import { executeSimulationRun, cancelSimulationRun, SIMULATION_LIMITS } from "../simulation";

const launchSimulationSchema = z.object({
  personaIds: z.array(z.string()).min(1).max(SIMULATION_LIMITS.MAX_PERSONAS_PER_RUN),
  enableBarbara: z.boolean().default(true),
  enableSummaries: z.boolean().default(true),
  enableAdditionalQuestions: z.boolean().default(true),
});

export function registerSimulationRoutes(app: Express) {
  app.post("/api/collections/:collectionId/simulate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { collectionId } = req.params;

      const hasAccess = await storage.verifyUserAccessToCollection(userId, collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parseResult = launchSimulationSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const { personaIds, enableBarbara, enableSummaries, enableAdditionalQuestions } = parseResult.data;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      const template = await storage.getTemplate(collection.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      const projectId = template.projectId;

      for (const personaId of personaIds) {
        const persona = await getPersona(personaId);
        if (!persona) {
          return res.status(400).json({ message: `Persona ${personaId} not found` });
        }
        if (persona.projectId !== projectId) {
          return res.status(400).json({ message: `Persona ${persona.name} belongs to a different project` });
        }
      }

      const run = await createSimulationRun({
        collectionId,
        launchedBy: userId,
        personaIds,
        totalSimulations: personaIds.length,
        enableBarbara,
        enableSummaries,
        enableAdditionalQuestions,
      });

      executeSimulationRun(
        run.id, collectionId, personaIds, userId,
        { enableBarbara, enableSummaries, enableAdditionalQuestions },
      ).catch((err) => {
        console.error(`[Simulation] Background run ${run.id} error:`, err);
      });

      res.status(201).json(run);
    } catch (error) {
      console.error("Error launching simulation:", error);
      res.status(500).json({ message: "Failed to launch simulation" });
    }
  });

  app.get("/api/collections/:collectionId/simulation-runs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { collectionId } = req.params;

      const hasAccess = await storage.verifyUserAccessToCollection(userId, collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const runs = await getSimulationRunsByCollection(collectionId);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching simulation runs:", error);
      res.status(500).json({ message: "Failed to fetch simulation runs" });
    }
  });

  app.get("/api/simulation-runs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const run = await getSimulationRun(req.params.id);
      if (!run) {
        return res.status(404).json({ message: "Simulation run not found" });
      }

      const userId = getUserId(req);
      const hasAccess = await storage.verifyUserAccessToCollection(userId, run.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(run);
    } catch (error) {
      console.error("Error fetching simulation run:", error);
      res.status(500).json({ message: "Failed to fetch simulation run" });
    }
  });

  app.post("/api/simulation-runs/:id/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const run = await getSimulationRun(req.params.id);
      if (!run) {
        return res.status(404).json({ message: "Simulation run not found" });
      }

      const userId = getUserId(req);
      const hasAccess = await storage.verifyUserAccessToCollection(userId, run.collectionId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (run.status !== "running" && run.status !== "pending") {
        return res.status(400).json({ message: "Can only cancel running or pending simulations" });
      }

      await cancelSimulationRun(run.id);

      res.json({ message: "Simulation cancelled" });
    } catch (error) {
      console.error("Error cancelling simulation:", error);
      res.status(500).json({ message: "Failed to cancel simulation" });
    }
  });
}
