# Alvia - Voice-Based AI Interview Platform

## Overview

Alvia is a voice-based AI interview platform designed for qualitative research at scale. It utilizes OpenAI's GPT-4o Real-time API for natural voice conversations, automatically transcribing and analyzing responses. The platform includes features for consent management, PII redaction, cross-interview analysis, and an advanced analytics system to derive insights from interview data across multiple levels (Collection, Template, Project). It also supports an invitation system for targeted respondent recruitment and a strategic context feature for tailored analytics recommendations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Tech Stack
- **Frontend**: React 18 with TypeScript, Wouter, TanStack React Query, Radix UI (shadcn/ui), Tailwind CSS
- **Backend**: Express.js with WebSockets
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit OpenID Connect via Passport.js
- **Voice Processing**: OpenAI GPT-4o Real-time API
- **Infographic Generation**: Gemini API (`gemini-3-pro-image-preview`)

### Data Model Hierarchy
The core data model follows this hierarchy: **Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment**. This structure allows for organizing research, defining interview parameters, grouping sessions, and storing individual responses.

### Key Design Patterns
- **Storage Abstraction**: All database operations are centralized through a `DatabaseStorage` class.
- **Real-time Communication**: WebSocket server handles live voice interview sessions.
- **Form Validation**: Zod schemas integrated with react-hook-form for type-safe validation.
- **API Pattern**: REST endpoints with authentication middleware.
- **Component Library**: shadcn/ui components built on Radix primitives.
- **Lag-by-one-turn guidance**: AI guidance is applied asynchronously to the *next* response to avoid latency.
- **Multi-Level Analytics System**: Analytics are generated at Collection, Template, and Project levels, with the Project level providing AI-powered cross-template synthesis. Template analytics preserve collection-level detail through deterministic aggregation.
- **Strategic Context Integration**: Users can provide business context for tailored analytics recommendations.
- **Test Harness**: A comprehensive test data seeding script facilitates testing analytics features.
- **Aggregated Analytics Command Center**: A centralized dashboard provides cross-project strategic insights, aggregated findings, and health indicators for analytics staleness.
- **Respondent Invitation System**: Supports single and bulk respondent invitations via unique tokens, QR codes, and tracks invitation status through the interview lifecycle.

## External Dependencies

- **PostgreSQL Database**: Primary data store.
- **OpenAI API**: For GPT-4o Real-time voice interviews and GPT-based interview guidance and analytics processing.
- **Gemini API**: For infographic generation.
- **Replit Authentication**: OpenID Connect for user authentication.

## Recent Changes (January 2026)

### Session Hygiene System (Automatic Cleanup of Abandoned Sessions)
Implemented a server-side watchdog system to automatically clean up abandoned interview sessions and prevent unnecessary OpenAI Realtime API costs:
- **Heartbeat Protocol**: Client sends heartbeat every 30 seconds; server terminates after 90 seconds of no heartbeat
- **Idle Timeout**: Sessions with no activity (audio, interactions) for 5 minutes are terminated
- **Max Age Limit**: Sessions exceeding 1 hour are automatically terminated
- **Graceful Warnings**: Clients receive a warning 30 seconds before termination
- **Smart Watchdog**: Watchdog starts with first session, stops when no sessions remain
- **Activity Tracking**: Audio, text input, pause/resume, next question, and AI responses all reset activity timers
- **Client Handling**: Client receives session_warning and session_terminated messages with navigation to appropriate pages

### Session Detail Page Enhancements
Enhanced the individual session detail page for researchers with comprehensive session management tools:
- **Delete Session**: Confirmation dialog before permanent deletion
- **Export**: JSON and CSV export options for session data
- **Respondent Info Panel**: Display consent status, email, name
- **Copy Transcript**: One-click copy of full transcript to clipboard
- **Share Review Link**: Generate review link for completed sessions
- **Resume Link**: Generate resume link for incomplete sessions
- **Researcher Notes**: Save notes with dedicated storage field (researcherNotes)
- **Flag/Status Actions**: Add review flags (needs_review, flagged_quality, verified, excluded) and override session status
- **Navigation**: Prev/Next session navigation scoped to collection context
- **Quality Summary**: Display average quality score and quality flags from question summaries

### Schema Changes
Added `researcherNotes` (text) and `reviewFlags` (text array) fields to interviewSessions table to support researcher annotations separate from analytics data.

