# Alvia - Voice-Based AI Interview Platform

## Overview

Alvia is a voice-based AI interview platform that enables researchers to conduct AI-powered interviews with real-time transcription. The platform uses OpenAI's GPT-4o Real-time API to facilitate natural voice conversations, automatically transcribing and analyzing responses. The system is designed for qualitative research at scale, with features for consent management, PII redaction, and cross-interview analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Tech Stack
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack React Query for data fetching, Radix UI components with shadcn/ui conventions, Tailwind CSS for styling
- **Backend**: Express.js server with WebSocket support for real-time voice communication
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Replit OpenID Connect via Passport.js with session storage in PostgreSQL
- **Voice Processing**: OpenAI GPT-4o Real-time API over WebSocket for live interview conversations

### Directory Structure
```
client/src/           # React frontend application
  pages/              # Route page components
  components/ui/      # Radix UI wrapper components (shadcn conventions)
  hooks/              # Custom hooks (useAuth, useToast, useMobile)
  lib/                # Utilities and queryClient configuration
server/               # Express backend
  routes.ts           # API endpoint definitions
  storage.ts          # DatabaseStorage class for all DB operations
  voice-interview.ts  # WebSocket handler for voice interviews
  barbara-orchestrator.ts # AI orchestration for interview guidance
  replit_integrations/auth/  # OIDC authentication setup
shared/               # Isomorphic code shared between client and server
  schema.ts           # Drizzle schema (single source of truth for DB types)
  models/auth.ts      # User and session models for authentication
```

### Path Aliases
- `@/*` maps to `client/src/*`
- `@shared/*` maps to `shared/*`

### Data Model Hierarchy
The core data model follows this hierarchy:
**Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment**

- Workspaces contain multiple projects and have retention policies
- Projects define interview objectives, tone, and privacy settings
- InterviewTemplates contain ordered questions with guidance notes
- Collections group interview sessions for a specific template deployment
- InterviewSessions track individual respondent interviews with consent and timing
- Segments store per-question responses with transcripts, summaries, and quality flags

### Key Design Patterns
- **Storage abstraction**: All database operations go through the `DatabaseStorage` class in `server/storage.ts`
- **Real-time communication**: WebSocket server on `/ws/interview` handles voice interview sessions
- **Form validation**: Zod schemas with react-hook-form for type-safe form handling
- **API pattern**: REST endpoints under `/api/*` with authentication middleware
- **Component library**: shadcn/ui components built on Radix primitives with Tailwind styling
- **Lag-by-one-turn guidance**: Barbara's orchestrator analysis runs asynchronously (non-blocking). Her guidance is injected into session instructions and applies to Alvia's NEXT response, not the current one. This eliminates response latency while keeping guidance contextually relevant.

## External Dependencies

### Required Services
- **PostgreSQL Database**: Primary data store (connection via `DATABASE_URL` environment variable)
- **OpenAI API**: Powers voice interviews via GPT-4o Real-time API and interview guidance via GPT models (`OPENAI_API_KEY` environment variable)
- **Gemini API**: Powers infographic generation using the `gemini-3-pro-image-preview` model (`GEMINI_API_KEY` environment variable)
- **Replit Authentication**: OpenID Connect for user authentication (`ISSUER_URL`, `REPL_ID`, `SESSION_SECRET` environment variables)

### Development Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type check | `npm run check` |
| Build for production | `npm run build` |
| Start production | `npm run start` |
| Push DB schema | `npm run db:push` |

The development server runs on port 5000 with Vite HMR for frontend hot reloading.

## Recent Changes

### Multi-Level Analytics System (January 2026)
Expanded analytics capability from Collection level to Template and Project levels:

- **Collection Analytics**: Individual collection insights (themes, questions, quality scores)
- **Template Analytics**: Aggregates collection data with comparison and question consistency analysis (uses gpt-5-mini for fast processing)
- **Project Analytics**: AI-powered cross-template theme extraction and strategic insights (uses gpt-5 with medium reasoning for deep analysis)

