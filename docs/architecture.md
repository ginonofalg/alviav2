# Alvia Architecture

Alvia is a voice-based AI interview platform that enables researchers to conduct AI-powered interviews with real-time transcription, orchestration, and analytics.

## System Overview

```
                                   +-----------------+
                                   |  OpenAI Realtime|
                                   |  or xAI Grok    |
                                   +--------+--------+
                                            |
                                         WebSocket
                                            |
+-------------+     WebSocket      +--------+--------+      SQL        +-----------+
|  React SPA  | <================> |  Express Server  | <============> | PostgreSQL|
|  (Vite)     |     /ws/interview  |                  |   Drizzle ORM  |           |
+------+------+                    +--------+---------+                +-----------+
       |                                    |
       | REST /api/*                        | HTTPS
       +------------------------------------+---------> OpenAI Chat API (Barbara)
                                            +---------> Google Gemini API (Infographics)
```

Three AI actors collaborate during an interview:
- **Alvia** (the interviewer) - speaks to respondents via a voice provider (OpenAI Realtime or Grok)
- **Barbara** (the orchestrator) - silently monitors transcripts and injects real-time guidance to Alvia
- **The respondent** - a human participant answering questions via their microphone

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Wouter, TanStack React Query, Radix UI (shadcn), Tailwind CSS, Framer Motion |
| Backend | Express.js, WebSocket (ws), Passport.js |
| Database | PostgreSQL, Drizzle ORM, drizzle-zod |
| Auth | Replit OpenID Connect, express-session (PostgreSQL-backed) |
| Voice | OpenAI Realtime API (`gpt-realtime-mini`) or xAI Grok (`grok-3-fast`) |
| Orchestration | OpenAI Chat API (gpt-5-mini / gpt-4o family) |
| Infographics | Google Gemini API |
| Testing | Vitest |
| Build | Vite 7.3 (client), esbuild (server), TypeScript 5.6 |

## Data Hierarchy

All data is tenant-scoped through a strict ownership chain:

```
Workspace (owner)
  └─ Project (objective, audience, tone, PII settings)
       └─ InterviewTemplate (ordered questions with types and conditional logic)
            └─ Collection (launched template instance with analytics)
                 ├─ Respondent (invited participant, tracked through lifecycle)
                 └─ InterviewSession (single interview run)
                      └─ Segment (one question-response pair with transcript and summary)
```

Every query traverses this chain to verify access. A user can only read or modify resources within workspaces they own.

## Core Components

### Voice Interview Pipeline

The interview is a real-time, full-duplex audio conversation managed over two WebSocket connections:

```
Browser ←→ Express Server ←→ Voice Provider (OpenAI / Grok)
  mic audio →    bridge    → provider audio input
  speaker   ←    bridge    ← provider audio output
```

**Client-side hooks** manage the browser end:
- `use-audio-playback` - queues AI audio chunks, tracks speaking state, handles barge-in (respondent interrupting the AI)
- `use-reconnection` - exponential-backoff WebSocket reconnection with connection timeout detection
- `use-silence-detection` - ambient noise calibration and silence detection for UX feedback

**Server-side state** (`InterviewState`) tracks the full interview lifecycle per session:
- Connection health (heartbeat, watchdog, connection ID for stale-guard)
- Transcript accumulation (sliding window of last 50 entries for Barbara)
- Question progression and state machine
- Performance metrics (token usage, latency, silence tracking)

**Resilience mechanisms:**
- Connection ID prevents stale event processing from orphaned connections
- `safeSend()` checks WebSocket readyState before every message
- `canCreateResponse()` prevents concurrent voice provider responses with timeout recovery
- Debounced state persistence (every 2s) with immediate flush on critical events
- Resume tokens allow respondents to recover interrupted interviews within 7 days

### Barbara Orchestrator

Barbara is a configurable AI analysis system with eight use cases, each independently tunable (model, verbosity, reasoning effort):

| Use Case | When | Purpose |
|----------|------|---------|
| `analysis` | After each respondent utterance | Inject real-time guidance to Alvia |
| `topicOverlap` | During interview | Detect themes already covered across prior sessions |
| `questionSummary` | After each question completes | Generate per-question analysis with verbatims |
| `additionalQuestions` | After all template questions | Generate 0-3 dynamic follow-up questions |
| `sessionSummary` | On interview completion | Produce structured interview summary |
| `templateAnalytics` | On demand | Cross-collection template analytics |
| `projectAnalytics` | On demand | Cross-template project analytics |
| `templateGeneration` | On demand | AI-generated interview template from project context |

All Barbara LLM calls are wrapped with `withTrackedLlmCall()` for automatic billing-grade usage tracking.

### Analytics System

Analytics are hierarchical with staleness tracking:

```
Collection analytics (themes, findings, question performance)
  ↑ aggregated into
Template analytics (cross-collection consistency metrics)
  ↑ aggregated into
Project analytics (cross-template synthesis)
  ↑ aggregated into
Command center (cross-project insights)
```

Cascade refresh: refreshing project analytics triggers template and collection refreshes down the chain. Staleness is tracked via `lastAnalyzedAt` and `analyzedSessionCount` to surface when analytics are outdated.

## Architectural Principles

### Modular Route Organization

API routes are split into 13 focused modules under `server/routes/`, each responsible for a single domain (projects, templates, collections, sessions, analytics, etc.). The main `routes.ts` registers them all. Similarly, voice interview logic is decomposed into modules under `server/voice-interview/` for types, context building, prompt construction, metrics, and transcript management.

### Type Safety End-to-End

