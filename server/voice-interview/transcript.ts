import type { PersistedTranscriptEntry } from "@shared/schema";
import type { TranscriptEntry } from "../barbara-orchestrator";
import type { InterviewState } from "./types";
import { MAX_TRANSCRIPT_IN_MEMORY } from "./types";

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

  const getKeywords = (text: string): Set<string> => {
    const stopWords = new Set([
      "a",
      "an",
      "the",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "under",
      "and",
      "but",
      "if",
      "or",
      "because",
      "until",
      "while",
      "although",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "its",
      "our",
      "their",
      "this",
      "that",
      "these",
      "those",
      "what",
      "which",
      "who",
      "whom",
      "whose",
      "so",
      "just",
      "now",
      "then",
      "here",
      "there",
      "when",
      "where",
      "why",
      "how",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "not",
      "only",
      "same",
      "than",
      "too",
      "very",
      "please",
      "thank",
      "thanks",
      "sorry",
      "okay",
      "ok",
      "yes",
      "yeah",
    ]);
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w)),
    );
  };

  const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 && b.size === 0) return 0;
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return intersection.size / union.size;
  };

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
