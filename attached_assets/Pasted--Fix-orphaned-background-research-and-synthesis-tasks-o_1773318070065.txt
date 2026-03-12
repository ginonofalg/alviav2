# Fix orphaned background research and synthesis tasks on server restart

## Problem

The persona research flow uses a fire-and-forget pattern: `runResearchInBackground()` is called without `await` after the HTTP response is sent. When the Node.js server restarts (HMR, deploy, Replit auto-restart), the background task is silently killed. The `population_briefs` record stays stuck in `status: "researching"` permanently:

- The client polls for up to 1 hour (`MAX_RESEARCH_POLL_DURATION_S = 3600`), then silently resets the dialog to the input state
- The brief never reaches `"completed"`, so it never appears in "Use Existing Research"
- OpenAI may have successfully generated the response (visible in their dashboard), but the server process that was supposed to receive and store it no longer exists

The same problem exists for `runSynthesisInBackground()` — a synthesis job can get stuck in `"synthesizing"` forever. The existing 10-minute auto-fail timeout on the synthesis status endpoint is a partial bandaid but doesn't apply to research (which has a 1-hour window).

Server logs confirm this: zero `[PersonaGeneration]` log entries in the current session for briefs that show `status: "researching"` in the database.

## Proposed fix: "interrupted" status with user-initiated retry

### Design principles

1. **Don't auto-restart expensive work silently.** Each research call costs real API credits (web search + high reasoning + structured output). Auto-restarting on boot risks thundering herd if multiple briefs are orphaned, and duplicates work that OpenAI may have already completed.
2. **Don't turn GET endpoints into side-effect endpoints.** The status polling endpoint should remain a pure read. Side effects (restarting research) belong behind explicit POST actions.
3. **Follow the existing pattern.** The codebase already handles this exact scenario for simulation runs via `cleanupOrphanedSimulationRuns()` in `server/storage/simulation.ts` (lines 81–92), called from `server/index.ts` (line 106). That function marks orphaned runs as `"failed"` on startup. We should follow the same pattern with one improvement: using `"interrupted"` instead of `"failed"` so the client can offer a retry rather than just showing an error.
4. **Handle both background task types.** Research and synthesis have identical fire-and-forget patterns and identical orphan risk.

### New status: `"interrupted"`

Add `"interrupted"` as a valid status for both `population_briefs` and `synthesis_jobs`. This status means: "the server process that was executing this task died before it could complete." It is distinct from `"failed"` (which means the task ran to completion and errored) because it's retryable — the inputs are still valid, the work just never finished.

### Implementation

#### T1: Startup cleanup function (`server/storage/simulation.ts`)

Add `cleanupOrphanedResearchAndSynthesis()` alongside the existing `cleanupOrphanedSimulationRuns()`:

```typescript
export async function cleanupOrphanedResearchAndSynthesis(): Promise<{ briefs: number; jobs: number }> {
  // Mark all "researching" briefs as "interrupted" — on a fresh server start,
  // every in-progress brief is orphaned by definition
  const interruptedBriefs = await db.update(populationBriefs)
    .set({ status: "interrupted", errorMessage: "Research was interrupted by a server restart." })
    .where(eq(populationBriefs.status, "researching"))
    .returning();

  // Same for synthesis jobs stuck in "synthesizing"
  const interruptedJobs = await db.update(synthesisJobs)
    .set({ status: "interrupted", errorMessage: "Persona generation was interrupted by a server restart." })
    .where(eq(synthesisJobs.status, "synthesizing"))
    .returning();

  return { briefs: interruptedBriefs.length, jobs: interruptedJobs.length };
}
```

Call it from `server/index.ts` alongside the existing simulation cleanup (line 106).

**Why not auto-restart?** A single research call can take 5+ minutes and costs significant tokens. If 5 briefs are orphaned, auto-restarting them all at boot competes with normal server operation and bypasses the in-memory rate limiter (which was wiped on restart). Marking as `"interrupted"` is safe, fast, and deterministic.