### Realtime API Performance Monitoring
Implemented comprehensive monitoring to track OpenAI Realtime API interactions for cost and performance visibility:
- **Token Usage Tracking**: Captures input/output tokens (audio and text) from `response.done` events
- **Latency Measurements**: Tracks transcription latency (speech end → transcript) and response latency (transcript → first audio delta)
- **Speaking Time Metrics**: Measures Alvia speaking time, respondent speaking time, and silence periods
- **Session Aggregates**: Calculates averages and maximums at session completion
- **Persistence**: Stores metrics in `performanceMetrics` JSONB field on `interviewSessions` table
- **API Endpoint**: `GET /api/sessions/:sessionId/metrics` returns session performance data (requires authentication)
- **Termination Tracking**: Records termination reason (completed, heartbeat_timeout, idle_timeout, max_age_exceeded, client_disconnected)
- **Silence Segment Tracking**: Captures individual silence gaps for future VAD threshold tuning:
  - Three contexts: `post_alvia` (after AI speaks), `post_respondent` (after user speaks), `initial` (before any speech)
  - Statistical analysis: mean, median, p90, p95, max durations computed from ALL observed segments
  - Memory-bounded: Only 100 most recent segments stored, but stats computed from full accumulator
  - 100ms minimum threshold filters noise/micro-pauses
  - Question index tracking for per-question analysis
- **Pause Duration Tracking**: Separates paused time from active silence for accurate VAD optimization analysis:
  - `totalPauseDurationMs`: Cumulative time interview was paused (no audio streaming, no cost)
  - `activeSilenceMs`: Silence during active streaming only (billable silence that VAD could eliminate)
  - `activeSessionDurationMs`: Session duration minus pause time (true interview duration)
  - Original `silenceMs` preserved for backward compatibility (includes pause time)
  - Edge cases handled: session ends while paused, multiple pause/resume cycles
  - Silence tracking reference points reset on resume to avoid inflated segments

### Project-Level Infographics
Extended the Infographics feature to support project-level generation alongside existing collection-level support:
- **Collection Level**: Supports summary, themes, and findings infographic types
- **Project Level**: Supports summary, themes, and strategic insights infographic types
- **Type Validation**: InfographicGenerator validates type against entityLevel to prevent invalid API calls
- **Analytics Gating**: Infographic generation is only enabled when analytics data exists for the entity

### PDF Export for Analytics
Added comprehensive PDF export functionality for project and collection analytics:
- **AnalyticsPdfExport Component**: Located at `client/src/components/analytics/AnalyticsPdfExport.tsx`
- **Project Analytics Export**: Includes overview, tailored recommendations, cross-template themes, strategic insights, quality issues
- **Collection Analytics Export**: Includes executive summary, key themes, findings, question performance with all verbatims, recommendations, quality issues
- **Text-Based PDF**: Uses jsPDF native text APIs with PdfBuilder helper class for clean, formatted output
- **Smart Page Breaks**: Automatic page break logic that avoids splitting sections mid-content
- **Consistent Styling**: Color palette, fonts (Helvetica), headers, bullets, numbered lists, quotes with vertical bar styling, badges, metric grids
- **Export Button**: `data-testid="button-export-pdf"` on both project and collection analytics views
- **File Format**: `{name}_analytics_{date}.pdf`
- **Name Mapping**: Template IDs are mapped to names via `templateNameMap` from `templatePerformance`. Theme IDs (which AI generates as `theme_1`, `theme_2`, etc.) are mapped to actual theme names by index position in the themes array.

### Analytics Cascade Refresh
Implemented a simplified cascade refresh UX for analytics to address the tedious multi-step process of refreshing analytics in the correct dependency order:
- **Problem Solved**: Previously, users had to manually navigate to refresh collections, then templates, then project analytics in sequence
- **Cascade Dialog**: New `AnalyticsCascadeRefreshDialog` component shows what's stale and offers a single "Refresh All" action
- **Dependency Detection API**: 
  - `GET /api/projects/:projectId/analytics/dependencies` - Returns staleness status of all templates and collections
  - `GET /api/templates/:templateId/analytics/dependencies` - Returns staleness status of collections under a template
- **Cascade Refresh API**:
  - `POST /api/projects/:projectId/analytics/cascade-refresh` - Refreshes stale collections → templates → project in order
  - `POST /api/templates/:templateId/analytics/cascade-refresh` - Refreshes stale collections → template in order
- **Smart UX**: Dialog explains what needs refreshing (collections, templates) before proceeding, with error handling for dependency fetch failures
- **Partial Success Handling**: Continues refreshing even if individual items fail, reports errors at the end