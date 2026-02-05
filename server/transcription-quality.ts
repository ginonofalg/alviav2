import type {
  TranscriptionQualitySignals,
  TranscriptionQualityFlag,
  TranscriptionQualityMetrics,
} from "@shared/schema";

export function createEmptyQualitySignals(): TranscriptionQualitySignals {
  return {
    shortUtteranceStreak: 0,
    foreignLanguageCount: 0,
    questionRepeatCount: 0,
    incoherentPhraseCount: 0,
    repeatedWordGlitchCount: 0,
    totalRespondentUtterances: 0,
    environmentCheckTriggered: false,
    environmentCheckTriggeredAt: null,
    utterancesSinceEnvironmentCheck: 0,
    consecutiveGoodUtterances: 0,
    vadEagernessReduced: false,
    vadEagernessReducedAt: null,
    recentUtteranceQuality: [],
  };
}

const RECENT_WINDOW_SIZE = 5;

// Helper to check if recent window has any quality issues
export function hasRecentQualityIssues(
  signals: TranscriptionQualitySignals,
  checkFlags: {
    foreignLanguage?: boolean;
    incoherence?: boolean;
    repeatedWordGlitch?: boolean;
    shortUtterance?: boolean;
  } = {},
): boolean {
  const window = signals.recentUtteranceQuality;
  if (window.length === 0) return false;

  return window.some((flags) => {
    if (checkFlags.foreignLanguage && flags.hadForeignLanguage) return true;
    if (checkFlags.incoherence && flags.hadIncoherence) return true;
    if (checkFlags.repeatedWordGlitch && flags.hadRepeatedWordGlitch) return true;
    if (checkFlags.shortUtterance && flags.hadShortUtterance) return true;
    return false;
  });
}

// Helper to add current utterance quality to sliding window
function addToRecentWindow(
  signals: TranscriptionQualitySignals,
  flags: {
    hadForeignLanguage: boolean;
    hadIncoherence: boolean;
    hadRepeatedWordGlitch: boolean;
    hadShortUtterance: boolean;
  },
): void {
  signals.recentUtteranceQuality.push(flags);
  // Keep only last N utterances
  if (signals.recentUtteranceQuality.length > RECENT_WINDOW_SIZE) {
    signals.recentUtteranceQuality.shift();
  }
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
  {
    name: "Spanish",
    pattern:
      /\b(es un|conoce|digo|esto|pero|muy|tengo|hace|está|qué|cómo|también|porque|bueno|entonces|nada|todo|ahora|siempre|nunca)\b/i,
  },
  {
    name: "French",
    pattern:
      /\b(c'est|je suis|qu'est|très|avec|pour|dans|mais|donc|alors|aussi|bien|même|plus|rien|tout)\b/i,
  },
  {
    name: "German",
    pattern:
      /\b(ich bin|das ist|sehr|nicht|auch|oder|aber|wenn|weil|dann|noch|schon|immer|heute)\b/i,
  },
  {
    name: "Portuguese",
    pattern:
      /\b(é um|está|tenho|fazer|porque|também|agora|então|muito|bom|isso|aqui|onde)\b/i,
  },
  {
    name: "Italian",
    pattern:
      /\b(è un|sono|fare|perché|anche|adesso|molto|bene|questo|dove|come|quando|sempre)\b/i,
  },
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

// Detects repeated word glitches caused by connection issues (e.g., "we we we we we...")
export interface RepeatedWordDetectionResult {
  detected: boolean;
  confidence: number;
  repeatedWord: string | null;
  repeatCount: number;
}

// Strips punctuation from a word for comparison (handles "we," "we." "we!" etc.)
function normalizeWord(word: string): string {
  return word.replace(/[^\w'-]/g, "").toLowerCase();
}

export function detectRepeatedWords(text: string): RepeatedWordDetectionResult {
  // Split on whitespace and normalize each word (strip punctuation for comparison)
  const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
  const words = rawWords.map(normalizeWord).filter((w) => w.length > 0);

  if (words.length < 4) {
    return {
      detected: false,
      confidence: 0,
      repeatedWord: null,
      repeatCount: 0,
    };
  }

  // Count consecutive identical words (after normalization)
  let maxRepeat = 1;
  let currentRepeat = 1;
  let repeatedWord: string | null = null;

  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      currentRepeat++;
      if (currentRepeat > maxRepeat) {
        maxRepeat = currentRepeat;
        repeatedWord = words[i];
      }
    } else {
      currentRepeat = 1;
    }
  }

  // 4+ consecutive identical words is almost certainly a connection glitch
  if (maxRepeat >= 4) {
    return {
      detected: true,
      confidence: Math.min(1.0, 0.5 + (maxRepeat - 4) * 0.1),
      repeatedWord,
      repeatCount: maxRepeat,
    };
  }

  return { detected: false, confidence: 0, repeatedWord: null, repeatCount: 0 };
}

export function detectIncoherentPhrase(
  text: string,
): IncoherenceDetectionResult {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return { isIncoherent: true, confidence: 1.0, reason: "Empty utterance" };
  }

  const concatenatedWordPattern =
    /\b(thisis|ofthe|inthe|onthe|tothe|forthe|andthe|butthe|withthe|fromthe|atthe|bythe)\b/i;
  if (concatenatedWordPattern.test(trimmed)) {
    return {
      isIncoherent: true,
      confidence: 0.9,
      reason: "Concatenated words detected",
    };
  }

  const repeatedCharsPattern = /(.)\1{4,}/;
  if (repeatedCharsPattern.test(trimmed)) {
    return {
      isIncoherent: true,
      confidence: 0.8,
      reason: "Repeated characters",
    };
  }

  const standaloneArticlePattern =
    /^(the|a|an|of|in|to|for|and|but|or|is|at|by|this|that)\.?$/i;
  if (standaloneArticlePattern.test(trimmed)) {
    return {
      isIncoherent: true,
      confidence: 0.7,
      reason: "Standalone article/preposition",
    };
  }

  const nonsensePhrasePatterns = [
    /thank you\s*\.?\s*$/i,
    /the against the/i,
    /a changing minus/i,
    /between you and me\.?\s*$/i,
  ];
  for (const pattern of nonsensePhrasePatterns) {
    if (pattern.test(trimmed)) {
      return {
        isIncoherent: true,
        confidence: 0.6,
        reason: "Known nonsense pattern",
      };
    }
  }

  const incompleteEndPattern =
    /\b(the|a|an|of|in|to|for|and|but|with|from|at|by|this|that|is|are|was|were)$/i;
  if (incompleteEndPattern.test(trimmed) && words.length <= 3) {
    return {
      isIncoherent: true,
      confidence: 0.5,
      reason: "Abrupt incomplete ending",
    };
  }

  return { isIncoherent: false, confidence: 0, reason: "" };
}

