import { randomUUID } from "crypto";
import { log } from "../logger";

export type AnalyticsJobPhase =
  | "pending"
  | "refreshing_collections"
  | "refreshing_templates"
  | "refreshing_project"
  | "refreshing_template"
  | "complete"
  | "failed"
  | "interrupted";

export interface AnalyticsJobStep {
  name: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
}

export interface AnalyticsJob {
  id: string;
  level: "project" | "template";
  entityId: string;
  entityName: string;
  sessionScope: string;
  userId: string;
  phase: AnalyticsJobPhase;
  steps: AnalyticsJobStep[];
  currentStepIndex: number;
  collectionsRefreshed: number;
  templatesRefreshed: number;
  projectRefreshed: boolean;
  templateRefreshed: boolean;
  errors: Array<{ level: string; id: string; name: string; error: string }>;
  result?: unknown;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, AnalyticsJob>();

const MAX_JOBS = 100;
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const isTerminal = job.phase === "complete" || job.phase === "failed" || job.phase === "interrupted";
    if (isTerminal && now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
  if (jobs.size > MAX_JOBS) {
    const terminal = [...jobs.entries()]
      .filter(([, j]) => j.phase === "complete" || j.phase === "failed" || j.phase === "interrupted")
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const toRemove = terminal.slice(0, Math.max(0, jobs.size - MAX_JOBS));
    for (const [id] of toRemove) {
      jobs.delete(id);
    }
  }
}

export function createAnalyticsJob(params: {
  level: "project" | "template";
  entityId: string;
  entityName: string;
  sessionScope: string;
  userId: string;
  steps: string[];
}): AnalyticsJob {
  pruneOldJobs();

  const now = Date.now();
  const job: AnalyticsJob = {
    id: randomUUID(),
    level: params.level,
    entityId: params.entityId,
    entityName: params.entityName,
    sessionScope: params.sessionScope,
    userId: params.userId,
    phase: "pending",
    steps: params.steps.map((name) => ({ name, status: "pending" })),
    currentStepIndex: -1,
    collectionsRefreshed: 0,
    templatesRefreshed: 0,
    projectRefreshed: false,
    templateRefreshed: false,
    errors: [],
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function getAnalyticsJob(id: string): AnalyticsJob | undefined {
  return jobs.get(id);
}

export function getActiveJobForEntity(entityId: string, level: string, userId: string, sessionScope: string): AnalyticsJob | undefined {
  for (const job of jobs.values()) {
    if (
      job.entityId === entityId &&
      job.level === level &&
      job.userId === userId &&
      job.sessionScope === sessionScope &&
      job.phase !== "complete" && job.phase !== "failed" && job.phase !== "interrupted"
    ) {
      return job;
    }
  }
  return undefined;
}

export function updateJobPhase(id: string, phase: AnalyticsJobPhase) {
  const job = jobs.get(id);
  if (!job) return;
  job.phase = phase;
  job.updatedAt = Date.now();
}

export function advanceJobStep(id: string, stepIndex: number, status: "running" | "done" | "error", error?: string) {
  const job = jobs.get(id);
  if (!job) return;
  if (stepIndex >= 0 && stepIndex < job.steps.length) {
    job.steps[stepIndex].status = status;
    if (error) job.steps[stepIndex].error = error;
  }
  job.currentStepIndex = stepIndex;
  job.updatedAt = Date.now();
}

export function addJobError(id: string, error: { level: string; id: string; name: string; error: string }) {
  const job = jobs.get(id);
  if (!job) return;
  job.errors.push(error);
  job.updatedAt = Date.now();
}

export function incrementJobCounter(id: string, counter: "collectionsRefreshed" | "templatesRefreshed") {
  const job = jobs.get(id);
  if (!job) return;
  (job[counter] as number)++;
  job.updatedAt = Date.now();
}

export function setJobFlag(id: string, flag: "projectRefreshed" | "templateRefreshed", value: boolean) {
  const job = jobs.get(id);
  if (!job) return;
  job[flag] = value;
  job.updatedAt = Date.now();
}

export function setJobResult(id: string, result: unknown) {
  const job = jobs.get(id);
  if (!job) return;
  job.result = result;
  job.updatedAt = Date.now();
}

export function markInterruptedJobs() {
  for (const job of jobs.values()) {
    if (job.phase !== "complete" && job.phase !== "failed" && job.phase !== "interrupted") {
      job.phase = "interrupted";
      job.updatedAt = Date.now();
      log.info(`[Analytics Jobs] Marked job ${job.id} as interrupted (was ${job.phase})`);
    }
  }
}

export function deleteJob(id: string) {
  jobs.delete(id);
}
