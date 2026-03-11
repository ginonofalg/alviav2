# Fix: Audio Clicking/Crackling During Alvia Speech

## Context

Users report a "regular phone line click every few seconds" during Alvia's speech. Occurs in both dev (Replit) and production (Railway), ruling out environment-specific causes. The issue is in the client-side audio playback pipeline in `client/src/hooks/use-audio-playback.ts`.

## Most Likely Causes (confirmed by implementation shape)

1. **Chunk boundary discontinuities** — Each chunk is a separate `AudioBufferSourceNode` connected directly to `audioContext.destination` with no gain envelope. If the last sample of chunk N and first sample of chunk N+1 don't align near zero, there's an audible click.

2. **Main-thread jitter from `onended` scheduling** — The current `onended → playNextChunk()` pattern starts the next chunk only after the prior one ends, driven by a main-thread callback. Any event loop delay creates a micro-gap between chunks. This is likely the "regular cadence" of clicks users hear.

3. **Abrupt `source.stop()` on barge-in** — Cuts audio mid-waveform with no fade-out, causing pops.

### Diagnostic step before implementation

Before implementing the fix, confirm the clicks originate in the playback pipeline and not in the PCM stream itself. Add a temporary diagnostic that silently accumulates boundary sample deltas in memory (last 4 samples of chunk N vs first 4 samples of chunk N+1) and dumps aggregate stats (max delta, mean delta, count of deltas > 0.01) to the console every 50 chunks or on playback completion. Do not log per-chunk — console output on every chunk perturbs main-thread timing and can itself introduce jitter. Additionally, dump a short received stream (~2s of consecutive chunks concatenated) to a WAV file via an `AudioBuffer` export and inspect it in Audacity to rule out server-side artifacts. Remove diagnostics before merge.

## Fix: Absolute-Time Scheduling with Per-Chunk Gain Envelopes

### File to modify
- `client/src/hooks/use-audio-playback.ts` (~140 lines → ~220 lines)

### New refs

```typescript
const masterGainRef = useRef<GainNode | null>(null);
const activeSourcesRef = useRef<Set<ActiveSource>>(new Set());
const nextStartTimeRef = useRef<number>(0);
const playbackGenerationRef = useRef<number>(0);
const drainGenerationRef = useRef<number>(0); // monotonic token to invalidate stale drains

type ActiveSource = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  generation: number;        // playback generation at time of scheduling
  scheduledStart: number;    // absolute time this source starts playing
  scheduledEnd: number;      // absolute time this source finishes
  fadeTime: number;          // fade duration used for this chunk
};
```

### Playback flow (replaces current `playNextChunk`)

1. **Decode PCM** (unchanged): base64 → Uint8Array → Int16Array → Float32Array
2. **Enqueue synchronously**: `audioQueueRef.current.push(float32Array)` — this is always synchronous. `playAudio()` itself never schedules audio directly.
3. **Trigger drain**: after enqueuing, call `drainQueue()`.

#### `drainQueue()` — drain-generation guarded loop

A bare `isDraining` boolean is race-prone: if `stopAiPlayback` fires while a prior `drainQueue` is awaiting `initAudioContext()`, resetting the boolean lets a second drain start and both can schedule from the same queue. Instead, each drain captures a monotonic drain generation token. After the async gap (`initAudioContext`), it checks whether the token is still current — if `stopAiPlayback` incremented it in the meantime, the stale drain exits cleanly.

```typescript
async function drainQueue() {
  const myDrain = ++drainGenerationRef.current;
  try {
    const audioContext = await initAudioContext();

    // If stopAiPlayback (or another drain) ran during the await, bail out
    if (myDrain !== drainGenerationRef.current) return;
    if (audioContext.state !== "running") return;

    // Guarantee at least one future chunk is always pre-scheduled
    // beyond the currently-playing one, then cap further scheduling
    // to avoid unbounded look-ahead.
    let scheduledThisPass = 0;
    while (audioQueueRef.current.length > 0) {
      // Re-check after each schedule in case stopAiPlayback ran
      if (myDrain !== drainGenerationRef.current) return;

      const now = audioContext.currentTime;
      const scheduleAhead = nextStartTimeRef.current - now;

      // Always allow scheduling the first chunk (ensures at least one
      // future chunk is queued). After that, cap at 200ms ahead.
      if (scheduledThisPass > 0 && scheduleAhead > 0.2) break;

      const chunk = audioQueueRef.current.shift()!;
      scheduleChunk(audioContext, chunk);
      scheduledThisPass++;
    }
  } catch (_e) {
    // initAudioContext failure — nothing to do
  }
}
```

