# OpenAI vs Grok Realtime Implementation: Functional Difference Analysis

## Context

Recent development has focused on the OpenAI realtime pipeline. The Grok (xAI) provider has not been tested for parity. This analysis identifies every functional difference between the two implementations to assess what may be broken or degraded when running Grok interviews.

---

## 1. Provider Abstraction — Well Designed, No Issues

The `RealtimeProvider` interface in `server/realtime-providers.ts` cleanly abstracts both providers. All calls in `voice-interview.ts` go through this interface — there are no hardcoded provider checks in the core interview logic (with one minor exception for session summary model naming).

**Both providers share**: 24kHz sample rate, PCM audio, `session.update` message format, OpenAI-compatible event names (`response.done`, `input_audio_buffer.speech_started`, etc.).

---

## 2. Functional Differences (By Design)

These are known, intentional capability gaps handled by the abstraction layer:

| Feature | OpenAI | Grok | Impact |
|---------|--------|------|--------|
| VAD type | `semantic_vad` (NLU-based) | `server_vad` (threshold-based) | Grok may cut off speakers mid-thought more often |
| Dynamic VAD eagerness | Adjustable (`auto`/`low`) | Fixed (returns `null`) | Grok cannot reduce VAD sensitivity on quality degradation |
| Noise reduction | `near_field` built-in | Not supported | Grok users must manage noisy environments manually |
| Transcription model | `gpt-4o-mini-transcribe` | `whisper-large-v3` | Different accuracy/latency profiles |
| Voice | `marin` | `Ara` | Cosmetic only |
| Transcription prompt | Punctuation normalization hint | None | Grok transcripts may have inconsistent punctuation |

**Key implication**: When `transcription-quality.ts` detects quality issues and sets `vadEagernessReduced = true`, the subsequent call to `adjustVadEagerness()` in `voice-interview.ts:1891-1908` is a **no-op for Grok** (early return on `supportsSemanticVAD() === false`). Grok interviews cannot self-heal in noisy environments the way OpenAI interviews can.

---

## 3. Structural Config Differences (Handled by Abstraction)

These are significant protocol differences that are correctly handled by `realtime-providers.ts` but worth documenting:

- **OpenAI** wraps session config in `{ type: "realtime", ... }` with nested `audio.input/output` structure, `output_modalities`
- **Grok** uses flat config with `modalities`, `input_audio_format: "pcm16"`, `voice` at top level
- Both are sent via `{ type: "session.update", session: <config> }` — the abstraction handles the internal shape

**Event name compatibility**: The code handles dual event names (e.g., `response.audio.delta` / `response.output_audio.delta`) throughout `voice-interview.ts:1281-1360`. xAI's API is OpenAI-compatible, so these events should work. However, **this has not been verified against the current xAI API version** — if xAI only emits one variant, the other case branch is dead code (harmless but unverified).

---

## 4. Potential Issues (Require Verification)

### 4a. Grok `session.update` with `buildInstructionsUpdate()` — Untested Format

`voice-interview.ts` sends `session.update` messages in 4 places (lines 1870, 2124, 2563, 3218) using `buildInstructionsUpdate()`. For Grok, this produces:

```json
{ "type": "session.update", "session": { "instructions": "..." } }
```

For OpenAI, it produces:

```json
{ "type": "session.update", "session": { "type": "realtime", "instructions": "..." } }
```

**Risk**: If xAI's API rejects partial session updates or requires the full config shape (modalities, voice, etc.), Barbara guidance injection and question transitions would silently fail for Grok. This is the **highest-risk area** since it affects core interview flow.

### 4b. Grok Token Usage Parsing — Defensive but Unverified

`GrokRealtimeProvider.parseTokenUsage()` (line 267-286) assumes xAI returns OpenAI-compatible `response.usage` with `input_tokens`, `output_tokens`, and detailed breakdowns. If xAI doesn't provide audio/text token split details, the metrics would silently zero out (no crash, but inaccurate billing data).

### 4c. `conversation.item.create` Messages for AQ Phase

The AQ (additional questions) flow in `voice-interview.ts` sends `conversation.item.create` messages to inject question text (line ~3223). If Grok doesn't support this message type, AQ would break silently.

### 4d. `response.cancel` Messages

The code sends `response.cancel` in several places (barge-in handling, question transitions). If Grok doesn't support this, interrupted responses may continue playing.

---

## 5. Cosmetic / Naming Issues

- **`openaiConnectionCount`** in `server/voice-interview/types.ts:290`, `metrics.ts:39`, and `shared/types/performance-metrics.ts:77` — misleading name when using Grok. Should be `providerConnectionCount`. This is a data modeling issue, not a functional bug.

---

## 6. Barbara Orchestrator — Not a Grok Issue

Barbara (`server/barbara-orchestrator.ts`) is hardcoded to OpenAI text models (gpt-5-mini, gpt-4o, etc.) for all 8 use cases. This is **by design** — Barbara is the orchestration layer, separate from the voice provider. When using Grok for voice, Barbara still uses OpenAI for analysis/guidance. This is correct and expected.

---

## 7. Summary of Risk Levels

| Issue | Risk | Functional Impact |
|-------|------|-------------------|
| **4a. Partial `session.update` format** | **HIGH** | Barbara guidance, question transitions, AQ instructions could silently fail |
| **4c. `conversation.item.create` support** | **HIGH** | AQ phase could break entirely |
| **4d. `response.cancel` support** | **MEDIUM** | Barge-in and question transitions may have audio artifacts |
| **4b. Token usage format** | **LOW** | Metrics/billing may be inaccurate |
| No VAD tuning on quality degradation | **LOW** | By design — Grok can't self-heal in noisy environments |
| `openaiConnectionCount` naming | **COSMETIC** | Misleading metrics field name |

---

## 8. Recommended Verification Steps

1. **Manual test**: Run a Grok interview end-to-end with Barbara guidance enabled. Verify:
   - Session config is accepted (check server logs for xAI errors)
   - Instructions updates work (Barbara guidance appears in Alvia's responses)
   - Question transitions work (new instructions applied per question)
   - AQ phase works (if configured with `maxAdditionalQuestions > 0`)
   - Barge-in works (interrupt Alvia mid-speech)
   - Token usage is tracked (check `llmUsageEvents` table)

2. **Add xAI event logging**: Temporarily log all raw events from the Grok WebSocket to verify which event name variants xAI sends (old-style vs new-style).

3. **Rename `openaiConnectionCount`** → `providerConnectionCount` across:
   - `server/voice-interview/types.ts:290`
   - `server/voice-interview/metrics.ts:39`
   - `server/voice-interview.ts:958, 3618`
   - `shared/types/performance-metrics.ts:77`
