import type { TranscriptionQualitySignals, TranscriptionQualityFlag, TranscriptionQualityMetrics } from "@shared/schema";

export function createEmptyQualitySignals(): TranscriptionQualitySignals {
  return {
    shortUtteranceStreak: 0,
    foreignLanguageCount: 0,
    questionRepeatCount: 0,
    incoherentPhraseCount: 0,
    totalRespondentUtterances: 0,
    environmentCheckTriggered: false,
    environmentCheckTriggeredAt: null,
    utterancesSinceEnvironmentCheck: 0,
  };
}

interface NonEnglishDetectionResult {
  detected: boolean;
  confidence: number;
  detectedPatterns: string[];
}

const NON_LATIN_SCRIPT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Thai", pattern: /[\u0E00-\u0E7F]/ },
  { name: "Chinese", pattern: /[\u4E00-\u9FFF]/ },
  { name: "Arabic", pattern: /[\u0600-\u06FF]/ },
  { name: "Cyrillic", pattern: /[\u0400-\u04FF]/ },
  { name: "Japanese Hiragana", pattern: /[\u3040-\u309F]/ },
  { name: "Japanese Katakana", pattern: /[\u30A0-\u30FF]/ },
  { name: "Korean", pattern: /[\uAC00-\uD7AF]/ },
  { name: "Devanagari", pattern: /[\u0900-\u097F]/ },
  { name: "Hebrew", pattern: /[\u0590-\u05FF]/ },
  { name: "Greek", pattern: /[\u0370-\u03FF]/ },
];

const ROMANCE_LANGUAGE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Spanish", pattern: /\b(es un|conoce|digo|esto|pero|muy|tengo|hace|está|qué|cómo|también|porque|bueno|entonces|nada|todo|ahora|siempre|nunca)\b/i },
  { name: "French", pattern: /\b(c'est|je suis|qu'est|très|avec|pour|dans|mais|donc|alors|aussi|bien|même|plus|rien|tout)\b/i },
  { name: "German", pattern: /\b(ich bin|das ist|sehr|nicht|auch|oder|aber|wenn|weil|dann|noch|schon|immer|heute)\b/i },
  { name: "Portuguese", pattern: /\b(é um|está|tenho|fazer|porque|também|agora|então|muito|bom|isso|aqui|onde)\b/i },
  { name: "Italian", pattern: /\b(è un|sono|fare|perché|anche|adesso|molto|bene|questo|dove|come|quando|sempre)\b/i },
];

export function detectNonEnglish(text: string): NonEnglishDetectionResult {
  const detectedPatterns: string[] = [];
  let maxConfidence = 0;

  for (const { name, pattern } of NON_LATIN_SCRIPT_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push(`Non-Latin: ${name}`);
      maxConfidence = 1.0;
    }
  }

  for (const { name, pattern } of ROMANCE_LANGUAGE_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push(`Romance: ${name}`);
      maxConfidence = Math.max(maxConfidence, 0.8);
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    confidence: maxConfidence,
    detectedPatterns,
  };
}

interface IncoherenceDetectionResult {
  isIncoherent: boolean;
  confidence: number;
  reason: string;
}

export function detectIncoherentPhrase(text: string): IncoherenceDetectionResult {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) {
    return { isIncoherent: true, confidence: 1.0, reason: "Empty utterance" };
  }

  const concatenatedWordPattern = /\b(thisis|ofthe|inthe|onthe|tothe|forthe|andthe|butthe|withthe|fromthe|atthe|bythe)\b/i;
  if (concatenatedWordPattern.test(trimmed)) {
    return { isIncoherent: true, confidence: 0.9, reason: "Concatenated words detected" };
  }

  const repeatedCharsPattern = /(.)\1{4,}/;
  if (repeatedCharsPattern.test(trimmed)) {
    return { isIncoherent: true, confidence: 0.8, reason: "Repeated characters" };
  }

  const standaloneArticlePattern = /^(the|a|an|of|in|to|for|and|but|or|is|at|by|this|that)\.?$/i;
  if (standaloneArticlePattern.test(trimmed)) {
    return { isIncoherent: true, confidence: 0.7, reason: "Standalone article/preposition" };
  }

  const nonsensePhrasePatterns = [
    /thank you\s*\.?\s*$/i,
    /the against the/i,
    /a changing minus/i,
    /between you and me\.?\s*$/i,
  ];
  for (const pattern of nonsensePhrasePatterns) {
    if (pattern.test(trimmed)) {
      return { isIncoherent: true, confidence: 0.6, reason: "Known nonsense pattern" };
    }
  }

  const incompleteEndPattern = /\b(the|a|an|of|in|to|for|and|but|with|from|at|by|this|that|is|are|was|were)$/i;
  if (incompleteEndPattern.test(trimmed) && words.length <= 3) {
    return { isIncoherent: true, confidence: 0.5, reason: "Abrupt incomplete ending" };
  }

  return { isIncoherent: false, confidence: 0, reason: "" };
}

