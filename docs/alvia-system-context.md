# Alvia System Context

> This document provides comprehensive context about the Alvia platform for use when consulting external LLMs or collaborators. It covers what the system does, how it works, the user experience from both sides, the AI architecture, analytics capabilities, and future directions.

---

## 1. What Alvia Is

Alvia is a **voice-based AI interview platform** for qualitative research. It replaces the traditional researcher-respondent interview with two AI agents working in concert:

- **Alvia** — the AI interviewer who speaks directly with respondents in natural voice conversation
- **Barbara** — the AI orchestrator who silently monitors each interview in real-time, analyzing transcripts and feeding guidance to Alvia

The platform enables researchers to design interview templates, launch collection campaigns, and conduct hundreds of structured voice interviews at scale — capturing the nuance, emotion, and depth that surveys and forms miss. Everything is recorded, transcribed, summarized, and synthesized into hierarchical analytics.

**Core value proposition**: Scale qualitative research without sacrificing conversational depth. A single researcher can run hundreds of interviews with the quality and adaptiveness of a skilled human interviewer.

---

## 2. The Two AI Agents

### 2.1 Alvia — The Interviewer

Alvia is the respondent-facing voice agent. She conducts interviews through natural conversation using real-time voice AI (OpenAI Realtime API or xAI Grok).

**Personality and behavior**:
- British accent, polite and encouraging, but firm and willing to challenge respectfully
- Tone is configurable per project (professional, friendly, empathetic, etc.)
- Concise responses optimized for voice conversation — no markdown, no lists, no special formatting
- Uses the respondent's name exactly once at the start, then never again (explicit instruction to avoid over-familiarity)
- Natural conversational pauses are acceptable

**How Alvia's instructions work**:

Instructions are not static. They are rebuilt dynamically for every turn of the conversation, incorporating:

1. **Project context** — the research objective, audience, tone, and strategic context
2. **Current question** — the question text plus researcher-provided guidance criteria (e.g., "probe for emotions", "focus on workflow")
3. **Interview progression** — position in the template ("Question 3 of 7"), upcoming questions (to avoid redundant follow-ups), and previous answer summaries
4. **Follow-up depth** — researchers set recommended follow-up probe counts per question (soft guidance, not hard limits)
5. **Barbara's real-time guidance** — delivered in `[ORCHESTRATOR: ...]` brackets that Alvia must never read aloud or acknowledge; she incorporates guidance naturally as if it were her own thought
6. **Cross-interview context** — themes and patterns from prior interviews in the same collection (if enabled)
7. **Analytics hypotheses** — project-level research gaps and hypotheses derived from existing analytics (if enabled)

**Resume behavior**: When a respondent reconnects after a disconnection, Alvia welcomes them back briefly, reminds them of the prior discussion without repeating the full question, and resumes from the exact question state.

### 2.2 Barbara — The Orchestrator

Barbara is invisible to respondents. She monitors the live transcript and provides real-time guidance to Alvia, generates per-question summaries, detects topic overlap, creates additional follow-up questions, generates session summaries, and powers the entire analytics pipeline.

**Eight configurable use cases**, each with independent model, verbosity, and reasoning effort settings:

| Use Case | Purpose | Default Model |
|----------|---------|---------------|
| Analysis | Real-time interview guidance | gpt-5-mini (minimal reasoning) |
| Topic Overlap | Detect when upcoming questions were already addressed | gpt-5-mini |
| Summarisation | Per-question structured analysis | gpt-5-mini |
| Additional Questions | Dynamic follow-ups at interview end | gpt-5 (low reasoning) |
| Session Summary | End-of-interview synthesis | gpt-5-mini |
| Template Analytics | Cross-collection theme aggregation | gpt-5-mini |
| Project Analytics | Cross-template strategic synthesis | gpt-5 (medium reasoning) |
| Template Generation | AI-created interview templates | gpt-5 |

**Allowed models**: gpt-5-mini, gpt-5, gpt-4o, gpt-4o-mini, o1, o1-mini, o1-pro, o3-mini. All configurable at runtime via API.

#### Real-Time Guidance

During each interview, Barbara continuously analyzes the transcript and produces guidance actions:

