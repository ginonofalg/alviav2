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
- **Infographics**: Google Gemini API for AI-generated visual summaries
- **PDF Export**: jsPDF for analytics report generation
- **Build**: Vite 7.3 with HMR, TypeScript 5.6

### Directory Structure
```
client/src/
  pages/                    # Route components (24 pages total)
    analytics.tsx           # Command center/aggregated analytics
    collection-detail.tsx   # Collection management with PDF export
    session-detail.tsx      # Session management and review
    project-detail.tsx      # Project overview
    interview.tsx           # Voice interview UI
    ...
  components/
    ui/                     # Radix UI wrappers (shadcn conventions, 27+ primitives)
    analytics/              # Analytics visualization
      ThemeCard.tsx
      InsightPanel.tsx
      RecommendationsPanel.tsx
      QuestionAnalysis.tsx
      AnalyticsPdfExport.tsx      # PDF report generation
      ProjectAnalyticsView.tsx    # Project-level analytics
      TemplateAnalyticsView.tsx   # Template-level analytics
    review/                 # DotRating, QuestionReviewCard, RatingSection
    InfographicGenerator.tsx      # AI-generated visual summaries
    InvitationManager.tsx         # Bulk respondent invitations with QR codes
    app-sidebar.tsx               # Main navigation sidebar
    theme-provider.tsx            # Dark/light theme support
    hierarchy-nav.tsx             # Breadcrumb navigation
  hooks/                    # useAuth, useToast, useMobile
  lib/                      # queryClient, auth-utils, utilities
server/
  index.ts                  # Server entry point
  routes.ts                 # REST API endpoints (~2200 lines)
  storage.ts                # DatabaseStorage class (~1400 lines)
  voice-interview.ts        # WebSocket handler for voice interviews (~1600 lines)
  barbara-orchestrator.ts   # AI analysis and guidance system (~2500 lines)
  infographic-service.ts    # Google Gemini API integration
  infographic-prompts.ts    # Prompt templates for infographics
  resume-token.ts           # Interview resume functionality
  db.ts                     # Drizzle DB connection
  vite.ts                   # Vite integration utilities
  static.ts                 # Static file serving
  replit_integrations/auth/ # OIDC authentication
shared/
  schema.ts                 # Drizzle schema - source of truth (~900 lines)
  models/auth.ts            # Auth tables (users, sessions)
```

### Database Schema

**Core tables** (defined in `shared/schema.ts`):
- `workspaces`, `workspaceMembers` - Multi-tenant workspace system
- `projects` - Contains objective, audience context, tone, consent settings, PII redaction flags, avoidRules, strategicContext, contextType
- `interviewTemplates`, `questions` - Template structure with conditional logic, question types (open, yes_no, scale, numeric, multi_select)
- `collections` - Launched templates with analytics data (JSONB)
- `respondents`, `interviewSessions` - Respondent data and session state
- `segments` - Response storage with transcripts, summaries, key quotes, quality flags
- `redactionMaps` - PII pseudonymization

**Session state persistence fields**: `liveTranscript`, `lastBarbaraGuidance`, `questionStates`, `questionSummaries` (all JSONB)

**Review fields**: `reviewRatings`, `reviewComments`, `reviewAccessToken`, `researcherNotes`, `reviewFlags`

**Review flags enum**: `needs_review`, `flagged_quality`, `verified`, `excluded`

**Context types enum**: `content`, `product`, `marketing`, `cx`, `other`

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

**Analytics system** (hierarchical):
- **Collection-level**: `CollectionAnalytics` - themes, keyFindings, questionPerformance, recommendations
- **Template-level**: `TemplateAnalytics` - aggregated themes, consistency metrics across collections
- **Project-level**: `ProjectAnalytics` - cross-template synthesis, contextual recommendations
- **Command center**: `AggregatedAnalytics` - cross-project insights
- Staleness tracking via `StalenessStatus` type, `lastAnalyzedAt`, `analyzedSessionCount`

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

