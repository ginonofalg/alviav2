# Proposal: Feed Question Quality Insights into Barbara's Real-Time Guidance (Revised)

Date: 2026-02-08
Owner: Voice Interview + Barbara orchestration
Status: Draft (implementation-ready)

## Executive Summary
Barbara already receives theme-level cross-interview context during live interviews, but she does not receive question-level quality patterns from prior sessions. This proposal adds compact, actionable quality insights per question so Barbara can guide Alvia to probe, reframe, or warm tone when a question historically underperforms.

This revision keeps the original intent, but fixes implementation risks in the prior draft:
- Aligns with the actual analytics schema (`avgQualityScore`, `responseRichness`, `avgWordCount`, `qualityFlagCounts`, `responseCount`, `perspectiveRange`).
- Fixes gating so quality-only context can still flow (today runtime context requires themes to exist).
- Adds low-signal safeguards to prevent noisy/false alerts.
- Handles additional-question indexes and missing legacy analytics safely.

No DB schema changes are required.

## Review and Critique of the Prior Proposal

### High-severity issues
1. Data contract mismatch with real analytics shape
- The proposal references fields like `avgQuality`, `richness`, `avgWords`, and `topFlags` directly from `analyticsData.questionPerformance`.
- Current schema uses `avgQualityScore`, `responseRichness`, `avgWordCount`, `qualityFlagCounts`, `responseCount`, and `perspectiveRange` in `EnhancedQuestionPerformance` (`shared/schema.ts:716`).
- If implemented literally, this would either fail type-checking or silently read undefined values.

2. Gating would block quality-only context
- `buildCrossInterviewRuntimeContext` currently returns disabled unless `analyticsData.themes` exists and is non-empty (`server/voice-interview.ts:95`).
- That means question quality insights would never be available if themes are absent/stale, even when `questionPerformance` exists.

### Medium-severity issues
3. No low-signal guardrails
- Without `responseCount` minimum checks, small samples can trigger overconfident alerts.
- Questions with `avgQualityScore = 0` due to missing historical quality scoring can be misclassified as low quality.

4. Flag severity is flattened too early
- Storing only `topFlags: string[]` drops counts and weakens prioritization.
- Barbara benefits from seeing recurrence (e.g., `off_topic×4` vs `off_topic×2`).

5. Additional-questions index edge case unaddressed
- During additional questions, `currentQuestionIndex` can exceed template question count (`server/voice-interview.ts:3749`).
- Quality maps are template-question indexed; current/upcoming lookups need bounds-safe handling.

### Low-severity issues
6. Verification plan is too narrow
- Should include malformed/legacy analytics payload tests, no-issue token-overhead check, and gating behavior for quality-only snapshots.

## Goals
1. Inject actionable question-quality history into Barbara analysis context.
2. Keep prompt impact small by including only issues (not full question metrics).
3. Preserve existing safeguards against cross-interview bias.
4. Reuse existing project-level gates (`crossInterviewContext`, threshold).

## Non-Goals
1. No schema migrations.
2. No UI changes.
3. No changes to collection analytics generation logic.
4. No changes to AQ cross-interview context flow (separate type path).

## Current State (Relevant Code)
- Runtime cross-interview context assembly: `server/voice-interview.ts:77`
- Current runtime context includes only question themes + emergent themes: `server/voice-interview.ts:63`
- Barbara input cross-interview type (themes only): `server/barbara-orchestrator.ts:225`
- Cross-interview snapshot prompt block: `server/barbara-orchestrator.ts:349`
- Barbara prompt assembly: `server/barbara-orchestrator.ts:384`
- Context injection into Barbara input: `server/voice-interview.ts:2609`

## Revised Design

### 1. Add compact quality insight type in runtime context
File: `server/voice-interview.ts`

Add types:

```ts
type CompactFlagCount = {
  flag: QualityFlag;
  count: number;
};

type CompactQuestionQualityInsight = {
  questionIndex: number;
  responseCount: number;
  avgQualityScore: number; // 0-100
  responseRichness: "brief" | "moderate" | "detailed";
  avgWordCount: number;
  topFlags: CompactFlagCount[]; // recurring only
  perspectiveRange?: "narrow";
};
```

