import { describe, it, expect } from "vitest";
import { aggregateGuidance } from "../guidance-aggregation";
import type { BarbaraGuidanceLogEntry, PersistedTranscriptEntry } from "@shared/schema";

function makeEntry(overrides: Partial<BarbaraGuidanceLogEntry> = {}): BarbaraGuidanceLogEntry {
  return {
    index: 0,
    action: "probe_followup",
    messageSummary: "Probe deeper into the challenges the respondent faces with team collaboration",
    confidence: 0.8,
    injected: true,
    timestamp: 1000,
    questionIndex: 0,
    triggerTurnIndex: 0,
    ...overrides,
  };
}

function makeTranscriptEntry(overrides: Partial<PersistedTranscriptEntry> = {}): PersistedTranscriptEntry {
  return {
    speaker: "alvia",
    text: "Can you tell me more about those challenges? Why do you think they affect your team collaboration?",
    timestamp: 1100,
    questionIndex: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<{
  id: string;
  collectionId: string;
  status: string;
  barbaraGuidanceLog: BarbaraGuidanceLogEntry[] | null;
  liveTranscript: PersistedTranscriptEntry[] | null;
}> = {}) {
  return {
    id: "sess-1",
    collectionId: "col-1",
    status: "completed",
    barbaraGuidanceLog: null,
    liveTranscript: null,
    ...overrides,
  };
}

const defaultScope = { level: "collection" as const, id: "col-1" };
const noWindow = {};

describe("guidance-aggregation", () => {
  describe("aggregates fully scored logs correctly", () => {
    it("computes overall and by-action metrics", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ index: 0, action: "probe_followup", adherence: "followed", adherenceReason: "ok" }),
        makeEntry({ index: 1, action: "suggest_next_question", adherence: "not_followed", adherenceReason: "no", timestamp: 2000 }),
        makeEntry({ index: 2, action: "probe_followup", adherence: "partially_followed", adherenceReason: "partial", timestamp: 3000 }),
      ];

      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: [makeTranscriptEntry()] });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.coverage.sessionsVisited).toBe(1);
      expect(result.coverage.sessionsWithGuidance).toBe(1);
      expect(result.coverage.sessionsWithScoredGuidance).toBe(1);
      expect(result.coverage.guidanceEventsInWindow).toBe(3);

      expect(result.alviaAdherence.followedCount).toBe(1);
      expect(result.alviaAdherence.partiallyFollowedCount).toBe(1);
      expect(result.alviaAdherence.notFollowedCount).toBe(1);
      expect(result.alviaAdherence.weightedAdherenceRate).toBeCloseTo(0.5);

      expect(result.barbara.totalEvents).toBe(3);
      expect(result.barbara.injectedCount).toBe(3);
      expect(result.barbara.injectionRate).toBe(1);
      expect(result.barbara.actionDistribution.probe_followup).toBe(2);
      expect(result.barbara.actionDistribution.suggest_next_question).toBe(1);

      expect(result.alviaAdherence.byAction.probe_followup.followed).toBe(1);
      expect(result.alviaAdherence.byAction.probe_followup.partiallyFollowed).toBe(1);
      expect(result.alviaAdherence.byAction.probe_followup.adherenceRate).toBeCloseTo(0.75);
    });
  });

  describe("re-scores entries missing adherence when transcript exists", () => {
    it("scores unscored injected entries using transcript", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ index: 0, action: "probe_followup", injected: true }),
      ];
      const transcript: PersistedTranscriptEntry[] = [
        makeTranscriptEntry({ speaker: "respondent", text: "I think it is great", timestamp: 900 }),
        makeTranscriptEntry({ speaker: "alvia", text: "Can you tell me more about those challenges? Why do you think they affect your team collaboration?", timestamp: 1100 }),
      ];
      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: transcript });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.coverage.sessionsWithScoredGuidance).toBe(1);
      expect(result.coverage.sessionsWithUnscoredGuidance).toBe(0);
      expect(result.alviaAdherence.followedCount).toBe(1);
    });
  });

  describe("keeps unscored coverage when transcript missing", () => {
    it("marks session as unscored when no transcript", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ index: 0, action: "probe_followup", injected: true }),
      ];
      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: null });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.coverage.sessionsWithUnscoredGuidance).toBe(1);
      expect(result.coverage.sessionsWithScoredGuidance).toBe(0);
      expect(result.coverage.guidanceEventsUnscored).toBe(1);
      expect(result.alviaAdherence.unscoredCount).toBe(1);
    });
  });

  describe("sessions without guidance logs counted as visited-only", () => {
    it("counts session in visited but not in guidance metrics", () => {
      const session = makeSession({ barbaraGuidanceLog: null, liveTranscript: [makeTranscriptEntry()] });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.coverage.sessionsVisited).toBe(1);
      expect(result.coverage.sessionsWithGuidance).toBe(0);
      expect(result.barbara.totalEvents).toBe(0);
      expect(result.topSessions.lowestAdherence).toHaveLength(0);
      expect(result.topSessions.highestAdherence).toHaveLength(0);
    });
  });

  describe("date window filtering", () => {
    it("filters events by from/to timestamps", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ index: 0, timestamp: 1000, adherence: "followed", adherenceReason: "ok" }),
        makeEntry({ index: 1, timestamp: 5000, adherence: "not_followed", adherenceReason: "no" }),
        makeEntry({ index: 2, timestamp: 9000, adherence: "followed", adherenceReason: "ok" }),
      ];
      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: [makeTranscriptEntry()] });

      const from = new Date(4000).toISOString();
      const to = new Date(6000).toISOString();
      const result = aggregateGuidance([session], defaultScope, { from, to }, 10);

      expect(result.coverage.guidanceEventsTotal).toBe(3);
      expect(result.coverage.guidanceEventsInWindow).toBe(1);
      expect(result.barbara.totalEvents).toBe(1);
      expect(result.alviaAdherence.notFollowedCount).toBe(1);
    });

    it("returns all events when no window specified", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ index: 0, timestamp: 1000, adherence: "followed", adherenceReason: "ok" }),
        makeEntry({ index: 1, timestamp: 5000, adherence: "followed", adherenceReason: "ok" }),
      ];
      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: [makeTranscriptEntry()] });
      const result = aggregateGuidance([session], defaultScope, {}, 10);

      expect(result.coverage.guidanceEventsInWindow).toBe(2);
    });
  });

  describe("topSessions ranking", () => {
    it("ranks sessions by adherence rate correctly", () => {
      const sessions = [
        makeSession({
          id: "low",
          barbaraGuidanceLog: [
            makeEntry({ adherence: "not_followed", adherenceReason: "no" }),
            makeEntry({ adherence: "not_followed", adherenceReason: "no", timestamp: 2000 }),
          ],
          liveTranscript: [makeTranscriptEntry()],
        }),
        makeSession({
          id: "high",
          barbaraGuidanceLog: [
            makeEntry({ adherence: "followed", adherenceReason: "ok" }),
            makeEntry({ adherence: "followed", adherenceReason: "ok", timestamp: 2000 }),
          ],
          liveTranscript: [makeTranscriptEntry()],
        }),
        makeSession({
          id: "mid",
          barbaraGuidanceLog: [
            makeEntry({ adherence: "followed", adherenceReason: "ok" }),
            makeEntry({ adherence: "not_followed", adherenceReason: "no", timestamp: 2000 }),
          ],
          liveTranscript: [makeTranscriptEntry()],
        }),
      ];

      const result = aggregateGuidance(sessions, defaultScope, noWindow, 10);

      expect(result.topSessions.lowestAdherence[0].sessionId).toBe("low");
      expect(result.topSessions.lowestAdherence[0].adherenceRate).toBe(0);
      expect(result.topSessions.highestAdherence[0].sessionId).toBe("high");
      expect(result.topSessions.highestAdherence[0].adherenceRate).toBe(1);
    });

    it("respects topN cap", () => {
      const sessions = Array.from({ length: 5 }, (_, i) =>
        makeSession({
          id: `sess-${i}`,
          barbaraGuidanceLog: [
            makeEntry({ adherence: "followed", adherenceReason: "ok", confidence: 0.5 + i * 0.1 }),
          ],
          liveTranscript: [makeTranscriptEntry()],
        }),
      );

      const result = aggregateGuidance(sessions, defaultScope, noWindow, 2);
      expect(result.topSessions.lowestAdherence.length).toBeLessThanOrEqual(2);
      expect(result.topSessions.highestAdherence.length).toBeLessThanOrEqual(2);
    });
  });

  describe("zero-data scopes", () => {
    it("handles empty session list without errors", () => {
      const result = aggregateGuidance([], defaultScope, noWindow, 10);

      expect(result.coverage.sessionsVisited).toBe(0);
      expect(result.coverage.sessionsWithGuidance).toBe(0);
      expect(result.barbara.totalEvents).toBe(0);
      expect(result.barbara.injectionRate).toBe(0);
      expect(result.barbara.confidenceAvg).toBe(0);
      expect(result.alviaAdherence.weightedAdherenceRate).toBe(0);
      expect(result.topSessions.lowestAdherence).toHaveLength(0);
      expect(result.topSessions.highestAdherence).toHaveLength(0);
    });

    it("handles sessions with empty guidance log array", () => {
      const session = makeSession({ barbaraGuidanceLog: [] });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.coverage.sessionsVisited).toBe(1);
      expect(result.coverage.sessionsWithGuidance).toBe(0);
    });
  });

  describe("confidence metrics", () => {
    it("computes avg/min/max correctly", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ confidence: 0.3, adherence: "followed", adherenceReason: "ok" }),
        makeEntry({ confidence: 0.7, adherence: "followed", adherenceReason: "ok", timestamp: 2000 }),
        makeEntry({ confidence: 0.5, adherence: "followed", adherenceReason: "ok", timestamp: 3000 }),
      ];
      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: [makeTranscriptEntry()] });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.barbara.confidenceAvg).toBeCloseTo(0.5);
      expect(result.barbara.confidenceMin).toBe(0.3);
      expect(result.barbara.confidenceMax).toBe(0.7);
    });
  });

  describe("not_applicable and non-injected entries", () => {
    it("tracks not_applicable count correctly", () => {
      const log: BarbaraGuidanceLogEntry[] = [
        makeEntry({ action: "none", injected: false, adherence: "not_applicable", adherenceReason: "noop" }),
        makeEntry({ action: "probe_followup", injected: true, adherence: "followed", adherenceReason: "ok", timestamp: 2000 }),
      ];
      const session = makeSession({ barbaraGuidanceLog: log, liveTranscript: [makeTranscriptEntry()] });
      const result = aggregateGuidance([session], defaultScope, noWindow, 10);

      expect(result.alviaAdherence.notApplicableCount).toBe(1);
      expect(result.alviaAdherence.followedCount).toBe(1);
      expect(result.barbara.injectedCount).toBe(1);
      expect(result.barbara.injectionRate).toBe(0.5);
    });
  });
});
