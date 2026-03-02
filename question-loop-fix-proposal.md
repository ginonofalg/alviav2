# Fix: Alvia Asking Upcoming Questions Prematurely (Question Loop Bug)

## Context

A tester (Phil) reported that questions got stuck in a repetitive loop. The transcript shows Alvia asked **all 5 template questions while the system was still on `questionIndex: 0`** — because Phil verbally said "next question" and Alvia could see the full question list in her prompt. The system's `currentQuestionIndex` only advances when the respondent clicks the Next Question **button**, so when the system later advanced through indices 1-5, every question was re-asked. Phil said "You already asked me that" three times.

## Root Cause

Multiple reinforcing problems across three files:

1. **Full question text exposed in Alvia's prompt** (`instructions.ts`) — The `UPCOMING QUESTIONS` section shows complete question text, making it easy for Alvia to read them verbatim
2. **Ambiguous instructions** (`instructions.ts`) — Instruction #9 says "signal you're ready for the next question" (Alvia interprets this as asking it herself); Instruction #11 says "respondent clicks the button" but is buried and weak
3. **Hardcoded guidance encourages verbal move-on** (`voice-interview.ts:2363`) — The `suggest_next_question` runtime message says "shall we move to the next question?" which invites the respondent to verbally agree, then Alvia reads the next question
4. **Barbara can leak question text** (`barbara-orchestrator.ts`) — Barbara receives full upcoming question text and could quote it in her guidance message, which flows into Alvia's prompt
5. **Guidance leaks via persistence/resume** (`voice-interview.ts:214-222`) — Barbara's raw `guidance.message` is persisted and later injected into resume/refresh prompts at `instructions.ts:278`, bypassing any live overrides
6. **Client payload sends raw message** (`voice-interview.ts:2427`) — The client event uses `guidance.message` (original), not the overridden `guidanceMessage`

## Approach: Defence in Depth (3 files + 1 new module)

Three layers of defence:
- **Reduce the temptation**: Replace full question text with non-contiguous keyword-based topic labels in Alvia's prompt (e.g. `[Topic: donation / matchfunding / motivation]`)
- **Explicit prohibition**: Clear instructions that Alvia must NEVER ask upcoming questions + a script for handling verbal "next question" requests
- **Deterministic sanitization**: A code-level `sanitizeGuidanceForAlvia()` function using fingerprint-based leak detection. For actions like `suggest_next_question` and `time_reminder`, the message is always hard-overridden to button-only constants. For other actions, if leaked question text is detected (via n-gram + keyword overlap), the entire message is replaced with a safe fallback — no surgical substring replacement. Sanitized once, used everywhere (prompt, client, persistence).

## Files Modified

| File | Changes |
|------|---------|
| `server/voice-interview/guidance-sanitizer.ts` | **New file** (~100 lines) — fingerprint-based leak detection, safe fallbacks, exported constants |
| `server/voice-interview/instructions.ts` | Add `buildTopicLabel()`, convert upcoming questions, instruction rewrites |
| `server/voice-interview/index.ts` | Add re-export for new module |
| `server/voice-interview.ts` | Import sanitizer, apply once early in guidance path, remove inline override (net shrinks) |
| `server/barbara-orchestrator.ts` | Add one system prompt rule (advisory, 1 line insertion) |
| `server/__tests__/question-loop-prevention.test.ts` | **New file** — tests for sanitizer, topic labels, instruction builders |

## Changes

### A. `server/voice-interview/guidance-sanitizer.ts` (new file, ~100 lines)

Central deterministic sanitization. Uses the existing `getKeywords` and `INTERVIEW_META_STOPWORDS` from `text-utils.ts`.

**Design**: detect-then-replace-whole-message, not surgical substring replacement. If any leak is detected, the entire message is swapped for a safe action-specific fallback.

