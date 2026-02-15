import type { QualityFlag } from "@shared/schema";
import type { QuestionSummary } from "../barbara-orchestrator";
import { storage } from "../storage";
import type {
  CompactCrossInterviewTheme,
  CompactFlagCount,
  CompactQuestionQualityInsight,
  CrossInterviewRuntimeContext,
  CompactAnalyticsHypothesis,
  AnalyticsHypothesesRuntimeContext,
} from "./types";
import {
  MAX_THEMES_PER_QUESTION,
  MAX_EMERGENT_THEMES,
  MAX_CUE_LENGTH,
  QUALITY_ALERT_THRESHOLD,
  MIN_RESPONSE_COUNT_FOR_ALERT,
  MIN_FLAG_COUNT_FOR_ALERT,
  MAX_TOP_FLAGS_PER_QUESTION,
  MAX_ANALYTICS_HYPOTHESES,
  MAX_HYPOTHESIS_LENGTH,
  MAX_RELATED_THEMES_PER_HYPOTHESIS,
} from "./types";

export const MAX_PRIOR_SESSIONS_FOR_AQ = 10;

export type AQCrossInterviewContext = {
  enabled: boolean;
  reason?: string;
  priorSessionSummaries?: Array<{
    sessionId: string;
    summaries: QuestionSummary[];
  }>;
};

export async function buildAQCrossInterviewContext(
  projectId: string | null | undefined,
  collectionId: string,
  currentSessionId: string,
): Promise<AQCrossInterviewContext> {
  if (!projectId) {
    return { enabled: false, reason: "no_project_id" };
  }

  const project = await storage.getProject(projectId);
  if (!project) {
    return { enabled: false, reason: "project_not_found" };
  }

  if (!project.crossInterviewContext) {
    return { enabled: false, reason: "feature_disabled_on_project" };
  }

  const threshold = project.crossInterviewThreshold ?? 5;

  const sessions = await storage.getSessionsByCollection(collectionId);

  const eligibleSessions = sessions.filter((s) => {
    if (s.id === currentSessionId) return false;
    if (s.status !== "completed") return false;
    const summaries = s.questionSummaries as QuestionSummary[] | null;
    return Array.isArray(summaries) && summaries.length > 0;
  });

  if (eligibleSessions.length < threshold) {
    return {
      enabled: false,
      reason: `threshold_unmet (${eligibleSessions.length}/${threshold} completed sessions with summaries)`,
    };
  }

  const capped = eligibleSessions.slice(0, MAX_PRIOR_SESSIONS_FOR_AQ);

  const priorSessionSummaries = capped.map((s) => ({
    sessionId: s.id,
    summaries: s.questionSummaries as QuestionSummary[],
  }));

  console.log(
    `[AQ-CrossInterview] Enabled: ${priorSessionSummaries.length} prior sessions for collection ${collectionId}`,
  );

  return {
    enabled: true,
    priorSessionSummaries,
  };
}

