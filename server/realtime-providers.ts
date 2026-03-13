import { log } from './logger';
import WebSocket from "ws";

export const VALID_REALTIME_MODELS = ["gpt-realtime-1.5", "gpt-realtime-mini"] as const;
export type RealtimeModel = typeof VALID_REALTIME_MODELS[number];

export const DEFAULT_REALTIME_MODEL: RealtimeModel = "gpt-realtime-mini";

export interface TokenUsageDetails {
  inputTokens: number;
  outputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTextTokens: number;
  outputTextTokens: number;
  inputCachedTokens: number;
}

export interface RealtimeProvider {
  readonly name: "openai";
  readonly displayName: string;

  getWebSocketUrl(resolvedModel: RealtimeModel): string;
  getWebSocketHeaders(): Record<string, string>;

  buildSessionConfig(instructions: string, initialEagerness?: "auto" | "low" | "high"): Record<string, any>;

  buildInstructionsUpdate(instructions: string): Record<string, any>;

  buildTurnDetectionUpdate(
    eagerness: "auto" | "low" | "high",
  ): Record<string, any> | null;

  buildTextOnlySessionConfig(instructions: string): Record<string, any>;

  buildResponseCreate(): Record<string, any>;
  buildTextOnlyResponseCreate(): Record<string, any>;

  parseTokenUsage(event: any): TokenUsageDetails | null;

  getTranscriptionModelName(): string;

  getSampleRate(): number;

  supportsSemanticVAD(): boolean;
  supportsNoiseReduction(): boolean;
}

export class OpenAIRealtimeProvider implements RealtimeProvider {
  readonly name = "openai" as const;
  readonly displayName = "OpenAI";

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getWebSocketUrl(resolvedModel: RealtimeModel): string {
    const legacyUrl = process.env.OPENAI_REALTIME_URL;
    if (legacyUrl) {
      return legacyUrl;
    }

    const baseUrl = process.env.OPENAI_REALTIME_BASE_URL
      || "wss://api.openai.com/v1/realtime";
    return `${baseUrl}?model=${resolvedModel}`;
  }

  getWebSocketHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  buildSessionConfig(instructions: string, initialEagerness?: "auto" | "low" | "high"): Record<string, any> {
    return {
      type: "realtime",
      instructions: instructions,
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          noise_reduction: {
            type: "near_field",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: initialEagerness || "auto",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: { type: "audio/pcm", rate: 24000 },
          voice: "marin",
        },
      },
    };
  }

  buildInstructionsUpdate(instructions: string): Record<string, any> {
    return {
      type: "realtime",
      instructions: instructions,
    };
  }

  buildTurnDetectionUpdate(
    eagerness: "auto" | "low" | "high",
  ): Record<string, any> | null {
    return {
      type: "realtime",
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: eagerness,
            create_response: true,
            interrupt_response: true,
          },
        },
      },
    };
  }

  buildTextOnlySessionConfig(instructions: string): Record<string, any> {
    return {
      type: "realtime",
      instructions: instructions,
      output_modalities: ["text"],
      audio: {
        input: {
          turn_detection: null,
        },
      },
    };
  }

  buildResponseCreate(): Record<string, any> {
    return {
      type: "response.create",
      response: {
        output_modalities: ["audio"],
      },
    };
  }

  buildTextOnlyResponseCreate(): Record<string, any> {
    return {
      type: "response.create",
      response: {
        output_modalities: ["text"],
      },
    };
  }

  parseTokenUsage(event: any): TokenUsageDetails | null {
    const usage = event.response?.usage;
    if (!usage) return null;

    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      inputAudioTokens: usage.input_token_details?.audio_tokens || 0,
      outputAudioTokens: usage.output_token_details?.audio_tokens || 0,
      inputTextTokens: usage.input_token_details?.text_tokens || 0,
      outputTextTokens: usage.output_token_details?.text_tokens || 0,
      inputCachedTokens: usage.input_token_details?.cached_tokens || 0,
    };
  }

  getTranscriptionModelName(): string {
    return "gpt-4o-mini-transcribe";
  }

  getSampleRate(): number {
    return 24000;
  }

  supportsSemanticVAD(): boolean {
    return true;
  }

  supportsNoiseReduction(): boolean {
    return true;
  }
}

export function resolveRealtimeModel(
  collectionRealtimeModel: string | null | undefined,
): RealtimeModel {
  if (
    collectionRealtimeModel &&
    VALID_REALTIME_MODELS.includes(collectionRealtimeModel as RealtimeModel)
  ) {
    return collectionRealtimeModel as RealtimeModel;
  }

  const envModel = process.env.OPENAI_REALTIME_DEFAULT_MODEL;
  if (envModel && VALID_REALTIME_MODELS.includes(envModel as RealtimeModel)) {
    return envModel as RealtimeModel;
  }

  return DEFAULT_REALTIME_MODEL;
}

export function isLegacyRealtimeUrlSet(): boolean {
  return !!process.env.OPENAI_REALTIME_URL;
}

export function extractModelFromLegacyUrl(): RealtimeModel | null {
  const legacyUrl = process.env.OPENAI_REALTIME_URL;
  if (!legacyUrl) return null;
  try {
    const url = new URL(legacyUrl);
    const model = url.searchParams.get("model");
    if (model && VALID_REALTIME_MODELS.includes(model as RealtimeModel)) {
      return model as RealtimeModel;
    }
  } catch {
  }
  return null;
}

export function getRealtimeProvider(): RealtimeProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required for OpenAI provider",
    );
  }
  log.info("[RealtimeProvider] Using OpenAI provider");
  return new OpenAIRealtimeProvider(apiKey);
}

export function validateProviderApiKey(): {
  valid: boolean;
  error?: string;
} {
  if (!process.env.OPENAI_API_KEY) {
    return {
      valid: false,
      error:
        "OPENAI_API_KEY environment variable is required for OpenAI provider",
    };
  }
  return { valid: true };
}
