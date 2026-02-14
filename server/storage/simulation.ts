import {
  personas, simulationRuns,
  type Persona, type InsertPersona,
  type SimulationRunRecord, type InsertSimulationRun,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";

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
