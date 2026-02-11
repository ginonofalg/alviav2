# Domain Intelligence: Encoding Approach

## Context

Alvia generates recommendations from raw interview data — themes, quality scores, word counts, sentiment. The result: generic advice like "Explore 'waiting times' in more depth" that reflects what was said, not what it means in the user's domain.

**Domain Intelligence** transforms this: recommendations grounded in domain foundations, scored against rubrics, traced to evidence, and referenced to established frameworks. Every recommendation carries provenance — which segment, which rule, what confidence.

---

## The Core Shift: Domain-Grounded Recommendations

### Current Output (Generic)

```
Type: explore_deeper
Title: "Explore 'waiting times' in more depth"
Priority: medium
Related themes: ["waiting_times"]
```

Metric-driven. Tells you what happened, not what it means.

### Domain-Intelligent Output (SaaS Product Research)

```
Type: dimension_gap
Title: "Onboarding friction is surface-level — missing activation barriers"
Priority: high
Dimension: user_onboarding (achieved: surface, expected: deep)
Domain rationale: "In SaaS product research, onboarding responses that stay at
  'it was confusing' without identifying WHERE confusion occurs (signup, first value,
  feature discovery) miss the activation metrics that predict churn."
Suggested action: "Restructure Q3 to probe specific onboarding stages:
  signup → setup → first value moment → habitual use"
Framework reference: AARRR Pirate Metrics → Activation (benchmark: 40-60%
  activation rate for B2B SaaS)
Evidence:
  segments: [seg_12, seg_34, seg_56]
  rule: "dimension_depth_gap:user_onboarding"
  confidence: 0.82
  signal phrases detected: ["confusing", "didn't know where to start", "took a while"]
Probing guidance: "Ask what specific step caused them to pause or seek help"
```

Every field is traceable. The recommendation exists because specific rules matched specific evidence.

### The DomainRecommendation Type

```typescript
type DomainRecommendation = {
  type: "dimension_gap" | "framework_insight" | "pattern_match"
      | "risk_escalation" | "benchmark_comparison" | "cross_dimension";
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";

  // Domain grounding
  dimensionId: string;
  dimensionDepthAchieved: DepthLevel;
  dimensionDepthExpected: DepthLevel;
  domainRationale: string;
  suggestedAction: string;

  // Framework reference (when applicable)
  frameworkReference?: {
    frameworkId: string;
    componentId: string;
    benchmarkContext?: string;
    alignmentNote: string;
  };

  // Provenance — every recommendation is traceable
  provenance: {
    segmentIds: string[];          // Which interview segments triggered this
    ruleId: string;                // Which scoring rule produced this
    confidence: number;            // 0-1 confidence score
    signalPhrasesDetected: string[];
    sessionCount: number;          // How many sessions show this pattern
  };

  // For feeding back into live interviews (Phase 3)
  probingGuidance?: string;
  relatedQuestions?: number[];
};
```

### Recommendation Types & What Powers Them

| Type | Trigger | Layers Used | Confidence Calculation |
|---|---|---|---|
| **dimension_gap** | Achieved depth < expected depth on weighted dimension | Dimensions + Rubrics | (weight × depth_deficit) × session_coverage |
| **framework_insight** | Theme maps to framework component with benchmark data | Frameworks + Dimensions | Match quality × evidence count |
| **pattern_match** | Response patterns match known domain trigger patterns | Probing Strategies | Signal phrase hit rate × session_coverage |
| **risk_escalation** | Theme touches high-significance dimension | Rubrics (significance criteria) | Significance weight × evidence strength |
| **benchmark_comparison** | Quantitative depth scores vs framework benchmarks | Frameworks + Rubrics | Benchmark data quality × sample size |
| **cross_dimension** | Findings span 2+ dimensions revealing systemic pattern | Dimensions + Frameworks | Co-occurrence frequency × dimension weights |

### Domain-Grounded Prioritization

Deterministic, not LLM-decided. Priority is computed from rubric significance criteria + confidence:

```
critical: significance = "critical" AND confidence >= 0.8 AND sessionCount >= 2
high:     significance >= "high" AND confidence >= 0.6
medium:   significance >= "medium" OR confidence >= 0.7
low:      everything else that passes minimum threshold
```

