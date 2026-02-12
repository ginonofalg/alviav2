# Realtime Voice Pipeline: ElevenLabs & Gemini Live Integration Report

## Context

Alvia currently uses OpenAI Realtime API (`gpt-realtime-mini`) and xAI Grok (`grok-3-fast`) for voice interviews, abstracted behind a `RealtimeProvider` interface in `server/realtime-providers.ts`. The 4,200-line `server/voice-interview.ts` consumes this interface but also hard-codes OpenAI-compatible WebSocket event names throughout its event handler (e.g. `response.audio.delta`, `input_audio_buffer.append`, `conversation.item.input_audio_transcription.completed`).

The goal is to enable switching to **ElevenLabs Conversational AI** or **Google Gemini Live API** as alternative pipelines, without affecting existing OpenAI/Grok functionality.

---

## 1. Current Architecture Summary

### RealtimeProvider Interface (`server/realtime-providers.ts`)
The interface abstracts **configuration** but not **event handling**:

```typescript
interface RealtimeProvider {
  name, displayName
  getWebSocketUrl(), getWebSocketHeaders()
  buildSessionConfig(instructions)      // Full session config
  buildInstructionsUpdate(instructions)  // Lightweight prompt update
  buildTurnDetectionUpdate(eagerness)    // VAD tuning (null if unsupported)
  buildTextOnlySessionConfig(instructions)
  buildResponseCreate(), buildTextOnlyResponseCreate()
  parseTokenUsage(event)                 // Extract token counts from events
  getModelName(), getTranscriptionModelName(), getSampleRate()
  supportsSemanticVAD(), supportsNoiseReduction()
}
```

### How voice-interview.ts Uses It
- **Outbound messages** use the provider interface: `buildSessionConfig()`, `buildResponseCreate()`, etc.
- **Inbound event handling** is hard-coded with OpenAI-compatible event names in a large switch statement (~500 lines), with `case` fallthrough for OpenAI vs Grok naming differences (e.g. `response.audio.delta` / `response.output_audio.delta`).
- **Audio transport**: PCM16 base64 at 24kHz mono, both directions.
- **Barbara integration**: After each user transcript, Barbara analyzes asynchronously and injects guidance via `conversation.item.create` with `input_text` role before the next `response.create`.

### Key Coupling Points in voice-interview.ts
1. **Event name switch** (lines ~1215-1800): Handles ~15 distinct provider event types
2. **Outbound message construction**: `input_audio_buffer.append`, `input_audio_buffer.commit`, `input_audio_buffer.clear`, `conversation.item.create`, `session.update`
3. **Transcript extraction**: Parses `conversation.item.input_audio_transcription.completed` events
4. **Token usage parsing**: Reads `response.done` events with OpenAI-format `usage` objects
5. **VAD events**: `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`

---

## 2. ElevenLabs Conversational AI

### Architecture
ElevenLabs uses a **modular STT -> LLM -> TTS pipeline**, not an integrated speech-to-speech model. This is a fundamentally different architecture from OpenAI/Grok.

- **STT**: Scribe v2 Realtime (built-in, ~30-80ms latency)
- **LLM**: Multi-provider (Claude, GPT, Gemini, custom OpenAI-compatible endpoints)
- **TTS**: ElevenLabs proprietary voices (5,000+ available, cloning supported)

### WebSocket Protocol

