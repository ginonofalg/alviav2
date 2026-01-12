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
- **Frontend**: React 18, Wouter (routing), React Query, Radix UI, Tailwind CSS
- **Backend**: Express.js with WebSocket support
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit OpenID Connect via Passport
- **Voice**: OpenAI Realtime API (`gpt-realtime-mini`) over WebSocket
- **Orchestration**: Barbara (`gpt-5-mini`) monitors interviews and guides Alvia

### Directory Structure
```
client/src/           # React frontend
  pages/              # Route components
  components/ui/      # Radix UI wrappers (shadcn conventions)
  hooks/              # useAuth, useToast, useMobile
  lib/                # queryClient, utilities
server/               # Express backend
  routes.ts           # API endpoints
  storage.ts          # DatabaseStorage class (all DB operations)
  voice-interview.ts  # WebSocket handler for voice interviews
  replit_integrations/auth/  # OIDC authentication
shared/               # Isomorphic code
  schema.ts           # Drizzle schema (source of truth for DB types)
```

### Key Patterns

**Path aliases**: `@/*` maps to `client/src/*`, `@shared/*` maps to `shared/*`

**Data hierarchy**: Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment

**Voice interview flow**:
1. Respondent joins via `/join/:collectionId` (consent screen)
2. Interview at `/interview/:sessionId` opens WebSocket to `/ws/interview`
3. Server bridges audio between client and OpenAI Realtime API (Alvia)
4. After each respondent utterance, Barbara analyzes the transcript and injects guidance to Alvia (probe deeper, move on, acknowledge prior context)
5. Responses saved as Segments with transcripts, summaries, and extracted values

**Database operations**: All queries go through `DatabaseStorage` class in `server/storage.ts`. Schema definitions in `shared/schema.ts` generate types via `drizzle-zod`.

**API validation**: Zod schemas shared between client form validation and server input validation.

### Key Files to Modify

- `shared/schema.ts` - Database tables and relationships
- `server/routes.ts` - REST API endpoints
- `server/voice-interview.ts` - WebSocket + OpenAI Realtime integration (Alvia)
- `server/barbara-orchestrator.ts` - Interview orchestrator that guides Alvia
- `client/src/App.tsx` - Frontend routing

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
