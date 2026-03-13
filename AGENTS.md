# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alvia is a voice-based AI interview platform built with TypeScript. It enables researchers to conduct AI-powered interviews with real-time transcription. Alvia (the interviewer) uses OpenAI's Realtime API (or xAI Grok) for voice conversations, while Barbara (the orchestrator) monitors transcripts and provides real-time guidance.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type check | `npm run check` |
| Build for production | `npm run build` |
| Start production | `npm run start` |
| Push DB schema | `npm run db:push` |
| Run tests | `npx vitest` |

The dev server runs on port 5000 with Vite HMR for the frontend.

## Architecture

### Stack
- **Frontend**: React 18, Wouter (routing), TanStack React Query, Radix UI, Tailwind CSS, Framer Motion
- **Backend**: Express.js with WebSocket support (ws library)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Clerk (Express.js middleware + React SDK, stateless JWTs) — `server/auth/` module
- **Voice**: OpenAI Realtime API (`gpt-realtime-mini`) or xAI Grok (`grok-3-fast`) over WebSocket, switchable via env var
- **Orchestration**: Barbara (8 configurable use cases) monitors interviews and guides Alvia
- **LLM Usage Tracking**: Billing-grade token tracking with event log + hourly rollups
- **Transcription Quality**: Real-time noisy environment detection and VAD tuning
- **Infographics**: Google Gemini API for AI-generated visual summaries
- **PDF Export**: jsPDF for analytics report generation
- **Testing**: Vitest for server-side unit tests
- **Build**: Vite 7.3 (client) + esbuild (server), TypeScript 5.6