`critical` severity is **gated behind confidence + evidence thresholds** — a single weak signal never escalates to critical.

---

## Five Knowledge Layers

### Layer 1: Analysis Dimensions

4-7 dimensions per domain with depth rubrics.

**SaaS Product Research Example:**

| Dimension | Weight | Expected Depth | Signal Phrases |
|-----------|--------|---------------|----------------|
| **User Onboarding** | 0.9 | deep | "first time", "getting started", "setup" |
| **Feature Adoption** | 0.8 | deep | "use daily", "discovered", "workflow" |
| **Pain Points & Friction** | 0.9 | deep | "frustrating", "workaround", "can't find" |
| **Value Perception** | 0.7 | moderate | "worth it", "compared to", "ROI" |
| **Competitive Context** | 0.6 | moderate | "switched from", "also tried", "better than" |
| **Retention Signals** | 0.8 | deep | "would miss", "can't imagine", "might cancel" |

Each dimension carries `depthRubric[]` with surface/moderate/deep/expert levels, each with description + signal phrases.

### Layer 2: Domain Terminology

```typescript
type TerminologyLayer = {
  glossary: { term, definition, context }[];
  synonymGroups: { canonical, synonyms[], context? }[];
  sensitiveTerms: { term, reason, preferredAlternative?, severity }[];
  acronyms: { acronym, expansion, context? }[];
};
```

### Layer 3: Evaluation Rubrics

```typescript
type RubricsLayer = {
  dimensionRubrics: {
    dimensionId: string;
    qualityIndicators: { indicator, weight, positive }[];
    minimumDepthExpected: DepthLevel;
  }[];
  themeSignificanceCriteria: {
    name: string;            // "Churn Risk Signal"
    description: string;
    significance: "critical" | "high" | "medium" | "low";
    dimensionIds: string[];  // Which dimensions trigger this
  }[];
  recommendationCriteria: {
    triggerCondition: string;
    templateText: string;
    priority: "critical" | "high" | "medium" | "low";
  }[];
};
```

### Layer 4: Established Frameworks

```typescript
type FrameworksLayer = {
  frameworks: {
    id: string;              // "aarrr"
    name: string;            // "AARRR Pirate Metrics"
    description: string;
    source?: string;         // Citation / URL
    components: {
      id: string;
      name: string;          // "Activation"
      description: string;
      mappedDimensionIds: string[];
      benchmarkContext?: string;  // "40-60% for B2B SaaS"
    }[];
  }[];
};
```

### Layer 5: Probing Strategies

```typescript
type ProbingStrategiesLayer = {
  strategies: {
    id: string;
    name: string;
    triggerPatterns: { pattern, description, signalPhrases? }[];
    probeTemplates: string[];
    applicableDimensionIds: string[];
    priority: "high" | "medium" | "low";
  }[];
};
```

---

## DomainPackVersion

Domain knowledge is versioned. Every analytics run records which version it used, enabling reproducibility and safe iteration.

```typescript
type DomainPackVersion = {
  domainId: string;
  version: number;             // Monotonically increasing
  layers: {
    dimensions: DimensionsLayer;
    terminology: TerminologyLayer;
    rubrics: RubricsLayer;
    frameworks: FrameworksLayer;
    probingStrategies: ProbingStrategiesLayer;
  };
  publishedAt: Date;
  publishedBy: string;         // userId
  changelog?: string;
};
```

Analytics results store `domainPackVersion` in their output, so you can always trace which rules produced which recommendations.

---

## Database Schema

### Tables

**`domains`** — top-level domains and sub-domains (self-referential)
- `id`, `workspaceId` (null = global platform domain), `name`, `slug`, `description`
- `source`: `platform` | `generated` | `custom`
- `parentDomainId` (null = top-level; non-null = sub-domain)
- `isTemplate` (true = read-only platform template, forkable)
- `createdAt`, `updatedAt`

**`domainLayers`** — one row per layer per domain, versioned
- `id`, `domainId`, `layerType` (dimensions | terminology | rubrics | frameworks | probing_strategies)
- `content` (JSONB — shape varies by layerType, validated with Zod)
- `version` (integer, incremented on each update)
- Unique constraint on `(domainId, layerType)`

