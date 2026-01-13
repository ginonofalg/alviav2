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
- Use same model (`gpt-4o-mini`)
- Use a **30-60 second timeout** (longer than real-time analysis since this runs in background)

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

### 4. Trigger Summarization on Question Transition (Background)

**File**: `server/voice-interview.ts`

**IMPORTANT**: Summarization must run in the **background** to avoid blocking the question transition. This provides zero perceived latency for users.

First, create a helper function to handle background summarization:

```typescript
async function generateAndPersistSummary(
  sessionId: string,
  questionIndex: number,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const question = state.questions[questionIndex];
  if (!question) return;

  try {
    const questionTranscript = state.fullTranscriptForPersistence.filter(
      e => e.questionIndex === questionIndex
    );
    const metrics = state.questionMetrics.get(questionIndex) || createEmptyMetrics(questionIndex);

    console.log(`[Summary] Generating summary for Q${questionIndex + 1} in background...`);

    const summary = await generateQuestionSummary(
      questionIndex,
      question.questionText,
      question.guidance || "",
      questionTranscript as TranscriptEntry[],
      metrics,
      state.template?.objective || "",
    );

    // Add to state
    state.questionSummaries.push(summary);
    console.log(`[Summary] Summary completed for Q${questionIndex + 1}`);

    // Persist immediately (don't debounce for summaries)
    await storage.persistInterviewState(sessionId, {
      questionSummaries: state.questionSummaries,
    });
  } catch (error) {
    console.error(`[Summary] Failed to generate summary for Q${questionIndex + 1}:`, error);
    // Fail silently - doesn't affect interview progress
  }
}
```

Then, modify the `case "next_question":` handler (line ~1033) to trigger background summarization:

```typescript
case "next_question":
  if (state.currentQuestionIndex < state.questions.length - 1) {
    const previousIndex = state.currentQuestionIndex;

    // Trigger summarization in background (don't await - non-blocking)
    generateAndPersistSummary(sessionId, previousIndex)
      .catch(error => {
        // Error already logged in generateAndPersistSummary
      });

    // Immediately move to next question (don't wait for summary)
    state.currentQuestionIndex++;
    const nextQuestion = state.questions[state.currentQuestionIndex];

    // ... rest of existing code (initialize metrics, update instructions, etc.)
  }
```

### 5. Update Real-Time Barbara Timeout

**File**: `server/voice-interview.ts`

Since Barbara now processes larger context (previous question summaries + current transcript), increase the timeout for real-time analysis:

```typescript
const BARBARA_TIMEOUT_MS = 10000; // Increased from 5000 to 10000 (10 seconds)
```

This applies to the timeout used in `triggerBarbaraAnalysis()` around line 726.

### 6. Update Barbara's Context

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

### 7. Persistence

**File**: `server/storage.ts`

Ensure `persistInterviewState()` handles the new `questionSummaries` field when saving to the database. It should work automatically if the schema is updated, but verify the field is included in the patch type.

**Note**: The `generateAndPersistSummary()` helper function persists summaries immediately (not debounced) to ensure they're saved as soon as generation completes.

## Implementation Order

1. ✅ Update schema in `shared/schema.ts` and run `npm run db:push`
2. ✅ Create `generateQuestionSummary()` function in `barbara-orchestrator.ts` with 30-60 second timeout
3. ✅ Update `BARBARA_TIMEOUT_MS` constant to 10000 (10 seconds) in `voice-interview.ts`
4. ✅ Update `InterviewState` interface and initialization in `voice-interview.ts`
5. ✅ Add restoration logic in `initializeInterview()`
6. ✅ Create `generateAndPersistSummary()` helper function in `voice-interview.ts`
7. ✅ Modify `next_question` handler to trigger background summarization (non-blocking)
8. ✅ Update `BarbaraAnalysisInput` and `buildBarbaraUserPrompt()` in `barbara-orchestrator.ts`
9. ✅ Update the `analyzeWithBarbara()` call to include summaries
10. ✅ Test with a multi-question interview

## Testing Checklist

- [ ] Summaries are generated in the background when clicking "Next Question"
- [ ] Question transitions happen immediately (zero blocking time)
- [ ] Summaries persist to database and restore on session resume
- [ ] Barbara receives previous summaries in her context (after they've completed)
- [ ] Long interviews (10+ questions) maintain context awareness
- [ ] Summarization failures don't block interview progress or cause errors
- [ ] Barbara works correctly when summaries are still generating (partial data)
- [ ] Database schema migration completes successfully
- [ ] Existing interviews without summaries continue to work
- [ ] Console logs show background summary generation progress

## Edge Cases to Handle

1. **First question**: No previous summaries to include - Barbara works with transcript only
2. **Restored sessions**: Summaries should be loaded from database and included in Barbara's context
3. **Summarization timeout/failure**: Log error but don't block question transition or throw errors
4. **Empty responses**: Handle questions where respondent said very little (generate minimal summary)
5. **Interview end**: Consider generating a final summary when interview completes
6. **Partial summary availability**: Barbara is called before a previous summary finishes generating
   - Barbara should gracefully work with however many summaries are available in `state.questionSummaries`
   - By question 3+, summaries for earlier questions should reliably be available
   - This is acceptable - recent transcript context is most important for real-time guidance
7. **Fast question progression**: User rapidly clicks "Next Question" before summaries complete
   - Multiple background summarizations can run in parallel (one per question)
   - Each operates on immutable historical transcript data (safe for concurrent execution)
   - State updates (pushing to `questionSummaries` array) happen asynchronously but sequentially

## Performance Considerations

- **Zero perceived latency**: Background summarization means question transitions are instant
- **Real-time Barbara analysis**: Increased timeout to 10 seconds (from 5) to handle larger context with summaries
- **Summarization timeout**: 30-60 seconds (generous since it runs in background)
- **Summary size**: Compact (~200 words each), scaling linearly not exponentially
- **Token efficiency**: For a 15-question interview, summaries total ~3,000 words vs tens of thousands for full transcripts
- **Concurrent summarization**: Multiple summaries can generate in parallel if user moves quickly through questions (safe because each operates on immutable historical data)
- **Database writes**: Summaries persist immediately after generation (not debounced), ensuring they're saved before potential crashes/disconnects

## Success Criteria

After implementation, Barbara should be able to reference context from any previous question in the interview, regardless of how many exchanges have occurred. Test by creating a 10-question interview where question 10 references topics from question 1.
