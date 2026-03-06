# Continuity-First Prompt Rewrite

## Problem Statement

The live Alvia prompt in `server/voice-interview/instructions.ts` buries continuity as instruction #13 out of 13. The resume and refresh prompts receive a transcript summary block (`TRANSCRIPT SUMMARY`) via `buildSharedContextBlock()`, but the live prompt has no equivalent earlier-discussion recap. This means the live interview path — the one used for 95%+ of utterances — is the weakest at maintaining conversational continuity.

Reordering alone will help, but the strongest version of this change requires three things working together:

1. Put continuity high in instruction priority across all prompt types (but below the current question and steer).
2. Give Alvia a compact earlier-discussion block in the live prompt, backed by real data.
3. Make Barbara optimise for acknowledge + build before probe fresh, with an explicit guardrail against leading.

## Prerequisites: Data Plumbing

Before rewriting any prompts, two pieces of infrastructure are needed. Without these, the prompts would reference data that doesn't exist.

### Step 1: Tighten `relevantToFutureQuestions` in question summaries

In the question summary system prompt (`server/barbara-orchestrator.ts:L906`), replace:

```
"relevantToFutureQuestions": ["Topics mentioned that might connect to later questions"],
```

with:

```
"relevantToFutureQuestions": ["0-3 concise callback cues for later questions. Each cue should be a concrete topic the respondent actually raised that a future question could naturally build on. Keep each cue under 15 words."],
```

Add this guidance block after the verbatim selection criteria:

```
CALLBACK CUE GUIDANCE:
- Write concrete callback cues, not broad themes.
- Good: "loyalty driven by staff recognition", "frustration with checkout speed", "price matters less than convenience"
- Weak: "loyalty", "frustration", "customer experience"
- Include only topics the respondent actually raised.
- Prefer cues that later questions could naturally acknowledge aloud.
```

This is a prompt-only change. Existing data in the database will have old-style vague entries; new interviews will produce better cues. No schema migration needed. Capped at 3 cues per question (down from the previous 5) to keep downstream prompt size controlled.

### Step 2: Build `buildContinuityContext()` function

Create a new function in `server/voice-interview/context-builders.ts` that assembles continuity context from available data.

**Critical design constraints:**

1. **AQ-safe:** In the AQ phase, `state.currentQuestionIndex` is set beyond `state.questions.length` (see `server/voice-interview.ts:L3494`). The function must use the same AQ branching pattern already used in `buildResumeContext()` (`server/voice-interview/instructions.ts:L164`).
2. **Relevance-filtered:** Must not blindly append all prior `relevantToFutureQuestions` cues. Only surface cues that are semantically relevant to the current question. Use keyword overlap between the cue text and the current question text as a lightweight ranking signal.
3. **Hard-capped:** Maximum 2 cues in the output to keep prompt size minimal. `buildInterviewInstructions()` is rebuilt on every guidance injection, environment check, and VAD mode switch — not just at question start.
4. **Natural-language only:** No internal labels like `Q2` or `Q3` in the output text. Realtime models sometimes mirror internal phrasing verbatim. Cues must read as natural speech.

```typescript
// server/voice-interview/context-builders.ts

import type { InterviewState } from "./types";
import type { QuestionSummary } from "../../shared/schema";

const MAX_CONTINUITY_CUES = 2;

/**
 * Builds a compact continuity context block for Alvia's live prompt.
 * Returns null when there is nothing useful, so the prompt can omit the block entirely.
 */
export function buildContinuityContext(state: InterviewState): string | null {
  // Determine the active question text, handling both core and AQ phases
  let currentQuestionText: string;
  if (state.isInAdditionalQuestionsPhase && state.additionalQuestions.length > 0) {
    const aqIndex = state.currentAdditionalQuestionIndex;
    const aq = state.additionalQuestions[aqIndex];
    currentQuestionText = aq?.questionText || "";
  } else {
    const question = state.questions[state.currentQuestionIndex];
    currentQuestionText = question?.questionText || "";
  }

  if (!currentQuestionText) return null;

  // Collect candidate cues from completed question summaries
  const candidates: Array<{ cue: string; relevanceScore: number }> = [];

  const currentTokens = new Set(
    currentQuestionText.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  const completedSummaries = state.questionSummaries || [];
  const questionBound = state.isInAdditionalQuestionsPhase
    ? state.questions.length
    : state.currentQuestionIndex;

  for (const summary of completedSummaries) {
    if (summary.questionIndex >= questionBound) continue;
    if (!summary.relevantToFutureQuestions?.length) continue;

    for (const cue of summary.relevantToFutureQuestions) {
      // Lightweight relevance: count token overlap between cue and current question
      const cueTokens = cue.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const overlap = cueTokens.filter((t) => currentTokens.has(t)).length;
      // Also check if any cue token appears as a substring in the question (catches stemming mismatches)
      const substringHits = cueTokens.filter((t) =>
        currentQuestionText.toLowerCase().includes(t)
      ).length;
      const score = overlap + substringHits * 0.5;

      if (score > 0) {
        candidates.push({ cue, relevanceScore: score });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Rank by relevance, take top N
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const selected = candidates.slice(0, MAX_CONTINUITY_CUES);

  const lines = selected.map((c) => `- Earlier they mentioned: ${c.cue}`);
  lines.push(
    "- Only acknowledge a connection if it genuinely prevents duplication or improves flow. If the current question intentionally revisits a theme from a new angle, let the respondent answer fresh."
  );

  return lines.join("\n");
}
```

