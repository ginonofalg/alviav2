# Alvia - Voice-Based AI Interview Platform

## Overview

Alvia is a TypeScript-based, voice-powered AI interview platform designed for researchers. It facilitates AI-driven interviews with real-time transcription. Alvia (the AI interviewer) conducts conversations using advanced AI voice APIs, while Barbara (the orchestrator) provides real-time guidance by monitoring transcripts. The platform includes robust analytics, LLM usage tracking, and a flexible architecture to support various research needs. The project aims to revolutionize qualitative research by enabling scalable, consistent, and data-rich interviewing experiences.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

**Frontend**: React 18, Wouter, TanStack React Query, Radix UI, Tailwind CSS, Framer Motion. UI components follow shadcn/ui conventions with Radix primitives, supporting dark/light themes. Typography uses Inter and JetBrains Mono.

**Backend**: Express.js with WebSocket support for real-time interactions.

**Database**: PostgreSQL with Drizzle ORM, serving as the source of truth for all data including multi-tenant workspaces, project configurations, interview templates, session states, and LLM usage logs.

**Authentication**: Replit OpenID Connect via Passport, with sessions stored in PostgreSQL. Features an invite-only access system with waitlist functionality.

**Voice Interview Flow**:
1.  **Connection**: Respondents connect via WebSocket, with client-side hooks for audio playback, reconnection, and silence detection.
2.  **Real-time Interaction**: The server bridges audio between the client and the selected voice provider (OpenAI or xAI Grok).
3.  **Barbara Orchestration**: After each respondent utterance, Barbara analyzes the transcript and injects real-time guidance to Alvia (e.g., probe deeper, move on).
4.  **Dynamic Questioning**: Barbara can generate additional follow-up questions at the end of the interview based on contextual gaps.
5.  **State Persistence**: Interview state is persisted every 2 seconds for crash recovery, supporting resume tokens.
6.  **Transcription Quality**: Real-time monitoring for garbled audio, noise, and other quality issues, triggering environment checks and VAD adjustments.

**Key Architectural Patterns**:
-   **Data Hierarchy**: Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment.
-   **Voice Provider Abstraction**: A `RealtimeProvider` interface allows switching between OpenAI and xAI Grok via environment variables.
-   **Barbara Orchestrator**: Manages eight configurable use cases for real-time analysis, topic overlap detection, summarization, template generation, additional questions, and session summaries, with dynamic model and verbosity settings.
-   **Hierarchical Analytics System**: Provides collection-level, template-level, project-level, and aggregated command center analytics, with staleness tracking and cascade refresh capabilities.
-   **LLM Usage Tracking**: Billing-grade event logging for all LLM calls to `llmUsageEvents` with full attribution and hourly rollups for performance and cost analysis.
-   **API Validation**: Zod schemas are used for shared validation between client and server.
-   **Database Operations**: All database interactions are centralized through a `DatabaseStorage` class implementing an `IStorage` interface.

## External Dependencies

-   **OpenAI API**: Used for Alvia's voice conversations (`gpt-realtime-mini`) and Barbara's orchestration logic (various GPT models like `gpt-5-mini`, `gpt-4o`).
-   **xAI Grok API**: Alternative voice provider (`grok-3-fast`) for Alvia.
-   **Google Gemini API**: Used for generating AI-powered visual summaries (infographics) (`gemini-3-pro-image-preview`, `gemini-2.5-flash-image`).
-   **PostgreSQL**: The primary database for all application data.
-   **Replit OpenID Connect**: For user authentication.
-   **jsPDF**: For generating PDF exports of analytics reports.

## Recent Changes

### Guided Onboarding Flow (February 2026)
Added a hybrid onboarding system for new users:
- **Welcome Dialog**: 4-slide step-based dialog shown once on first login (`client/src/components/onboarding/WelcomeDialog.tsx`). Covers platform intro, AI team (Alvia/Barbara), workflow, and first steps. Includes "Explore the Demo" CTA that links to the auto-seeded demo project.
- **Dashboard Onboarding Card**: Progress checklist above dashboard stats grid (`client/src/components/onboarding/OnboardingDashboardCard.tsx`). 4 milestones: explore demo, create project, add template, launch collection. Milestones derived from actual data counts. Dismissable.
- **Contextual Field Guides**: Collapsible banners on creation pages (`client/src/components/onboarding/OnboardingFieldGuide.tsx`) explaining which fields matter most for AI quality. Shown on project-new, template-builder (create mode only), and collection-new pages.
- **State**: `onboardingState` JSONB column on users table stores dismissal flags and explicit milestone flags (`firstProjectCreated`, `firstTemplateCreated`, `firstCollectionCreated`). Milestones use a hybrid approach: explicit flags OR count-based thresholds (>1 for projects/templates to account for demo seed data). `completedAt` is auto-set when all 4 milestones are satisfied. Hook: `client/src/hooks/use-onboarding.ts`. API: `PATCH /api/auth/onboarding`.
- **Milestone tracking**: Creation pages (project-new, template-builder, collection-new) call `updateOnboarding()` in their `onSuccess` callbacks to set explicit milestone flags.
- **Animations**: Framer Motion slide transitions in WelcomeDialog, collapse/expand animation on OnboardingFieldGuide.
- **Reset onboarding**: Available in Settings page to re-trigger the full onboarding flow.
- **Existing user handling**: Users with no `onboardingState` but >1 project are treated as existing users and skip onboarding.
- **Icons**: Alvia = Mic, Barbara = Eye (monitoring/orchestration).

### Barbara Guidance Log (February 2026)
Added Phase 1 of guidance effectiveness tracking:
- **Schema**: `barbaraGuidanceLog` JSONB column on `interviewSessions` table. Stores an append-only array of `BarbaraGuidanceLogEntry` objects.
- **Types**: `BarbaraGuidanceAction` union type and `BarbaraGuidanceLogEntry` type in `shared/types/interview-state.ts`. Each entry captures: index, action, messageSummary (truncated to 500 chars), confidence, injected (confidence > 0.6 and action !== "none"), timestamp, questionIndex, triggerTurnIndex.
- **Integration**: Log entries are appended in `persistBarbaraGuidance()` and the environment check guidance path in `voice-interview.ts`. Included in both debounced persistence and direct Barbara guidance persistence calls. Restored from DB on session resume.
- **Backward compatibility**: Existing sessions have `null` for the column. Restore logic handles this gracefully (treats as `[]`).