The drain loop always schedules at least one chunk per pass, guaranteeing that a future chunk is pre-scheduled even when individual chunks exceed 200ms. After that first chunk, it caps further scheduling at 200ms ahead. When a scheduled chunk ends, its `onended` callback calls `drainQueue()` again to pull more from the queue. This eliminates the single-chunk-at-a-time failure mode for large chunks while still bounding look-ahead for barge-in cleanup.

#### `scheduleChunk(audioContext, chunk)`

1. **Guard zero-length and tiny chunks**: if `chunk.length === 0`, return immediately without scheduling. If `audioBuffer.duration < 0.001` (< 1ms), take the tiny-chunk fast path:
   - Set `overlap = 0` and `fadeTime = 0` explicitly
   - Set `chunkGain.gain.value = 1` (flat gain, no envelope automation)
   - Advance `nextStartTimeRef.current = when + audioBuffer.duration` (full duration, no overlap subtraction)
   - Store `fadeTime: 0` in the `ActiveSource` entry so the interruption path knows to skip envelope math
   - Skip steps 4–5 below and continue to step 6

   This avoids division-by-zero in the Safari fallback and prevents degenerate fade math on sub-millisecond fragments.
2. **Create buffer**: `audioContext.createBuffer(1, chunk.length, 24000)`
3. **Create per-chunk gain node**: `source → chunkGain → masterGain → destination`
4. **Schedule at absolute time**:
   - `const when = Math.max(audioContext.currentTime, nextStartTimeRef.current)`
   - `source.start(when)`
   - Overlap: `const overlap = Math.min(OVERLAP_CAP, audioBuffer.duration * 0.1)` where `OVERLAP_CAP` is provisionally `0.003` (3ms), to be validated by the diagnostic step. If observed chunk durations are consistently small (e.g. < 50ms), reduce the cap to 1–2ms before merging. Clamped to at most 10% of chunk duration to prevent compression of short chunks
   - `nextStartTimeRef.current = when + audioBuffer.duration - overlap`
5. **Apply per-chunk de-click envelope** (fade time is clamped to equal overlap so the entire fade region is covered by the adjacent chunk):
   - Fade time: `const fadeTime = overlap` — fade and overlap are always equal, guaranteeing no envelope gap or scheduling gap between adjacent chunks
   - Fade-in: `chunkGain.gain.setValueAtTime(0, when); chunkGain.gain.linearRampToValueAtTime(1, when + fadeTime)`
   - Fade-out: `chunkGain.gain.setValueAtTime(1, when + audioBuffer.duration - fadeTime); chunkGain.gain.linearRampToValueAtTime(0, when + audioBuffer.duration)`
6. **Clear any pending holdoff and mark speaking**:
   ```typescript
   if (speakingHoldoffRef.current) {
     clearTimeout(speakingHoldoffRef.current);
     speakingHoldoffRef.current = null;
   }
   setIsAiSpeaking(true);
   ```
7. **Track active source** with generation and start time:
   ```typescript
   const generation = playbackGenerationRef.current;
   const entry: ActiveSource = {
     source, gain: chunkGain, generation,
     scheduledStart: when,
     scheduledEnd: when + audioBuffer.duration,
     fadeTime,
   };
   activeSourcesRef.current.add(entry);
   ```
8. **Cleanup on end**: `source.onended` checks generation before acting:
   ```typescript
   source.onended = () => {
     activeSourcesRef.current.delete(entry);
     try { source.disconnect(); chunkGain.disconnect(); } catch (_e) {}

     // Ignore stale generations — a newer playback turn has started
     if (entry.generation !== playbackGenerationRef.current) return;

     // Try to drain more queued chunks
     drainQueue();

     // Check completion: no active sources from this generation and queue empty
     const hasActiveForGeneration = [...activeSourcesRef.current].some(
       s => s.generation === playbackGenerationRef.current
     );
     if (!hasActiveForGeneration && audioQueueRef.current.length === 0) {
       speakingHoldoffRef.current = setTimeout(() => {
         setIsAiSpeaking(false);
         speakingHoldoffRef.current = null;
       }, 150);
     }
   };
   ```
   The `onended` callback does NOT drive scheduling order — it only re-triggers `drainQueue()` to pull more chunks when the schedule-ahead buffer has room, and checks for completion. Because it checks `entry.generation !== playbackGenerationRef.current`, stale callbacks from a previous turn cannot flip `isAiSpeaking` false for a newer turn.

### De-click envelope via overlapping per-source gains

