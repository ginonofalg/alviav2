import { log } from "./logger";
import { VALID_REALTIME_MODELS } from "./realtime-providers";

export function validateAndLogLlmConfig() {
  const openaiBaseUrl = process.env.OPENAI_BASE_URL;
  log.info(`[llm-config] [OpenAI] Base URL: ${openaiBaseUrl || "https://api.openai.com/v1"} ${openaiBaseUrl ? "" : "(default)"}`);

  const legacyRealtimeUrl = process.env.OPENAI_REALTIME_URL;
  if (legacyRealtimeUrl) {
    log.warn(
      `[llm-config] DEPRECATED: OPENAI_REALTIME_URL is set. ` +
      `Migrate to OPENAI_REALTIME_BASE_URL + OPENAI_REALTIME_DEFAULT_MODEL and remove OPENAI_REALTIME_URL. ` +
      `While OPENAI_REALTIME_URL is set, per-collection model overrides are ignored.`,
    );
    if (!legacyRealtimeUrl.startsWith("wss://")) {
      throw new Error(`OPENAI_REALTIME_URL must be a wss:// URL, got: ${legacyRealtimeUrl}`);
    }
    if (!legacyRealtimeUrl.includes("model=")) {
      console.warn(`[llm-config] WARNING: OPENAI_REALTIME_URL is missing a model= query parameter. Connection may fail at runtime.`);
    }
    log.info(`[llm-config] [OpenAI Realtime] URL (legacy): ${legacyRealtimeUrl}`);
  } else {
    const baseUrl = process.env.OPENAI_REALTIME_BASE_URL || "wss://api.openai.com/v1/realtime";
    const defaultModel = process.env.OPENAI_REALTIME_DEFAULT_MODEL || "gpt-realtime-mini";

    if (process.env.OPENAI_REALTIME_BASE_URL) {
      if (!baseUrl.startsWith("wss://")) {
        throw new Error(`OPENAI_REALTIME_BASE_URL must be a wss:// URL, got: ${baseUrl}`);
      }
    }

    if (process.env.OPENAI_REALTIME_DEFAULT_MODEL) {
      if (!VALID_REALTIME_MODELS.includes(defaultModel as any)) {
        log.warn(
          `[llm-config] OPENAI_REALTIME_DEFAULT_MODEL="${defaultModel}" is not a recognized model. ` +
          `Valid values: ${VALID_REALTIME_MODELS.join(", ")}`,
        );
      }
    }

    log.info(`[llm-config] [OpenAI Realtime] Base URL: ${baseUrl}${process.env.OPENAI_REALTIME_BASE_URL ? "" : " (default)"}`);
    log.info(`[llm-config] [OpenAI Realtime] Default model: ${defaultModel}${process.env.OPENAI_REALTIME_DEFAULT_MODEL ? "" : " (default)"}`);
  }

  const useVertexAI = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
  if (useVertexAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "europe-west1";
    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true");
    }
    log.info(`[llm-config] [Gemini] Mode: Vertex AI, project: ${project}, region: ${location}`);
  } else {
    log.info("[llm-config] [Gemini] Mode: API key (direct)");
  }
}
