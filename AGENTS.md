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

The dev server runs on port 5000 with Vite HMR for the frontend.

## Architecture

### Stack
- **Frontend**: React 18, Wouter (routing), TanStack React Query, Radix UI, Tailwind CSS, Framer Motion
- **Backend**: Express.js with WebSocket support (ws library)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit OpenID Connect via Passport, sessions stored in PostgreSQL
- **Voice**: OpenAI Realtime API (`gpt-realtime-mini`) or xAI Grok (`grok-3-fast`) over WebSocket, switchable via env var
- **Orchestration**: Barbara (8 configurable use cases) monitors interviews and guides Alvia
- **LLM Usage Tracking**: Billing-grade token tracking with event log + hourly rollups
- **Transcription Quality**: Real-time noisy environment detection and VAD tuning
- **Infographics**: Google Gemini API for AI-generated visual summaries
- **PDF Export**: jsPDF for analytics report generation
- **Build**: Vite 7.3 (client) + esbuild (server), TypeScript 5.6

### Directory Structure
```
client/src/
  pages/                    # Route components (25 pages total)
    landing.tsx             # Public landing page with features/CTA
    waitlist.tsx            # Invite-only waitlist form
    dashboard.tsx           # Command center with stats and action items
    projects.tsx            # Project list/management
    project-new.tsx         # Create new project
    project-detail.tsx      # Project overview and analytics
    project-edit.tsx        # Edit project configuration
    templates.tsx           # Template list
    template-builder.tsx    # Template creation/editing with questions
    template-detail.tsx     # Template overview and analytics
    collections.tsx         # Collection list with status tracking
    collection-new.tsx      # Launch new collection
    collection-detail.tsx   # Collection management, PDF export, invitations
    sessions.tsx            # Session list with filtering
    session-detail.tsx      # Session review - transcript, ratings, notes
    analytics.tsx           # Command center/aggregated analytics
    settings.tsx            # User/workspace settings
    interview-consent.tsx   # Consent screen (public)
    interview-welcome.tsx   # Pre-interview welcome (public)
    interview.tsx           # Voice interview UI (public)
    interview-complete.tsx  # Post-interview completion (public)
    interview-resume.tsx    # Resume interview via token (public)
    interview-review.tsx    # Post-interview review (authenticated)
    review-token.tsx        # Shareable review via 64-char token (public)
    not-found.tsx           # 404 page
  components/
    ui/                     # Radix UI wrappers (shadcn conventions, 47+ primitives)
    analytics/              # Analytics visualization
      index.tsx                         # Analytics component exports
      ThemeCard.tsx
      InsightPanel.tsx
      RecommendationsPanel.tsx
      QuestionAnalysis.tsx
      AnalyticsPdfExport.tsx              # PDF report generation
      ProjectAnalyticsView.tsx            # Project-level analytics
      TemplateAnalyticsView.tsx           # Template-level analytics
      AnalyticsCascadeRefreshDialog.tsx   # Multi-level analytics refresh
    review/                 # DotRating, QuestionReviewCard, RatingSection, ReviewLaterModal
    GenerateTemplateDialog.tsx    # AI-powered template generation from project context
    InfographicGenerator.tsx      # AI-generated visual summaries
    InvitationManager.tsx         # Bulk respondent invitations with QR codes
    app-sidebar.tsx               # Main navigation sidebar
    theme-provider.tsx            # Dark/light theme support
    theme-toggle.tsx              # Theme switcher button
  hooks/                    # useAuth, useToast, useMobile
  lib/                      # queryClient, auth-utils, utilities
server/
  index.ts                  # Server entry point (~100 lines)
  routes.ts                 # REST API endpoints (~3400 lines)
  storage.ts                # DatabaseStorage class (~1830 lines)
  voice-interview.ts        # WebSocket handler for voice interviews (~5140 lines)
  barbara-orchestrator.ts   # AI analysis and guidance system (~3490 lines)
  realtime-providers.ts     # Voice provider abstraction - OpenAI + Grok (~370 lines)
  llm-usage.ts              # LLM usage tracking utilities (~190 lines)
  usage-maintenance.ts      # Automated cleanup and rollup reconciliation (~100 lines)
  transcription-quality.ts  # Transcription quality monitoring (~550 lines)
  infographic-service.ts    # Google Gemini API integration (~210 lines)
  infographic-prompts.ts    # Prompt templates for infographics (~270 lines)
  demo-seed.ts              # Demo project data seeding for new users (~130 lines)
  resume-token.ts           # Interview resume token utilities
  db.ts                     # Drizzle DB connection
  vite.ts                   # Vite integration utilities
  static.ts                 # Static file serving
  replit_integrations/auth/ # OIDC authentication (~300 lines)
    replitAuth.ts           # Passport OIDC strategy setup
    routes.ts               # Auth routes (/api/auth/user, invite-status, waitlist)
    storage.ts              # Auth data persistence
    index.ts                # Module exports
shared/
  schema.ts                 # Drizzle schema - source of truth (~1300 lines)
  models/auth.ts            # Auth tables (users, sessions)
docs/
  pause-duration-tracking-spec.md     # Silence vs pause tracking spec
  project-template-generation-prompt.md
proposals/                  # Feature design proposals
  llm-token-tracking-billing-proposal.md
  llm-usage-rollup-retention-proposal.md
  barbara-question-quality-insights-proposal.md
  voice-interview-reconnection-bugs.md
scripts/
  seed-test-data/           # Database seeding utility for development
script/
  build.ts                  # Production build script (esbuild + Vite)
```

