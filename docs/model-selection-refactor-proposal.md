# Alvia Model Selection Refactor Proposal

_Read-only analysis. No code changes made._

## Executive summary

Alvia should move from a provider-level choice (`openai` vs `grok`) to a model-level choice within OpenAI only.

Recommendations:

1. Replace `voiceProvider` on Collections with a `realtimeModel` override.
2. Remove Grok from the Collection UI and from the voice interview runtime path.
3. Make the server, not the browser, the source of truth for which model is used.
4. Keep a global default model config, but make per-Collection selection override it.
5. Fix usage tracking so it records the actual model used for each interview session.

### Model drift in the current codebase

The repo already has model drift across four locations:

| Location | Model string used |
|----------|------------------|
| `OPENAI_REALTIME_URL` in `.replit` | `gpt-realtime-1.5` |
| `OpenAIRealtimeProvider.getModelName()` | `gpt-realtime-mini` |
| `OpenAIRealtimeProvider.getWebSocketUrl()` fallback | `gpt-realtime-mini` |
| Session summary metadata in `voice-interview.ts` | `gpt-4o-mini-realtime` |

The platform has the plumbing to track model-by-session (usage events store `provider` and `model`, rollups aggregate `byModel`), but the current voice path does **not** reliably record the actual model in use.

> **Important:** Verify that `gpt-realtime-1.5` is the canonical OpenAI API model identifier and not a placeholder or alias. OpenAI's model naming conventions have changed before. If the canonical name differs, update all references in this proposal accordingly.

---

## Current state found in the repo

### 1. Collection config is still provider-shaped

**Relevant files:**

- `shared/schema.ts` — `collections.voiceProvider` is a text field with default `"openai"`
- `server/routes/collections.routes.ts` — update schema still accepts `z.enum(["openai", "grok"])`
- `client/src/pages/collection-new.tsx`
- `client/src/pages/collection-detail.tsx`

**Current UI state:**

- Collection create/edit forms define `voiceProvider: "openai" | "grok"`
- The select is currently **disabled**, so the UI already behaves as if provider choice is being phased out

There is an internal note in `unused-fields-log.md` confirming `voiceProvider` is stored but not actually read by `voice-interview.ts`.

### 2. The browser currently influences provider selection

**Relevant files:**

- `client/src/pages/interview.tsx` (line ~480)
- `server/voice-interview.ts` (lines ~392–623)

**Current runtime flow:**

1. The client reads `collection.voiceProvider`
2. It opens `/ws/interview?...&provider=${voiceProvider}`
3. The WebSocket server accepts `provider` from the query string
4. If that is missing, it falls back to `REALTIME_PROVIDER` env var

The Collection field is not the authoritative source of truth on the server. The browser is effectively choosing the provider/model path. Model resolution should happen server-side from persisted config.

### 3. Global default currently exists, but indirectly

**Relevant files:**

- `server/realtime-providers.ts` (lines 57–59)
- `server/llm-config.ts` (lines 5–15)
- `.replit` (line 51)

**Current behaviour:**

- OpenAI Realtime URL is taken from `OPENAI_REALTIME_URL`
- The code fallback is `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini`
- `.replit` sets `OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5"`

There is already a global default mechanism, but it is embedded inside a full URL env var rather than represented as a dedicated model config.

### 4. Token tracking schema is good, but the voice runtime reports the wrong model

**Relevant files:**

- `shared/schema.ts` — `llm_usage_events` includes `sessionId`, `provider`, `model`
- `server/voice-interview/usage-recording.ts` (line ~46)
- `server/llm-usage.ts`
- `server/storage.ts`

**What works:**

- Usage events are already tracked at session level
- Each usage event stores `provider` and `model`
- Rollups already aggregate `byModel`

**What's broken:**

- `recordRealtimeResponseUsage()` records `state.providerInstance.getModelName()`
- For OpenAI, `getModelName()` is hard-coded to `gpt-realtime-mini`
- But the actual connection URL may be using `gpt-realtime-1.5` via `OPENAI_REALTIME_URL`
- Session summary metadata in `voice-interview.ts` (lines ~4298, ~4317) writes yet another string: `gpt-4o-mini-realtime`