Key files:
- `shared/schema.ts`: TemplateAnalytics, ProjectAnalytics types
- `server/barbara-orchestrator.ts`: generateTemplateAnalytics(), generateProjectAnalytics(), LLM config
- `client/src/components/analytics/TemplateAnalyticsView.tsx`: Template analytics UI
- `client/src/components/analytics/ProjectAnalyticsView.tsx`: Project analytics UI with executive summary

Analytics hierarchy: Collection → Template (aggregates collections) → Project (aggregates templates with AI synthesis)

### Template Analytics Detail Preservation (January 2026)
Enhanced Template analytics to preserve ALL collection-level detail through deterministic aggregation (no AI selection):

**Schema Enhancements**:
- `AggregatedThemeWithDetail`: Includes verbatims, depth, isEmergent, collectionSources, sentimentBreakdown
- `KeyFindingWithSource`, `ConsensusPointWithSource`, `DivergencePointWithSource`: Finding types with sourceCollectionId/Name attribution
- `QuestionConsistency`: Now includes verbatims and primaryThemes arrays

**Backend Changes** (`server/barbara-orchestrator.ts`):
- `generateTemplateAnalytics()` performs purely deterministic aggregation (no LLM calls)
- Collects ALL verbatims (limited 5 per collection per theme, 15 total per theme)
- Aggregates keyFindings, consensusPoints, divergencePoints with source attribution

**UI Enhancements** (`TemplateAnalyticsView.tsx`):
- New "Insights" tab showing aggregated Key Findings, Consensus Points, Divergence Points
- Enhanced Theme cards with depth indicators, emergent badges, and expandable verbatim sections
- Question Consistency cards now show verbatims and primary themes
- Cards for KeyFinding, Consensus, and Divergence with expandable supporting quotes

Design intent: Template analytics remains "fast" (deterministic aggregation) while Project analytics uses AI for cross-template synthesis

### Project Analytics Data Enrichment (January 2026)
Fixed a critical gap where Project-level analytics was receiving sparse data for LLM analysis:

**Problem**: The `extractCrossTemplateThemesWithAI` function was only passing basic theme info (name, mentions, sentiment) to the LLM, missing:
- Template questions
- Theme descriptions and verbatims
- Key findings, consensus/divergence points
- Question consistency data

**Solution** (`server/barbara-orchestrator.ts`):
- Extended `ProjectAnalyticsInput` to include `questions: Question[]` for each template
- Enriched `templateSummaries` with full detail:
  - Questions (15 max per template, with text, type, guidance)
  - Themes (10 max) with descriptions, verbatims (3 each), depth, sentiment breakdowns
  - Key findings (8 max) with supporting verbatims (2 each)
  - Consensus points (6 max) with verbatims
  - Divergence points (6 max) with perspectives and verbatims
  - Question consistency (10 max) with representative verbatims
- Updated system prompt to guide LLM on leveraging the richer data
- Added logging for data stats and token estimation

**Routes Change** (`server/routes.ts`):
- Project analytics refresh now fetches template questions via `storage.getQuestionsByTemplate()`

This enables the LLM to produce grounded, verbatim-supported strategic insights at the Project level

### Strategic Context Feature (January 2026)
Added ability for users to provide business context to receive tailored analytics recommendations:

**Schema Changes** (`shared/schema.ts`):
- `contextTypeEnum`: pgEnum with values [content, product, marketing, cx, other]
- `projects.strategicContext`: Text field for business context description
- `projects.contextType`: References contextTypeEnum for type-safe context categorization
- `ContextualRecommendations`: New type with actionItems, curatedVerbatims, strategicSummary

**New Routes**:
- `GET /projects/:id/edit` - Project edit page with tabbed UI
- `PATCH /api/projects/:id` - Update project endpoint

**Frontend Changes**:
- `client/src/pages/project-new.tsx`: 3-step project creation with optional strategic context step
- `client/src/pages/project-edit.tsx`: Tabbed edit page with Details, Settings, and Strategic Context tabs
- `client/src/components/analytics/ProjectAnalyticsView.tsx`: New "Tailored" tab displaying contextual recommendations