Extend runtime context:

```ts
qualityInsightsByQuestion?: Record<number, CompactQuestionQualityInsight>;
```

Rationale:
- Uses existing schema terminology to avoid drift.
- Keeps counts for recurring flags while still compact.

### 2. Update runtime context extraction to support quality-only snapshots
File: `server/voice-interview.ts` in `buildCrossInterviewRuntimeContext(...)`

Add constants:

```ts
const QUALITY_ALERT_THRESHOLD = 65;
const MIN_RESPONSE_COUNT_FOR_ALERT = 2;
const MIN_FLAG_COUNT_FOR_ALERT = 2;
const MAX_TOP_FLAGS_PER_QUESTION = 2;
```

Replace strict themes-only gate with dual-source gate:
- `hasThemes = Array.isArray(analyticsData?.themes) && analyticsData.themes.length > 0`
- `hasQuestionPerformance = Array.isArray(analyticsData?.questionPerformance) && analyticsData.questionPerformance.length > 0`
- Disable only when both are missing.

Build `qualityInsightsByQuestion` from `questionPerformance`:
- Ignore records with invalid `questionIndex`.
- Require `responseCount >= MIN_RESPONSE_COUNT_FOR_ALERT`.
- Issue predicates:
  - `avgQualityScore > 0 && avgQualityScore < QUALITY_ALERT_THRESHOLD`
  - `responseRichness === "brief"`
  - at least one `qualityFlagCounts[flag] >= MIN_FLAG_COUNT_FOR_ALERT`
  - `perspectiveRange === "narrow"`
- Include entry only if at least one predicate is true.
- Compute `topFlags` from `qualityFlagCounts`, sorted by count desc then flag asc, cap at 2.

Return `enabled: true` when at least one of these is present:
- actionable themes (`themesByQuestion`/`emergentThemes`)
- `qualityInsightsByQuestion` has entries

Otherwise disable with a specific reason like `no_actionable_cross_interview_context`.

### 3. Extend Barbara analysis input contract
File: `server/barbara-orchestrator.ts`

Define compact quality alert type in this file (or colocated above `BarbaraAnalysisInput`):

```ts
type CompactQuestionQualityAlert = {
  questionIndex: number;
  responseCount: number;
  avgQualityScore: number;
  responseRichness: "brief" | "moderate" | "detailed";
  avgWordCount: number;
  topFlags: Array<{ flag: QualityFlag; count: number }>;
  perspectiveRange?: "narrow";
};
```

Extend `BarbaraAnalysisInput.crossInterviewContext`:

```ts
currentQuestionQuality?: CompactQuestionQualityAlert;
upcomingQualityAlerts?: CompactQuestionQualityAlert[];
```

Notes:
- Keep `questionThemes` and `emergentThemes` unchanged for backward compatibility.
- New fields are optional; zero overhead when absent.

### 4. Add quality prompt block builder
File: `server/barbara-orchestrator.ts`

Add function near `buildCrossInterviewSnapshotBlock(...)`:
- `buildQuestionQualityInsightsBlock(input: BarbaraAnalysisInput): string`
- Return `""` when both current and upcoming are absent.

Suggested output format:

```text
QUESTION QUALITY INSIGHTS (prior interviews, same collection):
CURRENT Q3 (n=9): quality 42/100; richness brief (22 words); flags incomplete×5, low_engagement×3; perspective narrow.
Recommended handling: probe for specifics, rephrase if needed, and allow pause for elaboration.
UPCOMING ALERTS:
- Q5 (n=9): quality 58/100; flags off_topic×4.
Note: Historical patterns only. Prioritize this respondent's live signals.
```

Formatting rules:
- Only emit sections that exist.
- Max 3 upcoming alerts.
- Keep line length concise to control token load.

### 5. Insert quality block into Barbara user prompt
File: `server/barbara-orchestrator.ts:440+`

In `buildBarbaraUserPrompt(...)`, append:
- existing `buildCrossInterviewSnapshotBlock(input)`
- then `buildQuestionQualityInsightsBlock(input)`