**`domainPackVersions`** — immutable snapshots used by analytics runs
- `id`, `domainId`, `version` (integer)
- `layers` (JSONB — full snapshot of all 5 layers at this version)
- `publishedAt`, `publishedBy`
- `changelog`
- Unique constraint on `(domainId, version)`

**`projectDomains`** — links a project to its domain + selected sub-domains
- `id`, `projectId`, `domainId` (top-level domain)
- `selectedSubDomainIds` (text array of sub-domain IDs)
- `domainPackVersionId` (which published version is active)
- Unique constraint on `projectId`

No changes to existing tables. `CollectionAnalytics` JSONB gains an optional `domainRecommendations` field alongside existing `recommendations`.

---

## Deterministic Scoring Pipeline

The recommendation engine is **not purely LLM-generated**. It uses a deterministic pipeline with LLM enhancement:

### Step 1: Terminology Mapping (Deterministic)

Before LLM analysis, run synonym group matching against segment transcripts:
- Match signal phrases to dimensions
- Map layperson terms to canonical domain terms
- Flag sensitive term usage

Output: per-segment dimension hit map with signal phrase evidence.

### Step 2: Dimension Depth Scoring (Rule-Based + LLM)

For each dimension with signal phrase hits:
- **Rule-based**: Count signal phrase matches, classify depth tier based on rubric thresholds
- **LLM-enhanced**: Barbara confirms/adjusts depth classification using full context
- Combine: LLM can upgrade (never downgrade more than 1 tier) from rule-based baseline

Output: per-dimension depth score with confidence.

### Step 3: Recommendation Generation (Rule-Based + LLM)

Rules fire deterministically based on scoring output:
- `dimension_gap`: depth_achieved < depth_expected for dimensions with weight > threshold
- `framework_insight`: dimension scores map to framework components with benchmark data
- `pattern_match`: probing strategy trigger patterns matched in transcripts
- `risk_escalation`: high-significance dimension touched with negative signals
- `benchmark_comparison`: quantitative depth vs framework benchmarks
- `cross_dimension`: co-occurring dimension signals in same segments

LLM enhancement: Barbara generates `domainRationale`, `suggestedAction`, and `description` text for each rule-fired recommendation. The LLM writes the prose; the rules decide WHICH recommendations exist and at what priority.

### Step 4: Provenance Assembly

Every recommendation carries full trace:
```
provenance: {
  segmentIds: ["seg_12", "seg_34"],     // Which segments matched
  ruleId: "dimension_gap:user_onboarding",  // Which rule fired
  confidence: 0.82,                      // Computed from evidence strength
  signalPhrasesDetected: ["confusing", "didn't know where to start"],
  sessionCount: 3
}
```

---

## Implementation Phases

### Phase 1: Core Engine (Domain-Agnostic)

Build the recommendation engine without any specific domain content. The engine is domain-agnostic — it processes any `DomainPackVersion` input.

**Scope:**
- Schema: `domains`, `domainLayers`, `domainPackVersions`, `projectDomains` tables
- Types: `DomainRecommendation`, all 5 layer types, `DomainPackVersion`, provenance types
- Storage: `domain-storage.ts` — CRUD + version publishing
- Core engine: `recommendation-engine.ts` — terminology mapping, dimension scoring, rule-based recommendation generation
- Prompt compiler: `prompt-compiler.ts` — compile domain context for collection analytics stage only
- Barbara integration: Add `domainContext?: string` to `generateCrossInterviewAnalysis()` only
- **Surface: Collection analytics only** — no live interview, no template/project analytics yet

**Files to create:**
- `shared/types/domain-knowledge.ts` — all type definitions (~300 lines)
- `server/domain/index.ts` — re-exports
- `server/domain/loader.ts` — load + merge domain context (~200 lines)
- `server/domain/prompt-compiler.ts` — stage-based compilation (~350 lines)
- `server/domain/recommendation-engine.ts` — deterministic scoring pipeline (~400 lines)
- `server/storage/domain-storage.ts` — domain CRUD + versioning (~300 lines)
- `server/routes/domains.routes.ts` — basic API endpoints (~250 lines)

