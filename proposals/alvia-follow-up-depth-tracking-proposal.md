# Alvia Follow-Up Depth Tracking: Proposal

## Problem

Alvia regularly overshoots the researcher's recommended follow-up depth for a question. The root cause is a tracking gap: the `followUpCount` metric — which both Alvia and Barbara use to gauge pacing — only increments when Barbara explicitly emits a `probe_followup` action (`voice-interview.ts:2413-2416`). It does **not** increment when Alvia probes on her own initiative.

### How the gap arises

The interview loop works like this:

1. Respondent speaks → transcript captured
2. Barbara analyzes the transcript and returns an action (`probe_followup`, `suggest_next_question`, `acknowledge_prior`, `none`, etc.)
3. If the action is `probe_followup`, `followUpCount++` (`voice-interview.ts:2413-2416`)
4. Alvia receives updated instructions including the current `followUpCount` and `recommendedFollowUps`
5. Alvia generates a spoken response — which may be a probing follow-up regardless of Barbara's action

The problem: Alvia is an LLM with general conversational instincts. Even when Barbara says `none` or `acknowledge_prior`, Alvia may still ask a probing follow-up. These self-initiated probes are invisible to the depth counter. As a result:

- The `FOLLOW-UP DEPTH` block in Alvia's instructions shows a stale count (e.g., "You've asked 1 so far" when she has actually probed 3 times)
- Barbara's own depth-based heuristic ("if follow-ups are at or above the recommended depth, prefer `suggest_next_question`") operates on the same understated count, making her less likely to suggest moving on
- The researcher's intent — encoded as `recommendedFollowUps` — is systematically under-enforced

### Scope of impact

This affects every live voice interview. Simulation mode (`server/simulation/engine.ts`) is not affected — it increments `followUpCount` per loop turn, which is the correct analog for that context.

---

## Proposed Solution

Redefine `followUpCount` to mean "actual Alvia follow-up turns on this question" (its intuitive meaning). Derive the Barbara-issued probe count from `barbaraGuidanceLog`, which already records action plus question index (`voice-interview/guidance-tracking.ts:7-21`).

### Design decisions

1. **Rename, don't add.** Rather than adding a second counter alongside the existing one, redefine `followUpCount` to track actual Alvia follow-up turns. Barbara-issued probes can be derived from `barbaraGuidanceLog` (which persists action + `questionIndex` per guidance event). This avoids dual-counter confusion and keeps the prompt simpler.

2. **Count post-initial Alvia turns, not "probes."** The counter tracks every Alvia spoken turn after the initial question-ask on the current question. This deliberately includes clarification repeats, re-anchor turns, and other non-probe utterances. Rationale: from a respondent-experience standpoint, all of these consume interview time and contribute to "depth" on a question. Attempting to classify which turns are "true probes" would require content analysis that is fragile and inconsistent. The metric name should reflect this: `followUpTurnCount` (replacing `followUpCount`).

3. **Exclude interrupted turns.** Alvia turns that are interrupted (barge-in) should not count, since the respondent cut the turn short before it could function as a probe. The `interrupted` flag is set on the transcript entry at `input_audio_buffer.speech_started` (`voice-interview.ts:1768-1777`), which fires *after* `response.audio_transcript.done`. Therefore, counting must be **deferred**: increment tentatively on `audio_transcript.done`, then **decrement** when the next `speech_started` event marks the preceding Alvia entry as interrupted.

4. **Handle `recommendedFollowUps = 0` safely.** Today, researchers can set `recommendedFollowUps` to 0 on a question (`templates.routes.ts:50-59`, `template-builder.tsx:79`). The threshold nudge must not fire before Alvia has asked the question itself. Guard: only apply the "at/above depth" language when `followUpTurnCount > 0` AND `followUpTurnCount >= recommendedFollowUps`.

### 1. Rename `followUpCount` → `followUpTurnCount` across the codebase

**Files affected:**

| File | What changes |
|------|-------------|
| `shared/types/interview-state.ts:67` | `PersistedQuestionState.followUpCount` → `followUpTurnCount` |
| `server/barbara-orchestrator.ts:215` | `QuestionMetrics.followUpCount` → `followUpTurnCount` |
| `server/barbara-orchestrator.ts` (`createEmptyMetrics`) | Initialize `followUpTurnCount: 0` |
| `server/voice-interview.ts` | All 6+ references to `metrics.followUpCount` and `qs.followUpCount` |
| `server/voice-interview/instructions.ts:18,230,307` | `followUpContext.followUpCount` → `followUpContext.followUpTurnCount` |
| `server/simulation/engine.ts:271,278,284,517` | `metrics.followUpCount` → `metrics.followUpTurnCount` |
| `server/simulation/alvia-adapter.ts:29` | `followUpContext.followUpCount` → `followUpContext.followUpTurnCount` |

