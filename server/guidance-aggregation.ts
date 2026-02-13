import type {
  BarbaraGuidanceLogEntry,
  BarbaraGuidanceAction,
  GuidanceAdherenceResult,
  PersistedTranscriptEntry,
} from "@shared/schema";
import type {
  GuidanceAggregationResponse,
  GuidanceAggregationScopeInfo,
  GuidanceAggregationWindow,
  GuidanceAggregationCoverage,
  BarbaraMetrics,
  AlviaAdherenceMetrics,
  SessionDiagnosticRow,
} from "@shared/types";
import { scoreGuidanceAdherence } from "./guidance-adherence";

const ALL_ACTIONS: BarbaraGuidanceAction[] = [
  "probe_followup", "suggest_next_question", "acknowledge_prior",
  "confirm_understanding", "suggest_environment_check", "time_reminder", "none",
];

type SessionData = {
  id: string;
  collectionId: string;
  status: string;
  barbaraGuidanceLog: unknown;
  liveTranscript: unknown;
};

type WindowParams = {
  from?: number;
  to?: number;
};

function parseGuidanceLog(raw: unknown): BarbaraGuidanceLogEntry[] | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  return raw as BarbaraGuidanceLogEntry[];
}

function parseTranscript(raw: unknown): PersistedTranscriptEntry[] | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  return raw as PersistedTranscriptEntry[];
}

function filterByWindow(
  entries: BarbaraGuidanceLogEntry[],
  window: WindowParams,
): BarbaraGuidanceLogEntry[] {
  return entries.filter((e) => {
    if (window.from !== undefined && e.timestamp < window.from) return false;
    if (window.to !== undefined && e.timestamp > window.to) return false;
    return true;
  });
}

function ensureScored(
  log: BarbaraGuidanceLogEntry[],
  transcript: PersistedTranscriptEntry[] | null,
): { scored: BarbaraGuidanceLogEntry[]; hadUnscored: boolean } {
  const needsScoring = log.some((e) => e.injected && e.action !== "none" && !e.adherence);
  if (!needsScoring) return { scored: log, hadUnscored: false };
  if (!transcript) return { scored: log, hadUnscored: true };
  return { scored: scoreGuidanceAdherence(log, transcript), hadUnscored: false };
}

function isScorableResult(r?: GuidanceAdherenceResult): boolean {
  return r !== undefined && r !== "not_applicable" && r !== "unscored";
}

