import type { ThemeSentiment, ThemeVerbatim, KeyFinding, ConsensusPoint, DivergencePoint, Recommendation } from "./collection-analytics";

export type CollectionPerformanceSummary = {
  collectionId: string;
  collectionName: string;
  sessionCount: number;
  avgQualityScore: number;
  avgSessionDuration: number;
  topThemes: string[];
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  createdAt: string;
};

export type QuestionConsistency = {
  questionIndex: number;
  questionText: string;
  avgQualityAcrossCollections: number;
  qualityVariance: number;
  avgWordCountAcrossCollections: number;
  bestPerformingCollectionId: string;
  worstPerformingCollectionId: string;
  consistencyRating: "consistent" | "variable" | "inconsistent";
  verbatims: ThemeVerbatim[];
  primaryThemes: string[];
};

export type AggregatedThemeWithDetail = {
  theme: string;
  description: string;
  totalMentions: number;
  collectionsAppeared: number;
  avgPrevalence: number;
  sentiment: ThemeSentiment;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  verbatims: ThemeVerbatim[];
  depth: "mentioned" | "explored" | "deeply_explored";
  isEmergent: boolean;
  collectionSources: { collectionId: string; collectionName: string }[];
};

export type KeyFindingWithSource = KeyFinding & {
  sourceCollectionId: string;
  sourceCollectionName: string;
};

export type ConsensusPointWithSource = ConsensusPoint & {
  sourceCollectionId: string;
  sourceCollectionName: string;
};

export type DivergencePointWithSource = DivergencePoint & {
  sourceCollectionId: string;
  sourceCollectionName: string;
};

export type TemplateAnalytics = {
  collectionPerformance: CollectionPerformanceSummary[];
  questionConsistency: QuestionConsistency[];
  aggregatedThemes: AggregatedThemeWithDetail[];
  keyFindings: KeyFindingWithSource[];
  consensusPoints: ConsensusPointWithSource[];
  divergencePoints: DivergencePointWithSource[];
  templateEffectiveness: {
    totalSessions: number;
    totalCollections: number;
    avgQualityScore: number;
    avgSessionDuration: number;
    avgCompletionRate: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  };
  recommendations: Recommendation[];
  generatedAt: number;
};
