# Fix: Audio stops after planned WebSocket connection refresh

## Context

Users report Alvia stops speaking out loud ~15 minutes into an interview. This coincides with the planned WebSocket connection refresh (triggered at 13.5 min to avoid Railway's 15-min limit). The text transcript continues seamlessly, but audio playback stops until the user speaks again. The root cause is a client-side audio suppression flag that persists across the reconnection.

## Root Cause

When the `connection_refresh` message arrives, the client calls `stopAiPlayback()` (`interview.tsx:654`), which sets **two** independent suppression gates:

1. **`isRefreshSuppressAudioRef`** (`interview.tsx:655`) — a refresh-specific flag that gates `audio` messages at line 741. Cleared correctly in the `connected` handler at line 665.
2. **`suppressPlaybackRef`** (set by `stopAiPlayback()` in `use-audio-playback.ts:171`) — the barge-in suppression flag. Has a 10-second auto-clear timeout. This flag is normally cleared by `audio_done` (line 745) or `user_speaking_stopped` (line 830), but neither fires before the first post-refresh audio arrives.

The reconnection completes in ~1-2 seconds. The server auto-triggers Alvia's response via `response.create` and starts streaming audio chunks. When `playAudio()` (`use-audio-playback.ts:143`) is called, `suppressPlaybackRef.current` is still `true`, so all audio chunks from the first post-refresh response are **silently dropped**.

Audio eventually resumes when one of these happens:
- The `audio_done` message arrives at the end of that first response (clearing suppression — but all audio for that response was already lost)
- The 10-second timeout expires
- The user speaks, triggering `user_speaking_stopped` → `clearSuppression()`

This explains the reported behavior: Alvia goes silent after the refresh and only resumes when the user speaks.

## Fix

**File: `client/src/pages/interview.tsx`** (~lines 662-665)

Call `clearSuppression()` inside the **existing refresh-scoped guard** in the `connected` handler. The `isRefreshSuppressAudioRef.current` check at line 662 already gates this to planned-refresh reconnections only, so it won't affect normal reconnects or barge-in suppression:

```typescript
case "connected":
  // ... existing code ...
  if (isRefreshSuppressAudioRef.current) {
    console.log("[Interview] Clearing audio suppression after refresh reconnect");
    clearSuppression();  // <-- ADD: Clear barge-in suppression set by stopAiPlayback()
  }
  isRefreshSuppressAudioRef.current = false;
```

**Why this is safe:**
- The `clearSuppression()` call is gated behind `isRefreshSuppressAudioRef.current`, which is only `true` after a `connection_refresh` message — not during normal reconnects or barge-in flows
- At this point we have a fresh provider connection — there's no stale audio to suppress
- The generation counters (incremented by `stopAiPlayback()`) already protect against stale audio from the old connection
- `audio_done` (line 745) and `user_speaking_stopped` (line 830) continue to work normally for their respective flows

## Verification

1. `npm run check` — verify no type errors
2. `npx vitest` — run existing tests
3. Manual test: start a voice interview and either wait for the ~13.5 min refresh, or temporarily set env var `CONNECTION_REFRESH_MS=30000` (the constant is in `server/voice-interview/types.ts:347` and supports env override). Verify audio continues playing after reconnection without requiring the user to speak first.
