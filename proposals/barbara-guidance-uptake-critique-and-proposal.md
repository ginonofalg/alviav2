# Barbara Guidance Uptake Metrics: Critique & Revised Proposal

## Part 1: Critique of the Codex Proposal

### Fatal Flaw: Circular Inference

The proposal's core analysis pipeline is:

1. Find when Barbara analyzed (from `llmUsageEvents` timestamps)
2. Find the next Alvia turn after each analysis
3. **Infer what Barbara probably recommended** based on turn structure
4. **Score whether Alvia's turn matches** the inferred recommendation

Steps 3 and 4 are tautological. `inferExpectedActionFromContext(window)` guesses
what Barbara recommended by looking at what Alvia actually did. Then
`scoreApparentUptake()` checks whether Alvia did what you just inferred she was
told to do. This will produce artificially high uptake rates because the
"recommendation" is reverse-engineered from the behavior being measured.

Example: Alvia asks a follow-up question. The system infers Barbara must have
recommended `probe_followup`. It then scores this as "guidance followed." But
Alvia may have asked that follow-up independently — Barbara may have recommended
`suggest_next_question` instead. Without knowing what Barbara actually said, the
metric is meaningless.

### Missing Data: Guidance History Is Not Persisted

The proposal states it uses "existing persisted data" and requires "no schema
migration." But it overlooks a critical fact about the data model:

- `lastBarbaraGuidance` is a **single JSONB object** on `interviewSessions`,
  overwritten each time Barbara generates new guidance
  (`server/voice-interview.ts:199`).
- After a session completes, only the **final** guidance is preserved. All prior
  guidance (action, message, confidence, reasoning) is lost.
- `llmUsageEvents` records that a `barbara_analysis` call happened (with
  timestamps and token counts), but does **not** store the guidance content
  (action type, message, confidence).

The proposal's `estimateBarbaraInterventionWindows()` can identify *when*
Barbara ran, but cannot recover *what she recommended*. The entire heuristic
layer exists to paper over this gap, but as shown above, the heuristics are
circular.

### Specific Technical Issues

**1. `barbaraGuidanceQueue` is dead code.**
The proposal doesn't reference this directly, but it's worth noting: the queue
at `state.barbaraGuidanceQueue` is initialized and pushed to, but never consumed.
Items are pushed at lines 1838 and 2084 of `voice-interview.ts` but no code
reads from the queue. The actual injection path goes directly through
`buildInterviewInstructions()`.

**2. Turn-matching window of 0–45s is too wide.**
Barbara analysis is triggered after each respondent utterance and typically
completes in 1–5 seconds. A 45-second window could span multiple respondent
turns, especially in rapid exchanges. The fallback ("next Alvia turn regardless
of time") compounds this — if Barbara returns `action: "none"` (which is the
most common result for routine turns), the system would still match it to the
next Alvia turn and attempt inference.

**3. No handling of `action: "none"` frequency.**
Barbara returns `action: "none"` for the majority of turns — it only intervenes
when it detects a meaningful opportunity. The proposal's `analysisTurns` metric
counts all `barbara_analysis` events, but most of these result in "none" actions
that never reach Alvia. The "coverage" metric would be misleading: Barbara
analyzes every turn, but only intervenes on a fraction.

**4. The confidence threshold is ignored.**
Barbara guidance is only injected into Alvia when `confidence > 0.6` and
`action !== "none"` (`voice-interview.ts:2092`). The proposal doesn't
distinguish between guidance that was actually injected vs. guidance that was
generated but filtered out. An event in `llmUsageEvents` doesn't mean guidance
reached Alvia.

**5. Collection-level performance is underspecified.**
The proposal mentions "bounded concurrency" but doesn't address the actual cost:
loading full `liveTranscript` JSONB for every session in a collection. A
collection with 50 sessions, each having 200+ transcript entries, means
deserializing ~10,000 transcript entries. The 500ms P95 target is aspirational
without benchmarks or caching.

**6. `getUsageEventsBySession` doesn't exist at collection level.**
There is no `getUsageEventsByCollection` method. The proposal would need to
either query events session-by-session (N+1 problem) or add a new storage
method. This contradicts the "no storage method additions required" claim.

