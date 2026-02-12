# Alvia Context Brief for External LLMs

Last updated: February 12, 2026  
Repository snapshot scope: `/home/runner/workspace`

## 1) What Alvia Is

Alvia is a voice-based AI interview platform for research teams. It runs real-time AI interviews with respondents, captures transcripts, and produces analytics from session-level findings up to project-level synthesis.

Two AI agents collaborate:
- **Alvia**: the respondent-facing interviewer (voice conversation)
- **Barbara**: the hidden orchestrator/analyst (guidance, summaries, analytics generation)

The system is built to make qualitative research scalable without losing interview quality controls.

## 2) Who Uses It and Why

### Project Owners (researchers, product teams, analysts)

Project Owners use Alvia to:
- Define research objectives and audience context
- Build interview templates (question sets with logic and types)
- Launch collections and invite respondents
- Monitor live and completed sessions
- Review hierarchical analytics (collection, template, project, command center)
- Export insights (PDF, CSV/JSON session export, image infographics)

Expected value:
- Faster interview throughput
- More consistent moderation than fully human-led interviews
- Structured evidence extraction for synthesis and reporting

### Interviewees (respondents)

Interviewees experience:
- Consent and intro flow
- Voice conversation with Alvia in-browser
- Ability to interrupt AI speech (barge-in)
- Resume support if disconnected
- Optional post-interview review/ratings/comments

Expected value:
- Conversational interview experience
- Low-friction participation via invitation links/tokens

## 3) End-to-End UX (Both Sides)

### A. Project Owner Journey

1. **Create project**
   - Set objective, audience, tone, and optional PII redaction preferences.
2. **Create template**
   - Define ordered questions, question types (`open`, `yes_no`, `scale`, `numeric`, `multi_select`), and logic.
3. **Launch collection**
   - Instantiate a template for a fielding run.
   - Configure voice provider and options like max additional questions.
4. **Invite respondents**
   - Bulk/manual invites, track lifecycle: invited -> clicked -> consented -> completed.
5. **Run interviews**
   - Sessions execute through real-time voice pipeline.
6. **Review outputs**
   - Per-session transcripts, summaries, quality metrics, reviewer notes.
7. **Analyze and synthesize**
   - Collection -> template -> project -> command-center analytics.
8. **Report**
   - Export data, generate PDFs, and create visual infographics.

### B. Interviewee Journey

1. **Entry**
   - Join via invite link/token or resume link.
2. **Consent**
   - Provide required consent before interview start.
3. **Welcome / optional naming**
   - Optional respondent name preferences.
4. **Live interview**
   - Alvia asks questions and responds conversationally.
   - Barbara silently evaluates transcript and steers Alvia in real time.
5. **Additional question phase (optional)**
   - Barbara may generate 0-3 follow-up questions near interview end.
6. **Completion + review**
   - Respondent can submit structured ratings/comments or defer via review link.
7. **Recovery if interrupted**
   - Resume tokens allow continuation with state restored.

### C. Public interview route flow (respondent-facing)

- `/join/:collectionId` -> consent/start
- `/welcome/:sessionId` -> pre-interview name capture
- `/interview/:sessionId` -> live voice interview
- `/resume/:token` -> resume validator/redirect
- `/review/:sessionId` or `/review/:token` -> post-interview review flow

UX details that matter for implementation:
- Interview page handles real-time connection state, microphone fallback (typed response), and completion transitions.
- Additional-question consent/confirmation overlays are part of interview completion behavior.
- Review flow supports deferred completion via shareable tokenized review links.

## 4) System Architecture (High-Level)

### Core stack

- **Frontend**: React 18, Wouter, TanStack Query, Radix/shadcn UI, Tailwind, Framer Motion
- **Backend**: Express + WebSocket (`ws`)
- **DB**: PostgreSQL + Drizzle ORM (+ `drizzle-zod`)
- **Auth**: Replit OIDC + Passport + PostgreSQL-backed sessions
- **Voice layer**: OpenAI Realtime (`gpt-realtime-mini`) or xAI Grok (`grok-3-fast`)
- **Orchestration/analysis**: OpenAI Chat models (Barbara use cases)
- **Infographics**: Google Gemini

### Real-time topology

Browser <-> Express WebSocket (`/ws/interview`) <-> Voice provider WebSocket  
Browser <-> Express REST (`/api/*`) <-> PostgreSQL

### Repository shape (mental map)