### Database Schema

**Core tables** (defined in `shared/schema.ts`):
- `workspaces`, `workspaceMembers` - Multi-tenant workspace system
- `projects` - Contains objective, audience context, tone, consent settings, PII redaction flags, avoidRules, strategicContext, contextType
- `interviewTemplates`, `questions` - Template structure with conditional logic, question types (open, yes_no, scale, numeric, multi_select)
- `collections` - Launched templates with analytics data (JSONB), voiceProvider field, `maxAdditionalQuestions` (0-3), `endOfInterviewSummaryEnabled`
- `respondents`, `interviewSessions` - Respondent data and session state
- `segments` - Response storage with transcripts, summaries, key quotes, quality flags. Nullable `questionId` for additional questions, with `additionalQuestionIndex` and `additionalQuestionText`
- `redactionMaps` - PII pseudonymization
- `llmUsageEvents` - Immutable billing ledger for all LLM calls (tokens, latency, attribution by hierarchy level)
- `llmUsageRollups` - Pre-aggregated hourly usage summaries with unique constraint on dimensions
- `inviteList` - Allowed platform users (email-based access control)
- `waitlistEntries` - Waitlist for unauthenticated users with consent tracking

**Enums**:
- `questionTypeEnum`: open, yes_no, scale, numeric, multi_select
- `sessionStatusEnum`: pending, consent_given, in_progress, paused, completed, abandoned
- `userRoleEnum`: owner, creator, analyst, respondent
- `contextTypeEnum`: content, product, marketing, cx, other
- `respondentStatusEnum`: invited, clicked, consented, completed
- `llmProviderEnum`: openai, xai, gemini
- `llmUsageStatusEnum`: success, missing_usage, timeout, error

**Session state persistence fields**: `liveTranscript`, `lastBarbaraGuidance`, `questionStates`, `questionSummaries` (all JSONB)

**Additional questions fields**: `additionalQuestions` (JSONB: `AdditionalQuestionsData`), `additionalQuestionPhase` (boolean), `currentAdditionalQuestionIndex`

**Session summary fields**: `alviaSummary` (JSONB: `AlviaSessionSummary`), `barbaraSessionSummary` (JSONB: `BarbaraSessionSummary`)

**Transcription quality**: `transcriptionQualityMetrics` (JSONB: `TranscriptionQualityMetrics`) - quality score 0-100, detected flags, environment check count

**Review fields**: `reviewRatings`, `reviewComments`, `reviewAccessToken`, `researcherNotes`, `reviewFlags`

**Review flags enum**: `needs_review`, `flagged_quality`, `verified`, `excluded`

**Performance metrics fields**: `performanceMetrics` (JSONB: `RealtimePerformanceMetrics`) - token usage, latency, speaking time, silence tracking, Barbara token breakdown by use case

### Key Patterns

**Path aliases**: `@/*` maps to `client/src/*`, `@shared/*` maps to `shared/*`

**Data hierarchy**: Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment

**Voice interview flow**:
1. Respondent joins via `/join/:collectionId` (consent screen) or resumes via `/resume/:token`
2. Interview at `/interview/:sessionId` opens WebSocket to `/ws/interview`
3. Server bridges audio between client and voice provider (OpenAI or Grok via `realtime-providers.ts`)
4. After each respondent utterance, Barbara analyzes the transcript and injects guidance to Alvia (probe deeper, move on, acknowledge prior context)
5. Transcription quality monitored in real-time; environment checks triggered on quality degradation
6. Responses saved as Segments with transcripts, summaries, and extracted values
7. After all template questions: Barbara generates additional questions (0-3) if configured; AQ phase begins
8. On completion: session summaries generated by both Alvia and Barbara (if enabled)
9. State persisted every 2 seconds for crash recovery via resume tokens (supports AQ phase resume)

