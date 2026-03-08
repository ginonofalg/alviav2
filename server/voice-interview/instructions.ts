import type { InterviewState } from "./types";
import type { TopicOverlapResult, QuestionSummary } from "../barbara-orchestrator";
import type { VadEagernessMode } from "@shared/types/performance-metrics";
import { buildContinuityContext } from "./context-builders";

const MAX_RECAP_QUESTION_TEXT_LENGTH = 80;
const MAX_RECAP_INSIGHTS_PER_QUESTION = 2;

export interface InterviewInstructionsOptions {
  template: any;
  currentQuestion: any;
  questionIndex: number;
  totalQuestions: number;
  barbaraGuidance?: string;
  respondentName?: string | null;
  allQuestions?: Array<{ questionText: string }>;
  followUpContext?: {
    followUpTurnCount: number;
    recommendedFollowUps: number | null;
  };
  strategicContext?: string | null;
  alviaHasSpokenOnCurrentQuestion?: boolean;
  eagernessMode?: VadEagernessMode;
  continuityContext?: string | null;
  questionSummaries?: QuestionSummary[];
}

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

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}

export function buildCompletedQuestionsRecap(
  questionSummaries: QuestionSummary[],
  currentQuestionIndex: number,
): string | null {
  const completed = questionSummaries.filter(
    (s) =>
      s != null &&
      s.questionIndex < currentQuestionIndex &&
      !s.isAdditionalQuestion,
  );

  if (completed.length === 0) return null;

  completed.sort((a, b) => a.questionIndex - b.questionIndex);

  const lines = completed.map((s) => {
    const qText = truncateText(s.questionText, MAX_RECAP_QUESTION_TEXT_LENGTH);
    const insights = Array.isArray(s.keyInsights) && s.keyInsights.length > 0
      ? ` Key points: ${s.keyInsights.slice(0, MAX_RECAP_INSIGHTS_PER_QUESTION).join("; ")}.`
      : "";
    const summary = s.respondentSummary || "No summary available.";
    return `Q${s.questionIndex + 1} ("${qText}"): ${summary}${insights}`;
  });

  return `COMPLETED QUESTIONS RECAP (what the respondent has already told you):
${lines.join("\n")}`;
}

export function buildInterviewInstructions(
  opts: InterviewInstructionsOptions,
): string {
  const {
    template,
    currentQuestion,
    questionIndex,
    totalQuestions,
    barbaraGuidance,
    respondentName,
    allQuestions,
    followUpContext,
    strategicContext,
    alviaHasSpokenOnCurrentQuestion,
    eagernessMode,
    continuityContext,
    questionSummaries,
  } = opts;

  const objective = template?.objective || "Conduct a thorough interview";
  const tone = template?.tone || "professional";
  const guidance = currentQuestion?.guidance || "";

  const nameContext = respondentName
    ? `The respondent's name is "${respondentName}". Only use their name once at the very beginning of the interview as a greeting. After that, do NOT use their name again, just continue the conversation naturally without addressing them by name.`
    : "The respondent has not provided their name. Address them in a friendly but general manner.";

  const upcomingQuestions = allQuestions
    ? allQuestions
        .slice(questionIndex + 1)
        .map((q) => `- ${q.questionText}`)
        .join("\n")
    : "";

  const recapBlock =
    questionSummaries && questionSummaries.length > 0
      ? buildCompletedQuestionsRecap(questionSummaries, questionIndex)
      : null;

  let instructions = `You are Alvia, a friendly and professional AI interviewer. Your role is to conduct a voice interview, in a Northern British accent. You are polite, encouraging, but also firm and challenge when necessary.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

RESPONDENT:
${nameContext}
${recapBlock ? `\n${recapBlock}\n` : ""}
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
You have made ${followUpContext.followUpTurnCount} follow-up turn${followUpContext.followUpTurnCount === 1 ? "" : "s"} so far on this question.
${followUpContext.followUpTurnCount > 0 && followUpContext.followUpTurnCount >= followUpContext.recommendedFollowUps
  ? "You have reached or exceeded the recommended depth. Unless the answer is clearly incomplete or contradictory, wrap up this question and guide the respondent toward the Next Question button."
  : "This is guidance, not a strict limit."}
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

  if (barbaraGuidance) {
    instructions += `

BARBARA'S GUIDANCE:
${barbaraGuidance}
Note: This guidance is based on analysis of the conversation up to a moment ago. The respondent may have said something new since then; incorporate this guidance naturally when appropriate, not necessarily immediately.`;
  }

  instructions += `

ORCHESTRATOR MESSAGES:
You will occasionally receive messages wrapped in [ORCHESTRATOR: ...] brackets. These are internal guidance from Barbara, your orchestrator. When you see these:
- DO NOT read them aloud or acknowledge receiving them
- DO NOT respond as if the respondent said them
- Simply follow the guidance naturally as if it were your own thought
- Seamlessly continue the conversation with the respondent
- The guidance may be based on a slightly earlier point in the conversation, use your judgment on timing

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return instructions;
}