interface QualityUpdateResult {
  signals: TranscriptionQualitySignals;
  shouldTriggerEnvironmentCheck: boolean;
  detectedIssues: string[];
}

// Question types that naturally expect short answers
const SHORT_ANSWER_QUESTION_TYPES = ["yes_no", "scale", "numeric"];

export function updateQualitySignals(
  currentSignals: TranscriptionQualitySignals,
  transcriptText: string,
  wasQuestionRepeated: boolean,
  questionType?: string,
): QualityUpdateResult {
  const signals = { 
    ...currentSignals,
    recentUtteranceQuality: [...currentSignals.recentUtteranceQuality],
  };
  const detectedIssues: string[] = [];

  // Skip short-utterance tracking for question types that expect short answers
  const skipShortUtteranceTracking =
    questionType && SHORT_ANSWER_QUESTION_TYPES.includes(questionType);

  signals.totalRespondentUtterances++;
  signals.utterancesSinceEnvironmentCheck++;

  // Track quality flags for this utterance (for sliding window)
  let hadForeignLanguage = false;
  let hadIncoherence = false;
  let hadRepeatedWordGlitch = false;
  let hadShortUtterance = false;

  const nonEnglishResult = detectNonEnglish(transcriptText);
  if (nonEnglishResult.detected) {
    signals.foreignLanguageCount++;
    hadForeignLanguage = true;
    detectedIssues.push(
      `Foreign language: ${nonEnglishResult.detectedPatterns.join(", ")}`,
    );
  }

  const incoherenceResult = detectIncoherentPhrase(transcriptText);
  if (incoherenceResult.isIncoherent && incoherenceResult.confidence >= 0.5) {
    signals.incoherentPhraseCount++;
    hadIncoherence = true;
    detectedIssues.push(`Incoherent: ${incoherenceResult.reason}`);
  }

  // Detect repeated word glitches (connection issues causing "we we we we...")
  const repeatedWordResult = detectRepeatedWords(transcriptText);
  if (repeatedWordResult.detected) {
    signals.repeatedWordGlitchCount++;
    hadRepeatedWordGlitch = true;
    detectedIssues.push(
      `Repeated word glitch: "${repeatedWordResult.repeatedWord}" x${repeatedWordResult.repeatCount}`,
    );
  }

  const words = transcriptText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  
  // Only track short utterances for question types that expect longer answers
  // Skip for yes_no, scale, numeric questions where short answers are expected
  if (!skipShortUtteranceTracking) {
    if (words.length < 3) {
      signals.shortUtteranceStreak++;
      hadShortUtterance = true;
      if (signals.shortUtteranceStreak >= 3) {
        detectedIssues.push(
          `Short utterance streak: ${signals.shortUtteranceStreak}`,
        );
      }
    } else {
      signals.shortUtteranceStreak = 0;
    }
  } else {
    // For short-answer questions, don't count as short utterance but still reset streak
    // if we get a longer answer
    if (words.length >= 3) {
      signals.shortUtteranceStreak = 0;
    }
  }

  if (wasQuestionRepeated) {
    signals.questionRepeatCount++;
    if (signals.questionRepeatCount >= 3) {
      detectedIssues.push(
        `Question repeated ${signals.questionRepeatCount} times`,
      );
    }
  }

  // Add this utterance's quality flags to the sliding window
  addToRecentWindow(signals, {
    hadForeignLanguage,
    hadIncoherence,
    hadRepeatedWordGlitch,
    hadShortUtterance,
  });

  const shouldTriggerEnvironmentCheck = shouldTriggerCheck(signals);

  return {
    signals,
    shouldTriggerEnvironmentCheck,
    detectedIssues,
  };
}

