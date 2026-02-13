export type TranscriptionQualityFlag =
  | "garbled_audio"
  | "environment_noise"
  | "repeated_clarification"
  | "foreign_language_hallucination"
  | "repeated_word_glitch";

export type UtteranceQualityFlags = {
  hadForeignLanguage: boolean;
  hadIncoherence: boolean;
  hadRepeatedWordGlitch: boolean;
  hadShortUtterance: boolean;
};

export type TranscriptionQualitySignals = {
  shortUtteranceStreak: number;
  foreignLanguageCount: number;
  questionRepeatCount: number;
  incoherentPhraseCount: number;
  repeatedWordGlitchCount: number;
  totalRespondentUtterances: number;
  environmentCheckTriggered: boolean;
  environmentCheckTriggeredAt: number | null;
  utterancesSinceEnvironmentCheck: number;
  environmentCheckCount: number;
  consecutiveGoodUtterances: number;
  vadEagernessReduced: boolean;
  vadEagernessReducedAt: number | null;
  recentUtteranceQuality: UtteranceQualityFlags[];
};

export type TranscriptionQualityMetrics = {
  signals: TranscriptionQualitySignals;
  qualityScore: number;
  flagsDetected: TranscriptionQualityFlag[];
  environmentCheckCount: number;
};