export function buildOverlapInstruction(
  result: TopicOverlapResult,
  questionText: string,
): string {
  const topics = result.overlappingTopics.slice(0, 2).join(" and ");

  switch (result.coverageLevel) {
    case "fully_covered":
      return `The respondent already covered ${topics} thoroughly earlier. Briefly acknowledge this (e.g., "You've actually touched on this earlier - thank you for that") and then ask this question: "${questionText}"`;
    case "partially_covered":
      return `The respondent touched on ${topics} earlier. Briefly acknowledge this connection (e.g., "This builds on what you mentioned earlier") and then ask this question: "${questionText}"`;
    case "mentioned":
    default:
      return `The respondent mentioned ${topics} earlier. Briefly acknowledge this, then ask this question: "${questionText}"`;
  }
}

interface ResumeContext {
  objective: string;
  tone: string;
  questionIndex: number;
  totalQuestions: number;
  respondentName: string | null;
  transcriptSummary: string;
  currentQuestionText: string;
  status: string;
  barbaraSuggestedMoveOn: boolean;
  guidance: string;
  recommendedFollowUps: number | null;
  followUpTurnCount: number;
  upcomingQuestions: string;
  lastBarbaraGuidance: string | undefined;
  questionSummaries: QuestionSummary[];
}

function buildResumeContext(state: InterviewState): ResumeContext {
  const template = state.template;
  const isAQ = state.isInAdditionalQuestionsPhase;

  const recentTranscript = state.transcriptLog.slice(-15);
  const transcriptSummary = recentTranscript
    .map((entry) => `[${entry.speaker.toUpperCase()}]: ${entry.text}`)
    .join("\n");

  const validSummaries = state.questionSummaries.filter(
    (s) => s != null,
  ) as QuestionSummary[];

  if (isAQ && state.additionalQuestions.length > 0) {
    const aqIndex = state.currentAdditionalQuestionIndex;
    const aqQuestion = state.additionalQuestions[aqIndex];
    const totalAQ = state.additionalQuestions.length;
    const coreCount = state.questions.length;

    const questionState = state.questionStates.find(
      (qs) => qs.questionIndex === coreCount + aqIndex,
    );

    return {
      objective: template?.objective || "Conduct a thorough interview",
      tone: template?.tone || "professional",
      questionIndex: coreCount + aqIndex,
      totalQuestions: coreCount + totalAQ,
      respondentName: state.respondentInformalName,
      transcriptSummary,
      currentQuestionText:
        aqQuestion?.questionText || "Please share your thoughts.",
      status: questionState?.status || "in_progress",
      barbaraSuggestedMoveOn: questionState?.barbaraSuggestedMoveOn || false,
      guidance: "",
      recommendedFollowUps: null,
      followUpTurnCount: 0,
      upcomingQuestions: state.additionalQuestions
        .slice(aqIndex + 1)
        .map((q) => `- ${q.questionText}`)
        .join("\n"),
      lastBarbaraGuidance: state.lastBarbaraGuidance?.message,
      questionSummaries: validSummaries,
    };
  }

  const currentQuestion = state.questions[state.currentQuestionIndex];
  const questionIndex = state.currentQuestionIndex;
  const totalQuestions = state.questions.length;

  const questionState = state.questionStates.find(
    (qs) => qs.questionIndex === questionIndex,
  );

  return {
    objective: template?.objective || "Conduct a thorough interview",
    tone: template?.tone || "professional",
    questionIndex,
    totalQuestions,
    respondentName: state.respondentInformalName,
    transcriptSummary,
    currentQuestionText:
      currentQuestion?.questionText || "Please share your thoughts.",
    status: questionState?.status || "in_progress",
    barbaraSuggestedMoveOn: questionState?.barbaraSuggestedMoveOn || false,
    guidance: currentQuestion?.guidance || "",
    recommendedFollowUps:
      currentQuestion?.recommendedFollowUps ??
      state.template?.defaultRecommendedFollowUps ??
      null,
    followUpTurnCount:
      state.questionMetrics.get(state.currentQuestionIndex)?.followUpTurnCount ?? 0,
    upcomingQuestions: state.questions
      .slice(questionIndex + 1)
      .map((q) => `- ${q.questionText}`)
      .join("\n"),
    lastBarbaraGuidance: state.lastBarbaraGuidance?.message,
    questionSummaries: validSummaries,
  };
}