- `client/src/pages/*`: route-level UX and state orchestration
- `client/src/hooks/*`: audio playback, reconnection, silence detection
- `server/routes/*.routes.ts`: modular API domains
- `server/voice-interview.ts` + `server/voice-interview/*`: real-time interview runtime and helpers
- `server/barbara-orchestrator.ts`: Barbara prompting/analysis/summaries
- `server/realtime-providers.ts`: provider abstraction layer
- `server/storage.ts`: DB-backed storage implementation for all core operations
- `shared/schema.ts` + `shared/types/*`: canonical schema/types for cross-layer consistency

## 5) Data Hierarchy and Mental Model

Strict hierarchy:

`Workspace -> Project -> InterviewTemplate -> Collection -> InterviewSession -> Segment`

Important implications:
- Multi-tenant access control follows this chain.
- Analytics roll up along this chain.
- LLM usage/cost attribution follows this chain.

### Key persisted artifacts by session

- Transcript and live context snapshots
- Question progression state + per-question summaries
- Additional-question state (`phase`, current index, generated questions)
- Session summaries from Alvia and Barbara
- Performance metrics (latency, silence, speaking-time, tokens)
- Transcription quality metrics + detected quality flags
- Review ratings/comments/notes and optional review flags

## 6) Alvia vs Barbara Responsibilities

### Alvia (Interviewer)
- Speaks with respondent in real time.
- Asks template questions and manages turn-taking.
- Handles interruptions and resumes flow.
- Produces respondent-facing interview experience.

### Barbara (Orchestrator + Analyst)
- Never respondent-facing; runs in the background.
- Monitors transcript context continuously.
- Recommends interviewer actions (probe, clarify, move on, etc.).
- Generates question summaries and end-of-session summaries.
- Detects topic overlap across interviews.
- Generates additional follow-up questions.
- Produces higher-level analytics outputs.

Barbara has configurable use cases (model/verbosity/reasoning settings):
- `analysis`
- `topicOverlap`
- `summarisation`
- `templateAnalytics`
- `projectAnalytics`
- `templateGeneration`
- `additionalQuestions`
- `sessionSummary`

## 7) Interview Runtime Behavior

1. Respondent connects and starts/resumes session.
2. Client streams mic audio to server.
3. Server bridges audio/text events to selected realtime provider.
4. Provider returns AI audio + transcript events.
5. After respondent utterances, Barbara analyzes context and issues guidance.
6. Alvia behavior adapts according to Barbara output.
7. On each question completion, Barbara can generate question-level summaries.
8. After template questions finish, Barbara may generate 0-3 additional questions (if enabled).
9. Session state persists every ~2 seconds for crash recovery/resume.
10. On completion, session summaries and analytics artifacts are generated/saved.

Reliability and quality controls include:
- WebSocket reconnection with exponential backoff
- Heartbeats/watchdogs and stale-connection guards
- Safe send + concurrency safeguards around response generation
- Silence and pause tracking
- Transcription quality monitoring with noise/garble pattern detection
- Environment-check triggers and VAD tuning adjustments

Common quality flags include:
- Garbled audio signatures
- Noisy environment degradation
- Repeated clarification loops
- Foreign-language hallucination patterns
- Repeated-word glitching

## 8) Analytics Capability

### Hierarchical analytics levels

- **Collection analytics**: themes, findings, question performance
- **Template analytics**: cross-collection consistency and patterns
- **Project analytics**: cross-template synthesis and strategy-level insight
- **Aggregated analytics (command center)**: cross-project portfolio view

### Mechanics

- Staleness tracking (e.g., based on last analysis timestamp/session count)
- Cascade refresh (project refresh can trigger template + collection refresh)
- Evidence-aware summaries with verbatims and recommendation outputs

Typical analytics payload categories:
- Themes and supporting quotes
- Key findings and confidence/consistency signals
- Question-level performance diagnostics
- Recommended next actions and strategic follow-ups

### Reporting features

- PDF export for analytics reports
- Session export (JSON/CSV)
- AI-generated infographics (collection/project level)

Respondent experience rating capture (post-interview) includes:
- Question clarity
- Alvia understanding
- Conversation flow
- Comfort level
- Technical quality
- Overall experience

## 9) LLM Usage, Cost, and Observability

Alvia tracks LLM usage in a billing-grade event log plus rollups:
- Immutable raw events table for each call
- Hourly rollups by workspace/project/template/collection/session/provider/model/use case/status
- Use-case-level attribution (Alvia realtime/transcription, Barbara functions, infographic generation)

