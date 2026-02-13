import type {
  BarbaraGuidanceLogEntry,
  BarbaraGuidanceAction,
  GuidanceAdherenceResult,
  GuidanceAdherenceSummary,
  PersistedTranscriptEntry,
} from "@shared/schema";
import { getKeywords, overlapCoefficient, INTERVIEW_META_STOPWORDS } from "./voice-interview/text-utils";

const SNIPPET_MAX_LENGTH = 200;
const MAX_TURNS_LOOKAHEAD = 4;
const TOPICAL_RELEVANCE_THRESHOLD = 0.3;
const MIN_KEYWORDS_FOR_TOPICAL_CHECK = 2;
const MAX_TURNS_FOR_FOLLOWED = 2;

function truncateSnippet(text: string): string {
  if (text.length <= SNIPPET_MAX_LENGTH) return text;
  return text.slice(0, SNIPPET_MAX_LENGTH) + "…";
}

function getAlviaResponsesAfterTimestamp(
  transcript: PersistedTranscriptEntry[],
  afterTimestamp: number,
  maxTurns: number = MAX_TURNS_LOOKAHEAD,
): PersistedTranscriptEntry[] {
  const responses: PersistedTranscriptEntry[] = [];
  for (const entry of transcript) {
    if (entry.timestamp <= afterTimestamp) continue;
    if (entry.speaker === "alvia") {
      responses.push(entry);
      if (responses.length >= maxTurns) break;
    }
  }
  return responses;
}

function containsQuestionMark(text: string): boolean {
  return /\?/.test(text);
}

function containsKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => new RegExp(`\\b${kw}\\b`).test(lower));
}

function scoreProbeFollowup(
  entry: BarbaraGuidanceLogEntry,
  alviaResponses: PersistedTranscriptEntry[],
): { result: GuidanceAdherenceResult; reason: string } {
  if (alviaResponses.length === 0) {
    return { result: "not_applicable", reason: "No Alvia response found after guidance" };
  }

  const firstResponse = alviaResponses[0];
  const hasQuestion = containsQuestionMark(firstResponse.text);
  const hasProbeWords = containsKeywords(firstResponse.text, [
    "tell me more", "elaborate", "can you explain", "what do you mean",
    "could you", "why", "how", "what", "describe", "example",
    "specific", "deeper", "further", "expand",
  ]);

  if (!hasQuestion && !hasProbeWords) {
    return { result: "not_followed", reason: "Alvia's response did not include follow-up probing" };
  }

  if (!hasQuestion || !hasProbeWords) {
    const detail = hasQuestion
      ? "asked a question, but without clear probing language"
      : "used probing language but did not ask a direct question";
    return { result: "partially_followed", reason: `Alvia ${detail}` };
  }

  const barbaraKeywords = getKeywords(entry.messageSummary, INTERVIEW_META_STOPWORDS);
  if (barbaraKeywords.size < MIN_KEYWORDS_FOR_TOPICAL_CHECK) {
    return { result: "followed", reason: "Alvia asked a follow-up question with probing language (topical check skipped — too few guidance keywords)" };
  }

  const alviaKeywords = getKeywords(firstResponse.text);
  const overlap = overlapCoefficient(barbaraKeywords, alviaKeywords);

  if (overlap >= TOPICAL_RELEVANCE_THRESHOLD) {
    return { result: "followed", reason: `Alvia asked a topically relevant follow-up question (overlap: ${Math.round(overlap * 100)}%)` };
  }

  return { result: "partially_followed", reason: `Alvia asked a probing question but on a different topic (overlap: ${Math.round(overlap * 100)}%)` };
}

function scoreSuggestNextQuestion(
  entry: BarbaraGuidanceLogEntry,
  transcript: PersistedTranscriptEntry[],
): { result: GuidanceAdherenceResult; reason: string } {
  const laterEntries = transcript.filter(
    (t) => t.timestamp > entry.timestamp,
  );

  const questionChanged = laterEntries.some(
    (t) => t.questionIndex > entry.questionIndex,
  );

  if (questionChanged) {
    const turnsUntilChange = laterEntries.findIndex(
      (t) => t.questionIndex > entry.questionIndex,
    );
    if (turnsUntilChange <= MAX_TURNS_FOR_FOLLOWED) {
      return { result: "followed", reason: `Question advanced within ${turnsUntilChange + 1} turn(s) of guidance` };
    }
    return { result: "partially_followed", reason: `Question eventually advanced but took ${turnsUntilChange + 1} turns` };
  }

  const alviaAfter = laterEntries.filter((t) => t.speaker === "alvia");
  const hasTransitionLanguage = alviaAfter.slice(0, 3).some((t) =>
    containsKeywords(t.text, [
      "move on", "next question", "let's turn to", "shifting to",
      "another topic", "let me ask you about", "moving forward",
      "transition", "let's talk about", "i'd like to ask",
    ]),
  );

  if (hasTransitionLanguage) {
    return { result: "partially_followed", reason: "Alvia used transition language but question index did not advance" };
  }

  return { result: "not_followed", reason: "Question did not advance and no transition language detected" };
}

