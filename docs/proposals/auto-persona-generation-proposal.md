# Auto-Persona Generation Proposal

**Date:** February 2026
**Status:** Draft
**Author:** Engineering

---

## 1. Problem Statement & Value

### The Bottleneck

Creating personas for interview simulations is entirely manual today. Each persona has 14+ fields (name, age range, gender, occupation, location, attitude, verbosity, domain knowledge, traits, communication style, background story, topics to avoid, biases, description). A representative simulation set requires 5–10 personas, meaning **70–140 fields** must be hand-authored per project.

This bottleneck has three effects:

1. **Setup friction** — researchers spend 30–60 minutes creating personas before they can run a single simulation, discouraging experimentation.
2. **Shallow personas** — under time pressure, researchers default to stereotypical archetypes rather than representative population segments.
3. **Low coverage** — most projects end up with 3–4 personas instead of the 5–10 needed for meaningful simulation diversity.

### Strategic Value

AI-generated personas grounded in web research transform simulations from a convenience feature into a research-grade tool. When personas reflect real demographic distributions, behavioral patterns, and domain-specific communication norms, simulation outputs become meaningfully predictive of how actual interviews will unfold.

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to create 5 personas | 30–60 min | < 2 min |
| Personas per project (median) | 3 | 7 |
| Simulation adoption rate | — | +40% |

---

## 2. Input Design

### Research Prompt (Required)

A free-form text area where the researcher describes their target population:

> *"Urban millennials (25-35) in Southeast Asia who use ride-hailing apps daily for commuting. Mix of white-collar workers and gig economy participants. Include people who recently switched from public transit."*

**Validation:** minimum 20 characters, maximum 2,000 characters.

### Project Context Auto-Fill

The generation system automatically pulls existing project metadata to enrich the prompt. These fields come from the `projects` table and are injected into the research phase without additional user input:

| Field | Source | Purpose |
|-------|--------|---------|
| `objective` | `projects.objective` | Aligns personas to research goals |
| `audienceContext` | `projects.audience_context` | Grounds personas in target audience |
| `strategicContext` | `projects.strategic_context` | Focuses personas on strategic questions |
| `contextType` | `projects.context_type` | Adjusts persona framing (product, marketing, CX, content) |
| `avoidRules` | `projects.avoid_rules` | Carries forward topic restrictions into persona creation |