### Directory Structure
```
client/src/
  pages/                    # Route components (25 pages total)
    landing.tsx             # Public landing page with features/CTA
    waitlist.tsx            # Invite-only waitlist form
    dashboard.tsx           # Command center with stats and action items
    projects.tsx, project-new.tsx, project-detail.tsx, project-edit.tsx
    templates.tsx, template-builder.tsx, template-detail.tsx
    collections.tsx, collection-new.tsx, collection-detail.tsx  # PDF export, invitations
    sessions.tsx, session-detail.tsx  # Transcript, ratings, notes
    analytics.tsx           # Command center/aggregated analytics
    settings.tsx            # User/workspace settings
    interview-consent.tsx, interview-welcome.tsx, interview.tsx, interview-complete.tsx  # Public
    interview-resume.tsx    # Resume via token (public)
    interview-review.tsx, review-token.tsx  # Post-interview review
    terms.tsx, not-found.tsx
  components/
    ui/                     # Radix UI wrappers (shadcn conventions, 48 primitives)
      hierarchy-nav.tsx, sidebar.tsx, ...
    analytics/              # Analytics visualization
      ThemeCard, InsightPanel, RecommendationsPanel, QuestionAnalysis
      AnalyticsPdfExport.tsx, ProjectAnalyticsView.tsx, TemplateAnalyticsView.tsx
      AnalyticsCascadeRefreshDialog.tsx
    review/                 # DotRating, QuestionReviewCard, RatingSection, ReviewLaterModal
    onboarding/             # WelcomeDialog, OnboardingDashboardCard, OnboardingFieldGuide
    simulation/             # Persona simulation UI (~3080 lines total)
      GeneratePersonasDialog.tsx    # 3-phase persona generation (~965 lines)
      PersonaManager.tsx, PersonaCard.tsx, PersonaFormDialog.tsx
      SimulationLauncher.tsx, SimulationProgress.tsx
      SessionScopeToggle.tsx, SimulationBadge.tsx
      BriefSelectionView.tsx, PopulationBriefCard.tsx
    GenerateTemplateDialog.tsx    # AI template generation from project context
    InfographicGenerator.tsx      # AI-generated visual summaries
    InvitationManager.tsx         # Bulk respondent invitations with QR codes
    PasteQuestionsPanel.tsx       # Parse questions from raw text via AI (~490 lines)
    BrandedWelcomeAvatar.tsx, BrandingColorPicker.tsx, BrandingThemeProvider.tsx
    ImageCropDialog.tsx, guidance-effectiveness.tsx
    app-sidebar.tsx, theme-provider.tsx, theme-toggle.tsx
  hooks/
    use-auth.ts, use-toast.ts, use-mobile.tsx
    use-audio-playback.ts         # Audio playback queue, barge-in suppression
    use-reconnection.ts           # WebSocket reconnection with exponential backoff
    use-silence-detection.ts      # Client-side silence detection with ambient noise calibration
    use-onboarding.ts, use-alvia-avatar.ts, use-ui-sounds.ts
  lib/                      # queryClient, auth-utils, utilities
    alvia-avatar-registry.ts, color-utils.ts, image-utils.ts
server/
  index.ts                  # Server entry point
  routes.ts                 # Route registration entry point
  routes/                   # Modular route handlers
    analytics.routes.ts         # Dashboard stats, analytics (~700 lines)
    analytics-helpers.ts        # Staleness, cascade refresh helpers
    projects.routes.ts, templates.routes.ts, collections.routes.ts
    sessions.routes.ts          # Session CRUD, export, summary generation
    respondents.routes.ts       # Respondent management, bulk invite
    interview-access.routes.ts, interview-flow.routes.ts
    review.routes.ts            # Review submission, link generation
    infographic.routes.ts       # Collection & project infographic generation
    barbara.routes.ts           # Barbara config endpoints
    usage.routes.ts             # LLM usage tracking queries
    persona-generation.routes.ts, persona.routes.ts, simulation.routes.ts
    admin-setup.routes.ts       # Quick-setup: project+template+collection in one request
    guidance.routes.ts          # Guidance aggregation at collection/template/project scope
    parse-questions.routes.ts   # AI-powered question parsing
  storage.ts                # DatabaseStorage class (~1630 lines)
  storage/
    types.ts                    # IStorage interface definitions
    simulation.ts               # Persona & simulation run CRUD, advisory locks, cleanup
  simulation/               # Persona simulation engine (~750 lines total)
    engine.ts, persona-prompt.ts, alvia-adapter.ts, question-flow.ts
    conversation-utils.ts, types.ts
  persona-generation/       # AI persona generation (~500 lines total)
    types.ts, research.ts, synthesis.ts, validation.ts
  voice-interview.ts        # WebSocket handler for voice interviews (~4200 lines)
  voice-interview/          # Extracted voice interview modules
    types.ts                    # InterviewState, MetricsTracker, constants
    context-builders.ts         # Cross-interview context, analytics hypotheses, continuity cues
    instructions.ts             # Prompt building logic with completed questions recap
    metrics.ts                  # Silence tracking, follow-up turn tracking
    transcript.ts, connection-refresh.ts, guidance-tracking.ts
    text-utils.ts, usage-recording.ts
  barbara-orchestrator.ts   # AI analysis and guidance system (~3490 lines)
  realtime-providers.ts     # Voice provider abstraction - OpenAI + Grok
  llm-usage.ts              # LLM usage tracking utilities
  usage-maintenance.ts      # Automated cleanup and rollup reconciliation
  transcription-quality.ts  # Transcription quality monitoring (~550 lines)
  infographic-service.ts    # Google Gemini API, supports Vertex AI for EU
  llm-config.ts, infographic-prompts.ts, demo-seed.ts, resume-token.ts
  db.ts, vite.ts, static.ts
  __tests__/                # Vitest tests (resume-token, smoke)
  auth/                     # Clerk authentication (~330 lines)
    middleware.ts, sync.ts, webhook.ts, routes.ts, storage.ts, index.ts
shared/
  schema.ts                 # Drizzle schema - source of truth (~510 lines)
  models/auth.ts            # Auth types and users table
  types/                    # Extracted TypeScript types (~700 lines total)
    index.ts, interview-state.ts, transcription-quality.ts, performance-metrics.ts
    question-types.ts, session-summary.ts, review.ts, llm-usage.ts
    collection-analytics.ts, template-analytics.ts, project-analytics.ts
    aggregated-analytics.ts, simulation.ts, persona-generation.ts, guidance-aggregation.ts
docs/                       # Specs and proposals
scripts/                    # seed-test-data/, clone-project-for-user.ts, export-for-prod.ts, migrate-to-production.ts
script/build.ts             # Production build script (esbuild + Vite)
vitest.config.ts
```

### Database Schema