**7. The action taxonomy is incomplete.**
The proposal adds `"unknown"` to the action enum but doesn't account for the
actual distribution: most Barbara actions are `"none"`. The heuristic categories
(probe_followup, suggest_next_question, etc.) match the real
`BarbaraGuidance.action` enum, but the proposal infers them from Alvia's
behavior rather than reading them from Barbara's output — a distinction that
matters when measuring uptake.

### Design Issues

**Endpoints belong under `/api/analytics/`, not `/api/usage/`.**
Usage endpoints track LLM token consumption and costs. Guidance uptake is a
qualitative analytics metric about interview quality. Mixing these concerns in
`usage.routes.ts` creates a confusing API surface.

**No caching strategy for a read-heavy, compute-intensive endpoint.**
The proposal acknowledges "read-time computation only (no caching in v1)" but
the computation involves loading full transcripts and usage events, running
heuristics, and aggregating. For a dashboard-facing endpoint, this will be
called repeatedly during a single page view. Without caching, it will hammer
the database.

**The "probabilistic" framing doesn't rescue the circular logic.**
Labeling results as "apparent" and "inferred" is good practice, but it doesn't
fix the underlying problem. If the inference method is structurally unable to
produce valid results, calling them "apparent" just makes them honestly wrong
rather than dishonestly wrong.

---

## Part 2: Revised Proposal

### Summary

Add a two-phase system for measuring Barbara guidance effectiveness:

1. **Phase 1 (schema change):** Persist a compact guidance log per session,
   capturing every guidance event with its action, confidence, and timestamp.
   This is a single JSONB column addition — no new tables, no migration
   complexity.

2. **Phase 2 (analysis):** Build a read-time analysis module that compares
   persisted guidance actions against subsequent Alvia behavior, producing
   genuine uptake metrics at session and collection levels.

Phase 1 is a prerequisite. Without it, uptake measurement is speculative.

### Goals

- Quantify how often Barbara's guidance is reflected in Alvia's subsequent
  behavior, at session and collection levels.
- Distinguish between: guidance generated, guidance injected (met confidence
  threshold), and guidance apparently followed.
- Provide per-action breakdown with honest confidence indicators.
- Keep computation fast enough for dashboard use (<500ms for sessions, <2s for
  collections up to 100 sessions).

### Non-Goals

- Proving causal influence (Alvia may have done the same thing without guidance).
- Modifying the voice interview loop's runtime behavior.
- Building client UI (separate effort).

---

### Phase 1: Persist Guidance History

#### Schema Change

Add one JSONB column to `interviewSessions`:

```typescript
// shared/schema.ts
barbaraGuidanceLog: jsonb("barbara_guidance_log")
  .$type<BarbaraGuidanceLogEntry[]>()
  .default([]),
```

#### New Type

```typescript
// shared/types/barbara-guidance-uptake.ts

export type BarbaraGuidanceLogEntry = {
  /** Monotonic index within the session */
  index: number;
  /** Barbara's recommended action */
  action: BarbaraGuidanceAction;
  /** Barbara's guidance message (truncated to 500 chars for storage) */
  messageSummary: string;
  /** Barbara's confidence in the recommendation (0-1) */
  confidence: number;
  /** Whether guidance met injection threshold (confidence > 0.6, action !== "none") */
  injected: boolean;
  /** Unix timestamp (ms) when guidance was generated */
  timestamp: number;
  /** Which template question was active */
  questionIndex: number;
  /** Index of the respondent turn that triggered this analysis */
  triggerTurnIndex: number;
};

export type BarbaraGuidanceAction =
  | "probe_followup"
  | "suggest_next_question"
  | "acknowledge_prior"
  | "confirm_understanding"
  | "suggest_environment_check"
  | "time_reminder"
  | "none";
```

#### Storage Cost

Each entry is ~200 bytes JSON. A 30-minute interview with 40 respondent turns
produces ~40 entries = ~8KB. This is negligible compared to `liveTranscript`
(typically 20-50KB) and `questionSummaries` (10-30KB) already stored as JSONB.

#### Implementation

Modify `persistBarbaraGuidance()` in `server/voice-interview.ts` (~10 lines):

