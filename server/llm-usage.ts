import { storage } from "./storage";
import type {
  LLMProvider,
  LLMUsageStatus,
  LLMUseCase,
  LLMUsageAttribution,
  NormalizedTokenUsage,
  InsertLlmUsageEvent,
  BarbaraTokenBucket,
} from "@shared/schema";

export function extractOpenAIChatUsage(
  response: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null },
  model: string,
): { usage: NormalizedTokenUsage; status: LLMUsageStatus } {
  if (!response.usage) {
    return {
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, inputAudioTokens: 0, outputAudioTokens: 0 },
      status: "missing_usage",
    };
  }
  const u = response.usage;
  return {
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      inputAudioTokens: 0,
      outputAudioTokens: 0,
    },
    status: "success",
  };
}

export function extractGeminiUsage(
  response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null },
  model: string,
): { usage: NormalizedTokenUsage; status: LLMUsageStatus } {
  if (!response.usageMetadata) {
    return {
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, inputAudioTokens: 0, outputAudioTokens: 0 },
      status: "missing_usage",
    };
  }
  const u = response.usageMetadata;
  return {
    usage: {
      promptTokens: u.promptTokenCount ?? 0,
      completionTokens: u.candidatesTokenCount ?? 0,
      totalTokens: u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0),
      inputAudioTokens: 0,
      outputAudioTokens: 0,
    },
    status: "success",
  };
}

export async function recordLlmUsageEvent(
  attribution: LLMUsageAttribution,
  provider: LLMProvider,
  model: string,
  useCase: LLMUseCase,
  usage: NormalizedTokenUsage,
  status: LLMUsageStatus,
  metadata?: {
    rawUsage?: unknown;
    requestId?: string;
    latencyMs?: number;
    errorMessage?: string;
  },
): Promise<void> {
  try {
    const event: InsertLlmUsageEvent = {
      workspaceId: attribution.workspaceId ?? null,
      projectId: attribution.projectId ?? null,
      templateId: attribution.templateId ?? null,
      collectionId: attribution.collectionId ?? null,
      sessionId: attribution.sessionId ?? null,
      provider,
      model,
      useCase,
      status,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      inputAudioTokens: usage.inputAudioTokens,
      outputAudioTokens: usage.outputAudioTokens,
      inputTokensTotal: usage.inputTokensTotal ?? 0,
      outputTokensTotal: usage.outputTokensTotal ?? 0,
      inputCachedTokens: usage.inputCachedTokens ?? 0,
      rawUsage: metadata?.rawUsage ?? null,
      requestId: metadata?.requestId ?? null,
      latencyMs: metadata?.latencyMs ?? null,
      errorMessage: metadata?.errorMessage ?? null,
    };
    await storage.createEventAndUpsertRollup(event);
  } catch (err) {
    console.error(`[LLM Usage] Failed to record usage event for ${useCase}:`, err);
  }
}

export type TrackedLlmCallOptions<T> = {
  attribution: LLMUsageAttribution;
  provider: LLMProvider;
  model: string;
  useCase: LLMUseCase;
  timeoutMs?: number;
  callFn: (signal?: AbortSignal) => Promise<T>;
  extractUsage: (response: T) => { usage: NormalizedTokenUsage; status: LLMUsageStatus; rawUsage?: unknown };
};

export type TrackedLlmResult<T> = {
  result: T;
  usage: NormalizedTokenUsage;
  status: LLMUsageStatus;
  latencyMs: number;
};

export async function withTrackedLlmCall<T>(
  options: TrackedLlmCallOptions<T>,
): Promise<TrackedLlmResult<T>> {
  const startTime = Date.now();
  const { attribution, provider, model, useCase, timeoutMs, callFn, extractUsage } = options;

  let abortController: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs && timeoutMs > 0) {
    abortController = new AbortController();
    timeoutId = setTimeout(() => {
      abortController!.abort();
    }, timeoutMs);
  }

  try {
    const result = await callFn(abortController?.signal);
    const latencyMs = Date.now() - startTime;

    if (timeoutId) clearTimeout(timeoutId);

    const { usage, status, rawUsage } = extractUsage(result);

    await recordLlmUsageEvent(attribution, provider, model, useCase, usage, status, {
      rawUsage,
      latencyMs,
    });

    return { result, usage, status, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    if (timeoutId) clearTimeout(timeoutId);

    const isTimeout = err?.name === "AbortError" || err?.message?.includes("aborted");
    const status: LLMUsageStatus = isTimeout ? "timeout" : "error";
    const zeroUsage: NormalizedTokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      inputAudioTokens: 0,
      outputAudioTokens: 0,
    };

    await recordLlmUsageEvent(attribution, provider, model, useCase, zeroUsage, status, {
      latencyMs,
      errorMessage: err?.message ?? String(err),
    });

    throw err;
  }
}

export function makeBarbaraUsageExtractor(model: string) {
  return (response: any) => {
    const { usage, status } = extractOpenAIChatUsage(response, model);
    return { usage, status, rawUsage: response?.usage ?? null };
  };
}

export function emptyTokenBucket(): BarbaraTokenBucket {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function addToTokenBucket(bucket: BarbaraTokenBucket, usage: NormalizedTokenUsage): BarbaraTokenBucket {
  return {
    promptTokens: bucket.promptTokens + usage.promptTokens,
    completionTokens: bucket.completionTokens + usage.completionTokens,
    totalTokens: bucket.totalTokens + usage.totalTokens,
  };
}