**Core tables** (defined in `shared/schema.ts`):
- `workspaces`, `workspaceMembers` - Multi-tenant workspace system
- `projects` - objective, audience context, tone, consent settings, PII redaction, avoidRules, strategicContext, contextType, brandingLogo, brandingColors
- `interviewTemplates`, `questions` - Template structure with conditional logic, question types (open, yes_no, scale, numeric, multi_select)
- `collections` - Launched templates with analytics (JSONB), voiceProvider, `maxAdditionalQuestions` (0-3), `endOfInterviewSummaryEnabled`, `vadEagernessMode` ("auto"|"high")
- `respondents`, `interviewSessions` - Respondent data and session state
- `segments` - Response storage with transcripts, summaries, key quotes. Nullable `questionId` for additional questions
- `redactionMaps` - PII pseudonymization
- `llmUsageEvents`, `llmUsageRollups` - Billing ledger + hourly rollups
- `populationBriefs`, `synthesisJobs` - Persona generation data
- `inviteList`, `waitlistEntries` - Access control

**Enums**: `questionTypeEnum` (open, yes_no, scale, numeric, multi_select), `sessionStatusEnum` (pending, consent_given, in_progress, paused, completed, abandoned), `userRoleEnum` (owner, creator, analyst, respondent), `contextTypeEnum`, `respondentStatusEnum`, `llmProviderEnum` (openai, xai, gemini), `llmUsageStatusEnum`

**Key JSONB fields on `interviewSessions`**:
- State: `liveTranscript`, `lastBarbaraGuidance`, `questionStates`, `questionSummaries`
- AQ: `additionalQuestions`, `additionalQuestionPhase`, `currentAdditionalQuestionIndex`
- Summaries: `alviaSummary` (`AlviaSessionSummary`), `barbaraSessionSummary` (`BarbaraSessionSummary`)
- Quality: `transcriptionQualityMetrics` (score 0-100, flags, environment checks)
- Review: `reviewRatings`, `reviewComments`, `reviewAccessToken`, `researcherNotes`, `reviewFlags` (needs_review, flagged_quality, verified, excluded)
- Guidance: `barbaraGuidanceLog`, `guidanceAdherenceSummary`
- Performance: `performanceMetrics` (`RealtimePerformanceMetrics` - tokens, latency, speaking time, silence, Barbara token breakdown)

### Key Patterns

**Path aliases**: `@/*` → `client/src/*`, `@shared/*` → `shared/*`

**Data hierarchy**: Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment

**Voice interview flow**:
1. Respondent joins via `/join/:collectionId` (consent) or resumes via `/resume/:token`
2. WebSocket at `/ws/interview` bridges audio between client and voice provider
3. Client hooks manage audio playback, reconnection (exponential backoff), and silence detection
4. Barbara analyzes each utterance and injects guidance to Alvia
5. Transcription quality monitored; environment checks on degradation; barge-in support
6. After template questions: Barbara generates additional questions (0-3) if configured
7. On completion: session summaries by Alvia and Barbara (if enabled)
8. State persisted every 2s for crash recovery; resume tokens support AQ phase
9. Proactive connection refresh at ~13.5min to avoid Railway's 15-min WebSocket limit
10. From Q2+: COMPLETED QUESTIONS RECAP in all instruction paths (normal, resume, refresh)
11. Follow-up turn tracking with barge-in revert; RESERVED QUESTIONS prevents premature asking

**Alvia prompt construction** (`server/voice-interview/instructions.ts`):
- `buildInterviewInstructions(opts)` takes `InterviewInstructionsOptions` object
- `buildCompletedQuestionsRecap(summaries, currentQuestionIndex)` builds recap block
- `buildResumeInstructions(state)` and `buildRefreshInstructions(state)` handle reconnection

**Voice provider abstraction** (`server/realtime-providers.ts`):
- OpenAI: `gpt-realtime-mini`, voice "marin", `gpt-4o-mini-transcribe`, semantic VAD
- Grok (xAI): `grok-3-fast`, voice "Ara", `whisper-large-v3`, server-based VAD
- Selected via `REALTIME_PROVIDER` env var (default: "openai")