**Invitation manager**:
- Bulk respondent invitations via CSV or manual entry
- QR code generation for easy access
- Tracks invitation status through lifecycle

**Resume/Review system**:
- Cryptographic resume tokens for interview recovery
- Shareable review links with access tokens (64-char tokens)
- 6-dimension rating system for post-interview feedback

**Database operations**: All queries go through `DatabaseStorage` class in `server/storage.ts`. Schema definitions in `shared/schema.ts` generate types via `drizzle-zod`.

**API validation**: Zod schemas shared between client form validation and server input validation.

### API Routes Overview

**Dashboard & Analytics**:
- `/api/dashboard/*`, `/api/dashboard/enhanced-stats` - Dashboard statistics
- `/api/analytics`, `/api/analytics/aggregated` - Cross-project analytics

**CRUD Operations**:
- `/api/projects/*`, `/api/templates/*` - Project and template management
- `/api/collections/*` - Collection management
- `/api/sessions/*`, `/api/segments/*` - Session and segment management

**Analytics Refresh**:
- `POST /api/collections/:collectionId/analytics/refresh`
- `POST /api/templates/:templateId/analytics/refresh`
- `POST /api/projects/:projectId/analytics/refresh`

**Infographic Generation**:
- `POST /api/collections/:collectionId/infographic/{summary,themes,findings}`
- `POST /api/projects/:projectId/infographic/{summary,themes,insights}`

**Respondent Management**:
- `PATCH /api/respondents/:respondentId/names` - Update respondent names
- `POST /api/collections/:collectionId/respondents/bulk` - Bulk invite

**Interview & Review**:
- `/api/interview/*` - Public interview endpoints, resume tokens
- `/api/review/*` - Post-interview review system
- `POST /api/sessions/:id/review/generate-link` - Generate shareable review link
- `POST /api/collections/:collectionId/start-by-token` - Start interview by token

**Export**:
- `/api/sessions/:id/export` - Export session data (JSON/CSV)

**Configuration**:
- `/api/barbara/config` - Runtime Barbara configuration
- `/ws/interview` - WebSocket for live interviews

### Frontend Routes

**Authenticated (with sidebar)**:
- `/dashboard`, `/projects`, `/collections`, `/sessions`, `/analytics`, `/settings`
- `/projects/:id`, `/templates/:id`, `/collections/:id`, `/sessions/:id`
- `/projects/:id/edit`, `/projects/new`, `/templates/:id/edit`

**Public interview flow**:
- `/join/:collectionId` - Consent screen
- `/welcome/:sessionId` - Pre-interview welcome
- `/interview/:sessionId` - Main voice interview
- `/interview/complete` - Completion screen
- `/review/:sessionId` - Review by session ID
- `/review/:token` - Review by access token (64-char tokens auto-detected)

### Key Files to Modify

- `shared/schema.ts` - Database tables and relationships
- `server/routes.ts` - REST API endpoints
- `server/voice-interview.ts` - WebSocket + OpenAI Realtime integration (Alvia)
- `server/barbara-orchestrator.ts` - Interview orchestrator that guides Alvia
- `server/infographic-service.ts` - Gemini API infographic generation
- `client/src/App.tsx` - Frontend routing
- `client/src/pages/interview.tsx` - Voice interview UI
- `client/src/pages/analytics.tsx` - Command center analytics
- `client/src/components/analytics/` - Analytics visualization components
- `client/src/components/InfographicGenerator.tsx` - Infographic UI
- `client/src/components/InvitationManager.tsx` - Respondent invitations

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - For voice interviews and Barbara orchestrator
- `GEMINI_API_KEY` - For infographic generation (Google Gemini API)

## Design System

Reference `design_guidelines.md` for UI patterns. Key points:
- Typography: Inter for UI, JetBrains Mono for technical data
- Spacing: Tailwind units 2, 4, 6, 8, 12, 16
- Icons: Lucide React (formerly Heroicons)
- Components follow shadcn/ui conventions with Radix primitives
- Dark/light theme support via theme-provider
