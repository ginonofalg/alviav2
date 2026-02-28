# Alvia - Voice-Based AI Interview Platform

## Overview

Alvia is a TypeScript-based, voice-powered AI interview platform for researchers. It conducts AI-driven interviews with real-time transcription, using Alvia (the AI interviewer) for conversations and Barbara (the orchestrator) for real-time guidance. The platform provides robust analytics, LLM usage tracking, and a flexible architecture to support various research needs, aiming to revolutionize qualitative research through scalable, consistent, and data-rich interviewing experiences.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

**UI/UX**: React 18, Wouter, TanStack React Query, Radix UI, Tailwind CSS, Framer Motion. UI components adhere to shadcn/ui conventions with Radix primitives, supporting dark/light themes. Typography uses Inter and JetBrains Mono.

**Technical Implementations**:
-   **Frontend**: React 18, Wouter, TanStack React Query, Radix UI, Tailwind CSS, Framer Motion.
-   **Backend**: Express.js with WebSocket support for real-time interactions.
-   **Database**: PostgreSQL with Drizzle ORM for all data, including multi-tenant workspaces, project configurations, and LLM usage logs.
-   **Authentication**: Clerk (Express.js middleware + React SDK) with stateless JWTs. Sign-in via Email/Password or Google OAuth. User sync with transactional ID remap for returning users.

**Feature Specifications**:
-   **Voice Interview Flow**: Respondents connect via WebSocket for real-time audio interaction. The server bridges audio to AI voice providers. Barbara analyzes respondent utterances in real-time, injecting guidance to Alvia (e.g., probe deeper, move on) and dynamically generating follow-up questions. Interview state is persisted every 2 seconds for crash recovery. Transcription quality is monitored in real-time. The MicButton displays an 8-bit pixel art avatar of Alvia that changes based on interview state (listening, talking, paused, connecting, text_mode, silence, noisy, thinking, ready, offline, reconnecting). Avatar images are in `client/src/assets/alvia/`, registered in `client/src/lib/alvia-avatar-registry.ts`, with state resolution via `client/src/hooks/use-alvia-avatar.ts`. Variant rotation (10s interval) is supported by adding `_2.png`, `_3.png` suffixes.
-   **Digital Respondent Simulation**: Allows researchers to test interview questions with LLM-powered personas, reusing Barbara's orchestration functions. It operates asynchronously using the ChatCompletions API for cost efficiency.
-   **AI Persona Generation**: A two-phase pipeline researches target populations via LLMs and synthesizes diverse personas, with post-generation diversity validation. Population briefs are persisted to the database with provenance tracking (`isUngrounded` flag, `populationBriefId` FK on personas). Users can retrieve and reuse existing briefs via a brief selection UI in the generation dialog, skipping the 10-minute research step. The brief selection view shows expandable cards with demographics, suggested profiles, behavioral patterns, biases, domain knowledge, and sources.
-   **Paste-to-Questions Feature**: Enables users to paste unstructured text into the template builder, which an LLM then parses into structured interview questions with voice-optimized phrasing, interviewer guidance, and question type detection. It includes confidence scoring, deduplication, and suggested objective synthesis.
-   **Branded Interview Welcome Page**: Projects have an optional `brandingLogo` (base64 data URL, text column) and optional `brandingColors` (JSONB column with `primary`, `background`, `foreground`, and optional `accent` hex strings). Users upload a logo via the "Branding" tab on the project edit page, which opens a crop dialog (react-easy-crop, 1:1 aspect, 256x256 WebP output). Colors can be picked manually (react-colorful hex picker) or auto-extracted from the branding logo via Canvas API dominant color sampling. On the interview welcome page, if a logo exists, it renders prominently with a "Powered by Alvia" badge below; otherwise a default Bot icon is shown. When `brandingColors` is set, `BrandingThemeProvider` wraps the public interview pages (consent, welcome, interview, complete), overriding CSS custom properties (--primary, --background, --foreground, --accent, and ~15 derived variables) to match the brand. The complete page reads colors from `sessionStorage` since it lacks direct session context. The `GET /api/interview/:sessionId`, resume, and `GET /api/collections/:id/public` endpoints include both `brandingLogo` and `brandingColors` from the project. Key files: `client/src/components/ImageCropDialog.tsx`, `client/src/components/BrandedWelcomeAvatar.tsx`, `client/src/components/BrandingThemeProvider.tsx`, `client/src/components/BrandingColorPicker.tsx`, `client/src/lib/image-utils.ts`, `client/src/lib/color-utils.ts`.

**System Design Choices**:
-   **Data Hierarchy**: Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment.
-   **Voice Provider Abstraction**: A `RealtimeProvider` interface allows switching between different AI voice providers.
-   **Barbara Orchestrator**: Manages configurable use cases for real-time analysis, topic overlap detection, summarization, template generation, and session summaries, with dynamic model and verbosity settings.
-   **Hierarchical Analytics System**: Provides collection-level, template-level, project-level, and aggregated command center analytics with staleness tracking.
-   **LLM Usage Tracking**: Billing-grade event logging for all LLM calls with attribution and hourly rollups.
-   **API Validation**: Zod schemas are used for shared validation between client and server.
-   **Database Operations**: All database interactions are centralized through a `DatabaseStorage` class implementing an `IStorage` interface.
-   **Analytics Session Scope Filtering**: Analytics endpoints support filtering by real, simulated, or combined sessions.

## Database Architecture

-   **Dev Database**: Local PostgreSQL (`heliumdb` on host `helium`) — accessed via `DATABASE_URL` env var or `executeSql()` tool.
-   **Production Database**: Neon PostgreSQL — accessed via `PRODUCTION_DATABASE_URL` secret. Can be queried from dev via `psql "$PRODUCTION_DATABASE_URL"`.
-   **LLM Usage Dedup**: The `llm_usage_events` table has a unique partial index on `request_id` (where not null) to prevent duplicate event recording. The `response.done` handler also deduplicates in-memory via `processedResponseIds` Set on `InterviewState`.

## External Dependencies

-   **OpenAI API**: Used for Alvia's voice conversations (e.g., `gpt-realtime-mini`) and Barbara's orchestration logic (various GPT models like `gpt-5-mini`, `gpt-4o`).
-   **xAI Grok API**: An alternative voice provider (e.g., `grok-3-fast`) for Alvia.
-   **Google Gemini API**: Used for generating AI-powered visual summaries (infographics) (e.g., `gemini-3-pro-image-preview`).
-   **PostgreSQL**: The primary database for all application data (dev: local, production: Neon).
-   **Clerk**: For user authentication (stateless JWTs, EU data residency).
-   **jsPDF**: For generating PDF exports of analytics reports.