**Voice provider abstraction** (`server/realtime-providers.ts`):
- `RealtimeProvider` interface abstracts OpenAI and Grok implementations
- OpenAI: `gpt-realtime-mini`, voice "marin", transcription via `gpt-4o-mini-transcribe`, semantic VAD
- Grok (xAI): `grok-3-fast`, voice "Ara", transcription via `whisper-large-v3`, server-based VAD
- Provider selected via `REALTIME_PROVIDER` env var (default: "openai")

**Barbara orchestrator** (`server/barbara-orchestrator.ts`):
- Eight configurable use cases: analysis, topicOverlap, summarisation, templateAnalytics, projectAnalytics, templateGeneration, additionalQuestions, sessionSummary
- Each has: model, verbosity (low|medium|high), reasoning effort (minimal|low|medium|high)
- Allowed models: gpt-5-mini, gpt-5, gpt-4o, gpt-4o-mini, o1, o1-mini, o1-pro, o3-mini
- Key functions:
  - `analyzeWithBarbara()` - Real-time guidance during interviews
  - `generateQuestionSummary()` - Per-question analysis with verbatims
  - `detectTopicOverlap()` - Cross-interview theme detection
  - `generateCrossInterviewAnalysis()` - Collection-level aggregated analysis
  - `generateTemplateAnalytics()` - Cross-collection template analytics
  - `generateProjectAnalytics()` - Cross-template project analytics
  - `generateTemplateFromProject()` - AI-generated interview templates
  - `generateAdditionalQuestions()` - Dynamic follow-up questions at end of interview
  - `generateSessionSummary()` - End-of-interview summary with themes and engagement
- Runtime configurable via `/api/barbara/config` endpoints
- Outputs: guidance actions, question summaries with verbatims, quality scores
- All LLM calls tracked via `withTrackedLlmCall()` wrapper from `llm-usage.ts`

**Analytics system** (hierarchical):
- **Collection-level**: `CollectionAnalytics` - themes, keyFindings, questionPerformance, recommendations
- **Template-level**: `TemplateAnalytics` - aggregated themes, consistency metrics across collections
- **Project-level**: `ProjectAnalytics` - cross-template synthesis, contextual recommendations
- **Command center**: `AggregatedAnalytics` - cross-project insights
- Staleness tracking via `StalenessStatus` type, `lastAnalyzedAt`, `analyzedSessionCount`
- Cascade refresh: refreshing project analytics triggers template and collection refreshes

**PDF Export system**:
- `AnalyticsPdfExport` component generates formatted PDF reports
- Exports both collection and project analytics
- Features: smart page breaks, theme ID to name mapping, verbatims
- File naming: `{name}_analytics_{date}.pdf`

**Infographic generation**:
- Google Gemini API integration (gemini-3-pro-image-preview, gemini-2.5-flash-image)
- Collection-level: summary, themes, findings
- Project-level: summary, themes, strategic insights
- Generated images stored in `generated-infographics/` directory
- Auto-cleanup: keeps only last 100 infographics

**Invitation manager**:
- Bulk respondent invitations via CSV or manual entry
- QR code generation for easy access
- Tracks invitation status through lifecycle (invited → clicked → consented → completed)

**LLM usage tracking** (`server/llm-usage.ts`, `server/usage-maintenance.ts`):
- Billing-grade event log: every LLM call logged to `llmUsageEvents` with full attribution (workspace → project → template → collection → session)
- 16 tracked use cases: alvia_realtime, alvia_transcription, barbara_analysis, barbara_topic_overlap, barbara_question_summary, barbara_cross_interview_enhanced_analysis, barbara_project_cross_template_analysis, barbara_template_generation, barbara_additional_questions, barbara_session_summary, infographic_* (6 variants)
- Provider-agnostic normalization: text + audio token split for OpenAI, xAI, and Gemini
- Hourly rollups in `llmUsageRollups` with unique constraint on (bucket, workspace, project, template, collection, session, provider, model, useCase, status)
- `withTrackedLlmCall()` wrapper used by Barbara to automatically log usage
- Automated maintenance: raw events expire after 14 days, rollup reconciliation every 24 hours
- Usage query endpoints at session, collection, template, and project levels