export function buildAnalyticsHypothesesRuntimeContext(
  project: any,
  templateQuestions: Array<{ text: string; guidance?: string | null }>,
): AnalyticsHypothesesRuntimeContext {
  if (!project?.analyticsGuidedHypotheses) {
    return { enabled: false, reason: "feature_disabled_on_project" };
  }

  const analyticsData = project.analyticsData as any;
  if (!analyticsData) {
    return { enabled: false, reason: "no_project_analytics" };
  }

  const totalSessions = analyticsData.projectMetrics?.totalSessions ?? 0;
  const threshold = project.analyticsHypothesesMinSessions ?? 5;

  if (totalSessions < threshold) {
    return {
      enabled: false,
      reason: `threshold_unmet (${totalSessions}/${threshold} sessions)`,
    };
  }

  const truncateHypothesis = (title: string, description: string): string => {
    const combined = `${title}: ${description}`;
    return combined.length <= MAX_HYPOTHESIS_LENGTH
      ? combined
      : combined.slice(0, MAX_HYPOTHESIS_LENGTH - 1) + "\u2026";
  };

  const hypotheses: CompactAnalyticsHypothesis[] = [];

  const recommendations = Array.isArray(analyticsData.recommendations)
    ? (analyticsData.recommendations as Array<{
        type: string;
        title: string;
        description: string;
        relatedQuestions?: number[];
        relatedThemes?: string[];
        priority: "high" | "medium" | "low";
      }>)
    : [];

  const allowedRecTypes = new Set([
    "explore_deeper",
    "coverage_gap",
    "needs_probing",
  ]);
  for (const rec of recommendations) {
    if (!allowedRecTypes.has(rec.type)) continue;
    if (hypotheses.length >= MAX_ANALYTICS_HYPOTHESES) break;

    const hasQuestionMapping =
      Array.isArray(rec.relatedQuestions) && rec.relatedQuestions.length > 0;
    const hasThemeOverlap =
      Array.isArray(rec.relatedThemes) && rec.relatedThemes.length > 0;

    if (!hasQuestionMapping && !hasThemeOverlap) continue;

    hypotheses.push({
      hypothesis: truncateHypothesis(rec.title, rec.description),
      source: "recommendation",
      priority: rec.priority,
      relatedQuestionIndices: rec.relatedQuestions ?? [],
      relatedThemes: (rec.relatedThemes ?? []).slice(
        0,
        MAX_RELATED_THEMES_PER_HYPOTHESIS,
      ),
    });
  }

  if (
    hypotheses.length < MAX_ANALYTICS_HYPOTHESES &&
    analyticsData.contextualRecommendations?.actionItems
  ) {
    const actionItems = analyticsData.contextualRecommendations
      .actionItems as Array<{
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      relatedThemes?: string[];
    }>;

    for (const item of actionItems) {
      if (hypotheses.length >= MAX_ANALYTICS_HYPOTHESES) break;
      hypotheses.push({
        hypothesis: truncateHypothesis(item.title, item.description),
        source: "action_item",
        priority: item.priority,
        relatedQuestionIndices: [],
        relatedThemes: (item.relatedThemes ?? []).slice(
          0,
          MAX_RELATED_THEMES_PER_HYPOTHESIS,
        ),
      });
    }
  }

  if (
    hypotheses.length < MAX_ANALYTICS_HYPOTHESES &&
    Array.isArray(analyticsData.strategicInsights)
  ) {
    const strategicInsights = analyticsData.strategicInsights as Array<{
      insight: string;
      significance: string;
      supportingTemplates: string[];
    }>;

    for (const si of strategicInsights) {
      if (hypotheses.length >= MAX_ANALYTICS_HYPOTHESES) break;
      hypotheses.push({
        hypothesis: truncateHypothesis(si.insight, si.significance),
        source: "strategic_insight",
        priority: "medium",
        relatedQuestionIndices: [],
        relatedThemes: [],
      });
    }
  }

  if (hypotheses.length === 0) {
    return { enabled: false, reason: "no_mappable_hypotheses" };
  }

  hypotheses.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return {
    enabled: true,
    analyticsGeneratedAt: analyticsData.generatedAt ?? null,
    totalProjectSessions: totalSessions,
    hypotheses,
  };
}

