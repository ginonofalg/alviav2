import type { BarbaraGuidanceLogEntry, PersistedTranscriptEntry } from "@shared/schema";
import type { InterviewState } from "./types";
import type { BarbaraGuidance } from "../barbara-orchestrator";
import { scoreGuidanceAdherence, computeAdherenceSummary } from "../guidance-adherence";
import { storage, type InterviewStatePatch } from "../storage";

export function createGuidanceLogEntry(
  state: InterviewState,
  guidance: { action: string; message: string; confidence: number },
): BarbaraGuidanceLogEntry {
  return {
    index: state.barbaraGuidanceLog.length,
    action: guidance.action as BarbaraGuidanceLogEntry["action"],
    messageSummary: guidance.message.slice(0, 500),
    confidence: guidance.confidence,
    injected: guidance.confidence > 0.6 && guidance.action !== "none",
    timestamp: Date.now(),
    questionIndex: state.currentQuestionIndex,
    triggerTurnIndex: Math.max(0, state.fullTranscriptForPersistence.length - 1),
  };
}

export async function scoreAndPersistAdherence(
  sessionId: string,
  state: InterviewState,
): Promise<void> {
  if (state.barbaraGuidanceLog.length === 0) return;

  try {
    const transcriptForScoring = state.fullTranscriptForPersistence as PersistedTranscriptEntry[];
    const scoredLog = scoreGuidanceAdherence(state.barbaraGuidanceLog, transcriptForScoring);
    const adherenceSummary = computeAdherenceSummary(scoredLog);

    await storage.persistInterviewState(sessionId, {
      barbaraGuidanceLog: scoredLog,
      guidanceAdherenceSummary: adherenceSummary,
    });
    console.log(
      `[GuidanceAdherence] Scored ${scoredLog.length} entries for ${sessionId}: ` +
      `${adherenceSummary.followedCount} followed, ${adherenceSummary.partiallyFollowedCount} partial, ` +
      `${adherenceSummary.notFollowedCount} not followed (rate: ${(adherenceSummary.overallAdherenceRate * 100).toFixed(1)}%)`,
    );
  } catch (adherenceError) {
    console.error(`[GuidanceAdherence] Error scoring adherence for ${sessionId}:`, adherenceError);
  }
}