Net result: there is no single source of truth for the active voice model.

---

## Proposal

### 1. Fine-grained model selection

#### Proposed product behaviour

Replace the Collection-level `Voice Provider` concept with `Interview Model`.

Allowed options (enum values):

- `gpt-realtime-1.5` — full / higher-quality model
- `gpt-realtime-mini` — lite / lower-cost model

These are the canonical model identifiers already in use in the production codebase. Use these strings exactly — everywhere in schema, UI, config, and tracking.

#### Proposed data model

Add a new Collection column:

- `realtimeModel` — **nullable enum** (`"gpt-realtime-1.5" | "gpt-realtime-mini"`)

Semantics:

- `null` = use global default
- Explicit value = override global default for this Collection

Use an enum, not free text. There are exactly two valid values. A text field invites the exact model string drift this refactor is fixing. Adding new models in future requires a migration — that's a feature, not a bug; it forces verification that the new model actually works.

Nullable is better than mandatory because it preserves a real global default mechanism instead of copying the default into every Collection row.

#### Session-level model snapshot

Add a new session column:

- `interview_sessions.realtimeModelUsed` — **non-nullable text**, backfilled for existing sessions with the global default value

This column is required, not optional. It is the single source of truth for every downstream consumer: usage tracking, session metadata, cost reporting, debugging. Without it, the refactor doesn't deliver on its core promise.

Optionally add `interview_sessions.realtimeProviderUsed` — will always be `openai` after this change, so low priority.

#### Proposed runtime resolution order

At session creation or WebSocket initialisation, resolve the model as:

1. `collection.realtimeModel` if set
2. `OPENAI_REALTIME_DEFAULT_MODEL` env var if set
3. Hardcoded fallback: `gpt-realtime-mini`

Store the resolved value on the session row and on in-memory session state. Reuse that same value everywhere during the session lifecycle — including on connection refresh.

#### Why this matters

This gives one canonical model value for:

- Opening the Realtime connection
- Usage tracking (`llm_usage_events.model`)
- Session summary metadata shown in the UI
- Connection refresh at ~13.5 min
- Debugging and future cost reporting

---

### 2. Remove Grok

This should be explicit and hard, not just a UI hide.

#### Product decision

Remove Grok from Alvia voice interviews due to data privacy and data residency concerns.

#### Recommended implementation scope

- Remove Grok from Collection create/edit schemas and UI
- Remove Grok from the browser WebSocket query path
- Stop accepting `provider=grok` for interview sessions
- Stop using `REALTIME_PROVIDER` env var to switch interview providers
- Pin the interview voice path to OpenAI only

#### Important migration note

Do **not** waste time trying to fully rip out every historical xAI reference in one pass.

For example:

- `llm_usage_events.provider` includes `xai` in its enum
- Historical rows may already exist with `provider = "xai"`

That is fine. Historical data can remain readable. The important thing is to prevent any new Grok-backed interview sessions after deployment.

#### Out of scope

- `server/simulation/` — uses text-based LLM, not realtime voice. No changes needed and should not be touched in this pass.

---

### 3. Cost surfacing to users

Keep this minimal for this pass.

#### Recommended UX

Replace the disabled provider select with a simple radio group:

- **Full model** (`gpt-realtime-1.5`) — Best quality. Better handling of nuance and longer conversational context.
- **Mini model** (`gpt-realtime-mini`) — Lower cost. Good default for high-volume research or shorter interviews.

No cost badges, no pricing estimates. Researchers can't make informed cost decisions from qualitative labels alone. Save the cost estimation UI for when actual per-interview cost data is available from usage rollups.

#### For a later pass

Once usage data is reliable:

- Take average token mix from recent completed sessions
- Apply pricing by model
- Show a rough "expected cost per interview" or "cost for N target responses"

---

### 4. Token tracking fixes

#### Current problem

Usage tracking does **not** guarantee model accuracy for voice interviews because the reported model is hard-coded in the provider class and can drift from the model embedded in `OPENAI_REALTIME_URL`.

