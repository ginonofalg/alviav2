# Transcription Quality Analysis & Mitigation Strategies

## Problem Overview

When interviewees are in noisy environments, GPT-4o transcribe produces fragmented and garbled output that degrades interview quality. This document analyzes the issue and proposes mitigation strategies.

## Observed Transcript Issues

### 1. Multi-Language Hallucinations

When the model can't parse audio clearly, it hallucinates in random languages:

| Transcribed | Likely Actual |
|-------------|---------------|
| "conoce Madrid" (Spanish) | Unknown/noise |
| "อันนี้" (Thai) | Unknown/noise |
| "digo es un" (Spanish) | Unknown/noise |

**Significance**: This is a strong, reliable signal of transcription failure. Despite `language: "en"` being set in the realtime provider config, the model still outputs non-English when confidence is low.

### 2. Ultra-Short Fragments

Multiple consecutive utterances under 3 words:
- "That's the"
- "That's"
- "of the"
- "all"
- "Mina"
- "HR"

### 3. Incoherent Phrases

Garbled output that doesn't form coherent sentences:
- "Here helps."
- "thisis a changing minus."
- "This is the against the thank you."
- "So I'll be between you and me."

### 4. Repetitive Question Loops

Alvia asked for name/team/role 5+ times before getting a usable answer, indicating the system couldn't extract meaning from responses.

---

## Current Configuration

**OpenAI Provider** (`server/realtime-providers.ts:86-89`):
```typescript
input_audio_transcription: {
  model: "gpt-4o-mini-transcribe",
  language: "en",
}
```

**Grok/xAI Provider** (no language set):
```typescript
input_audio_transcription: {
  model: "whisper-large-v3",
}
```

**Recommendation**: Add `language: "en"` to the Grok provider configuration.

---

## Proposed Mitigations

### User's Original Proposals

#### 1. Detect Fragmented Speech → Prompt for Quieter Setting

**Strengths:**
- Addresses root cause (environment)
- Proactive intervention

**Weaknesses:**
- Risk of false positives with legitimately terse respondents
- By the time detection triggers, damage may be done
- Could feel patronizing if triggered too aggressively

**Recommended Triggers (require multiple signals, not just one):**
- 3+ consecutive utterances under 3 words
- Any non-English language detected in an English interview
- Same question asked 3+ times without progression

#### 2. Alvia Playback/Summary at Question Transitions

**Strengths:**
- Allows respondent to correct misunderstandings
- Already partially implemented (Alvia confirms "Ruth, HR, CPO")

**Weaknesses:**
- "As remembered" (verbatim) would expose garbled mess and confuse users
- "Paraphrased" is safer but relies on Barbara/Alvia correctly inferring meaning from garbage

**Recommendation**: Always use paraphrased summary, never verbatim playback when quality is poor.

---

### Additional Mitigations

#### 3. Real-Time Transcription Quality Detection (Barbara-level)

Add detection logic that watches for:

| Signal | Threshold | Meaning |
|--------|-----------|---------|
| Multi-language fragments | Any non-expected language detected | Audio hallucination - strong indicator |
| Ultra-short utterances | 3+ consecutive < 3 words | Possible transcription failure or VAD issues |
| Repeated question loops | Same question asked 3+ times | Respondent answers not being understood |
| Incoherent phrases | Low semantic coherence score | Garbled transcription |

**Implementation**: Add a new Barbara action `suggest_environment_check` that triggers Alvia to say:

> "I'm having a little trouble hearing you clearly. Would you be able to move somewhere quieter, or speak a bit closer to your microphone?"

#### 4. Language Detection Filter

**Simple heuristic**: If the interview language is English and non-ASCII characters or known non-English phrases are detected, flag as transcription quality issue.

This is a very reliable signal because `language: "en"` is already set - any non-English output indicates the model is uncertain.

#### 5. Pre-Interview Audio Check

Before starting the actual interview, run a brief calibration:

1. Alvia: "Before we begin, let's make sure I can hear you clearly. Could you say 'testing one two three'?"
2. Verify transcription returns something sensible
3. If it fails, warn the user about potential audio quality issues

#### 6. New Quality Flags

