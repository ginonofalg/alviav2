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
- **Multi-Page PDF**: Uses jsPDF and html2canvas for multi-page generation
- **Export Button**: `data-testid="button-export-pdf"` on both project and collection analytics views
- **File Format**: `{name}_analytics_{date}.pdf`