**Connection**: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id={agent_id}`
- Auth: `xi-api-key` header, or single-use token as query parameter
- Requires pre-created "agent" in ElevenLabs dashboard or via API

**Server -> Client events**:
| Event | Purpose |
|-------|---------|
| `conversation_initiation_metadata` | Session established, returns `conversation_id` |
| `audio` | AI speech audio chunk (base64 PCM, with `event_id`) |
| `agent_response` | AI text response |
| `user_transcript` | Transcribed user speech |
| `interruption` | User interrupted AI (barge-in) |
| `vad_score` | Real-time VAD confidence score |
| `agent_response_correction` | Corrections to prior agent response |
| `client_tool_call` | Request to execute client-side tool |

**Client -> Server events**:
| Event | Purpose |
|-------|---------|
| `user_audio_chunk` | Stream user audio (base64 PCM) |
| `user_transcript` | Send text as if user spoke it |
| `contextual_update` | Inject runtime context/variables |
| Ping/pong | Keepalive |

### Audio Format
- **Input**: PCM16, 16kHz default (24kHz on Pro+ plans)
- **Output**: PCM16 base64 chunks with sequential `event_id`
- **Difference from current**: Default sample rate is 16kHz not 24kHz; resampling may be needed unless 24kHz is explicitly configured

### Key Differences from OpenAI/Grok

| Aspect | Impact on Integration |
|--------|----------------------|
| **Agent-based config** | Must pre-create an "agent" with system prompt, voice, LLM choice; or use runtime overrides |
| **No `response.create` equivalent** | Turn management is automatic - LLM responds after VAD detects speech end |
| **No `input_audio_buffer` abstraction** | Audio streamed directly via `user_audio_chunk`, no explicit commit/clear cycle |
| **No `conversation.item.create`** | Barbara guidance must use `contextual_update` or `user_transcript` (text injection) |
| **No explicit `session.update`** | Instructions set at connection time via agent config or overrides |
| **Different transcript flow** | User transcripts arrive as `user_transcript` events (not tied to audio buffer completion) |
| **Minutes-based billing** | No per-token tracking; usage is per-minute of conversation time |
| **Modular pipeline** | LLM is configurable (can use Claude, GPT, etc.) but adds latency hops |

### Barbara Integration Challenge
Barbara currently injects guidance by adding a `conversation.item.create` message to the provider's conversation before triggering `response.create`. With ElevenLabs:
- `contextual_update` can inject key-value context but it's less flexible than injecting free-form text into the conversation
- `user_transcript` (text mode) could inject guidance as if a user said it, but this pollutes the conversation
- The most viable approach: configure ElevenLabs agent to use a custom OpenAI-compatible LLM endpoint that wraps your own server, allowing you to inject Barbara guidance into the prompt before forwarding to the real LLM. This is complex but gives full control.
- Alternative: Use ElevenLabs "server tools" to call back to your server for guidance

### Feasibility Assessment
| Factor | Rating | Notes |
|--------|--------|-------|
| Audio compatibility | Medium | 16kHz default vs 24kHz; resampling or plan upgrade needed |
| Event mapping | Hard | Completely different event model, no direct mapping |
| Barbara guidance | Hard | No equivalent to `conversation.item.create`; requires workarounds |
| VAD/turn detection | Medium | Automatic, less controllable than OpenAI semantic VAD |
| Token tracking | Hard | Minutes-based billing; no per-call token breakdown for your usage tracking system |
| Voice quality | Easy | Excellent TTS with massive voice library |
| Interruption support | Easy | Native support with `interruption` event |

---

## 3. Google Gemini Live API

### Architecture
Gemini Live uses an **integrated native audio model** (similar to OpenAI), where Gemini directly processes and generates audio. The model understands tone, emotion, and acoustic nuances.

### WebSocket Protocol

**Connection**: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`
- Auth: API key as query parameter, OAuth bearer token, or ephemeral token
- Configuration sent as first `setup` message (not via URL or headers)

**Client -> Server messages**:
| Message | Purpose |
|---------|---------|
| `setup` | First message: model, voice, system instructions, VAD config, transcription toggles |
| `realtimeInput` | Audio chunks (`audio/pcm` base64) and/or video frames |
| `clientContent` | Text input, context injection, system prompt updates |
| `toolResponse` | Return results from function calls |
| `audioStreamEnd` | Signal pause in audio stream (flush buffer) |
| `activityStart` / `activityEnd` | Manual VAD (if automatic disabled) |

**Server -> Client messages**:
| Message | Purpose |
|---------|---------|
| `setupComplete` | Configuration accepted |
| `serverContent` | AI response: text parts and/or `inlineData` audio parts (base64 PCM) |
| `inputTranscription` | User speech transcription (with `isFinal` flag) |
| `outputTranscription` | AI speech transcription (with `isFinal` flag) |
| `toolCall` | Request to execute function |
| `usageMetadata` | Token counts (input, output, cached) per response |
| `sessionResumptionUpdate` | Token for session recovery |
| `goAway` | Server-initiated disconnect warning |

### Audio Format
- **Input**: PCM16, **16kHz**, mono
- **Output**: PCM16, **24kHz**, mono
- **Asymmetric rates**: Input is 16kHz, output is 24kHz. Client must resample captured 24kHz audio down to 16kHz before sending, or capture at 16kHz natively.

### Key Differences from OpenAI/Grok