```typescript
import type { BarbaraGuidance } from "../barbara-orchestrator";
import { getKeywords, INTERVIEW_META_STOPWORDS } from "./text-utils";

// --- Exported constants (testable) ---

export const SUGGEST_NEXT_QUESTION_MESSAGE =
  "Based on the conversation so far, the respondent has provided a comprehensive answer to this question. When there's a natural pause, thank them for their answer and let them know they can click the Next Question button below whenever they're ready. Do NOT ask or preview the next question yourself.";

export const SUGGEST_LAST_QUESTION_MESSAGE =
  "Based on the conversation so far, the respondent has provided a comprehensive answer to this question. This is the LAST question in the interview. When there's a natural pause, wrap up naturally — thank them warmly for their time and insights, and let them know they can click the button below to continue. Do NOT mention a next question or moving on to another topic.";

export const TIME_REMINDER_MESSAGE =
  "The conversation on this question is running long. When there's a natural pause, gently suggest wrapping up and let the respondent know they can click the Next Question button below to move on. Do NOT ask or preview the next question yourself.";

// --- Types ---

export type SanitizationResult = {
  message: string;
  wasSanitized: boolean;
  reason?: "action_override" | "question_text_leak";
};

type Fingerprint = {
  normalized: string;
  keywords: Set<string>;
  ngrams: Set<string>;
};

// --- Internals ---

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function buildNgrams(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    out.add(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function buildFingerprint(questionText: string): Fingerprint {
  const normalized = normalize(questionText);
  const tokens = normalized.split(" ").filter(Boolean);
  const n = tokens.length >= 5 ? 5 : tokens.length >= 3 ? 3 : Math.max(1, tokens.length);
  return {
    normalized,
    keywords: getKeywords(questionText, INTERVIEW_META_STOPWORDS),
    ngrams: buildNgrams(tokens, n),
  };
}

function hasQuestionLeak(message: string, fingerprints: Fingerprint[]): boolean {
  const normMsg = normalize(message);
  const msgTokens = normMsg.split(" ").filter(Boolean);
  // Build message n-grams at multiple sizes to match fingerprint n-gram sizes
  const msgNgrams3 = buildNgrams(msgTokens, 3);
  const msgNgrams5 = buildNgrams(msgTokens, 5);
  const msgKeywords = getKeywords(message, INTERVIEW_META_STOPWORDS);

  for (const fp of fingerprints) {
    if (!fp.normalized) continue;

    // 1. Exact normalized substring match (catches short questions too)
    if (normMsg.includes(fp.normalized)) return true;

    // 2. N-gram overlap: any shared n-gram is a strong signal
    for (const ng of fp.ngrams) {
      if (msgNgrams3.has(ng) || msgNgrams5.has(ng)) return true;
    }

    // 3. Keyword overlap: >=4 shared keywords AND >=60% of question's keywords
    let shared = 0;
    for (const k of fp.keywords) {
      if (msgKeywords.has(k)) shared++;
    }
    if (shared >= 4 && shared / Math.max(fp.keywords.size, 1) >= 0.6) return true;
  }

  return false;
}

function fallbackForAction(
  action: BarbaraGuidance["action"],
  isLastQuestion: boolean,
): string {
  switch (action) {
    case "suggest_next_question":
      return isLastQuestion ? SUGGEST_LAST_QUESTION_MESSAGE : SUGGEST_NEXT_QUESTION_MESSAGE;
    case "time_reminder":
      return TIME_REMINDER_MESSAGE;
    case "probe_followup":
      return "Ask one concise follow-up that deepens the respondent's latest point, based only on what they just said.";
    case "acknowledge_prior":
      return "Briefly acknowledge what they just shared, then continue with a focused follow-up on their latest response.";
    case "confirm_understanding":
      return "Briefly summarize what you heard and ask if you understood correctly before continuing.";
    case "suggest_environment_check":
      return "Politely ask the respondent to move somewhere quieter or speak closer to the microphone, then continue naturally.";
    default:
      return "";
  }
}

// --- Public API ---

export function sanitizeGuidanceForAlvia(
  guidance: BarbaraGuidance,
  upcomingQuestions: Array<{ questionText: string }>,
  isLastQuestion: boolean,
): SanitizationResult {
  // Hard-override for actions that should always use button-only messaging
  if (guidance.action === "suggest_next_question" || guidance.action === "time_reminder") {
    return {
      message: fallbackForAction(guidance.action, isLastQuestion),
      wasSanitized: true,
      reason: "action_override",
    };
  }

  // For all other actions: detect leaked question text and replace whole message if found
  if (upcomingQuestions.length > 0) {
    const fingerprints = upcomingQuestions.map((q) => buildFingerprint(q.questionText));
    if (hasQuestionLeak(guidance.message, fingerprints)) {
      return {
        message: fallbackForAction(guidance.action, isLastQuestion),
        wasSanitized: true,
        reason: "question_text_leak",
      };
    }
  }

  return { message: guidance.message, wasSanitized: false };
}
```