Backward compatibility for existing persisted JSONB: use nullish coalescing (`qs.followUpTurnCount ?? qs.followUpCount ?? 0`) in the restore path (`voice-interview.ts:943`), so sessions persisted before the rename still load correctly.

### 2. New helper: `recordAlviaFollowUpTurn` / `revertAlviaFollowUpTurn` in `server/voice-interview/metrics.ts`

Keep counting logic out of the watchlist file (`voice-interview.ts`). Add to `metrics.ts`:

```ts
/**
 * Tentatively record an Alvia follow-up turn.
 * Call on response.audio_transcript.done when alviaHasSpokenOnCurrentQuestion is already true.
 * Returns true if the count was incremented (for tracking pending revert).
 */
export function recordAlviaFollowUpTurn(
  questionMetrics: Map<number, QuestionMetrics>,
  questionIndex: number,
): boolean {
  const metrics = questionMetrics.get(questionIndex);
  if (!metrics) return false;
  metrics.followUpTurnCount++;
  return true;
}

/**
 * Revert a tentatively recorded follow-up turn (e.g., when Alvia was interrupted/barged-in).
 * Call on input_audio_buffer.speech_started when the last Alvia transcript entry is marked interrupted.
 */
export function revertAlviaFollowUpTurn(
  questionMetrics: Map<number, QuestionMetrics>,
  questionIndex: number,
): void {
  const metrics = questionMetrics.get(questionIndex);
  if (!metrics || metrics.followUpTurnCount <= 0) return;
  metrics.followUpTurnCount--;
}
```

### 3. Increment logic in `voice-interview.ts`

**On `response.audio_transcript.done` / `response.output_audio_transcript.done` (~line 1486):**

After recording the Alvia transcript entry, if Alvia had already spoken on this question, tentatively increment:

```ts
if (cleanedTranscript) {
  // If Alvia had already spoken on this question, this is a follow-up turn
  if (state.alviaHasSpokenOnCurrentQuestion) {
    const incremented = recordAlviaFollowUpTurn(
      state.questionMetrics, state.currentQuestionIndex,
    );
    if (incremented) {
      state._pendingFollowUpTurnRevert = true; // track for barge-in revert
    }
  }
  state.alviaHasSpokenOnCurrentQuestion = true;
  // ... rest of existing handler
}
```

**On `input_audio_buffer.speech_started` (~line 1768), after setting `lastEntry.interrupted = true`:**

```ts
if (lastEntry.speaker === "alvia") {
  lastEntry.interrupted = true;
  // Revert tentative follow-up turn count for interrupted Alvia turn
  if (state._pendingFollowUpTurnRevert) {
    revertAlviaFollowUpTurn(
      state.questionMetrics, state.currentQuestionIndex,
    );
    state._pendingFollowUpTurnRevert = false;
  }
}
```

Clear `_pendingFollowUpTurnRevert` on respondent `transcription.completed` (the turn landed successfully, so the count stands).

Add `_pendingFollowUpTurnRevert: boolean` to `InterviewState` in `types.ts`, initialized to `false`.

### 4. Remove the Barbara-gated increment

**In `voice-interview.ts` (~line 2413-2416):**

Remove or comment out:
```ts
// OLD: Increment follow-up count when probe_followup action is taken
// if (guidance.action === "probe_followup") {
//   metrics.followUpCount++;
//   ...
// }
```

Barbara-issued probe counts can be derived from `barbaraGuidanceLog` at analysis time by filtering entries where `action === "probe_followup"` and grouping by `questionIndex`. This data is already persisted and scored by the guidance adherence system (`guidance-tracking.ts:31-36`).

### 5. Update `followUpContext` at ALL call sites

The `followUpContext` object is constructed at **five** sites in `voice-interview.ts`:

| Line | Context |
|------|---------|
| ~1072 | Initial question instructions |
| ~2019 | Barbara guidance-triggered instruction update |
| ~2109 | VAD eagerness switch instruction update |
| ~2386 | Barbara guidance instruction update (alternate path) |
| ~2848 | Next question transition |

All must use the renamed field:
```ts
followUpContext: {
  followUpTurnCount: metrics?.followUpTurnCount ?? 0,
  recommendedFollowUps,
}
```