**Current flags**: `incomplete`, `ambiguous`, `contradiction`, `distress_cue`, `off_topic`, `low_engagement`

**Proposed additions for transcription issues:**
- `garbled_audio` - detected transcription quality problems
- `environment_noise` - suspected noisy environment
- `repeated_clarification` - multiple clarification attempts needed

#### 7. Conditional Confirmation Checkpoints

At question transitions when quality signals are present, Alvia summarizes:

> "Before we move on, let me make sure I captured that correctly. You mentioned [key points]. Does that sound right?"

**Key refinement**: Only trigger when quality signals are present. For clean transcripts, skip to avoid slowing down the interview.

#### 8. Graceful Degradation to Text

If audio quality is persistently poor (detected over multiple turns), offer:

> "I'm still having trouble hearing you clearly. Would you prefer to type your responses instead?"

Requires UI change to support hybrid voice/text mode.

#### 9. Session-Level Quality Tracking

Track a rolling "transcription health score" per session:
- **Increment** for: coherent multi-word responses, no language hallucinations
- **Decrement** for: fragments, foreign language, repeated loops
- When score drops below threshold, trigger environmental intervention

---

## Recommended Priority

| Priority | Mitigation | Effort | Impact |
|----------|------------|--------|--------|
| **P0** | Language detection filter + new quality flags | Low | High - catches obvious failures |
| **P1** | Barbara `suggest_environment_check` action | Medium | High - addresses root cause |
| **P1** | Confirmation checkpoints (conditional) | Medium | Medium - allows correction |
| **P2** | Pre-interview audio check | Medium | Medium - prevents bad sessions |
| **P3** | Graceful degradation to text | High | Medium - fallback option |

---

## Sample Transcript (Reference)

The following transcript excerpt demonstrates the issues described above:

```json
[
  {
    "text": "That's the",
    "speaker": "respondent",
    "questionIndex": 0
  },
  {
    "text": "Here helps.",
    "speaker": "respondent",
    "questionIndex": 0
  },
  {
    "text": "conoce Madrid.",
    "speaker": "respondent",
    "questionIndex": 0
  },
  {
    "text": "อันนี้",
    "speaker": "respondent",
    "questionIndex": 1
  },
  {
    "text": "digo es un",
    "speaker": "respondent",
    "questionIndex": 2
  },
  {
    "text": "thisis a changing minus.",
    "speaker": "respondent",
    "questionIndex": 2
  },
  {
    "text": "So I'll be between you and me.",
    "speaker": "respondent",
    "questionIndex": 4
  }
]
```

---

## Implementation Notes

### Detection Algorithm Pseudocode

```typescript
interface TranscriptionQualitySignals {
  shortUtteranceStreak: number;      // consecutive utterances < 3 words
  foreignLanguageDetected: boolean;  // non-English in English interview
  questionRepeatCount: number;       // times current question re-asked
  incoherentPhraseCount: number;     // phrases with low coherence
}

function shouldTriggerEnvironmentCheck(signals: TranscriptionQualitySignals): boolean {
  // Strong signal: any foreign language detected
  if (signals.foreignLanguageDetected) return true;

  // Multiple weak signals
  const weakSignalCount =
    (signals.shortUtteranceStreak >= 3 ? 1 : 0) +
    (signals.questionRepeatCount >= 3 ? 1 : 0) +
    (signals.incoherentPhraseCount >= 2 ? 1 : 0);

  return weakSignalCount >= 2;
}
```

### Language Detection Heuristic

```typescript
function detectNonEnglish(text: string): boolean {
  // Check for non-ASCII characters (Thai, Chinese, Arabic, etc.)
  const nonAsciiPattern = /[^\x00-\x7F]/;
  if (nonAsciiPattern.test(text)) return true;

  // Check for common Spanish/French/German patterns
  const romanLanguagePatterns = [
    /\b(es un|conoce|digo|esto|pero|muy)\b/i,  // Spanish
    /\b(c'est|je suis|qu'est|très)\b/i,         // French
    /\b(ich bin|das ist|sehr)\b/i,              // German
  ];

  return romanLanguagePatterns.some(p => p.test(text));
}
```
