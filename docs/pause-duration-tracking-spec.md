# Specification: Pause Duration Tracking for Accurate Silence Metrics

## Summary

The current silence metrics conflate two distinct types of non-speech time:

1. **Paused time** — Interview intentionally paused by respondent, no audio streaming, no cost
2. **Active silence** — Interview running but no speech, audio streaming to OpenAI, incurring cost

This makes the metrics misleading for VAD optimization analysis. A session showing "77% silence" may actually have only "50% active silence" with the rest being pause time.

---

## Problem Statement

### Current Behavior

When a user pauses the interview:

**Client side:**
- `stopAudioCapture()` called — microphone stops
- No audio frames sent to server
- No cost incurred during pause

**Server side:**
- `state.isPaused = true`
- OpenAI WebSocket remains open (idle)
- Session status updated to "paused"
- **No duration tracking of pause period**

When the user resumes:
- `state.isPaused = false`
- Alvia immediately responds with a welcome-back message
- Session continues

### The Metrics Gap

The derived `silenceMs` is calculated as:

```typescript
silenceMs = sessionDurationMs - respondentSpeakingMs - alviaSpeakingMs
```

This includes pause time because:
- `sessionDurationMs` = total wall-clock time from start to end (includes pauses)
- `respondentSpeakingMs` = only actual speech time
- `alviaSpeakingMs` = only Alvia audio time

**Result:** Pause time is counted as "silence" even though no audio was streamed.

### Evidence from Production Data

Session `3ab4d5db-bfd8-4c9f-aab9-4c552bc70e8a`:

| Metric | Value |
|--------|-------|
| Session duration | 481,049 ms (8 min) |
| Derived silence | 370,186 ms (6.2 min) |
| Sum of silence segments | 243,301 ms (4 min) |
| **Unaccounted gap** | **126,885 ms (2.1 min)** |

The 2.1-minute gap corresponds to pause time that:
- Is included in derived `silenceMs`
- Is NOT captured in individual silence segments
- Did NOT incur streaming costs

### Why Silence Segments Miss Pause Time

The silence segment tracking records gaps between speech events. During pause:

1. Last event before pause: `speech_stopped` at time T1
2. User pauses — no events fire
3. User resumes — Alvia immediately speaks (welcome-back)
4. `response.audio.delta` fires, recording segment from T1 to now

However, the resume handler triggers Alvia's response synchronously, which can reset tracking state before the segment is properly attributed. Additionally, the segment gets recorded as `post_respondent` context rather than a distinct `paused` context.

---

## Goals

- Track cumulative pause duration separately from active session time
- Calculate accurate "active silence" (silence during streaming) vs "paused time" (no streaming)
- Preserve existing silence segment tracking without modification
- Enable accurate cost analysis for VAD optimization

## Non-goals

- Changing pause/resume UX behavior
- Modifying how silence segments are recorded
- Tracking individual pause/resume events (only cumulative duration needed)

---

## Implementation

### 1. Add Tracking Fields

**In `server/voice-interview.ts`, extend `InterviewState` interface (around line 40):**

```typescript
interface InterviewState {
  // ... existing fields ...

  // Pause duration tracking
  pauseStartedAt: number | null;      // Timestamp when current pause began
  totalPauseDurationMs: number;        // Cumulative pause time
}
```

**Initialize in state creation (around line 656):**

```typescript
const state: InterviewState = {
  // ... existing fields ...
  pauseStartedAt: null,
  totalPauseDurationMs: 0,
};
```

### 2. Track Pause Start

**In `pause_interview` handler (around line 1713), add after `state.isPaused = true`:**

```typescript
case "pause_interview":
  state.lastActivityAt = Date.now();
  state.terminationWarned = false;
  state.isPaused = true;

  // Track pause start time
  state.pauseStartedAt = Date.now();

  // ... rest of existing logic (speakingStartTime handling, persist, etc.)
```

### 3. Track Pause End and Accumulate Duration

**In `resume_interview` handler (around line 1739), add before `state.isPaused = false`:**

