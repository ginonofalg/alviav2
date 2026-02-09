import WebSocket from "ws";

export type RealtimeProviderType = "openai" | "grok";

export interface TokenUsageDetails {
  inputTokens: number;
  outputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTextTokens: number;
  outputTextTokens: number;
}

export interface RealtimeProvider {
  readonly name: RealtimeProviderType;
  readonly displayName: string;

  getWebSocketUrl(): string;
  getWebSocketHeaders(): Record<string, string>;

  buildSessionConfig(instructions: string): Record<string, any>;

  buildInstructionsUpdate(instructions: string): Record<string, any>;

  buildTurnDetectionUpdate(
    eagerness: "auto" | "low",
  ): Record<string, any> | null;

  buildTextOnlySessionConfig(instructions: string): Record<string, any>;

  parseTokenUsage(event: any): TokenUsageDetails | null;

  getModelName(): string;
  getTranscriptionModelName(): string;

  getSampleRate(): number;

  supportsSemanticVAD(): boolean;
  supportsNoiseReduction(): boolean;
}

export class OpenAIRealtimeProvider implements RealtimeProvider {
  readonly name: RealtimeProviderType = "openai";
  readonly displayName = "OpenAI";

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getWebSocketUrl(): string {
    return "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini";
  }

  getWebSocketHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  buildSessionConfig(instructions: string): Record<string, any> {
    return {
      type: "realtime",
      instructions: instructions,
      output_modalities: ["text", "audio"],
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
            eagerness: "auto",
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
      instructions: instructions,
    };
  }

  buildTurnDetectionUpdate(
    eagerness: "auto" | "low",
  ): Record<string, any> | null {
    return {
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
      instructions: instructions,
      output_modalities: ["text"],
      audio: {
        input: {
          turn_detection: null,
        },
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
    };
  }

  getModelName(): string {
    return "gpt-realtime-mini";
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

export class GrokRealtimeProvider implements RealtimeProvider {
  readonly name: RealtimeProviderType = "grok";
  readonly displayName = "Grok (xAI)";

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getWebSocketUrl(): string {
    return "wss://api.x.ai/v1/realtime?model=grok-3-fast";
  }

  getWebSocketHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  buildSessionConfig(instructions: string): Record<string, any> {
    return {
      modalities: ["text", "audio"],
      instructions: instructions,
      voice: "Ara",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: {
        model: "whisper-large-v3",
        language: "en",
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.3,
        silence_duration_ms: 800,
        prefix_padding_ms: 150,
        create_response: true,
        interrupt_response: true,
      },
    };
  }

  buildInstructionsUpdate(instructions: string): Record<string, any> {
    return {
      instructions: instructions,
    };
  }

  buildTurnDetectionUpdate(
    eagerness: "auto" | "low",
  ): Record<string, any> | null {
    return null;
  }

  buildTextOnlySessionConfig(instructions: string): Record<string, any> {
    return {
      modalities: ["text"],
      instructions: instructions,
      turn_detection: null,
    };
  }

  parseTokenUsage(event: any): TokenUsageDetails | null {
    const usage = event.response?.usage;
    if (!usage) return null;

    if (usage.input_tokens === undefined && usage.output_tokens === undefined) {
      console.warn(
        "[GrokProvider] Token usage format may differ from expected OpenAI-compatible schema:",
        JSON.stringify(usage).substring(0, 200),
      );
    }

    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      inputAudioTokens: usage.input_token_details?.audio_tokens || 0,
      outputAudioTokens: usage.output_token_details?.audio_tokens || 0,
      inputTextTokens: usage.input_token_details?.text_tokens || 0,
      outputTextTokens: usage.output_token_details?.text_tokens || 0,
    };
  }

  getModelName(): string {
    return "grok-3-fast";
  }

  getTranscriptionModelName(): string {
    return "whisper-large-v3";
  }

  getSampleRate(): number {
    return 24000;
  }

  supportsSemanticVAD(): boolean {
    return false;
  }

  supportsNoiseReduction(): boolean {
    return false;
  }
}

export function getRealtimeProvider(
  override?: RealtimeProviderType | null,
): RealtimeProvider {
  const providerType = (
    override ||
    process.env.REALTIME_PROVIDER ||
    "openai"
  ).toLowerCase() as RealtimeProviderType;

  switch (providerType) {
    case "grok": {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "XAI_API_KEY environment variable is required for Grok provider",
        );
      }
      console.log("[RealtimeProvider] Using Grok (xAI) provider");
      return new GrokRealtimeProvider(apiKey);
    }

    case "openai":
    default: {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY environment variable is required for OpenAI provider",
        );
      }
      console.log("[RealtimeProvider] Using OpenAI provider");
      return new OpenAIRealtimeProvider(apiKey);
    }
  }
}

export function validateProviderApiKey(providerType: RealtimeProviderType): {
  valid: boolean;
  error?: string;
} {
  switch (providerType) {
    case "grok":
      if (!process.env.XAI_API_KEY) {
        return {
          valid: false,
          error:
            "XAI_API_KEY environment variable is required for Grok provider",
        };
      }
      return { valid: true };

    case "openai":
    default:
      if (!process.env.OPENAI_API_KEY) {
        return {
          valid: false,
          error:
            "OPENAI_API_KEY environment variable is required for OpenAI provider",
        };
      }
      return { valid: true };
  }
}
