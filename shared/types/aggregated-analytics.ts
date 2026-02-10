import type { ThemeVerbatim } from "./collection-analytics";
import type { CrossTemplateTheme } from "./project-analytics";

export type StalenessStatus = "fresh" | "aging" | "stale" | "none";

export type EntityWithStaleness = {
  id: string;
  name: string;
  stalenessStatus: StalenessStatus;
  analyticsGeneratedAt: number | null;
  newSessionsSinceRefresh: number;
  lastRefreshLabel: string;
};

export type ProjectSummaryWithAnalytics = EntityWithStaleness & {
  templateCount: number;
  collectionCount: number;
  totalSessions: number;
  completedSessions: number;
  avgQualityScore: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number } | null;
  executiveSummary: {
    headline: string;
    keyTakeaways: string[];
  } | null;
  hasContextualRecommendations: boolean;
  contextType: string | null;
};

export type AggregatedStrategicInsight = {
  insight: string;
  significance: string;
  sourceProjectId: string;
  sourceProjectName: string;
  verbatims: ThemeVerbatim[];
};

export type AggregatedKeyFinding = {
  finding: string;
  significance: string;
  supportingVerbatims: ThemeVerbatim[];
  relatedThemes: string[];
  sourceType: "project" | "template" | "collection";
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceCollectionId?: string;
  sourceCollectionName?: string;
};

export type AggregatedCrossTemplateTheme = CrossTemplateTheme & {
  sourceProjectId: string;
  sourceProjectName: string;
  depth?: "mentioned" | "explored" | "deeply_explored";
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
};

export type AggregatedConsensusPoint = {
  topic: string;
  position: string;
  agreementLevel: number;
  verbatims: ThemeVerbatim[];
  sourceType: "project" | "template" | "collection";
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceCollectionId?: string;
  sourceCollectionName?: string;
};

export type AggregatedDivergencePoint = {
  topic: string;
  perspectives: { position: string; count: number; verbatims: ThemeVerbatim[] }[];
  sourceType: "project" | "template" | "collection";
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceCollectionId?: string;
  sourceCollectionName?: string;
};

export type TemplateStaleness = EntityWithStaleness & {
  collectionCount: number;
  collectionsNeedingRefresh: number;
  totalSessions: number;
  sourceProjectId: string;
  sourceProjectName: string;
};

export type CollectionStaleness = EntityWithStaleness & {
  sessionCount: number;
  sourceProjectId: string;
  sourceProjectName: string;
  sourceTemplateId: string;
  sourceTemplateName: string;
};

export type AggregatedContextualRecommendation = {
  projectId: string;
  projectName: string;
  contextType: string;
  actionItems: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    relatedThemes: string[];
  }[];
  curatedVerbatims: {
    quote: string;
    usageNote: string;
    theme: string;
  }[];
  strategicSummary: string;
};

export type AggregatedAnalytics = {
  projects: ProjectSummaryWithAnalytics[];
  strategicInsights: AggregatedStrategicInsight[];
  keyFindings: AggregatedKeyFinding[];
  consensusPoints: AggregatedConsensusPoint[];
  divergencePoints: AggregatedDivergencePoint[];
  strategicThemes: AggregatedCrossTemplateTheme[];
  templateStaleness: TemplateStaleness[];
  collectionStaleness: CollectionStaleness[];
  contextualRecommendations: AggregatedContextualRecommendation[];
  overallMetrics: {
    totalProjects: number;
    totalTemplates: number;
    totalCollections: number;
    totalSessions: number;
    completedSessions: number;
    avgQualityScore: number | null;
    avgSessionDuration: number | null;
    overallSentiment: { positive: number; neutral: number; negative: number } | null;
  };
  healthIndicators: {
    projectsWithStaleAnalytics: number;
    projectsWithNoAnalytics: number;
    templatesNeedingRefresh: number;
    collectionsNeedingRefresh: number;
  };
};