function buildSharedContextBlock(ctx: ResumeContext): string {
  const nameContext = ctx.respondentName
    ? `The respondent's name is "${ctx.respondentName}". Do NOT overuse their name — use it at most once, then continue naturally.`
    : "The respondent has not provided their name. Address them in a friendly but general manner.";

  let block = `
INTERVIEW CONTEXT:
- Objective: ${ctx.objective}
- Tone: ${ctx.tone}
- Current Question: ${ctx.questionIndex + 1} of ${ctx.totalQuestions}

RESPONDENT:
${nameContext}

TRANSCRIPT SUMMARY (recent conversation):
${ctx.transcriptSummary || "(No previous conversation recorded)"}`;

  const recap = buildCompletedQuestionsRecap(
    ctx.questionSummaries,
    ctx.questionIndex,
  );
  if (recap) {
    block += `

${recap}`;
  }

  block += `

CURRENT QUESTION: "${ctx.currentQuestionText}"
QUESTION STATUS: ${ctx.status}

STEER FOR THIS QUESTION:
${ctx.guidance || "Listen carefully and probe for more details when appropriate."}`;

  if (
    ctx.recommendedFollowUps !== null &&
    ctx.recommendedFollowUps !== undefined
  ) {
    block += `
FOLLOW-UP DEPTH:
The researcher recommends approximately ${ctx.recommendedFollowUps} follow-up probe${ctx.recommendedFollowUps === 1 ? "" : "s"} for this question.
You have made ${ctx.followUpTurnCount} follow-up turn${ctx.followUpTurnCount === 1 ? "" : "s"} so far on this question.
${ctx.followUpTurnCount > 0 && ctx.followUpTurnCount >= ctx.recommendedFollowUps
  ? "You have reached or exceeded the recommended depth. Unless the answer is clearly incomplete or contradictory, wrap up this question and guide the respondent toward the Next Question button."
  : "This is guidance, not a strict limit."}
`;
  }

  if (ctx.upcomingQuestions) {
    block += `
RESERVED QUESTIONS (these are off limits — do not ask or reference any of these):
${ctx.upcomingQuestions}
`;
  }

  return block;
}

function buildSharedFooter(ctx: ResumeContext, guidanceNote: string): string {
  let footer = `
STYLE POLICY (IMPORTANT):
- USE British English, varied sentence length.`;

  if (ctx.lastBarbaraGuidance) {
    footer += `

BARBARA'S GUIDANCE:
${ctx.lastBarbaraGuidance}
${guidanceNote}`;
  }

  footer += `

ORCHESTRATOR MESSAGES:
You will occasionally receive messages wrapped in [ORCHESTRATOR: ...] brackets. These are internal guidance from Barbara, your orchestrator. When you see these:
- DO NOT read them aloud or acknowledge receiving them
- DO NOT respond as if the respondent said them
- Simply follow the guidance naturally as if it were your own thought
- Seamlessly continue the conversation with the respondent
- The guidance may be based on a slightly earlier point in the conversation, use your judgment on timing

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return footer;
}

export function buildResumeInstructions(state: InterviewState): string {
  const ctx = buildResumeContext(state);

  let instructions = `You are Alvia, a friendly and professional AI interviewer. This interview is RESUMING after a connection interruption. Your role is to conduct a voice interview, in a Northern British accent. You are polite, encouraging, but also firm and challenge when necessary.`;

  instructions += buildSharedContextBlock(ctx);

  if (ctx.barbaraSuggestedMoveOn) {
    instructions += `
NOTE: Before the interruption, the respondent had given a comprehensive answer and you offered to move to the next question.
`;
  }

  instructions += `
${buildContinuityBlock(buildContinuityContext(state))}

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

export function buildRefreshInstructions(state: InterviewState): string {
  const ctx = buildResumeContext(state);

  let instructions = `You are Alvia, a friendly and professional AI interviewer conducting a voice interview in a Northern British accent. You are polite, encouraging, but also firm and challenge when necessary.`;

  instructions += buildSharedContextBlock(ctx);

  instructions += `
${buildContinuityBlock(buildContinuityContext(state))}

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