This is a de-click envelope, not a true equal-power crossfade. The goal is to eliminate boundary discontinuities, not to blend audio content. Since `fadeTime === overlap`, the envelope regions align exactly:

- Chunk N fades out over its last `fadeTime` ms
- Chunk N+1 fades in over its first `fadeTime` ms
- Both are playing simultaneously during the overlap window
- No shared gain node interference

Overlap is clamped to `Math.min(OVERLAP_CAP, audioBuffer.duration * 0.1)` so short chunks aren't over-compressed.

**Cumulative compression tradeoff**: every chunk advances `nextStartTimeRef` by `duration - overlap`, so the total utterance is shortened by `N * overlap`. The compression depends on real chunk sizes, which must be confirmed by the diagnostic step before finalizing `OVERLAP_CAP`:

- If chunks are ~100-200ms (expected for OpenAI Realtime): 3ms cap → ~200 chunks in 30s → ~600ms loss (2%), imperceptible for speech.
- If chunks are ~20-50ms: 3ms cap would be too aggressive (6-15%). Reduce `OVERLAP_CAP` to 1-2ms.
- If chunks are < 10ms: the 10% clamp dominates regardless of cap.

The `OVERLAP_CAP` constant should be set once based on observed data, then left fixed. The tradeoff is explicitly accepted: a small tempo increase is preferable to audible clicks.

### Interruption flow (replaces current `stopAiPlayback`)

1. **Increment generation**: `playbackGenerationRef.current++` — all scheduled `onended` callbacks with stale generation skip completion logic
2. **Invalidate any in-flight drain**: `drainGenerationRef.current++` — a `drainQueue()` that is currently awaiting `initAudioContext()` will see its token is stale and exit without scheduling
3. **Clear queue**: `audioQueueRef.current = []`
4. **Clear holdoff and set not speaking**: since stale `onended` callbacks will skip completion logic (generation mismatch), `stopAiPlayback` is responsible for clearing `isAiSpeaking`:
   ```typescript
   if (speakingHoldoffRef.current) {
     clearTimeout(speakingHoldoffRef.current);
     speakingHoldoffRef.current = null;
   }
   setIsAiSpeaking(false);
   ```
5. **Fade and stop active sources** using `cancelAndHoldAtTime` with Safari fallback. Read the audio context from `audioContextRef.current` — if null (playback was never initialized), skip this step since there are no active sources:
   ```typescript
   const audioContext = audioContextRef.current;
   if (!audioContext) return; // nothing to fade — playback never started
   const now = audioContext.currentTime;
   for (const entry of activeSourcesRef.current) {
     const { source, gain, scheduledStart, scheduledEnd, fadeTime } = entry;
     try {
       // Guard: if fadeTime is 0 (tiny chunk), skip envelope math and just stop
       if (fadeTime === 0) {
         source.stop(now + 0.001);
         continue;
       }
       if (typeof gain.gain.cancelAndHoldAtTime === 'function') {
         // Chrome/Firefox: freezes the automation value at `now`
         gain.gain.cancelAndHoldAtTime(now);
       } else {
         // Safari fallback: compute current envelope value from metadata
         // across all four phases: pre-start, fade-in, sustain, fade-out
         const fadeInEnd = scheduledStart + fadeTime;
         const fadeOutStart = scheduledEnd - fadeTime;
         let currentValue: number;
         if (now < scheduledStart) {
           currentValue = 0; // not started yet
         } else if (now < fadeInEnd) {
           // Linear interpolation within fade-in ramp
           currentValue = (now - scheduledStart) / fadeTime;
         } else if (now < fadeOutStart) {
           currentValue = 1; // sustain region
         } else if (now < scheduledEnd) {
           // Linear interpolation within fade-out ramp
           currentValue = 1 - (now - fadeOutStart) / fadeTime;
         } else {
           currentValue = 0; // past the end
         }
         gain.gain.cancelScheduledValues(now);
         gain.gain.setValueAtTime(Math.max(0, Math.min(1, currentValue)), now);
       }
       gain.gain.linearRampToValueAtTime(0, now + 0.01); // 10ms fade-out
       source.stop(now + 0.015); // stop after fade completes
     } catch (_e) {}
   }
   activeSourcesRef.current.clear();
   ```
6. **Reset scheduling**: `nextStartTimeRef.current = 0`
7. **Set suppression** (existing logic, keeps 10s timeout)

### Completion / `isAiSpeaking` state

Two paths set `isAiSpeaking(false)`:

