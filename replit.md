# Alvia - Voice-Based AI Interview Platform

## Overview

Alvia is a voice-based AI interview platform for qualitative research at scale. It leverages OpenAI's GPT-4o Real-time API for natural voice conversations, automatically transcribing and analyzing responses. The platform features consent management, PII redaction, cross-interview analysis, and an advanced analytics system providing insights at Collection, Template, and Project levels. It also includes an invitation system for respondent recruitment and a strategic context feature for tailored analytics recommendations, aiming to transform qualitative research through AI-driven efficiency and insight generation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Tech Stack
- **Frontend**: React 18 (TypeScript, Wouter, TanStack React Query, Radix UI, Tailwind CSS)
- **Backend**: Express.js with WebSockets
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit OpenID Connect via Passport.js
- **Voice Processing**: OpenAI GPT-4o Real-time API (with multi-provider support for future integration with Grok/xAI)
- **Infographic Generation**: Gemini API (`gemini-3-pro-image-preview`)

### Data Model Hierarchy
The system organizes data hierarchically: **Workspace → Project → InterviewTemplate → Collection → InterviewSession → Segment**.

### Key Design Patterns
- **Storage Abstraction**: Centralized database operations via `DatabaseStorage`.
- **Real-time Communication**: WebSocket server for live voice interview sessions.
- **Form Validation**: Zod schemas integrated with react-hook-form.
- **API Pattern**: REST endpoints with authentication middleware.
- **Component Library**: shadcn/ui.
- **Lag-by-one-turn guidance**: Asynchronous AI guidance for next response.
- **Multi-Level Analytics System**: Analytics generated at Collection, Template, and Project levels, with AI-powered cross-template synthesis at the Project level.
- **Strategic Context Integration**: Enables tailored analytics recommendations based on user-provided business context.
- **Aggregated Analytics Command Center**: Centralized dashboard for cross-project insights and analytics health.
- **Respondent Invitation System**: Supports single and bulk invitations with tracking.
- **Session Hygiene System**: Automatic cleanup of abandoned sessions using heartbeat, idle, and max age timeouts.
- **Session Detail Page Enhancements**: Provides comprehensive tools for researchers including export, notes, flagging, and navigation.
- **Project-Level Infographics**: Extends infographic generation to the project level, alongside collection-level support.
- **PDF Export for Analytics**: Comprehensive PDF export for project and collection analytics with smart page breaks and consistent styling.
- **Analytics Cascade Refresh**: Streamlined UX for refreshing analytics dependencies (collections, templates, projects) via a single "Refresh All" action.
- **Data Isolation**: Enforced ownership verification across all data hierarchies (User → Workspace → Project → Template → Collection → Session) for secure multi-tenancy.
- **Auto-Generate Template Feature**: AI-powered generation of interview templates from project metadata using GPT-5.
- **Multi-Provider Realtime Voice Support**: Abstracted `RealtimeProvider` interface to support switching between different real-time voice API providers (e.g., OpenAI, Grok). Researchers select the provider at the Collection level during creation; respondents automatically use the collection's configured provider.
- **Demo Project Auto-Seeding**: New users automatically receive a demo project ("Alvia Demo — Your Coffee Ritual") with a pre-configured template and 6 questions on first login. Implemented via `server/demo-seed.ts` called from the auth verification callback.
- **Invite-Only Waitlist System**: Gating mechanism for public launch. Only users with emails in the `invite_list` table can access the platform. Non-invited authenticated users see a waitlist form to submit their information (name, email, consent preferences). Controlled by `INVITE_ONLY_MODE` environment variable (defaults to true; set to "false" to disable gating). Database tables: `invite_list` (invited emails) and `waitlist_entries` (waitlist submissions). To invite users: `INSERT INTO invite_list (email) VALUES ('user@example.com');`

## External Dependencies

- **PostgreSQL Database**: Primary data store.
- **OpenAI API**: For GPT-4o Real-time voice interviews, GPT-based interview guidance, and analytics processing.
- **Gemini API**: For infographic generation.
- **Replit Authentication**: OpenID Connect for user authentication.
- **xAI Grok API**: For alternative real-time voice processing (requires `XAI_API_KEY` secret).