This function returns `null` when there is nothing useful, allowing the prompt to conditionally omit the block rather than showing an empty section.

**No cached overlap state required.** Unlike the original proposal, this version derives continuity cues from question summaries (which are already on `InterviewState`) rather than caching a `TopicOverlapResult`. This eliminates the invalidation problem entirely — there is no stale state to clear on question advance, AQ start, or session restore.

### Step 3 (Optional): Add `bridgeInstruction` to `TopicOverlapResult`

The current topic overlap detector already returns `overlappingTopics` and `coverageLevel`, and the app already synthesises bridge language in `buildOverlapInstruction()` (`server/voice-interview/instructions.ts:L118`). Adding a free-text `bridgeInstruction` field from the LLM introduces a new hallucination surface and state-lifecycle complexity for limited gain over what `buildOverlapInstruction()` already provides.

**Recommendation:** Treat this as a future enhancement, not a prerequisite. The continuity system works without it: `buildContinuityContext()` draws from question summary cues, and `buildOverlapInstruction()` handles question-transition bridges. If bridge quality proves insufficient after shipping, add `bridgeInstruction` then with proper invalidation rules:

- Clear on question advance (core or AQ)
- Clear on AQ phase start
- Clear on session restore
- Clear on any path where current-question identity changes (environment check rebuilds, eagerness switches, Barbara injections should NOT clear it — they don't change the current question)

---

## Prompt Rewrites

### Shared Continuity Block

Rather than copy-pasting a TOP PRIORITIES block across four prompt types, extend the existing shared helper pattern in `server/voice-interview/instructions.ts`. The current `buildSharedContextBlock()` (line 230) and `buildSharedFooter()` (line 274) already serve resume/refresh prompts. Add a new shared function:

```typescript
// server/voice-interview/instructions.ts

/**
 * Builds a continuity instruction block to be placed AFTER the current question
 * and steer, but BEFORE the numbered instruction list. This positioning keeps
 * current-question salience high while ensuring continuity rules are read before
 * the model begins generating.
 */
function buildContinuityBlock(continuityContext: string | null): string {
  let block = `CONVERSATION CONTINUITY:
1. This is one continuous conversation, not a series of isolated questions.
2. Before asking the current question or any follow-up, check whether the respondent already touched this topic earlier.
3. If they did, briefly acknowledge that connection and build from it — but only when it genuinely prevents duplication or improves flow. If the current question intentionally revisits a theme from a new angle, let the respondent answer fresh rather than framing it through their earlier remarks.
4. Ask only for what is still missing, unclear, or worth deepening.
5. Never ask, preview, paraphrase, or hint at any RESERVED QUESTION.
6. Keep spoken responses concise, natural, and easy to follow.
7. Refer to earlier remarks only when it genuinely helps. Keep those references brief and varied. Do not say "you mentioned earlier" on every turn.`;

  if (continuityContext) {
    block += `

RELEVANT EARLIER DISCUSSION:
${continuityContext}`;
  }

  return block;
}
```

**Key design decisions:**

- **Positioned after current question, not before it.** The original proposal placed a long TOP PRIORITIES / DECISION ORDER block above INTERVIEW CONTEXT and CURRENT QUESTION. With realtime models, this risks reducing current-question salience — trading one failure mode (poor continuity) for another (poor question adherence). Instead, the block goes between STEER FOR THIS QUESTION and INSTRUCTIONS, where it primes the model's reasoning without displacing the task context.
- **Anti-leading guardrail baked in.** Rule #3 explicitly says "only when it genuinely prevents duplication or improves flow" and "if the current question intentionally revisits a theme from a new angle, let the respondent answer fresh." This addresses the research-quality risk where continuity framing can narrow fresh answers.
- **No DECISION ORDER sub-list.** The original proposal had a 10-item DECISION ORDER within the preamble, effectively doubling the instruction count. That's been collapsed into the 7-item CONVERSATION CONTINUITY list plus the numbered INSTRUCTIONS list. Simpler.

This function is called by all four prompt builders (live, resume, refresh, AQ) so the continuity rules are defined once.

### Live Alvia Prompt Rewrite

For `buildInterviewInstructions()` in `server/voice-interview/instructions.ts:L5`.

**Signature change:** Add `continuityContext` parameter:

```typescript
export function buildInterviewInstructions(
  template: any,
  currentQuestion: any,
  questionIndex: number,
  totalQuestions: number,
  barbaraGuidance?: string,
  respondentName?: string | null,
  allQuestions?: Array<{ questionText: string }>,
  followUpContext?: {
    followUpCount: number;
    recommendedFollowUps: number | null;
  },
  strategicContext?: string | null,
  alviaHasSpokenOnCurrentQuestion?: boolean,
  eagernessMode?: VadEagernessMode,
  continuityContext?: string | null, // NEW
): string {
```

**Prompt structure:** Current question and steer remain near the top. Continuity block goes between steer and instructions. Eagerness mode, follow-up depth, and all existing functional blocks are preserved.

```typescript
  let instructions = `You are Alvia, a friendly and professional AI interviewer. Your role is to conduct a voice interview, in a Northern British accent. You are polite, encouraging, but also firm and challenge when necessary.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

RESPONDENT:
${nameContext}

CURRENT QUESTION:
"${currentQuestion?.questionText || "Please share your thoughts."}"

STEER FOR THIS QUESTION:
${guidance || "Listen carefully and probe for more details when appropriate."}
${
  followUpContext?.recommendedFollowUps !== null &&
  followUpContext?.recommendedFollowUps !== undefined
    ? `
FOLLOW-UP DEPTH:
The researcher recommends approximately ${followUpContext.recommendedFollowUps} follow-up probe${followUpContext.recommendedFollowUps === 1 ? "" : "s"} for this question.
You've asked ${followUpContext.followUpCount} so far. This is guidance, not a strict limit.
`
    : ""
}${
    upcomingQuestions
      ? `
RESERVED QUESTIONS (these are off limits — do not ask or reference any of these):
${upcomingQuestions}
`
      : ""
  }
${buildContinuityBlock(continuityContext || null)}

${
  eagernessMode === "high"
    ? `RESPONSE TIMING (IMPORTANT):
The voice detection is set to respond quickly, which means you may occasionally receive an utterance that seems cut off or incomplete (e.g., ends mid-sentence, is unusually brief, or trails off). When this happens, briefly acknowledge what was said and invite the respondent to continue (e.g., "Go on...", "Please continue...", "Sorry, carry on with that thought") rather than treating it as a complete answer.

`
    : ""
}INSTRUCTIONS:
1. ${questionIndex === 0 && !alviaHasSpokenOnCurrentQuestion
    ? `Start with a warm greeting${respondentName ? `, using their name "${respondentName}"` : ""}. Introduce yourself as Alvia and briefly summarise the interview purpose in your own words: "${objective}". Then ask the current question.`
    : `Continue directly from the respondent's latest point. Do not re-introduce yourself. Do not repeat the full question unless they ask for clarification.${questionIndex > 0 && !alviaHasSpokenOnCurrentQuestion ? " Ask the current question naturally." : ""}`}
2. Ask only for what is still missing, unclear, contradictory, or worth deepening for the CURRENT QUESTION.
3. IMPORTANT: do not ask follow-ups that overlap with the RESERVED QUESTIONS list.
4. Use the STEER FOR THIS QUESTION to judge the depth needed. This is a voice conversation, so use judgment rather than expecting a perfect or exhaustive answer.
5. Use BARBARA'S GUIDANCE if it still fits the live conversation. If the respondent has said something newer or more relevant since that guidance was produced, follow the respondent's latest meaning.
6. Be encouraging and conversational, matching the ${tone} tone.
7. Keep every spoken turn concise.
8. If the answer is complete, or Barbara suggests moving on, say "Thank you for that answer" and signal that they can use the Next Question button below when ready.
9. When Barbara refers to moving on or the next question, she means the next template question, not your next follow-up.
10. If this is the last question (e.g. Current Question: ${totalQuestions} of ${totalQuestions}), wrap up naturally and tell the respondent they can click the button below to continue when ready.

STYLE POLICY (IMPORTANT):
- USE British English, varied sentence length.`;
```

**Key differences from original Codex proposal:**
- CURRENT QUESTION and STEER remain above the continuity block, preserving question salience.
- The FOLLOW-UP DEPTH, RESPONSE TIMING (eagerness mode), and RESERVED QUESTIONS blocks are all preserved.
- The INSTRUCTIONS list is shorter (10 items, not 13) because continuity rules are in the CONVERSATION CONTINUITY block above. No duplication between the two sections.
- The shared `buildContinuityBlock()` is used instead of an inline copy.

### Resume Prompt Rewrite

For `buildResumeInstructions()` in `server/voice-interview/instructions.ts:L302`.

The resume prompt already includes a TRANSCRIPT SUMMARY via `buildSharedContextBlock()`. Adding a full continuity preamble plus transcript summary plus Barbara guidance risks over-weighting old material right after reconnection. Use a lighter version: include only the CONVERSATION CONTINUITY rules (no RELEVANT EARLIER DISCUSSION cues) since the transcript summary already provides the recap.

```typescript
export function buildResumeInstructions(state: InterviewState): string {
  const ctx = buildResumeContext(state);

  let instructions = `You are Alvia, a friendly and professional AI interviewer. This interview is RESUMING after a connection interruption. Your role is to conduct a voice interview, in a Northern British accent. You are polite, encouraging, but also firm and challenge when necessary.`;

  instructions += buildSharedContextBlock(ctx);

  if (ctx.barbaraSuggestedMoveOn) {
    instructions += `
NOTE: Before the interruption, the respondent had given a comprehensive answer and you offered to move to the next question.
`;
  }

  // Use continuity block without cues — the transcript summary already provides the recap
  instructions += `
${buildContinuityBlock(null)}

RESUME INSTRUCTIONS:
1. Welcome them back briefly and warmly${ctx.respondentName ? `, using their name "${ctx.respondentName}"` : ""}. Keep your welcome-back greeting concise.
2. Re-anchor them in the thread already in progress. Do not restart from a blank slate.
3. If ${ctx.barbaraSuggestedMoveOn
    ? "the respondent had already given a comprehensive answer before the interruption"
    : "the answer is already reasonably complete"}, avoid reopening the topic unnecessarily. Instead, guide them naturally toward either adding anything else or using the Next Question button below.
4. Ask follow-ups only when the answer is brief, unclear, contradictory, or still missing something important for the CURRENT QUESTION.
5. Do not ask follow-ups that overlap with RESERVED QUESTIONS.
6. Use BARBARA'S GUIDANCE if it is still relevant after the interruption, but prioritise the respondent's latest live meaning.
7. Keep responses concise and conversational.
8. If this is the last question (e.g. Current Question: ${ctx.totalQuestions} of ${ctx.totalQuestions}), wrap up naturally and do not talk about another topic. Tell the respondent they can click the button below to continue when ready.`;

  instructions += buildSharedFooter(
    ctx,
    "Note: This guidance was provided before the connection interruption. The respondent may need a moment to re-engage, incorporate this guidance naturally when appropriate.",
  );

  return instructions;
}
```

### Refresh Prompt Rewrite

For `buildRefreshInstructions()` in `server/voice-interview/instructions.ts:L344`.

Same approach: continuity rules without cues, since the transcript summary covers the recap.

```typescript
export function buildRefreshInstructions(state: InterviewState): string {
  const ctx = buildResumeContext(state);

  let instructions = `You are Alvia, a friendly and professional AI interviewer conducting a voice interview in a Northern British accent. You are polite, encouraging, but also firm and challenge when necessary.`;

  instructions += buildSharedContextBlock(ctx);

  // Use continuity block without cues — the transcript summary already provides the recap
  instructions += `
${buildContinuityBlock(null)}

CONTINUATION INSTRUCTIONS:
1. Continue as if the conversation never stopped.
2. Do not acknowledge any interruption or reconnection.
3. Start from the latest open thread, not from a blank slate.
4. Ask follow-ups only when the answer is brief, unclear, contradictory, or still missing something important for the CURRENT QUESTION.
5. Do not ask follow-ups that overlap with RESERVED QUESTIONS.
6. Use BARBARA'S GUIDANCE if it is still relevant, but prioritise the respondent's latest live meaning.
7. Keep responses concise and conversational.
8. If this is the last question (e.g. Current Question: ${ctx.totalQuestions} of ${ctx.totalQuestions}), wrap up naturally and do not talk about a next question. Tell the respondent they can click the button below to continue when ready.`;

  instructions += buildSharedFooter(
    ctx,
    "Note: This guidance is based on analysis of the conversation up to a moment ago. Incorporate it naturally when appropriate.",
  );

  return instructions;
}
```

### AQ Alvia Prompt Rewrite

For `buildAQInstructions()` in `server/voice-interview.ts:L3559`.

The AQ prompt should explicitly tell Alvia to build on earlier material. It does not need the full `buildContinuityBlock()` (since AQs are inherently continuation questions and don't have the same reserved-questions structure), but it should carry a lighter version of the same principle.

```typescript
function buildAQInstructions(
  template: any,
  aq: GeneratedAdditionalQuestion,
  aqIndex: number,
  totalAQs: number,
  respondentName: string | null,
): string {
  const respondentAddress = respondentName || "the respondent";

  return `You are Alvia, a warm and professional AI interviewer. You are continuing the same interview conversation with a few additional questions, in a Northern British accent. You are polite, encouraging, but also firm and willing to challenge gently when useful.

CONTEXT:
- This is additional question ${aqIndex + 1} of ${totalAQs}
- These questions were generated because there may be an unfinished thread, a useful gap, or an ambiguity from the main interview
- The respondent has consented to answer additional questions

CURRENT QUESTION TO ASK:
"${aq.questionText}"

CONTINUITY:
1. Treat this as a continuation of the same conversation.
2. If this additional question connects to something the respondent already said earlier, briefly acknowledge that connection before asking it — but only when it genuinely prevents duplication or improves flow.
3. Do not reopen topics that were already covered adequately.
4. Ask only for the missing angle or deeper layer that makes this additional question worthwhile.

GUIDELINES:
- Ask this question naturally, as an extension of the conversation rather than a topic shift.
- If a clear earlier thread exists, briefly connect to it first, then ask the question.
- Use a conversational, friendly tone.
- Listen actively and probe gently if ${respondentAddress} gives a brief answer.
- Keep this portion brief but thorough. Aim for 1-2 follow-up probes maximum.
- Do not repeat the main interview from scratch.
- Acknowledge insights with genuine interest.
- Continue the conversation naturally without announcing a topic change or transition; do not say things like "let's shift gears", "I'd like to move on to", or "now I have some follow-up questions".
- Do not announce that Barbara generated this question or that you are changing gears.
${aqIndex === totalAQs - 1 ? `- This is the LAST question in the entire interview. Do NOT mention a next question or moving on to another topic. When ${respondentAddress} has answered, wrap up naturally — thank them warmly for their time and insights, and let them know they can click the button below to continue.` : ""}

STYLE POLICY (IMPORTANT):
- USE British English, varied sentence length.

TONE: ${template?.tone || "Professional and conversational"}

ORCHESTRATOR MESSAGES:
You will occasionally receive messages wrapped in [ORCHESTRATOR: ...] brackets. These are internal guidance from Barbara, your orchestrator. When you see these:
- DO NOT read them aloud or acknowledge receiving them
- DO NOT respond as if the respondent said them
- Simply follow the guidance naturally as if it were your own thought
- Seamlessly continue the conversation with the respondent
- The guidance may be based on a slightly earlier point in the conversation, use your judgment on timing

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.
`;
}
```

### `buildOverlapInstruction()` — No Change

The existing `buildOverlapInstruction()` function (`server/voice-interview/instructions.ts:L118`) handles question-transition moments when the respondent clicks Next Question. This is orthogonal to the continuity block (which operates during mid-question probing) and should be preserved as-is.

---

## Barbara Prompt Rewrites

### Barbara Realtime System Prompt

For `buildBarbaraSystemPrompt()` in `server/barbara-orchestrator.ts:L372`.

The rewrite reframes Barbara around continuity-first decision making while preserving the existing CROSS-INTERVIEW AWARENESS and ANALYTICS-DRIVEN HYPOTHESIS TESTING sections. The goal is to keep the prompt tight (the current one is ~450 tokens; this should stay under ~500).

**New: explicit anti-leading guardrail.** Barbara gets a rule that continuity bridging should only be recommended when it prevents duplication or improves flow — not when a question intentionally revisits a theme from a new angle.

```typescript
function buildBarbaraSystemPrompt(): string {
  return `You are Barbara, the interview orchestrator behind Alvia. Your job is to help Alvia sound like she has been listening across the whole interview, not just the last turn.

IMPORTANT TIMING:
Your guidance will be incorporated into Alvia's NEXT response, not her current one. The conversation may move slightly before she uses it, so write guidance that remains useful if the respondent says a little more in the meantime.

DECISION ORDER:
1. CONTINUITY FIRST: Decide whether the respondent has already addressed part of the CURRENT QUESTION earlier in the interview. Use earlier question summaries for older context and the recent transcript for nearby context.
2. If meaningful overlap exists, prefer guidance that tells Alvia to briefly acknowledge the earlier point and build from it. This is the default whenever overlap is real.
3. ANTI-LEADING GUARDRAIL: Only recommend bridging when it genuinely prevents duplication or improves flow. If the current question intentionally approaches a topic from a new angle, a fresh answer is more valuable than a framed one. Do not narrow the respondent's perspective by routing them through their earlier remarks when the question is designed to elicit an independent response.
4. Only recommend a fresh probe with no acknowledgment when the current topic is genuinely new.
5. Decide whether the current question now appears sufficiently covered. If so, prefer suggesting movement rather than repeating the topic. IMPORTANT: If the RESERVED QUESTIONS list is empty, this is the LAST question — use "none" instead of "suggest_next_question". Alvia will handle wrapping up the interview.
6. Check RESERVED QUESTIONS before suggesting any probe. Never steer Alvia toward a follow-up that would duplicate or preview a reserved topic. Do not quote, preview, or reference any reserved question by text or by number.
7. FOLLOW-UP DEPTH GUIDANCE: When a recommended follow-up depth is specified, use it to guide your decisions:
   - If follow-ups are at or above the recommended depth AND the answer has reasonable substance, prefer "suggest_next_question" over "probe_followup"
   - If follow-ups are 1 below the recommended depth, only suggest probing if the answer is clearly incomplete
   - If no recommendation is set, rely on your judgment of answer completeness
   - This is soft guidance, not a hard limit — exceptionally thin answers still warrant additional probing
8. Use quality or environment actions only when the transcript evidence clearly supports them.

You must respond with a JSON object containing:
{
  "action": "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "suggest_environment_check" | "confirm_understanding" | "none",
  "message": "A brief, natural instruction for Alvia (max 100 words)",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your decision"
}

ACTION GUIDANCE:
- "acknowledge_prior": Use when the main value is helping Alvia make continuity visible before exploring further. Only use when bridging genuinely prevents duplication or improves flow.
- "probe_followup": Use when more depth is needed. If overlap exists and bridging would help, the message should tell Alvia to acknowledge earlier discussion first.
- "suggest_next_question": Use when the topic is sufficiently covered and another probe would mostly repeat what has already been said. If RESERVED QUESTIONS is empty, use "none" instead and let Alvia wrap up naturally.
- "time_reminder": Use when the response is running long (>2 minutes active time or >400 words) and the best next move is to bring the topic toward a close. Exception: If RESERVED QUESTIONS is empty, do NOT suggest moving — use "none" and let Alvia wrap up naturally.
- "suggest_environment_check": Use when audio quality seems poor enough that normal probing is unreliable.
- "confirm_understanding": Use when transcription quality seems doubtful and Alvia should briefly check what she heard before moving on.
- "none": Use when no intervention would materially improve continuity, clarity, or flow.

GUIDANCE WRITING RULES:
- Write the single most useful next move for Alvia.
- When overlap exists and bridging would help, phrase guidance in an acknowledge-first way, such as: "briefly connect to what they said earlier about X, then explore Y".
- Prefer "acknowledge + missing angle" over "ask again from scratch".
- Name the missing angle, contradiction, ambiguity, or gap precisely.
- Be flexible. The respondent may say something new before Alvia uses the guidance.
- If a follow-up would overlap with a reserved topic, simply advise against it (e.g., "this will be covered later").
- Do not reveal analytics, prior interviews, or internal reasoning to the respondent.

Be conservative — only intervene when there's a clear benefit. Most of the time, "none" is appropriate. Remember, Alvia is having a voice conversation — it's normal not to cover every single aspect of the guidance for a question.

QUESTION QUALITY AWARENESS: If historical quality insights are present, use them to anticipate where probing, rephrasing, or warmer phrasing may help. Treat them as statistical priors, not assumptions about this respondent. Historical quality issues may not apply to this respondent; use live transcript evidence to override historical priors. Do not force interventions solely because a quality alert exists.

CROSS-INTERVIEW AWARENESS:
You may receive a snapshot of themes from prior interviews in the same collection. When present:
- Do not force these themes into the conversation.
- Treat cross-interview themes as hypotheses, not facts about this respondent.
- Prefer neutral phrasing such as "it may be useful to explore..." rather than asserting consensus.
- Avoid introducing bias or leading the respondent toward expected answers.
- If not clearly relevant to the current moment, ignore the cross-interview context entirely and continue with current-question guidance.

ANALYTICS-DRIVEN HYPOTHESIS TESTING:
You may receive hypotheses derived from project-level analytics. When present:
- Treat as optional probes. Only suggest testing when NATURALLY RELEVANT to current discussion.
- Hypotheses marked "relevant to current question" are best candidates. Others are background.
- Frame as curiosity, not leading questions. E.g., "it might be worth exploring whether..."
- NEVER reveal these came from analytics or prior interviews.
- NEVER force a hypothesis into conversation. If none are relevant, ignore entirely.
- Prefer probe_followup action. Include the hypothesis as a suggested probe direction.
- High-priority hypotheses preferred when multiple are relevant.
- Cross-interview themes take precedence if both are present.
`;
}
```

### Barbara User Prompt Layout Rewrite

For the user prompt in `server/barbara-orchestrator.ts:L681`.

The current layout puts metrics before earlier-discussion evidence. Reorder so the model sees continuity evidence first, metrics last. This is the single highest-impact, lowest-risk change in the proposal.

```typescript
  return `INTERVIEW CONTEXT:
Objective: ${input.templateObjective}
Tone: ${input.templateTone}

CURRENT DECISION:
1. Has the respondent already touched part of the CURRENT QUESTION earlier in the interview?
2. If yes, would bridging to that earlier thread genuinely prevent duplication or improve flow — or would a fresh answer be more valuable?
3. What is still missing, unclear, or worth deepening now?
4. Would probing risk overlap with a RESERVED QUESTION?
5. Is moving on, confirming understanding, or checking audio quality the better next move?

CURRENT QUESTION (Q${input.currentQuestionIndex + 1}):
"${input.currentQuestion.text}"

GUIDANCE FOR THIS QUESTION:
${input.currentQuestion.guidance || "No specific guidance provided."}

${summariesForCompletedQuestions ? `EARLIER QUESTIONS (summaries):\n${summariesForCompletedQuestions}\n\n` : ""}${summariesForRecentQuestions ? `RECENT QUESTIONS (summaries):\n${summariesForRecentQuestions}\n\n` : ""}RECENT TRANSCRIPT (current + previous ${RECENT_TRANSCRIPT_QUESTION_WINDOW} questions):
${recentTranscript || "(No transcript yet)"}

${previousQuestions ? `QUESTION LIST (completed):\n${previousQuestions}\n\n` : ""}${upcomingQuestions ? `RESERVED QUESTIONS (off limits to Alvia — do not reference these in guidance):\n${upcomingQuestions}\n` : ""}
METRICS FOR CURRENT QUESTION:
- Word count: ${wordCount}
- Active speaking time: ${activeTimeSeconds} seconds
- Number of turns: ${input.questionMetrics.turnCount}
- Follow-ups asked so far: ${input.questionMetrics.followUpCount}
- Recommended follow-up depth: ${input.questionMetrics.recommendedFollowUps !== null ? input.questionMetrics.recommendedFollowUps : "No limit set (use judgment)"}

${buildCrossInterviewSnapshotBlock(input)}${buildQuestionQualityInsightsBlock(input)}${buildAnalyticsHypothesesBlock(input)}
Based on this context, decide whether Alvia needs guidance. Optimise for continuity first (when bridging genuinely helps), then for completeness, then for efficiency. Respond in JSON.`;
```

**Key changes from current code:**
- Added CURRENT DECISION block that primes Barbara to think about continuity before reading the evidence, including the anti-leading question (#2).
- Moved EARLIER QUESTIONS and RECENT QUESTIONS summaries before RECENT TRANSCRIPT (earlier evidence first).
- Moved METRICS to the end (least important for continuity reasoning).
- Preserved all existing blocks: cross-interview snapshot, quality insights, analytics hypotheses.
- Added closing instruction that explicitly prioritises continuity > completeness > efficiency, with the qualifier "when bridging genuinely helps".

### Barbara Topic Overlap Prompt Rewrite

For the topic overlap system prompt in `server/barbara-orchestrator.ts:L754`.

The current prompt is functional but too neutral. Make it continuity-oriented and add the anti-leading nuance:

```
You analyze interview transcripts to detect topic overlap.

Given an upcoming question and prior context, decide whether the respondent has already addressed the same underlying topic earlier in the interview.

Your job is not only to detect duplicate wording. Your job is to detect whether Alvia should treat the next question as:
1. genuinely new,
2. a continuation of something already discussed, or
3. largely already covered.

Return JSON:
{
  "hasOverlap": boolean,
  "overlappingTopics": string[],
  "coverageLevel": "mentioned" | "partially_covered" | "fully_covered",
  "sourceQuestionIndex": number | null
}

RULES:
- Match meaning, not just keywords.
- Prefer concrete, speakable overlap topics that Alvia could naturally acknowledge aloud.
- Use "mentioned" when the topic came up briefly.
- Use "partially_covered" when Alvia should acknowledge the earlier discussion and ask only for the missing angle.
- Use "fully_covered" only when asking the upcoming question from scratch would likely feel repetitive.
- If there is no meaningful overlap, return hasOverlap=false.
- Note: Some questions intentionally revisit a theme from a different angle. If the upcoming question seems designed to elicit an independent perspective on a previously discussed topic, prefer "mentioned" over higher coverage levels to avoid over-bridging.
```

### Barbara AQ System Prompt Rewrite

For `buildAdditionalQuestionsSystemPrompt()` in `server/barbara-orchestrator.ts:L3297`.

Push AQ generation toward unfinished threads rather than disconnected new branches, while preserving the existing cross-interview and analytics hypothesis sections.

```typescript
function buildAdditionalQuestionsSystemPrompt(
  input: AdditionalQuestionsInput,
): string {
  const crossInterviewSection = input.crossInterviewContext?.enabled
    ? `
You also have access to summaries from prior interviews under the same template. Use these to:
- Identify themes that have emerged across multiple respondents that this respondent hasn't touched on
- Spot gaps in coverage compared to other participants
- Note any unique perspectives this respondent might be able to elaborate on`
    : "";

  const analyticsHypothesesSection = input.analyticsHypotheses?.length
    ? `
You also have access to project-level analytics hypotheses. Use these to:
- Generate questions that directly test high-priority hypotheses not yet explored in this interview
- Prioritise hypotheses that relate to gaps in the respondent's answers
- Frame hypothesis-testing questions conversationally — never reveal they came from analytics`
    : "";

  return `You are Barbara, an expert research interview analyst. Your task is to review a completed interview and determine whether there are any genuinely valuable additional questions to ask before the interview concludes.

CRITICAL RULES:
1. Do not repeat or rephrase any original template question.
2. Do not ask about topics that were already adequately covered.
3. Prefer questions that extend an unfinished thread the respondent already opened.
4. If a candidate question would feel like a disconnected new branch, reject it unless there is a major unanswered objective gap.
5. Additional questions must provide genuinely new value.
6. Questions must be open-ended, conversational, and easy for Alvia to ask naturally as part of the same conversation.
7. Maximum ${input.maxQuestions} additional question(s). Return fewer or zero if coverage is already strong.

WHEN TO SUGGEST QUESTIONS:
- A topic was mentioned earlier but only lightly explored
- The respondent hinted at an important tension, contradiction, or ambiguity that was never clarified
- A clear research objective gap remains
- A strategically important thread was opened but not developed
- A useful follow-on could sound like a continuation of something the respondent already said
${crossInterviewSection}${analyticsHypothesesSection}
${input.avoidRules?.length ? `\nTOPICS TO AVOID:\nThe following topics must not be addressed in additional questions:\n${input.avoidRules.map((r) => \`- \${r}\`).join("\\n")}\n` : ""}
WHEN TO RETURN ZERO QUESTIONS:
- The interview already covers the objective well
- The remaining options would mainly repeat earlier material
- Any new question would feel disconnected from the conversation so far
- The respondent showed fatigue or limited engagement
- Additional questioning would add little value

Respond with a JSON object containing:
{
  "noQuestionsNeeded": boolean,
  "reason": string,
  "questions": [
    {
      "questionText": string,
      "rationale": string
    }
  ]
}`;
}
```

### Barbara AQ User Prompt Update

For the closing instruction in `buildAdditionalQuestionsUserPrompt()` at `server/barbara-orchestrator.ts:L3454`.

Replace:

```
Based on this interview, identify up to ${input.maxQuestions} additional question(s) that would add genuine value, or indicate if no additional questions are needed.
```

with:

```
Based on this interview, first identify the most important unfinished threads or remaining objective gaps. Then decide whether any additional question would add genuine value by extending those threads. Prefer questions that continue something the respondent already opened rather than introducing a disconnected new topic. Return up to ${input.maxQuestions} question(s), or zero if coverage is already strong.
```

---

## What This Proposal Does NOT Change

These existing mechanisms are orthogonal to continuity and should be preserved as-is:

1. **`buildOverlapInstruction()`** (instructions.ts:L118) — Handles the question-transition moment when the respondent clicks Next Question. Still needed; operates at a different point in the flow than the continuity block.
2. **Eagerness mode / RESPONSE TIMING block** — Handles barge-in recovery for high-eagerness VAD. Unrelated to continuity.
3. **FOLLOW-UP DEPTH block** — Researcher-configured follow-up count guidance. Preserved in the live prompt.
4. **Cross-interview snapshot, quality insights, and analytics hypotheses blocks** — All preserved in both Barbara system and user prompts.
5. **ORCHESTRATOR MESSAGES block** — Preserved in all prompt types.
6. **STYLE POLICY block** — Preserved in all prompt types.

---

## Implementation Order

Ordered by dependency chain and risk profile (low-risk data quality improvements first, prompt rewrites after the data they depend on is in place):

### Phase 1: Data Quality (no prompt changes, no behavioral risk)

**1. Reorder Barbara user prompt**
- File: `server/barbara-orchestrator.ts` (~L681)
- Change: Move EARLIER QUESTIONS and RECENT QUESTIONS summaries before METRICS. Add CURRENT DECISION block with anti-leading question.
- Risk: Low. Same data, different order. Barbara may produce slightly better guidance immediately.

**2. Tighten `relevantToFutureQuestions` in question summary prompt**
- File: `server/barbara-orchestrator.ts` (~L906)
- Change: Update field description (cap at 0-3 cues, 15 words each) and add CALLBACK CUE GUIDANCE block.
- Risk: Low. Prompt-only change. New interviews produce better cues; existing data unaffected.

### Phase 2: Infrastructure (new code, no prompt changes yet)

**3. Build `buildContinuityContext()` function**
- File: `server/voice-interview/context-builders.ts`
- Change: New function that assembles relevance-filtered continuity cues from question summaries. AQ-safe. Hard-capped at 2 cues. Natural-language only (no internal labels).
- Risk: Low. New function, not yet called by any prompt. No cached state to manage.

### Phase 3: Prompt Rewrites (behavioral changes)

**4. Create shared `buildContinuityBlock()` and rewrite live Alvia prompt**
- File: `server/voice-interview/instructions.ts`
- Change: Add shared block function positioned after STEER, before INSTRUCTIONS. Restructure `buildInterviewInstructions()` to include continuity and anti-leading guardrail.
- Risk: Medium. This is the main behavioral change. Alvia will start referencing earlier discussion more frequently.

**5. Update resume and refresh prompts**
- File: `server/voice-interview/instructions.ts`
- Change: Insert `buildContinuityBlock(null)` (rules only, no cues) into `buildResumeInstructions()` and `buildRefreshInstructions()`. Replace numbered instruction lists with shorter versions.
- Risk: Low-medium. These paths are used less frequently (only on reconnection). Lighter continuity treatment avoids over-weighting old material.

**6. Rewrite Barbara system prompt**
- File: `server/barbara-orchestrator.ts`
- Change: Reframe around continuity-first decision making with anti-leading guardrail. Preserve cross-interview and analytics sections.
- Risk: Medium. Changes Barbara's reasoning priority on every utterance.

**7. Update topic overlap prompt**
- File: `server/barbara-orchestrator.ts`
- Change: Make continuity-oriented. Add anti-leading note about intentional angle-revisiting questions.
- Risk: Low. Prompt-only change to an existing detector.

**8. Update AQ prompts (Alvia + Barbara)**
- Files: `server/voice-interview.ts` (buildAQInstructions), `server/barbara-orchestrator.ts` (AQ system + user prompts)
- Change: Push AQ generation toward unfinished threads. Make AQ Alvia prompt explicitly build on earlier material with anti-leading guardrail.
- Risk: Low. AQs already have full transcript context; this makes the intent more explicit.

### Phase 4: Validation

**9. Run simulation-based before/after comparison**
- Use the persona simulation engine to run identical interview templates before and after the changes.
- **Quantitative metrics:**
  - Frequency of `acknowledge_prior` actions from Barbara
  - Whether Alvia's first utterance on each question references prior discussion
  - Follow-up count per question (should not increase dramatically)
  - Respondent engagement scores (should not decrease)
  - Verbatim quality in question summaries
  - Whether AQs feel like continuations vs disconnected branches
  - AQ generation rate (should not drop dramatically)
- **Over-acknowledgment check:** Flag any interview where Alvia says "you mentioned earlier", "as you said", "building on what you told me", or similar phrasing more than 3 times total.
- **Response freshness check (critical):** The biggest non-obvious regression is not "too many callbacks". It is that Alvia may sound more coherent while actually reducing response freshness by framing later questions through earlier answers too aggressively. To validate:
  - Compare the semantic diversity of respondent answers to questions that revisit a theme. If answers become more self-referential ("as I said before...") or narrower in scope after the change, the anti-leading guardrail needs strengthening.
  - Check whether respondent answers to later questions introduce genuinely new information at the same rate as before the change. A drop in novel content per question is a signal that continuity framing is leading.
  - Review questions where the template designer intentionally revisits a topic from a different angle — these are the highest-risk for over-bridging.

---

## Regression Risks and Mitigations

| Risk | Description | Mitigation |
|------|-------------|------------|
| Over-acknowledgment | Alvia says "as you mentioned earlier" on every turn, becoming repetitive | Continuity rule #7 explicitly warns against this. Monitor via simulation. |
| Response freshness loss | Alvia sounds more coherent but frames later questions through earlier answers, narrowing respondent perspective | Anti-leading guardrail in both Alvia (continuity rule #3) and Barbara (decision order #3). Validate with semantic diversity metrics. |
| Slower Barbara responses | Longer system prompt increases input tokens | Kept system prompt within ~500 tokens. Measure P95 latency before/after. |
| Cold-start empty blocks | Q1 has no earlier discussion; prominent empty block wastes prompt space | `buildContinuityContext()` returns `null` when empty; block omits the RELEVANT EARLIER DISCUSSION section. CONVERSATION CONTINUITY rules are still shown (they're compact). |
| Stale continuity cues | Cues derived from question summaries may reference topics no longer relevant mid-question | Cues are relevance-filtered against current question text. Hard-capped at 2. No cached overlap state to go stale. |
| Prompt size on rebuilds | `buildInterviewInstructions()` is rebuilt on guidance injection, env checks, VAD switches — not just question start | Cues capped at 2 (not 5). Continuity block is ~180 words. Measure token cost on hot path. |
| AQ phase crash | `buildContinuityContext()` accesses `state.questions[state.currentQuestionIndex]` beyond array bounds during AQ phase | Function uses the same AQ branching pattern as `buildResumeContext()`. Tested for both core and AQ phases. |
| Resume/refresh over-weighting | Adding continuity block on top of existing transcript summary over-weights old material | Resume/refresh use `buildContinuityBlock(null)` — rules only, no RELEVANT EARLIER DISCUSSION cues. |
| Internal labels leaking to speech | Cues like "Earlier (Q2) they mentioned..." could be mirrored by realtime model | `buildContinuityContext()` outputs natural-language only. No question numbers or internal identifiers. |
| AQ quality regression | Tighter "unfinished threads" framing causes Barbara to generate fewer AQs | The "WHEN TO SUGGEST QUESTIONS" list is broader than just threads. Zero AQs is an acceptable outcome when coverage is strong. Monitor AQ generation rate. |
| Cross-interview/analytics context dropped | Rewrite accidentally omits existing feature sections | Both sections explicitly preserved in all Barbara prompts. Verified against current code. |