#### T2: Status endpoint changes (`server/routes/persona-generation.routes.ts`)

Update the research status endpoint (line 119–178) to handle `"interrupted"`:

```typescript
if (briefRecord.status === "interrupted") {
  return res.json({
    status: "interrupted",
    briefId: briefRecord.id,
    errorMessage: briefRecord.errorMessage ?? "Research was interrupted by a server restart.",
    canRetry: true,
  });
}
```

Same for the synthesis status endpoint (line 299–357).

The status endpoint remains a pure GET — no side effects.

#### T3: Retry endpoint (`server/routes/persona-generation.routes.ts`)

Add `POST /api/projects/:projectId/personas/research/:briefId/restart`:

```typescript
app.post("/api/projects/:projectId/personas/research/:briefId/restart", isAuthenticated, async (req, res) => {
  // 1. Auth + access check (same as existing endpoints)
  // 2. Load brief, verify status is "interrupted"
  // 3. Rate limit check (reuse existing checkResearchRateLimit)
  // 4. Reset status to "researching", clear errorMessage
  // 5. Load project from storage
  // 6. Call runResearchInBackground with stored researchPrompt + additionalContext
  //    (NO uploadedFile — it's not persisted in DB, so retry runs without it.
  //     The research prompt and additional context are usually sufficient.
  //     If the original request had a file, the results may differ slightly
  //     but will still be useful — this matches the existing fallback behaviour
  //     where researchWithoutWebSearch produces usable results without all inputs.)
  // 7. Return { briefId, status: "researching" }
});
```

Add an equivalent `POST /api/projects/:projectId/personas/synthesize/:jobId/restart` for synthesis jobs. Synthesis retries are simpler since all inputs (brief, config) are stored in the DB.

#### T4: Client-side handling (`client/src/components/simulation/GeneratePersonasDialog.tsx`)

When the polling response returns `status: "interrupted"`:

1. Stop polling
2. Show a message: "Research was interrupted by a server restart."
3. Show a "Retry" button that calls `POST .../restart`, then resumes polling

This is a small change to the existing polling switch statement. The user stays in control — they see what happened and choose whether to retry.

#### T5: Type check and test verification

Run `npm run check` and `npx vitest` to verify nothing breaks.

### Files changed

| File | Change |
|------|--------|
| `server/storage/simulation.ts` | Add `cleanupOrphanedResearchAndSynthesis()` |
| `server/index.ts` | Call new cleanup on startup (next to existing simulation cleanup) |
| `server/routes/persona-generation.routes.ts` | Handle `"interrupted"` in status endpoints; add restart endpoints |
| `client/src/components/simulation/GeneratePersonasDialog.tsx` | Handle `"interrupted"` status in polling; show retry UI |

### Out of scope

- **Moving to a proper job queue (BullMQ, etc.)** — correct long-term solution but too large for this fix
- **Recovering OpenAI responses that completed but were never stored** — the Responses API doesn't support retrieval by ID; the work must be re-run
- **Changes to streaming implementation** — already addressed separately
- **Persisting uploaded files to DB or object storage** — would enable perfect retry fidelity but adds schema migration + storage complexity; the research prompt alone produces usable results

### Why not the Replit proposal?

The original proposal had three issues:

1. **T2 turned the GET status endpoint into a write-with-side-effects endpoint.** Polling triggers a restart of expensive background work — if two browser tabs poll simultaneously, you get a race condition launching duplicate research. The 30-second in-memory guard doesn't survive another restart.

2. **T3 auto-restarted all orphaned briefs on boot.** Five orphaned briefs = five parallel OpenAI calls with web search, all competing at startup, all bypassing the rate limiter (which was wiped). Thundering herd risk with real cost.

3. **Ignored synthesis jobs entirely.** `runSynthesisInBackground` has the identical fire-and-forget pattern and identical orphan risk.

The `"interrupted"` status approach is simpler (fewer lines of code), safer (no automatic API spend), and gives the user visibility and control.