**Files to modify:**
- `shared/schema.ts` — add 4 new tables + enums
- `shared/types/index.ts` — re-export domain-knowledge types
- `shared/types/collection-analytics.ts` — add optional `domainRecommendations` field
- `server/barbara-orchestrator.ts` — add `domainContext?: string` param to `generateCrossInterviewAnalysis` signature only (2-3 lines changed)
- `server/routes/analytics.routes.ts` — load domain context when refreshing collection analytics
- `server/routes/index.ts` — register domain routes

**Verification:**
- Unit tests for terminology mapping, dimension scoring rules, recommendation generation
- Create a test domain pack manually (JSON fixture), run collection analytics, verify `domainRecommendations` appear with correct provenance
- Verify existing non-domain projects produce identical output (regression)

### Phase 2: Low-Risk Pilot Domain

Build and validate with **Customer Experience (SaaS/Technology)** or **SaaS Product Research** — domains where:
- Recommendations are lower-stakes (no clinical/regulatory risk)
- Frameworks are well-established (AARRR, NPS, CSAT, SUS)
- We have good intuition for what "right" looks like
- Users can validate quickly

**Scope:**
- Seed data: One fully-worked pilot domain with all 5 layers
- Validation framework: Recommendation precision testing
- Cost/latency measurement: Track token overhead from domain context injection

**Pilot domain content (SaaS Product Research):**
- **Dimensions**: User Onboarding, Feature Adoption, Pain Points & Friction, Value Perception, Competitive Context, Retention Signals
- **Terminology**: SaaS vocabulary (churn, activation, MRR, NPS, etc.)
- **Rubrics**: Depth expectations per dimension, significance criteria (churn signals = high)
- **Frameworks**: AARRR Pirate Metrics, NPS/CSAT, SUS (System Usability Scale), Jobs to Be Done
- **Probing strategies**: "When user says 'it's fine' about onboarding, probe for specific first-use moments"

**Validation criteria:**
- Recommendation precision: domain recs are rated more actionable than generic recs by reviewers
- Provenance accuracy: every recommendation traces to real segments with correct signal phrases
- Latency: collection analytics with domain context completes within acceptable bounds
- Cost: token overhead per analytics run is within budget

**Files to create:**
- `server/domain/seed-data/saas-product-research.ts` — pilot domain definition (~400 lines)

### Phase 3: Expand Surfaces

Extend domain intelligence from collection analytics to other pipeline stages.

**3a — Template & Project Analytics:**
- Add `domainContext` to `generateTemplateAnalytics()` and `generateProjectAnalytics()`
- Template analytics: cross-collection dimension consistency scoring
- Project analytics: framework alignment analysis, cross-dimension synthesis
- Prompt compiler: add template_analytics and project_analytics stages

**3b — Hypothesis Feedback into Live Interviews:**
- `DomainRecommendation.probingGuidance` feeds into the existing `analyticsGuidedHypotheses` pipeline
- Domain probing strategies compiled for the `live_analysis` stage
- Barbara real-time analysis receives dimension signal phrases and probing context
- Add `domainContext` to `analyzeWithBarbara()` and `buildInterviewInstructions()`

**3c — Template Generation & Additional Questions:**
- Domain dimensions inform question design in `generateTemplateFromProject()`
- Additional questions target dimension gaps identified during interview
- Add `domainContext` to `generateAdditionalQuestions()`

**Critical severity gating:** In the live interview surface, `critical` priority recommendations are gated:
```
Show critical in UI only if:
  confidence >= 0.8 AND sessionCount >= 2 AND segmentIds.length >= 3
```

### Phase 4: Domain Authoring

Build the user-facing domain management system.

**4a — Domain Editor UI:**
- Settings-level page with tabbed editing for each layer
- Dimensions tab: CRUD list with depth rubric editors
- Terminology tab: glossary, synonyms, sensitive terms, acronyms
- Rubrics tab: linked to dimensions, significance criteria
- Frameworks tab: components with dimension mapping
- Probing tab: trigger patterns and probe templates

**4b — Versioning Workflow:**
- Draft → Published lifecycle for domain packs
- Publishing creates an immutable `DomainPackVersion` snapshot
- Projects pin to a published version; updates require explicit re-pin
- Changelog tracking per version

