import type { BarbaraGuidanceAction, GuidanceAdherenceResult } from "./interview-state";

export type GuidanceAggregationScope = "collection" | "template" | "project";

export type GuidanceAggregationScopeInfo = {
  level: GuidanceAggregationScope;
  id: string;
};

export type GuidanceAggregationWindow = {
  from?: string;
  to?: string;
};

export type GuidanceAggregationCoverage = {
  sessionsVisited: number;
  sessionsWithGuidance: number;
  sessionsWithScoredGuidance: number;
  sessionsWithUnscoredGuidance: number;
  guidanceEventsTotal: number;
  guidanceEventsInWindow: number;
  guidanceEventsScored: number;
  guidanceEventsUnscored: number;
};

export type BarbaraMetrics = {
  totalEvents: number;
  injectedCount: number;
  injectionRate: number;
  confidenceAvg: number;
  confidenceMin: number;
  confidenceMax: number;
  actionDistribution: Record<BarbaraGuidanceAction, number>;
};

export type AlviaAdherenceMetrics = {
  followedCount: number;
  partiallyFollowedCount: number;
  notFollowedCount: number;
  notApplicableCount: number;
  unscoredCount: number;
  weightedAdherenceRate: number;
  byAction: Record<BarbaraGuidanceAction, {
    total: number;
    injected: number;
    followed: number;
    partiallyFollowed: number;
    notFollowed: number;
    adherenceRate: number;
  }>;
};

export type SessionDiagnosticRow = {
  sessionId: string;
  collectionId: string;
  status: string;
  scoredEvents: number;
  totalEvents: number;
  adherenceRate: number;
  notFollowedCount: number;
  injectedCount: number;
  firstGuidanceAt: number | null;
  lastGuidanceAt: number | null;
};

export type GuidanceAggregationResponse = {
  scope: GuidanceAggregationScopeInfo;
  window: GuidanceAggregationWindow;
  coverage: GuidanceAggregationCoverage;
  barbara: BarbaraMetrics;
  alviaAdherence: AlviaAdherenceMetrics;
  topSessions: {
    lowestAdherence: SessionDiagnosticRow[];
    highestAdherence: SessionDiagnosticRow[];
  };
};