function buildSessionDiagnostic(
  session: SessionData,
  entries: BarbaraGuidanceLogEntry[],
): SessionDiagnosticRow {
  const scored = entries.filter((e) => isScorableResult(e.adherence));
  const followed = entries.filter((e) => e.adherence === "followed").length;
  const partial = entries.filter((e) => e.adherence === "partially_followed").length;
  const notFollowed = entries.filter((e) => e.adherence === "not_followed").length;
  const injected = entries.filter((e) => e.injected).length;
  const timestamps = entries.map((e) => e.timestamp).filter(Boolean);

  const adherenceRate = scored.length > 0
    ? (followed + partial * 0.5) / scored.length
    : 0;

  return {
    sessionId: session.id,
    collectionId: session.collectionId,
    status: session.status,
    scoredEvents: scored.length,
    totalEvents: entries.length,
    adherenceRate,
    notFollowedCount: notFollowed,
    injectedCount: injected,
    firstGuidanceAt: timestamps.length > 0 ? Math.min(...timestamps) : null,
    lastGuidanceAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

function emptyActionDistribution(): Record<BarbaraGuidanceAction, number> {
  const dist = {} as Record<BarbaraGuidanceAction, number>;
  for (const a of ALL_ACTIONS) dist[a] = 0;
  return dist;
}

function emptyByAction(): AlviaAdherenceMetrics["byAction"] {
  const result = {} as AlviaAdherenceMetrics["byAction"];
  for (const a of ALL_ACTIONS) {
    result[a] = { total: 0, injected: 0, followed: 0, partiallyFollowed: 0, notFollowed: 0, adherenceRate: 0 };
  }
  return result;
}

export function aggregateGuidance(
  sessions: SessionData[],
  scope: GuidanceAggregationScopeInfo,
  window: GuidanceAggregationWindow,
  topN: number,
): GuidanceAggregationResponse {
  const windowParams: WindowParams = {
    from: window.from ? new Date(window.from).getTime() : undefined,
    to: window.to ? new Date(window.to).getTime() : undefined,
  };

  const coverage: GuidanceAggregationCoverage = {
    sessionsVisited: sessions.length,
    sessionsWithGuidance: 0,
    sessionsWithScoredGuidance: 0,
    sessionsWithUnscoredGuidance: 0,
    guidanceEventsTotal: 0,
    guidanceEventsInWindow: 0,
    guidanceEventsScored: 0,
    guidanceEventsUnscored: 0,
  };

  const allConfidences: number[] = [];
  const actionDist = emptyActionDistribution();
  let totalInjected = 0;
  let totalInWindow = 0;

  let followedTotal = 0;
  let partialTotal = 0;
  let notFollowedTotal = 0;
  let notApplicableTotal = 0;
  let unscoredTotal = 0;
  const byAction = emptyByAction();

  const diagnostics: SessionDiagnosticRow[] = [];

  for (const session of sessions) {
    const log = parseGuidanceLog(session.barbaraGuidanceLog);
    if (!log) continue;

    coverage.sessionsWithGuidance++;
    coverage.guidanceEventsTotal += log.length;

    const transcript = parseTranscript(session.liveTranscript);
    const { scored, hadUnscored } = ensureScored(log, transcript);

    if (hadUnscored) {
      coverage.sessionsWithUnscoredGuidance++;
    } else {
      coverage.sessionsWithScoredGuidance++;
    }

    const inWindow = filterByWindow(scored, windowParams);
    totalInWindow += inWindow.length;
    coverage.guidanceEventsInWindow += inWindow.length;

    for (const entry of inWindow) {
      actionDist[entry.action] = (actionDist[entry.action] || 0) + 1;
      allConfidences.push(entry.confidence);
      if (entry.injected) totalInjected++;

      const action = entry.action;
      byAction[action].total++;
      if (entry.injected) byAction[action].injected++;

      if (isScorableResult(entry.adherence)) {
        coverage.guidanceEventsScored++;
        if (entry.adherence === "followed") {
          followedTotal++;
          byAction[action].followed++;
        } else if (entry.adherence === "partially_followed") {
          partialTotal++;
          byAction[action].partiallyFollowed++;
        } else if (entry.adherence === "not_followed") {
          notFollowedTotal++;
          byAction[action].notFollowed++;
        }
      } else if (entry.adherence === "not_applicable") {
        notApplicableTotal++;
      } else {
        unscoredTotal++;
        coverage.guidanceEventsUnscored++;
      }
    }

    diagnostics.push(buildSessionDiagnostic(session, inWindow));
  }

  for (const action of ALL_ACTIONS) {
    const a = byAction[action];
    const scorable = a.followed + a.partiallyFollowed + a.notFollowed;
    a.adherenceRate = scorable > 0
      ? (a.followed + a.partiallyFollowed * 0.5) / scorable
      : 0;
  }

  const scorableTotal = followedTotal + partialTotal + notFollowedTotal;
  const weightedAdherenceRate = scorableTotal > 0
    ? (followedTotal + partialTotal * 0.5) / scorableTotal
    : 0;

  const confidenceAvg = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;
  const confidenceMin = allConfidences.length > 0 ? Math.min(...allConfidences) : 0;
  const confidenceMax = allConfidences.length > 0 ? Math.max(...allConfidences) : 0;

  const scored = diagnostics.filter((d) => d.scoredEvents > 0);
  scored.sort((a, b) => a.adherenceRate - b.adherenceRate);
  const lowestAdherence = scored.slice(0, topN);
  const highestAdherence = scored.slice(-topN).reverse();

  const barbara: BarbaraMetrics = {
    totalEvents: totalInWindow,
    injectedCount: totalInjected,
    injectionRate: totalInWindow > 0 ? totalInjected / totalInWindow : 0,
    confidenceAvg,
    confidenceMin,
    confidenceMax,
    actionDistribution: actionDist,
  };

  const alviaAdherence: AlviaAdherenceMetrics = {
    followedCount: followedTotal,
    partiallyFollowedCount: partialTotal,
    notFollowedCount: notFollowedTotal,
    notApplicableCount: notApplicableTotal,
    unscoredCount: unscoredTotal,
    weightedAdherenceRate,
    byAction,
  };

  return {
    scope,
    window,
    coverage,
    barbara,
    alviaAdherence,
    topSessions: { lowestAdherence, highestAdherence },
  };
}
