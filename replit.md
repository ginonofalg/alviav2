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