import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer } from "ws";
import { clerkAuthMiddleware, registerAuthRoutes, registerWebhookRoutes } from "./auth";
import { handleVoiceInterview } from "./voice-interview";
import {
  registerAnalyticsRoutes,
  registerInfographicRoutes,
  registerProjectRoutes,
  registerTemplateRoutes,
  registerCollectionRoutes,
  registerRespondentRoutes,
  registerSessionRoutes,
  registerInterviewAccessRoutes,
  registerInterviewFlowRoutes,
  registerReviewRoutes,
  registerBarbaraRoutes,
  registerUsageRoutes,
  registerGuidanceRoutes,
  registerParseQuestionsRoutes,
  registerPersonaRoutes,
  registerSimulationRoutes,
  registerPersonaGenerationRoutes,
  registerAdminSetupRoutes,
} from "./routes/index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerWebhookRoutes(app);
  app.use(clerkAuthMiddleware());
  registerAuthRoutes(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws/interview" });
  
  wss.on("connection", (ws, req) => {
    console.log("[WebSocket] New connection on /ws/interview");
    handleVoiceInterview(ws, req);
  });

  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error);
  });

  registerAnalyticsRoutes(app);
  registerInfographicRoutes(app);
  registerProjectRoutes(app);
  registerTemplateRoutes(app);
  registerCollectionRoutes(app);
  registerRespondentRoutes(app);
  registerSessionRoutes(app);
  registerInterviewAccessRoutes(app);
  registerInterviewFlowRoutes(app);
  registerReviewRoutes(app);
  registerBarbaraRoutes(app);
  registerUsageRoutes(app);
  registerGuidanceRoutes(app);
  registerParseQuestionsRoutes(app);
  registerPersonaRoutes(app);
  registerSimulationRoutes(app);
  registerPersonaGenerationRoutes(app);
  registerAdminSetupRoutes(app);

  return httpServer;
}
