# Proposal: Inject Completed Question Summaries into Alvia's Instructions

Date: 2026-03-06
Owner: Voice Interview (Alvia prompt construction)
Status: Draft (implementation-ready)

## Executive Summary

Alvia currently has no structured memory of completed questions. She relies entirely on (a) the OpenAI Realtime API's internal conversation history (which resets on every connection refresh or resume) and (b) up to 2 short continuity cues keyword-matched from `relevantToFutureQuestions`. This means that as interviews progress, Alvia's ability to recall and reference earlier answers degrades — especially after disconnections, but even within a single unbroken session due to context rot in long audio-heavy conversations.

This proposal adds a compact `COMPLETED QUESTIONS RECAP` block to Alvia's system instructions on every `session.update`, from question 2 onwards. This gives Alvia reliable, structured recall of what the respondent has already said, regardless of connection state.

No DB schema changes are required. No new LLM calls are needed.

## Problem

### Current state

| Path | What Alvia receives about prior questions | Structured summaries? |
|---|---|---|
| Normal flow (`buildInterviewInstructions`) | 0-2 continuity cue phrases, keyword-matched from `relevantToFutureQuestions` | No |
| Resume after disconnect (`buildResumeInstructions`) | Last 15 raw transcript entries + continuity cues + last Barbara guidance | No |
| Planned refresh (`buildRefreshInstructions`) | Last 15 raw transcript entries + continuity cues + last Barbara guidance | No |

Meanwhile, Barbara already receives full question summaries split into "EARLIER QUESTIONS" and "RECENT QUESTIONS" windows. She is well-served. Alvia is not.

### Why this matters

1. **Context rot in long sessions**: The realtime model accumulates audio conversation items (roughly 800 tokens/second of speech). In a 30-minute interview, by the time Alvia reaches Q8, the raw audio from Q1-Q3 is deep in the context window and hard to attend to. A structured text summary is far easier for the model to reference.

2. **Connection refresh/resume**: On refresh or resume, the provider WebSocket is closed and reopened. All conversation items are lost. The only bridge is the last 15 transcript entries (which may only cover the most recent 1-2 questions) and the thin continuity cues. Earlier questions are effectively forgotten.

3. **Preventing repetition**: Without structured recall, Alvia may re-ask topics the respondent already covered thoroughly in earlier questions. The continuity cues system helps but only catches cases where `relevantToFutureQuestions` keywords happen to overlap with the current question text — a narrow filter.

4. **Natural callbacks**: Alvia is instructed to make natural references to earlier answers ("As you mentioned earlier about X..."), but without structured summaries she can only do this reliably for the very recent conversation history.

## Design

### New function: `buildCompletedQuestionsRecap`

Add a new function in `server/voice-interview/instructions.ts` that takes `questionSummaries` and the current question index, and returns a compact text block.

```typescript
function buildCompletedQuestionsRecap(
  questionSummaries: QuestionSummary[],
  currentQuestionIndex: number,
): string | null {
  const completed = questionSummaries.filter(
    (s) => s != null && s.questionIndex < currentQuestionIndex && !s.isAdditionalQuestion
  );

  if (completed.length === 0) return null;

  const lines = completed.map((s) => {
    const insights = s.keyInsights.length > 0
      ? ` Key points: ${s.keyInsights.slice(0, 3).join("; ")}.`
      : "";
    return `Q${s.questionIndex + 1} ("${s.questionText}"): ${s.respondentSummary}${insights}`;
  });

  return `COMPLETED QUESTIONS RECAP (what the respondent has already told you):
${lines.join("\n")}`;
}
```

**Format example** (what Alvia would see in her instructions):

```
COMPLETED QUESTIONS RECAP (what the respondent has already told you):
Q1 ("How do you feel about remote work?"): They strongly prefer remote work, citing flexibility and reduced commute. Key points: values autonomy over in-office collaboration; has worked remotely for 3 years; mentions isolation as the main downside.
Q2 ("What challenges do you face daily?"): Main challenges are communication delays and difficulty separating work from personal time. Key points: uses async tools but finds them insufficient; feels pressure to be always available.
```

