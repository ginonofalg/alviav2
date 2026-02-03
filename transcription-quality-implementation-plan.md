# Transcription Quality Mitigation Implementation Plan

## Overview

This plan addresses transcription quality issues observed when interviewees are in noisy environments. The GPT-4o transcription produces fragmented, garbled, and multi-language hallucinations that degrade interview quality.

## Problem Summary

| Issue Type | Example | Signal Strength |
|------------|---------|-----------------|
| Multi-language hallucinations | "conoce Madrid", "อันนี้" | **Strong** - Very reliable failure indicator |
| Ultra-short fragments | "That's the", "of the" | Medium - May be legitimate |
| Incoherent phrases | "thisis a changing minus" | Medium-Strong |
| Repeated question loops | Same question 5+ times | Strong |

---

## Implementation Priorities

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| **P0** | Language detection filter + quality flags | Low | High |
| **P1** | Barbara `suggest_environment_check` action | Medium | High |
| **P1** | Conditional confirmation checkpoints | Medium | Medium |
| **P2** | Pre-interview audio calibration | Medium | Medium |
| **P3** | Graceful degradation to text input | High | Medium |

---

## File Changes Summary

| File | Changes |
|------|---------|
| `shared/schema.ts` | New types for quality tracking |
| `server/transcription-quality.ts` | **New file** - Quality detection module |
| `server/voice-interview.ts` | Integrate quality detection, add calibration |
| `server/barbara-orchestrator.ts` | New action types, updated prompts |
| `server/realtime-providers.ts` | Add `language: "en"` to Grok |
| `client/src/pages/interview.tsx` | Quality warnings, calibration UI, text fallback |
| `client/src/pages/session-detail.tsx` | Quality metrics display |

---

## P0: Language Detection Filter + Quality Flags

### New Types (shared/schema.ts ~line 452)

```typescript
// Transcription quality tracking types
export type TranscriptionQualityFlag =
  | "garbled_audio"
  | "environment_noise"
  | "repeated_clarification"
  | "foreign_language_hallucination";

export type TranscriptionQualitySignals = {
  shortUtteranceStreak: number;
  foreignLanguageCount: number;
  questionRepeatCount: number;
  incoherentPhraseCount: number;
  totalRespondentUtterances: number;
  environmentCheckTriggered: boolean;
  environmentCheckTriggeredAt: number | null;
};

export type TranscriptionQualityMetrics = {
  signals: TranscriptionQualitySignals;
  qualityScore: number;  // 0-100
  flagsDetected: TranscriptionQualityFlag[];
  environmentCheckCount: number;
};
```

### New Module: server/transcription-quality.ts

```typescript
export function createEmptyQualitySignals(): TranscriptionQualitySignals;

/**
 * Detects non-English text - strong signal of transcription failure.
 * Checks for:
 * - Non-Latin scripts (Thai, Chinese, Arabic, Cyrillic, etc.)
 * - Common Spanish/French/German/Portuguese/Italian patterns
 */
export function detectNonEnglish(text: string): {
  detected: boolean;
  confidence: number;
  detectedPatterns: string[];
};

/**
 * Detects incoherent phrases using heuristics:
 * - Articles/prepositions alone
 * - Concatenated words ("thisis", "ofthe")
 * - Repeated characters
 * - Abrupt sentence endings
 */
export function detectIncoherentPhrase(text: string): {
  isIncoherent: boolean;
  confidence: number;
  reason: string;
};

/**
 * Updates signals and determines if environment check needed.
 * Trigger conditions:
 * - ANY foreign language detected (strong signal)
 * - 2+ weak signals: short streaks >= 3, question repeats >= 3, incoherent >= 2
 */
export function updateQualitySignals(
  signals: TranscriptionQualitySignals,
  transcriptText: string,
  wasQuestionRepeated: boolean,
): {
  signals: TranscriptionQualitySignals;
  shouldTriggerEnvironmentCheck: boolean;
  detectedIssues: string[];
};

/**
 * Calculate quality score 0-100
 * Deductions:
 * - Foreign language: -30 each (max -60)
 * - Incoherent: -10 each (max -30)
 * - Question repeats: -15 base + -5 per additional
 * - Short streaks: -5 per occurrence above 2
 */
export function calculateQualityScore(signals: TranscriptionQualitySignals): number;
```

### Integration: voice-interview.ts

**Add to InterviewState interface (~line 46):**
```typescript
transcriptionQualitySignals: TranscriptionQualitySignals;
```

