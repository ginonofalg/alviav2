import type { ThemeSentiment, ThemeVerbatim, Recommendation } from "./collection-analytics";

export type TemplatePerformanceSummary = {
  templateId: string;
  templateName: string;
  collectionCount: number;
  totalSessions: number;
  avgQualityScore: number;
  topThemes: string[];
  sentimentDistribution: { positive: number; neutral: number; negative: number };
};

export type CrossTemplateTheme = {
  id: string;
  theme: string;
  description: string;
  templatesAppeared: string[];
  totalMentions: number;
  avgPrevalence: number;
  sentiment: ThemeSentiment;
  isStrategic: boolean;
  verbatims: ThemeVerbatim[];
};

export type ProjectAnalytics = {
  templatePerformance: TemplatePerformanceSummary[];
  crossTemplateThemes: CrossTemplateTheme[];
  strategicInsights: {
    insight: string;
    significance: string;
    supportingTemplates: string[];
    verbatims: ThemeVerbatim[];
  }[];
  executiveSummary: {
    headline: string;
    keyTakeaways: string[];
    recommendedActions: string[];
  };
  projectMetrics: {
    totalTemplates: number;
    totalCollections: number;
    totalSessions: number;
    avgQualityScore: number;
    avgSessionDuration: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  };
  recommendations: Recommendation[];
  contextualRecommendations?: {
    contextType: string;
    strategicContext: string;
    actionItems: {
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      relatedThemes: string[];
      suggestedContent?: string;
    }[];
    curatedVerbatims: {
      quote: string;
      usageNote: string;
      theme: string;
    }[];
    strategicSummary: string;
  };
  generatedAt: number;
};