- Database schema defined in `shared/schema.ts` using Drizzle ORM
- Types extracted into `shared/types/` (12 modules covering analytics, metrics, summaries, etc.)
- Zod schemas generated from Drizzle schema via `drizzle-zod` for runtime validation
- Same Zod schemas used for both client form validation and server input validation
- Path aliases (`@/*`, `@shared/*`) shared across client, server, and test configurations

### Storage Interface Pattern

All database access goes through the `IStorage` interface (`server/storage/types.ts`, 100+ methods) implemented by `DatabaseStorage`. This provides a clear data access contract and makes the storage layer testable in isolation.

### Provider Abstraction

The `RealtimeProvider` interface abstracts voice provider differences (WebSocket URL, auth headers, session config, VAD behavior, token usage parsing). Switching from OpenAI to Grok requires only changing an environment variable or a per-collection setting.

## Security

### Authentication

- **Protocol**: Replit OpenID Connect with Passport.js
- **Sessions**: PostgreSQL-backed via `connect-pg-simple`, 7-day TTL
- **Cookies**: `httpOnly`, `secure`, no JavaScript access
- **Token refresh**: Automatic access token refresh using stored refresh tokens in `isAuthenticated` middleware

### Authorization

Hierarchical ownership verification on every protected route:

```
verifyUserAccessToSession(userId, sessionId)
  → verifyUserAccessToCollection(userId, collectionId)
    → verifyUserAccessToTemplate(userId, templateId)
      → verifyUserAccessToProject(userId, projectId)
        → workspace.ownerId === userId
```

### Token Security

- **Resume tokens**: 32 bytes of `crypto.randomBytes`, base64url-encoded. Only the SHA-256 hash is stored in the database. 7-day expiry with status validation.
- **Review tokens**: 64-character tokens for shareable review links, distinguished from session IDs by length.

### Input Validation

All mutation endpoints validate input with Zod's `safeParse()`. Validation errors are converted to user-friendly messages via `zod-validation-error`.

### Invite-Only Access

Platform access is gated by an `inviteList` table (case-insensitive email matching). Unauthenticated visitors see a landing page; authenticated but uninvited users are directed to a waitlist form.

### PII Redaction

Projects have a `piiRedactionEnabled` flag. A `redactionMaps` table stores original-to-pseudonym mappings per session, scoped by entity type (name, email, phone).

## APIs

### REST API

All endpoints are under `/api/*` and return JSON with `{ message: string }` on errors.

| Domain | Endpoints | Auth |
|--------|-----------|------|
| Auth & access control | `/api/auth/user`, `/api/auth/invite-status`, `/api/waitlist` | Mixed |
| Projects | CRUD at `/api/projects/*` | Authenticated |
| Templates | CRUD at `/api/templates/*`, AI generation at `/api/templates/generate` | Authenticated |
| Collections | CRUD at `/api/collections/*`, analytics refresh, bulk invite | Authenticated |
| Sessions | CRUD at `/api/sessions/*`, export (JSON/CSV), summary generation | Authenticated |
| Analytics | `/api/dashboard/stats`, `/api/analytics/aggregated`, cascade refresh | Authenticated |
| Infographics | `/api/collections/:id/infographic/*`, `/api/projects/:id/infographic/*` | Authenticated |
| LLM usage | `/api/usage/{session,collection,template,project}/:id` | Authenticated |
| Barbara config | `GET/PATCH /api/barbara/config/*` | Authenticated |
| Interview access | `/api/interview/:sessionId`, `/api/interview/resume/:token` | Public |
| Review | `/api/sessions/:id/review/*` | Mixed |

### WebSocket API

A single WebSocket endpoint at `/ws/interview` handles the full interview lifecycle. Messages are JSON-encoded, with binary audio frames forwarded directly to/from the voice provider.

**Client → Server messages**: session join, audio data, pause/resume, barge-in, heartbeat pings

**Server → Client messages**: AI audio, transcript updates, question transitions, Barbara guidance indicators, environment check requests, completion signals

### External API Integrations

| Service | Protocol | Purpose |
|---------|----------|---------|
| OpenAI Realtime API | WebSocket | Voice conversation (Alvia) |
| xAI Grok API | WebSocket | Alternative voice provider |
| OpenAI Chat API | HTTPS | Barbara orchestration (analysis, summaries, template generation) |
| Google Gemini API | HTTPS | Infographic image generation |
| Replit OIDC | HTTPS | Authentication |

## LLM Usage Tracking

Every LLM call is tracked at billing grade across 16 use cases and 3 providers:

```
Event log (llmUsageEvents)          Hourly rollups (llmUsageRollups)
  ├─ Full attribution hierarchy       ├─ Unique on (bucket, dimensions)
  ├─ Token breakdown (text + audio)   ├─ Aggregated tokens + request count
  ├─ Latency, status, request ID      └─ Queryable at any hierarchy level
  └─ Raw provider usage data

  Maintenance:
    - Raw events expire after 14 days
    - Rollup reconciliation every 24 hours
```

The `withTrackedLlmCall()` wrapper handles timeout via AbortController, latency measurement, usage extraction, and error/timeout status recording in a single concern.

## Build and Deployment

**Development**: `npm run dev` starts Vite dev server with HMR (frontend) and the Express server on port 5000.

**Production build**: Two-phase pipeline:
1. Vite builds the React SPA into static assets
2. esbuild bundles the server with selective dependency bundling (33 packages inlined for faster cold starts, native modules kept external)

**Testing**: Vitest with Node environment, path aliases matching the app, tests in `__tests__/` directories.

**Database migrations**: Drizzle Kit with `npm run db:push` for schema synchronization.