### B. `server/voice-interview/instructions.ts`

#### 1. Add `buildTopicLabel()` helper (before `buildInterviewInstructions`, ~line 5)

Uses the existing `getKeywords` + `INTERVIEW_META_STOPWORDS` from `text-utils.ts` to build non-contiguous keyword-based topic labels. No contiguous original question text is ever exposed.

```typescript
import { getKeywords, INTERVIEW_META_STOPWORDS } from "./text-utils";

/**
 * Builds a non-contiguous keyword-based topic label from a question.
 * Never returns contiguous original question text.
 * Example: "How did matchfunding influence your donation?" → "[Topic: matchfunding / influence / donation]"
 */
function buildTopicLabel(questionText: string): string {
  const keywords = getKeywords(questionText, INTERVIEW_META_STOPWORDS);
  const keywordArray = [...keywords].slice(0, 4);
  if (keywordArray.length === 0) return "[Topic: general]";
  return `[Topic: ${keywordArray.join(" / ")}]`;
}
```

#### 2. Convert upcoming questions to topic labels (3 locations)

All change from `q.questionText` to `${buildTopicLabel(q.questionText)}`:

| Location | Code path |
|----------|-----------|
| Lines 30-36 | `buildInterviewInstructions` — main interview upcoming questions |
| Lines 187-190 | `buildResumeContext` — AQ resume path |
| Lines 221-224 | `buildResumeContext` — regular resume path |

**Example before**:
```
Q2: When you think about why you donated, how much was it about the club itself versus the energy and sustainability side of things?
```

**Example after**:
```
Q2: [Topic: donated / club / energy / sustainability]
```

#### 3. Rename UPCOMING QUESTIONS header (2 locations)

**Before** (line 65 and line 265):
```
UPCOMING QUESTIONS (DO NOT ask follow-ups that overlap with these, they will be covered later):
```

**After**:
```
UPCOMING QUESTION TOPICS (for overlap avoidance only — the system will ask these later. NEVER ask, read aloud, or preview these yourself):
```

#### 4. Rewrite instruction #4 — strengthen deduplication instruction

In `buildInterviewInstructions` (line 81), `buildResumeInstructions` (line 324), `buildRefreshInstructions` (line 357):

**Before**: `make sure these follow-up questions don't overlap with an UPCOMING QUESTION`
**After**: `Make sure your follow-up questions don't overlap with UPCOMING QUESTION TOPICS. Those questions will be asked later by the system — never ask them yourself, and never read them aloud.`

#### 5. Rewrite instruction #9 — "signal ready" → "direct to button"

In `buildInterviewInstructions` (line 86), `buildResumeInstructions` (line 329), `buildRefreshInstructions` (line 362):

**Before**: `say "Thank you for that answer" and signal you're ready for the next question`
**After**: `thank them for their answer and let them know they can move on by clicking the Next Question button below. Do NOT ask or preview the next question yourself.`