**Modify transcription handler (~line 1547):**
```typescript
case "conversation.item.input_audio_transcription.completed":
  // ... existing latency tracking ...

  if (event.transcript) {
    // NEW: Quality signal detection
    const wasQuestionRepeated = detectQuestionRepeat(state, correctQuestionIndex);
    const qualityResult = updateQualitySignals(
      state.transcriptionQualitySignals,
      event.transcript,
      wasQuestionRepeated,
    );
    state.transcriptionQualitySignals = qualityResult.signals;

    if (qualityResult.detectedIssues.length > 0) {
      console.log(`[TranscriptionQuality] Issues: ${qualityResult.detectedIssues}`);
    }

    // Trigger environment check if needed (once per session)
    if (qualityResult.shouldTriggerEnvironmentCheck &&
        !state.transcriptionQualitySignals.environmentCheckTriggered) {
      state.transcriptionQualitySignals.environmentCheckTriggered = true;
      injectEnvironmentCheckGuidance(state, sessionId);

      clientWs?.send(JSON.stringify({
        type: "transcription_quality_warning",
        issues: qualityResult.detectedIssues,
        qualityScore: calculateQualityScore(state.transcriptionQualitySignals),
      }));
    }

    // ... rest of existing code ...
  }
```

**Add helper functions:**
```typescript
function injectEnvironmentCheckGuidance(state: InterviewState, sessionId: string): void {
  const guidanceMessage = `IMPORTANT - AUDIO QUALITY ISSUE: You're having trouble hearing clearly.
  Politely ask: "I'm sorry, I'm having a little trouble hearing you clearly.
  Would you be able to move somewhere quieter, or speak closer to your device?"`;

  // Inject via session.update with updated instructions
  // Send barbara_guidance to client with action: "suggest_environment_check"
}

function detectQuestionRepeat(state: InterviewState, questionIndex: number): boolean {
  // Check if Alvia repeated similar content in recent utterances
  // Uses Jaccard similarity > 0.6 threshold
}
```

### Quick Fix: realtime-providers.ts (~line 154)

```typescript
// Grok provider - add language setting
input_audio_transcription: {
  model: "whisper-large-v3",
  language: "en",  // ADD THIS LINE
},
```

---

## P1: Barbara Environment Check Action

### Update BarbaraGuidance (barbara-orchestrator.ts ~line 173)

```typescript
export interface BarbaraGuidance {
  action:
    | "acknowledge_prior"
    | "probe_followup"
    | "suggest_next_question"
    | "time_reminder"
    | "suggest_environment_check"  // NEW
    | "confirm_understanding"       // NEW
    | "none";
  // ...
}
```

### Update System Prompt (~line 276)

Add to action meanings:
```
- "suggest_environment_check": Audio quality is poor - ask respondent to move to quieter location
- "confirm_understanding": Quality signals present - confirm what you heard before moving on
```

### New Function: generateConfirmationCheckpoint

```typescript
export function generateConfirmationCheckpoint(
  questionSummary: string,
  keyPoints: string[],
  qualityScore: number,
): BarbaraGuidance {
  if (qualityScore > 70) return { action: "none", ... };

  return {
    action: "confirm_understanding",
    message: `Before moving on, briefly confirm: "${keyPoints.slice(0,3).join("; ")}" - ask if correct.`,
    confidence: Math.min(0.9, (100 - qualityScore) / 100 + 0.4),
    reasoning: `Quality score ${qualityScore}/100 - confirming to catch errors`,
  };
}
```

### Handle in voice-interview.ts (~line 1764)

```typescript
if (guidance.action === "suggest_environment_check") {
  guidanceMessage = `AUDIO QUALITY CONCERN: ${guidance.message}`;
} else if (guidance.action === "confirm_understanding") {
  guidanceMessage = `VERIFICATION CHECKPOINT: ${guidance.message}`;
}
```

---

## P2: Pre-Interview Audio Calibration

### New State Fields (voice-interview.ts)

```typescript
// In InterviewState
calibrationPhase: "pending" | "in_progress" | "completed" | "skipped";
calibrationAttempts: number;
```

### New Message Types

```typescript
// Client → Server
{ type: "audio_calibration_start" }

// Server → Client
{ type: "audio_calibration_result", success: boolean, qualityScore: number, warning?: string }
{ type: "audio_calibration_retry", attempt: number, hint: string }
```

### Server Handler

```typescript
case "audio_calibration_start":
  state.calibrationPhase = "in_progress";
  // Alvia asks: "Could you please say 'testing one two three'?"
  break;

// In transcription handler, if calibrationPhase === "in_progress":
const result = validateCalibrationPhrase(transcript);
if (result.success) {
  state.calibrationPhase = "completed";
  // Proceed to interview
} else if (state.calibrationAttempts >= 3) {
  // Warn but continue
} else {
  // Retry
}

function validateCalibrationPhrase(transcript: string): { success: boolean; score: number } {
  // Check for foreign language first
  // Then check for expected words: testing, one, two, three
  // Success = 3+ of 4 words matched
}
```

### Client UI (interview.tsx)

```tsx
{calibrationState === "pending" && (
  <Card className="border-amber-200 bg-amber-50">
    <p>Let's do a quick audio check before we begin.</p>
    <Button onClick={() => startCalibration()}>Start Audio Check</Button>
  </Card>
)}