### Where to inject

The recap block should be added in **three** places — all paths where Alvia's instructions are built:

#### 1. `buildInterviewInstructions()` (normal flow)

Add the recap block after the `STEER FOR THIS QUESTION` section and before `CONVERSATION CONTINUITY`. This is called on:
- Initial session setup (line ~1065)
- Every Barbara guidance injection (line ~2377)
- Question transitions (line ~2839)
- VAD eagerness switches (line ~2101)
- Transcription quality events (line ~2011)

**Requires**: Pass `state.questionSummaries` as a new parameter.

#### 2. `buildResumeInstructions()` (resume after disconnect)

Add the recap block into `buildSharedContextBlock()` after the `TRANSCRIPT SUMMARY` section. This is called on reconnection after a client disconnect.

**Requires**: Add `questionSummaries` to the `ResumeContext` interface and populate it in `buildResumeContext()`.

#### 3. `buildRefreshInstructions()` (planned connection refresh)

Uses the same `buildSharedContextBlock()` as resume, so the same change covers both paths.

### Token budget

Each completed question adds roughly 40-80 tokens to the instructions. For a 10-question interview at Q10, that's ~400-800 additional tokens per `session.update`. Given that the instructions are already ~500-800 tokens and audio tokens dominate the context window (tens of thousands), this is a negligible cost increase for a significant quality improvement.

### Handling the summary generation race condition

Question summaries are generated asynchronously via `generateAndPersistSummary()` after the user clicks "Next Question". There is a brief window where the summary for the just-completed question is not yet available. This is fine:

- The recap simply omits any question whose summary hasn't been generated yet.
- On the next `session.update` (typically triggered by Barbara guidance within seconds), the newly available summary will be included.
- This is no worse than the current state where that information is absent entirely.

### Interaction with existing continuity cues

The `COMPLETED QUESTIONS RECAP` block and the `CONVERSATION CONTINUITY` / `RELEVANT EARLIER DISCUSSION` block serve different purposes and should both remain:

- **Recap**: Gives Alvia structured memory of what was discussed. Prevents re-asking, enables callbacks.
- **Continuity cues**: Highlights specific connections between earlier answers and the *current* question. Guides Alvia on when to bridge vs. let the respondent answer fresh.

Both blocks are cheap (text tokens) and complementary. No changes to the continuity cues system are needed.

## Implementation changes

### Files to modify

| File | Change |
|---|---|
| `server/voice-interview/instructions.ts` | Add `buildCompletedQuestionsRecap()` function. Add `questionSummaries` parameter to `buildInterviewInstructions()`. Inject recap block into the instructions string. Add `questionSummaries` to `ResumeContext` interface and `buildResumeContext()`. Inject recap into `buildSharedContextBlock()`. |
| `server/voice-interview.ts` | Pass `state.questionSummaries` to every call site of `buildInterviewInstructions()` (~6 call sites). No changes needed for resume/refresh paths since `buildResumeContext` already has access to `state.questionSummaries` via the `state` parameter. |

### Call sites in `voice-interview.ts` that need updating

All calls to `buildInterviewInstructions()` need the new `questionSummaries` parameter. These are approximately:

1. **Initial session setup** (~line 1065) — `state.questionSummaries` (will be empty for Q1, which is correct)
2. **Transcription quality guidance** (~line 2011)
3. **VAD eagerness switch** (~line 2101)
4. **Barbara guidance injection** (~line 2377)
5. **Question transition** (~line 2839)
6. **Any other `buildInterviewInstructions` call sites**

### Function signature change

