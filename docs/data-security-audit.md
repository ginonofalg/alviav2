# Alvia Data Security Audit & GDPR Compliance Report

**Date:** 2026-02-28

---

## Table of Contents

1. [Data Flow Audit](#1-data-flow-audit)
2. [Platform-by-Platform GDPR Compliance](#2-platform-by-platform-gdpr-compliance)
3. [Existing GDPR-Positive Measures](#3-existing-gdpr-positive-measures)
4. [Data Security Statement](#4-data-security-statement)
5. [Action Checklist: OpenAI & Google API Settings](#5-action-checklist-openai--google-api-settings)
6. [Database Migration to Neon (EU)](#6-database-migration-to-neon-eu)

---

## 1. Data Flow Audit

### Architecture Overview

```
Respondent (audio + voice)
    |
    v
Alvia Server (Replit, US-hosted)
    |
    |--- OpenAI Realtime API ---> Audio processing + transcription
    |    (gpt-realtime-mini, gpt-4o-mini-transcribe)
    |
    |--- [Alt] xAI Grok API ---> Audio processing + transcription
    |    (grok-3-fast, whisper-large-v3)
    |
    |--- OpenAI Chat/Responses API ---> Barbara analysis, summaries,
    |    (gpt-5-mini, gpt-5)              template generation, personas
    |
    |--- Google Gemini API ---> Infographic image generation
    |    (gemini-3-pro-image-preview)
    |
    +--- PostgreSQL (Replit) ---> All persistent data storage
         (US-hosted)
```

### What Data Goes Where

| Service | Data Sent | Retention | Used for Training | EU Residency | DPA Available |
|---------|-----------|-----------|-------------------|--------------|---------------|
| **OpenAI Realtime API** | Live respondent audio, system instructions, conversation history | 30 days (abuse monitoring); 1hr audio state | **No** (API data not used by default) | Yes (`eu.api.openai.com`) | [Yes](https://openai.com/policies/data-processing-addendum/) |
| **OpenAI Chat/Responses API** | Interview transcripts, analytics, project context, persona research, uploaded CSV/PDF files | 30 days (abuse monitoring) | **No** (API data not used by default) | Yes | Same DPA |
| **OpenAI web_search tool** | Persona research queries (population demographics) | 30 days | **No** | Yes | Same DPA (not HIPAA-eligible) |
| **xAI Grok API** | Live respondent audio, system instructions, conversation history | 30 days | **No** (enterprise terms exclude training) | Yes (`eu-west-1`) | [Yes](https://x.ai/legal/data-processing-addendum) |
| **Google Gemini API** | Analytics summaries (themes, findings) for infographic generation | Up to 55 days (abuse monitoring) | **No** if paid tier; **Yes** if free tier | Via Vertex AI only | [Yes](https://cloud.google.com/terms/data-processing-addendum) |
| **Replit PostgreSQL** | All persistent data: transcripts, PII, session state, redaction maps, LLM usage events, user accounts | Application lifetime | Review DPA | **No EU hosting available** | [Yes](https://replit.com/dpa) |
| **Replit OIDC** | OAuth tokens, user email/name/profile | Session lifetime (7-day TTL) | N/A | US only | Same DPA |

### Detailed Data Flows by Service

#### OpenAI Realtime API (Voice Interviews)

**Files:** `server/realtime-providers.ts`, `server/voice-interview.ts`

- Live PCM audio (24kHz) streamed from respondent via WebSocket
- System instructions containing interview objective, questions, and guidance
- Full conversation history between Alvia and respondent
- Transcription via `gpt-4o-mini-transcribe`
- Voice output: "marin" voice, PCM 16-bit 24kHz
- VAD (Voice Activity Detection): semantic VAD with configurable eagerness

#### OpenAI Chat/Responses API (Barbara Orchestrator)

**Files:** `server/barbara-orchestrator.ts`, `server/persona-generation/`

Eight tracked use cases:
1. `barbara_analysis` - Real-time guidance during interviews
2. `barbara_topic_overlap` - Cross-interview theme detection
3. `barbara_question_summary` - Per-question response analysis
4. `barbara_cross_interview_enhanced_analysis` - Collection-level analysis
5. `barbara_template_generation` - AI-generated interview templates
6. `barbara_additional_questions` - Dynamic follow-up questions
7. `barbara_session_summary` - End-of-interview summaries
8. `barbara_project_cross_template_analysis` - Cross-template analytics

Persona generation (via Responses API with `web_search` tool):
- `barbara_persona_research` - Population research with web search
- `barbara_persona_generation` - Persona synthesis from population brief
- Supports file upload (CSV/PDF/TXT, max 2MB, base64 encoded)

#### xAI Grok API (Alternative Voice Provider)

**Files:** `server/realtime-providers.ts`

- Same data as OpenAI Realtime: live audio, instructions, conversation history
- Model: `grok-3-fast`, transcription via `whisper-large-v3`
- Voice: "Ara", server-based VAD (no semantic VAD)
- Selected via `REALTIME_PROVIDER=xai` environment variable

#### Google Gemini API (Infographics)

**Files:** `server/infographic-service.ts`, `server/routes/infographic.routes.ts`

- Analytics summaries (themes, findings, insights) sent as text prompts
- Models: `gemini-3-pro-image-preview`, `gemini-2.5-flash-image`
- Output: base64 PNG images stored locally in `generated-infographics/`
- Auto-cleanup: keeps only last 100 infographics

#### PostgreSQL Database (All Persistent Storage)

**Files:** `server/db.ts`, `server/storage.ts`, `shared/schema.ts`

Stores:
- Interview sessions with full transcripts (`liveTranscript` JSONB)
- Respondent data (names, emails, profile fields)
- Segments (question responses, summaries, key quotes, extracted values)
- PII redaction maps (original tokens to pseudonyms)
- LLM usage events (immutable billing ledger, 16 use cases)
- Performance metrics (token usage, latency, speaking time)
- Session summaries (Alvia and Barbara)
- Barbara guidance logs
- User accounts and sessions
- Workspace/project/template/collection hierarchy

### WebSocket Data Flow (Real-Time Interview)

```
Client --> Server:  Audio PCM chunks, pause/resume signals
Server --> OpenAI:  Audio chunks, session config, VAD updates
OpenAI --> Server:  Response audio, transcripts, token usage
Server --> Client:  Audio deltas, transcript updates, Barbara guidance
```

State persisted to PostgreSQL every 2 seconds for crash recovery.

---

## 2. Platform-by-Platform GDPR Compliance

### OpenAI

| Aspect | Status |
|--------|--------|
| **GDPR Compliance** | Aligned; OpenAI Ireland Limited processes EEA/Swiss data |
| **DPA** | Self-serve at [openai.com/policies/data-processing-addendum](https://openai.com/policies/data-processing-addendum/) |
| **SCCs** | Included (Module 2: Controller-to-Processor, Module 3: Processor-to-Processor) |
| **Data Retention** | 30 days for abuse monitoring; Whisper transcription has no default retention |
| **Training** | API data NOT used for training (default since March 2023, opt-in only) |
| **Zero Data Retention** | Available with approval; eliminates 30-day abuse monitoring window |
| **EU Data Residency** | Available via `eu.api.openai.com`; Realtime API supported on select models |
| **Certifications** | SOC 2 Type 2, ISO 27001/27017/27018/27701, CSA STAR |
| **Post-Termination** | 30-day deletion commitment |
| **Audit Rights** | Annual audit at customer's expense |
| **Regulatory Note** | Italy's Garante fined OpenAI EUR 15M for consumer ChatGPT issues; API platform not directly targeted |

**References:**
- [OpenAI Security & Privacy](https://openai.com/security-and-privacy/)
- [OpenAI API Data Usage Guide](https://developers.openai.com/api/docs/guides/your-data/)
- [OpenAI Trust Portal](https://trust.openai.com/)
- [EU Data Residency Announcement](https://openai.com/index/introducing-data-residency-in-europe/)

### xAI / Grok

| Aspect | Status |
|--------|--------|
| **GDPR Compliance** | Framework in place; active regulatory scrutiny |
| **DPA** | Available at [x.ai/legal/data-processing-addendum](https://x.ai/legal/data-processing-addendum) |
| **SCCs** | Included (Module 2 and Module 3) |
| **Data Retention** | 30 days; auto-deleted unless legally required |
| **Training** | Enterprise API data explicitly NOT used for training |
| **EU Data Residency** | Available via `eu-west-1` endpoint |
| **Certifications** | SOC 2 Type 2, TLS 1.3, AES-256 |
| **Regulatory Note** | Active DPC (Ireland) statutory inquiry since April 2025; investigations by UK ICO and French prosecutors in 2025-2026 |

**References:**
- [xAI DPA](https://x.ai/legal/data-processing-addendum)
- [xAI Europe Privacy Addendum](https://x.ai/legal/europe-privacy-policy-addendum)
- [xAI Security](https://x.ai/security)

### Google Gemini

| Aspect | Status |
|--------|--------|
| **GDPR Compliance** | Compliant via Google Cloud (Vertex AI) or paid Gemini Developer API |
| **DPA** | Google Cloud Data Processing Addendum at [cloud.google.com/terms/data-processing-addendum](https://cloud.google.com/terms/data-processing-addendum) |
| **Data Retention** | Up to 55 days (abuse monitoring); Google Search grounding: 30 days (cannot be disabled) |
| **Training** | Paid tier: NOT used; Free tier (AI Studio): MAY be used |
| **Zero Data Retention** | Available with approval for paid tier |
| **EU Data Residency** | Available via Vertex AI with region selection |
| **Certifications** | SOC 1/2/3, ISO 27001/27017/27018/27701, ISO 42001, PCI-DSS v4.0, FedRAMP High (Vertex AI) |

**Critical:** Free-tier AI Studio data may be used for model improvement. Confirm you are on a paid billing account.

**References:**
- [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)
- [Gemini API Zero Data Retention](https://ai.google.dev/gemini-api/docs/zdr)
- [Gemini Compliance & Security Controls](https://docs.google.com/gemini/enterprise/docs/compliance-security-controls)

### Replit (Hosting & Authentication)

| Aspect | Status |
|--------|--------|
| **GDPR Compliance** | DPA available for entity customers; significant EU residency limitation |
| **DPA** | Available at [replit.com/dpa](https://replit.com/dpa) |
| **SCCs** | Module 2 (Controller-to-Processor) |
| **Data Residency** | **US only** (Google Cloud Platform). No EU database hosting option |
| **Certifications** | SOC 2 Type 2 (infrastructure via GCP) |
| **Subprocessors** | Listed at [replit.com/subprocessors](https://replit.com/subprocessors) |

**This is the primary GDPR gap.** All interview transcripts, respondent PII, session data, and redaction maps are stored in US data centers with no EU residency option.

**References:**
- [Replit DPA](https://replit.com/dpa)
- [Replit Privacy Policy](https://replit.com/privacy-policy)
- [Replit Security](https://replit.com/products/security)

### Risk Summary

| Service | DPA | Retention | No Training | EU Residency | ZDR | Risk Level |
|---------|-----|-----------|-------------|--------------|-----|------------|
| OpenAI API | Yes | 30 days | Yes | Yes | Yes (approval) | **Medium** |
| OpenAI Realtime | Yes | 30 days + 1hr audio | Yes | Yes (select models) | Yes | **Medium** |
| xAI Grok | Yes | 30 days | Yes (enterprise) | Yes | Yes | **Medium-High** |
| Google Gemini | Yes | 55 days | Yes (paid tier) | Vertex AI only | Yes (approval) | **Medium** |
| Replit hosting | Yes | App lifetime | Review DPA | **No** | N/A | **High** |
| Replit PostgreSQL | Yes | App lifetime | N/A | **No** | N/A | **High** |

---

## 3. Existing GDPR-Positive Measures

The Alvia codebase already implements several GDPR-aligned measures:

- **PII redaction**: `redactionMaps` table stores original-to-pseudonym mappings; prompt-level instructions anonymize names, locations, companies, dates, and contacts in all Barbara-generated analysis and verbatim quotes
- **Consent tracking**: Per-project `consentAudioRecording` and `consentTranscriptOnly` flags; respondent `consentGivenAt` timestamp recorded before interviews begin
- **Data retention**: Workspace-level `retentionDays` (default 90 days); LLM usage events auto-deleted after 14 days via `usage-maintenance.ts`
- **Invite-only access**: Email-based access control via `inviteList` table
- **Role-based access control**: Workspace roles (owner, creator, analyst, respondent)
- **Session encryption**: `SESSION_SECRET` for cookie encryption; HTTP-only secure cookies
- **LLM usage audit trail**: All LLM calls tracked in `llmUsageEvents` with full hierarchy attribution
- **Resume token expiry**: Cryptographic tokens (32-byte, base64url) with 7-day expiry

---

## 4. Data Security Statement

*Adapt this statement for stakeholders, privacy notices, or compliance documentation.*

> ### Alvia Data Security & Privacy Statement
>
> **Data Processing Principles**
>
> Alvia processes interview data in accordance with GDPR principles of purpose limitation, data minimization, and storage limitation. All data processing is governed by Data Processing Agreements (DPAs) with each sub-processor.
>
> **AI/LLM Data Use**
>
> Interview audio and transcripts are processed by OpenAI's API platform for real-time voice conversation and analysis. **OpenAI does not use API customer data to train its models.** This is OpenAI's default policy for all API customers since March 2023. Data submitted via the API is retained for up to 30 days solely for abuse and safety monitoring, after which it is deleted. We are pursuing Zero Data Retention (ZDR) certification to eliminate even this monitoring window.
>
> Infographic generation uses Google's Gemini API on a paid tier, which similarly does not use customer data for model training.
>
> **No data submitted to any AI provider is used for model training, improvement, or any purpose other than generating the requested response.**
>
> **PII Protection**
>
> Alvia implements multi-layer PII protection:
> - Respondent consent is collected and recorded before any interview begins
> - PII redaction replaces identifying information (names, locations, companies, dates, contact details) with anonymized tokens in all AI-generated analysis and verbatim quotes
> - Redaction mappings are stored separately with restricted access
> - Projects can be configured for transcript-only mode (no audio retention)
>
> **Data Retention & Deletion**
>
> Interview data is retained for a configurable period (default 90 days) at the workspace level. LLM processing logs are automatically purged after 14 days. Session tokens expire after 7 days. Data deletion requests can be fulfilled by removing sessions and their associated segments, transcripts, and redaction maps.
>
> **Access Control**
>
> Platform access is invite-only. All authenticated sessions use encrypted cookies over HTTPS. Workspace-level role-based access control (owner, creator, analyst, respondent) restricts data visibility.
>
> **Sub-processors**
>
> | Sub-processor | Purpose | DPA in Place |
> |---|---|---|
> | OpenAI | Voice interview AI, transcript analysis, template generation | Yes |
> | Google (Gemini) | Infographic image generation | Yes |
> | Replit | Application hosting, database, authentication | Yes |
>
> **Certifications of Sub-processors**: All sub-processors hold SOC 2 Type 2 certification. OpenAI additionally holds ISO 27001, 27017, 27018, and 27701 certifications. Google holds ISO 27001, 42001, and FedRAMP High certification.
>
> **Ongoing Compliance**
>
> We are actively pursuing EU data residency for API processing via OpenAI's EU endpoint, and evaluating EU-hosted database alternatives to strengthen data residency posture for European participants.

---

## 5. Action Checklist: OpenAI & Google API Settings

### OpenAI (Highest Priority)

| # | Action | Priority | How |
|---|--------|----------|-----|
| 1 | **Sign the DPA** | Critical | Self-serve at [openai.com/policies/data-processing-addendum](https://openai.com/policies/data-processing-addendum/) |
| 2 | **Apply for Zero Data Retention (ZDR)** | High | Contact OpenAI sales or request via Organization Settings. Eliminates the 30-day abuse monitoring window |
| 3 | **Enable EU data residency** | High | Create a new API project configured for EU residency. Update base URL from `api.openai.com` to `eu.api.openai.com` in `server/realtime-providers.ts` and `server/barbara-orchestrator.ts` |
| 4 | **Verify training is disabled** | Medium | Organization Settings > confirm data sharing is NOT opted in (should be default) |
| 5 | **Set `store: false` on Responses API** | Medium | If not using ZDR, add `store: false` to Responses API calls in `barbara-orchestrator.ts` and `persona-generation/research.ts` |
| 6 | **Check Realtime model EU eligibility** | Medium | EU residency for Realtime API is supported on `gpt-realtime-2025-08-28` and `gpt-4o-realtime-preview-2025-06-03`. Verify your `gpt-realtime-mini` model is eligible or update |

### Google Gemini

| # | Action | Priority | How |
|---|--------|----------|-----|
| 1 | **Confirm paid tier** | Critical | Free tier (AI Studio) data MAY be used for training. Verify `GEMINI_API_KEY` is from a paid billing account |
| 2 | **Sign the Google Cloud DPA** | High | Available at [cloud.google.com/terms/data-processing-addendum](https://cloud.google.com/terms/data-processing-addendum) |
| 3 | **Consider Vertex AI migration** | Medium | Vertex AI offers EU data residency and enterprise controls. Current integration in `server/infographic-service.ts` uses Gemini Developer API |
| 4 | **Request ZDR** | Medium | Available for paid Gemini Developer API with approval |

### xAI / Grok (If Using)

| # | Action | Priority | How |
|---|--------|----------|-----|
| 1 | **Sign the DPA** | Critical | Available at [x.ai/legal/data-processing-addendum](https://x.ai/legal/data-processing-addendum) |
| 2 | **Switch to EU endpoint** | High | Update WebSocket URL in `server/realtime-providers.ts` to use `eu-west-1` region |
| 3 | **Monitor regulatory situation** | Ongoing | Active DPC investigation; reassess periodically |

### Replit / Database

| # | Action | Priority | How |
|---|--------|----------|-----|
| 1 | **Sign the DPA** | Critical | Available at [replit.com/dpa](https://replit.com/dpa) |
| 2 | **Migrate database to EU** | High | See Section 6 below |
| 3 | **Conduct a DPIA** | High | Required under GDPR Article 35 given processing of interview audio/transcripts containing personal data with international transfers |

---

## 6. Database Migration to Neon (EU)

### Why Migrate

The Replit-hosted PostgreSQL database is in the US with no EU residency option. All interview transcripts, respondent PII, consent records, session data, and redaction maps reside in US data centers. This is the single largest GDPR compliance gap.

[Neon](https://neon.tech) offers managed PostgreSQL with EU regions (e.g., `aws-eu-central-1` Frankfurt).

### Migration Complexity: Very Low

The entire database connection is configured through a single environment variable (`DATABASE_URL`). There are only two connection points in the codebase, and neither uses any Replit-specific drivers or APIs.

### Current Database Code

**`server/db.ts`** (main application connection):
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

**`server/replit_integrations/auth/replitAuth.ts`** (session store):
```typescript
const pgStore = connectPg(session);
const sessionStore = new pgStore({
  conString: process.env.DATABASE_URL,
  createTableIfMissing: false,
  ttl: sessionTtl,
  tableName: "sessions",
});
```

**`drizzle.config.ts`** (schema management):
```typescript
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

### No Code Changes Required

All three connection points read from `DATABASE_URL`. The migration is:

1. **Create a Neon project** in `aws-eu-central-1` (Frankfurt)
2. **Export current database**: `pg_dump $DATABASE_URL > alvia_backup.sql`
3. **Import into Neon**: `psql $NEON_DATABASE_URL < alvia_backup.sql`
4. **Update `DATABASE_URL`** environment variable on Replit to the Neon connection string
5. **Restart the app**

### Compatibility Notes

| Factor | Status |
|--------|--------|
| **Driver** | `pg` (node-postgres) works with Neon out of the box. No driver change needed. Neon's optional `@neondatabase/serverless` driver is not required |
| **Drizzle ORM** | Fully compatible. `drizzle-kit push` works identically |
| **Session store** | `connect-pg-simple` uses standard PostgreSQL. No changes |
| **Advisory locks** | `pg_try_advisory_lock` used by simulation system is fully supported by Neon |
| **SSL** | Neon requires SSL by default. Connection strings include `sslmode=require`, handled automatically by `pg.Pool` |
| **Schema management** | `npm run db:push` works with the new `DATABASE_URL` |

### Connection Pooling Consideration

Neon provides built-in connection pooling. For optimal setup:

- Use the **pooled connection string** (ends in `-pooler.neon.tech`) for general queries
- Use the **direct connection string** for operations requiring persistent connections (advisory locks in simulation system)

If needed, `server/db.ts` could be updated to support both:

```typescript
// Optional enhancement for Neon pooling
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Direct connection for advisory locks (simulation system)
export const directPool = new Pool({
  connectionString: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL,
});
```

### Latency Consideration

With the app server on Replit (US) and the database in EU, each DB query adds ~100-150ms transatlantic latency.

| Operation | Impact |
|-----------|--------|
| State persistence (every 2s, async) | Negligible - debounced and non-blocking |
| Barbara analysis DB writes | Negligible - LLM call takes seconds, DB write latency trivial by comparison |
| Dashboard/API page loads | Noticeable - multiple queries per request may add 200-500ms total |
| Real-time transcript updates | Minor - writes are async |

If latency becomes an issue, the next step would be moving the app server to EU hosting as well.

### Migration Checklist

- [ ] Create Neon account and project in `aws-eu-central-1`
- [ ] Create a database in the Neon project
- [ ] Export production data: `pg_dump --no-owner --no-acl $DATABASE_URL > backup.sql`
- [ ] Import to Neon: `psql $NEON_DATABASE_URL < backup.sql`
- [ ] Verify table count and row counts match
- [ ] Update `DATABASE_URL` on Replit to Neon connection string
- [ ] Restart the application
- [ ] Verify authentication works (session store)
- [ ] Verify an interview can start and persist state
- [ ] Verify dashboard loads with existing data
- [ ] Monitor query latency for first 24 hours
- [ ] Decommission old Replit database after confirmation period