Why this matters:
- Cost transparency by research initiative
- Model/provider benchmarking
- Operational troubleshooting and reconciliation

Tracked use-case families include:
- Alvia realtime interaction + transcription
- Barbara analysis/topic-overlap/question-summary/additional-questions/session-summary
- Cross-interview analytics generation
- Infographic generation variants

## 10) Security and Access Model

- OIDC authentication with server-side sessions
- Invite-only mode supported (`INVITE_ONLY_MODE`)
- Ownership checks enforced down hierarchy
- Tokenized resume/review flows
- Optional PII redaction with mapping storage
- Input validation via shared Zod schemas across client/server

## 11) API Surface (Practical Summary)

- `GET /api/auth/user`, `GET /api/auth/invite-status`, `POST /api/waitlist`
- CRUD for projects/templates/collections/sessions/respondents
- Analytics endpoints (fetch + refresh at multiple hierarchy levels)
- Interview access and resume endpoints
- Review link generation and review submission
- Usage reporting endpoints (session/collection/template/project)
- WebSocket endpoint: `/ws/interview`

## 12) Design Constraints and Engineering Notes

- Large files exist (notably voice interview/orchestrator/storage); new logic should be extracted into modular files rather than expanding monoliths.
- Shared types and schema are a source of truth for both client and server behavior.
- Voice provider abstraction allows OpenAI vs Grok switching via config/environment.
- System is optimized for real-time resilience over minimal complexity.

## 13) Where Alvia Can Go Next (Domain Intelligence)

Potential evolution path: move from generic interviewing to **domain-aware interviewing intelligence**.

Concrete directions:

1. **Domain packs**
   - Reusable industry lenses (healthcare, fintech, ecommerce, B2B SaaS, public sector, etc.).
   - Each pack defines hypotheses, probe frameworks, terminology maps, and risk flags.

2. **Objective-aware probing policies**
   - Convert project objective into explicit evidence requirements.
   - Track evidence coverage in-session and trigger probes for uncovered areas.

3. **Cross-session memory with confidence**
   - Build evolving theme graph per collection/project.
   - Weight new evidence by confidence and sample diversity.

4. **Insight quality scoring**
   - Score claims by support quality, contradiction level, and novelty.
   - Separate weak anecdote from repeated, high-confidence signal.

5. **Role-specific analytics views**
   - Product owners: prioritization and opportunity sizing.
   - Researchers: methodological quality and saturation checks.
   - Executives: decision-ready synthesis and risk summary.

6. **Interviewer coaching intelligence**
   - Teach Alvia when to slow down, clarify, or challenge contradictions.
   - Real-time guardrails to avoid leading questions or premature closure.

7. **Compliance-aware intelligence layers**
   - Domain-specific redaction/compliance packs (HIPAA-like, finance-sensitive, regional privacy patterns).

## 14) Prompt Starter for Other LLMs

Use this block when asking another model for help:

```text
You are helping with Alvia, a voice-based AI interview platform.

System facts:
- Two AI roles: Alvia (respondent-facing interviewer) and Barbara (background orchestrator/analyst).
- Hierarchy: Workspace -> Project -> Template -> Collection -> Session -> Segment.
- Real-time voice interviews run over WebSocket with provider abstraction (OpenAI Realtime or xAI Grok).
- Barbara provides real-time guidance, summaries, additional questions, and higher-level analytics.
- Analytics roll up from collection to template to project to command-center aggregate.
- LLM usage is tracked in billing-grade events and hourly rollups by hierarchy + use case.
- Interview UX supports consent, resume tokens, optional post-interview review, and additional-question phase.

Given this context, answer the following question with implementation-level detail:
[INSERT QUESTION]
```

## 15) Code Landmarks (If an External LLM Needs File Context)

- `server/voice-interview.ts` + `server/voice-interview/*`: real-time interview runtime
- `server/barbara-orchestrator.ts`: orchestration and analytics generation logic
- `server/realtime-providers.ts`: OpenAI/Grok abstraction
- `server/routes/*.routes.ts`: REST endpoints
- `server/storage.ts` + `server/storage/types.ts`: DB access layer contract/implementation
- `shared/schema.ts` + `shared/types/*`: schema and cross-layer types
- `client/src/pages/interview.tsx`: core respondent interview UI
- `client/src/components/analytics/*`: analytics visualization + PDF export

---

If this brief is used in prompts, include only the sections relevant to the question to reduce context window usage.
