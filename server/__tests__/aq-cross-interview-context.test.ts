import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage", () => ({
  storage: {
    getProject: vi.fn(),
    getSessionsByCollection: vi.fn(),
  },
}));

import { storage } from "../storage";
import {
  buildAQCrossInterviewContext,
  MAX_PRIOR_SESSIONS_FOR_AQ,
} from "../voice-interview/context-builders";

const mockGetProject = vi.mocked(storage.getProject);
const mockGetSessions = vi.mocked(storage.getSessionsByCollection);

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? `session-${Math.random().toString(36).slice(2, 8)}`,
    status: overrides.status ?? "completed",
    questionSummaries: overrides.questionSummaries ?? [{ keyInsights: ["insight"] }],
    collectionId: "col-1",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    crossInterviewContext: true,
    crossInterviewThreshold: 2,
    ...overrides,
  };
}

describe("buildAQCrossInterviewContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled when projectId is null", async () => {
    const result = await buildAQCrossInterviewContext(null, "col-1", "sess-1");
    expect(result).toEqual({ enabled: false, reason: "no_project_id" });
    expect(mockGetProject).not.toHaveBeenCalled();
  });

  it("returns disabled when projectId is undefined", async () => {
    const result = await buildAQCrossInterviewContext(undefined, "col-1", "sess-1");
    expect(result).toEqual({ enabled: false, reason: "no_project_id" });
  });

  it("returns disabled when project is not found", async () => {
    mockGetProject.mockResolvedValue(undefined);
    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "sess-1");
    expect(result).toEqual({ enabled: false, reason: "project_not_found" });
  });

  it("returns disabled when crossInterviewContext flag is false", async () => {
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewContext: false }) as any);
    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "sess-1");
    expect(result).toEqual({ enabled: false, reason: "feature_disabled_on_project" });
  });

  it("returns disabled when completed sessions are below threshold", async () => {
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewThreshold: 5 }) as any);
    mockGetSessions.mockResolvedValue([
      makeSession({ id: "s1" }),
      makeSession({ id: "s2" }),
    ] as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(false);
    expect(result.reason).toContain("threshold_unmet");
  });

  it("excludes the current session from eligible sessions", async () => {
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewThreshold: 2 }) as any);
    mockGetSessions.mockResolvedValue([
      makeSession({ id: "current-sess" }),
      makeSession({ id: "s1" }),
      makeSession({ id: "s2" }),
    ] as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(true);
    expect(result.priorSessionSummaries).toHaveLength(2);
    expect(result.priorSessionSummaries!.every((s) => s.sessionId !== "current-sess")).toBe(true);
  });

  it("excludes sessions that are not completed", async () => {
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewThreshold: 1 }) as any);
    mockGetSessions.mockResolvedValue([
      makeSession({ id: "s1", status: "in_progress" }),
      makeSession({ id: "s2", status: "abandoned" }),
      makeSession({ id: "s3", status: "completed" }),
    ] as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(true);
    expect(result.priorSessionSummaries).toHaveLength(1);
    expect(result.priorSessionSummaries![0].sessionId).toBe("s3");
  });

  it("excludes sessions with empty or null questionSummaries", async () => {
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewThreshold: 1 }) as any);
    mockGetSessions.mockResolvedValue([
      makeSession({ id: "s1", questionSummaries: null }),
      makeSession({ id: "s2", questionSummaries: [] }),
      makeSession({ id: "s3", questionSummaries: [{ keyInsights: ["good"] }] }),
    ] as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(true);
    expect(result.priorSessionSummaries).toHaveLength(1);
    expect(result.priorSessionSummaries![0].sessionId).toBe("s3");
  });

  it("returns enabled with correct priorSessionSummaries when above threshold", async () => {
    const summaries = [{ keyInsights: ["insight-a"] }, { keyInsights: ["insight-b"] }];
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewThreshold: 2 }) as any);
    mockGetSessions.mockResolvedValue([
      makeSession({ id: "s1", questionSummaries: summaries }),
      makeSession({ id: "s2", questionSummaries: summaries }),
      makeSession({ id: "s3", questionSummaries: summaries }),
    ] as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(true);
    expect(result.priorSessionSummaries).toHaveLength(3);
    expect(result.priorSessionSummaries![0]).toEqual({
      sessionId: "s1",
      summaries,
    });
  });

  it("caps at MAX_PRIOR_SESSIONS_FOR_AQ when more sessions exist", async () => {
    mockGetProject.mockResolvedValue(makeProject({ crossInterviewThreshold: 1 }) as any);
    const manySessions = Array.from({ length: 15 }, (_, i) =>
      makeSession({ id: `s${i}` }),
    );
    mockGetSessions.mockResolvedValue(manySessions as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(true);
    expect(result.priorSessionSummaries).toHaveLength(MAX_PRIOR_SESSIONS_FOR_AQ);
  });

  it("uses default threshold of 5 when crossInterviewThreshold is not set", async () => {
    mockGetProject.mockResolvedValue(
      makeProject({ crossInterviewThreshold: null }) as any,
    );
    const sessions = Array.from({ length: 4 }, (_, i) =>
      makeSession({ id: `s${i}` }),
    );
    mockGetSessions.mockResolvedValue(sessions as any);

    const result = await buildAQCrossInterviewContext("proj-1", "col-1", "current-sess");
    expect(result.enabled).toBe(false);
    expect(result.reason).toContain("threshold_unmet");
    expect(result.reason).toContain("4/5");
  });
});