**Additional questions (AQ) system**:
- Barbara generates 0-3 dynamic follow-up questions at end of interview based on gaps/themes
- Configured per collection via `maxAdditionalQuestions` (0-3, default 1)
- Can use cross-interview context from prior sessions in the same collection
- Respondent can decline to answer; progress tracked via `additionalQuestionPhase` and `currentAdditionalQuestionIndex`
- AQs stored as Segments with nullable `questionId`, using `additionalQuestionIndex` and `additionalQuestionText`
- Full resume support for AQ phase

**End-of-interview session summaries**:
- Enabled per collection via `endOfInterviewSummaryEnabled`
- `AlviaSessionSummary`: themes, overall summary, objective satisfaction (covered areas + gaps)
- `BarbaraSessionSummary`: themes with supporting evidence + sentiment, objective satisfaction with rating, respondent engagement level
- Manually regenerable via `POST /api/sessions/:id/generate-summary`

**Transcription quality monitoring** (`server/transcription-quality.ts`):
- Real-time detection of: garbled audio, environment noise, repeated clarification, foreign language hallucination, repeated word glitches
- Sliding window analysis (last 5 utterances) with quality score 0-100
- Automatic environment check triggering when quality degrades
- VAD eagerness reduction on persistent quality issues
- Metrics persisted to `transcriptionQualityMetrics` JSONB field on session

**Silence and pause tracking** (enhanced `SpeakingTimeMetrics`):
- Individual `SilenceSegment` records with context (post_alvia, post_respondent, initial) and question index
- Aggregated `SilenceStats`: count, mean, median, p90, p95, max, breakdown by context
- Pause-aware metrics: `totalPauseDurationMs`, `activeSilenceMs` (excludes pause time), `activeSessionDurationMs`
- Distinguishes between paused time (no cost) and active silence (incurs OpenAI cost)
- Capped at 100 segments for storage efficiency

**Barbara token tracking** (per-session breakdown):
- `BarbaraTokensByUseCase` tracks prompt/completion/total tokens per Barbara function: analysis, topicOverlap, questionSummary, additionalQuestions, sessionSummary
- Stored in `performanceMetrics.barbaraTokens` on each session

**Resume/Review system**:
- Cryptographic resume tokens (32-byte, base64url) for interview recovery with 7-day expiry
- Dedicated resume page at `/resume/:token` validates token and redirects to consent
- Shareable review links with access tokens (64-char tokens)
- 6-dimension rating system: questionClarity, alviaUnderstanding, conversationFlow, comfortLevel, technicalQuality, overallExperience

**Invite-only access system**:
- Platform access controlled via `inviteList` table
- Unauthenticated users see landing page → waitlist form
- Authenticated but uninvited users see waitlist page
- Controlled via `INVITE_ONLY_MODE` env var (default: true)

**Database operations**: All queries go through `DatabaseStorage` class in `server/storage.ts`. Schema definitions in `shared/schema.ts` generate types via `drizzle-zod`.

**API validation**: Zod schemas shared between client form validation and server input validation.

### API Routes Overview

**Auth & Access Control**:
- `GET /api/auth/user` - Current authenticated user
- `GET /api/auth/invite-status` - Check if email is invited or on waitlist
- `POST /api/waitlist` - Submit to waitlist with name and consent fields

**Dashboard & Analytics**:
- `GET /api/dashboard/stats`, `/api/dashboard/enhanced-stats` - Dashboard statistics
- `GET /api/analytics`, `/api/analytics/aggregated` - Cross-project analytics

**CRUD Operations**:
- `/api/projects/*`, `/api/templates/*` - Project and template management
- `/api/collections/*` - Collection management
- `/api/sessions/*`, `/api/segments/*` - Session and segment management

**Analytics Refresh**:
- `POST /api/collections/:collectionId/analytics/refresh`
- `POST /api/templates/:templateId/analytics/refresh`
- `POST /api/projects/:projectId/analytics/refresh`
- Cascade refresh endpoints for template and project levels

**Infographic Generation**:
- `POST /api/collections/:collectionId/infographic/{summary,themes,findings}`
- `POST /api/projects/:projectId/infographic/{summary,themes,insights}`

**Template Generation**:
- `POST /api/templates/generate` - AI-generated template from project context

**Respondent Management**:
- `PATCH /api/respondents/:respondentId/names` - Update respondent names
- `POST /api/collections/:collectionId/respondents/bulk` - Bulk invite