Also update:
- `InterviewInstructionsOptions.followUpContext` type in `instructions.ts:17-20`
- `alvia-adapter.ts:29` (simulation path) — pass `followUpTurnCount`
- `simulation/engine.ts:278-284` — construct `QuestionMetrics` with `followUpTurnCount`

### 6. Update instruction prompts — main, resume, AND refresh paths

**Main path (`buildInterviewInstructions` in `instructions.ts:136-143`):**

Replace the `FOLLOW-UP DEPTH` block:

```
FOLLOW-UP DEPTH:
The researcher recommends approximately ${recommendedFollowUps} follow-up probes for this question.
You have made ${followUpTurnCount} follow-up turns so far on this question.
${followUpTurnCount > 0 && followUpTurnCount >= recommendedFollowUps
  ? "You have reached or exceeded the recommended depth. Unless the answer is clearly incomplete or contradictory, wrap up this question and guide the respondent toward the Next Question button."
  : "This is guidance, not a strict limit."}
```

Note the `followUpTurnCount > 0` guard — this prevents the wrap-up nudge from firing when `recommendedFollowUps` is 0 and Alvia hasn't even asked the question yet.

**Resume path (`buildResumeInstructions` via `buildSharedContextBlock` in `instructions.ts:352-361`):**

The `FOLLOW-UP DEPTH` block inside `buildSharedContextBlock` uses the same `ctx.followUpCount` / `ctx.recommendedFollowUps`. Update it identically:

```ts
// In buildSharedContextBlock (~line 352)
if (ctx.recommendedFollowUps !== null && ctx.recommendedFollowUps !== undefined) {
  block += `
FOLLOW-UP DEPTH:
The researcher recommends approximately ${ctx.recommendedFollowUps} follow-up probes for this question.
You have made ${ctx.followUpTurnCount} follow-up turns so far on this question.
${ctx.followUpTurnCount > 0 && ctx.followUpTurnCount >= ctx.recommendedFollowUps
  ? "You have reached or exceeded the recommended depth. Unless the answer is clearly incomplete or contradictory, wrap up this question and guide the respondent toward the Next Question button."
  : "This is guidance, not a strict limit."}
`;
}
```

Update `ResumeContext` interface (~line 218) to use `followUpTurnCount` instead of `followUpCount`, and update `buildResumeContext` (~line 307) accordingly.

**Refresh path (`buildRefreshInstructions` in `instructions.ts:437`):**

This shares `buildSharedContextBlock`, so the fix propagates automatically.

### 7. Feed `followUpTurnCount` to Barbara's analysis prompt

**In `server/barbara-orchestrator.ts`, `buildAnalysisPrompt()` (~line 714):**

Update the metrics block:

```
METRICS FOR CURRENT QUESTION:
- Word count: ${wordCount}
- Active speaking time: ${activeTimeSeconds} seconds
- Number of turns: ${input.questionMetrics.turnCount}
- Alvia follow-up turns so far: ${input.questionMetrics.followUpTurnCount}
- Recommended follow-up depth: ${recommendedFollowUps}
```

Update the `FOLLOW-UP DEPTH GUIDANCE` rule (~line 385):

```
7. FOLLOW-UP DEPTH GUIDANCE: When a recommended follow-up depth is specified, use it to guide your decisions:
   - Compare against "Alvia follow-up turns so far" (the actual count of Alvia's non-initial turns on this question)
   - If follow-up turns are at or above the recommended depth AND the answer has reasonable substance, prefer "suggest_next_question" over "probe_followup"
   - If follow-up turns are 1 below the recommended depth, only suggest probing if the answer is clearly incomplete
   - If no recommendation is set, rely on your judgment of answer completeness
```

### 8. Persistence and restore

**Persistence:** `updateQuestionState()` (`voice-interview.ts:258-289`) already syncs metrics to `questionStates`. Update it to copy `followUpTurnCount` instead of `followUpCount`:

```ts
if (metrics) {
  questionState.wordCount = metrics.wordCount;
  questionState.activeTimeMs = metrics.activeTimeMs;
  questionState.turnCount = metrics.turnCount;
  questionState.followUpTurnCount = metrics.followUpTurnCount;  // renamed
}
```

**Restore:** In the session restore path (`voice-interview.ts:931-946`), update the `questionMetrics` rebuild:

```ts
state.questionMetrics.set(qs.questionIndex, {
  questionIndex: qs.questionIndex,
  wordCount: qs.wordCount,
  activeTimeMs: qs.activeTimeMs,
  turnCount: qs.turnCount,
  startedAt: null,
  followUpTurnCount: qs.followUpTurnCount ?? (qs as any).followUpCount ?? 0,  // backward compat
  recommendedFollowUps: null,
});
```

