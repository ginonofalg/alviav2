import { describe, it, expect } from "vitest";
import { OpenAIRealtimeProvider, GrokRealtimeProvider } from "../realtime-providers";
import type { NormalizedTokenUsage } from "@shared/schema";

describe("realtime usage parsing", () => {
  describe("OpenAI parseTokenUsage", () => {
    const provider = new OpenAIRealtimeProvider("fake-key");

    it("extracts all fields including cached tokens", () => {
      const event = {
        response: {
          usage: {
            input_tokens: 500,
            output_tokens: 300,
            input_token_details: {
              audio_tokens: 200,
              text_tokens: 250,
              cached_tokens: 50,
            },
            output_token_details: {
              audio_tokens: 100,
              text_tokens: 200,
            },
          },
        },
      };

      const result = provider.parseTokenUsage(event);
      expect(result).not.toBeNull();
      expect(result!.inputTokens).toBe(500);
      expect(result!.outputTokens).toBe(300);
      expect(result!.inputAudioTokens).toBe(200);
      expect(result!.outputAudioTokens).toBe(100);
      expect(result!.inputTextTokens).toBe(250);
      expect(result!.outputTextTokens).toBe(200);
      expect(result!.inputCachedTokens).toBe(50);
    });

    it("defaults cached tokens to 0 when absent", () => {
      const event = {
        response: {
          usage: {
            input_tokens: 100,
            output_tokens: 80,
            input_token_details: {
              audio_tokens: 40,
              text_tokens: 60,
            },
            output_token_details: {
              audio_tokens: 30,
              text_tokens: 50,
            },
          },
        },
      };

      const result = provider.parseTokenUsage(event);
      expect(result).not.toBeNull();
      expect(result!.inputCachedTokens).toBe(0);
    });

    it("returns null when usage is missing", () => {
      const result = provider.parseTokenUsage({ response: {} });
      expect(result).toBeNull();
    });

    it("defaults all detail fields to 0 when token_details absent", () => {
      const event = {
        response: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        },
      };

      const result = provider.parseTokenUsage(event);
      expect(result).not.toBeNull();
      expect(result!.inputAudioTokens).toBe(0);
      expect(result!.outputAudioTokens).toBe(0);
      expect(result!.inputTextTokens).toBe(0);
      expect(result!.outputTextTokens).toBe(0);
      expect(result!.inputCachedTokens).toBe(0);
    });
  });

  describe("Grok parseTokenUsage", () => {
    const provider = new GrokRealtimeProvider("fake-key");

    it("extracts cached tokens when present", () => {
      const event = {
        response: {
          usage: {
            input_tokens: 300,
            output_tokens: 200,
            input_token_details: {
              audio_tokens: 100,
              text_tokens: 200,
              cached_tokens: 30,
            },
            output_token_details: {
              audio_tokens: 80,
              text_tokens: 120,
            },
          },
        },
      };

      const result = provider.parseTokenUsage(event);
      expect(result).not.toBeNull();
      expect(result!.inputCachedTokens).toBe(30);
    });

    it("defaults cached tokens to 0 when absent", () => {
      const event = {
        response: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            input_token_details: { audio_tokens: 40, text_tokens: 60 },
            output_token_details: { audio_tokens: 20, text_tokens: 30 },
          },
        },
      };

      const result = provider.parseTokenUsage(event);
      expect(result).not.toBeNull();
      expect(result!.inputCachedTokens).toBe(0);
    });
  });
});

describe("NormalizedTokenUsage mapping for realtime events", () => {
  it("maps realtime TokenUsageDetails to NormalizedTokenUsage with total fields", () => {
    const tokenUsage = {
      inputTokens: 500,
      outputTokens: 300,
      inputAudioTokens: 200,
      outputAudioTokens: 100,
      inputTextTokens: 250,
      outputTextTokens: 200,
      inputCachedTokens: 50,
    };

    const normalized: NormalizedTokenUsage = {
      promptTokens: tokenUsage.inputTextTokens,
      completionTokens: tokenUsage.outputTextTokens,
      totalTokens: tokenUsage.inputTokens + tokenUsage.outputTokens,
      inputAudioTokens: tokenUsage.inputAudioTokens,
      outputAudioTokens: tokenUsage.outputAudioTokens,
      inputTokensTotal: tokenUsage.inputTokens,
      outputTokensTotal: tokenUsage.outputTokens,
      inputCachedTokens: tokenUsage.inputCachedTokens,
    };

    expect(normalized.promptTokens).toBe(250);
    expect(normalized.completionTokens).toBe(200);
    expect(normalized.totalTokens).toBe(800);
    expect(normalized.inputTokensTotal).toBe(500);
    expect(normalized.outputTokensTotal).toBe(300);
    expect(normalized.inputCachedTokens).toBe(50);
  });

  it("non-realtime callers can omit total fields (optional)", () => {
    const nonRealtimeUsage: NormalizedTokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      inputAudioTokens: 0,
      outputAudioTokens: 0,
    };

    expect(nonRealtimeUsage.inputTokensTotal).toBeUndefined();
    expect(nonRealtimeUsage.outputTokensTotal).toBeUndefined();
    expect(nonRealtimeUsage.inputCachedTokens).toBeUndefined();

    const defaulted = nonRealtimeUsage.inputTokensTotal ?? 0;
    expect(defaulted).toBe(0);
  });
});