#### 6. Rewrite instruction #10 — remove "list above" reference

In `buildInterviewInstructions` (line 87), `buildResumeInstructions` (line 330), `buildRefreshInstructions` (line 363):

**Before**: `When the orchestrator talks about the next question or moving on, she means the next question in the list above, not your next follow-up.`
**After**: `When the orchestrator suggests moving on, she means the respondent should click the Next Question button — not that you should ask any upcoming question yourself.`

#### 7. Rewrite instruction #11 — add CRITICAL verbal-request handling

In `buildInterviewInstructions` (line 88), `buildResumeInstructions` (line 331), `buildRefreshInstructions` (line 364):

**Before**: `The respondent will click the Next Question button when ready to move on. You can refer to this button as "the Next Question button below" if appropriate.`
**After**: `CRITICAL: Only the system advances questions — the respondent clicks the Next Question button below to move on. You must NEVER ask, read aloud, or preview any upcoming question. If the respondent verbally asks for the "next question" or says they want to move on, warmly acknowledge them and direct them to click the Next Question button below.`

#### 8. Fix resume instruction #2 — remove "move to the next question" phrasing

In `buildResumeInstructions` (line 318-319):

**Before**: `The respondent had already given a comprehensive answer before the interruption. Ask if they'd like to add anything or move to the next question.`
**After**: `The respondent had already given a comprehensive answer before the interruption. Ask if they'd like to add anything, or let them know they can click the Next Question button below to move on.`

### C. `server/voice-interview/index.ts`

Add re-export:
```typescript
export * from "./guidance-sanitizer";
```

### D. `server/voice-interview.ts` (net shrinks — moves logic to sanitizer module)

#### 9. Refactor guidance processing to use sanitizer (lines 2342-2434)

Remove the inline `guidanceMessage` override block (lines 2346-2365, ~20 lines) and replace with a single sanitizer call (~8 lines). The `isLastQuestion` logic (lines 2348-2356) remains as a simple boolean.

**Before** (lines 2342-2434, simplified):
```typescript
if (guidance.action !== "none" && guidance.confidence > 0.6) {
  state.barbaraGuidanceQueue.push(guidance);

  let guidanceMessage = guidance.message;
  if (guidance.action === "suggest_next_question") {
    const isLastTemplateQuestion = /* ... */;
    const isLastAdditionalQuestion = /* ... */;
    if (isLastTemplateQuestion || isLastAdditionalQuestion) {
      guidanceMessage = "...last question message...";
    } else {
      guidanceMessage = "...shall we move to the next question?...";
    }
  }

  // Inject into Alvia prompt using guidanceMessage
  buildInterviewInstructions(..., guidanceMessage, ...);

  // Client gets guidance.message (original, NOT overridden) ← BUG
  clientWs?.send(JSON.stringify({ ..., message: guidance.message, ... }));

  // Persistence gets guidance (original) ← BUG
  await persistBarbaraGuidance(sessionId, guidance);
}
```

**After**:
```typescript
if (guidance.action !== "none" && guidance.confidence > 0.6) {
  // Sanitize once, use everywhere
  const isLastQuestion =
    (!state.isInAdditionalQuestionsPhase &&
      state.currentQuestionIndex === state.questions.length - 1) ||
    (state.isInAdditionalQuestionsPhase &&
      state.currentAdditionalQuestionIndex != null &&
      state.additionalQuestions.length > 0 &&
      state.currentAdditionalQuestionIndex >= state.additionalQuestions.length - 1);

  const upcomingQuestions = state.questions.slice(state.currentQuestionIndex + 1);
  const sanitized = sanitizeGuidanceForAlvia(guidance, upcomingQuestions, isLastQuestion);
  const safeGuidance = { ...guidance, message: sanitized.message };

  if (sanitized.wasSanitized) {
    console.log(`[Barbara] Guidance sanitized (${sanitized.reason}) for ${sessionId}`);
  }

  state.barbaraGuidanceQueue.push(safeGuidance);

  // Inject into Alvia prompt
  buildInterviewInstructions(..., sanitized.message, ...);

  // Client gets sanitized message
  clientWs?.send(JSON.stringify({ ..., message: sanitized.message, ... }));

  // Persistence gets sanitized guidance (safe for resume/refresh)
  await persistBarbaraGuidance(sessionId, safeGuidance);
}
```