```typescript
case "resume_interview":
  state.lastActivityAt = Date.now();
  state.terminationWarned = false;

  // Accumulate pause duration before clearing
  if (state.pauseStartedAt) {
    const pauseDuration = Date.now() - state.pauseStartedAt;
    state.totalPauseDurationMs += pauseDuration;
    console.log(
      `[VoiceInterview] Pause duration: ${pauseDuration}ms, total paused: ${state.totalPauseDurationMs}ms`
    );
    state.pauseStartedAt = null;
  }

  state.isPaused = false;
  // ... rest of existing logic
```

### 4. Handle Edge Case: Session Ends While Paused

**In `finalizeAndPersistMetrics` (around line 1836), add pause handling:**

```typescript
async function finalizeAndPersistMetrics(sessionId: string): Promise<void> {
  const state = sessions.get(sessionId);
  if (!state) return;

  const tracker = state.metricsTracker;
  const now = Date.now();

  // If session ends while paused, accumulate final pause duration
  if (state.pauseStartedAt) {
    const finalPauseDuration = now - state.pauseStartedAt;
    state.totalPauseDurationMs += finalPauseDuration;
    state.pauseStartedAt = null;
  }

  const sessionDurationMs = now - state.createdAt;
  // ... rest of existing logic
```

### 5. Update Metrics Schema

**In `shared/schema.ts`, extend `SpeakingTimeMetrics` type (around line 438):**

```typescript
export type SpeakingTimeMetrics = {
  respondentSpeakingMs: number;
  alviaSpeakingMs: number;
  silenceMs: number;                    // Keep for backwards compatibility (total non-speech)
  respondentTurnCount: number;
  alviaTurnCount: number;
  silenceSegments: SilenceSegment[];
  silenceStats: { /* ... existing ... */ } | null;

  // New fields for accurate analysis
  totalPauseDurationMs: number;         // Time spent paused (not streaming)
  activeSilenceMs: number;              // Silence during active streaming
  activeSessionDurationMs: number;      // Session duration minus pause time
};
```

### 6. Calculate and Persist New Metrics

**In `finalizeAndPersistMetrics`, update the metrics object construction:**

```typescript
// Calculate active (non-paused) metrics
const totalPauseDurationMs = state.totalPauseDurationMs;
const activeSessionDurationMs = sessionDurationMs - totalPauseDurationMs;
const activeSilenceMs = Math.max(
  0,
  activeSessionDurationMs - respondentSpeakingMs - tracker.alviaSpeaking.totalMs
);

const metrics: RealtimePerformanceMetrics = {
  sessionId,
  recordedAt: now,
  tokenUsage: { /* ... existing ... */ },
  latency: { /* ... existing ... */ },
  speakingTime: {
    respondentSpeakingMs,
    alviaSpeakingMs,
    silenceMs,                          // Total (includes pause) - kept for compatibility
    respondentTurnCount,
    alviaTurnCount,
    silenceSegments: tracker.silenceTracking.segments,
    silenceStats,
    // New fields
    totalPauseDurationMs,
    activeSilenceMs,
    activeSessionDurationMs,
  },
  sessionDurationMs,
  openaiConnectionCount: state.openaiConnectionCount,
  terminationReason,
};
```

### 7. Update Console Logging

**Add to the metrics summary log in `finalizeAndPersistMetrics`:**

```typescript
console.log(`[Session ${sessionId}] Performance summary:`, {
  duration: `${(sessionDurationMs / 1000).toFixed(1)}s`,
  activeDuration: `${(activeSessionDurationMs / 1000).toFixed(1)}s`,
  totalPaused: `${(totalPauseDurationMs / 1000).toFixed(1)}s`,
  respondentSpeaking: `${(respondentSpeakingMs / 1000).toFixed(1)}s`,
  alviaSpeaking: `${(tracker.alviaSpeaking.totalMs / 1000).toFixed(1)}s`,
  activeSilence: `${(activeSilenceMs / 1000).toFixed(1)}s`,
  activeSilencePercent: `${((activeSilenceMs / activeSessionDurationMs) * 100).toFixed(1)}%`,
});
```

