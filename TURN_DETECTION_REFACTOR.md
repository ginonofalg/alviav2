# Turn Detection Refactor: Remove Response Latency

## Problem Statement

### Current Architecture
The voice interview system uses OpenAI's Realtime API with semantic Voice Activity Detection (VAD). Currently, turn detection is configured with `create_response: false` at `server/voice-interview.ts:541`. This means when the user stops speaking, the API does NOT automatically generate a response.

Instead, the flow is:
1. User stops speaking → VAD detects turn end
2. Speech is transcribed → `conversation.item.input_audio_transcription.completed` event fires
3. Code awaits Barbara's analysis (up to 10 second timeout)
4. Barbara injects guidance by updating session instructions
5. Code manually triggers `response.create`
6. Alvia finally responds

### The Problem
**Any latency in Barbara's analysis creates awkward silence.** The system is waiting for Barbara to finish before Alvia can speak. This makes the conversation feel stilted and unnatural, especially if:
- Barbara takes 2-5 seconds to analyze
- Network latency adds delay
- The OpenAI API has any processing lag

The 10-second timeout (`BARBARA_TIMEOUT_MS` at line 899) means conversations could have multi-second pauses after every user utterance.

### Why Current Approach Exists
The sequential approach ensures Barbara's guidance is included in Alvia's immediate response. For example, if Barbara detects "the respondent has fully answered," Alvia immediately offers to move to the next question.

However, this creates a user experience problem: **perceived latency is worse than slightly delayed guidance.**

## Proposed Solution

### Lag-by-One-Turn Architecture

**Set `create_response: true`** and allow Alvia to respond instantly when the user stops speaking. Barbara's guidance will be injected into session instructions asynchronously and apply to the **next** turn.

### New Flow
1. **Turn 1**: User speaks → Alvia responds immediately (no Barbara guidance yet) → Barbara analyzes in background
2. **Turn 2**: User speaks → Alvia responds with Barbara's guidance from Turn 1 baked into session instructions → Barbara analyzes Turn 2
3. **Turn 3**: User speaks → Alvia responds with Barbara's guidance from Turn 2 → Barbara analyzes Turn 3
4. And so on...

### Benefits
- ✅ **Zero perceived latency** - Alvia responds instantly when user stops speaking
- ✅ **Barbara has more time** - She can analyze during the full turn + Alvia's speaking time (typically 5-15 seconds total)
- ✅ **More reliable guidance injection** - Session instructions are cleaner than conversation items (which can confuse Alvia into thinking the orchestrator is the user)
- ✅ **Most guidance still works well one turn later** - "Probe deeper", "acknowledge previous context", etc. are still contextually relevant
- ✅ **Potentially better UX for question transitions** - Instead of immediately suggesting to move on, Alvia gives one more chance to elaborate

### Trade-offs
- ⚠️ **One-turn lag on guidance** - Barbara's "suggest_next_question" won't trigger an immediate offer to move on, but will on the following turn
- ⚠️ **First turn has no guidance** - The very first response in the interview won't have Barbara's input (though the initial session instructions are still comprehensive)

### Why This Is Better Than Conversation Items
The code currently uses conversation items for orchestrator messages in some places (e.g., `next_question` handler at lines 1325-1339):

```typescript
state.openaiWs.send(
  JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: `[ORCHESTRATOR: ${transitionInstruction}]`,
      }],
    },
  }),
);
```

However, **conversation items can confuse Alvia** - even with explicit instructions not to respond to them, she sometimes treats them as if the respondent said them. Session instruction updates are more reliable.

## Implementation Changes

### File: `server/voice-interview.ts`

#### 1. Change Turn Detection Configuration (Line 534)
**Current:**
```typescript
turn_detection: {
  type: "semantic_vad",
  eagerness: "low", 
  create_response: false,  // ← CHANGE THIS
  interrupt_response: true,
},
```

**New:**
```typescript
turn_detection: {
  type: "semantic_vad",
  eagerness: "low",
  create_response: true,  // ← CHANGED: Alvia responds immediately
  interrupt_response: true,
},
```

#### 2. Remove Manual Response Triggering After Audio Transcription (Lines 837-850)
**Current:**
```typescript
// Await Barbara analysis before triggering AI response
await triggerBarbaraAnalysis(sessionId, clientWs);

// Manually trigger AI response after Barbara has analyzed and injected guidance
if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
  state.openaiWs.send(
    JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
      },
    }),
  );
}
```

**New:**
```typescript
// Trigger Barbara analysis asynchronously (non-blocking)
// Her guidance will apply to the NEXT turn, not this one
triggerBarbaraAnalysis(sessionId, clientWs).catch((error) => {
  console.error(`[Barbara] Analysis failed for ${sessionId}:`, error);
});

// Response is now automatically created by OpenAI due to create_response: true
// No need to manually trigger response.create
```