function scoreAcknowledgePrior(
  alviaResponses: PersistedTranscriptEntry[],
  transcript: PersistedTranscriptEntry[],
  guidanceTimestamp: number,
): { result: GuidanceAdherenceResult; reason: string } {
  if (alviaResponses.length === 0) {
    return { result: "not_applicable", reason: "No Alvia response found after guidance" };
  }

  const respondentBefore = transcript
    .filter((t) => t.speaker === "respondent" && t.timestamp < guidanceTimestamp)
    .slice(-2);

  if (respondentBefore.length === 0) {
    return { result: "not_applicable", reason: "No respondent speech found before guidance to acknowledge" };
  }

  const firstResponse = alviaResponses[0];
  const hasAcknowledgment = containsKeywords(firstResponse.text, [
    "you mentioned", "you said", "you brought up", "you talked about",
    "that's a great point", "thank you for sharing", "i appreciate",
    "that's interesting", "i hear you", "absolutely", "exactly",
    "right", "i understand", "makes sense", "good point",
  ]);

  if (hasAcknowledgment) {
    return { result: "followed", reason: "Alvia acknowledged the respondent's prior statement" };
  }
  return { result: "not_followed", reason: "No acknowledgment language detected in Alvia's response" };
}

function scoreConfirmUnderstanding(
  alviaResponses: PersistedTranscriptEntry[],
): { result: GuidanceAdherenceResult; reason: string } {
  if (alviaResponses.length === 0) {
    return { result: "not_applicable", reason: "No Alvia response found after guidance" };
  }

  const firstResponse = alviaResponses[0];
  const hasConfirmation = containsKeywords(firstResponse.text, [
    "so you're saying", "if i understand correctly", "let me make sure",
    "you mean", "in other words", "so what you're", "to clarify",
    "just to confirm", "do i have that right", "is that correct",
    "am i understanding", "so to summarize",
  ]);

  if (hasConfirmation) {
    return { result: "followed", reason: "Alvia sought to confirm understanding of respondent's answer" };
  }

  const hasQuestion = containsQuestionMark(firstResponse.text);
  if (hasQuestion) {
    return { result: "partially_followed", reason: "Alvia asked a question but without explicit confirmation language" };
  }
  return { result: "not_followed", reason: "No understanding confirmation detected in Alvia's response" };
}

function scoreEnvironmentCheck(
  alviaResponses: PersistedTranscriptEntry[],
): { result: GuidanceAdherenceResult; reason: string } {
  if (alviaResponses.length === 0) {
    return { result: "not_applicable", reason: "No Alvia response found after guidance" };
  }

  const combinedText = alviaResponses.slice(0, 2).map((r) => r.text).join(" ");
  const hasEnvCheck = containsKeywords(combinedText, [
    "audio", "hear", "connection", "microphone", "sound",
    "can you hear me", "having trouble", "environment",
    "background noise", "signal", "is everything",
  ]);

  if (hasEnvCheck) {
    return { result: "followed", reason: "Alvia checked the audio/environment as suggested" };
  }
  return { result: "not_followed", reason: "No environment check language detected in Alvia's response" };
}

function scoreTimeReminder(
  alviaResponses: PersistedTranscriptEntry[],
): { result: GuidanceAdherenceResult; reason: string } {
  if (alviaResponses.length === 0) {
    return { result: "not_applicable", reason: "No Alvia response found after guidance" };
  }

  const combinedText = alviaResponses.slice(0, 3).map((r) => r.text).join(" ");
  const hasTimeRef = containsKeywords(combinedText, [
    "time", "remaining", "wrap up", "wrapping up", "last few",
    "final question", "before we finish", "running short",
    "almost done", "last question", "one more",
    "a few more minutes", "coming to the end",
  ]);

  if (hasTimeRef) {
    return { result: "followed", reason: "Alvia referenced time constraints as suggested" };
  }
  return { result: "not_followed", reason: "No time-related language detected in Alvia's response" };
}

