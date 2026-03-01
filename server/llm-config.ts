export function validateAndLogLlmConfig() {
  const openaiBaseUrl = process.env.OPENAI_BASE_URL;
  console.log(`[llm-config] [OpenAI] Base URL: ${openaiBaseUrl || "https://api.openai.com/v1"} ${openaiBaseUrl ? "" : "(default)"}`);

  const realtimeUrl = process.env.OPENAI_REALTIME_URL;
  if (realtimeUrl) {
    if (!realtimeUrl.startsWith("wss://")) {
      throw new Error(`OPENAI_REALTIME_URL must be a wss:// URL, got: ${realtimeUrl}`);
    }
    if (!realtimeUrl.includes("model=")) {
      console.warn(`[llm-config] WARNING: OPENAI_REALTIME_URL is missing a model= query parameter. Connection may fail at runtime.`);
    }
    console.log(`[llm-config] [OpenAI Realtime] URL: ${realtimeUrl}`);
  } else {
    console.log("[llm-config] [OpenAI Realtime] URL: wss://api.openai.com/v1/realtime (default)");
  }

  const useVertexAI = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
  if (useVertexAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "europe-west1";
    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true");
    }
    console.log(`[llm-config] [Gemini] Mode: Vertex AI, project: ${project}, region: ${location}`);
  } else {
    console.log("[llm-config] [Gemini] Mode: API key (direct)");
  }
}