**Barbara orchestrator** (`server/barbara-orchestrator.ts`):
- Eight use cases: analysis, topicOverlap, summarisation, templateAnalytics, projectAnalytics, templateGeneration, additionalQuestions, sessionSummary
- Each has: model, verbosity (low|medium|high), reasoning effort (minimal|low|medium|high)
- Allowed models: gpt-5-mini, gpt-5, gpt-4o, gpt-4o-mini, o1, o1-mini, o1-pro, o3-mini
- Key functions: `analyzeWithBarbara()`, `generateQuestionSummary()`, `detectTopicOverlap()`, `generateCrossInterviewAnalysis()`, `generateTemplateAnalytics()`, `generateProjectAnalytics()`, `generateTemplateFromProject()`, `generateAdditionalQuestions()`, `generateSessionSummary()`
- Runtime configurable via `/api/barbara/config`; all calls tracked via `withTrackedLlmCall()`

**Analytics system** (hierarchical):
- Collection → Template → Project → Command center (aggregated)
- Staleness tracking, scope filtering (real/simulated/combined), cascade refresh
- PDF export via `AnalyticsPdfExport`, infographics via Gemini API

**LLM usage tracking** (`server/llm-usage.ts`, `server/usage-maintenance.ts`):
- 16 tracked use cases (alvia_realtime, alvia_transcription, barbara_*, infographic_*)
- Full attribution hierarchy; provider-agnostic normalization
- Hourly rollups; raw events expire after 14 days; rollup reconciliation every 24h
- `withTrackedLlmCall()` wrapper for automatic logging

**Persona simulation** (`server/simulation/`):
- Text-based engine generating synthetic interview responses
- Configurable personas (attitude, verbosity, knowledge, traits, communication style)
- PostgreSQL advisory locks for concurrency; parallel batches of 3; DB-backed cancellation
- Orphan cleanup on restart; conditional question flow; session scope tracking (`isSimulated`)

**AI persona generation** (`server/persona-generation/`):
- Two-phase: research (OpenAI Responses API + web_search → PopulationBrief) → synthesis (structured output personas)
- Diversity validation with automatic retry; web search fallback on rate limit
- Document upload (CSV/TXT/PDF, 2MB max) via base64 `input_file`
- Rate limiting: 5 research requests/hour per project
- Frontend: `GeneratePersonasDialog` with 3-state flow (input → generating → review)

**VAD eagerness** (per collection, OpenAI only):
- `vadEagernessMode`: "auto" (default) or "high" (faster response)
- Dynamic fallback: 3+ rapid barge-ins in last 6 turns → auto-downgrade (one-directional)
- Composes with transcription quality system (can reduce from "auto" to "low")
- Eagerness hierarchy: high > auto > low (only moves downward)

**Transcription quality** (`server/transcription-quality.ts`):
- Detects garbled audio, noise, repeated clarification, foreign language hallucination, word glitches
- Sliding window (last 5 utterances), quality score 0-100, auto environment checks

**Silence and pause tracking** (`SpeakingTimeMetrics`):
- `SilenceSegment` records with context (post_alvia, post_respondent, initial)
- `SilenceStats`: count, mean, median, p90, p95, max; pause-aware metrics
- Capped at 100 segments

**Resume/Review system**:
- Resume tokens (32-byte, base64url, 7-day expiry) for crash recovery
- Review links (64-char tokens); 6-dimension rating system

**Connection refresh** (`server/voice-interview/connection-refresh.ts`):
- Cascade: 13.5min → 14.5min → 14m55s; close code 4000; 30s reset timeout

**Guidance adherence** (`server/guidance-adherence.ts`, `server/guidance-aggregation.ts`):
- Per-response scoring: followed, partiallyFollowed, notFollowed, notApplicable, unscored
- Aggregation at collection/template/project scope

**Database operations**: All queries via `DatabaseStorage` in `server/storage.ts` implementing `IStorage` from `server/storage/types.ts`. Types generated via `drizzle-zod`. Zod schemas shared for client/server validation.

### API Routes Overview