**Alternative (rebuild from transcript):** Since `liveTranscript` is fully persisted and never truncated, the count *could* be rebuilt on restore by scanning the transcript for consecutive Alvia entries per question. However, persisting the count directly is simpler, cheaper, and consistent with how all other question metrics are handled. Only fall back to transcript rebuild if the persisted value is missing (covered by the `?? 0` default).

### 9. Update `_pendingFollowUpTurnRevert` state on question transitions

When the question advances (next question button, Barbara suggest_next_question), clear `_pendingFollowUpTurnRevert` to prevent stale reverts from bleeding into the new question's count.

---

## Complete file change surface

| File | Changes |
|------|---------|
| `shared/types/interview-state.ts` | Rename `PersistedQuestionState.followUpCount` → `followUpTurnCount` |
| `server/barbara-orchestrator.ts` | Rename in `QuestionMetrics`, `createEmptyMetrics()`, analysis prompt text, depth guidance rule |
| `server/voice-interview/metrics.ts` | Add `recordAlviaFollowUpTurn()`, `revertAlviaFollowUpTurn()` |
| `server/voice-interview/types.ts` | Add `_pendingFollowUpTurnRevert: boolean` to `InterviewState` |
| `server/voice-interview/instructions.ts` | Update `followUpContext` type, `FOLLOW-UP DEPTH` block in `buildInterviewInstructions`, `buildSharedContextBlock`, `ResumeContext` interface, `buildResumeContext` |
| `server/voice-interview.ts` | Remove Barbara-gated increment (~2413); add thin calls to `recordAlviaFollowUpTurn`/`revertAlviaFollowUpTurn`; rename all `followUpCount` references; update all 5 `followUpContext` sites; update `updateQuestionState` and restore path |
| `server/simulation/engine.ts` | Rename `followUpCount` → `followUpTurnCount` in metrics and `QuestionMetrics` construction |
| `server/simulation/alvia-adapter.ts` | Rename in `followUpContext` parameter |

---

## Tests to add

All tests should go in `server/__tests__/follow-up-depth.test.ts` (new file).

1. **Zero-depth questions**: When `recommendedFollowUps = 0`, verify the prompt does NOT contain "reached or exceeded" before Alvia has spoken a follow-up turn (i.e., `followUpTurnCount = 0`). Verify it DOES contain the nudge once `followUpTurnCount >= 1`.

2. **Interrupted Alvia turns**: Simulate the sequence: `audio_transcript.done` (tentative increment) → `speech_started` with `interrupted = true` on last Alvia entry → verify `followUpTurnCount` has been decremented back.

3. **Resume/refresh prompt parity**: Call `buildInterviewInstructions`, `buildResumeInstructions`, and `buildRefreshInstructions` with the same `followUpTurnCount` and `recommendedFollowUps` values. Verify all three contain identical `FOLLOW-UP DEPTH` content (same count, same threshold language).

4. **Restore/rebuild mid-question**: Persist a `questionState` with `followUpTurnCount = 3`, simulate session restore, verify `questionMetrics` map contains `followUpTurnCount = 3` for that question index.

5. **Backward compatibility**: Persist a `questionState` with old-style `followUpCount = 2` (no `followUpTurnCount`), simulate restore, verify it loads as `followUpTurnCount = 2`.

6. **Question transition clears revert flag**: Set `_pendingFollowUpTurnRevert = true`, advance question, verify flag is `false`.

---

## Expected outcomes

1. **Alvia sees her true follow-up depth** — the count reflects every follow-up turn she has taken, not just Barbara-guided ones
2. **Barbara makes better pacing decisions** — her depth heuristic operates on actual turn count
3. **Researcher intent is respected** — the `recommendedFollowUps` setting becomes meaningfully enforced
4. **Explicit instruction to wrap up** — when at or past the recommended depth, Alvia gets a direct nudge rather than soft "guidance, not a strict limit" language
5. **Interrupted turns don't inflate the count** — barge-in reverts keep the metric honest
6. **Zero-depth questions work correctly** — no premature wrap-up nudge
7. **Resume/refresh paths stay in sync** — all three instruction builders use the same depth logic
8. **No new JSONB fields needed** — the existing `followUpCount` field is renamed in place; `barbaraGuidanceLog` already captures Barbara-issued probe actions for any analysis that needs that breakdown
