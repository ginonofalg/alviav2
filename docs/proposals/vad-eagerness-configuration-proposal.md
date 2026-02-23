# Proposal: Configurable VAD Eagerness with Dynamic Mid-Conversation Switching

## Context

Users experience a perceptible delay between finishing their utterance and Alvia responding. The OpenAI Realtime API's `semantic_vad` is configured with `eagerness: "auto"`, which [per OpenAI's documentation](https://developers.openai.com/api/docs/guides/realtime-vad/) is equivalent to `"medium"` — a balanced default that uses semantic analysis to estimate turn completion probability, adding latency in exchange for accuracy. Setting `eagerness: "high"` reduces this latency ("will chunk the audio as soon as possible") but risks Alvia responding before the respondent has finished, causing talk-over events.

This proposal introduces a collection-level configurable eagerness mode with a compensating prompt instruction, plus automatic mid-conversation fallback when the system detects that high eagerness is causing conversation confusion.

---

## Assessment of the Approach

**The core idea is sound.** The existing codebase already has the full infrastructure for this:

- `sendVadEagernessUpdate()` sends `session.update` events to change eagerness mid-conversation (`voice-interview.ts:1940-1978`)
- `buildTurnDetectionUpdate()` builds the turn detection payload (`realtime-providers.ts:103-119`)
- `buildInterviewInstructions()` rebuilds the full prompt and is already called on every Barbara guidance injection (`voice-interview/instructions.ts:4-106`)
- Dynamic eagerness switching already exists for `auto` ↔ `low` via transcription quality monitoring (`transcription-quality.ts:489-525`)
- Client-side VAD indicator already displays current eagerness state (`interview.tsx`)

The pattern of "start with aggressive setting + prompt safety net + fallback on detection" is a good one. However, I'd refine the prompt instruction and add one new metric for robust detection.

### Refinement to the prompt instruction

The instruction "If the respondent's last utterance seems incomplete, briefly pause before responding" has a limitation: by the time the model receives the turn, the VAD has already decided the respondent stopped, and `create_response: true` auto-triggers generation. The model cannot literally "pause" — it starts generating immediately.

**Recommended alternative instruction:** Rather than asking the model to pause (which it can't do architecturally), instruct it to *recover gracefully when it detects an incomplete utterance*:

> "IMPORTANT: The voice detection is set to respond quickly, which means you may occasionally receive an utterance that seems cut off or incomplete (e.g., ends mid-sentence, is unusually brief, or trails off). When this happens, briefly acknowledge what was said and invite the respondent to continue (e.g., 'Go on...', 'Please continue...', 'Sorry, carry on with that thought') rather than treating it as a complete answer."

This is more actionable because: (a) the model CAN detect incomplete sentences in the transcript it receives, (b) it CAN choose a short recovery utterance instead of a full response, and (c) it creates a natural conversational repair mechanism.

### Additional ideas to consider

1. **Eagerness ramping**: Start the interview at "auto" for the first 1-2 questions (warm-up/greeting phase, where pauses are natural), then switch to "high" once the respondent's speaking rhythm is established. This avoids aggressive turn detection during awkward opening moments.

2. **"Medium" as a middle ground**: OpenAI's semantic_vad supports `"low"`, `"medium"`, `"auto"`, `"high"`. Testing "medium" alongside "high" could find a sweet spot with less risk.

3. **Combined eagerness + instructions update**: When switching eagerness, send a single `session.update` containing both the turn detection change AND the instruction change atomically. This avoids race conditions where two separate `session.update` calls could conflict.

### Pitfalls

1. **Confirm "high" is valid**: The existing type in `realtime-providers.ts:27` constrains to `"auto" | "low"`. OpenAI's semantic_vad documentation lists `"low"`, `"medium"`, `"auto"`, `"high"` as valid — needs verification that "high" works with the current `gpt-realtime-mini` model. A malformed value would silently fail or cause errors.

2. **Grok provider**: Grok uses `server_vad` (fixed threshold/silence-duration), not `semantic_vad`. High eagerness doesn't apply. The existing `supportsSemanticVAD()` guard handles this, but the UI should grey out this option for Grok collections.

3. **Session.update race conditions**: If eagerness changes fire simultaneously with Barbara guidance instruction updates, one may overwrite the other. The solution is to combine both in a single `session.update` when possible.

4. **No oscillation**: Once the system falls back from "high" to "auto" due to confusion, it should NOT attempt "high" again in the same session. Oscillating would create an inconsistent experience.

5. **Prompt instruction is a soft control**: LLMs don't always follow instructions precisely. The eagerness setting (VAD-level) is the reliable control; the prompt instruction is a best-effort complement, not a guarantee.

---

## Metrics Assessment

### What we already have (sufficient for measurement)

| Metric | Location | What it measures |
|--------|----------|-----------------|
| `avgTranscriptionLatencyMs` | `performance-metrics.ts:11` | speech_stopped → transcription complete |
| `avgResponseLatencyMs` | `performance-metrics.ts:12` | transcription complete → first audio delta |
| `maxTranscriptionLatencyMs` | `performance-metrics.ts:13` | Peak transcription latency |
| `maxResponseLatencyMs` | `performance-metrics.ts:14` | Peak response latency |
| `interrupted` flag | transcript entries (`voice-interview.ts:1644-1646`) | Alvia was speaking and respondent barged in |
| Barge-in detection | `voice-interview.ts:1620-1632` | Flushes Alvia speaking metrics when respondent interrupts |
| Short utterance streak | `transcription-quality.ts:340-358` | Consecutive respondent utterances < 3 words |
| `silenceSegments` (post_alvia) | `performance-metrics.ts:24-30` | Duration of silence after Alvia speaks (respondent thinking time) |
| `silenceSegments` (post_respondent) | Same | Duration of silence after respondent speaks (Alvia response delay) — **this is the key latency metric from the user's perspective** |

**Total perceived latency** = `transcriptionLatency + responseLatency` per turn. The `post_respondent` silence segments capture the same thing from a different angle (wall-clock silence between respondent stopping and Alvia starting).

### What we should add (one new metric)

**Rapid barge-in tracking**: When the respondent starts speaking within ~1500ms of Alvia starting audio output, this is a strong signal that Alvia responded prematurely (the respondent wasn't done). This is distinct from intentional interruptions, which typically happen later in Alvia's response.

```typescript
// New field on MetricsTracker
rapidBargeInCount: number;        // respondent interrupts Alvia within RAPID_BARGEIN_THRESHOLD_MS
totalBargeInCount: number;        // all barge-in events (existing, just needs counter)
recentRapidBargeIns: number;      // count in last N turns (for dynamic switching)
```

This gives us the confusion detection signal the dynamic switching needs.

---

## Technical Design

### 1. Collection-level configuration

Add a new field to the `collections` table:

```typescript
// shared/schema.ts
vadEagernessMode: text("vad_eagerness_mode").default("auto"),
// Valid values: "auto" (current default), "high" (experimental fast mode)
```

This allows per-collection opt-in and easy A/B testing across collections.

**UI**: Add a toggle/select in the collection creation/edit form, near the existing `voiceProvider` field. Only shown when voice provider is OpenAI (since Grok doesn't support semantic_vad eagerness).

### 2. Extended eagerness type

**File: `server/realtime-providers.ts`**

Extend the type from `"auto" | "low"` to `"auto" | "low" | "medium" | "high"`:

```typescript
// Line 26-28 — update interface
buildTurnDetectionUpdate(
  eagerness: "auto" | "low" | "medium" | "high",
): Record<string, any> | null;
```

Update `buildSessionConfig()` to accept initial eagerness from collection config instead of hardcoding `"auto"`.

### 3. Prompt instruction injection

**File: `server/voice-interview/instructions.ts`**

Add the eagerness-aware instruction early in the `INSTRUCTIONS:` block (as item 1, shifting existing items down) when eagerness mode is "high":

```
RESPONSE TIMING (IMPORTANT):
The voice detection is set to respond quickly, which means you may occasionally receive an
utterance that seems cut off or incomplete (e.g., ends mid-sentence, is unusually brief, or
trails off). When this happens, briefly acknowledge what was said and invite the respondent
to continue (e.g., "Go on...", "Please continue...", "Sorry, carry on with that thought")
rather than treating it as a complete answer.
```

This section is **conditionally included** based on the current eagerness state, and **removed** when the system falls back to "auto". The `buildInterviewInstructions()` function needs a new parameter: `eagernessMode: "auto" | "high"`.

**Placement**: Before the existing `INSTRUCTIONS:` section, as a standalone block. This gives it prominence consistent with the user's view that it's an important behavioural directive.

### 4. Dynamic switching: confusion detection

**File: `server/voice-interview.ts`** (or new module `server/voice-interview/eagerness.ts` if logic exceeds ~80 lines)

#### Trigger: Switch from "high" → "auto"

Detection criteria (all evaluated on `input_audio_buffer.speech_started` when Alvia is speaking):

```
IF eagernessMode is "high"
  AND respondent starts speaking within RAPID_BARGEIN_THRESHOLD_MS (1500ms) of Alvia's audio starting
  THEN increment rapidBargeInCount and recentRapidBargeIns

IF recentRapidBargeIns >= 3 in the last 6 respondent turns:
  → Switch to "auto" eagerness
  → Remove the RESPONSE TIMING instruction from prompt
  → Send combined session.update (turn_detection + instructions)
  → Set flag: eagernessDowngraded = true
  → Log the switch with session ID and turn count
```

The 1500ms threshold distinguishes premature responses (respondent wasn't done) from intentional barge-ins (respondent wants to redirect). The 3-in-6-turns window avoids reacting to isolated events.

#### No re-escalation in same session

Once `eagernessDowngraded = true`, do not switch back to "high" during this session. The goal is stability — one directional switch is enough.

#### Interaction with existing auto→low switching

The existing transcription quality system switches `auto` → `low` on short utterance streaks. These two systems should compose correctly:
- If collection starts at "high" and switches to "auto" (confusion), the transcription quality system can still further reduce to "low" if quality issues emerge.
- The eagerness hierarchy is: `high > auto > low`. Each system can only move downward.

### 5. New metrics tracking

**File: `server/voice-interview/types.ts`**

Add to `MetricsTracker`:

```typescript
eagernessTracking: {
  initialMode: "auto" | "high";
  currentMode: "auto" | "low" | "high";
  switchedAt: number | null;           // timestamp of switch (null if never switched)
  switchReason: string | null;         // e.g., "rapid_bargein_threshold"
  rapidBargeInCount: number;           // total rapid barge-ins in session
  totalBargeInCount: number;           // total barge-ins in session
  recentRapidBargeIns: number[];       // timestamps of recent rapid barge-ins (sliding window)
};
```

**File: `shared/types/performance-metrics.ts`**

Add to `RealtimePerformanceMetrics`:

```typescript
eagerness?: {
  initialMode: "auto" | "high";
  finalMode: "auto" | "low" | "high";
  switched: boolean;
  switchedAtTurn: number | null;
  rapidBargeInCount: number;
  totalBargeInCount: number;
};
```

This persists with the session, enabling comparison of latency metrics across sessions with different eagerness modes.

### 6. Combined session.update for atomicity

When switching eagerness mode, send a single `session.update` containing both turn detection AND instructions changes:

```typescript
function sendEagernessModeSwitch(
  state: InterviewState,
  sessionId: string,
  newMode: "auto" | "high",
): void {
  // 1. Update eagerness in turn_detection
  const vadUpdate = state.providerInstance.buildTurnDetectionUpdate(newMode);

  // 2. Rebuild instructions with/without the RESPONSE TIMING section
  const updatedInstructions = buildInterviewInstructions(
    state.template, currentQuestion, ...,
    /* eagernessMode */ newMode,
  );

  // 3. Merge into single session.update
  const combined = {
    ...vadUpdate,
    instructions: updatedInstructions,
  };

  state.providerWs.send(JSON.stringify({
    type: "session.update",
    session: combined,
  }));
}
```

### 7. Implementation scope by file

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `vadEagernessMode` column to `collections` |
| `shared/types/performance-metrics.ts` | Add `eagerness` field to `RealtimePerformanceMetrics` |
| `server/realtime-providers.ts` | Extend eagerness type to include "high"; accept initial eagerness in `buildSessionConfig()` |
| `server/voice-interview/types.ts` | Add `eagernessTracking` to `MetricsTracker`; add `eagernessMode` to `InterviewState` |
| `server/voice-interview/instructions.ts` | Add `eagernessMode` parameter; conditionally include RESPONSE TIMING block |
| `server/voice-interview.ts` | Wire up initial eagerness from collection config; add rapid barge-in detection on `speech_started`; add confusion-triggered mode switch; persist eagerness metrics at session end |
| `server/voice-interview/metrics.ts` | (optional) Extract eagerness detection logic if > 80 lines |
| `server/transcription-quality.ts` | Minor: ensure `shouldReduceVadEagerness` respects `eagernessMode` hierarchy |
| `server/routes/collections.routes.ts` | Accept `vadEagernessMode` in collection create/update |
| `server/storage.ts` | Include `vadEagernessMode` in collection queries |
| `client/src/pages/collection-new.tsx` | Add eagerness mode selector (OpenAI only) |
| `client/src/pages/interview.tsx` | Update VAD indicator to show "high" state |

---

## Verification & Testing

1. **Unit tests**: Add tests to `server/__tests__/` for:
   - Rapid barge-in detection thresholds
   - Confusion switching logic (3-in-6-turns trigger)
   - Instruction builder includes/excludes RESPONSE TIMING block based on mode
   - Eagerness hierarchy (high > auto > low, no upward movement)

2. **Manual testing protocol**:
   - Create two collections with same template: one with `vadEagernessMode: "auto"`, one with `"high"`
   - Conduct interviews on both; compare `post_respondent` silence segment durations and `avgResponseLatencyMs` + `avgTranscriptionLatencyMs`
   - In the "high" collection, deliberately speak in long sentences with natural pauses mid-sentence to test whether the RESPONSE TIMING instruction triggers graceful recovery
   - In the "high" collection, deliberately trigger rapid barge-ins to verify the fallback to "auto" fires

3. **Metrics comparison**: After several sessions, compare across the two collections:
   - Mean `post_respondent` silence duration (lower = less perceived latency)
   - Mean total latency (`transcription + response`)
   - Rapid barge-in rate (higher = eagerness too aggressive)
   - `interrupted` transcript entry count
   - Whether dynamic switching fired and at what turn count

4. **Edge cases to test**:
   - Grok provider: eagerness option should be hidden/ignored
   - Session reconnection: eagerness state should be restored correctly (existing `re-apply VAD eagerness` logic at line 1020-1046)
   - Concurrent Barbara guidance + eagerness switch: verify no race condition