---

## Persistence Consideration

If the interview is restored from a crash/disconnect while paused, ensure `totalPauseDurationMs` is persisted and restored.

**In `persistInterviewState` calls, include:**

```typescript
await storage.persistInterviewState(sessionId, {
  // ... existing fields ...
  totalPauseDurationMs: state.totalPauseDurationMs,
});
```

**In state restoration (around line 620-660), restore the value:**

```typescript
totalPauseDurationMs: existingSession.totalPauseDurationMs || 0,
```

**Note:** Check if `totalPauseDurationMs` needs to be added to the database schema or if it can be stored in an existing JSONB field (e.g., `questionStates` or a new field).

---

## API Response Update

**Update the `/api/sessions/:sessionId/metrics` endpoint response** to include the new fields. No code change needed if it returns the full `performanceMetrics` object, but verify the response includes:

```json
{
  "speakingTime": {
    "silenceMs": 370186,
    "totalPauseDurationMs": 126885,
    "activeSilenceMs": 243301,
    "activeSessionDurationMs": 354164
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/voice-interview.ts` | Add `pauseStartedAt` and `totalPauseDurationMs` to state; update pause/resume handlers; update `finalizeAndPersistMetrics` |
| `shared/schema.ts` | Extend `SpeakingTimeMetrics` type with new fields |
| `server/storage.ts` | (If needed) Persist `totalPauseDurationMs` for crash recovery |

---

## Testing

### Manual Verification

1. Start an interview
2. Speak briefly, then pause for exactly 30 seconds (use a timer)
3. Resume and complete the interview
4. Check metrics:
   - `totalPauseDurationMs` should be ~30,000ms
   - `activeSilenceMs` should be less than `silenceMs` by ~30,000ms
   - Console log should show accurate breakdown

### Edge Cases

1. **Multiple pauses:** Pause/resume several times, verify cumulative tracking
2. **End while paused:** Click "End Interview" while paused, verify final pause duration captured
3. **Session timeout while paused:** Let heartbeat timeout occur during pause, verify cleanup handles pause state
4. **Crash recovery:** Pause, simulate disconnect, reconnect, verify pause duration persisted

### Validation Query

```sql
SELECT
  id,
  (performance_metrics->'speakingTime'->'silenceMs')::int as total_silence,
  (performance_metrics->'speakingTime'->'totalPauseDurationMs')::int as paused,
  (performance_metrics->'speakingTime'->'activeSilenceMs')::int as active_silence,
  (performance_metrics->'speakingTime'->'activeSessionDurationMs')::int as active_duration
FROM interview_sessions
WHERE performance_metrics IS NOT NULL
ORDER BY completed_at DESC
LIMIT 10;
```

Verify: `total_silence ≈ paused + active_silence` (may have small rounding differences)

---

## Acceptance Criteria

- [ ] Pause start time is recorded when user pauses
- [ ] Pause duration is accumulated on resume
- [ ] Final pause duration is captured if session ends while paused
- [ ] `totalPauseDurationMs` is persisted in performance metrics
- [ ] `activeSilenceMs` accurately reflects silence during active streaming only
- [ ] `activeSessionDurationMs` excludes pause time
- [ ] Console logging shows accurate breakdown
- [ ] Existing `silenceMs` field preserved for backwards compatibility
- [ ] Multiple pause/resume cycles accumulate correctly

---

## Impact on VAD Analysis

With this fix, the VAD optimization analysis can accurately determine:

| Metric | Use Case |
|--------|----------|
| `activeSilenceMs` | Actual billable silence that VAD could eliminate |
| `activeSessionDurationMs` | True interview duration for percentage calculations |
| `activeSilenceMs / activeSessionDurationMs` | Accurate "silence ratio" for cost modeling |

For the session analyzed earlier, the corrected metrics would show:

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| Silence % | 77% | ~52% |
| Billable silence | 6.2 min | ~4 min |

This provides accurate data for tuning VAD thresholds and projecting cost savings.
