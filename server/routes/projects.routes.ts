import express from "express";
import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { insertProjectSchema } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export function registerProjectRoutes(app: Express) {
  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getProjectsByUser(userId);
      
      const projectsWithCounts = await Promise.all(
        projects.map(async (project) => {
          const templates = await storage.getTemplatesByProject(project.id);
          let totalSessions = 0;
          
          for (const template of templates) {
            const collections = await storage.getCollectionsByTemplate(template.id);
            for (const collection of collections) {
              const sessions = await storage.getSessionsByCollection(collection.id);
              totalSessions += sessions.length;
            }
          }
          
          return {
            ...project,
            templateCount: templates.length,
            sessionCount: totalSessions
          };
        })
      );
      
      res.json(projectsWithCounts);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, project.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const templates = await storage.getTemplatesByProject(project.id);
      let sessionCount = 0;
      for (const template of templates) {
        const collections = await storage.getCollectionsByTemplate(template.id);
        for (const collection of collections) {
          const sessions = await storage.getSessionsByCollection(collection.id);
          sessionCount += sessions.filter(s => s.status === "completed").length;
        }
      }
      
      res.json({
        ...project,
        templateCount: templates.length,
        sessionCount,
      });
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  const createProjectSchema = insertProjectSchema.omit({ workspaceId: true }).extend({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    objective: z.string().max(1000).optional(),
    avoidRules: z.array(z.string()).optional(),
    strategicContext: z.string().max(2000).optional(),
    contextType: z.enum(["content", "product", "marketing", "cx", "other"]).optional(),
    brandingLogo: z.string().max(200_000).nullable().optional(),
  });

  app.post("/api/projects", express.json({ limit: "1mb" }), isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const parseResult = createProjectSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      let workspaces = await storage.getWorkspacesByOwner(userId);
      if (workspaces.length === 0) {
        const workspace = await storage.createWorkspace({
          name: "My Workspace",
          ownerId: userId,
        });
        workspaces = [workspace];
      }

      const project = await storage.createProject({
        ...parseResult.data,
        workspaceId: workspaces[0].id,
      });
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", express.json({ limit: "1mb" }), isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const hasAccess = await storage.verifyUserAccessToProject(userId, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const partialSchema = createProjectSchema.partial();
      const parseResult = partialSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }
      
      const project = await storage.updateProject(req.params.id, parseResult.data);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });
}