- **Auth**: `GET /api/auth/user`, `/api/auth/invite-status`; `POST /api/waitlist`
- **Dashboard**: `GET /api/dashboard/stats`, `/api/dashboard/enhanced-stats`
- **Analytics**: `GET /api/analytics`, `/api/analytics/aggregated`; `POST /api/{collections,templates,projects}/:id/analytics/refresh`
- **CRUD**: `/api/projects/*`, `/api/templates/*`, `/api/collections/*`, `/api/sessions/*`, `/api/segments/*`
- **Infographics**: `POST /api/{collections,projects}/:id/infographic/{summary,themes,...}`
- **Template gen**: `POST /api/templates/generate`
- **Respondents**: `PATCH /api/respondents/:id/names`; `POST /api/collections/:id/respondents/bulk`
- **Interview**: `GET /api/interview/:sessionId`, `/api/interview/resume/:token`; `POST /api/collections/:id/start-by-token`
- **Review**: `POST /api/sessions/:id/review/generate-link`
- **Export**: `GET /api/sessions/:id/export`
- **Summaries**: `POST /api/sessions/:id/generate-summary`
- **Usage**: `GET /api/usage/{session,collection,template,project}/:id`; `POST /api/admin/usage/backfill-rollups`
- **Personas**: `GET/POST /api/projects/:id/personas`; `PATCH/DELETE /api/personas/:id`
- **Persona gen**: `POST /api/projects/:id/personas/{research,synthesize}`
- **Simulation**: `POST /api/collections/:id/simulate`; `GET /api/collections/:id/simulation-runs`; `GET/POST /api/simulation-runs/:id[/cancel]`
- **Guidance**: `GET /api/guidance/{collection,template,project}/:id`
- **Questions**: `POST /api/projects/:id/parse-questions`
- **Barbara config**: `GET/PATCH /api/barbara/config[/{use-case}]`
- **Admin**: `POST /api/admin/quick-setup`
- **WebSocket**: `/ws/interview`

### Frontend Routes

- **Public**: `/` (landing), `/join/:collectionId` (consent), `/welcome/:sessionId`, `/interview/:sessionId`, `/interview/complete`, `/resume/:token`, `/review/:sessionId|:token`, `/terms`
- **Auth (no invite)**: Waitlist page
- **Auth (with sidebar)**: `/dashboard`, `/projects[/:id[/edit]]`, `/projects/new`, `/templates/:id[/edit]`, `/projects/:projectId/templates/new`, `/collections[/:id]`, `/sessions[/:id]`, `/analytics`, `/settings`

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - For voice interviews (OpenAI provider) and Barbara orchestrator

Optional:
- `GEMINI_API_KEY` - For infographic generation (required unless using Vertex AI)
- `REALTIME_PROVIDER` - "openai" (default) or "xai"
- `XAI_API_KEY` - Required if using Grok provider
- `INVITE_ONLY_MODE` - Enable invite-only access (default: true)
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - "production" or "development"
- `BASE_URL` - Base URL for generated links (defaults to request protocol/host)

EU Data Residency (all optional):
- `OPENAI_BASE_URL` - OpenAI SDK base URL (e.g., `https://eu.api.openai.com/v1`)
- `OPENAI_REALTIME_URL` - WebSocket URL for Realtime API
- `GOOGLE_GENAI_USE_VERTEXAI` - `true` to use Vertex AI (mutually exclusive with `GEMINI_API_KEY`)
- `GOOGLE_CLOUD_PROJECT` - GCP project ID (required with Vertex AI)
- `GOOGLE_CLOUD_LOCATION` - GCP region (default: `europe-west1`)

## Code Size Guidelines

**File size limits**:
- **Hard limit: 500 lines** for new files. Split before committing.
- **Soft limit: 1,000 lines** for existing files. Extract a module in the same PR.
- **Watch list** (must only shrink): `voice-interview.ts` (4,200), `barbara-orchestrator.ts` (3,490), `storage.ts` (1,630)

**Where to put new code:**
- API endpoints → `server/routes/*.routes.ts`
- Voice interview features → `server/voice-interview/`
- Barbara use cases → `server/barbara/` directory
- Storage queries → `server/storage/*.ts` if adding 3+ related methods
- Shared types → `shared/types/`
- React hooks → one per file in `client/src/hooks/`

**Refactoring triggers**:
- Function > 80 lines, switch > 10 branches, 3+ related functions, repeated patterns

## Design System

Reference `design_guidelines.md` for UI patterns. Key points:
- Typography: Inter for UI, JetBrains Mono for technical data
- Spacing: Tailwind units 2, 4, 6, 8, 12, 16
- Icons: Lucide React (formerly Heroicons)
- Components follow shadcn/ui conventions with Radix primitives
- Dark/light theme support via theme-provider