```typescript
// Before
export function buildInterviewInstructions(
  template: any,
  currentQuestion: any,
  questionIndex: number,
  totalQuestions: number,
  barbaraGuidance?: string,
  respondentName?: string | null,
  allQuestions?: Array<{ questionText: string }>,
  followUpContext?: { followUpCount: number; recommendedFollowUps: number | null },
  strategicContext?: string | null,
  alviaHasSpokenOnCurrentQuestion?: boolean,
  eagernessMode?: VadEagernessMode,
  continuityContext?: string | null,
): string

// After — add questionSummaries parameter
export function buildInterviewInstructions(
  template: any,
  currentQuestion: any,
  questionIndex: number,
  totalQuestions: number,
  barbaraGuidance?: string,
  respondentName?: string | null,
  allQuestions?: Array<{ questionText: string }>,
  followUpContext?: { followUpCount: number; recommendedFollowUps: number | null },
  strategicContext?: string | null,
  alviaHasSpokenOnCurrentQuestion?: boolean,
  eagernessMode?: VadEagernessMode,
  continuityContext?: string | null,
  questionSummaries?: QuestionSummary[],
): string
```

Note: The parameter list is already long. Consider refactoring to an options object in a future PR, but for this change, appending is the least disruptive approach.

### Resume/refresh path changes

In `buildResumeContext()`:

```typescript
// Add to ResumeContext interface
interface ResumeContext {
  // ... existing fields ...
  questionSummaries: QuestionSummary[];
}

// In buildResumeContext(), add:
return {
  // ... existing fields ...
  questionSummaries: state.questionSummaries.filter((s) => s != null),
};
```

In `buildSharedContextBlock()`, after the `TRANSCRIPT SUMMARY` section:

```typescript
// Build and inject recap
const recap = buildCompletedQuestionsRecap(ctx.questionSummaries, ctx.questionIndex);
if (recap) {
  block += `\n\n${recap}`;
}
```

## Prompt placement

The recap block should appear in Alvia's instructions in this order:

```
INTERVIEW CONTEXT (objective, tone, question number)
RESPONDENT (name context)
COMPLETED QUESTIONS RECAP        <-- NEW
CURRENT QUESTION
STEER FOR THIS QUESTION
FOLLOW-UP DEPTH
RESERVED QUESTIONS
CONVERSATION CONTINUITY
RESPONSE TIMING (if high eagerness)
INSTRUCTIONS (numbered list)
STYLE POLICY
BARBARA'S GUIDANCE
ORCHESTRATOR MESSAGES
```

For resume/refresh paths, it appears after `TRANSCRIPT SUMMARY`:

```
INTERVIEW CONTEXT
RESPONDENT
TRANSCRIPT SUMMARY (recent conversation)
COMPLETED QUESTIONS RECAP        <-- NEW
CURRENT QUESTION
QUESTION STATUS
STEER FOR THIS QUESTION
...
```

## Testing

### Unit tests (add to `resume-refresh-continuity.test.ts` or new file)

1. **Recap not included on Q1**: When `questionSummaries` is empty or all summaries are for Q1+, no recap block appears.
2. **Recap included from Q2 onwards**: With a summary for Q1, the recap block appears in the instructions.
3. **Multiple summaries formatted correctly**: With summaries for Q1-Q4, all four appear in order.
4. **Missing summary handled gracefully**: If Q2 summary is null (race condition), Q1 and Q3 still appear.
5. **Additional question summaries excluded**: Summaries with `isAdditionalQuestion: true` are filtered out of the recap.
6. **Key insights truncated at 3**: Only the first 3 key insights are included per question.
7. **Resume path includes recap**: `buildResumeInstructions` output contains the recap block when summaries exist.
8. **Refresh path includes recap**: `buildRefreshInstructions` output contains the recap block when summaries exist.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Instructions become too long for realtime model context | Low — adds ~400-800 tokens for a full interview, vs tens of thousands of audio tokens | Monitor total instruction size. Could truncate older summaries to 1 line if needed. |
| Alvia over-references earlier answers | Medium — more context could lead to excessive "as you mentioned" callbacks | The existing CONVERSATION CONTINUITY instructions already say "Refer to earlier remarks only when it genuinely helps. Keep those references brief and varied." This guidance remains. |
| Summary race condition causes inconsistency | Low — summary appears on next session.update within seconds | Acceptable. No worse than current state. |