export function buildCrossInterviewRuntimeContext(
  project: any,
  collection: any,
): CrossInterviewRuntimeContext {
  if (!project?.crossInterviewContext) {
    return { enabled: false, reason: "feature_disabled_on_project" };
  }

  const threshold = project.crossInterviewThreshold ?? 5;
  const analyzedCount = collection?.analyzedSessionCount ?? 0;

  if (analyzedCount < threshold) {
    return {
      enabled: false,
      reason: `threshold_unmet (${analyzedCount}/${threshold} sessions analyzed)`,
    };
  }

  const analyticsData = collection?.analyticsData as any;

  const hasThemes =
    Array.isArray(analyticsData?.themes) && analyticsData.themes.length > 0;
  const hasQuestionPerformance =
    Array.isArray(analyticsData?.questionPerformance) &&
    analyticsData.questionPerformance.length > 0;

  if (!hasThemes && !hasQuestionPerformance) {
    return { enabled: false, reason: "no_actionable_cross_interview_context" };
  }

  const truncateCue = (text: string): string =>
    text.length <= MAX_CUE_LENGTH
      ? text
      : text.slice(0, MAX_CUE_LENGTH - 1) + "\u2026";

  let themesByQuestion:
    | Record<number, CompactCrossInterviewTheme[]>
    | undefined;
  let emergentThemes: CompactCrossInterviewTheme[] | undefined;

  if (hasThemes) {
    const themes = analyticsData.themes as Array<{
      theme: string;
      description: string;
      prevalence: number;
      relatedQuestions: number[];
      isEmergent?: boolean;
    }>;

    const toCompact = (
      t: (typeof themes)[number],
    ): CompactCrossInterviewTheme => ({
      theme: t.theme,
      prevalence: t.prevalence,
      cue: truncateCue(t.description),
    });

    themesByQuestion = {};
    for (const t of themes) {
      if (t.isEmergent) continue;
      if (!Array.isArray(t.relatedQuestions)) continue;
      for (const qIdx of t.relatedQuestions) {
        if (!themesByQuestion[qIdx]) themesByQuestion[qIdx] = [];
        if (themesByQuestion[qIdx].length < MAX_THEMES_PER_QUESTION) {
          themesByQuestion[qIdx].push(toCompact(t));
        }
      }
    }

    emergentThemes = themes
      .filter((t) => t.isEmergent)
      .sort((a, b) => b.prevalence - a.prevalence)
      .slice(0, MAX_EMERGENT_THEMES)
      .map(toCompact);
  }

  let qualityInsightsByQuestion:
    | Record<number, CompactQuestionQualityInsight>
    | undefined;

  if (hasQuestionPerformance) {
    const qpEntries = analyticsData.questionPerformance as Array<{
      questionIndex: number;
      avgWordCount: number;
      avgQualityScore: number;
      responseCount: number;
      qualityFlagCounts: Record<string, number>;
      perspectiveRange: "narrow" | "moderate" | "diverse";
      responseRichness: "brief" | "moderate" | "detailed";
    }>;

    qualityInsightsByQuestion = {};

    for (const qp of qpEntries) {
      if (typeof qp.questionIndex !== "number" || qp.questionIndex < 0)
        continue;
      if ((qp.responseCount ?? 0) < MIN_RESPONSE_COUNT_FOR_ALERT) continue;

      const hasLowQuality =
        qp.avgQualityScore > 0 && qp.avgQualityScore < QUALITY_ALERT_THRESHOLD;
      const hasBriefResponses = qp.responseRichness === "brief";
      const hasNarrowPerspective = qp.perspectiveRange === "narrow";

      const flagCounts: CompactFlagCount[] = [];
      if (qp.qualityFlagCounts && typeof qp.qualityFlagCounts === "object") {
        for (const [flag, count] of Object.entries(qp.qualityFlagCounts)) {
          if (typeof count === "number" && count >= MIN_FLAG_COUNT_FOR_ALERT) {
            flagCounts.push({ flag: flag as QualityFlag, count });
          }
        }
      }
      flagCounts.sort(
        (a, b) => b.count - a.count || a.flag.localeCompare(b.flag),
      );
      const topFlags = flagCounts.slice(0, MAX_TOP_FLAGS_PER_QUESTION);

      const hasRecurringFlags = topFlags.length > 0;

      if (
        !hasLowQuality &&
        !hasBriefResponses &&
        !hasRecurringFlags &&
        !hasNarrowPerspective
      )
        continue;

      const insight: CompactQuestionQualityInsight = {
        questionIndex: qp.questionIndex,
        responseCount: qp.responseCount,
        avgQualityScore: qp.avgQualityScore,
        responseRichness: qp.responseRichness,
        avgWordCount: qp.avgWordCount,
        topFlags,
        perspectiveRange: qp.perspectiveRange,
      };

      qualityInsightsByQuestion[qp.questionIndex] = insight;
    }

    if (Object.keys(qualityInsightsByQuestion).length === 0) {
      qualityInsightsByQuestion = undefined;
    }
  }

  const hasActionableThemes =
    (themesByQuestion && Object.keys(themesByQuestion).length > 0) ||
    (emergentThemes && emergentThemes.length > 0);
  const hasActionableQuality = qualityInsightsByQuestion !== undefined;

  if (!hasActionableThemes && !hasActionableQuality) {
    return { enabled: false, reason: "no_actionable_cross_interview_context" };
  }

  const snapshotGeneratedAt = analyticsData.generatedAt
    ? new Date(analyticsData.generatedAt).getTime()
    : collection.lastAnalyzedAt
      ? new Date(collection.lastAnalyzedAt).getTime()
      : null;

  return {
    enabled: true,
    source: "collection_analytics_snapshot",
    priorSessionCount: analyzedCount,
    snapshotGeneratedAt,
    themesByQuestion,
    emergentThemes,
    qualityInsightsByQuestion,
  };
}