**Backend Changes** (`server/barbara-orchestrator.ts`):
- `generateProjectAnalytics()` now includes strategic context in LLM prompt when available
- Returns `contextualRecommendations` with actionItems (high/medium/low priority), curatedVerbatims, and strategicSummary

**Context Types**:
- `content`: Content Strategy (newsletters, blogs, social media)
- `product`: Product Development (features, roadmap)
- `marketing`: Marketing & Positioning (messaging, campaigns)
- `cx`: Customer Experience (support, satisfaction)
- `other`: Other use cases

### Test Harness for Analytics Testing (January 2026)
Added comprehensive test harness for populating database with realistic interview data:

**Directory**: `scripts/seed-test-data/`
- `index.ts`: CLI orchestrator with flags
- `config.ts`: LLM settings (gpt-5-mini), quality distributions
- `scenarios.ts`: Two research scenarios (Product Discovery, Customer Experience)
- `generators/structure.ts`: Creates workspace → project → template → questions → collection
- `generators/personas.ts`: LLM-generated respondent personas with quality tendencies
- `generators/conversations.ts`: Multi-turn interview simulation with follow-up depth tracking
- `generators/summaries.ts`: Question summaries, verbatims, quality scores
- `utils/timestamps.ts`: Session timing utilities

**CLI Usage**:
```bash
npx tsx scripts/seed-test-data/index.ts [options]
  --dry-run         Preview without writing to database
  --scenario=NAME   Filter scenarios by name (Product, Customer)
  --count=N         Number of respondents per scenario
  --user=ID         Owner user ID for workspaces (for UI access)
  --clean           Clean previous test data first
```

**Key Features**:
- Quality distribution: 45% high, 30% moderate, 15% brief, 10% off-topic
- Follow-up depth tracking aligned with template settings
- Generates transcripts, segments, and session data suitable for analytics refresh testing
- Supports all three analytics levels: Collection, Template, Project

### Analytics Command Center Enhancement (January 2026)
Enhanced the top-level Analytics page (/analytics) with comprehensive cross-project aggregation:

**API Endpoint** (`GET /api/analytics/aggregated`):
Returns aggregated analytics from all projects with:
- `strategicInsights`: Cross-project strategic insights with source attribution
- `keyFindings`: Aggregated key findings from all template analytics
- `consensusPoints`: Points of agreement with source project/template/collection attribution
- `divergencePoints`: Points of divergence with multiple perspectives
- `strategicThemes`: Cross-template themes with verbatims and sentiment
- `templateStaleness`: Templates needing analytics refresh (stale/none status)
- `collectionStaleness`: Collections needing analytics refresh with session counts
- `contextualRecommendations`: Tailored recommendations from projects with strategic context
- `overallMetrics`: Totals for projects, templates, collections, sessions, quality scores
- `healthIndicators`: Counts for stale/missing analytics at each level

**Types Added** (`shared/schema.ts`):
- `AggregatedConsensusPoint`: Consensus point with sourceType, sourceProjectId/Name, sourceTemplateId/Name, sourceCollectionId/Name
- `AggregatedDivergencePoint`: Divergence point with perspectives array and source attribution
- `TemplateStaleness`: Template ID, name, project name, staleness status, generatedAt timestamp
- `CollectionStaleness`: Collection ID, name, template/project names, session count, staleness status

**Storage Method** (`server/storage.ts`):
- `getAggregatedAnalytics(userId)`: Gathers analytics from all projects, templates, collections
- Calculates staleness status (fresh <24h, aging 1-7d, stale >7d, none)
- Aggregates consensus/divergence points with source attribution

**UI Enhancements** (`client/src/pages/analytics.tsx`):
- Insights Feed now shows 4 insight types: Strategic (purple), Finding (gray), Consensus (green), Divergence (amber)
- Research Health tab displays template/collection staleness lists with quick navigation
- Analytics Health stat card shows breakdown: Projects/Templates/Collections needing refresh