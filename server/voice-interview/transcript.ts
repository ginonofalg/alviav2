import type { PersistedTranscriptEntry } from "@shared/schema";
import type { TranscriptEntry } from "../barbara-orchestrator";
import type { InterviewState } from "./types";
import { MAX_TRANSCRIPT_IN_MEMORY } from "./types";
import { getKeywords, jaccardSimilarity } from "./text-utils";

export function sanitizeAlviaTranscript(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, "; ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function addTranscriptEntry(
  state: InterviewState,
  entry: TranscriptEntry,
): void {
  // Add to full persistence buffer (never truncated)
  state.fullTranscriptForPersistence.push(entry as PersistedTranscriptEntry);

  // Add to in-memory log (limited to MAX_TRANSCRIPT_IN_MEMORY for processing)
  state.transcriptLog.push(entry);
  if (state.transcriptLog.length > MAX_TRANSCRIPT_IN_MEMORY) {
    state.transcriptLog = state.transcriptLog.slice(-MAX_TRANSCRIPT_IN_MEMORY);
  }
}

export function detectQuestionRepeat(
  state: InterviewState,
  questionIndex: number,
): boolean {
  const recentAlviaUtterances = state.transcriptLog
    .filter((e) => e.speaker === "alvia" && e.questionIndex === questionIndex)
    .slice(-4);

  if (recentAlviaUtterances.length < 2) return false;

  for (let i = 0; i < recentAlviaUtterances.length - 1; i++) {
    for (let j = i + 1; j < recentAlviaUtterances.length; j++) {
      const kw1 = getKeywords(recentAlviaUtterances[i].text);
      const kw2 = getKeywords(recentAlviaUtterances[j].text);
      if (jaccardSimilarity(kw1, kw2) > 0.6) {
        return true;
      }
    }
  }

  return false;
}