### E. `server/barbara-orchestrator.ts` (1 line insertion, advisory)

#### 10. Add guardrail to Barbara's system prompt (after line 381)

Add a new responsibility rule after the existing QUESTION DEDUPLICATION rule:

```
5. QUESTION TEXT CONFIDENTIALITY: NEVER quote, paraphrase, or preview the text of any UPCOMING QUESTION in your guidance message. Your guidance goes directly into Alvia's prompt, and if you include future question text, Alvia may read it aloud prematurely. Only reference upcoming questions by number (e.g., "Q3 will cover this") if needed, never by content.
```

Renumber existing rules 5-6 to 6-7. This is advisory — the deterministic sanitizer is the actual backstop.

### F. `server/__tests__/question-loop-prevention.test.ts` (new file)

```typescript
import { describe, it, expect } from "vitest";
import {
  buildInterviewInstructions,
} from "../voice-interview/instructions";
import {
  sanitizeGuidanceForAlvia,
  SUGGEST_NEXT_QUESTION_MESSAGE,
  SUGGEST_LAST_QUESTION_MESSAGE,
  TIME_REMINDER_MESSAGE,
} from "../voice-interview/guidance-sanitizer";
import type { BarbaraGuidance } from "../barbara-orchestrator";

const template = { objective: "Test interview", tone: "professional" };
const questions = [
  { questionText: "Tell me about the moment you decided to back the campaign", guidance: "Get specific" },
  { questionText: "How much was about the club versus sustainability?", guidance: "Unpack it" },
  { questionText: "How did matchfunding influence your donation?", guidance: "Probe both angles" },
];

function makeGuidance(overrides: Partial<BarbaraGuidance> = {}): BarbaraGuidance {
  return {
    action: "probe_followup",
    message: "Ask a follow-up about their experience.",
    confidence: 0.9,
    reasoning: "test",
    ...overrides,
  };
}

// --- sanitizeGuidanceForAlvia ---

describe("sanitizeGuidanceForAlvia", () => {
  const upcoming = [questions[1], questions[2]];

  describe("action overrides", () => {
    it("hard-overrides suggest_next_question to button-only message", () => {
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ action: "suggest_next_question", message: "anything Barbara said" }),
        upcoming, false,
      );
      expect(result.message).toBe(SUGGEST_NEXT_QUESTION_MESSAGE);
      expect(result.wasSanitized).toBe(true);
      expect(result.reason).toBe("action_override");
      expect(result.message).toContain("click the Next Question button below");
      expect(result.message).not.toContain("shall we move to the next question");
    });

    it("uses last-question message when isLastQuestion is true", () => {
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ action: "suggest_next_question" }),
        [], true,
      );
      expect(result.message).toBe(SUGGEST_LAST_QUESTION_MESSAGE);
      expect(result.message).toContain("LAST question");
    });

    it("hard-overrides time_reminder to button-only message", () => {
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ action: "time_reminder", message: "anything" }),
        upcoming, false,
      );
      expect(result.message).toBe(TIME_REMINDER_MESSAGE);
      expect(result.wasSanitized).toBe(true);
      expect(result.reason).toBe("action_override");
    });
  });

  describe("question text leak detection", () => {
    it("catches exact upcoming question text in guidance", () => {
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ message: `Consider asking "${questions[1].questionText}" to explore further.` }),
        upcoming, false,
      );
      expect(result.wasSanitized).toBe(true);
      expect(result.reason).toBe("question_text_leak");
      expect(result.message).not.toContain(questions[1].questionText);
    });

    it("catches case/punctuation variant leak", () => {
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ message: "how much was about the club versus sustainability" }),
        upcoming, false,
      );
      expect(result.wasSanitized).toBe(true);
      expect(result.reason).toBe("question_text_leak");
    });

    it("catches short question leak", () => {
      const shortQ = [{ questionText: "Your age?" }];
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ message: "You could ask about your age? to understand demographics." }),
        shortQ, false,
      );
      expect(result.wasSanitized).toBe(true);
    });

    it("leaves clean messages unchanged", () => {
      const result = sanitizeGuidanceForAlvia(
        makeGuidance({ message: "The respondent seems hesitant. Try a softer probe." }),
        upcoming, false,
      );
      expect(result.wasSanitized).toBe(false);
      expect(result.message).toBe("The respondent seems hesitant. Try a softer probe.");
    });
  });
});

// --- buildInterviewInstructions: upcoming question exposure ---

describe("Question loop prevention — buildInterviewInstructions", () => {
  const build = () => buildInterviewInstructions(
    template, questions[0], 0, 3,
    undefined, null, questions, undefined, null, false,
  );

  it("does not include full upcoming question text", () => {
    const result = build();
    expect(result).not.toContain(questions[1].questionText);
    expect(result).not.toContain(questions[2].questionText);
  });

  it("contains keyword-based topic labels for upcoming questions", () => {
    const result = build();
    expect(result).toContain("[Topic:");
    // Should contain keywords, not contiguous question text
    expect(result).toContain("/"); // keyword separator
  });

  it("contains button-only directive", () => {
    const result = build();
    expect(result).toContain("click the Next Question button below");
  });

  it("contains never-ask-upcoming directive", () => {
    const result = build();
    expect(result).toContain("NEVER ask, read aloud, or preview any upcoming question");
  });

  it("contains overlap-avoidance-only header", () => {
    const result = build();
    expect(result).toContain("UPCOMING QUESTION TOPICS");
    expect(result).toContain("for overlap avoidance only");
  });

  it("has no upcoming questions section on last question", () => {
    const result = buildInterviewInstructions(
      template, questions[2], 2, 3,
      undefined, null, questions, undefined, null, false,
    );
    expect(result).not.toContain("UPCOMING QUESTION TOPICS");
  });

  it("short question text is never exposed verbatim in upcoming list", () => {
    const shortQuestions = [
      { questionText: "Your age?", guidance: "" },
      { questionText: "Where do you live?", guidance: "" },
    ];
    const result = buildInterviewInstructions(
      template, shortQuestions[0], 0, 2,
      undefined, null, shortQuestions, undefined, null, false,
    );
    expect(result).not.toContain("Where do you live?");
    expect(result).toContain("[Topic:");
  });
});

// Resume/refresh builders need mock InterviewState —
// follow the pattern from connection-refresh.test.ts.
// Tests should assert the same properties:
// - no full upcoming question text
// - [Topic:] references present
// - button-only directive present
// - never-ask-upcoming directive present
// - lastBarbaraGuidance rendered (when present) does not contain upcoming question text
//   (because guidance is sanitized before persistence)
```

## Verification

1. `npm run check` — type check passes (no signature changes to existing exports)
2. `npx vitest server/__tests__/question-loop-prevention.test.ts` — all assertions pass
3. `npx vitest` — full test suite passes (no regressions)
4. Manual: start an interview, on Q1 verbally say "next question" — Alvia should direct to the button, NOT read Q2
5. Manual: let Barbara issue `suggest_next_question` — Alvia should say "click the Next Question button below"
6. Manual: disconnect and resume mid-interview — Alvia should NOT read upcoming questions from persisted guidance
7. Manual: click the actual Next Question button — transition still works correctly
8. Manual: complete a full interview — no questions skipped or duplicated