| Action | When Used |
|--------|-----------|
| `probe_followup` | Answer lacks depth — "Can you give me a specific example?" |
| `suggest_next_question` | Answer is complete — "The respondent has given a thorough answer. Time to move on." |
| `acknowledge_prior` | Respondent mentioned this topic earlier — "They mentioned this when discussing onboarding" |
| `time_reminder` | Response exceeding ~2 minutes or ~400 words |
| `suggest_environment_check` | Audio quality has degraded |
| `confirm_understanding` | Transcription issues suspected |
| `none` | No intervention needed (most common — Barbara is conservative) |

**Critical timing design**: Barbara's analysis is asynchronous. By the time her guidance reaches Alvia, the respondent may have spoken again. Guidance is therefore phrased to remain relevant across timing gaps. This is explicitly noted in the system prompt: *"Your guidance will be incorporated into Alvia's NEXT response, not her current one."*

**Conservative intervention philosophy**: The default action is "none." Barbara only intervenes when there's a clear benefit. This prevents the interview from feeling robotic or over-directed.

---

## 3. User Experience

### 3.1 Researcher (Project Owner) Experience

**Phase 1 — Project Setup**:
1. Create a **Project** with an objective (e.g., "Understand pain points in enterprise onboarding"), audience context, tone preference, and strategic context type (content, product, marketing, CX, or other)
2. Configure consent controls: audio recording, data processing, PII redaction
3. Enable optional features: cross-interview context (Alvia references prior sessions), analytics-guided hypotheses (probe research gaps)

**Phase 2 — Template Design**:
1. Create an **Interview Template** with 5–15 questions (typical)
2. For each question, configure:
   - Question text and type (open, yes/no, scale, numeric, multi-select)
   - Researcher guidance (instructions for Alvia on what to probe for)
   - Follow-up depth (recommended number of follow-up probes)
   - Time hints (expected response duration)
3. Alternatively, use **AI template generation** — Barbara generates a complete template from the project's objective and context, including question types, guidance, and time hints

**Phase 3 — Collection Launch**:
1. Launch a **Collection** from a template (a collection is one "wave" of interviews)
2. Configure the voice provider (OpenAI or Grok), additional questions (0–3 dynamic follow-ups at interview end), and end-of-interview summaries
3. Upload respondents via CSV bulk invite or generate shareable links with QR codes

**Phase 4 — Monitoring & Review**:
1. **Dashboard** shows active collections, completion rates, paused/abandoned sessions, and action items
2. **Session review** for each completed interview includes:
   - Full transcript with speaker labels and timestamps
   - Per-question structured summaries with key insights and verbatim quotes
   - Quality flags (incomplete, ambiguous, off-topic, etc.) and quality scores
   - 6-dimension review ratings (if respondent submitted them)
   - Researcher notes, session flags (needs_review, flagged_quality, verified, excluded)
   - Shareable review links (64-character access tokens for public sharing)
3. **Session export** as JSON or CSV

**Phase 5 — Analytics & Insights**:
1. Refresh **collection analytics** — themes, key findings, consensus/divergence points, recommendations
2. Aggregate into **template analytics** — cross-collection consistency, theme aggregation
3. Synthesize into **project analytics** — executive summary, strategic themes, contextual recommendations
4. View the **Command Center** — cross-project insights with staleness tracking
5. Export as **PDF reports** or generate **AI-powered infographics** (via Google Gemini)

### 3.2 Respondent (Interviewee) Experience

The respondent never sees the platform's internal complexity. Their experience is a simple, guided voice conversation:

1. **Consent screen** (`/join/:collectionId`) — three required checkboxes: participation consent, audio recording consent, data processing consent. If they have a prior unfinished interview, a "Resume Interview" option appears.

2. **Welcome screen** — brief pre-interview orientation.

3. **Voice interview** (`/interview/:sessionId`) — the core experience:
   - A large circular mic button dominates the screen (blue when listening, green for text-only mode, yellow when paused)
   - An animated 24-bar waveform visualizer shows audio state (blue bars when respondent speaks, green when Alvia speaks, gray when idle)
   - A transcript panel shows the conversation with speaker labels and timestamps
   - Question progress indicator shows "Question X of Y" with a progress bar
   - The respondent can interrupt (barge-in) Alvia at any time; interrupted segments are tracked
   - If additional questions are enabled, Alvia asks 0–3 dynamic follow-ups after the template questions

4. **Completion screen** — confirms the interview is done.