This preserves existing ordering and behavior while adding optional context.

### 6. Update Barbara system prompt instructions
File: `server/barbara-orchestrator.ts:302+`

Add new responsibility after item #5:

`6. QUESTION QUALITY AWARENESS: If historical quality insights are present, use them to anticipate where probing, rephrasing, or warmer phrasing may help. Treat them as statistical priors, not assumptions about this respondent.`

Expand CROSS-INTERVIEW AWARENESS:
- Historical quality issues may not apply to this respondent.
- Use live transcript evidence to override historical priors.
- Do not force interventions solely because an alert exists.

### 7. Inject quality insights in `triggerBarbaraAnalysis(...)`
File: `server/voice-interview.ts:2609+`

Current logic injects only themes. Extend it to inject quality context:
- `const currentQuestionQuality = ctx.qualityInsightsByQuestion?.[state.currentQuestionIndex]`
- `upcomingQualityAlerts`: next N template-question indexes with alerts (`N=3`), sorted by index.
- Create `barbaraInput.crossInterviewContext` if either themes or quality exists.

Edge handling:
- If `state.currentQuestionIndex >= state.questions.length` (additional questions), current quality is absent by design.
- Upcoming scan should stop at `state.questions.length - 1`.

Add log line:

```text
[CrossInterview] Injecting quality insights for Q{n}: current={0|1}, upcoming={k}
```

## Token Budget Impact
- System prompt: +40 to +70 tokens fixed.
- User prompt quality block:
  - 0 tokens when no alerts.
  - Typical: 60-110 tokens (current + 1-2 upcoming).
  - Worst case (current + 3 upcoming): ~160-220 tokens.

This remains within current Barbara budget envelopes.

## Backward Compatibility
- No DB migrations.
- Graceful handling when `analyticsData.questionPerformance` is missing/legacy.
- Existing theme context behavior remains intact.
- New input fields are optional and do not affect existing callers.

## Verification Plan

### Automated
1. Run `npm run check`.
2. Add/adjust targeted tests if test harness exists for:
- `buildCrossInterviewRuntimeContext` with themes-only, quality-only, both, and neither.
- quality extraction filters (`responseCount`, `avgQualityScore`, flag count thresholds).
- prompt block emission when current/upcoming empty.

### Manual
1. Use a collection with `project.crossInterviewContext=true` and threshold met.
2. Validate session init logs show enabled context for:
- themes-only analytics
- quality-only analytics
3. During interview, validate injection logs include quality counts.
4. Enable `DEBUG_BARBARA_PROMPTS=true` and confirm:
- quality block appears only when issues exist
- block omitted for clean questions
5. Validate additional-question stage does not crash or inject invalid quality lookups.

## Rollout Plan
1. Implement behind existing gate only (no new config).
2. Monitor logs for one week:
- percentage of Barbara calls with quality context
- average prompt token delta
- error rate changes in Barbara analysis
3. If needed, tune constants:
- `QUALITY_ALERT_THRESHOLD`
- `MIN_RESPONSE_COUNT_FOR_ALERT`
- `MIN_FLAG_COUNT_FOR_ALERT`

## Acceptance Criteria
1. Type-check passes with strict mode.
2. Barbara receives quality alerts when historical issues exist.
3. No quality block is emitted when no actionable issues exist.
4. Quality-only collections can still provide cross-interview context.
5. No regressions in AQ flow or core Barbara guidance path.

## Implementation Checklist
- [ ] Add compact quality types and runtime context field in `server/voice-interview.ts`
- [ ] Refactor `buildCrossInterviewRuntimeContext(...)` to support dual-source gating and quality extraction
- [ ] Extend `BarbaraAnalysisInput` in `server/barbara-orchestrator.ts`
- [ ] Add `buildQuestionQualityInsightsBlock(...)`
- [ ] Append quality block in `buildBarbaraUserPrompt(...)`
- [ ] Update Barbara system prompt guidance and cross-interview cautions
- [ ] Inject current/upcoming quality alerts in `triggerBarbaraAnalysis(...)`
- [ ] Add logs for quality injection
- [ ] Run `npm run check`

