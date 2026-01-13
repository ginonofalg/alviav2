# Implementation Brief: Question Summarization for Barbara Context

## Problem Statement

Currently, Barbara (the interview orchestrator) only has access to the last 100 transcript entries stored in memory (`state.transcriptLog`). For long interviews with many back-and-forth exchanges, Barbara loses visibility into earlier conversation context. This prevents her from:
- Detecting if respondents already addressed topics in earlier questions
- Providing comprehensive "acknowledge_prior" guidance
- Maintaining awareness of the full interview narrative

## Proposed Solution

Implement a question-level summarization system where Barbara generates a structured summary at the end of each question. These summaries provide compact, contextual history that Barbara can consume alongside the detailed transcript of the current question.

## Technical Requirements

### 1. Data Schema Changes

**File**: `shared/schema.ts`

Add a new `questionSummaries` field to the interview sessions table:

```typescript
questionSummaries: jsonb("question_summaries").$type<QuestionSummary[]>().default([]),
```

**Type Definition** (add to `shared/schema.ts` or appropriate types file):

```typescript
export interface QuestionSummary {
  questionIndex: number;
  questionText: string;
  respondentSummary: string;           // 2-3 sentence summary of what respondent said
  keyInsights: string[];               // 3-5 bullet points of main points
  completenessAssessment: string;      // Brief note on answer quality/completeness
  relevantToFutureQuestions: string[]; // Topics that might connect to later questions
  wordCount: number;
  turnCount: number;
  activeTimeMs: number;
  timestamp: number;                   // When summary was created
}
```

### 2. New Function: `generateQuestionSummary()`

**File**: `server/barbara-orchestrator.ts`

Create a new function that calls Barbara with a specialized summarization prompt:

```typescript
export async function generateQuestionSummary(
  questionIndex: number,
  questionText: string,
  questionGuidance: string,
  transcript: TranscriptEntry[],
  metrics: QuestionMetrics,
  templateObjective: string,
): Promise<QuestionSummary>
```

**Implementation details**:
- Filter transcript to only entries for the specified `questionIndex`
- Use a specialized system prompt that instructs Barbara to create structured summaries
- Request JSON response with the `QuestionSummary` structure
- Use same model (`gpt-4o-mini`) and timeout pattern as existing `analyzeWithBarbara()`

**Prompt guidance**:
- Focus on what the respondent actually said, not what Alvia asked
- Extract key themes, insights, and memorable quotes
- Note any topics that might be relevant to future questions
- Assess completeness based on the question guidance
- Keep summaries concise (respondentSummary: 2-3 sentences, total: ~200 words)

### 3. State Management Updates

**File**: `server/voice-interview.ts`

**Add to `InterviewState` interface**:
```typescript
questionSummaries: QuestionSummary[];
```

**Initialize in state creation** (line ~200):
```typescript
questionSummaries: [],
```

**Restore from database** (in `initializeInterview()`, around line 305):
```typescript
if (session.questionSummaries && Array.isArray(session.questionSummaries)) {
  state.questionSummaries = session.questionSummaries as QuestionSummary[];
}
```

### 4. Trigger Summarization on Question Transition

**File**: `server/voice-interview.ts`

Modify the `case "next_question":` handler (line ~1033) to generate a summary before moving on:

```typescript
case "next_question":
  if (state.currentQuestionIndex < state.questions.length - 1) {
    const previousIndex = state.currentQuestionIndex;
    const previousQuestion = state.questions[previousIndex];

    // Generate summary for the question we're leaving
    try {
      const questionTranscript = state.fullTranscriptForPersistence.filter(
        e => e.questionIndex === previousIndex
      );
      const metrics = state.questionMetrics.get(previousIndex) || createEmptyMetrics(previousIndex);

      const summary = await generateQuestionSummary(
        previousIndex,
        previousQuestion.questionText,
        previousQuestion.guidance || "",
        questionTranscript as TranscriptEntry[],
        metrics,
        state.template?.objective || "",
      );

      state.questionSummaries.push(summary);
      console.log(`[Summary] Generated summary for Q${previousIndex + 1}`);
    } catch (error) {
      console.error(`[Summary] Failed to generate summary for Q${previousIndex + 1}:`, error);
      // Continue anyway - summarization failure shouldn't block progress
    }

    // Move to next question (existing logic)
    state.currentQuestionIndex++;
    // ... rest of existing code
  }
```

### 5. Update Barbara's Context

**File**: `server/barbara-orchestrator.ts`

**Update `BarbaraAnalysisInput` interface**:
```typescript
interface BarbaraAnalysisInput {
  transcriptLog: TranscriptEntry[];
  previousQuestionSummaries: QuestionSummary[]; // NEW
  currentQuestionIndex: number;
  // ... existing fields
}
```

**Update `buildBarbaraUserPrompt()`** (around line 105):

Add a new section before "FULL TRANSCRIPT SO FAR":

```typescript
const summariesText = input.previousQuestionSummaries
  .map(s => `Q${s.questionIndex + 1}: ${s.questionText}
  Response Summary: ${s.respondentSummary}
  Key Insights: ${s.keyInsights.join("; ")}
  Completeness: ${s.completenessAssessment}`)
  .join("\n\n");

// In the prompt template:
${summariesText ? `PREVIOUS QUESTIONS SUMMARY:\n${summariesText}\n\n` : ""}
```

**Update the call to `analyzeWithBarbara()`** in `voice-interview.ts` (line ~755):
```typescript
const analysisPromise = analyzeWithBarbara({
  transcriptLog: state.transcriptLog,
  previousQuestionSummaries: state.questionSummaries, // NEW
  currentQuestionIndex: state.currentQuestionIndex,
  // ... existing fields
});
```

### 6. Persistence

**File**: `server/storage.ts`

Ensure `persistInterviewState()` handles the new `questionSummaries` field when saving to the database. It should work automatically if the schema is updated, but verify the field is included in the patch type.

## Implementation Order

1. ✅ Update schema in `shared/schema.ts` and run `npm run db:push`
2. ✅ Create `generateQuestionSummary()` function in `barbara-orchestrator.ts`
3. ✅ Update `InterviewState` interface and initialization in `voice-interview.ts`
4. ✅ Add restoration logic in `initializeInterview()`
5. ✅ Modify `next_question` handler to trigger summarization
6. ✅ Update `BarbaraAnalysisInput` and `buildBarbaraUserPrompt()` in `barbara-orchestrator.ts`
7. ✅ Update the `analyzeWithBarbara()` call to include summaries
8. ✅ Test with a multi-question interview

## Testing Checklist

- [ ] Summaries are generated when clicking "Next Question"
- [ ] Summaries persist to database and restore on session resume
- [ ] Barbara receives previous summaries in her context
- [ ] Long interviews (10+ questions) maintain context awareness
- [ ] Summarization failures don't block interview progress
- [ ] Database schema migration completes successfully
- [ ] Existing interviews without summaries continue to work

## Edge Cases to Handle

1. **First question**: No previous summaries to include
2. **Restored sessions**: Summaries should be loaded from database
3. **Summarization timeout/failure**: Log error but don't block question transition
4. **Empty responses**: Handle questions where respondent said very little
5. **Interview end**: Consider generating a final summary when interview completes

## Performance Considerations

- Summarization adds ~1-2 seconds to question transitions (acceptable)
- Use same timeout pattern (5 seconds) as regular Barbara analysis
- Summaries are compact (~200 words each), scaling linearly not exponentially

## Success Criteria

After implementation, Barbara should be able to reference context from any previous question in the interview, regardless of how many exchanges have occurred. Test by creating a 10-question interview where question 10 references topics from question 1.