```typescript
// Instead of overwriting lastBarbaraGuidance, also append to log
const logEntry: BarbaraGuidanceLogEntry = {
  index: state.barbaraGuidanceLog.length,
  action: guidance.action,
  messageSummary: guidance.message.slice(0, 500),
  confidence: guidance.confidence,
  injected: guidance.confidence > 0.6 && guidance.action !== "none",
  timestamp: Date.now(),
  questionIndex: state.currentQuestionIndex,
  triggerTurnIndex: state.fullTranscriptForPersistence.length - 1,
};

state.barbaraGuidanceLog.push(logEntry);
```

Add `barbaraGuidanceLog` to the `InterviewStatePatch` type and the existing
`persistInterviewState()` call. The existing 2-second debounced persistence
handles this automatically — no new persistence path needed.

`lastBarbaraGuidance` continues to exist for resume support. The log is
append-only and only read at analysis time.

#### Backward Compatibility

Sessions recorded before this change will have `barbaraGuidanceLog: null` or
`[]`. The analysis module handles this gracefully by falling back to a
"insufficient data" response. No backfill needed — the metric only applies to
new sessions.

---

### Phase 2: Analysis Module

#### New File: `server/analytics/barbara-guidance-uptake.ts`

Target: <400 lines. Pure functions, no side effects, no database access.

##### Core Functions

```typescript
/**
 * Build the full uptake analysis for a single session.
 */
export function analyzeSessionGuidanceUptake(
  guidanceLog: BarbaraGuidanceLogEntry[],
  transcript: PersistedTranscriptEntry[],
  questionCount: number,
): SessionGuidanceUptakeResult

/**
 * Aggregate session-level results into collection-level metrics.
 */
export function aggregateCollectionUptake(
  sessionResults: SessionGuidanceUptakeResult[],
): CollectionGuidanceUptakeResult
```

##### Analysis Logic

For each guidance log entry where `injected === true`:

1. **Find the target Alvia turn.** Starting from `triggerTurnIndex + 1`, find
   the next transcript entry where `speaker === "alvia"`. If no Alvia turn
   exists within 3 entries, mark as `no_response` (session may have ended or
   disconnected).

2. **Score uptake by action type.** Each action has specific textual signals in
   the subsequent Alvia turn:

   | Action | Evidence in Alvia's response |
   |--------|------------------------------|
   | `probe_followup` | Contains a question that references specific respondent content from the current turn (not a template question) |
   | `suggest_next_question` | Transitions to next template question or explicitly offers to move on |
   | `acknowledge_prior` | References a prior answer before posing a new question |
   | `confirm_understanding` | Paraphrases respondent content and asks for confirmation |
   | `suggest_environment_check` | Mentions audio, hearing, noise, or asks respondent to adjust |
   | `time_reminder` | References time, pacing, remaining questions |

   Each evidence check returns a boolean. The scoring is binary per entry:
   **matched** or **not matched**. No fractional scores — this avoids false
   precision.

3. **Handle ambiguity honestly.** If the Alvia turn is too short (<10 words) or
   contains multiple signals, mark as `ambiguous` rather than forcing a match.

##### Why This Is Not Circular

With the guidance log, the analysis knows what Barbara *actually recommended*
(from `logEntry.action`) independently of what Alvia did. It then checks whether
Alvia's behavior is consistent with that recommendation. The recommendation
and the behavior are separate data sources:

- **Recommendation source:** `barbaraGuidanceLog[i].action` (written by Barbara
  before Alvia responds)
- **Behavior source:** `liveTranscript[targetTurnIndex].text` (written by Alvia
  after receiving the guidance)

This is a genuine comparison, not inference from the same data.

#### Response Types