function shouldTriggerCheck(signals: TranscriptionQualitySignals): boolean {
  if (
    signals.environmentCheckTriggered &&
    signals.utterancesSinceEnvironmentCheck < 5
  ) {
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

export function calculateQualityScore(
  signals: TranscriptionQualitySignals,
): number {
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

  // Penalty for repeated word glitches (connection issues causing garbled transcription)
  const repeatedWordPenalty = Math.min(
    signals.repeatedWordGlitchCount * 15,
    45,
  );
  score -= repeatedWordPenalty;

  return Math.max(0, Math.min(100, score));
}

export function getQualityFlags(
  signals: TranscriptionQualitySignals,
): TranscriptionQualityFlag[] {
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

  if (signals.repeatedWordGlitchCount > 0) {
    flags.push("repeated_word_glitch");
  }

  return flags;
}

// Sanitizes glitched transcripts by collapsing 4+ consecutive identical words to 2
// This preserves natural emphasis ("yes yes") while removing obvious glitches ("we we we we we...")
// Handles both space-separated ("we we we we") and punctuation-separated ("we, we, we, we") patterns
export function sanitizeGlitchedTranscript(text: string): string {
  // First pass: Handle space-separated repeats (e.g., "we we we we we")
  // Match a word followed by 3+ whitespace-separated repetitions (total 4+)
  let result = text.replace(/\b(\w+)((?:\s+\1){3,})\b/gi, "$1 $1");

  // Second pass: Handle punctuation-separated repeats (e.g., "we, we, we, we" or "I. I. I. I.")
  // Match word + punctuation patterns repeated 4+ times (requires punctuation to avoid re-matching first pass)
  result = result.replace(/\b(\w+)([,.\-;:!?]\s+\1){3,}\b/gi, "$1 $1");

  return result;
}

export function createQualityMetrics(
  signals: TranscriptionQualitySignals,
): TranscriptionQualityMetrics {
  return {
    signals,
    qualityScore: calculateQualityScore(signals),
    flagsDetected: getQualityFlags(signals),
    environmentCheckCount: signals.environmentCheckTriggered ? 1 : 0,
  };
}

export function shouldReduceVadEagerness(
  signals: TranscriptionQualitySignals,
): boolean {
  if (signals.vadEagernessReduced) {
    return false;
  }

  // Expanded veto: only reduce VAD eagerness when short utterances are the ONLY signal
  // If there are any transcription quality issues (foreign language, incoherence, 
  // repeated-word glitches), the problem is likely audio/transcription quality,
  // not VAD timing. VAD adjustment won't help and may worsen those issues.
  const hasRecentBlockingIssues = hasRecentQualityIssues(signals, {
    foreignLanguage: true,
    incoherence: true,
    repeatedWordGlitch: true,
  });

  if (signals.shortUtteranceStreak >= 4 && !hasRecentBlockingIssues) {
    return true;
  }

  return false;
}

export function shouldRestoreVadEagerness(
  signals: TranscriptionQualitySignals,
): boolean {
  if (!signals.vadEagernessReduced) {
    return false;
  }

  if (signals.consecutiveGoodUtterances >= 10) {
    return true;
  }

  return false;
}

export function updateGoodUtteranceTracking(
  signals: TranscriptionQualitySignals,
  sanitizedUtteranceText: string,
): void {
  const words = sanitizedUtteranceText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  
  // Use recent window to check for quality issues instead of cumulative counters
  // This allows recovery once recent utterances are clean
  const hasRecentIssues = hasRecentQualityIssues(signals, {
    foreignLanguage: true,
    incoherence: true,
    repeatedWordGlitch: true,
  });

  // Note: shortUtteranceStreak is already a "streak" that resets, so we use it directly
  const isGoodUtterance = words.length >= 3 && !hasRecentIssues && signals.shortUtteranceStreak === 0;

  if (isGoodUtterance) {
    signals.consecutiveGoodUtterances++;
  } else {
    signals.consecutiveGoodUtterances = 0;
  }
}