## THIS WAS CLAUDE'S ORIGINAL PROPOSAL FOR REFERENCE:

PROPOSAL: Plan: Feed Question Quality Insights into Barbara's Real-Time Guidance

 Context

 Barbara (the orchestrator) already receives theme-level cross-interview context from collection analytics to guide Alvia during interviews. However, she has no
 visibility into per-question quality patterns — e.g., "Q3 historically gets brief/incomplete answers" or "Q5 tends to produce off-topic responses."

 This feature closes that feedback loop: question-level quality performance data from prior interviews is injected into Barbara's prompt so she can proactively
 guide Alvia to probe deeper on historically weak questions, rephrase confusing ones, or warm up engagement on disengaging questions.

 Approach

 Extend the existing cross-interview context pipeline (already gated by project.crossInterviewContext + threshold) to also carry per-question quality insights
from
 collection.analyticsData.questionPerformance. Only questions with actionable issues are included (low quality, brief responses, recurring flags, narrow
 perspectives).

 Files to Modify

 1. server/voice-interview.ts — Types, extraction, and injection
 2. server/barbara-orchestrator.ts — Input type, prompt construction, system prompt

 No schema changes needed — all data already exists in CollectionAnalytics.questionPerformance.

 ---
 Step 1: Add types and extend CrossInterviewRuntimeContext (voice-interview.ts)

 Near line 57, add a new compact type:
 type CompactQuestionQualityInsight = {
   questionIndex: number;
   avgQuality: number;          // 0-100
   richness: "brief" | "moderate" | "detailed";
   avgWords: number;
   topFlags: string[];          // Only flags with count >= 2
   perspectiveRange?: "narrow"; // Only included if narrow
 };

 Extend CrossInterviewRuntimeContext (line 63) with:
 qualityInsightsByQuestion?: Record<number, CompactQuestionQualityInsight>;

 Step 2: Extract quality data in buildCrossInterviewRuntimeContext() (voice-interview.ts:77-147)

 Add constants near line 73:
 const QUALITY_ALERT_THRESHOLD = 65;
 const MIN_FLAG_COUNT_FOR_ALERT = 2;
 const MAX_TOP_FLAGS = 2;

 After the emergentThemes extraction (line 133), extract questionPerformance from analyticsData and build qualityInsightsByQuestion. Only include questions where
at
  least one issue is present (quality < 65, richness "brief", flags with count >= 2, or perspectiveRange "narrow").

 Return qualityInsightsByQuestion in the context object.

 Step 3: Extend BarbaraAnalysisInput (barbara-orchestrator.ts:210-231)

 Add two fields to the crossInterviewContext optional object:
 currentQuestionQuality?: { questionIndex: number; avgQuality: number; richness: string; avgWords: number; topFlags: string[]; perspectiveRange?: "narrow" };

 Step 4: Add buildQuestionQualityInsightsBlock() (barbara-orchestrator.ts, near line 380)

 New function that formats quality insights into a text block for Barbara's user prompt. Format:
 Returns empty string when no issues exist (zero token overhead for clean questions).

 Step 5: Insert quality block into buildBarbaraUserPrompt() (barbara-orchestrator.ts:463)

    - For questions with brief/incomplete history, proactively suggest follow-up probes or rephrasing
    - For questions with off_topic/ambiguous flags, suggest clearer framing
    - For questions with low_engagement, suggest a warmer/more conversational approach
 ---
 Token Impact

 - System prompt: +~60 tokens (fixed, one-time)
 - User prompt quality block: 0 tokens (no issues) to ~150 tokens (worst case: current question + 3 upcoming alerts)
 - Typical: ~80-100 tokens when current question has issues

 This is well within budget — Barbara's input is ~1000 tokens currently.
 Gating

 Reuses existing gates — no new config needed:
 - project.crossInterviewContext === true
 - collection.analyzedSessionCount >= project.crossInterviewThreshold (default 5)
 - analyticsData.questionPerformance exists

 Verification

 1. Run npm run check to verify TypeScript compilation
 3. Check server logs for [CrossInterview] Injecting quality insights messages during interview
 4. Verify that questions without issues produce no quality block output