interface QualityUpdateResult {
  signals: TranscriptionQualitySignals;
  shouldTriggerEnvironmentCheck: boolean;
  detectedIssues: string[];
}

export function updateQualitySignals(
  currentSignals: TranscriptionQualitySignals,
  transcriptText: string,
  wasQuestionRepeated: boolean
): QualityUpdateResult {
  const signals = { ...currentSignals };
  const detectedIssues: string[] = [];

  signals.totalRespondentUtterances++;
  signals.utterancesSinceEnvironmentCheck++;

  const nonEnglishResult = detectNonEnglish(transcriptText);
  if (nonEnglishResult.detected) {
    signals.foreignLanguageCount++;
    detectedIssues.push(`Foreign language: ${nonEnglishResult.detectedPatterns.join(", ")}`);
  }

  const incoherenceResult = detectIncoherentPhrase(transcriptText);
  if (incoherenceResult.isIncoherent && incoherenceResult.confidence >= 0.5) {
    signals.incoherentPhraseCount++;
    detectedIssues.push(`Incoherent: ${incoherenceResult.reason}`);
  }

  const words = transcriptText.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 3) {
    signals.shortUtteranceStreak++;
    if (signals.shortUtteranceStreak >= 3) {
      detectedIssues.push(`Short utterance streak: ${signals.shortUtteranceStreak}`);
    }
  } else {
    signals.shortUtteranceStreak = 0;
  }

  if (wasQuestionRepeated) {
    signals.questionRepeatCount++;
    if (signals.questionRepeatCount >= 3) {
      detectedIssues.push(`Question repeated ${signals.questionRepeatCount} times`);
    }
  }

  const shouldTriggerEnvironmentCheck = shouldTriggerCheck(signals);

  return {
    signals,
    shouldTriggerEnvironmentCheck,
    detectedIssues,
  };
}

function shouldTriggerCheck(signals: TranscriptionQualitySignals): boolean {
  if (signals.environmentCheckTriggered && signals.utterancesSinceEnvironmentCheck < 15) {
    return false;
  }

  if (signals.foreignLanguageCount >= 1) {
    return true;
  }

  let weakSignalCount = 0;
  if (signals.shortUtteranceStreak >= 3) weakSignalCount++;
  if (signals.questionRepeatCount >= 3) weakSignalCount++;
  if (signals.incoherentPhraseCount >= 2) weakSignalCount++;

  return weakSignalCount >= 2;
}

export function calculateQualityScore(signals: TranscriptionQualitySignals): number {
  let score = 100;

  const foreignPenalty = Math.min(signals.foreignLanguageCount * 30, 60);
  score -= foreignPenalty;

  const incoherentPenalty = Math.min(signals.incoherentPhraseCount * 10, 30);
  score -= incoherentPenalty;

  if (signals.questionRepeatCount >= 3) {
    score -= 15 + (signals.questionRepeatCount - 3) * 5;
  }

  if (signals.shortUtteranceStreak > 2) {
    score -= (signals.shortUtteranceStreak - 2) * 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function getQualityFlags(signals: TranscriptionQualitySignals): TranscriptionQualityFlag[] {
  const flags: TranscriptionQualityFlag[] = [];

  if (signals.foreignLanguageCount > 0) {
    flags.push("foreign_language_hallucination");
  }

  if (signals.incoherentPhraseCount >= 2 || signals.shortUtteranceStreak >= 3) {
    flags.push("garbled_audio");
  }

  if (signals.questionRepeatCount >= 3) {
    flags.push("repeated_clarification");
  }

  if (signals.environmentCheckTriggered) {
    flags.push("environment_noise");
  }

  return flags;
}

export function createQualityMetrics(signals: TranscriptionQualitySignals): TranscriptionQualityMetrics {
  return {
    signals,
    qualityScore: calculateQualityScore(signals),
    flagsDetected: getQualityFlags(signals),
    environmentCheckCount: signals.environmentCheckTriggered ? 1 : 0,
  };
}