{calibrationWarning && (
  <Alert variant="warning">{calibrationWarning}</Alert>
)}
```

---

## P3: Graceful Degradation to Text

### Schema Addition (shared/schema.ts)

```typescript
// Add to interviewSessions table
inputMode: text("input_mode").default("voice"), // "voice" | "text" | "hybrid"
```

### Client Text Input (interview.tsx)

```tsx
const [inputMode, setInputMode] = useState<"voice" | "text">("voice");

{qualityScore < 40 && inputMode === "voice" && (
  <Button onClick={() => setInputMode("text")}>
    <Keyboard /> Switch to typing
  </Button>
)}

{inputMode === "text" && (
  <div className="flex gap-2">
    <Textarea value={textInput} onChange={...} placeholder="Type your response..." />
    <Button onClick={handleTextSubmit}>Send</Button>
  </div>
)}
```

### Server Tracking (voice-interview.ts)

```typescript
case "text_input":
  if (state.inputMode !== "text") {
    state.inputMode = "hybrid";
    console.log(`Session ${sessionId} switched to hybrid input mode`);
  }
  // ... existing text_input handling ...
```

---

## Session Quality Display (session-detail.tsx)

```tsx
{session.performanceMetrics?.transcriptionQuality && (
  <Card>
    <CardHeader>
      <CardTitle><Mic /> Transcription Quality</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold">
        {qualityScore}<span className="text-muted-foreground">/100</span>
      </div>
      {flags.map(flag => (
        <Badge variant="outline" className="text-amber-600">{formatFlag(flag)}</Badge>
      ))}
      {environmentCheckCount > 0 && (
        <p className="text-sm">Environment check requested during interview</p>
      )}
    </CardContent>
  </Card>
)}
```

---

## Detection Algorithm Summary

```typescript
function shouldTriggerEnvironmentCheck(signals: TranscriptionQualitySignals): boolean {
  // Don't re-trigger within 15 utterances
  if (signals.environmentCheckTriggered && utterancesSinceCheck < 15) return false;

  // Strong signal: ANY foreign language (very reliable)
  if (signals.foreignLanguageCount >= 1) return true;

  // Weak signals need to combine (2+ required)
  let weakCount = 0;
  if (signals.shortUtteranceStreak >= 3) weakCount++;
  if (signals.questionRepeatCount >= 3) weakCount++;
  if (signals.incoherentPhraseCount >= 2) weakCount++;

  return weakCount >= 2;
}
```

---

## Language Detection Patterns

### Non-Latin Scripts (immediate trigger)
- Thai: `[\u0E00-\u0E7F]`
- Chinese: `[\u4E00-\u9FFF]`
- Arabic: `[\u0600-\u06FF]`
- Cyrillic: `[\u0400-\u04FF]`
- Japanese: `[\u3040-\u309F\u30A0-\u30FF]`
- Korean: `[\uAC00-\uD7AF]`

### Romance Language Patterns
- **Spanish**: es un, conoce, digo, esto, pero, muy, tengo, hace, está
- **French**: c'est, je suis, qu'est, très, avec, pour, dans
- **German**: ich bin, das ist, sehr, nicht, auch, oder
- **Portuguese**: é um, está, tenho, fazer, porque
- **Italian**: è un, sono, fare, perché, anche

---

## Verification Plan

### Unit Tests
1. `detectNonEnglish()` - Test with sample transcript data from the problem report
2. `detectIncoherentPhrase()` - Test edge cases (valid short responses vs garbage)
3. `updateQualitySignals()` - Test threshold triggering logic
4. `calculateQualityScore()` - Test scoring deductions

### Integration Tests
1. Mock a session with progressive quality degradation
2. Verify environment check triggers at correct thresholds
3. Verify environment check doesn't re-trigger too frequently

### Manual Testing
1. Run dev server: `npm run dev`
2. Start an interview session
3. Simulate noisy environment by:
   - Playing background noise during recording
   - Speaking very quietly/far from mic
4. Verify:
   - Quality warnings appear in client
   - Alvia asks to move to quieter location
   - Session detail shows quality metrics after completion

---

## Implementation Order

1. **Phase 1**: P0 core detection
   - Create `server/transcription-quality.ts`
   - Add types to `shared/schema.ts`
   - Integrate into `voice-interview.ts` transcription handler
   - Fix Grok provider language setting

2. **Phase 2**: P1 Barbara integration
   - Update `BarbaraGuidance` type
   - Add new action handling
   - Implement confirmation checkpoints

3. **Phase 3**: P2 calibration (optional)
   - Add calibration state management
   - Create calibration UI component

4. **Phase 4**: P3 text fallback (optional)
   - Add hybrid mode tracking
   - Create text input UI
