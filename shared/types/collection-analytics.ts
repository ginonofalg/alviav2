import type { QualityFlag } from "./interview-state";

export type ThemeSentiment = "positive" | "neutral" | "negative" | "mixed";

export type ThemeVerbatim = {
  quote: string;
  questionIndex: number;
  sessionId: string;
  sentiment: ThemeSentiment;
};

export type EnhancedTheme = {
  id: string;
  theme: string;
  description: string;
  count: number;
  sessions: string[];
  prevalence: number;
  verbatims: ThemeVerbatim[];
  sentiment: ThemeSentiment;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  depth: "mentioned" | "explored" | "deeply_explored";
  depthScore: number;
  relatedQuestions: number[];
  subThemes?: string[];
  isEmergent?: boolean;
};

export type KeyFinding = {
  finding: string;
  significance: string;
  supportingVerbatims: ThemeVerbatim[];
  relatedThemes: string[];
};

export type ConsensusPoint = {
  topic: string;
  position: string;
  agreementLevel: number;
  verbatims: ThemeVerbatim[];
};

export type DivergencePoint = {
  topic: string;
  perspectives: { position: string; count: number; verbatims: ThemeVerbatim[] }[];
};

export type Recommendation = {
  type: "question_improvement" | "explore_deeper" | "coverage_gap" | "needs_probing";
  title: string;
  description: string;
  relatedQuestions?: number[];
  relatedThemes?: string[];
  priority: "high" | "medium" | "low";
};

export type EnhancedQuestionPerformance = {
  questionIndex: number;
  questionText: string;
  avgWordCount: number;
  avgTurnCount: number;
  avgQualityScore: number;
  responseCount: number;
  qualityFlagCounts: Record<QualityFlag, number>;
  primaryThemes: string[];
  verbatims: ThemeVerbatim[];
  perspectiveRange: "narrow" | "moderate" | "diverse";
  responseRichness: "brief" | "moderate" | "detailed";
};

export type CollectionAnalytics = {
  themes: EnhancedTheme[];
  keyFindings: KeyFinding[];
  consensusPoints: ConsensusPoint[];
  divergencePoints: DivergencePoint[];
  questionPerformance: EnhancedQuestionPerformance[];
  recommendations: Recommendation[];
  overallStats: {
    totalCompletedSessions: number;
    avgSessionDuration: number;
    avgQualityScore: number;
    commonQualityIssues: { flag: QualityFlag; count: number }[];
    sentimentDistribution: { positive: number; neutral: number; negative: number };
    avgThemesPerSession: number;
    themeDepthScore: number;
  };
  generatedAt: number;
};