#### Required change

Make usage tracking use the resolved session model, not a hard-coded provider constant.

Concretely:

- Resolve the actual voice model once per session (per the 3-tier resolution above)
- Store it on `interview_sessions.realtimeModelUsed` and on in-memory session state
- Use that same value when recording `alvia_realtime` usage events
- Use that same value when writing session summary metadata shown in the UI

Transcription can continue to record its own explicit transcription model separately (`gpt-4o-mini-transcribe`).

#### Priority

**Must-have** for this refactor. Without accurate model tracking, the model selection and cost surfacing work is untrustworthy.

---

### 5. Global default and URL construction

#### The design problem

Currently `OPENAI_REALTIME_URL` embeds both the endpoint and the model in one string (`wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5`). Once model selection is per-Collection, these must be separated.

#### Recommended approach

Introduce two env vars:

| Variable | Purpose | Example value |
|----------|---------|---------------|
| `OPENAI_REALTIME_BASE_URL` | Endpoint only (no model param) | `wss://api.openai.com/v1/realtime` |
| `OPENAI_REALTIME_DEFAULT_MODEL` | Default model when Collection has no override | `gpt-realtime-1.5` |

`getWebSocketUrl(resolvedModel)` constructs the connection URL as:

```
{OPENAI_REALTIME_BASE_URL}?model={resolvedModel}
```

Where `resolvedModel` is the per-session resolved value from the 3-tier resolution order.

#### EU data residency

This design preserves EU data residency support. For EU deployments:

```bash
OPENAI_REALTIME_BASE_URL=wss://eu.api.openai.com/v1/realtime
OPENAI_REALTIME_DEFAULT_MODEL=gpt-realtime-1.5
```

The base URL controls the endpoint region. The model controls the model. They are independent, which is the correct separation.

#### Legacy backward compatibility

`OPENAI_REALTIME_URL` (legacy full URL) should be treated as a deprecated override:

- If set, log a deprecation warning at startup
- Honour it as a full URL override for backward compatibility
- Do **not** parse the model out of the URL — that's fragile
- Document migration: operators should set `OPENAI_REALTIME_BASE_URL` + `OPENAI_REALTIME_DEFAULT_MODEL` and remove `OPENAI_REALTIME_URL`

#### Resolution order (full)

1. `collection.realtimeModel` if set → use this model
2. `OPENAI_REALTIME_DEFAULT_MODEL` env var if set → use this model
3. Hardcoded fallback: `gpt-realtime-mini`

URL construction:

1. If legacy `OPENAI_REALTIME_URL` is set → use it as-is (full URL, deprecated path)
2. Otherwise → `{OPENAI_REALTIME_BASE_URL || "wss://api.openai.com/v1/realtime"}?model={resolvedModel}`

---

## Implementation touchpoints

### Schema / persistence

- **`shared/schema.ts`**
  - Add `collections.realtimeModel` as nullable enum (`"gpt-realtime-1.5" | "gpt-realtime-mini"`)
  - Add `interview_sessions.realtimeModelUsed` as non-nullable text with a default value
- **Migration:**
  - `realtimeModel` added as nullable (null = use global default)
  - `voiceProvider` column left in place but stop reading it — drop in a follow-up migration after confirming no queries reference it
  - Existing Collections: `realtimeModel = null` (will resolve to global default at runtime)
  - Existing sessions: backfill `realtimeModelUsed` with the current global default value
  - In-flight sessions during deployment: safe — they continue using the model from the existing WebSocket connection; new sessions pick up the new resolution logic

### Collection API + setup flows

- `server/routes/collections.routes.ts` — accept `realtimeModel` in create/update schemas
- `server/routes/admin-setup.routes.ts` — support `realtimeModel` in quick-setup
- `scripts/clone-project-for-user.ts` — copy `realtimeModel` when cloning

### Collection UI

- `client/src/pages/collection-new.tsx` — replace disabled provider select with model radio group
- `client/src/pages/collection-detail.tsx` — same replacement in edit dialog

### Interview runtime

- **`client/src/pages/interview.tsx`**
  - Stop sending `provider` as a query parameter
  - The server resolves the model; the client should not influence model selection