5. **Review screen** (optional) — respondent rates the experience on 6 dimensions (question clarity, Alvia's understanding, conversation flow, comfort level, technical quality, overall experience) and can leave per-question comments. Drafts auto-save to localStorage; they can defer and "review later."

**Resilience features**:
- WebSocket reconnection with exponential backoff and connection watchdog
- Cryptographic resume tokens (32-byte, base64url, 7-day expiry) stored in localStorage
- Full interview state persisted every 2 seconds for crash recovery
- Resume restores exact position including additional questions phase

---

## 4. Data Architecture

### 4.1 Hierarchy

```
Workspace
  └── Project (objective, audience, tone, strategic context)
        └── Interview Template (questions, guidance, constraints)
              └── Collection (one "wave" of interviews, voice provider config)
                    └── Interview Session (one respondent's interview)
                          └── Segment (one question-answer pair)
```

### 4.2 Key Data Entities

**Project** — the research initiative. Contains objective, audience context, tone, consent settings, PII redaction flags, avoid rules, strategic context (content/product/marketing/CX/other), and flags for cross-interview context and analytics-guided hypotheses.

**Interview Template** — the question script. Contains ordered questions, each with type (open, yes_no, scale, numeric, multi_select), guidance for Alvia, time hints, follow-up depth, and conditional logic.

**Collection** — a deployed template for a specific wave of interviews. Configures voice provider (OpenAI/Grok), max additional questions (0–3), end-of-interview summary toggle, and stores analytics data as JSONB.

**Session** — one respondent's interview. Tracks status (pending → consent_given → in_progress → paused → completed → abandoned), stores the live transcript, Barbara's last guidance, question states, question summaries, additional questions data, session summaries (Alvia and Barbara), transcription quality metrics, performance metrics (token usage, latency, silence tracking), and review data.

**Segment** — one question-answer pair within a session. Stores transcript, summary, key quotes, quality flags, and extracted values. Additional questions have nullable `questionId` with `additionalQuestionIndex` and `additionalQuestionText`.

### 4.3 Voice Architecture

Audio flows through a WebSocket bridge:

```
Respondent Browser ←→ [WebSocket /ws/interview] ←→ Alvia Server ←→ Voice Provider API
                                                       ↕
                                                   Barbara (async analysis)
```

Two voice providers are abstracted behind a `RealtimeProvider` interface:

| | OpenAI | xAI Grok |
|--|--------|----------|
| Model | gpt-realtime-mini | grok-3-fast |
| Voice | "marin" (British) | "Ara" |
| Transcription | gpt-4o-mini-transcribe | whisper-large-v3 |
| VAD | Semantic (intent-aware) | Server-based |
| Sample rate | 24,000 Hz | Standard |

Selected per-collection via `voiceProvider` field; switched via `REALTIME_PROVIDER` env var (default: OpenAI).

### 4.4 Transcript Architecture

Two parallel transcript buffers run during each interview:

1. **In-memory log** (capped at 50 entries) — used for Barbara's real-time analysis (low latency)
2. **Persistence buffer** (never truncated) — the complete transcript for export, recovery, and post-interview analysis

This dual-buffer design balances **speed** (quick Barbara guidance from a manageable context window) with **completeness** (no data loss for analytics).

State auto-saves every 2 seconds to the database (debounced to prevent thrashing).

---

## 5. Analytics System

Analytics are hierarchical, with each level synthesizing the level below:

### 5.1 Per-Question Summaries (Session Level)

After each question is answered, Barbara generates a structured summary:

- **Narrative summary** (2–3 sentences)
- **Key insights** (3–5 bullet points)
- **Verbatim quotes** (2–4 per question, cleaned of filler words, with context, sentiment, and theme tags)
- **Quality score** (0–100) and quality flags (incomplete, ambiguous, contradiction, distress_cue, off_topic, low_engagement)
- **Completeness assessment** and topics relevant to future questions
- All outputs are **PII-anonymized** (names → [Name], locations → [Location], etc.)

### 5.2 Collection Analytics

Synthesizes all sessions within a collection:

- **Themes** (4–10) with verbatims, sentiment, prevalence, and depth (mentioned / explored / deeply_explored)
- **Key findings** (3–5) with supporting evidence
- **Consensus points** — where all respondents agree
- **Divergence points** — where respondents disagree
- **Question performance** — per-question quality, engagement, response richness (brief < 30 words, moderate, detailed > 100 words)
- **Recommendations** — actionable next steps (e.g., rephrase low-performing questions, explore shallow themes)

### 5.3 Template Analytics

Aggregates across collections using the same template:

- **Cross-collection theme aggregation** with total mentions and source collections
- **Question consistency metrics** — quality variance across collections (consistent / variable / inconsistent)
- **Performance summary** — average quality, engagement, duration across collections
- **Recommendations** — high-variance questions need rewording, low-quality questions need improvement

### 5.4 Project Analytics

Synthesizes across all templates in a project:

- **Executive summary** — headline finding + 3–5 key takeaways + recommended actions
- **Cross-template strategic themes** — themes spanning multiple templates, marked as "strategic" if high-impact
- **Consensus and divergence points** across the entire project
- **Contextual recommendations** — tailored to the project's strategic context:
  - *Content*: newsletter topics, social media angles, content ideas derived from research
  - *Product*: feature implications, roadmap guidance
  - *Marketing*: campaign angles, targeting insights
  - *CX*: support improvements, onboarding gaps
- **Curated verbatims** with usage notes (how quotes could be used in publications/presentations)

### 5.5 Command Center

The top-level analytics dashboard aggregates across all projects:

- Executive insights (top 3 project-level headlines)
- Strategic themes (cross-template themes marked as strategic)
- Research status with session progress and quality summaries
- **Staleness tracking** — each analytics level tracks when it was last analyzed and how many sessions were included, displaying "Fresh", "Aging" (>3 days), "Stale" (>7 days), or "None" badges

### 5.6 Refresh Cascade

Refreshing analytics at any level can cascade downward:
- Refreshing project analytics → invalidates all template analytics → invalidates all collection analytics
- Researchers see "Stale" badges until they re-analyze

### 5.7 Export & Visualization

- **PDF reports** (jsPDF) — full analytics with themes, verbatims, recommendations, quality scores. Smart page breaks, multi-page support.
- **AI-generated infographics** (Google Gemini API) — visual summaries at collection and project level. Clean, modern, playful design with cobalt-blue accents and pastel tints. 16:9 landscape orientation.

---

## 6. Advanced Features

### 6.1 Additional Questions (AQ) System

At the end of each interview (after all template questions), Barbara can generate 0–3 dynamic follow-up questions based on:

- Important topics mentioned briefly but not explored
- Interesting tangents hinted at but not followed up
- Gaps between the research objective and what was discussed
- Contradictions needing clarification
- Themes from prior interviews not touched on by the current respondent
- High-priority hypotheses from project analytics

Barbara will generate **zero** questions if the interview comprehensively covered the objective, the respondent shows fatigue, or no meaningful enhancement is possible.

Respondents can decline additional questions. AQs are stored as segments with nullable question IDs.

### 6.2 Cross-Interview Context

When enabled on a project, Alvia can reference patterns from prior interviews in the same collection during live interviews. This context is **precomputed at session start** (no latency penalty during the interview) and includes:

- **Themes by question** — the most relevant themes from prior sessions for each question (max 3 per question)
- **Emergent themes** — themes appearing across interviews but not directly mapped to template questions
- **Quality insights** — per-question quality metrics and flags from prior sessions, with corrective guidance

Alvia is instructed to treat cross-interview themes as hypotheses, not facts: *"Do not force these themes into the conversation. If not clearly relevant, ignore entirely."*

### 6.3 Analytics-Guided Hypotheses

When enabled, project-level analytics generate research hypotheses that are injected into Barbara's real-time guidance. Sources include:

- Recommendations of type `explore_deeper`, `coverage_gap`, `needs_probing`
- Contextual action items from strategic recommendations
- Strategic insights from cross-template analysis

These are treated as *"optional probes, not leading questions"* and are only suggested when *"naturally relevant to the current discussion."*

### 6.4 Transcription Quality Monitoring

Real-time detection of audio quality issues via a sliding window over the last 5 respondent utterances:

- **Garbled audio** — unintelligible transcription
- **Environment noise** — background interference
- **Repeated clarification** — respondent asking "what?" frequently
- **Foreign language hallucination** — transcription model producing non-source-language text
- **Repeated word glitch** — transcription stuttering

Quality score (0–100) triggers automatic responses:
- Below 65: environment check suggested to respondent
- Persistent issues: VAD eagerness reduced (waits longer for speech completion)
- Recovery: VAD restored after observing clean utterances

### 6.5 Silence and Pause Tracking

Sophisticated silence analysis distinguishes between:
- **Post-Alvia silence** — respondent thinking after Alvia speaks
- **Post-respondent silence** — gap after respondent finishes
- **Initial silence** — before the interview begins
- **Pause time** — when the interview is explicitly paused (no cost)
- **Active silence** — gaps during active interview (incurs voice API cost)

Statistics computed: mean, median, p90, p95, max, breakdown by context. Used for both billing accuracy and respondent engagement analysis.

### 6.6 LLM Usage Tracking (Billing-Grade)

Every LLM call across the entire system is logged to an immutable event ledger with full hierarchy attribution (workspace → project → template → collection → session).

**16 tracked use cases**: alvia_realtime, alvia_transcription, barbara_analysis, barbara_topic_overlap, barbara_question_summary, barbara_cross_interview_enhanced_analysis, barbara_project_cross_template_analysis, barbara_template_generation, barbara_additional_questions, barbara_session_summary, plus 6 infographic variants.

- Provider-agnostic token normalization (OpenAI, xAI, Gemini)
- Hourly rollup aggregation with unique constraints
- Raw events expire after 14 days; rollups retained indefinitely
- Query endpoints at session, collection, template, and project levels

### 6.7 AI Template Generation

Barbara can generate complete interview templates from a project's objective and context:
- 5–8 questions with appropriate types, guidance, time hints, and follow-up depth recommendations
- Starts with rapport-building, ends with wrap-up
- Favors open questions for exploratory research
- Fallback to 5 default questions if generation fails

### 6.8 Invitation Management

- Bulk respondent invitations via CSV upload or manual entry
- QR code generation for easy mobile access
- Lifecycle tracking: invited → clicked → consented → completed
- Shareable collection links

---

## 7. Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Wouter (routing), TanStack React Query, Radix UI, Tailwind CSS, Framer Motion |
| Backend | Express.js, WebSocket (ws library), TypeScript 5.6 |
| Database | PostgreSQL with Drizzle ORM, Drizzle-Zod for schema validation |
| Auth | Replit OpenID Connect via Passport.js, sessions in PostgreSQL |
| Voice | OpenAI Realtime API (gpt-realtime-mini) or xAI Grok (grok-3-fast) |
| Orchestration | OpenAI chat completions (gpt-5-mini / gpt-5 / o-series) |
| Infographics | Google Gemini API (gemini-3-pro-image-preview) |
| PDF | jsPDF |
| Build | Vite 7.3 (client HMR) + esbuild (server), dev server on port 5000 |
| Testing | Vitest |

---

## 8. Key Design Decisions

1. **Dual-buffer transcript** — in-memory (50 entries) for speed, persistence buffer (unlimited) for completeness. Balances Barbara's real-time latency needs against data integrity.

2. **Debounced persistence** — state saves every 2 seconds, preventing database thrashing while ensuring crash recovery.

3. **Context precomputation** — cross-interview context and analytics hypotheses are computed at session start and remain static during the interview. No latency penalty for referencing prior insights.

4. **Asynchronous Barbara guidance** — Barbara analyzes while Alvia talks. Guidance is queued and incorporated into Alvia's next response naturally. This prevents blocking the conversation on slow analysis.

5. **Provider abstraction** — a single `RealtimeProvider` interface abstracts OpenAI and Grok. Switching providers requires only an env var change.

6. **Conservative intervention** — Barbara's default action is "none." The system deliberately avoids over-directing the conversation to maintain naturalness.

7. **Hierarchical analytics with staleness** — each analytics level tracks freshness, enabling researchers to know exactly when re-analysis is needed.

8. **Cryptographic tokens** — resume tokens (32-byte, hashed in DB, 7-day expiry) and review access tokens (64-char) provide secure, stateless access without authentication.

9. **Response state machine** — prevents concurrent voice API response calls with a 30-second timeout for hung responses.

10. **Defensive WebSocket sends** — all WebSocket operations wrapped in `safeSend()` to prevent crashes from stale connections.

---

## 9. Where We Might Go Next

### 9.1 Domain-Specific Intelligence

The strategic context system (content/product/marketing/CX) is currently a light layer on top of generic analytics. This could evolve into deeply specialized domain intelligence:

- **Content strategy mode**: Automatically identify content pillars, audience segments by content preference, optimal formats (video vs. article vs. social), seasonal relevance, and SEO keyword opportunities from interview verbatims
- **Product development mode**: Map interview insights to user story formats, prioritize features by pain frequency and intensity, identify personas from behavioral patterns, generate PRDs from research themes
- **Marketing & brand mode**: Extract brand perception dimensions, competitive positioning insights, messaging frameworks, and audience psychographic segments
- **CX optimization mode**: Map customer journey stages to pain points, identify service recovery opportunities, generate support knowledge base articles from common issues
- **Healthcare/clinical research mode**: Specialized consent flows, adverse event detection, symptom language normalization, compliance-grade audit trails
- **Education research mode**: Learning outcome mapping, pedagogical pattern detection, student engagement analysis

### 9.2 Multi-Modal Interviews

- **Video interviews** — facial expression analysis alongside voice (engagement, confusion, enthusiasm detection)
- **Screen sharing** — respondents show workflows while discussing them; Alvia asks about what she sees
- **Image/document reactions** — show stimuli during interviews and capture verbal + emotional responses
- **Chat-based interviews** — text alternative for accessibility or preference, with the same Barbara orchestration

### 9.3 Advanced Analytics

- **Longitudinal analysis** — track how themes and sentiments evolve across collection waves over time
- **Statistical significance** — automated sample size recommendations and confidence intervals for findings
- **Predictive analytics** — forecast likely themes and saturation points based on early interviews
- **Sentiment trajectory** — how respondent sentiment changes throughout an interview (warm-up effect, fatigue, etc.)
- **Network analysis** — map relationships between themes, concepts, and respondent segments
- **Automated coding** — qualitative coding frameworks (grounded theory, thematic analysis) applied automatically
- **Respondent clustering** — automatically identify respondent personas based on response patterns

### 9.4 Collaboration & Workflow

- **Multi-researcher collaboration** — shared annotation, comment threads on segments, team review workflows
- **Research repository** — searchable archive of all insights, verbatims, and themes across projects
- **Integration with research tools** — export to Dovetail, Notion, Airtable, or qualitative analysis tools (NVivo, Atlas.ti)
- **Automated briefing documents** — generate stakeholder-ready reports from analytics
- **Insight delivery pipelines** — scheduled digests of emerging themes to Slack, email, or dashboards

### 9.5 Interview Intelligence

- **Adaptive interview flow** — dynamically reorder or skip questions based on respondent answers (beyond current additional questions)
- **Multi-language support** — conduct interviews in multiple languages with consistent analysis
- **Interviewer coaching** — use Barbara's analysis to train human interviewers (show where AI would have probed deeper)
- **Panel management** — longitudinal respondent panels with recall for follow-up interviews
- **Respondent scheduling** — calendar integration for scheduled interview slots
- **Emotional intelligence** — detect respondent discomfort, fatigue, or enthusiasm in real-time and adapt accordingly

### 9.6 Enterprise Features

- **SSO/SAML** — enterprise authentication beyond Replit OIDC
- **Role-based access control** — granular permissions beyond current owner/creator/analyst/respondent
- **Audit logging** — compliance-grade logs of all data access and modifications
- **Data residency** — regional data storage for GDPR/sovereignty requirements
- **White-labeling** — custom branding for the respondent-facing experience
- **API access** — programmatic access for integration into existing research workflows

---

## 10. System Philosophy

Alvia is built on the principle that **the best qualitative research comes from natural, adaptive conversations** — not rigid scripts or forms. The dual-agent architecture reflects this:

- **Alvia is the skilled interviewer** — warm, conversational, adaptive, responsive to what the respondent actually says. She doesn't feel like a chatbot reading a script; she feels like a thoughtful human who happens to have perfect recall and infinite patience.

- **Barbara is the research director** — invisible to the respondent, watching the conversation unfold, identifying gaps, detecting when Alvia should probe deeper or move on, and synthesizing everything into structured insights. She ensures research rigor without disrupting conversational flow.

The system is **researcher-centric**: researchers retain full control over objectives, questions, guidance, and analytical priorities. The AI amplifies their expertise rather than replacing their judgment. Every analytics output is grounded in specific evidence (verbatim quotes, quality scores, sentiment analysis), enabling researchers to verify and build on AI-generated insights.

At the same time, the system is **respondent-respectful**: consent is explicit and granular, PII is anonymized at every analysis stage, audio quality is monitored to ensure a smooth experience, and the interview adapts to each respondent's pace and depth of engagement. The goal is that respondents feel heard, not interrogated.