```typescript
// shared/types/barbara-guidance-uptake.ts

export type GuidanceUptakeEntry = {
  /** Index in the guidance log */
  guidanceIndex: number;
  /** The action Barbara recommended */
  action: BarbaraGuidanceAction;
  /** Barbara's confidence */
  confidence: number;
  /** Index of the Alvia turn evaluated */
  alviaTurnIndex: number | null;
  /** Uptake result */
  result: "matched" | "not_matched" | "ambiguous" | "no_response";
  /** Which evidence signal was detected (if matched) */
  evidenceSignal?: string;
};

export type SessionGuidanceUptakeResult = {
  sessionId: string;
  /** Total guidance events generated by Barbara */
  totalGuidanceEvents: number;
  /** Events where guidance met injection threshold */
  injectedCount: number;
  /** Events where action was "none" (no intervention needed) */
  noActionCount: number;
  /** Of injected guidance, how many appear followed */
  matchedCount: number;
  /** Of injected guidance, how many were not followed */
  notMatchedCount: number;
  /** Of injected guidance, how many were ambiguous */
  ambiguousCount: number;
  /** Of injected guidance, Alvia didn't respond in time */
  noResponseCount: number;
  /**
   * Apparent uptake rate: matchedCount / injectedCount.
   * Only counts guidance that was actually injected (confidence > 0.6).
   * null if injectedCount === 0.
   */
  apparentUptakeRate: number | null;
  /** Breakdown by action type */
  byAction: Record<BarbaraGuidanceAction, {
    injected: number;
    matched: number;
    notMatched: number;
    ambiguous: number;
  }>;
  /** Per-entry detail (optional, controlled by query param) */
  entries?: GuidanceUptakeEntry[];
  /** Data quality indicator */
  dataQuality: "full" | "partial" | "insufficient";
  /** Human-readable caveat */
  caveat: string;
};

export type CollectionGuidanceUptakeResult = {
  collectionId: string;
  sessionCount: number;
  /** Sessions with sufficient data for analysis */
  analyzableSessionCount: number;
  /** Aggregate across all analyzable sessions */
  aggregate: {
    totalInjected: number;
    totalMatched: number;
    apparentUptakeRate: number | null;
    byAction: Record<BarbaraGuidanceAction, {
      injected: number;
      matched: number;
    }>;
  };
  /** Distribution of per-session uptake rates */
  distribution: {
    min: number | null;
    median: number | null;
    max: number | null;
    p25: number | null;
    p75: number | null;
  };
  /** Per-session summaries (sessionId + uptake rate + data quality) */
  sessions: Array<{
    sessionId: string;
    apparentUptakeRate: number | null;
    injectedCount: number;
    matchedCount: number;
    dataQuality: "full" | "partial" | "insufficient";
  }>;
  caveat: string;
};
```

#### Endpoints

Place in a new file: `server/routes/analytics.guidance.routes.ts`.

These are interview quality analytics, not LLM usage metrics. They belong under
`/api/analytics/`, not `/api/usage/`.

```
GET /api/analytics/sessions/:sessionId/guidance-uptake
GET /api/analytics/collections/:collectionId/guidance-uptake
```

Query parameters:
- `detail=true` — include per-entry breakdown in session response
- (Collection endpoint) `limit=N` — cap number of sessions analyzed (default 100)

Access control: reuse existing `verifyUserAccessToSession` /
`verifyUserAccessToCollection` from `storage.ts`.

#### Storage Methods Needed

One new method to avoid the N+1 problem at collection level:

```typescript
// server/storage/types.ts
getSessionsWithGuidanceLogByCollection(
  collectionId: string
): Promise<Array<{
  id: string;
  barbaraGuidanceLog: BarbaraGuidanceLogEntry[] | null;
  liveTranscript: PersistedTranscriptEntry[] | null;
  questionCount: number;  // derived from template
}>>
```

This is a single query joining `interviewSessions` with the template's question
count, selecting only the two JSONB columns needed. Far more efficient than
loading full session objects.

#### Performance

**Session-level:** One DB read (session row with two JSONB columns). In-memory
analysis of ~40 guidance entries against ~80 transcript entries. Sub-50ms.

**Collection-level:** One DB query returning guidance logs and transcripts for
all sessions. Analysis is O(sessions * avg_guidance_entries). For 100 sessions
with 40 entries each: 4,000 comparisons. Sub-500ms including DB read.

**Safeguard:** The `limit` query parameter caps collection analysis. Sessions
without `barbaraGuidanceLog` are counted as "insufficient" and skipped quickly.

---

### Testing Strategy

#### Unit Tests (`server/__tests__/barbara-guidance-uptake.test.ts`)

