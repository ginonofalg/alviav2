import { log } from "./index";

export function validateAndLogLlmConfig() {
  const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1 (default)";
  log(`[OpenAI] Base URL: ${openaiBaseUrl}`, "llm-config");

  const realtimeUrl = process.env.OPENAI_REALTIME_URL;
  if (realtimeUrl) {
    if (!realtimeUrl.startsWith("wss://")) {
      throw new Error(`OPENAI_REALTIME_URL must be a wss:// URL, got: ${realtimeUrl}`);
    }
    log(`[OpenAI Realtime] URL: ${realtimeUrl}`, "llm-config");
  } else {
    log("[OpenAI Realtime] URL: wss://api.openai.com/v1/realtime (default)", "llm-config");
  }

  const useVertexAI = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
  if (useVertexAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "europe-west1";
    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true");
    }
    log(`[Gemini] Mode: Vertex AI, project: ${project}, region: ${location}`, "llm-config");
  } else {
    log("[Gemini] Mode: API key (direct)", "llm-config");
  }
}