#### 3. Remove Manual Response Triggering After Text Input (Lines 1104-1117)
**Current:**
```typescript
// Await Barbara analysis before triggering AI response
await triggerBarbaraAnalysis(sessionId, clientWs);

// Trigger AI response after Barbara has had a chance to inject guidance
if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
  state.openaiWs.send(
    JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
      },
    }),
  );
}
```

**New:**
```typescript
// Trigger Barbara analysis asynchronously (non-blocking)
// Her guidance will apply to the NEXT turn, not this one
triggerBarbaraAnalysis(sessionId, clientWs).catch((error) => {
  console.error(`[Barbara] Analysis failed for ${sessionId}:`, error);
});

// Response is now automatically created by OpenAI due to create_response: true
// No need to manually trigger response.create
```

#### 4. Update Comment (Line 1041)
**Current:**
```typescript
// With server_vad and create_response: false, the transcription handler triggers the response
```

**New:**
```typescript
// With server_vad and create_response: true, OpenAI automatically generates responses
// Barbara's guidance is injected asynchronously and applies to the next turn
```

#### 5. Consider Removing Response Trigger on Initial Session (Lines 740-755)
**Current behavior:** On `session.updated` event after initial setup, code manually triggers `response.create` to start the interview.

**New behavior:** With `create_response: true`, you may want Alvia to wait for user input rather than greeting immediately. If you want to keep the initial greeting, you can leave this as-is. If you want user to speak first, remove this block:

```typescript
// Only trigger response on initial session setup, not Barbara guidance updates
if (
  state.isInitialSession &&
  state.openaiWs &&
  state.openaiWs.readyState === WebSocket.OPEN
) {
  state.isInitialSession = false; // Mark initial setup complete
  state.openaiWs.send(
    JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
      },
    }),
  );
}
```

**Recommendation:** Keep this block to maintain the current behavior where Alvia greets the respondent first.

### Optional Enhancement: Reduce Barbara Timeout
Since Barbara's analysis is no longer blocking the conversation, you could reduce the timeout from 10 seconds to something shorter (e.g., 5 seconds) to catch failures faster:

**Line 899:**
```typescript
const BARBARA_TIMEOUT_MS = 5000; // Reduced from 10000
```

## Testing Checklist

After implementing these changes, test:

1. ✅ **Response latency** - Alvia should respond within ~1 second of user stopping speech (no long pauses)
2. ✅ **Barbara guidance application** - Verify guidance appears in subsequent turns by checking server logs for "Barbara guidance saved"
3. ✅ **Question transitions** - When Barbara suggests moving on, Alvia should offer to move forward on the following turn (not immediately)
4. ✅ **Text input mode** - Test keyboard input to ensure it also works with the new flow
5. ✅ **Interview resume after pause** - Ensure reconnection still works properly
6. ✅ **Initial greeting** - Verify Alvia still greets the respondent at interview start
7. ✅ **Barbara failures** - Simulate Barbara timeout/failure and ensure interview continues smoothly

## Expected Behavior Changes

### Before
- User speaks
- [2-5 second pause while Barbara analyzes]
- Alvia responds with Barbara's guidance

### After
- User speaks
- [~1 second - Alvia responds immediately]
- [Barbara analyzes in background during Alvia's response + next user turn]
- User speaks again
- [~1 second - Alvia responds with Barbara's previous guidance]

### Example Conversation Flow

**Turn 1:**
- User: "I think the main challenge is communication."
- Alvia: "Can you tell me more about that?" [generic response, no Barbara guidance yet]
- [Barbara analyzes Turn 1 in background]

**Turn 2:**
- User: "Well, teams don't share information effectively."
- Alvia: "That's interesting. Could you give me a specific example of when this happened?" [now includes Barbara's "probe deeper" guidance from Turn 1 analysis]
- [Barbara analyzes Turn 2 in background]

**Turn 3:**
- User: "Yes, last quarter we had a product launch where engineering didn't know about marketing's timeline..." [detailed answer]
- Alvia: "Thank you for that detailed example. Is there anything else you'd like to add, or shall we move to the next question?" [includes Barbara's "suggest_next_question" guidance from Turn 2 analysis]

## Additional Notes

- The `triggerBarbaraAnalysis` function already returns `Promise<BarbaraGuidance | null>`, so changing from `await` to fire-and-forget is straightforward
- Barbara's guidance updates session instructions via `session.update`, which persists across turns until updated again
- The `isBarbaraGuidanceUpdate` flag (lines 757) may no longer be necessary but won't cause issues if left in place
- All transcript logging, metrics tracking, and persistence remain unchanged
