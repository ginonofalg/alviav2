import { storage } from "./storage";

const RAW_RETENTION_DAYS = 14;
const CLEANUP_BATCH_SIZE = 10_000;
const CLEANUP_MAX_BATCHES = 50;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RECONCILIATION_HOURS_BACK = 48;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let reconciliationTimer: ReturnType<typeof setInterval> | null = null;

async function runCleanup(): Promise<void> {
  console.log("[UsageMaintenance] Starting expired event cleanup...");
  const start = Date.now();
  let totalDeleted = 0;

  try {
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const deleted = await storage.deleteExpiredUsageEvents(RAW_RETENTION_DAYS, CLEANUP_BATCH_SIZE);
      totalDeleted += deleted;
      if (deleted < CLEANUP_BATCH_SIZE) break;
    }

    const durationMs = Date.now() - start;
    console.log(`[UsageMaintenance] Cleanup complete: ${totalDeleted} rows deleted in ${durationMs}ms`);
  } catch (err) {
    console.error("[UsageMaintenance] Cleanup failed:", err);
  }
}

async function runReconciliation(): Promise<void> {
  console.log("[UsageMaintenance] Starting rollup reconciliation...");
  const start = Date.now();

  try {
    const upserted = await storage.reconcileUsageRollups(RECONCILIATION_HOURS_BACK);
    const durationMs = Date.now() - start;
    console.log(`[UsageMaintenance] Reconciliation complete: ${upserted} events re-aggregated in ${durationMs}ms`);
  } catch (err) {
    console.error("[UsageMaintenance] Reconciliation failed:", err);
  }
}

export async function backfillRollups(): Promise<void> {
  console.log("[UsageMaintenance] Starting one-time rollup backfill from raw events (all-time)...");
  const start = Date.now();

  try {
    const upserted = await storage.reconcileUsageRollups(24 * 365);
    const durationMs = Date.now() - start;
    console.log(`[UsageMaintenance] Backfill complete: ${upserted} rollup rows created/updated in ${durationMs}ms`);
  } catch (err) {
    console.error("[UsageMaintenance] Backfill failed:", err);
  }
}

export function startUsageMaintenanceJobs(): void {
  if (cleanupTimer || reconciliationTimer) {
    console.warn("[UsageMaintenance] Jobs already started, skipping.");
    return;
  }

  console.log(`[UsageMaintenance] Starting maintenance jobs (cleanup every ${CLEANUP_INTERVAL_MS / 60000}min, reconciliation every ${RECONCILIATION_INTERVAL_MS / 3600000}h)`);

  runCleanup().catch(() => {});

  cleanupTimer = setInterval(() => {
    runCleanup().catch(() => {});
  }, CLEANUP_INTERVAL_MS);

  reconciliationTimer = setInterval(() => {
    runReconciliation().catch(() => {});
  }, RECONCILIATION_INTERVAL_MS);
}

export function stopUsageMaintenanceJobs(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
  }
  console.log("[UsageMaintenance] Maintenance jobs stopped.");
}
