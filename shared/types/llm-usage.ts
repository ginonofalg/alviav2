export const LLM_USE_CASES = [
  "alvia_realtime",
  "alvia_transcription",
  "barbara_analysis",
  "barbara_topic_overlap",
  "barbara_question_summary",
  "barbara_cross_interview_enhanced_analysis",
  "barbara_project_cross_template_analysis",
  "barbara_template_generation",
  "barbara_additional_questions",
  "barbara_session_summary",
  "infographic_collection_summary",
  "infographic_collection_themes",
  "infographic_collection_findings",
  "infographic_project_summary",
  "infographic_project_themes",
  "infographic_project_insights",
  "barbara_question_parsing",
  "simulation_alvia",
  "simulation_persona",
  "barbara_persona_research",
  "barbara_persona_generation",
] as const;

export type LLMUseCase = typeof LLM_USE_CASES[number];

export type LLMProvider = "openai" | "xai" | "gemini";

export type LLMUsageStatus = "success" | "missing_usage" | "timeout" | "error";

export type LLMUsageAttribution = {
  workspaceId?: string | null;
  projectId?: string | null;
  templateId?: string | null;
  collectionId?: string | null;
  sessionId?: string | null;
};

export type NormalizedTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTokensTotal?: number;
  outputTokensTotal?: number;
  inputCachedTokens?: number;
};

export type UsageRollup = {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalInputAudioTokens: number;
  totalOutputAudioTokens: number;
  totalInputTokensTotal: number;
  totalOutputTokensTotal: number;
  totalInputCachedTokens: number;
  totalCalls: number;
  byProvider: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; calls: number }>;
  byModel: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; calls: number }>;
  byUseCase: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; calls: number }>;
  byStatus: Record<string, number>;
};