**Interview & Review**:
- `GET /api/interview/:sessionId` - Public interview data fetch
- `GET /api/interview/resume/:token` - Resume interview by token
- `GET /api/invitations/:token` - Get invitation by token
- `POST /api/collections/:collectionId/start-by-token` - Start interview by token
- `POST /api/sessions/:id/review/generate-link` - Generate shareable review link

**Export**:
- `GET /api/sessions/:id/export` - Export session data (JSON/CSV)

**Session Summaries**:
- `POST /api/sessions/:id/generate-summary` - Manually regenerate Barbara session summary

**LLM Usage Tracking**:
- `GET /api/usage/session/:sessionId` - Session-level usage rollups
- `GET /api/usage/collection/:collectionId` - Collection-level usage rollups
- `GET /api/usage/template/:templateId` - Template-level usage rollups
- `GET /api/usage/project/:projectId` - Project-level usage rollups
- `GET /api/usage/session/:sessionId/events` - Raw usage events for a session
- `POST /api/admin/usage/backfill-rollups` - Manual rollup backfill

**Configuration**:
- `GET /api/barbara/config` - Get current Barbara configuration
- `PATCH /api/barbara/config/{global,analysis,topicOverlap,summarisation,sessionSummary}` - Update Barbara config
- `/ws/interview` - WebSocket for live interviews

### Frontend Routes

**Unauthenticated**:
- `/` - Landing page (marketing, features, CTA)

**Authenticated but not invited**:
- Waitlist page (invite-only access gate)

**Authenticated (with sidebar)**:
- `/dashboard`, `/projects`, `/collections`, `/sessions`, `/analytics`, `/settings`
- `/projects/:id`, `/templates/:id`, `/collections/:id`, `/sessions/:id`
- `/projects/:id/edit`, `/projects/new`, `/templates/:id/edit`
- `/projects/:projectId/templates/new` - New template within project

**Public interview flow**:
- `/join/:collectionId` - Consent screen
- `/welcome/:sessionId` - Pre-interview welcome
- `/interview/:sessionId` - Main voice interview
- `/interview/complete` - Completion screen
- `/resume/:token` - Resume interview via token (validates and redirects)
- `/review/:sessionId` - Review by session ID
- `/review/:token` - Review by access token (64-char tokens auto-detected)

### Key Files to Modify

- `shared/schema.ts` - Database tables, types, and relationships
- `server/routes.ts` - REST API endpoints
- `server/voice-interview.ts` - WebSocket + voice provider integration (Alvia), AQ phase, session summaries
- `server/barbara-orchestrator.ts` - Interview orchestrator that guides Alvia, generates AQs and summaries
- `server/realtime-providers.ts` - Voice provider abstraction (OpenAI/Grok)
- `server/llm-usage.ts` - LLM usage tracking and `withTrackedLlmCall()` wrapper
- `server/usage-maintenance.ts` - Automated cleanup and rollup reconciliation jobs
- `server/transcription-quality.ts` - Transcription quality monitoring and VAD tuning
- `server/infographic-service.ts` - Gemini API infographic generation
- `server/storage.ts` - Database operations and access control
- `client/src/App.tsx` - Frontend routing
- `client/src/pages/interview.tsx` - Voice interview UI
- `client/src/pages/analytics.tsx` - Command center analytics
- `client/src/components/analytics/` - Analytics visualization components
- `client/src/components/InfographicGenerator.tsx` - Infographic UI
- `client/src/components/InvitationManager.tsx` - Respondent invitations
- `client/src/components/GenerateTemplateDialog.tsx` - AI template generation

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - For voice interviews (OpenAI provider) and Barbara orchestrator

Optional:
- `GEMINI_API_KEY` - For infographic generation (Google Gemini API)
- `REALTIME_PROVIDER` - Voice provider: "openai" (default) or "xai"
- `XAI_API_KEY` - xAI API key (required if using Grok provider)
- `SESSION_SECRET` - Session encryption key
- `INVITE_ONLY_MODE` - Enable invite-only access (default: true, set "false" to disable)
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - "production" or "development"
- `ISSUER_URL` - OIDC issuer URL (default: `https://replit.com/oidc`)
- `BASE_URL` - Base URL for generated links (defaults to request protocol/host)

## Design System

Reference `design_guidelines.md` for UI patterns. Key points:
- Typography: Inter for UI, JetBrains Mono for technical data
- Spacing: Tailwind units 2, 4, 6, 8, 12, 16
- Icons: Lucide React (formerly Heroicons)
- Components follow shadcn/ui conventions with Radix primitives
- Dark/light theme support via theme-provider
