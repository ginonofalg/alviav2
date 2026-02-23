ialog flow — input (prompt + file + config) → researching/synthesizing (progress indicators with elapsed time) → review (persona cards with remove/regenerate/save controls). Ungrounded research and diversity warnings are surfaced clearly.

### 6.11 Conditional Question Flow

Questions in interview templates support conditional logic:

- `dependsOn` — references a prior question by index
- `showWhen` — pipe-separated values that trigger display (e.g., `"yes|maybe"`)
- `condition` — operators: `answered`, `not_answered`, `contains:keyword`, `equals:value`

This logic is evaluated both during live interviews and persona simulations. During simulations, the `evaluateConditionalLogic()` function checks prior answers and skips questions that don't meet their conditions.

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

- **Adaptive interview flow** — dynamically reorder or skip questions based on respondent answers (conditional logic exists for show/hide; full reordering is a future direction)
- **Multi-language support** — conduct interviews in multiple languages with consistent analysis
- **Interviewer coaching** — use Barbara's analysis to train human interviewers (show where AI would have probed deeper)
- **Panel management** — longitudinal respondent panels with recall for follow-up interviews
- **Respondent scheduling** — calendar integration for scheduled interview slots
- **Emotional intelligence** — detect respondent discomfort, fatigue, or enthusiasm in real-time and adapt accordingly

### 9.6 Simulation & Persona Intelligence

> **Note**: The core persona simulation and AI persona generation systems are now built (see Sections 6.9–6.10). Future directions in this area include:

- **Simulation benchmarking** — compare simulated interview results against real respondent data to calibrate persona realism and template effectiveness
- **Auto-persona tuning** — adjust persona parameters based on how well simulated responses match real respondent patterns
- **Saturation prediction** — use simulation data to predict when additional real interviews will yield diminishing returns
- **Template A/B testing** — run simulations with template variants to optimize question ordering, phrasing, and follow-up depth before fielding
- **Persona libraries** — shareable persona sets across projects for common research populations (e.g., "UK healthcare workers", "US tech early adopters")
- **Longitudinal simulation** — simulate the same persona across multiple collection waves to test for temporal consistency

### 9.7 Enterprise Features

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