**Scoring tests (one per action type):**
- `probe_followup`: Alvia asks "You mentioned X — can you tell me more?" → matched
- `probe_followup`: Alvia asks next template question → not_matched
- `suggest_next_question`: Alvia says "Let's move to the next topic" → matched
- `suggest_next_question`: Alvia asks follow-up on current topic → not_matched
- `acknowledge_prior`: Alvia says "Earlier you said X, and now..." → matched
- `confirm_understanding`: Alvia says "So if I understand correctly, you..." → matched
- `suggest_environment_check`: Alvia says "I'm having trouble hearing..." → matched
- `time_reminder`: Alvia says "We have a few questions left..." → matched

**Edge cases:**
- Empty guidance log → `dataQuality: "insufficient"`, null rates
- Empty transcript → `dataQuality: "insufficient"`
- All guidance has `action: "none"` → `injectedCount: 0`, null uptake rate
- All guidance below confidence threshold → `injectedCount: 0`
- Alvia turn too short → `ambiguous`
- Guidance at end of session with no subsequent Alvia turn → `no_response`
- Multiple guidance events before same Alvia turn → each evaluated independently

**Aggregation tests:**
- Mixed sessions (some full, some insufficient) → only full/partial counted
- Distribution calculation with odd/even session counts
- Zero analyzable sessions → null distribution values

#### Integration Tests

- 404 on missing session/collection
- 403 on unauthorized access
- Response conforms to type schema
- `detail=true` includes entries array
- `detail=false` omits entries array
- `limit` parameter caps session count

---

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Textual evidence matching has false positives/negatives | Medium | Binary scoring + "ambiguous" category + caveat text. Iterate heuristics with real data. |
| JSONB column growth on very long interviews | Low | Entries are ~200 bytes each. 100-turn interview = 20KB. Cap at 200 entries (safety valve). |
| Guidance log adds to persistence payload | Low | Append-only, serialized with existing debounced persist. No additional DB writes. |
| Old sessions lack guidance log | Expected | `dataQuality: "insufficient"` response. No backfill attempted. |
| Heuristic drift as Alvia's prompt style changes | Medium | Centralized evidence rules in one module. Fixture-based regression tests. |
| Large collection analysis slow | Low | `limit` parameter + skip insufficient sessions. Single optimized query. |

---

### Implementation Order

1. Add `BarbaraGuidanceLogEntry` type to `shared/types/barbara-guidance-uptake.ts`
2. Add `barbaraGuidanceLog` column to schema, run `db:push`
3. Add `barbaraGuidanceLog` to `InterviewStatePatch` and `persistInterviewState`
4. Modify `persistBarbaraGuidance()` to append to log
5. Add response types to `shared/types/barbara-guidance-uptake.ts`
6. Implement `analyzeSessionGuidanceUptake()` and `aggregateCollectionUptake()`
7. Add `getSessionsWithGuidanceLogByCollection()` to storage
8. Add route handlers in `server/routes/analytics.guidance.routes.ts`
9. Register routes in `server/routes/index.ts`
10. Write unit and integration tests

Steps 1-4 can ship independently as a data-collection release. Steps 5-10
build the analysis layer on top.

---

### Comparison: Codex Proposal vs. This Proposal

| Aspect | Codex Proposal | This Proposal |
|--------|---------------|---------------|
| Schema changes | None | One JSONB column |
| Knows what Barbara recommended | No (infers from behavior) | Yes (from guidance log) |
| Circular inference risk | Fatal — infers recommendation from the behavior being measured | None — recommendation and behavior are independent data sources |
| Handles `action: "none"` | Counts all analysis events | Separates "none" from injected guidance |
| Handles confidence threshold | Ignores it | Tracks `injected` flag based on threshold |
| Guidance history | Lost after session (only last guidance persisted) | Full append-only log |
| Endpoint location | `/api/usage/` (wrong domain) | `/api/analytics/` (correct domain) |
| Collection query strategy | Per-session queries (N+1) | Single optimized query |
| Scoring approach | Fractional scores (0-1) with 0.6 threshold | Binary match/not-match + ambiguous category |
| Backward compat | Claims full compat but can't produce valid results | Graceful degradation with "insufficient" quality flag |
| Caching | None (v1) | Not needed at target perf; can add if needed |
| Lines of new code | ~500 (analysis module) | ~400 (analysis) + ~30 (schema/persistence) |