- **`server/voice-interview.ts`**
  - Resolve model server-side from collection config / env var / default
  - Store resolved model on session state at session start
  - Write `realtimeModelUsed` to the session row
  - Use `realtimeModelUsed` for session summary metadata (replace hard-coded `gpt-4o-mini-realtime`)
- **`server/realtime-providers.ts`**
  - `OpenAIRealtimeProvider` should accept the resolved model as a constructor parameter or via `getWebSocketUrl(model)`
  - Remove or rename `getModelName()` — it should not return a hard-coded value. Either remove it entirely (callers use the resolved model from session state) or rename to `getDefaultModelName()` to make the semantics clear during transition
  - Update `getWebSocketUrl()` to construct URL from base + model
- **`server/voice-interview/connection-refresh.ts`**
  - Creates new WebSocket connections at ~13.5 min intervals
  - **Must use the same resolved model as the original connection** — read from stored session state, do not re-resolve

### Config validation

- **`server/llm-config.ts`**
  - Currently validates `OPENAI_REALTIME_URL` (checks `wss://`, warns if `model=` is missing)
  - Update to validate `OPENAI_REALTIME_BASE_URL` and `OPENAI_REALTIME_DEFAULT_MODEL`
  - Log deprecation warning if legacy `OPENAI_REALTIME_URL` is still set
  - Validate that `OPENAI_REALTIME_DEFAULT_MODEL` is one of the allowed enum values

### Usage tracking / session metadata

- **`server/voice-interview/usage-recording.ts`** — use `state.realtimeModelUsed` instead of `state.providerInstance.getModelName()`
- **`server/voice-interview.ts`** — use `state.realtimeModelUsed` for session summary metadata
- **`server/llm-usage.ts`** — probably needs little or no structural change

---

## Cutover recommendation

Keep this refactor tight.

### Good scope for this pass

- OpenAI-only interview path
- Collection model selector with two options (radio group)
- Global default model config (`OPENAI_REALTIME_BASE_URL` + `OPENAI_REALTIME_DEFAULT_MODEL`)
- Server-authoritative model resolution (3-tier)
- Non-nullable `realtimeModelUsed` on sessions
- Correct usage tracking using resolved model
- Correct session summary metadata
- Connection refresh using stored model

### Avoid in this pass

- Broad cleanup of every historical xAI reference in the repo
- Redesigning the whole provider abstraction
- Building a full cost calculator or cost estimation UI
- Dropping the `voiceProvider` column (do this in a follow-up)

---

## Acceptance criteria

1. Researchers can choose the interview model per Collection (`gpt-realtime-1.5` or `gpt-realtime-mini`).
2. Grok is no longer available anywhere in Collection setup or interview runtime.
3. The browser cannot override the interview model by query parameter.
4. If a Collection has no explicit override, the global default model (`OPENAI_REALTIME_DEFAULT_MODEL`) is used.
5. `interview_sessions.realtimeModelUsed` is set on every new session and matches the model actually used for the Realtime connection.
6. Usage events for a voice interview record `realtimeModelUsed`, not a hard-coded constant.
7. Session-level metadata shown in the UI matches `realtimeModelUsed`.
8. Connection refresh (at ~13.5 min) uses the same model as the original connection.
9. Existing Collections continue to work after migration, defaulting safely to global default.
10. `OPENAI_REALTIME_BASE_URL` + `OPENAI_REALTIME_DEFAULT_MODEL` replace `OPENAI_REALTIME_URL` as the env config, with a deprecation warning if the legacy var is still set.

---

## Bottom line

The repo is already close to supporting this cleanly, because the usage ledger and rollups are model-aware.

The main issue is architectural: model selection is currently split across Collection UI, browser query params, env URL strings, and hard-coded reporting constants.

The right implementation is not just "swap the dropdown values". The right implementation is:

- Make model selection OpenAI-only
- Make the server authoritative
- Store one resolved model per session (non-nullable)
- Separate endpoint URL from model identifier
- Use that same resolved value consistently for connection, tracking, and reporting