1. **Natural completion**: `onended` fires for the last active source of the current generation AND queue is empty → 150ms holdoff → `setIsAiSpeaking(false)`. Generation check prevents stale callbacks from corrupting state.
2. **Interruption**: `stopAiPlayback` immediately clears any pending holdoff and calls `setIsAiSpeaking(false)`. This is necessary because stale `onended` callbacks (from the old generation) will skip completion logic by design.

`scheduleChunk` always clears any pending `speakingHoldoffRef` timeout before calling `setIsAiSpeaking(true)`. This prevents a stale holdoff from a previous utterance flipping the flag false mid-playback of a new response.

No longer driven by recursive `onended` chain.

### AudioContext and master gain setup

In `initAudioContext`:
```typescript
if (!masterGainRef.current) {
  masterGainRef.current = audioContext.createGain();
  masterGainRef.current.connect(audioContext.destination);
}
```

### Timing derivation

Always derive chunk duration from `audioBuffer.duration` (not `chunk.length / 24000`) to stay correct regardless of internal resampling.

### Teardown on unmount

The existing `useEffect` cleanup only clears `speakingHoldoffRef`. With the new architecture, unmount/route-change cleanup must be comprehensive:

```typescript
useEffect(() => {
  return () => {
    // Clear timers
    if (speakingHoldoffRef.current) {
      clearTimeout(speakingHoldoffRef.current);
      speakingHoldoffRef.current = null;
    }
    if (suppressTimeoutRef.current) {
      clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = null;
    }

    // Stop and disconnect all active sources
    for (const { source, gain } of activeSourcesRef.current) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch (_e) {}
    }
    activeSourcesRef.current.clear();

    // Disconnect master gain
    if (masterGainRef.current) {
      try { masterGainRef.current.disconnect(); } catch (_e) {}
      masterGainRef.current = null;
    }

    // Reset timing and state refs — increment drain generation to
    // invalidate any in-flight drain that may resolve after unmount
    nextStartTimeRef.current = 0;
    drainGenerationRef.current++;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };
}, []);
```

## Verification

### Manual testing

1. `npm run check` — type check passes
2. `npm run dev` — dev server starts
3. **Long uninterrupted response**: Let Alvia speak a full answer (~30s+). Confirm no regular clicks. Test with browser DevTools Performance tab open (CPU busy).
4. **Single barge-in**: Interrupt Alvia mid-speech, confirm no pop/click on cutoff.
5. **Rapid repeated barge-ins**: Speak-stop-speak-stop rapidly 5+ times, confirm no audio artifacts or state corruption.
6. **Queue underrun logging**: Add temporary `console.warn` when `nextStartTimeRef.current < audioContext.currentTime` at scheduling time (indicates a gap). Verify this doesn't fire during normal playback. Remove before merge or gate behind a debug flag.
7. **Browser coverage**: Test in Chrome and Safari (Web Audio timing behavior differs). Specifically verify the `cancelAndHoldAtTime` / Safari fallback path.

### Unit tests (Vitest)

Extract the following as pure functions into a `client/src/lib/audio-scheduling.ts` module and add Vitest coverage:

1. **`computeOverlap(chunkDuration: number, overlapCap?: number): number`** — returns `Math.min(overlapCap ?? OVERLAP_CAP, chunkDuration * 0.1)`. Test: overlap never exceeds the cap; short chunks (10ms) get 1ms; very short chunks (1ms) get 0.1ms; returns 0 for duration <= 0.

2. **`computeFadeTime(chunkDuration: number): number`** — since fade time equals overlap, this is identical to `computeOverlap`. Exported separately for clarity. Test: always equals `computeOverlap` for any input.

3. **`computeCurrentEnvelopeValue(now: number, scheduledStart: number, scheduledEnd: number, fadeTime: number): number`** — the Safari fallback interpolation across all four phases. Test: returns 0 before scheduledStart; linearly ramps 0→1 during fade-in; returns 1 in sustain region; linearly ramps 1→0 during fade-out; returns 0 past scheduledEnd; clamps to [0, 1]; returns 0 when fadeTime is 0 (tiny-chunk guard — caller should skip envelope math, but function is safe regardless).

4. **`shouldDrainMore(nextStartTime: number, currentTime: number, maxAhead: number, scheduledThisPass: number): boolean`** — schedule-ahead cap check. Test: always returns true when scheduledThisPass === 0 (guarantee at least one); returns true when ahead < maxAhead; returns false when scheduledThisPass > 0 and ahead >= maxAhead.

5. **Generation-safe completion logic**: test that a completion checker correctly ignores entries with mismatched generation and only fires completion when all same-generation sources are done and queue is empty.

These are pure functions with no Web Audio dependencies, so they run in Node without mocking.
