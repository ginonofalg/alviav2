import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { getInfographicService } from "../infographic-service";
import { InfographicPromptBuilder } from "../infographic-prompts";
import { recordLlmUsageEvent } from "../llm-usage";
import type { LLMUsageAttribution, CollectionAnalytics, ProjectAnalytics } from "@shared/schema";

export function registerInfographicRoutes(app: Express) {

  app.post("/api/collections/:collectionId/infographic/summary", isAuthenticated, async (req, res) => {
    try {
      const { collectionId } = req.params;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      if (!collection.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh analytics first." });
      }

      const analytics = collection.analyticsData as CollectionAnalytics;
      const prompt = InfographicPromptBuilder.buildCollectionSummary(
        collection.name,
        analytics
      );

      console.log("[Infographic] Generating summary for collection:", collectionId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      if (result.usage) {
        const infographicAttribution: LLMUsageAttribution = {
          collectionId: collectionId,
        };
        recordLlmUsageEvent(
          infographicAttribution,
          "gemini",
          result.model || "gemini-2.0-flash-preview-image-generation",
          "infographic_collection_summary",
          result.usage,
          result.usage.totalTokens > 0 ? "success" : "missing_usage",
        ).catch(err => console.error("[LLM Usage] Failed to record infographic usage:", err));
      }

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/collections/:collectionId/infographic/themes", isAuthenticated, async (req, res) => {
    try {
      const { collectionId } = req.params;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      if (!collection.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh analytics first." });
      }

      const analytics = collection.analyticsData as CollectionAnalytics;
      const prompt = InfographicPromptBuilder.buildThemeNetwork(
        collection.name,
        analytics.themes
      );

      console.log("[Infographic] Generating theme network for collection:", collectionId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      if (result.usage) {
        const infographicAttribution: LLMUsageAttribution = {
          collectionId: collectionId,
        };
        recordLlmUsageEvent(
          infographicAttribution,
          "gemini",
          result.model || "gemini-2.0-flash-preview-image-generation",
          "infographic_collection_themes",
          result.usage,
          result.usage.totalTokens > 0 ? "success" : "missing_usage",
        ).catch(err => console.error("[LLM Usage] Failed to record infographic usage:", err));
      }

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/collections/:collectionId/infographic/findings", isAuthenticated, async (req, res) => {
    try {
      const { collectionId } = req.params;

      const collection = await storage.getCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      if (!collection.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh analytics first." });
      }

      const analytics = collection.analyticsData as CollectionAnalytics;
      const prompt = InfographicPromptBuilder.buildKeyFindings(
        collection.name,
        analytics
      );

      console.log("[Infographic] Generating key findings for collection:", collectionId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      if (result.usage) {
        const infographicAttribution: LLMUsageAttribution = {
          collectionId: collectionId,
        };
        recordLlmUsageEvent(
          infographicAttribution,
          "gemini",
          result.model || "gemini-2.0-flash-preview-image-generation",
          "infographic_collection_findings",
          result.usage,
          result.usage.totalTokens > 0 ? "success" : "missing_usage",
        ).catch(err => console.error("[LLM Usage] Failed to record infographic usage:", err));
      }

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/projects/:projectId/infographic/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!project.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh project analytics first." });
      }

      const analytics = project.analyticsData as ProjectAnalytics;
      const prompt = InfographicPromptBuilder.buildProjectSummary(
        project.name,
        analytics
      );

      console.log("[Infographic] Generating project summary for:", projectId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      if (result.usage) {
        const infographicAttribution: LLMUsageAttribution = {
          projectId: projectId,
        };
        recordLlmUsageEvent(
          infographicAttribution,
          "gemini",
          result.model || "gemini-2.0-flash-preview-image-generation",
          "infographic_project_summary",
          result.usage,
          result.usage.totalTokens > 0 ? "success" : "missing_usage",
        ).catch(err => console.error("[LLM Usage] Failed to record infographic usage:", err));
      }

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Project summary generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/projects/:projectId/infographic/themes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!project.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh project analytics first." });
      }

      const analytics = project.analyticsData as ProjectAnalytics;
      const prompt = InfographicPromptBuilder.buildProjectThemeNetwork(
        project.name,
        analytics
      );

      console.log("[Infographic] Generating project theme network for:", projectId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      if (result.usage) {
        const infographicAttribution: LLMUsageAttribution = {
          projectId: projectId,
        };
        recordLlmUsageEvent(
          infographicAttribution,
          "gemini",
          result.model || "gemini-2.0-flash-preview-image-generation",
          "infographic_project_themes",
          result.usage,
          result.usage.totalTokens > 0 ? "success" : "missing_usage",
        ).catch(err => console.error("[LLM Usage] Failed to record infographic usage:", err));
      }

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Project themes generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });

  app.post("/api/projects/:projectId/infographic/insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const hasAccess = await storage.verifyUserAccessToProject(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!project.analyticsData) {
        return res.status(400).json({ error: "Analytics not available. Please refresh project analytics first." });
      }

      const analytics = project.analyticsData as ProjectAnalytics;
      const prompt = InfographicPromptBuilder.buildProjectStrategicInsights(
        project.name,
        analytics
      );

      console.log("[Infographic] Generating project strategic insights for:", projectId);

      const infographicService = getInfographicService();
      const result = await infographicService.generateInfographic(prompt);

      if (result.usage) {
        const infographicAttribution: LLMUsageAttribution = {
          projectId: projectId,
        };
        recordLlmUsageEvent(
          infographicAttribution,
          "gemini",
          result.model || "gemini-2.0-flash-preview-image-generation",
          "infographic_project_insights",
          result.usage,
          result.usage.totalTokens > 0 ? "success" : "missing_usage",
        ).catch(err => console.error("[LLM Usage] Failed to record infographic usage:", err));
      }

      res.json({
        success: true,
        id: result.id,
        imageUrl: result.imageUrl,
        model: result.model,
      });
    } catch (error: any) {
      console.error("[Infographic] Project insights generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate infographic" });
    }
  });
}