| Aspect | Impact on Integration |
|--------|----------------------|
| **Setup-based config** | All config in first `setup` message, not `session.update` |
| **No `response.create`** | Responses triggered automatically by VAD or `turnComplete: true` in `clientContent` |
| **No `input_audio_buffer`** | Audio sent directly in `realtimeInput.mediaChunks`, no commit/clear cycle |
| **Asymmetric sample rates** | Input 16kHz / Output 24kHz requires resampling logic |
| **`clientContent` for guidance** | Can inject system-role messages mid-conversation (closest to Barbara's `conversation.item.create`) |
| **Session time limits** | 15 min audio-only, 2 min with video; `contextWindowCompression` extends this |
| **Native transcription** | Separate `inputTranscription` / `outputTranscription` messages (not tied to audio events) |
| **Affective dialogue** | Model understands tone/emotion from audio natively |
| **Session resumption** | Built-in via `sessionResumptionUpdate` tokens (24-hour window) |
| **Token-based billing** | 25 tokens/second for audio; `usageMetadata` on every response |

### Barbara Integration
Gemini's `clientContent` with `role: "system"` is the closest equivalent to OpenAI's `conversation.item.create`:
```json
{
  "clientContent": {
    "turns": [{ "role": "system", "parts": [{ "text": "Barbara guidance here..." }] }],
    "turnComplete": false
  }
}
```
This is a reasonably good fit. Guidance is injected between turns and influences the next response. The main difference is that there's no explicit `response.create` - responses are triggered by VAD detecting the user finished speaking, so guidance must be injected promptly after user transcript is received.

### Feasibility Assessment
| Factor | Rating | Notes |
|--------|--------|-------|
| Audio compatibility | Medium | Input must be 16kHz (resampling needed); output is 24kHz (compatible) |
| Event mapping | Medium | Different event model but conceptually similar (setup, content, transcription) |
| Barbara guidance | Good | `clientContent` with system role is a natural fit |
| VAD/turn detection | Good | Configurable thresholds, automatic or manual modes |
| Token tracking | Good | `usageMetadata` provides input/output token counts per response |
| Voice quality | Good | 30+ HD voices, native audio model with emotion understanding |
| Interruption support | Good | Native support, improved in Gemini 2.5 |
| Session duration | Concern | 15-minute limit requires `contextWindowCompression` for longer interviews |

---

## 4. Head-to-Head Comparison

| Capability | OpenAI (current) | Grok (current) | ElevenLabs | Gemini Live |
|------------|-------------------|-----------------|------------|-------------|
| **Architecture** | Integrated speech-to-speech | Integrated (OpenAI-compatible) | Modular STT+LLM+TTS | Integrated native audio |
| **Audio In/Out** | 24kHz / 24kHz | 24kHz / 24kHz | 16kHz* / varies | 16kHz / 24kHz |
| **VAD** | Semantic (tunable) | Server-based (fixed) | Scribe v2 (auto) | Configurable thresholds |
| **Transcription** | gpt-4o-mini-transcribe | whisper-large-v3 | Scribe v2 (built-in) | Native (built-in) |
| **Barbara guidance** | `conversation.item.create` | Same | `contextual_update` (limited) | `clientContent` system role (good) |
| **Explicit response trigger** | `response.create` | Same | Automatic only | Automatic (or `turnComplete`) |
| **Voices** | ~10 preset | ~5 preset | 5,000+ (clone/design) | 30+ HD |
| **LLM flexibility** | OpenAI only | xAI only | Any (Claude, GPT, Gemini, custom) | Gemini only |
| **Token tracking** | Per-token with audio/text split | Same format | Per-minute (no token detail) | Per-token (25 tok/sec audio) |
| **Session limits** | None | None | None | 15 min (extendable) |
| **Barge-in** | Native | Native | Native | Native |
| **Protocol compatibility** | Baseline | ~95% compatible | Completely different | Completely different |

*ElevenLabs supports 24kHz on Pro+ plans

---

## 5. Implementation Strategy

### Why the Current Provider Interface Is Insufficient

The `RealtimeProvider` interface only abstracts **outbound configuration**. The real complexity is in **inbound event handling** - the 500+ line switch statement in `voice-interview.ts` that parses provider events and drives interview state transitions. ElevenLabs and Gemini use entirely different event models that cannot be mapped with simple `case` fallthrough.

### Recommended Approach: Event Normalization Layer

Create a **new abstraction layer** that sits between the raw provider WebSocket and `voice-interview.ts`, normalizing all provider-specific events into a common internal event format. This keeps provider-specific code completely separate from the interview logic.

#### New File Structure
```
server/
  realtime-providers.ts              # Existing (unchanged, keep OpenAI/Grok)
  realtime-providers/
    types.ts                         # New unified event types + extended provider interface
    event-normalizer.ts              # Maps provider events -> normalized events
    elevenlabs-provider.ts           # ElevenLabs RealtimeProvider implementation
    gemini-provider.ts               # Gemini Live RealtimeProvider implementation
    elevenlabs-connection.ts         # ElevenLabs WebSocket lifecycle + event translation
    gemini-connection.ts             # Gemini WebSocket lifecycle + event translation
    audio-resampler.ts               # PCM16 24kHz <-> 16kHz resampling utility
```

#### Extended Interface (in `types.ts`)
The current `RealtimeProvider` interface would be extended with methods to handle the fundamental protocol differences:

```typescript
// Normalized events that voice-interview.ts would consume
type NormalizedEvent =
  | { type: 'session_ready' }
  | { type: 'audio_delta'; delta: string }            // base64 PCM16 24kHz
  | { type: 'audio_done' }
  | { type: 'ai_transcript_delta'; delta: string }
  | { type: 'ai_transcript_done'; transcript: string }
  | { type: 'user_transcript'; transcript: string; usage?: TokenUsageDetails }
  | { type: 'user_speech_started' }
  | { type: 'user_speech_stopped' }
  | { type: 'response_done'; usage?: TokenUsageDetails }
  | { type: 'error'; code: string; message: string }

// Extended provider interface for connection lifecycle
interface RealtimeConnection {
  provider: RealtimeProvider;
  connect(): Promise<void>;
  disconnect(): void;
  sendAudio(base64Pcm16_24kHz: string): void;   // Resamples internally if needed
  commitAudio(): void;                            // No-op for providers without buffer model
  clearAudio(): void;                             // No-op for providers without buffer model
  injectContext(text: string, role: 'user' | 'system'): void;  // Barbara guidance
  triggerResponse(): void;                        // No-op for auto-response providers
  updateInstructions(instructions: string): void;
  updateVadEagerness(eagerness: 'auto' | 'low'): void;
  onEvent(handler: (event: NormalizedEvent) => void): void;
  isConnected(): boolean;
}
```

This way, `voice-interview.ts` would consume `NormalizedEvent` objects instead of raw provider JSON, and call `RealtimeConnection` methods instead of constructing provider-specific messages.

### Audio Resampling
Both ElevenLabs (default) and Gemini require **16kHz input**. The client currently captures and sends at 24kHz. Two options:

1. **Server-side resampling** (recommended): Resample 24kHz -> 16kHz in `audio-resampler.ts` before forwarding to provider. Keeps client unchanged.
2. **Client-side**: Have the client negotiate sample rate at connection time. More efficient but requires client changes.

For output, Gemini sends 24kHz (compatible), ElevenLabs varies but can be configured.

### Barbara Guidance Injection
| Provider | Method | Quality |
|----------|--------|---------|
| OpenAI/Grok | `conversation.item.create` with `input_text` | Excellent - direct conversation injection |
| Gemini | `clientContent` with `role: "system"` | Good - system-level injection between turns |
| ElevenLabs | `contextual_update` with key-value pairs | Limited - structured data only, not free-form guidance |

For ElevenLabs, Barbara's rich guidance text would need to be restructured into key-value context variables, which loses nuance. Alternatively, a custom LLM proxy endpoint could intercept ElevenLabs' LLM calls and inject Barbara guidance into the prompt - but this adds significant complexity.

### Session Duration (Gemini)
Gemini Live has a 15-minute session limit. For interviews that may run longer:
- Enable `contextWindowCompression` in setup to auto-prune old context
- Implement session continuation: when `goAway` is received, capture the `sessionResumptionUpdate` handle, reconnect, and resume
- This is a meaningful complication that needs careful handling

### LLM Usage Tracking Adaptation
- **Gemini**: `usageMetadata` provides `inputTokenCount` / `outputTokenCount` per response. Audio is 25 tokens/second. Compatible with existing `llmUsageEvents` tracking.
- **ElevenLabs**: Per-minute billing with no token-level detail. Would need a different tracking approach - log conversation duration and estimated cost rather than tokens. The `llmUsageEvents` schema would need a new billing model or the ElevenLabs entries would have zero tokens with a `durationMs` field instead.

---

## 6. Estimated Scope of Changes

### New Files (~1,500-2,000 lines total)
| File | Lines | Purpose |
|------|-------|---------|
| `server/realtime-providers/types.ts` | ~100 | NormalizedEvent, RealtimeConnection interface |
| `server/realtime-providers/audio-resampler.ts` | ~80 | PCM16 24kHz <-> 16kHz linear interpolation |
| `server/realtime-providers/gemini-provider.ts` | ~120 | Gemini RealtimeProvider implementation |
| `server/realtime-providers/gemini-connection.ts` | ~350 | Gemini WebSocket lifecycle + event translation |
| `server/realtime-providers/elevenlabs-provider.ts` | ~120 | ElevenLabs RealtimeProvider implementation |
| `server/realtime-providers/elevenlabs-connection.ts` | ~350 | ElevenLabs WebSocket + event translation |
| `server/realtime-providers/openai-connection.ts` | ~300 | Wrap existing OpenAI/Grok into RealtimeConnection |

### Modified Files
| File | Change | Impact |
|------|--------|--------|
| `server/realtime-providers.ts` | Add `"elevenlabs"` and `"gemini"` to `RealtimeProviderType` union, add to factory function | Small (~30 lines) |
| `server/voice-interview.ts` | Refactor event handler to consume `NormalizedEvent` instead of raw JSON; use `RealtimeConnection` for outbound messages | Large refactor of the event switch (~500 lines touched) but no behavioral change |
| `shared/schema.ts` | Add `"elevenlabs"` and `"gemini"` to `llmProviderEnum` | Tiny |
| `shared/types/llm-usage.ts` | Add new use cases or duration-based tracking fields | Small |
| `server/llm-usage.ts` | Handle duration-based billing for ElevenLabs | Small |

### Environment Variables (new)
- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ELEVENLABS_AGENT_ID` - Pre-configured agent ID
- `GEMINI_REALTIME_API_KEY` - Gemini API key (may reuse existing `GEMINI_API_KEY`)

---

## 7. Risk Assessment & Recommendations

### High Risks
1. **voice-interview.ts refactor** (4,200 lines): Introducing the normalization layer requires touching the event handler extensively. Even though behavior shouldn't change, regression risk is high. Thorough testing with OpenAI/Grok after refactor is critical.
2. **ElevenLabs Barbara integration**: No good equivalent for free-form guidance injection. May result in degraded interview quality compared to OpenAI/Grok.
3. **Gemini 15-minute session limit**: Interviews can exceed this. Session continuation logic adds complexity and risk of dropped context.

### Medium Risks
4. **Audio resampling quality**: Linear interpolation for 24kHz -> 16kHz may introduce artifacts. Should test with actual interview audio.
5. **ElevenLabs agent pre-configuration**: Requires creating/managing agents via API, adding an external dependency to the setup flow.
6. **Different turn-taking behavior**: OpenAI/Grok use explicit `response.create`; ElevenLabs and Gemini trigger responses automatically on VAD endpoint. This means Barbara guidance must be injected faster (before the auto-response triggers).

### Recommendation

**Start with Gemini Live** rather than ElevenLabs:
- Gemini's `clientContent` system role provides a natural Barbara guidance injection path
- Token-based billing aligns with existing tracking infrastructure
- Integrated native audio model (like OpenAI) means similar conversation quality expectations
- 24kHz output matches current client expectations
- Only input resampling needed (24kHz -> 16kHz)

ElevenLabs is better suited as a second phase, and may work best for use cases where Barbara guidance is less critical (e.g., simple structured surveys where question flow is rigid).

---

## 8. Verification Plan

1. **Unit tests**: Add tests for audio resampler, event normalizers (Gemini and ElevenLabs event -> NormalizedEvent mapping)
2. **Regression test**: After refactoring voice-interview.ts to use NormalizedEvent, run a full interview with OpenAI provider and verify identical behavior (transcripts, Barbara guidance, AQ phase, session summary)
3. **Integration test (Gemini)**: Run end-to-end interview with Gemini provider, verify:
   - Audio plays correctly on client (24kHz output)
   - User speech transcribed accurately
   - Barbara guidance influences AI responses
   - Barge-in works
   - Session handles 15-minute limit gracefully
4. **Integration test (ElevenLabs)**: Same as above but with attention to:
   - Guidance injection quality via `contextual_update`
   - Audio quality at configured sample rate
   - Usage tracking with duration-based model
