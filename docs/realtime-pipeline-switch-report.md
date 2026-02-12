# Realtime Pipeline Switch Report (as of February 12, 2026)

## Executive Summary
- Gemini Live is the most viable "third provider" for your current architecture. It supports bidirectional low-latency audio, transcription streams, and tool calling, but its protocol is not OpenAI-compatible, so you need a dedicated adapter layer.
- ElevenLabs Conversational AI is not a drop-in replacement for your current OpenAI/Grok-style orchestration. It is better treated as a separate interview mode unless you accept feature differences.
- ElevenLabs STT+TTS (modular) can preserve your behavior, but it is the highest engineering effort because you must own turn-taking, response orchestration, and latency management end-to-end.

## Current Coupling Points In Your Code
- Provider type is hardcoded to two values in `server/realtime-providers.ts:3`.
- Provider query validation is hardcoded in `server/voice-interview.ts:367`.
- `voice-interview.ts` assumes OpenAI-compatible realtime events (`response.audio.delta`, `conversation.item.input_audio_transcription.completed`, etc.) in `server/voice-interview.ts:1225`.
- Frequent runtime instruction/VAD updates rely on `session.update` in `server/voice-interview.ts:998` and `server/voice-interview.ts:1908`.
- Client captures/sends fixed 24k PCM in `client/src/pages/interview.tsx:961`; playback is also fixed 24k in `client/src/hooks/use-audio-playback.ts:17`.
- UI/provider config currently restricts to OpenAI/Grok in `client/src/pages/collection-new.tsx:45`, `client/src/pages/collection-detail.tsx:112`, and `server/routes/collections.routes.ts:91`.
- Metrics naming is provider-biased (`openaiConnectionCount`) in `server/voice-interview/types.ts:290` and `shared/types/performance-metrics.ts:77`.
- LLM provider enum already includes `gemini` (`shared/schema.ts:35`) but not `elevenlabs`.

## Gemini Live: What Is Needed
- Gemini Live API uses a different message model (`setup`, `clientContent`/`realtimeInput`, server `serverContent`/transcription/tool messages), not OpenAI Realtime event names.
- Google docs indicate setup/config behavior differs from OpenAI-style mutable `session.update`; your current Barbara guidance model needs adaptation.
- Session lifecycle constraints differ (duration/resumption behavior), so reconnect logic in `voice-interview.ts` needs a provider-specific implementation.
- Required changes:
- Add a Gemini pipeline adapter that normalizes Gemini events into your internal event contract.
- Move provider-specific WS event parsing out of `voice-interview.ts` into separate modules.
- Replace reliance on live `session.update` with "orchestrator turns" where needed.
- Add provider capability flags (supports dynamic instruction updates, VAD tuning, usage granularity, etc.).
- Effort: medium-high (roughly 1.5-3 weeks for parity-level integration, depending on test depth).

## ElevenLabs: What Is Needed

### Path A: ElevenLabs Conversational AI WebSocket (Agent)
- ElevenLabs has a dedicated conversational websocket with its own event model (`user_audio_chunk`, `user_transcript`, `agent_response`, `audio`, `interruption`, etc.).
- This is an "agent-first" architecture; your current Barbara-driven, per-question instruction updates and AQ/session-summary flow are harder to map exactly.
- Inference: this path is best if you accept behavior differences or run it as a separate mode, not strict parity.

### Path B: ElevenLabs Modular (STT + TTS + your own LLM/orchestrator)
- Use ElevenLabs realtime STT + websocket TTS while keeping Barbara + question control in your backend.
- Best for preserving your existing behavior, but highest complexity (you own full turn manager, interruption handling, and latency stitching).
- You will likely need to extend usage/billing model if you want ElevenLabs costs tracked similarly to token-based providers.

## Switchable Architecture Recommendation (Keep New Code Separate)
- Keep `voice-interview.ts` as orchestration coordinator only.
- Introduce `server/voice-interview/pipelines/` with isolated adapters:
- `openai-grok.pipeline.ts` (wrap current behavior)
- `gemini-live.pipeline.ts`
- `elevenlabs-agent.pipeline.ts` or `elevenlabs-modular.pipeline.ts`
- `pipeline-types.ts` (normalized event contract + capability flags)
- `pipeline-factory.ts`
- `voice-interview.ts` should consume normalized events only; no provider-specific event names inside it.
- Add provider capability fallbacks:
- If no dynamic config updates: inject orchestration as explicit turns.
- If no usage fields: log `missing_usage` status (already supported by usage schema patterns).
- Keep default provider unchanged (`openai`) and rollout new providers behind feature flags/allowlists.

## Minimal File Impact Map
- Must change:
- `server/realtime-providers.ts:3`
- `server/voice-interview.ts:367`
- `client/src/pages/collection-new.tsx:45`
- `client/src/pages/collection-detail.tsx:112`
- `server/routes/collections.routes.ts:91`
- Should refactor for isolation:
- `server/voice-interview.ts:1225`
- `server/voice-interview.ts:2180`
- Should generalize naming:
- `server/voice-interview/types.ts:290`
- `shared/types/performance-metrics.ts:77`
- Optional schema migration:
- Add `elevenlabs` to `llm_provider` enum if you want first-class usage attribution alongside OpenAI/xAI/Gemini.

## Recommended Execution Order
1. Build normalized pipeline interface + move current OpenAI/Grok path behind it (no behavior change).
2. Add Gemini adapter and reach parity.
3. Decide ElevenLabs path:
4. If strict parity required: modular STT+TTS path.
5. If separate product mode acceptable: Conversational AI agent path.

## Sources
- Google Gemini Live API: https://ai.google.dev/api/live
- Gemini Live guide: https://ai.google.dev/gemini-api/docs/live-guide
- Gemini Live sessions/resumption: https://ai.google.dev/gemini-api/docs/live-session
- Gemini Live tools/function calling: https://ai.google.dev/gemini-api/docs/live-tools
- ElevenLabs Conversational AI WebSocket: https://docs.elevenlabs.io/docs/conversational-ai/api-reference/conversational-ai/websocket
- ElevenLabs client events: https://docs.elevenlabs.io/docs/conversational-ai/customization/events/client-events
- ElevenLabs server events: https://docs.elevenlabs.io/docs/conversational-ai/customization/events/server-events
- ElevenLabs conversation init data: https://docs.elevenlabs.io/docs/conversational-ai/customization/events/conversation-initiation-client-data
- ElevenLabs realtime STT: https://docs.elevenlabs.io/docs/cookbooks/speech-to-text/real-time-transcription
- ElevenLabs websocket TTS: https://docs.elevenlabs.io/docs/websockets

No code changes were made in this step; this is a research + architecture report.