If a project has minimal metadata, the dialog surfaces a warning (consistent with `GenerateTemplateDialog`'s existing pattern) and proceeds with the user's research prompt alone.

### Additional Context (V1: Paste-Text Only)

A secondary text area for pasting supporting data — survey excerpts, demographic tables, screening criteria, prior research notes. Maximum 5,000 characters.

> **Note:** Document upload (CSV, PDF) is deferred to V2. Paste-text delivers ~80% of the value without the complexity of file parsing, format detection, and PDF extraction libraries. See [Section 9: Future Extensions](#9-future-extensions).

### Configuration

| Setting | Options | Default | Notes |
|---------|---------|---------|-------|
| Persona count | 3–10 | 5 | Aligned with `SIMULATION_LIMITS.MAX_PERSONAS_PER_RUN` (10) |
| Edge case personas | Toggle | Off | When on, includes 1–2 outlier personas (e.g., extreme skeptic, domain expert with atypical views) |
| Diversity mode | `balanced` \| `maximize` | `balanced` | `maximize` forces maximum spread across attitude, verbosity, and domain knowledge enums |

---

## 3. Web Research Phase

### Approach: OpenAI Responses API with `web_search` Tool

The research phase uses OpenAI's Responses API with the built-in `web_search` tool for model-directed web research.

**Rationale for this choice:**

- **Single vendor** — Alvia already uses OpenAI for all LLM workloads (voice, orchestration, simulation). No new API keys, billing accounts, or vendor relationships.
- **Model-directed search** — the model decides what to search for based on the research prompt, rather than requiring us to engineer search queries.
- **Inline citations** — search results include source URLs that can be carried through to the final personas.
- **No infrastructure** — no Serper/SerpAPI keys, no scraping infrastructure, no result parsing.

### What the Research Phase Searches For

The model is instructed to research the following dimensions of the target population:

1. **Demographic distributions** — age, gender, income, education, geographic spread
2. **Behavioral patterns** — usage habits, decision-making factors, adoption curves
3. **Communication norms** — formality levels, directness, cultural communication styles
4. **Domain knowledge levels** — what the population typically knows vs. doesn't
5. **Biases and sensitivities** — common preconceptions, sensitive topics, trust factors

### Fallback Strategy (First-Class, Not Afterthought)

Web search results are inherently unreliable. The system must degrade gracefully:

| Scenario | Detection | Behavior |
|----------|-----------|----------|
| Search returns no useful results | Model self-reports low confidence | Generate from prompt + project context only; flag as "ungrounded" |
| Search returns partial results | Some dimensions have citations, others don't | Use available research; fill gaps from prompt context; indicate which dimensions are research-backed |
| API rate limit / timeout | HTTP error from Responses API | Skip research phase entirely; proceed to synthesis with prompt-only input; surface warning to user |
| Responses API unavailable | Connection failure | Fall back to standard `chat.completions` endpoint without web search |

The population brief (output of this phase) always includes a `confidence` field (`high`, `medium`, `low`) so downstream consumers and the user can assess groundedness.

---

## 4. Two-Phase Generation Architecture

### Why Two Phases?

Separating research from synthesis provides three concrete benefits:

1. **Reusability** — the population brief is an independently valuable artifact. Regenerating personas (Phase 2) doesn't require re-running expensive web research (Phase 1).
2. **Debuggability** — when a persona seems wrong, the team can inspect the population brief to determine whether the issue is in research or synthesis.
3. **Cost efficiency** — Phase 1 (with web search) costs significantly more than Phase 2. Allowing Phase 2 re-runs without Phase 1 reduces cost for iterative refinement.

### Phase 1: Population Research

| Property | Value |
|----------|-------|
| **Duration** | ~20–40 seconds |
| **Model** | Reasoning model (e.g., `o3-mini`) via Responses API |
| **Tools** | `web_search` (built-in) |
| **Input** | Research prompt + project context auto-fill + pasted additional context |
| **Output** | Structured population brief (JSON) with inline citations |
| **LLM use case** | `barbara_persona_research` |

**Population brief schema:**

```typescript
interface PopulationBrief {
  targetPopulation: string;
  confidence: "high" | "medium" | "low";
  demographics: {
    summary: string;
    distributions: Array<{ dimension: string; breakdown: string; source?: string }>;
  };
  behavioralPatterns: Array<{ pattern: string; prevalence: string; source?: string }>;
  communicationNorms: Array<{ norm: string; context: string; source?: string }>;
  domainKnowledgeLevels: Array<{ segment: string; level: string; description: string }>;
  biasesAndSensitivities: Array<{ topic: string; nature: string; source?: string }>;
  sources: Array<{ url: string; title: string; relevance: string }>;
  searchQueriesUsed: string[];
}
```

### Phase 2: Persona Synthesis

| Property | Value |
|----------|-------|
| **Duration** | ~10–20 seconds |
| **Model** | `gpt-5` via `chat.completions` with `response_format: { type: "json_object" }` |
| **Tools** | None |
| **Input** | Population brief + persona count + diversity mode + edge case toggle |
| **Output** | Array of persona objects matching `InsertPersona` schema |
| **LLM use case** | `barbara_persona_generation` |

### Population Brief Persistence (V1)

The population brief is persisted in the database to enable Phase 2 re-runs without re-running Phase 1. Storage approach:

- **Option A (recommended):** New `population_briefs` table with `id`, `projectId`, `brief` (jsonb), `researchPrompt`, `createdAt`. Simple, queryable, follows existing patterns.
- **Option B:** Store as jsonb on the `projects` table. Simpler but couples research artifacts to project records.

Recommendation: Option A. It keeps the data model clean and allows multiple research runs per project.

---

## 5. Diversity & Quality

### Systematic Enum Distribution

The synthesis prompt enforces distribution across the three behavioral enums defined in the persona schema:

**Attitude** (`personaAttitudeEnum`): cooperative, reluctant, neutral, evasive, enthusiastic
**Verbosity** (`personaVerbosityEnum`): low, medium, high
**Domain Knowledge** (`personaDomainKnowledgeEnum`): none, basic, intermediate, expert

Distribution rules:

| Mode | Strategy |
|------|----------|
| `balanced` | At least 2 distinct values per enum; no single value used more than 40% of the time |
| `maximize` | Every generated persona must have a unique (attitude, verbosity, domainKnowledge) combination. With 5+ personas, at least 3 distinct values per enum |

### Anti-Stereotyping Prompts

The synthesis system prompt includes explicit instructions to avoid stereotypical persona construction:

```
DIVERSITY RULES:
1. Do NOT assign personality traits based on demographic stereotypes (e.g., do not
   make all young people "tech-savvy" or all older people "resistant to change").
2. Vary occupation and education independently of age and gender.
3. Assign "reluctant" or "evasive" attitudes to demographically diverse personas —
   not only to older or less educated segments.
4. Background stories should reflect individual circumstances, not demographic
   generalizations.
5. Ensure at least one persona contradicts the "expected" profile for their
   demographic segment (e.g., a senior citizen who is an early adopter, or a
   tech worker with low domain knowledge in their own field).
```

### Post-Generation Diversity Validation

After Phase 2, the backend validates the generated persona set:

1. **Enum coverage** — verify minimum distinct values per behavioral enum
2. **Demographic spread** — check that age ranges, genders, and locations are not monolithic
3. **Name diversity** — ensure names reflect the target population's cultural context
4. **Trait uniqueness** — no two personas should share more than 50% of their traits array

If validation fails, the system re-runs Phase 2 (up to 2 retries) with an appended correction prompt specifying which dimensions need more variation.

### Citation Tracking

Each generated persona includes a `_sources` metadata field (not persisted to the `personas` table) that links persona attributes back to the web sources that informed them. This is surfaced in the review UI so researchers can verify groundedness before saving.

---

## 6. UX Flow

### Entry Point

"Generate Personas with AI" button in the project's persona management area, alongside the existing manual "Add Persona" button. Uses the `Sparkles` icon consistent with `GenerateTemplateDialog`.

### Dialog States

The dialog follows the three-state pattern established by `GenerateTemplateDialog`:

```
┌─────────────────────────────────────────────┐
│  State 1: INPUT                             │
│  ┌───────────────────────────────────────┐  │
│  │ Research Prompt (text area)           │  │
│  │ "Describe your target population..." │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ Additional Context (text area)        │  │
│  │ "Paste survey data, demographics..."  │  │
│  └───────────────────────────────────────┘  │
│  Persona count: [5 ▼]  Edge cases: [○]     │
│  Diversity: [balanced ▼]                    │
│                                             │
│  (!) Limited project context (if applicable) │
│                                             │
│  [Cancel]                      [Generate]   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  State 2: GENERATING                        │
│  ┌───────────────────────────────────────┐  │
│  │ Phase 1: Researching population...    │  │
│  │ ████████████░░░░░░  ~30s              │  │
│  │                                       │  │
│  │ Phase 2: Generating personas...       │  │
│  │ ░░░░░░░░░░░░░░░░░░  waiting          │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [Cancel]                                   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  State 3: REVIEW                            │
│  ┌───────────────────────────────────────┐  │
│  │ [Population Brief] (expandable)       │  │
│  │  > 8 sources found, confidence: high │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ Persona Cards (scrollable)            │  │
│  │ ┌─────────────────────────────────┐   │  │
│  │ │ Maria Chen, 28                  │   │  │
│  │ │ Product Manager · Singapore     │   │  │
│  │ │ attitude: cooperative           │   │  │
│  │ │ verbosity: high                 │   │  │
│  │ │ domain: intermediate            │   │  │
│  │ │ [Remove] [View Sources]         │   │  │
│  │ └─────────────────────────────────┘   │  │
│  │ ┌─────────────────────────────────┐   │  │
│  │ │ Ravi Krishnan, 34               │   │  │
│  │ │ ...                             │   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [Regenerate ↻] [Cancel]  [Save N Personas] │
└─────────────────────────────────────────────┘
```

### Async Pattern

The existing `GenerateTemplateDialog` uses a direct `await` on a mutation with a 240-second timeout. This works because template generation completes in ~10–15 seconds.

Persona generation with web research takes 30–60 seconds total. Two options:

**Option A: Two sequential mutations (recommended for V1)** — split the operation into two client-side mutations that execute in sequence. Each mutation is a standard HTTP request with a generous timeout (90s for research, 60s for synthesis). The client updates the progress UI between mutations. This matches the existing `GenerateTemplateDialog` pattern (direct mutation, no polling) while providing real phase progress.

**Option B: Job polling** — create a generation job, poll for status. More robust for very long operations but adds complexity (job table, polling interval, cleanup). Overkill for V1 given the expected 30–60s total duration.

**Recommendation:** Option A for V1. Two sequential client-side mutations:
1. `POST /api/projects/:projectId/personas/research` → returns population brief
2. `POST /api/projects/:projectId/personas/synthesize` → accepts brief, returns personas

This gives real phase progress in the UI without polling infrastructure, and naturally enables the "regenerate personas only" flow (re-call mutation 2 with the existing brief).

### Review Actions

| Action | Behavior |
|--------|----------|
| **Remove persona** | Client-side removal from the generated set before saving |
| **View Sources** | Expandable panel showing which web sources informed this persona |
| **Regenerate** | Re-runs Phase 2 only (using the persisted population brief) |
| **New Research** | Re-runs both phases with the same or modified prompt |
| **Save N Personas** | Batch-creates all remaining personas via existing `POST /api/projects/:projectId/personas` |

---

## 7. Technical Architecture

### New Module: `server/persona-generation/`

Following CLAUDE.md guidelines:
- New files must stay under **500 lines** each
- Must not grow `barbara-orchestrator.ts` (watch list — must only shrink)
- New use cases go into dedicated module directories

```
server/persona-generation/
├── research.ts       # Phase 1: population research via Responses API (~150 lines)
├── synthesis.ts      # Phase 2: persona generation from brief (~200 lines)
├── validation.ts     # Post-generation diversity validation (~100 lines)
└── types.ts          # PopulationBrief, GenerationConfig, etc. (~80 lines)
```

### New Route File: `server/routes/persona-generation.routes.ts`

```typescript
// POST /api/projects/:projectId/personas/research
//   Body: { researchPrompt: string, additionalContext?: string }
//   Response: PopulationBrief

// POST /api/projects/:projectId/personas/synthesize
//   Body: { briefId: string, personaCount: number, diversityMode: string, edgeCases: boolean }
//   Response: { personas: InsertPersona[], briefId: string }
```

Both endpoints require authentication and `verifyUserAccessToProject`, consistent with existing persona routes.

### Barbara Config Extension

Add two new entries to `BarbaraConfig` interface and `barbaraConfig` default object:

```typescript
// In BarbaraConfig interface:
personaResearch: BarbaraUseCaseConfig;
personaGeneration: BarbaraUseCaseConfig;

// Default values:
personaResearch: {
  model: "o3-mini",        // Reasoning model for research quality
  verbosity: "medium",
  reasoningEffort: "medium",
},
personaGeneration: {
  model: "gpt-5",          // Fast structured output
  verbosity: "low",
  reasoningEffort: "low",
},
```

### LLM Use Case Tracking

Add two new entries to `LLM_USE_CASES` in `shared/types/llm-usage.ts`:

```typescript
export const LLM_USE_CASES = [
  // ... existing entries ...
  "barbara_persona_research",     // Phase 1: web research
  "barbara_persona_generation",   // Phase 2: persona synthesis
] as const;
```

Both phases use `withTrackedLlmCall` with `makeBarbaraUsageExtractor` for consistent token tracking.

### Database Changes

New table for population brief persistence:

```typescript
export const populationBriefs = pgTable("population_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  researchPrompt: text("research_prompt").notNull(),
  additionalContext: text("additional_context"),
  brief: jsonb("brief").notNull(),         // PopulationBrief JSON
  confidence: text("confidence").notNull(), // "high" | "medium" | "low"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_population_brief_project").on(table.projectId),
]);
```

### No New Environment Variables

Uses existing `OPENAI_API_KEY`. The Responses API and `web_search` tool are accessed through the same OpenAI client.

---

## 8. Edge Cases & Risks

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Poor web search results** | Medium | Personas lack real-world grounding | Confidence flag in population brief; fallback to prompt-only generation; UI surfaces "ungrounded" warning |
| **Hallucinated citations** | Medium | False sense of research quality | Surface all citations in review UI; include source URLs for manual verification; never auto-save without review |
| **Responses API instability** | Low | Feature temporarily unavailable | Graceful fallback to `chat.completions` without web search; retry logic with exponential backoff |
| **Slow generation (>60s)** | Low–Medium | User abandons flow | Two-phase progress indicator; client-side timeout at 120s with clear error message; Phase 2-only retry |

### Cost Risks

| Risk | Mitigation |
|------|------------|
| **Expensive Phase 1 re-runs** | Persist population brief; enable Phase 2-only regeneration |
| **Runaway token usage** | Rate limit: max 5 generation requests per project per hour; use `withTrackedLlmCall` for full cost visibility |
| **Web search token overhead** | Responses API charges for search results in context; monitor via LLM usage tracking and adjust model/prompt if costs exceed budget |

### Quality Risks

| Risk | Mitigation |
|------|------------|
| **Stereotypical personas** | Explicit anti-stereotyping prompts (see Section 5); post-generation diversity validation with retry |
| **Culturally inappropriate names/backgrounds** | Prompt instructs model to use culturally appropriate names for the target population; researcher review before save |
| **Personas don't match project needs** | Project context auto-fill ensures alignment; review step allows removal of unsuitable personas |
| **Schema validation failures** | Validate each generated persona against `personaCreateSchema` before presenting to user; retry synthesis for any that fail |

### Operational Risks

| Risk | Mitigation |
|------|------------|
| **Feature abuse (excessive generation)** | Per-project hourly rate limit; generation events tracked in LLM usage log |
| **Data privacy** | Research prompt and web search do not include PII; population brief stores aggregated demographic data, not individual records |

---

## 9. Future Extensions (Out of Scope for V1)

### V2: Document Upload
- Support CSV, PDF, and plain text file uploads as additional context
- File parsing utility: CSV → structured data, PDF → extracted text, TXT → passthrough
- Maximum file size: 2MB
- Parsed content injected into the research prompt alongside pasted text
- Requires: file upload endpoint, parsing libraries (e.g., `pdf-parse`), file type validation

### V2+: Persona Refinement from Simulation Results
- After running simulations, analyze which personas produced the most/least valuable responses
- Suggest adjustments to persona attributes based on simulation quality signals
- "This persona's responses were consistently shallow — consider increasing domain knowledge"

### V3: Cross-Project Persona Reuse
- Persona library at workspace level
- "Import personas from another project" flow
- Persona templates (archetypes) that can be customized per project

### V3: Population Brief Library
- Save and browse population briefs across projects
- "Use this research for a different persona set" flow
- Compare population briefs across related projects

### V3: Persona Clustering & Segmentation
- Visualize generated personas on demographic/behavioral axes
- Identify coverage gaps in the persona set
- Suggest additional personas to fill gaps

---

## 10. Implementation Sequence

### Recommended Build Order

| Phase | Task | Effort | Dependencies |
|-------|------|--------|-------------|
| **1** | Define types in `server/persona-generation/types.ts` | S | None |
| **2** | Add `barbara_persona_research` and `barbara_persona_generation` to `LLM_USE_CASES` | XS | None |
| **3** | Add `personaResearch` and `personaGeneration` to `BarbaraConfig` | XS | None |
| **4** | Create `population_briefs` table in schema + migration | S | None |
| **5** | Implement Phase 1: `server/persona-generation/research.ts` | M | 1, 2, 3 |
| **6** | Implement Phase 2: `server/persona-generation/synthesis.ts` | M | 1, 2, 3 |
| **7** | Implement diversity validation: `server/persona-generation/validation.ts` | S | 1, 6 |
| **8** | Create routes: `server/routes/persona-generation.routes.ts` | M | 4, 5, 6, 7 |
| **9** | Build `GeneratePersonaDialog` component (Input + Generating states) | M | 8 |
| **10** | Build Review state with persona cards, sources, remove/save actions | M | 9 |
| **11** | Integration testing: end-to-end generation flow | M | 10 |
| **12** | Rate limiting and error handling polish | S | 8 |

**Effort key:** XS = < 1 hour, S = 1–3 hours, M = 3–8 hours

**Total estimated effort:** ~6–8 engineering days

### Parallelization Opportunities

- Phases 1–4 can be done in parallel (types, config, schema are independent)
- Phases 5–7 can be done in parallel (research, synthesis, validation are independent modules with shared types)
- Phase 9–10 can start once Phase 8 provides working endpoints

---

## Key Files Referenced

| File | Relevance |
|------|-----------|
| `shared/schema.ts` (lines 467–489) | `personas` table definition — generation output must match this |
| `shared/schema.ts` (lines 107–134) | `projects` table — source of auto-fill context fields |
| `shared/types/llm-usage.ts` | `LLM_USE_CASES` enum — extend with new use cases |
| `server/routes/persona.routes.ts` | Existing persona CRUD + `personaCreateSchema` validation |
| `server/simulation/persona-prompt.ts` | How persona fields map to LLM behavior (attitude/verbosity/domain guidance) |
| `server/barbara-orchestrator.ts` (lines 54–100) | `barbaraConfig` pattern to extend |
| `server/barbara-orchestrator.ts` (lines 2944–3080) | `generateTemplateFromProject` — closest existing AI generation pattern |
| `server/llm-usage.ts` | `withTrackedLlmCall` pattern for usage tracking |
| `client/src/components/GenerateTemplateDialog.tsx` | UX pattern to follow (three-state dialog) |
| `server/simulation/types.ts` (line 42) | `SIMULATION_LIMITS.MAX_PERSONAS_PER_RUN` = 10 — persona count ceiling |

---

## Appendix: Critique of Original Proposal & Adjustments Made

This proposal incorporates the following adjustments from the original plan:

1. **Document upload deferred to V2** — paste-text provides 80% of the value without file parsing complexity. PDF parsing alone would add a library dependency and significant error-handling surface area.

2. **Population brief persistence promoted to V1** — without persisting the brief, the key cost-saving benefit (Phase 2 re-runs without Phase 1) is lost. Added `population_briefs` table specification.

3. **Persona count aligned with `SIMULATION_LIMITS`** — the 3–10 range now explicitly references the existing `MAX_PERSONAS_PER_RUN` constant rather than introducing a separate limit.

4. **Async pattern clarified** — the original proposal referenced "async polling matching simulation run pattern" but `GenerateTemplateDialog` actually uses a direct mutation. This proposal recommends two sequential mutations (research → synthesize) for real phase progress without polling infrastructure.

5. **Web search fallback elevated to first-class** — moved from an edge case bullet point to a detailed fallback matrix with four degradation scenarios.

6. **CLAUDE.md compliance explicit** — file size limits (500 lines per new file), module placement (`server/persona-generation/`), and the constraint that `barbara-orchestrator.ts` must not grow are all addressed.

7. **Anti-stereotyping specifics added** — the original mentioned "explicit anti-stereotyping prompts" without detail. This proposal includes the actual prompt text and post-generation diversity validation rules.
