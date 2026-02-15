import {
  personas, simulationRuns, populationBriefs, synthesisJobs,
  type Persona, type InsertPersona,
  type SimulationRunRecord, type InsertSimulationRun,
  type PopulationBriefRecord, type InsertPopulationBrief,
  type SynthesisJobRecord, type InsertSynthesisJob,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, sql, lt } from "drizzle-orm";

export async function getPersona(id: string): Promise<Persona | undefined> {
  const [persona] = await db.select().from(personas).where(eq(personas.id, id));
  return persona;
}

export async function getPersonasByProject(projectId: string): Promise<Persona[]> {
  return await db.select().from(personas)
    .where(and(eq(personas.projectId, projectId), eq(personas.isArchived, false)))
    .orderBy(desc(personas.createdAt));
}

export async function createPersona(data: InsertPersona): Promise<Persona> {
  const [persona] = await db.insert(personas).values(data).returning();
  return persona;
}

export async function updatePersona(id: string, data: Partial<InsertPersona>): Promise<Persona | undefined> {
  const [persona] = await db.update(personas)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(personas.id, id))
    .returning();
  return persona;
}

export async function archivePersona(id: string): Promise<Persona | undefined> {
  const [persona] = await db.update(personas)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(personas.id, id))
    .returning();
  return persona;
}

export async function getSimulationRun(id: string): Promise<SimulationRunRecord | undefined> {
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id));
  return run;
}

export async function getSimulationRunsByCollection(collectionId: string): Promise<SimulationRunRecord[]> {
  return await db.select().from(simulationRuns)
    .where(eq(simulationRuns.collectionId, collectionId))
    .orderBy(desc(simulationRuns.createdAt));
}

export async function createSimulationRun(data: InsertSimulationRun): Promise<SimulationRunRecord> {
  const [run] = await db.insert(simulationRuns).values(data).returning();
  return run;
}

export async function updateSimulationRun(
  id: string,
  data: Partial<SimulationRunRecord>,
): Promise<SimulationRunRecord | undefined> {
  const [run] = await db.update(simulationRuns)
    .set(data)
    .where(eq(simulationRuns.id, id))
    .returning();
  return run;
}

export async function getActiveSimulationRunCount(): Promise<number> {
  const rows = await db.select().from(simulationRuns)
    .where(eq(simulationRuns.status, "running"));
  return rows.length;
}

export async function isSimulationRunCancelled(runId: string): Promise<boolean> {
  const run = await getSimulationRun(runId);
  return !run || run.status === "cancelled";
}

export async function cleanupOrphanedSimulationRuns(): Promise<number> {
  const orphanedRunning = await db.update(simulationRuns)
    .set({ status: "failed", errorMessage: "Server restarted during execution", completedAt: new Date() })
    .where(eq(simulationRuns.status, "running"))
    .returning();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const orphanedPending = await db.update(simulationRuns)
    .set({ status: "failed", errorMessage: "Server restarted before execution started", completedAt: new Date() })
    .where(and(eq(simulationRuns.status, "pending"), lt(simulationRuns.createdAt, fiveMinutesAgo)))
    .returning();
  return orphanedRunning.length + orphanedPending.length;
}

export async function acquireSimulationLock(maxConcurrent: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT pg_try_advisory_lock(hashtext('simulation_concurrency')) as acquired
  `);
  const acquired = (result.rows[0] as any)?.acquired;
  if (!acquired) return false;

  try {
    const activeCount = await getActiveSimulationRunCount();
    if (activeCount >= maxConcurrent) {
      await db.execute(sql`SELECT pg_advisory_unlock(hashtext('simulation_concurrency'))`);
      return false;
    }
    return true;
  } catch {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('simulation_concurrency'))`);
    return false;
  }
}

export async function releaseSimulationLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(hashtext('simulation_concurrency'))`);
}

export async function createPopulationBrief(data: InsertPopulationBrief): Promise<PopulationBriefRecord> {
  const [brief] = await db.insert(populationBriefs).values(data).returning();
  return brief;
}

export async function updatePopulationBrief(
  id: string,
  data: Partial<InsertPopulationBrief>,
): Promise<PopulationBriefRecord | undefined> {
  const [brief] = await db.update(populationBriefs)
    .set(data)
    .where(eq(populationBriefs.id, id))
    .returning();
  return brief;
}

export async function getPopulationBrief(id: string): Promise<PopulationBriefRecord | undefined> {
  const [brief] = await db.select().from(populationBriefs).where(eq(populationBriefs.id, id));
  return brief;
}

export async function getPopulationBriefsByProject(projectId: string): Promise<PopulationBriefRecord[]> {
  return await db.select().from(populationBriefs)
    .where(eq(populationBriefs.projectId, projectId))
    .orderBy(desc(populationBriefs.createdAt));
}

export async function createSynthesisJob(data: InsertSynthesisJob): Promise<SynthesisJobRecord> {
  const [job] = await db.insert(synthesisJobs).values(data).returning();
  return job;
}

export async function updateSynthesisJob(
  id: string,
  data: Partial<InsertSynthesisJob>,
): Promise<SynthesisJobRecord | undefined> {
  const [job] = await db.update(synthesisJobs)
    .set(data)
    .where(eq(synthesisJobs.id, id))
    .returning();
  return job;
}

export async function getSynthesisJob(id: string): Promise<SynthesisJobRecord | undefined> {
  const [job] = await db.select().from(synthesisJobs).where(eq(synthesisJobs.id, id));
  return job;
}