**4c — Fork-on-Edit:**
- Platform template domains are read-only
- "Customize" forks a deep copy into workspace
- Fork tracks `parentDomainId` for potential future sync

**4d — AI-Assisted Authoring (after deterministic pipeline is stable):**
- New Barbara use case: `domainGeneration`
- Seed description → all 5 layers generated in one pass
- Validated with Zod, stored as draft (requires manual review before publishing)
- AI can suggest additions to existing domains ("suggest new probing strategies for this dimension")

### Phase 5: Healthcare Rollout (Controlled)

Healthcare is high-value but high-risk. Controlled rollout after the engine is proven.

**5a — Non-Clinical Subdomains First:**
- Patient Experience, Access & Equity, Care Coordination, Cost & Value
- These map to operational/experience improvement, not clinical decision-making
- Frameworks: CAHPS, Patient Journey Map, IHI Triple Aim

**5b — Governance Gates:**
- All `critical` recommendations require:
  - confidence >= 0.85 (higher threshold than other domains)
  - sessionCount >= 3
  - Framework source metadata (which standard/benchmark supports this)
  - Explicit `benchmarkSource` field with citation
- `risk_escalation` recommendations in Healthcare carry a disclaimer: "This recommendation is based on interview data patterns, not clinical evidence"

**5c — Clinical Subdomains (later):**
- Clinical Research, Clinical Outcomes, Safety & Trust
- Additional governance: domain expert review of rubric content before publishing
- Benchmark data must cite peer-reviewed sources
- Critical recommendations require approval workflow before surfacing to users

---

## Module Structure

```
server/domain/
  index.ts                        # Re-exports
  loader.ts                       # Load + merge domain context for project
  prompt-compiler.ts              # Stage-based compilation with token budgets
  recommendation-engine.ts        # Deterministic scoring pipeline
  seed-data/
    saas-product-research.ts      # Phase 2 pilot domain
    customer-experience.ts        # Future
    healthcare.ts                 # Phase 5

server/storage/
  domain-storage.ts               # Domain CRUD + versioning

server/routes/
  domains.routes.ts               # Domain API endpoints

shared/types/
  domain-knowledge.ts             # 5 layer types + DomainRecommendation + provenance

client/src/ (Phase 4)
  pages/domain-editor.tsx         # Domain management
  components/domain/              # Editor sub-components
  components/analytics/
    DomainRecommendationsPanel.tsx # Domain-grounded rec display
    DimensionRadar.tsx            # Dimension coverage chart
```

---

## API Endpoints

### Phase 1 (Minimal)
```
GET    /api/domains                            # List workspace + template domains
GET    /api/domains/:id                        # Domain with sub-domains
GET    /api/domains/:id/layers                 # All layers
POST   /api/domains                            # Create domain (internal/seed)
PUT    /api/domains/:id/layers/:layerType      # Upsert layer
POST   /api/domains/:id/publish                # Publish version snapshot
GET    /api/projects/:projectId/domain         # Project's domain association
PUT    /api/projects/:projectId/domain         # Set association
```

### Phase 4 (Full CRUD)
```
PATCH  /api/domains/:id                        # Update metadata
DELETE /api/domains/:id                        # Delete (workspace only)
POST   /api/domains/:id/fork                   # Fork template into workspace
POST   /api/domains/generate                   # AI-generate from seed
GET    /api/domains/:id/versions               # Version history
GET    /api/domains/:id/versions/:version      # Specific version snapshot
```

---

## Verification (End-to-End)

1. **Phase 1**: Create test domain (JSON fixture) → assign to project → refresh collection analytics → verify `domainRecommendations` array with correct types, provenance, confidence scores
2. **Phase 2**: Pilot domain seed → real interview data → compare generic vs domain recommendations → validate precision with reviewer ratings
3. **Phase 3**: Verify domain recommendations flow through template/project analytics; verify probing guidance appears in live interview hypotheses
4. **Phase 4**: Domain editor CRUD → edit dimension → publish new version → verify analytics uses new version
5. **Phase 5**: Healthcare domain with governance gates → verify critical recs only surface when confidence + evidence thresholds met
6. **Regression**: All phases — non-domain projects produce identical output to pre-domain baseline
