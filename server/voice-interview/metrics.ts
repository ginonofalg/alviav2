import type { SilenceSegment, SilenceContext, SilenceStats } from "@shared/schema";
import { emptyTokenBucket } from "../llm-usage";
import type { MetricsTracker, InterviewState } from "./types";

export function createEmptyMetricsTracker(): MetricsTracker {
  return {
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      inputAudioTokens: 0,
      outputAudioTokens: 0,
      inputTextTokens: 0,
      outputTextTokens: 0,
    },
    latency: {
      transcriptionLatencies: [],
      responseLatencies: [],
      lastSpeechStoppedAt: null,
      lastTranscriptionAt: null,
      waitingForFirstAudio: false,
    },
    alviaSpeaking: {
      totalMs: 0,
      currentResponseStartAt: null,
      turnCount: 0,
    },
    silenceTracking: {
      segments: [],
      lastAlviaEndAt: null,
      lastRespondentEndAt: null,
      lastSpeechStartAt: null,
      accumulator: {
        allDurations: [],
        countByContext: { post_alvia: 0, post_respondent: 0, initial: 0 },
        totalMsByContext: { post_alvia: 0, post_respondent: 0, initial: 0 },
      },
    },
    openaiConnectionCount: 0,
    barbaraTokens: {
      total: emptyTokenBucket(),
    },
  };
}

// Constants for silence tracking
export const MIN_SILENCE_DURATION_MS = 100; // Filter out noise/micro-pauses
export const MAX_STORED_SEGMENTS = 100; // Cap stored segments (stats computed from all)

// Record a silence segment when speech resumes
export function recordSilenceSegment(
  tracker: MetricsTracker,
  state: InterviewState,
  endAt: number,
): void {
  const { lastAlviaEndAt, lastRespondentEndAt, lastSpeechStartAt } =
    tracker.silenceTracking;

  // If someone was already speaking, no silence to record
  if (lastSpeechStartAt !== null) {
    return;
  }

  // Determine when silence started and its context
  let startAt: number | null = null;
  let context: SilenceContext;

  if (lastAlviaEndAt !== null && lastRespondentEndAt !== null) {
    // Both have spoken before - use the more recent end time
    if (lastAlviaEndAt > lastRespondentEndAt) {
      startAt = lastAlviaEndAt;
      context = "post_alvia";
    } else {
      startAt = lastRespondentEndAt;
      context = "post_respondent";
    }
  } else if (lastAlviaEndAt !== null) {
    startAt = lastAlviaEndAt;
    context = "post_alvia";
  } else if (lastRespondentEndAt !== null) {
    startAt = lastRespondentEndAt;
    context = "post_respondent";
  } else {
    // No prior speech - this is initial silence
    startAt = state.createdAt;
    context = "initial";
  }

  if (startAt === null || endAt <= startAt) {
    return; // Invalid segment
  }

  const durationMs = endAt - startAt;

  // Only record segments >= minimum threshold to filter noise
  if (durationMs < MIN_SILENCE_DURATION_MS) {
    return;
  }

  const segment: SilenceSegment = {
    startAt,
    endAt,
    durationMs,
    context,
    questionIndex: state.currentQuestionIndex ?? null,
  };

  // Update running stats accumulator (tracks ALL observed segments for accurate stats)
  const acc = tracker.silenceTracking.accumulator;
  acc.allDurations.push(durationMs);
  acc.countByContext[context]++;
  acc.totalMsByContext[context] += durationMs;

  // Add segment to stored array (capped at runtime for memory efficiency)
  tracker.silenceTracking.segments.push(segment);

  // Keep only the most recent MAX_STORED_SEGMENTS for detailed analysis
  if (tracker.silenceTracking.segments.length > MAX_STORED_SEGMENTS) {
    tracker.silenceTracking.segments.shift(); // Remove oldest
  }
}

// Calculate statistical summary from silence data
// Uses accumulator for counts/totals (from ALL segments) and durations array for percentiles
export function calculateSilenceStats(
  accumulator: MetricsTracker["silenceTracking"]["accumulator"],
): SilenceStats | null {
  const { allDurations, countByContext, totalMsByContext } = accumulator;

  if (allDurations.length === 0) {
    return null;
  }

  // Sort durations for percentile calculations
  const sortedDurations = [...allDurations].sort((a, b) => a - b);
  const count = sortedDurations.length;
  const totalMs = sortedDurations.reduce((sum, d) => sum + d, 0);

  const percentile = (arr: number[], p: number): number => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

  // Build byContext stats from accumulator
  const byContext: Record<
    SilenceContext,
    { count: number; totalMs: number; meanMs: number }
  > = {
    post_alvia: {
      count: countByContext.post_alvia,
      totalMs: totalMsByContext.post_alvia,
      meanMs:
        countByContext.post_alvia > 0
          ? Math.round(totalMsByContext.post_alvia / countByContext.post_alvia)
          : 0,
    },
    post_respondent: {
      count: countByContext.post_respondent,
      totalMs: totalMsByContext.post_respondent,
      meanMs:
        countByContext.post_respondent > 0
          ? Math.round(
              totalMsByContext.post_respondent / countByContext.post_respondent,
            )
          : 0,
    },
    initial: {
      count: countByContext.initial,
      totalMs: totalMsByContext.initial,
      meanMs:
        countByContext.initial > 0
          ? Math.round(totalMsByContext.initial / countByContext.initial)
          : 0,
    },
  };

  return {
    count,
    meanMs: Math.round(totalMs / count),
    medianMs: percentile(sortedDurations, 50),
    p90Ms: percentile(sortedDurations, 90),
    p95Ms: percentile(sortedDurations, 95),
    maxMs: sortedDurations[count - 1],
    byContext,
  };
}
