import { recordLlmUsageEvent } from "../llm-usage";
import { buildUsageAttribution, type InterviewState } from "./types";
import type { TokenUsageDetails } from "../realtime-providers";

const MAX_TRACKED_RESPONSE_IDS = 200;

export function recordRealtimeResponseUsage(
  state: InterviewState,
  sessionId: string,
  event: any,
  tokenUsage: TokenUsageDetails,
): boolean {
  const responseId = event.response?.id;
  if (responseId && state.processedResponseIds.has(responseId)) {
    console.warn(
      `[Metrics] Skipping duplicate response.done for ${sessionId} (responseId: ${responseId})`,
    );
    return false;
  }
  if (responseId) {
    if (state.processedResponseIds.size >= MAX_TRACKED_RESPONSE_IDS) {
      const oldest = state.processedResponseIds.values().next().value;
      if (oldest) state.processedResponseIds.delete(oldest);
    }
    state.processedResponseIds.add(responseId);
  }

  state.metricsTracker.tokens.inputTokens += tokenUsage.inputTokens;
  state.metricsTracker.tokens.outputTokens += tokenUsage.outputTokens;
  state.metricsTracker.tokens.inputAudioTokens += tokenUsage.inputAudioTokens;
  state.metricsTracker.tokens.outputAudioTokens +=
    tokenUsage.outputAudioTokens;
  state.metricsTracker.tokens.inputTextTokens += tokenUsage.inputTextTokens;
  state.metricsTracker.tokens.outputTextTokens += tokenUsage.outputTextTokens;
  state.metricsTracker.tokens.rawResponses.push(event.response?.usage);
  console.log(
    `[Metrics] Token usage for ${sessionId} (${state.providerInstance.displayName}): input=${tokenUsage.inputTokens}, output=${tokenUsage.outputTokens}`,
  );

  recordLlmUsageEvent(
    buildUsageAttribution(state),
    state.providerInstance.name === "grok"
      ? ("xai" as const)
      : ("openai" as const),
    state.providerInstance.getModelName(),
    "alvia_realtime",
    {
      promptTokens: tokenUsage.inputTextTokens,
      completionTokens: tokenUsage.outputTextTokens,
      totalTokens: tokenUsage.inputTokens + tokenUsage.outputTokens,
      inputAudioTokens: tokenUsage.inputAudioTokens,
      outputAudioTokens: tokenUsage.outputAudioTokens,
      inputTokensTotal: tokenUsage.inputTokens,
      outputTokensTotal: tokenUsage.outputTokens,
      inputCachedTokens: tokenUsage.inputCachedTokens,
    },
    "success",
    {
      rawUsage: event.response?.usage,
      requestId: event.response?.id ?? undefined,
    },
  ).catch((err) =>
    console.error(
      "[LLM Usage] Failed to record per-response alvia_realtime:",
      err,
    ),
  );

  return true;
}
