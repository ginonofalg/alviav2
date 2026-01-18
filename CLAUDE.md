# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alvia is a voice-based AI interview platform built with TypeScript. It enables researchers to conduct AI-powered interviews with real-time transcription. Alvia (the interviewer) uses OpenAI's Realtime API for voice conversations, while Barbara (the orchestrator) monitors transcripts and provides real-time guidance.

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
- **Voice**: OpenAI Realtime API (`gpt-realtime-mini`) over WebSocket
- **Orchestration**: Barbara (configurable models) monitors interviews and guides Alvia
- **Build**: Vite 7.3 with HMR, TypeScript 5.6

### Directory Structure
```
client/src/
  pages/                    # Route components (interview.tsx, analytics.tsx, etc.)
  components/
    ui/                     # Radix UI wrappers (shadcn conventions)
    analytics/              # ThemeCard, InsightPanel, RecommendationsPanel, QuestionAnalysis
    review/                 # DotRating, QuestionReviewCard, RatingSection
  hooks/                    # useAuth, useToast, useMobile
  lib/                      # queryClient, auth-utils, utilities
server/
  routes.ts                 # REST API endpoints (~1160 lines)
  storage.ts                # DatabaseStorage class (~622 lines)
  voice-interview.ts        # WebSocket handler for voice interviews (~1518 lines)
  barbara-orchestrator.ts   # AI analysis and guidance system (~1390 lines)
  resume-token.ts           # Interview resume functionality
  db.ts                     # Drizzle DB connection
  replit_integrations/auth/ # OIDC authentication
shared/
  schema.ts                 # Drizzle schema - source of truth (~514 lines)
  models/auth.ts            # Auth tables (users, sessions)
```

### Database Schema

**Core tables** (defined in `shared/schema.ts`):
- `workspaces`, `workspaceMembers` - Multi-tenant workspace system
- `projects` - Contains objective, audience context, tone, consent settings, PII redaction flags, avoidRules
- `interviewTemplates`, `questions` - Template structure with conditional logic, question types (open, yes_no, scale, numeric, multi_select)
- `collections` - Launched templates with analytics data (JSONB)
- `respondents`, `interviewSessions` - Respondent data and session state
- `segments` - Response storage with transcripts, summaries, key quotes, quality flags
- `redactionMaps` - PII pseudonymization

**Session state persistence fields**: `liveTranscript`, `lastBarbaraGuidance`, `questionStates`, `questionSummaries` (all JSONB)

**Review fields**: `reviewRatings`, `reviewComments`, `reviewAccessToken`

### Key Patterns

**Path aliases**: `@/*` maps to `client/src/*`, `@shared/*` maps to `shared/*`

**Data hierarchy**: Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment

**Voice interview flow**:
1. Respondent joins via `/join/:collectionId` (consent screen)
2. Interview at `/interview/:sessionId` opens WebSocket to `/ws/interview`
3. Server bridges audio between client and OpenAI Realtime API (Alvia)
4. After each respondent utterance, Barbara analyzes the transcript and injects guidance to Alvia (probe deeper, move on, acknowledge prior context)
5. Responses saved as Segments with transcripts, summaries, and extracted values
6. State persisted every 2 seconds for crash recovery via resume tokens

**Barbara orchestrator** (`server/barbara-orchestrator.ts`):
- Three configurable use cases: analysis, topicOverlap, summarisation
- Each has: model, verbosity (low|medium|high), reasoning effort (minimal|low|medium|high)
- Allowed models: gpt-5-mini, gpt-5, gpt-4o, gpt-4o-mini, o1, o1-mini, o1-pro, o3-mini
- Key functions: `analyzeWithBarbara()`, `generateQuestionSummary()`, `detectTopicOverlap()`
- Outputs: guidance actions, question summaries with verbatims, quality scores

**Analytics system**:
- Collection-level analytics stored in `analyticsData` JSONB
- Includes: enhanced themes with verbatims, key findings, consensus/divergence, recommendations
- Staleness detection via `lastAnalyzedAt` and `analyzedSessionCount`

**Resume/Review system**:
- Cryptographic resume tokens for interview recovery
- Shareable review links with access tokens
- 6-dimension rating system for post-interview feedback

**Database operations**: All queries go through `DatabaseStorage` class in `server/storage.ts`. Schema definitions in `shared/schema.ts` generate types via `drizzle-zod`.

**API validation**: Zod schemas shared between client form validation and server input validation.

### API Routes Overview

- `/api/dashboard/*`, `/api/analytics` - Dashboard and analytics
- `/api/projects/*`, `/api/templates/*` - Project and template CRUD
- `/api/collections/*` - Collection management and analytics refresh
- `/api/sessions/*`, `/api/segments/*` - Session and segment management
- `/api/interview/*` - Public interview endpoints, resume tokens
- `/api/review/*` - Post-interview review system
- `/api/barbara/config` - Runtime Barbara configuration
- `/ws/interview` - WebSocket for live interviews

### Frontend Routes

**Authenticated (with sidebar)**:
- `/dashboard`, `/projects`, `/collections`, `/sessions`, `/analytics`, `/settings`
- `/projects/:id`, `/templates/:id`, `/collections/:id`, `/sessions/:id`

**Public interview flow**:
- `/join/:collectionId` - Consent screen
- `/welcome/:sessionId` - Pre-interview welcome
- `/interview/:sessionId` - Main voice interview
- `/interview/complete` - Completion screen
- `/review/:sessionId` or `/review/:token` - Post-interview review

### Key Files to Modify

- `shared/schema.ts` - Database tables and relationships
- `server/routes.ts` - REST API endpoints
- `server/voice-interview.ts` - WebSocket + OpenAI Realtime integration (Alvia)
- `server/barbara-orchestrator.ts` - Interview orchestrator that guides Alvia
- `client/src/App.tsx` - Frontend routing
- `client/src/pages/interview.tsx` - Voice interview UI
- `client/src/components/analytics/` - Analytics visualization components

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - For voice interviews

## Design System

Reference `design_guidelines.md` for UI patterns. Key points:
- Typography: Inter for UI, JetBrains Mono for technical data
- Spacing: Tailwind units 2, 4, 6, 8, 12, 16
- Icons: Lucide React (formerly Heroicons)
- Components follow shadcn/ui conventions with Radix primitives