function scoreEntry(
  entry: BarbaraGuidanceLogEntry,
  transcript: PersistedTranscriptEntry[],
): { result: GuidanceAdherenceResult; reason: string; snippet?: string } {
  if (!entry.injected) {
    return { result: "not_applicable", reason: "Guidance was not injected (low confidence or action=none)" };
  }

  if (entry.action === "none") {
    return { result: "not_applicable", reason: "No-op guidance action" };
  }

  const alviaResponses = getAlviaResponsesAfterTimestamp(transcript, entry.timestamp);
  const snippet = alviaResponses.length > 0
    ? truncateSnippet(alviaResponses[0].text)
    : undefined;

  let scoring: { result: GuidanceAdherenceResult; reason: string };

  switch (entry.action) {
    case "probe_followup":
      scoring = scoreProbeFollowup(entry, alviaResponses);
      break;
    case "suggest_next_question":
      scoring = scoreSuggestNextQuestion(entry, transcript);
      break;
    case "acknowledge_prior":
      scoring = scoreAcknowledgePrior(alviaResponses, transcript, entry.timestamp);
      break;
    case "confirm_understanding":
      scoring = scoreConfirmUnderstanding(alviaResponses);
      break;
    case "suggest_environment_check":
      scoring = scoreEnvironmentCheck(alviaResponses);
      break;
    case "time_reminder":
      scoring = scoreTimeReminder(alviaResponses);
      break;
    default:
      scoring = { result: "unscored", reason: `Unknown action: ${entry.action}` };
  }

  return { ...scoring, snippet };
}

export function scoreGuidanceAdherence(
  guidanceLog: BarbaraGuidanceLogEntry[],
  transcript: PersistedTranscriptEntry[],
): BarbaraGuidanceLogEntry[] {
  return guidanceLog.map((entry) => {
    const { result, reason, snippet } = scoreEntry(entry, transcript);
    return {
      ...entry,
      adherence: result,
      adherenceReason: reason,
      alviaResponseSnippet: snippet,
    };
  });
}

const ALL_ACTIONS: BarbaraGuidanceAction[] = [
  "probe_followup", "suggest_next_question", "acknowledge_prior",
  "confirm_understanding", "suggest_environment_check", "time_reminder", "none",
];

export function computeAdherenceSummary(
  scoredLog: BarbaraGuidanceLogEntry[],
): GuidanceAdherenceSummary {
  const injectedEntries = scoredLog.filter((e) => e.injected);
  const scoredEntries = scoredLog.filter(
    (e) => e.adherence && e.adherence !== "not_applicable" && e.adherence !== "unscored",
  );

  const followedCount = scoredLog.filter((e) => e.adherence === "followed").length;
  const partiallyFollowedCount = scoredLog.filter((e) => e.adherence === "partially_followed").length;
  const notFollowedCount = scoredLog.filter((e) => e.adherence === "not_followed").length;
  const notApplicableCount = scoredLog.filter((e) => e.adherence === "not_applicable").length;

  const overallAdherenceRate = scoredEntries.length > 0
    ? (followedCount + partiallyFollowedCount * 0.5) / scoredEntries.length
    : 0;

  const byAction = {} as GuidanceAdherenceSummary["byAction"];
  for (const action of ALL_ACTIONS) {
    const actionEntries = scoredLog.filter((e) => e.action === action);
    const actionInjected = actionEntries.filter((e) => e.injected);
    const actionScored = actionEntries.filter(
      (e) => e.adherence && e.adherence !== "not_applicable" && e.adherence !== "unscored",
    );
    const actionFollowed = actionEntries.filter(
      (e) => e.adherence === "followed" || e.adherence === "partially_followed",
    ).length;

    byAction[action] = {
      total: actionEntries.length,
      injected: actionInjected.length,
      followed: actionFollowed,
      adherenceRate: actionScored.length > 0 ? actionFollowed / actionScored.length : 0,
    };
  }

  return {
    totalGuidanceEvents: scoredLog.length,
    injectedCount: injectedEntries.length,
    scoredCount: scoredEntries.length,
    followedCount,
    partiallyFollowedCount,
    notFollowedCount,
    notApplicableCount,
    overallAdherenceRate,
    byAction,
    computedAt: Date.now(),
  };
}
