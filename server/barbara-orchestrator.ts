import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import type { BarbaraSessionSummary } from "@shared/schema";
import { withTrackedLlmCall, makeBarbaraUsageExtractor, type TrackedLlmResult } from "./llm-usage";
import type { LLMUsageAttribution, NormalizedTokenUsage, LLMUsageStatus, LLMUseCase } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Barbara configuration types
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";
export type Verbosity = "low" | "medium" | "high";

// Allowed models for Barbara use cases
export const ALLOWED_MODELS = [
  "gpt-5-mini",
  "gpt-5",
  "gpt-4o",
  "gpt-4o-mini",
  "o1",
  "o1-mini",
  "o1-pro",
  "o3-mini",
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export interface BarbaraUseCaseConfig {
  model: AllowedModel;
  verbosity: Verbosity;
  reasoningEffort: ReasoningEffort;
}

export interface BarbaraConfig {
  analysis: BarbaraUseCaseConfig;
  topicOverlap: BarbaraUseCaseConfig;
  summarisation: BarbaraUseCaseConfig;
  templateAnalytics: BarbaraUseCaseConfig;
  projectAnalytics: BarbaraUseCaseConfig;
  templateGeneration: BarbaraUseCaseConfig;
  additionalQuestions: BarbaraUseCaseConfig;
  sessionSummary: BarbaraUseCaseConfig;
}

// Default configuration - can be updated at runtime
const barbaraConfig: BarbaraConfig = {
  analysis: {
    model: "gpt-5-mini",
    verbosity: "low",
    reasoningEffort: "minimal",
  },
  topicOverlap: {
    model: "gpt-5-mini",
    verbosity: "low",
    reasoningEffort: "minimal",
  },
  summarisation: {
    model: "gpt-5-mini",
    verbosity: "low",
    reasoningEffort: "low",
  },
  templateAnalytics: {
    model: "gpt-5-mini",
    verbosity: "medium",
    reasoningEffort: "low",
  },
  projectAnalytics: {
    model: "gpt-5",
    verbosity: "medium",
    reasoningEffort: "medium",
  },
  templateGeneration: {
    model: "gpt-5",
    verbosity: "low",
    reasoningEffort: "low",
  },
  additionalQuestions: {
    model: "gpt-5",
    verbosity: "low",
    reasoningEffort: "low",
  },
  sessionSummary: {
    model: "gpt-5-mini",
    verbosity: "medium",
    reasoningEffort: "low",
  },
};

// Getters and setters for Barbara configuration
export function getBarbaraConfig(): BarbaraConfig {
  return { ...barbaraConfig };
}

export function updateBarbaraConfig(
  updates: Partial<BarbaraConfig>,
): BarbaraConfig {
  if (updates.analysis) {
    Object.assign(barbaraConfig.analysis, updates.analysis);
  }
  if (updates.topicOverlap) {
    Object.assign(barbaraConfig.topicOverlap, updates.topicOverlap);
  }
  if (updates.summarisation) {
    Object.assign(barbaraConfig.summarisation, updates.summarisation);
  }
  if (updates.templateAnalytics) {
    Object.assign(barbaraConfig.templateAnalytics, updates.templateAnalytics);
  }
  if (updates.projectAnalytics) {
    Object.assign(barbaraConfig.projectAnalytics, updates.projectAnalytics);
  }
  if (updates.templateGeneration) {
    Object.assign(barbaraConfig.templateGeneration, updates.templateGeneration);
  }
  if (updates.additionalQuestions) {
    Object.assign(
      barbaraConfig.additionalQuestions,
      updates.additionalQuestions,
    );
  }
  if (updates.sessionSummary) {
    Object.assign(barbaraConfig.sessionSummary, updates.sessionSummary);
  }
  return getBarbaraConfig();
}

export function updateAnalysisConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.analysis, config);
  return { ...barbaraConfig.analysis };
}

export function updateTopicOverlapConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.topicOverlap, config);
  return { ...barbaraConfig.topicOverlap };
}

export function updateSummarisationConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.summarisation, config);
  return { ...barbaraConfig.summarisation };
}

export function updateTemplateAnalyticsConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.templateAnalytics, config);
  return { ...barbaraConfig.templateAnalytics };
}

export function updateProjectAnalyticsConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.projectAnalytics, config);
  return { ...barbaraConfig.projectAnalytics };
}

export function updateAdditionalQuestionsConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.additionalQuestions, config);
  return { ...barbaraConfig.additionalQuestions };
}

export function updateSessionSummaryConfig(
  config: Partial<BarbaraUseCaseConfig>,
): BarbaraUseCaseConfig {
  Object.assign(barbaraConfig.sessionSummary, config);
  return { ...barbaraConfig.sessionSummary };
}

export interface TranscriptEntry {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
  questionIndex: number;
  interrupted?: boolean;
}

export interface QuestionMetrics {
  questionIndex: number;
  wordCount: number;
  activeTimeMs: number;
  turnCount: number;
  startedAt: number | null;
  followUpCount: number;
  recommendedFollowUps: number | null;
}

export interface BarbaraGuidance {
  action:
    | "acknowledge_prior"
    | "probe_followup"
    | "suggest_next_question"
    | "time_reminder"
    | "suggest_environment_check"
    | "confirm_understanding"
    | "none";
  message: string;
  confidence: number;
  reasoning: string;
}

type CompactCrossInterviewTheme = {
  theme: string;
  prevalence: number;
  cue: string;
};

export interface BarbaraAnalysisInput {
  transcriptLog: TranscriptEntry[];
  previousQuestionSummaries: QuestionSummary[];
  currentQuestionIndex: number;
  currentQuestion: {
    text: string;
    guidance: string;
  };
  allQuestions: Array<{
    text: string;
    guidance: string;
  }>;
  questionMetrics: QuestionMetrics;
  templateObjective: string;
  templateTone: string;
  crossInterviewContext?: {
    priorSessionCount: number;
    snapshotGeneratedAt: number | null;
    questionThemes: CompactCrossInterviewTheme[];
    emergentThemes: CompactCrossInterviewTheme[];
    currentQuestionQuality?: {
      questionIndex: number;
      responseCount: number;
      avgQualityScore: number;
      responseRichness: "brief" | "moderate" | "detailed";
      avgWordCount: number;
      topFlags: Array<{ flag: QualityFlag; count: number }>;
      perspectiveRange: "narrow" | "moderate" | "diverse";
    };
    upcomingQualityAlerts?: Array<{
      questionIndex: number;
      responseCount: number;
      avgQualityScore: number;
      responseRichness: "brief" | "moderate" | "detailed";
      avgWordCount: number;
      topFlags: Array<{ flag: QualityFlag; count: number }>;
      perspectiveRange: "narrow" | "moderate" | "diverse";
    }>;
  };
  analyticsHypotheses?: {
    totalProjectSessions: number;
    analyticsGeneratedAt: number | null;
    hypotheses: Array<{
      hypothesis: string;
      source: string;
      priority: string;
      isCurrentQuestionRelevant: boolean;
    }>;
  };
}

export async function analyzeWithBarbara(
  input: BarbaraAnalysisInput,
  usageContext?: LLMUsageAttribution,
): Promise<BarbaraGuidance> {
  try {
    const systemPrompt = buildBarbaraSystemPrompt();
    const userPrompt = buildBarbaraUserPrompt(input);

    const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    console.log(
      `[Barbara] Prompt estimate: ~${estimatedInputTokens} input tokens (system: ${systemPrompt.length} chars, user: ${userPrompt.length} chars)`,
    );

    if (process.env.DEBUG_BARBARA_PROMPTS === "true") {
      console.log("[Barbara][DEBUG] ===== SYSTEM PROMPT =====");
      console.log(systemPrompt);
      console.log("[Barbara][DEBUG] ===== USER PROMPT =====");
      console.log(userPrompt);
      console.log("[Barbara][DEBUG] ===== END PROMPTS =====");
    }

    const config = barbaraConfig.analysis;
    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_analysis",
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 500,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<
          typeof openai.chat.completions.create
        >[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    if (response.usage) {
      console.log(
        `[Barbara] Actual usage: ${response.usage.prompt_tokens} input, ${response.usage.completion_tokens} output tokens`,
      );
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        action: "none",
        message: "",
        confidence: 0,
        reasoning: "No response from Barbara",
      };
    }

    const parsed = JSON.parse(content);
    return {
      action: parsed.action || "none",
      message: parsed.message || "",
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || "",
    };
  } catch (error) {
    console.error("[Barbara] Error analyzing:", error);
    return {
      action: "none",
      message: "",
      confidence: 0,
      reasoning: "Error during analysis",
    };
  }
}

function buildBarbaraSystemPrompt(): string {
  return `You are Barbara, an intelligent interview orchestrator. Your role is to monitor voice interviews conducted by Alvia (the AI interviewer) and provide guidance to help her navigate the interview.

IMPORTANT TIMING: Your guidance will be incorporated into Alvia's NEXT response, not her current one (while she's talking). The conversation continues while you analyze, so phrase your guidance to remain relevant even if the respondent says something else in the meantime.

Your responsibilities:
1. PRIOR CONTEXT DETECTION: Check if the respondent has already addressed parts of the current question earlier — using question summaries for older questions and the recent transcript for nearby questions. If so, Alvia should acknowledge this.
2. COMPLETENESS EVALUATION: Assess whether the respondent's answer to the current question is comprehensive based on the question's guidance criteria. If complete, suggest offering to move to the next question.
3. TIME/LENGTH MONITORING: If the response is running long (>2 minutes active time or >400 words), consider suggesting a move to the next question.
4. QUESTION DEDUPLICATION: Review the UPCOMING QUESTIONS list. Don't encourage Alvia to ask a follow-up that overlaps with a future template question. This prevents repetitive questioning and maintains interview flow.
5. FOLLOW-UP DEPTH GUIDANCE: When a recommended follow-up depth is specified, use it to guide your decisions:
   - If follow-ups are at or above the recommended depth AND the answer has reasonable substance, prefer "suggest_next_question" over "probe_followup"
   - If follow-ups are 1 below the recommended depth, only suggest probing if the answer is clearly incomplete
   - If no recommendation is set, rely on your judgment of answer completeness
   - This is soft guidance, not a hard limit - exceptionally thin answers still warrant additional probing

You must respond with a JSON object containing:
{
  "action": "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "suggest_environment_check" | "confirm_understanding" | "none",
  "message": "A brief, natural instruction for Alvia (max 100 words)",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your decision"
}

Action meanings:
- "acknowledge_prior": The respondent mentioned something relevant earlier - remind Alvia to acknowledge this when appropriate
- "probe_followup": The answer lacks depth - suggest a specific follow-up probe for when the opportunity arises.
- "suggest_next_question": The answer appears complete or appears to be reaching a conclusion - Alvia should offer to move on when there's a natural pause
- "time_reminder": The response is running long - suggest moving the next question gracefully
- "suggest_environment_check": Audio quality appears poor (fragmented responses, unclear transcription) - Alvia should politely ask the respondent to move to a quieter location or speak closer to the microphone
- "confirm_understanding": Quality signals suggest potential transcription issues - before moving on, Alvia should briefly summarize what she heard and confirm it's correct
- "none": No intervention needed - let the conversation flow naturally

Be conservative - only intervene when there's a clear benefit. Most of the time, "none" is appropriate. Phrase guidance flexibly since the conversation may have progressed by the time Alvia uses it.

IMPORTANT: Remember, Alvia is having a voice conversation with the respondent. It's normal not to cover every single aspect of the Guidance for This Question. Use judgement to determine when to intervene and suggest moving to the next question.

6. QUESTION QUALITY AWARENESS: If historical quality insights are present, use them to anticipate where probing, rephrasing, or warmer phrasing may help. Treat them as statistical priors, not assumptions about this respondent.

CROSS-INTERVIEW AWARENESS:
You may receive a snapshot of themes from prior interviews in the same collection. When present:
- Do not force these themes into the conversation.
- Treat cross-interview themes as hypotheses, not facts about this respondent.
- Prefer neutral phrasing such as "it may be useful to explore..." rather than asserting consensus.
- Avoid introducing bias or leading the respondent toward expected answers.
- If not clearly relevant to the current moment, ignore the cross-interview context entirely and continue with current-question guidance.
- Historical quality issues may not apply to this respondent. Use live transcript evidence to override historical priors.
- Do not force interventions solely because a quality alert exists.

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

function buildCrossInterviewSnapshotBlock(input: BarbaraAnalysisInput): string {
  const ctx = input.crossInterviewContext;
  if (!ctx || (ctx.questionThemes.length === 0 && ctx.emergentThemes.length === 0)) {
    return "";
  }

  const lines: string[] = [
    "",
    "CROSS-INTERVIEW SNAPSHOT (same collection):",
    `- Source: collection analytics snapshot (${ctx.priorSessionCount} prior sessions)`,
    `- Snapshot generated at: ${ctx.snapshotGeneratedAt ? new Date(ctx.snapshotGeneratedAt).toISOString() : "unknown"}`,
  ];

  if (ctx.questionThemes.length > 0) {
    lines.push("Themes most relevant to CURRENT QUESTION:");
    for (const t of ctx.questionThemes) {
      lines.push(`  - Theme: ${t.theme} (prevalence: ${t.prevalence}%) — ${t.cue}`);
    }
  }

  if (ctx.emergentThemes.length > 0) {
    lines.push("Emergent themes from prior interviews:");
    for (const t of ctx.emergentThemes) {
      lines.push(`  - Theme: ${t.theme} (prevalence: ${t.prevalence}%) — ${t.cue}`);
    }
  }

  lines.push("Instruction: If not clearly relevant, ignore this snapshot and continue with current-question guidance.");
  lines.push("");

  return lines.join("\n");
}

const MAX_UPCOMING_QUALITY_ALERTS = 3;

function buildQuestionQualityInsightsBlock(input: BarbaraAnalysisInput): string {
  const ctx = input.crossInterviewContext;
  if (!ctx) return "";

  const current = ctx.currentQuestionQuality;
  const upcoming = ctx.upcomingQualityAlerts;

  if (!current && (!upcoming || upcoming.length === 0)) return "";

  const FLAG_CORRECTIVE_GUIDANCE: Record<QualityFlag, string> = {
    incomplete: "Encourage elaboration — e.g. 'Can you tell me more about that?' or 'What else comes to mind?'",
    low_engagement: "Try a warmer, more conversational tone; reframe the question around personal experience rather than abstract opinion.",
    ambiguous: "Ask clarifying follow-ups to ground the response in specifics — e.g. 'Could you give me an example?'",
    off_topic: "Gently redirect back to the question's core intent without dismissing what the respondent shared.",
    distress_cue: "Acknowledge the respondent's feelings before proceeding — e.g. 'I appreciate you sharing that.'",
    contradiction: "Ask the respondent to clarify the differences in their statements; invite them to walk through their reasoning.",
  };

  const formatFlags = (flags: Array<{ flag: QualityFlag; count: number }>): string =>
    flags.map((f) => `${f.flag}\u00d7${f.count}`).join(", ");

  const MAX_FLAG_GUIDANCE_LINES = 3;

  const buildFlagGuidance = (flags: Array<{ flag: QualityFlag; count: number }>): string[] => {
    if (flags.length === 0) return [];
    return flags
      .filter((f) => FLAG_CORRECTIVE_GUIDANCE[f.flag])
      .slice(0, MAX_FLAG_GUIDANCE_LINES)
      .map((f) => `  → ${f.flag}: ${FLAG_CORRECTIVE_GUIDANCE[f.flag]}`);
  };

  const formatAlert = (q: NonNullable<typeof current>, prefix: string): string => {
    const parts = [`${prefix} (n=${q.responseCount}): quality ${q.avgQualityScore}/100`];
    parts.push(`richness ${q.responseRichness} (${q.avgWordCount} words)`);
    if (q.topFlags.length > 0) {
      parts.push(`flags ${formatFlags(q.topFlags)}`);
    }
    if (q.perspectiveRange === "narrow") {
      parts.push("perspective narrow");
    }
    return parts.join("; ") + ".";
  };

  const lines: string[] = [
    "",
    "QUESTION QUALITY INSIGHTS (prior interviews, same collection):",
  ];

  if (current) {
    lines.push(formatAlert(current, `CURRENT Q${current.questionIndex + 1}`));
    const flagGuidance = buildFlagGuidance(current.topFlags);
    if (flagGuidance.length > 0) {
      lines.push("Recommended corrective strategies:");
      lines.push(...flagGuidance);
    }
    if (current.perspectiveRange === "narrow") {
      lines.push("  → narrow perspective: Encourage the respondent to consider alternative viewpoints or contexts.");
    }
    if (current.responseRichness === "brief") {
      lines.push("  → brief responses: Allow longer pauses before moving on; use prompts like 'Take your time' to invite deeper reflection.");
    }
  }

  if (upcoming && upcoming.length > 0) {
    lines.push("UPCOMING ALERTS:");
    for (const q of upcoming.slice(0, MAX_UPCOMING_QUALITY_ALERTS)) {
      lines.push(`- ${formatAlert(q, `Q${q.questionIndex + 1}`)}`);
    }
  }

  lines.push("Note: Historical patterns only. Prioritize this respondent's live signals.");
  lines.push("");

  return lines.join("\n");
}

const MAX_BACKGROUND_HYPOTHESES = 3;

function buildAnalyticsHypothesesBlock(input: BarbaraAnalysisInput): string {
  const ctx = input.analyticsHypotheses;
  if (!ctx || ctx.hypotheses.length === 0) return "";

  const relevant = ctx.hypotheses.filter((h) => h.isCurrentQuestionRelevant);
  const background = ctx.hypotheses
    .filter((h) => !h.isCurrentQuestionRelevant)
    .slice(0, MAX_BACKGROUND_HYPOTHESES);

  if (relevant.length === 0 && background.length === 0) return "";

  const lines: string[] = [
    "",
    "ANALYTICS HYPOTHESES (project-level, for optional probing):",
    `- Source: project analytics (${ctx.totalProjectSessions} sessions across project)`,
  ];

  if (relevant.length > 0) {
    lines.push("Relevant to CURRENT QUESTION:");
    for (const h of relevant) {
      lines.push(`  - [${h.priority}] ${h.hypothesis}`);
    }
  }

  if (background.length > 0) {
    lines.push("Background (use only if conversation naturally leads there):");
    for (const h of background) {
      lines.push(`  - [${h.priority}] ${h.hypothesis}`);
    }
  }

  lines.push("");

  return lines.join("\n");
}

const RECENT_TRANSCRIPT_QUESTION_WINDOW = 2;

function buildBarbaraUserPrompt(input: BarbaraAnalysisInput): string {
  const recentWindowStart = Math.max(0, input.currentQuestionIndex - RECENT_TRANSCRIPT_QUESTION_WINDOW);
  const recentTranscript = input.transcriptLog
    .filter((entry) => entry.questionIndex >= recentWindowStart)
    .map(
      (entry) =>
        `[${entry.speaker.toUpperCase()}] (Q${entry.questionIndex + 1}): ${entry.text}`,
    )
    .join("\n");

  const previousQuestions = input.allQuestions
    .slice(0, input.currentQuestionIndex)
    .map((q, i) => `Q${i + 1}: ${q.text}`)
    .join("\n");

  const upcomingQuestions = input.allQuestions
    .slice(input.currentQuestionIndex + 1)
    .map((q, i) => `Q${input.currentQuestionIndex + 2 + i}: ${q.text}`)
    .join("\n");

  const currentQuestionResponses = input.transcriptLog
    .filter(
      (e) =>
        e.questionIndex === input.currentQuestionIndex &&
        e.speaker === "respondent",
    )
    .map((e) => e.text)
    .join(" ");

  const wordCount = currentQuestionResponses
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const activeTimeSeconds = Math.round(
    input.questionMetrics.activeTimeMs / 1000,
  );

  const summariesForCompletedQuestions = input.previousQuestionSummaries
    .filter((s) => s && s.questionIndex < recentWindowStart)
    .map(
      (s) => `Q${s.questionIndex + 1}: ${s.questionText}
  Response Summary: ${s.respondentSummary}
  Key Insights: ${s.keyInsights.join("; ")}
  Completeness: ${s.completenessAssessment}`,
    )
    .join("\n\n");

  const summariesForRecentQuestions = input.previousQuestionSummaries
    .filter((s) => s && s.questionIndex >= recentWindowStart && s.questionIndex < input.currentQuestionIndex)
    .map(
      (s) => `Q${s.questionIndex + 1}: ${s.questionText}
  Response Summary: ${s.respondentSummary}
  Key Insights: ${s.keyInsights.join("; ")}
  Completeness: ${s.completenessAssessment}`,
    )
    .join("\n\n");

  return `INTERVIEW CONTEXT:
Objective: ${input.templateObjective}
Tone: ${input.templateTone}

CURRENT QUESTION (Q${input.currentQuestionIndex + 1}):
"${input.currentQuestion.text}"

GUIDANCE FOR THIS QUESTION:
${input.currentQuestion.guidance || "No specific guidance provided."}

METRICS FOR CURRENT QUESTION:
- Word count: ${wordCount}
- Active speaking time: ${activeTimeSeconds} seconds
- Number of turns: ${input.questionMetrics.turnCount}
- Follow-ups asked so far: ${input.questionMetrics.followUpCount}
- Recommended follow-up depth: ${input.questionMetrics.recommendedFollowUps !== null ? input.questionMetrics.recommendedFollowUps : "No limit set (use judgment)"}

${summariesForCompletedQuestions ? `EARLIER QUESTIONS (summaries):\n${summariesForCompletedQuestions}\n\n` : ""}${summariesForRecentQuestions ? `RECENT QUESTIONS (summaries):\n${summariesForRecentQuestions}\n\n` : ""}${previousQuestions ? `QUESTION LIST (completed):\n${previousQuestions}\n\n` : ""}${upcomingQuestions ? `UPCOMING QUESTIONS (avoid asking follow-ups that overlap with these):\n${upcomingQuestions}\n` : ""}
RECENT TRANSCRIPT (current + previous ${RECENT_TRANSCRIPT_QUESTION_WINDOW} questions):
${recentTranscript || "(No transcript yet)"}

RESPONDENT'S ANSWER TO CURRENT QUESTION:
${currentQuestionResponses || "(No response yet)"}
${buildCrossInterviewSnapshotBlock(input)}${buildQuestionQualityInsightsBlock(input)}${buildAnalyticsHypothesesBlock(input)}
Based on this context, should Alvia receive any guidance? Respond with your analysis in JSON format.`;
}

export function createEmptyMetrics(
  questionIndex: number,
  recommendedFollowUps?: number | null,
): QuestionMetrics {
  return {
    questionIndex,
    wordCount: 0,
    activeTimeMs: 0,
    turnCount: 0,
    startedAt: null,
    followUpCount: 0,
    recommendedFollowUps: recommendedFollowUps ?? null,
  };
}

import type { QuestionSummary, QualityFlag } from "@shared/schema";
export type { QuestionSummary };

export interface TopicOverlapResult {
  hasOverlap: boolean;
  overlappingTopics: string[];
  coverageLevel: "mentioned" | "partially_covered" | "fully_covered";
  sourceQuestionIndex: number | null;
}

const SUMMARY_TIMEOUT_MS = 45000;
const TOPIC_OVERLAP_TIMEOUT_MS = 10001;

export async function detectTopicOverlap(
  upcomingQuestionText: string,
  completedSummaries: QuestionSummary[],
  recentTranscript: TranscriptEntry[],
  usageContext?: LLMUsageAttribution,
): Promise<TopicOverlapResult | null> {
  const hasCompletedSummaries = completedSummaries.length > 0;
  const hasRecentTranscript = recentTranscript.length > 0;

  if (!hasCompletedSummaries && !hasRecentTranscript) {
    console.log("[TopicOverlap] Skipping - no context available");
    return null;
  }

  const startTime = Date.now();
  console.log(
    `[TopicOverlap] Starting detection with ${completedSummaries.length} summaries, ${recentTranscript.length} transcript entries`,
  );

  try {
    const systemPrompt = `You analyze interview transcripts to detect topic overlap.
Given an upcoming question and prior context (summaries and/or recent statements), determine if the respondent has already addressed the topic.

Return JSON:
{
  "hasOverlap": boolean,
  "overlappingTopics": string[], // 1-3 specific topics that overlap
  "coverageLevel": "mentioned" | "partially_covered" | "fully_covered",
  "sourceQuestionIndex": number | null // 0-based index, or null if from recent transcript
}

Coverage levels:
- "mentioned": Topic came up briefly but wasn't explored
- "partially_covered": Some aspects discussed but room for more depth
- "fully_covered": Topic was thoroughly addressed

If no meaningful overlap, return { "hasOverlap": false, "overlappingTopics": [], "coverageLevel": "mentioned", "sourceQuestionIndex": null }`;

    const summaryContext = completedSummaries
      .filter(
        (s) =>
          s.relevantToFutureQuestions && s.relevantToFutureQuestions.length > 0,
      )
      .map(
        (s) =>
          `Q${s.questionIndex + 1} ("${s.questionText}"):\n  Topics: ${s.relevantToFutureQuestions.join(", ")}\n  Summary: ${s.respondentSummary}`,
      )
      .join("\n\n");

    const transcriptContext = recentTranscript
      .map((e) => `- "${e.text}"`)
      .join("\n");

    const userPrompt = `UPCOMING QUESTION:
"${upcomingQuestionText}"

${summaryContext ? `PRIOR QUESTION SUMMARIES:\n${summaryContext}\n` : ""}
${transcriptContext ? `RECENT STATEMENTS FROM LAST QUESTION:\n${transcriptContext}` : ""}

Does the upcoming question's topic overlap with what the respondent has already discussed?`;

    const config = barbaraConfig.topicOverlap;
    const promptLength = systemPrompt.length + userPrompt.length;
    console.log(
      `[TopicOverlap] Calling OpenAI (model: ${config.model}, prompt: ${promptLength} chars)`,
    );

    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_topic_overlap",
      timeoutMs: TOPIC_OVERLAP_TIMEOUT_MS,
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 200,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<typeof openai.chat.completions.create>[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    const elapsed = Date.now() - startTime;

    if (!response || !("choices" in response)) {
      console.log(`[TopicOverlap] No valid response after ${elapsed}ms`);
      return null;
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log(
        `[TopicOverlap] Empty content in response after ${elapsed}ms`,
      );
      return null;
    }

    const parsed = JSON.parse(content) as TopicOverlapResult;
    console.log(
      `[TopicOverlap] Completed in ${elapsed}ms - hasOverlap: ${parsed.hasOverlap}, topics: [${parsed.overlappingTopics.join(", ")}], coverage: ${parsed.coverageLevel}`,
    );
    return parsed;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[TopicOverlap] Detection failed after ${elapsed}ms:`, error);
    return null;
  }
}

export async function generateQuestionSummary(
  questionIndex: number,
  questionText: string,
  questionGuidance: string,
  transcript: TranscriptEntry[],
  metrics: QuestionMetrics,
  templateObjective: string,
  usageContext?: LLMUsageAttribution,
): Promise<QuestionSummary> {
  const questionTranscript = transcript.filter(
    (e) => e.questionIndex === questionIndex,
  );

  // Debug logging to trace transcript filtering issues
  const speakerBreakdown = questionTranscript.reduce(
    (acc, e) => {
      acc[e.speaker] = (acc[e.speaker] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log(
    `[Summary] Q${questionIndex + 1} transcript breakdown: ${JSON.stringify(speakerBreakdown)}, ` +
      `entries: ${questionTranscript.length}`,
  );

  if (questionTranscript.length === 0) {
    console.log(
      `[Summary] Q${questionIndex + 1}: No transcript entries found, returning empty summary`,
    );
    return createEmptySummary(questionIndex, questionText, metrics);
  }

  const respondentEntries = questionTranscript.filter(
    (e) => e.speaker === "respondent",
  );
  const respondentText = respondentEntries.map((e) => e.text).join(" ");

  const wordCount = respondentText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  console.log(
    `[Summary] Q${questionIndex + 1}: ${respondentEntries.length} respondent entries, ${wordCount} words`,
  );

  // Always summarize responses, even short ones - they can contain valuable emotional/sentiment data
  // Short responses like frustrated one-word answers are still meaningful for analysis

  const transcriptFormatted = questionTranscript
    .map((e) => `[${e.speaker.toUpperCase()}]: ${e.text}`)
    .join("\n");

  const systemPrompt = `You are Barbara, an interview analysis assistant. Your task is to create a structured summary of a respondent's answer to an interview question, including quality analysis and notable verbatim statements.

You must respond with a JSON object containing:
{
  "respondentSummary": "A 2-3 sentence summary of what the respondent said",
  "keyInsights": ["3-5 bullet points of main themes, insights, or memorable quotes"],
  "completenessAssessment": "Brief note on answer quality/depth (e.g., 'Comprehensive with specific examples' or 'Brief but covered key points')",
  "relevantToFutureQuestions": ["Topics mentioned that might connect to later questions"],
  "qualityFlags": ["Array of applicable flags from: incomplete, ambiguous, contradiction, distress_cue, off_topic, low_engagement"],
  "qualityScore": 0-100,
  "qualityNotes": "Brief explanation of quality assessment",
  "verbatims": [
    {
      "quote": "Exact statement from the respondent (clean up filler words but preserve meaning)",
      "context": "Brief context - what prompted this statement",
      "sentiment": "positive|negative|neutral|mixed",
      "themeTag": "A short tag describing the theme (e.g., 'pricing concerns', 'feature request', 'user experience')"
    }
  ]
}

VERBATIM SELECTION CRITERIA:
- Extract 2-4 notable verbatim statements per question (only if the respondent said something meaningful)
- Prioritize quotes that are: emotionally charged, reveal key insights, express strong opinions, or capture unique perspectives
- Clean up filler words (um, uh, like) but preserve the respondent's exact phrasing and voice
- Each quote should be 1-3 sentences max
- Include diverse sentiments when present (don't only pick positive or negative)

PII ANONYMIZATION (CRITICAL - apply to all verbatim quotes):
- Replace names with [Name]
- Replace locations/cities with [Location]
- Replace company names with [Company]
- Replace specific dates with [Date]
- Replace phone/email with [Contact]

Quality flags definitions:
- incomplete: Answer doesn't address significant key aspects of the question
- ambiguous: Response is very unclear or could be interpreted multiple ways
- contradiction: Contains conflicting statements
- distress_cue: Shows signs of discomfort, anxiety, or distress
- off_topic: Significantly strays from the question topic
- low_engagement: Extremely short or disengaged responses (e.g., "I don't know" or "Yeah")

Quality flags guidance:
- Apply flags conservatively - most responses should have zero or one flag at most
- Remember these are spoken responses - casual phrasing and natural pauses are normal, not signs of low engagement
- Only flag 'incomplete' if the response completely ignores the core question, not for partial answers

Quality score (0-100): Rate overall answer quality based on depth, relevance, and engagement.

Focus on what the respondent actually said, not what the interviewer asked. Extract key themes and insights. Keep the summary concise (~200 words total).`;

  const userPrompt = `INTERVIEW OBJECTIVE: ${templateObjective}

QUESTION (Q${questionIndex + 1}): "${questionText}"

GUIDANCE FOR THIS QUESTION:
${questionGuidance || "No specific guidance provided."}

TRANSCRIPT FOR THIS QUESTION:
${transcriptFormatted}

METRICS:
- Word count: ${wordCount}
- Number of turns: ${metrics.turnCount}
- Active speaking time: ${Math.round(metrics.activeTimeMs / 1000)} seconds

Create a structured summary of the respondent's answer.`;

  try {
    const config = barbaraConfig.summarisation;
    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_question_summary",
      timeoutMs: SUMMARY_TIMEOUT_MS,
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 1500,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<
          typeof openai.chat.completions.create
        >[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;
    const finishReason = response.choices[0]?.finish_reason;
    console.log(
      `[Summary] Q${questionIndex + 1}: OpenAI API call completed, finish_reason: ${finishReason}`,
    );

    // Warn if we're hitting token limits - indicates we may need to increase max_completion_tokens
    if (finishReason === "length") {
      console.warn(
        `[Summary] Q${questionIndex + 1}: WARNING - Response truncated due to token limit! Consider increasing max_completion_tokens.`,
      );
    }

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.log(
        `[Summary] Q${questionIndex + 1}: OpenAI returned empty content! Response structure:`,
        JSON.stringify(
          {
            hasChoices: !!response.choices,
            choicesLength: response.choices?.length,
            firstChoice: response.choices?.[0]
              ? {
                  hasMessage: !!response.choices[0].message,
                  messageContent:
                    response.choices[0].message?.content?.substring(0, 100),
                  finishReason: response.choices[0].finish_reason,
                }
              : null,
          },
          null,
          2,
        ),
      );
      return createEmptySummary(questionIndex, questionText, metrics);
    }

    console.log(
      `[Summary] Q${questionIndex + 1}: Parsing OpenAI response (${content.length} chars)`,
    );
    const parsed = JSON.parse(content);
    console.log(
      `[Summary] Q${questionIndex + 1}: Parsed summary - respondentSummary: "${parsed.respondentSummary?.substring(0, 50)}...", keyInsights count: ${parsed.keyInsights?.length || 0}`,
    );

    const validFlags: QualityFlag[] = [
      "incomplete",
      "ambiguous",
      "contradiction",
      "distress_cue",
      "off_topic",
      "low_engagement",
    ];
    const qualityFlags = Array.isArray(parsed.qualityFlags)
      ? parsed.qualityFlags.filter((f: string) =>
          validFlags.includes(f as QualityFlag),
        )
      : [];

    // Parse and validate verbatims
    const validSentiments = [
      "positive",
      "negative",
      "neutral",
      "mixed",
    ] as const;
    type ValidSentiment = (typeof validSentiments)[number];
    const verbatims = Array.isArray(parsed.verbatims)
      ? parsed.verbatims
          .filter(
            (v: { quote?: string; context?: string }) =>
              v && typeof v.quote === "string" && v.quote.trim().length > 0,
          )
          .map(
            (v: {
              quote: string;
              context?: string;
              sentiment?: string;
              themeTag?: string;
            }) => ({
              quote: v.quote.trim(),
              context: v.context?.trim() || "Response to question",
              sentiment: validSentiments.includes(v.sentiment as ValidSentiment)
                ? (v.sentiment as ValidSentiment)
                : undefined,
              themeTag: v.themeTag?.trim() || undefined,
            }),
          )
          .slice(0, 4) // Max 4 verbatims per question
      : [];

    return {
      questionIndex,
      questionText,
      respondentSummary: parsed.respondentSummary || "No summary available.",
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
      completenessAssessment:
        parsed.completenessAssessment || "Assessment unavailable.",
      relevantToFutureQuestions: Array.isArray(parsed.relevantToFutureQuestions)
        ? parsed.relevantToFutureQuestions
        : [],
      wordCount,
      turnCount: metrics.turnCount,
      activeTimeMs: metrics.activeTimeMs,
      timestamp: Date.now(),
      qualityFlags,
      qualityScore:
        typeof parsed.qualityScore === "number"
          ? Math.min(100, Math.max(0, parsed.qualityScore))
          : undefined,
      qualityNotes: parsed.qualityNotes || undefined,
      verbatims: verbatims.length > 0 ? verbatims : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes("timeout");
    console.error(
      `[Summary] Q${questionIndex + 1}: Error generating summary${isTimeout ? " (TIMEOUT)" : ""}:`,
      errorMessage,
    );
    if (error instanceof Error && error.stack) {
      console.error(
        `[Summary] Q${questionIndex + 1}: Stack trace:`,
        error.stack.split("\n").slice(0, 3).join("\n"),
      );
    }
    return createEmptySummary(questionIndex, questionText, metrics);
  }
}

function createEmptySummary(
  questionIndex: number,
  questionText: string,
  metrics: QuestionMetrics,
): QuestionSummary {
  return {
    questionIndex,
    questionText,
    respondentSummary: "Minimal or no response provided.",
    keyInsights: [],
    completenessAssessment: "Insufficient response for assessment.",
    relevantToFutureQuestions: [],
    wordCount: 0,
    turnCount: metrics.turnCount,
    activeTimeMs: metrics.activeTimeMs,
    timestamp: Date.now(),
    qualityFlags: ["low_engagement"],
    qualityScore: 20,
    qualityNotes: "Minimal or no response provided",
  };
}

export interface CrossInterviewAnalysisInput {
  sessions: {
    sessionId: string;
    questionSummaries: QuestionSummary[];
    durationMs: number;
    transcript?: string; // Full transcript for verbatim extraction
  }[];
  templateQuestions: { text: string; guidance: string }[];
  templateObjective: string;
}

import type {
  EnhancedTheme,
  ThemeVerbatim,
  ThemeSentiment,
  KeyFinding,
  ConsensusPoint,
  DivergencePoint,
  Recommendation,
  EnhancedQuestionPerformance,
  CollectionAnalytics,
} from "@shared/schema";

const CROSS_ANALYSIS_TIMEOUT_MS = 90000;

export async function generateCrossInterviewAnalysis(
  input: CrossInterviewAnalysisInput,
  usageContext?: LLMUsageAttribution,
): Promise<Omit<CollectionAnalytics, "generatedAt">> {
  const allFlags: QualityFlag[] = [
    "incomplete",
    "ambiguous",
    "contradiction",
    "distress_cue",
    "off_topic",
    "low_engagement",
  ];

  // Calculate basic question performance metrics
  const baseQuestionPerformance = input.templateQuestions.map((q, idx) => {
    const responses = input.sessions
      .map((s) => s.questionSummaries.find((qs) => qs.questionIndex === idx))
      .filter((qs): qs is QuestionSummary => qs !== undefined);

    const flagCounts: Record<QualityFlag, number> = {
      incomplete: 0,
      ambiguous: 0,
      contradiction: 0,
      distress_cue: 0,
      off_topic: 0,
      low_engagement: 0,
    };

    responses.forEach((r) => {
      (r.qualityFlags || []).forEach((f) => {
        if (allFlags.includes(f)) flagCounts[f]++;
      });
    });

    const avgWordCount =
      responses.length > 0
        ? responses.reduce((sum, r) => sum + r.wordCount, 0) / responses.length
        : 0;
    const avgTurnCount =
      responses.length > 0
        ? responses.reduce((sum, r) => sum + r.turnCount, 0) / responses.length
        : 0;
    const qualityScores = responses
      .filter((r) => r.qualityScore !== undefined)
      .map((r) => r.qualityScore!);
    const avgQualityScore =
      qualityScores.length > 0
        ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
        : 0;

    // Determine response richness based on average word count
    const responseRichness: "brief" | "moderate" | "detailed" =
      avgWordCount < 30
        ? "brief"
        : avgWordCount < 100
          ? "moderate"
          : "detailed";

    return {
      questionIndex: idx,
      questionText: q.text,
      avgWordCount: Math.round(avgWordCount),
      avgTurnCount: Math.round(avgTurnCount * 10) / 10,
      avgQualityScore: Math.round(avgQualityScore),
      responseCount: responses.length,
      qualityFlagCounts: flagCounts,
      responseRichness,
      summaries: responses.map((r) => r.respondentSummary),
    };
  });

  // Calculate overall stats
  const allQualityScores = input.sessions.flatMap((s) =>
    s.questionSummaries
      .filter((qs) => qs.qualityScore !== undefined)
      .map((qs) => qs.qualityScore!),
  );
  const avgQualityScore =
    allQualityScores.length > 0
      ? allQualityScores.reduce((sum, s) => sum + s, 0) /
        allQualityScores.length
      : 0;

  const totalFlagCounts: Record<QualityFlag, number> = {
    incomplete: 0,
    ambiguous: 0,
    contradiction: 0,
    distress_cue: 0,
    off_topic: 0,
    low_engagement: 0,
  };
  input.sessions.forEach((s) => {
    s.questionSummaries.forEach((qs) => {
      (qs.qualityFlags || []).forEach((f) => {
        if (allFlags.includes(f)) totalFlagCounts[f]++;
      });
    });
  });

  const commonQualityIssues = allFlags
    .map((f) => ({ flag: f, count: totalFlagCounts[f] }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count);

  const avgDuration =
    input.sessions.length > 0
      ? input.sessions.reduce((sum, s) => sum + s.durationMs, 0) /
        input.sessions.length
      : 0;

  // Run AI-powered analysis in parallel
  console.log("[Barbara] Starting enhanced cross-interview analysis...");

  const [enhancedAnalysis] = await Promise.all([
    extractEnhancedAnalysis(input, baseQuestionPerformance, usageContext),
  ]);

  // Generate recommendations based on metrics
  const recommendations = generateRecommendations(
    baseQuestionPerformance,
    enhancedAnalysis.themes,
    input,
  );

  // Calculate theme stats
  const themesPerSession = input.sessions.map((s) => {
    const sessionInsights = s.questionSummaries.flatMap((qs) => qs.keyInsights);
    return enhancedAnalysis.themes.filter((t) =>
      t.sessions.includes(s.sessionId),
    ).length;
  });
  const avgThemesPerSession =
    themesPerSession.length > 0
      ? themesPerSession.reduce((sum, t) => sum + t, 0) /
        themesPerSession.length
      : 0;

  const themeDepthScore =
    enhancedAnalysis.themes.length > 0
      ? Math.round(
          enhancedAnalysis.themes.reduce((sum, t) => sum + t.depthScore, 0) /
            enhancedAnalysis.themes.length,
        )
      : 0;

  // Build enhanced question performance
  const questionPerformance: EnhancedQuestionPerformance[] =
    baseQuestionPerformance.map((q, idx) => ({
      questionIndex: q.questionIndex,
      questionText: q.questionText,
      avgWordCount: q.avgWordCount,
      avgTurnCount: q.avgTurnCount,
      avgQualityScore: q.avgQualityScore,
      responseCount: q.responseCount,
      qualityFlagCounts: q.qualityFlagCounts,
      primaryThemes: enhancedAnalysis.themes
        .filter((t) => t.relatedQuestions.includes(idx))
        .slice(0, 3)
        .map((t) => t.theme),
      verbatims: enhancedAnalysis.questionVerbatims[idx] || [],
      perspectiveRange:
        enhancedAnalysis.questionPerspectives[idx] || "moderate",
      responseRichness: q.responseRichness,
    }));

  console.log("[Barbara] Enhanced analysis complete:", {
    themes: enhancedAnalysis.themes.length,
    keyFindings: enhancedAnalysis.keyFindings.length,
    consensusPoints: enhancedAnalysis.consensusPoints.length,
    divergencePoints: enhancedAnalysis.divergencePoints.length,
    recommendations: recommendations.length,
  });

  return {
    themes: enhancedAnalysis.themes,
    keyFindings: enhancedAnalysis.keyFindings,
    consensusPoints: enhancedAnalysis.consensusPoints,
    divergencePoints: enhancedAnalysis.divergencePoints,
    questionPerformance,
    recommendations,
    overallStats: {
      totalCompletedSessions: input.sessions.length,
      avgSessionDuration: Math.round(avgDuration / 60000),
      avgQualityScore: Math.round(avgQualityScore),
      commonQualityIssues,
      sentimentDistribution: enhancedAnalysis.sentimentDistribution,
      avgThemesPerSession: Math.round(avgThemesPerSession * 10) / 10,
      themeDepthScore,
    },
  };
}

function generateRecommendations(
  questionPerformance: {
    questionIndex: number;
    questionText: string;
    avgQualityScore: number;
    avgWordCount: number;
    responseRichness: string;
  }[],
  themes: EnhancedTheme[],
  input: CrossInterviewAnalysisInput,
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Flag underperforming questions
  questionPerformance.forEach((q) => {
    if (q.avgQualityScore < 50 && q.avgQualityScore > 0) {
      recommendations.push({
        type: "question_improvement",
        title: `Improve Question ${q.questionIndex + 1}`,
        description: `This question has a low average quality score (${q.avgQualityScore}%). Consider rewording for clarity or providing more context.`,
        relatedQuestions: [q.questionIndex],
        priority: q.avgQualityScore < 30 ? "high" : "medium",
      });
    }
    if (q.responseRichness === "brief" && q.avgWordCount > 0) {
      recommendations.push({
        type: "needs_probing",
        title: `Add follow-up probes for Question ${q.questionIndex + 1}`,
        description: `Responses to this question tend to be brief (avg ${q.avgWordCount} words). Consider adding follow-up prompts to encourage deeper exploration.`,
        relatedQuestions: [q.questionIndex],
        priority: "medium",
      });
    }
  });

  // Flag shallow themes
  themes.forEach((t) => {
    if (t.depth === "mentioned" && t.count >= 2) {
      recommendations.push({
        type: "explore_deeper",
        title: `Explore "${t.theme}" in more depth`,
        description: `This theme appeared across ${t.count} sessions but was only briefly mentioned. Future interviews should probe deeper.`,
        relatedThemes: [t.id],
        priority: "medium",
      });
    }
  });

  // Flag emergent themes as coverage gaps
  themes
    .filter((t) => t.isEmergent)
    .forEach((t) => {
      recommendations.push({
        type: "coverage_gap",
        title: `Add questions about "${t.theme}"`,
        description: `${t.description} This topic emerged organically and may warrant dedicated questions in the template.`,
        relatedThemes: [t.id],
        priority: t.count >= 3 ? "high" : "medium",
      });
    });

  return recommendations.slice(0, 10); // Limit to top 10 recommendations
}

interface EnhancedAnalysisResult {
  themes: EnhancedTheme[];
  keyFindings: KeyFinding[];
  consensusPoints: ConsensusPoint[];
  divergencePoints: DivergencePoint[];
  questionVerbatims: Record<number, ThemeVerbatim[]>;
  questionPerspectives: Record<number, "narrow" | "moderate" | "diverse">;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

async function extractEnhancedAnalysis(
  input: CrossInterviewAnalysisInput,
  questionPerformance: {
    questionIndex: number;
    questionText: string;
    summaries: string[];
  }[],
  usageContext?: LLMUsageAttribution,
): Promise<EnhancedAnalysisResult> {
  if (input.sessions.length === 0) {
    return {
      themes: [],
      keyFindings: [],
      consensusPoints: [],
      divergencePoints: [],
      questionVerbatims: {},
      questionPerspectives: {},
      sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
    };
  }

  // Build comprehensive session data for AI analysis including pre-extracted verbatims
  const sessionData = input.sessions.map((s, idx) => {
    const summariesByQuestion = s.questionSummaries.map((qs) => ({
      questionIndex: qs.questionIndex,
      summary: qs.respondentSummary,
      insights: qs.keyInsights,
      verbatims: qs.verbatims || [], // Include pre-extracted verbatims
    }));
    return {
      participantLabel: `Participant ${idx + 1}`,
      sessionId: s.sessionId,
      summariesByQuestion,
    };
  });

  const systemPrompt = `You are Barbara, a qualitative research analyst. Analyze interview data and provide rich insights with supporting verbatims.

IMPORTANT: For all verbatims/quotes, apply PII anonymization:
- Replace names with [Name]
- Replace locations/cities with [Location]  
- Replace company names with [Company]
- Replace specific dates with [Date]
- Replace phone/email with [Contact]

Return a JSON object with this exact structure:
{
  "themes": [
    {
      "id": "theme_1",
      "theme": "Brief theme name (2-5 words)",
      "description": "One sentence description of the theme",
      "sentiment": "positive" | "neutral" | "negative" | "mixed",
      "sentimentBreakdown": { "positive": 0, "neutral": 0, "negative": 0 },
      "depth": "mentioned" | "explored" | "deeply_explored",
      "depthScore": 0-100,
      "relatedQuestions": [0, 1, 2],
      "subThemes": ["sub-theme 1", "sub-theme 2"],
      "isEmergent": false,
      "verbatims": [
        {
          "quote": "Anonymized quote from participant",
          "questionIndex": 0,
          "participantIndex": 0,
          "sentiment": "positive" | "neutral" | "negative" | "mixed"
        }
      ]
    }
  ],
  "keyFindings": [
    {
      "finding": "Key insight statement",
      "significance": "Why this matters",
      "relatedThemes": ["theme_1"],
      "supportingVerbatims": [{ "quote": "...", "questionIndex": 0, "participantIndex": 0, "sentiment": "neutral" }]
    }
  ],
  "consensusPoints": [
    {
      "topic": "Topic where agreement exists",
      "position": "The shared view",
      "agreementLevel": 80,
      "verbatims": [{ "quote": "...", "questionIndex": 0, "participantIndex": 0, "sentiment": "neutral" }]
    }
  ],
  "divergencePoints": [
    {
      "topic": "Topic where views differ",
      "perspectives": [
        { "position": "View A", "count": 3, "verbatims": [] },
        { "position": "View B", "count": 2, "verbatims": [] }
      ]
    }
  ],
  "questionAnalysis": [
    {
      "questionIndex": 0,
      "perspectiveRange": "narrow" | "moderate" | "diverse",
      "keyVerbatims": [{ "quote": "...", "participantIndex": 0, "sentiment": "neutral" }]
    }
  ],
  "overallSentiment": { "positive": 40, "neutral": 35, "negative": 25 }
}

Guidelines:
- Identify 4-10 significant themes with 2-5 supporting verbatims each
- Mark themes as "isEmergent: true" if they go beyond the template questions
- depth: "mentioned" = briefly referenced, "explored" = discussed in some detail, "deeply_explored" = rich, detailed discussion
- depthScore: 0-30 for mentioned, 31-70 for explored, 71-100 for deeply explored
- Include 3-5 key findings with the most impactful insights
- Identify 1-3 consensus points and 1-3 divergence points
- For each question, select 2-4 representative verbatims showing the range of responses`;

  const questionList = input.templateQuestions
    .map((q, i) => `Q${i + 1}: ${q.text}`)
    .join("\n");

  const sessionSummaries = sessionData
    .map((s) => {
      const responses = s.summariesByQuestion
        .map((q) => {
          const verbatimText =
            q.verbatims.length > 0
              ? ` | Verbatims: ${q.verbatims.map((v) => `"${v.quote}" [${v.sentiment || "neutral"}${v.themeTag ? `, ${v.themeTag}` : ""}]`).join("; ")}`
              : "";
          return `  Q${q.questionIndex + 1}: ${q.summary} | Insights: ${q.insights.join("; ")}${verbatimText}`;
        })
        .join("\n");
      return `${s.participantLabel}:\n${responses}`;
    })
    .join("\n\n");

  const userPrompt = `INTERVIEW OBJECTIVE: ${input.templateObjective}

TEMPLATE QUESTIONS:
${questionList}

INTERVIEW DATA FROM ${input.sessions.length} PARTICIPANTS:
${sessionSummaries}

Analyze these interviews and provide comprehensive insights with anonymized verbatims.`;

  try {
    console.log(
      "[Barbara] Building enhanced analysis prompt with",
      sessionData.length,
      "sessions",
    );
    console.log(
      "[Barbara] Session summaries preview:",
      sessionSummaries.substring(0, 500),
    );

    const config = barbaraConfig.summarisation;
    console.log("[Barbara] Using model:", config.model);

    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_cross_interview_enhanced_analysis",
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 16000,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<
          typeof openai.chat.completions.create
        >[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    console.log(
      "[Barbara] Full API response:",
      JSON.stringify(response, null, 2).substring(0, 1000),
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("[Barbara] No content in AI response");
      console.error(
        "[Barbara] Response choices:",
        JSON.stringify(response.choices, null, 2),
      );
      return createEmptyAnalysis();
    }

    console.log("[Barbara] AI response received, length:", content.length);
    const parsed = JSON.parse(content);
    console.log(
      "[Barbara] Parsed response - themes:",
      parsed.themes?.length || 0,
      "findings:",
      parsed.keyFindings?.length || 0,
    );

    return processAnalysisResponse(parsed, sessionData, input.sessions.length);
  } catch (error) {
    console.error("[Barbara] Error in enhanced analysis:", error);
    if (error instanceof Error) {
      console.error("[Barbara] Error message:", error.message);
      console.error("[Barbara] Error stack:", error.stack);
    }
    return createEmptyAnalysis();
  }
}

function createEmptyAnalysis(): EnhancedAnalysisResult {
  return {
    themes: [],
    keyFindings: [],
    consensusPoints: [],
    divergencePoints: [],
    questionVerbatims: {},
    questionPerspectives: {},
    sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
  };
}

function processAnalysisResponse(
  parsed: any,
  sessionData: { participantLabel: string; sessionId: string }[],
  totalSessions: number,
): EnhancedAnalysisResult {
  const themes: EnhancedTheme[] = (parsed.themes || []).map((t: any) => {
    const verbatims: ThemeVerbatim[] = (t.verbatims || []).map((v: any) => ({
      quote: v.quote || "",
      questionIndex: v.questionIndex || 0,
      sessionId:
        sessionData[v.participantIndex]?.sessionId ||
        sessionData[0]?.sessionId ||
        "",
      sentiment: validateSentiment(v.sentiment),
    }));

    const sessionsWithTheme = Array.from(
      new Set(verbatims.map((v) => v.sessionId)),
    );

    return {
      id:
        t.id ||
        `theme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      theme: t.theme || "Unnamed Theme",
      description: t.description || "",
      count: sessionsWithTheme.length || 1,
      sessions: sessionsWithTheme,
      prevalence: Math.round((sessionsWithTheme.length / totalSessions) * 100),
      verbatims: verbatims.slice(0, 7),
      sentiment: validateSentiment(t.sentiment),
      sentimentBreakdown: t.sentimentBreakdown || {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
      depth: validateDepth(t.depth),
      depthScore: Math.min(100, Math.max(0, t.depthScore || 50)),
      relatedQuestions: Array.isArray(t.relatedQuestions)
        ? t.relatedQuestions
        : [],
      subThemes: Array.isArray(t.subThemes) ? t.subThemes : undefined,
      isEmergent: t.isEmergent === true,
    };
  });

  const keyFindings: KeyFinding[] = (parsed.keyFindings || [])
    .slice(0, 5)
    .map((f: any) => ({
      finding: f.finding || "",
      significance: f.significance || "",
      supportingVerbatims: (f.supportingVerbatims || [])
        .slice(0, 3)
        .map((v: any) => ({
          quote: v.quote || "",
          questionIndex: v.questionIndex || 0,
          sessionId: sessionData[v.participantIndex]?.sessionId || "",
          sentiment: validateSentiment(v.sentiment),
        })),
      relatedThemes: Array.isArray(f.relatedThemes) ? f.relatedThemes : [],
    }));

  const consensusPoints: ConsensusPoint[] = (parsed.consensusPoints || [])
    .slice(0, 3)
    .map((c: any) => ({
      topic: c.topic || "",
      position: c.position || "",
      agreementLevel: Math.min(100, Math.max(0, c.agreementLevel || 0)),
      verbatims: (c.verbatims || []).slice(0, 3).map((v: any) => ({
        quote: v.quote || "",
        questionIndex: v.questionIndex || 0,
        sessionId: sessionData[v.participantIndex]?.sessionId || "",
        sentiment: validateSentiment(v.sentiment),
      })),
    }));

  const divergencePoints: DivergencePoint[] = (parsed.divergencePoints || [])
    .slice(0, 3)
    .map((d: any) => ({
      topic: d.topic || "",
      perspectives: (d.perspectives || []).map((p: any) => ({
        position: p.position || "",
        count: p.count || 0,
        verbatims: (p.verbatims || []).slice(0, 2).map((v: any) => ({
          quote: v.quote || "",
          questionIndex: v.questionIndex || 0,
          sessionId: sessionData[v.participantIndex]?.sessionId || "",
          sentiment: validateSentiment(v.sentiment),
        })),
      })),
    }));

  const questionVerbatims: Record<number, ThemeVerbatim[]> = {};
  const questionPerspectives: Record<
    number,
    "narrow" | "moderate" | "diverse"
  > = {};

  (parsed.questionAnalysis || []).forEach((qa: any) => {
    const qIdx = qa.questionIndex;
    questionVerbatims[qIdx] = (qa.keyVerbatims || [])
      .slice(0, 4)
      .map((v: any) => ({
        quote: v.quote || "",
        questionIndex: qIdx,
        sessionId: sessionData[v.participantIndex]?.sessionId || "",
        sentiment: validateSentiment(v.sentiment),
      }));
    questionPerspectives[qIdx] = validatePerspective(qa.perspectiveRange);
  });

  const sentimentDistribution = parsed.overallSentiment || {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  return {
    themes,
    keyFindings,
    consensusPoints,
    divergencePoints,
    questionVerbatims,
    questionPerspectives,
    sentimentDistribution,
  };
}

function validateSentiment(s: any): ThemeSentiment {
  if (s === "positive" || s === "negative" || s === "neutral" || s === "mixed")
    return s;
  return "neutral";
}

function validateDepth(d: any): "mentioned" | "explored" | "deeply_explored" {
  if (d === "mentioned" || d === "explored" || d === "deeply_explored")
    return d;
  return "explored";
}

function validatePerspective(p: any): "narrow" | "moderate" | "diverse" {
  if (p === "narrow" || p === "moderate" || p === "diverse") return p;
  return "moderate";
}

// Template Analytics Generation
import type {
  TemplateAnalytics,
  CollectionPerformanceSummary,
  QuestionConsistency,
  Collection,
  AggregatedThemeWithDetail,
  KeyFindingWithSource,
  ConsensusPointWithSource,
  DivergencePointWithSource,
} from "@shared/schema";

export interface TemplateAnalyticsInput {
  collections: {
    collection: Collection;
    analytics: CollectionAnalytics | null;
    sessionCount: number;
  }[];
  templateQuestions: { text: string; index: number }[];
  templateName: string;
}

const TEMPLATE_ANALYTICS_TIMEOUT_MS = 60000;

export async function generateTemplateAnalytics(
  input: TemplateAnalyticsInput,
  usageContext?: LLMUsageAttribution,
): Promise<Omit<TemplateAnalytics, "generatedAt">> {
  console.log("[Barbara] Starting template analytics generation...");

  const collectionsWithAnalytics = input.collections.filter(
    (c) => c.analytics !== null,
  );

  if (collectionsWithAnalytics.length === 0) {
    console.log(
      "[Barbara] No collections with analytics found, returning empty template analytics",
    );
    return createEmptyTemplateAnalytics();
  }

  // Build collection performance summaries
  const collectionPerformance: CollectionPerformanceSummary[] =
    collectionsWithAnalytics.map((c) => ({
      collectionId: c.collection.id,
      collectionName: c.collection.name,
      sessionCount: c.sessionCount,
      avgQualityScore: c.analytics!.overallStats.avgQualityScore,
      avgSessionDuration: c.analytics!.overallStats.avgSessionDuration,
      topThemes: c.analytics!.themes.slice(0, 3).map((t) => t.theme),
      sentimentDistribution: c.analytics!.overallStats.sentimentDistribution,
      createdAt:
        c.collection.createdAt?.toISOString() || new Date().toISOString(),
    }));

  // Calculate question consistency across collections (now with verbatims)
  const questionConsistency: QuestionConsistency[] =
    input.templateQuestions.map((q, idx) => {
      const questionScores: {
        collectionId: string;
        avgQuality: number;
        avgWordCount: number;
      }[] = [];
      const allVerbatims: ThemeVerbatim[] = [];
      const allThemes: string[] = [];

      for (const c of collectionsWithAnalytics) {
        const qp = c.analytics!.questionPerformance.find(
          (qp) => qp.questionIndex === idx,
        );
        if (qp && qp.responseCount > 0) {
          questionScores.push({
            collectionId: c.collection.id,
            avgQuality: qp.avgQualityScore,
            avgWordCount: qp.avgWordCount,
          });
          // Collect verbatims (limit 3 per collection to keep manageable)
          if (qp.verbatims && qp.verbatims.length > 0) {
            allVerbatims.push(...qp.verbatims.slice(0, 3));
          }
          // Collect primary themes
          if (qp.primaryThemes && qp.primaryThemes.length > 0) {
            allThemes.push(...qp.primaryThemes);
          }
        }
      }

      if (questionScores.length === 0) {
        return {
          questionIndex: idx,
          questionText: q.text,
          avgQualityAcrossCollections: 0,
          qualityVariance: 0,
          avgWordCountAcrossCollections: 0,
          bestPerformingCollectionId: "",
          worstPerformingCollectionId: "",
          consistencyRating: "consistent" as const,
          verbatims: [],
          primaryThemes: [],
        };
      }

      const avgQuality =
        questionScores.reduce((sum, s) => sum + s.avgQuality, 0) /
        questionScores.length;
      const avgWordCount =
        questionScores.reduce((sum, s) => sum + s.avgWordCount, 0) /
        questionScores.length;

      // Calculate variance
      const variance =
        questionScores.length > 1
          ? questionScores.reduce(
              (sum, s) => sum + Math.pow(s.avgQuality - avgQuality, 2),
              0,
            ) / questionScores.length
          : 0;

      const sorted = [...questionScores].sort(
        (a, b) => b.avgQuality - a.avgQuality,
      );
      const best = sorted[0]?.collectionId || "";
      const worst = sorted[sorted.length - 1]?.collectionId || "";

      // Determine consistency rating based on variance
      const consistencyRating: "consistent" | "variable" | "inconsistent" =
        variance < 100
          ? "consistent"
          : variance < 400
            ? "variable"
            : "inconsistent";

      // Deduplicate themes
      const uniqueThemes = [...new Set(allThemes)].slice(0, 10);

      return {
        questionIndex: idx,
        questionText: q.text,
        avgQualityAcrossCollections: Math.round(avgQuality),
        qualityVariance: Math.round(variance),
        avgWordCountAcrossCollections: Math.round(avgWordCount),
        bestPerformingCollectionId: best,
        worstPerformingCollectionId: worst,
        consistencyRating,
        verbatims: allVerbatims.slice(0, 10), // Limit to 10 total verbatims per question
        primaryThemes: uniqueThemes,
      };
    });

  // Aggregate themes across collections with full detail preservation
  interface ThemeAggregation {
    totalMentions: number;
    collectionSources: { collectionId: string; collectionName: string }[];
    sentiments: ThemeSentiment[];
    prevalences: number[];
    depths: Array<"mentioned" | "explored" | "deeply_explored">;
    descriptions: string[];
    verbatims: ThemeVerbatim[];
    sentimentBreakdowns: Array<{
      positive: number;
      neutral: number;
      negative: number;
    }>;
    isEmergent: boolean;
  }

  const themeMap = new Map<string, ThemeAggregation>();
  
  // Build a map from theme IDs to theme names for resolving relatedThemes in key findings
  const themeIdToNameMap = new Map<string, string>();

  for (const c of collectionsWithAnalytics) {
    for (const theme of c.analytics!.themes) {
      // Map theme ID to its human-readable name
      if (theme.id && theme.theme) {
        themeIdToNameMap.set(theme.id, theme.theme);
      }
      const existing = themeMap.get(theme.theme) || {
        totalMentions: 0,
        collectionSources: [],
        sentiments: [],
        prevalences: [],
        depths: [],
        descriptions: [],
        verbatims: [],
        sentimentBreakdowns: [],
        isEmergent: false,
      };

      existing.totalMentions += theme.count;
      existing.collectionSources.push({
        collectionId: c.collection.id,
        collectionName: c.collection.name,
      });
      existing.sentiments.push(theme.sentiment);
      existing.prevalences.push(theme.prevalence);
      existing.depths.push(theme.depth);
      existing.descriptions.push(theme.description);
      existing.isEmergent = existing.isEmergent || !!theme.isEmergent;

      // Preserve ALL verbatims from each collection (limit 5 per collection)
      if (theme.verbatims && theme.verbatims.length > 0) {
        existing.verbatims.push(...theme.verbatims.slice(0, 5));
      }

      // Collect sentiment breakdowns
      if (theme.sentimentBreakdown) {
        existing.sentimentBreakdowns.push(theme.sentimentBreakdown);
      }

      themeMap.set(theme.theme, existing);
    }
  }

  // Helper function to determine the maximum depth
  function getMaxDepth(
    depths: Array<"mentioned" | "explored" | "deeply_explored">,
  ): "mentioned" | "explored" | "deeply_explored" {
    if (depths.includes("deeply_explored")) return "deeply_explored";
    if (depths.includes("explored")) return "explored";
    return "mentioned";
  }

  // Helper function to aggregate sentiment breakdowns
  function aggregateSentimentBreakdowns(
    breakdowns: Array<{ positive: number; neutral: number; negative: number }>,
  ): { positive: number; neutral: number; negative: number } {
    if (breakdowns.length === 0)
      return { positive: 0, neutral: 0, negative: 0 };
    const total = breakdowns.reduce(
      (acc, b) => ({
        positive: acc.positive + b.positive,
        neutral: acc.neutral + b.neutral,
        negative: acc.negative + b.negative,
      }),
      { positive: 0, neutral: 0, negative: 0 },
    );
    const sum = total.positive + total.neutral + total.negative;
    if (sum === 0) return { positive: 0, neutral: 0, negative: 0 };
    return {
      positive: Math.round((total.positive / sum) * 100),
      neutral: Math.round((total.neutral / sum) * 100),
      negative: Math.round((total.negative / sum) * 100),
    };
  }

  const aggregatedThemes: AggregatedThemeWithDetail[] = Array.from(
    themeMap.entries(),
  )
    .map(([theme, data]) => ({
      theme,
      description: data.descriptions[0] || "", // Use first description or synthesize later
      totalMentions: data.totalMentions,
      collectionsAppeared: data.collectionSources.length,
      avgPrevalence: Math.round(
        data.prevalences.reduce((a, b) => a + b, 0) / data.prevalences.length,
      ),
      sentiment: getMajoritySentiment(data.sentiments),
      sentimentBreakdown: aggregateSentimentBreakdowns(
        data.sentimentBreakdowns,
      ),
      verbatims: data.verbatims.slice(0, 15), // Limit to 15 verbatims per theme
      depth: getMaxDepth(data.depths),
      isEmergent: data.isEmergent,
      collectionSources: data.collectionSources,
    }))
    .sort((a, b) => b.totalMentions - a.totalMentions)
    .slice(0, 20); // Allow more themes now that we're preserving detail

  // Aggregate key findings with source collection attribution
  // Resolve theme IDs to human-readable theme names
  const keyFindings: KeyFindingWithSource[] = collectionsWithAnalytics
    .flatMap((c) =>
      (c.analytics!.keyFindings || []).map((f) => ({
        ...f,
        // Resolve theme IDs to actual theme names
        relatedThemes: (f.relatedThemes || []).map(
          (themeId) => themeIdToNameMap.get(themeId) || themeId
        ),
        sourceCollectionId: c.collection.id,
        sourceCollectionName: c.collection.name,
      })),
    )
    .slice(0, 30); // Limit total key findings

  // Aggregate consensus points with source collection attribution
  const consensusPoints: ConsensusPointWithSource[] = collectionsWithAnalytics
    .flatMap((c) =>
      (c.analytics!.consensusPoints || []).map((cp) => ({
        ...cp,
        sourceCollectionId: c.collection.id,
        sourceCollectionName: c.collection.name,
      })),
    )
    .slice(0, 20); // Limit total consensus points

  // Aggregate divergence points with source collection attribution
  const divergencePoints: DivergencePointWithSource[] = collectionsWithAnalytics
    .flatMap((c) =>
      (c.analytics!.divergencePoints || []).map((dp) => ({
        ...dp,
        sourceCollectionId: c.collection.id,
        sourceCollectionName: c.collection.name,
      })),
    )
    .slice(0, 20); // Limit total divergence points

  // Calculate template effectiveness metrics
  const totalSessions = collectionsWithAnalytics.reduce(
    (sum, c) => sum + c.sessionCount,
    0,
  );
  const avgQualityScore =
    collectionsWithAnalytics.length > 0
      ? Math.round(
          collectionsWithAnalytics.reduce(
            (sum, c) => sum + c.analytics!.overallStats.avgQualityScore,
            0,
          ) / collectionsWithAnalytics.length,
        )
      : 0;
  const avgSessionDuration =
    collectionsWithAnalytics.length > 0
      ? Math.round(
          collectionsWithAnalytics.reduce(
            (sum, c) => sum + c.analytics!.overallStats.avgSessionDuration,
            0,
          ) / collectionsWithAnalytics.length,
        )
      : 0;

  const sentimentAgg = { positive: 0, neutral: 0, negative: 0 };
  for (const c of collectionsWithAnalytics) {
    sentimentAgg.positive +=
      c.analytics!.overallStats.sentimentDistribution.positive;
    sentimentAgg.neutral +=
      c.analytics!.overallStats.sentimentDistribution.neutral;
    sentimentAgg.negative +=
      c.analytics!.overallStats.sentimentDistribution.negative;
  }
  const total =
    sentimentAgg.positive + sentimentAgg.neutral + sentimentAgg.negative;
  const sentimentDistribution =
    total > 0
      ? {
          positive: Math.round((sentimentAgg.positive / total) * 100),
          neutral: Math.round((sentimentAgg.neutral / total) * 100),
          negative: Math.round((sentimentAgg.negative / total) * 100),
        }
      : { positive: 0, neutral: 0, negative: 0 };

  // Generate recommendations using AI if there's enough data
  let recommendations: Recommendation[] = [];

  // Add recommendations based on question consistency
  for (const qc of questionConsistency) {
    if (qc.consistencyRating === "inconsistent") {
      recommendations.push({
        type: "question_improvement",
        title: `Review Question ${qc.questionIndex + 1} for Consistency`,
        description: `This question shows high performance variance across collections (variance: ${qc.qualityVariance}). Consider rewording for more consistent results.`,
        relatedQuestions: [qc.questionIndex],
        priority: "high",
      });
    }
    if (
      qc.avgQualityAcrossCollections < 50 &&
      qc.avgQualityAcrossCollections > 0
    ) {
      recommendations.push({
        type: "question_improvement",
        title: `Improve Question ${qc.questionIndex + 1}`,
        description: `This question has a consistently low quality score (${qc.avgQualityAcrossCollections}%) across collections.`,
        relatedQuestions: [qc.questionIndex],
        priority: "medium",
      });
    }
  }

  // Limit recommendations
  recommendations = recommendations.slice(0, 10);

  console.log("[Barbara] Template analytics complete:", {
    collections: collectionPerformance.length,
    themes: aggregatedThemes.length,
    keyFindings: keyFindings.length,
    consensusPoints: consensusPoints.length,
    divergencePoints: divergencePoints.length,
    recommendations: recommendations.length,
  });

  return {
    collectionPerformance,
    questionConsistency,
    aggregatedThemes,
    keyFindings,
    consensusPoints,
    divergencePoints,
    templateEffectiveness: {
      totalSessions,
      totalCollections: collectionsWithAnalytics.length,
      avgQualityScore,
      avgSessionDuration,
      avgCompletionRate: 100, // TODO: Calculate from actual data
      sentimentDistribution,
    },
    recommendations,
  };
}

function createEmptyTemplateAnalytics(): Omit<
  TemplateAnalytics,
  "generatedAt"
> {
  return {
    collectionPerformance: [],
    questionConsistency: [],
    aggregatedThemes: [],
    keyFindings: [],
    consensusPoints: [],
    divergencePoints: [],
    templateEffectiveness: {
      totalSessions: 0,
      totalCollections: 0,
      avgQualityScore: 0,
      avgSessionDuration: 0,
      avgCompletionRate: 0,
      sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
    },
    recommendations: [],
  };
}

function getMajoritySentiment(sentiments: ThemeSentiment[]): ThemeSentiment {
  const counts: Record<ThemeSentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    mixed: 0,
  };
  for (const s of sentiments) {
    counts[s]++;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][0] as ThemeSentiment;
}

// Project Analytics Generation
import type {
  ProjectAnalytics,
  TemplatePerformanceSummary,
  CrossTemplateTheme,
  InterviewTemplate,
  Question,
} from "@shared/schema";

export interface ProjectAnalyticsInput {
  templates: {
    template: InterviewTemplate;
    questions: Question[];
    analytics: TemplateAnalytics | null;
    collectionCount: number;
    totalSessions: number;
  }[];
  projectName: string;
  projectObjective: string;
  strategicContext?: string;
  contextType?: string;
}

const PROJECT_ANALYTICS_TIMEOUT_MS = 240000; // 4 minutes for complex AI analysis

export async function generateProjectAnalytics(
  input: ProjectAnalyticsInput,
  usageContext?: LLMUsageAttribution,
): Promise<Omit<ProjectAnalytics, "generatedAt">> {
  console.log("[Barbara] Starting project analytics generation...");

  const templatesWithAnalytics = input.templates.filter(
    (t) => t.analytics !== null,
  );

  if (templatesWithAnalytics.length === 0) {
    console.log(
      "[Barbara] No templates with analytics found, returning empty project analytics",
    );
    return createEmptyProjectAnalytics();
  }

  // Build template performance summaries
  const templatePerformance: TemplatePerformanceSummary[] =
    templatesWithAnalytics.map((t) => ({
      templateId: t.template.id,
      templateName: t.template.name,
      collectionCount: t.collectionCount,
      totalSessions: t.totalSessions,
      avgQualityScore: t.analytics!.templateEffectiveness.avgQualityScore,
      topThemes: t
        .analytics!.aggregatedThemes.slice(0, 3)
        .map((th) => th.theme),
      sentimentDistribution:
        t.analytics!.templateEffectiveness.sentimentDistribution,
    }));

  // Calculate project-wide metrics
  const totalTemplates = templatesWithAnalytics.length;
  const totalCollections = templatesWithAnalytics.reduce(
    (sum, t) => sum + t.collectionCount,
    0,
  );
  const totalSessions = templatesWithAnalytics.reduce(
    (sum, t) => sum + t.totalSessions,
    0,
  );
  const avgQualityScore =
    totalTemplates > 0
      ? Math.round(
          templatesWithAnalytics.reduce(
            (sum, t) =>
              sum + t.analytics!.templateEffectiveness.avgQualityScore,
            0,
          ) / totalTemplates,
        )
      : 0;
  const avgSessionDuration =
    totalTemplates > 0
      ? Math.round(
          templatesWithAnalytics.reduce(
            (sum, t) =>
              sum + t.analytics!.templateEffectiveness.avgSessionDuration,
            0,
          ) / totalTemplates,
        )
      : 0;

  const sentimentAgg = { positive: 0, neutral: 0, negative: 0 };
  for (const t of templatesWithAnalytics) {
    sentimentAgg.positive +=
      t.analytics!.templateEffectiveness.sentimentDistribution.positive;
    sentimentAgg.neutral +=
      t.analytics!.templateEffectiveness.sentimentDistribution.neutral;
    sentimentAgg.negative +=
      t.analytics!.templateEffectiveness.sentimentDistribution.negative;
  }
  const total =
    sentimentAgg.positive + sentimentAgg.neutral + sentimentAgg.negative;
  const sentimentDistribution =
    total > 0
      ? {
          positive: Math.round((sentimentAgg.positive / total) * 100),
          neutral: Math.round((sentimentAgg.neutral / total) * 100),
          negative: Math.round((sentimentAgg.negative / total) * 100),
        }
      : { positive: 0, neutral: 0, negative: 0 };

  // Extract cross-template themes using AI
  const aiAnalysis = await extractCrossTemplateThemesWithAI(
    input,
    templatesWithAnalytics,
    usageContext,
  );

  // Generate recommendations
  const recommendations: Recommendation[] = [];

  // Add recommendations based on template performance
  for (const tp of templatePerformance) {
    if (tp.avgQualityScore < 50 && tp.avgQualityScore > 0) {
      recommendations.push({
        type: "question_improvement",
        title: `Review Template "${tp.templateName}"`,
        description: `This template has a lower quality score (${tp.avgQualityScore}%) compared to others. Consider revising questions.`,
        priority: "medium",
      });
    }
  }

  // Add recommendations from AI insights
  if (aiAnalysis.crossTemplateThemes.some((t) => t.isStrategic)) {
    const strategicThemes = aiAnalysis.crossTemplateThemes.filter(
      (t) => t.isStrategic,
    );
    for (const theme of strategicThemes.slice(0, 2)) {
      recommendations.push({
        type: "explore_deeper",
        title: `Strategic Theme: "${theme.theme}"`,
        description: theme.description,
        relatedThemes: [theme.id],
        priority: "high",
      });
    }
  }

  console.log("[Barbara] Project analytics complete:", {
    templates: templatePerformance.length,
    crossTemplateThemes: aiAnalysis.crossTemplateThemes.length,
    strategicInsights: aiAnalysis.strategicInsights.length,
    recommendations: recommendations.length,
  });

  return {
    templatePerformance,
    crossTemplateThemes: aiAnalysis.crossTemplateThemes,
    strategicInsights: aiAnalysis.strategicInsights,
    executiveSummary: aiAnalysis.executiveSummary,
    projectMetrics: {
      totalTemplates,
      totalCollections,
      totalSessions,
      avgQualityScore,
      avgSessionDuration,
      sentimentDistribution,
    },
    recommendations: recommendations.slice(0, 10),
    contextualRecommendations: aiAnalysis.contextualRecommendations,
  };
}

interface AIProjectAnalysisResult {
  crossTemplateThemes: CrossTemplateTheme[];
  strategicInsights: {
    insight: string;
    significance: string;
    supportingTemplates: string[];
    verbatims: ThemeVerbatim[];
  }[];
  executiveSummary: {
    headline: string;
    keyTakeaways: string[];
    recommendedActions: string[];
  };
  contextualRecommendations?: {
    contextType: string;
    strategicContext: string;
    actionItems: {
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      relatedThemes: string[];
      suggestedContent?: string;
    }[];
    curatedVerbatims: {
      quote: string;
      usageNote: string;
      theme: string;
    }[];
    strategicSummary: string;
  };
}

async function extractCrossTemplateThemesWithAI(
  input: ProjectAnalyticsInput,
  templatesWithAnalytics: ProjectAnalyticsInput["templates"],
  usageContext?: LLMUsageAttribution,
): Promise<AIProjectAnalysisResult> {
  if (templatesWithAnalytics.length === 0) {
    return {
      crossTemplateThemes: [],
      strategicInsights: [],
      executiveSummary: {
        headline: "No data available",
        keyTakeaways: [],
        recommendedActions: [],
      },
    };
  }

  // Build enriched template data summary for AI with full detail
  const templateSummaries = templatesWithAnalytics.map((t) => {
    const analytics = t.analytics!;

    // Include template questions (limit to prevent token overflow)
    const questionsData = (t.questions || [])
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .slice(0, 15)
      .map((q) => ({
        index: q.orderIndex,
        question: q.questionText,
        type: q.questionType,
        guidance: q.guidance || undefined,
      }));

    // Include full theme data with descriptions, verbatims, and depth
    const themesData = analytics.aggregatedThemes.slice(0, 10).map((th) => ({
      theme: th.theme,
      description: th.description,
      mentions: th.totalMentions,
      collectionsAppeared: th.collectionsAppeared,
      prevalence: th.avgPrevalence,
      sentiment: th.sentiment,
      sentimentBreakdown: th.sentimentBreakdown,
      depth: th.depth,
      isEmergent: th.isEmergent,
      verbatims: th.verbatims.slice(0, 3).map((v) => ({
        quote: v.quote,
        sentiment: v.sentiment,
      })),
    }));

    // Include key findings with their verbatims
    const keyFindingsData = analytics.keyFindings.slice(0, 8).map((f) => ({
      finding: f.finding,
      significance: f.significance,
      relatedThemes: f.relatedThemes,
      sourceCollection: f.sourceCollectionName,
      verbatims: (f.supportingVerbatims || []).slice(0, 2).map((v) => ({
        quote: v.quote,
        sentiment: v.sentiment,
      })),
    }));

    // Include consensus points showing agreement
    const consensusData = analytics.consensusPoints.slice(0, 6).map((cp) => ({
      topic: cp.topic,
      position: cp.position,
      agreementLevel: cp.agreementLevel,
      sourceCollection: cp.sourceCollectionName,
      verbatims: (cp.verbatims || []).slice(0, 2).map((v) => ({
        quote: v.quote,
        sentiment: v.sentiment,
      })),
    }));

    // Include divergence points showing disagreement
    const divergenceData = analytics.divergencePoints.slice(0, 6).map((dp) => ({
      topic: dp.topic,
      perspectives: dp.perspectives.slice(0, 3).map((p) => ({
        position: p.position,
        count: p.count,
        verbatims: (p.verbatims || []).slice(0, 2).map((v) => ({
          quote: v.quote,
          sentiment: v.sentiment,
        })),
      })),
      sourceCollection: dp.sourceCollectionName,
    }));

    // Include question consistency data with representative verbatims
    const questionConsistencyData = analytics.questionConsistency
      .slice(0, 10)
      .map((qc) => ({
        questionIndex: qc.questionIndex,
        questionText: qc.questionText,
        avgQuality: qc.avgQualityAcrossCollections,
        consistencyRating: qc.consistencyRating,
        primaryThemes: qc.primaryThemes,
        verbatims: (qc.verbatims || []).slice(0, 2).map((v) => ({
          quote: v.quote,
          sentiment: v.sentiment,
        })),
      }));

    return {
      templateId: t.template.id,
      templateName: t.template.name,
      objective: t.template.objective || "",
      questions: questionsData,
      themes: themesData,
      keyFindings: keyFindingsData,
      consensusPoints: consensusData,
      divergencePoints: divergenceData,
      questionConsistency: questionConsistencyData,
      effectiveness: {
        qualityScore: analytics.templateEffectiveness.avgQualityScore,
        totalSessions: analytics.templateEffectiveness.totalSessions,
        totalCollections: analytics.templateEffectiveness.totalCollections,
        sentimentDistribution:
          analytics.templateEffectiveness.sentimentDistribution,
      },
    };
  });

  // Build strategic context section if provided
  const hasStrategicContext =
    input.strategicContext && input.strategicContext.trim().length > 0;
  const contextTypeLabel = input.contextType
    ? {
        content: "Content Strategy (newsletters, blogs, social media)",
        product: "Product Development (features, roadmap)",
        marketing: "Marketing Campaign (campaigns, targeting)",
        cx: "Customer Experience (support, onboarding)",
        other: "Custom Business Context",
      }[input.contextType] || input.contextType
    : null;

  const strategicContextSection = hasStrategicContext
    ? `

STRATEGIC BUSINESS CONTEXT:
Context Type: ${contextTypeLabel || "Not specified"}
Business Context: ${input.strategicContext}

When strategic context is provided, you MUST also generate a "contextualRecommendations" section that tailors insights specifically to this business context. Frame recommendations as actionable items for this specific use case.`
    : "";

  const contextualRecommendationsSchema = hasStrategicContext
    ? `,
  "contextualRecommendations": {
    "contextType": "${input.contextType || "other"}",
    "strategicContext": "Brief summary of the strategic context",
    "actionItems": [
      {
        "title": "Specific action item title",
        "description": "Detailed description of what to do and why",
        "priority": "high" | "medium" | "low",
        "relatedThemes": ["theme_id_1"],
        "suggestedContent": "For content contexts: specific content idea/topic derived from the data"
      }
    ],
    "curatedVerbatims": [
      {
        "quote": "A quote particularly useful for the business context (newsletter-ready, marketing copy, etc.)",
        "usageNote": "How this quote could be used (e.g., 'Great for newsletter intro', 'Social media testimonial')",
        "theme": "Related theme name"
      }
    ],
    "strategicSummary": "A paragraph summarizing how the research findings apply to the specific business goal"
  }`
    : "";

  const systemPrompt = `You are Barbara, a strategic research analyst. Your task is to analyze comprehensive interview data across multiple interview templates within a project and identify cross-cutting themes, strategic insights, and actionable recommendations.

You are provided with rich data for each template including:
- The interview questions used
- Aggregated themes with verbatims and sentiment analysis
- Key findings identified at the collection level
- Consensus points (where participants agreed)
- Divergence points (where participants disagreed)
- Question consistency metrics across collections${strategicContextSection}

IMPORTANT: For all verbatims/quotes in your output, apply PII anonymization:
- Replace names with [Name]
- Replace locations/cities with [Location]
- Replace company names with [Company]
- Replace specific dates with [Date]

Return a JSON object with this exact structure:
{
  "crossTemplateThemes": [
    {
      "id": "theme_1",
      "theme": "Brief theme name (2-5 words)",
      "description": "One sentence description synthesizing how this theme manifests across templates",
      "templatesAppeared": ["template_id_1", "template_id_2"],
      "totalMentions": number,
      "avgPrevalence": number (0-100),
      "sentiment": "positive" | "negative" | "neutral" | "mixed",
      "isStrategic": boolean (true if high-impact across multiple interview types),
      "verbatims": [
        {
          "quote": "Include 3-5 representative quotes from the provided verbatims (with PII removed) that best illustrate this theme",
          "questionIndex": 0,
          "sessionId": "",
          "sentiment": "positive" | "negative" | "neutral" | "mixed"
        }
      ]
    }
  ],
  "strategicInsights": [
    {
      "insight": "Key strategic finding derived from cross-template analysis",
      "significance": "Why this matters for the business/research objectives",
      "supportingTemplates": ["template_id_1"],
      "verbatims": [
        {
          "quote": "Include 2-3 supporting quotes from the provided verbatims (with PII removed) that evidence this insight",
          "questionIndex": 0,
          "sessionId": "",
          "sentiment": "positive" | "negative" | "neutral" | "mixed"
        }
      ]
    }
  ],
  "executiveSummary": {
    "headline": "One compelling sentence summarizing the project findings",
    "keyTakeaways": ["3-5 key points for stakeholders, grounded in the data"],
    "recommendedActions": ["2-3 actionable recommendations based on the findings"]
  }${contextualRecommendationsSchema}
}

ANALYSIS GUIDANCE:
1. Look for themes that appear across MULTIPLE templates - these are the most valuable cross-cutting insights
2. Synthesize consensus and divergence points across templates to identify patterns
3. Use the provided verbatims to ground your insights - include representative quotes in your output
4. Connect findings back to the project objective when identifying strategic implications
5. Consider question consistency data to identify which interview approaches yielded the richest insights
6. Generate actionable recommendations that address the key themes and findings
7. Ensure your executive summary would be suitable for stakeholder presentation${
    hasStrategicContext
      ? `
8. When strategic context is provided, generate contextualRecommendations that are specifically tailored to the business context
9. For content strategy contexts, include content ideas, newsletter topics, or social media angles derived from the research
10. Curate verbatims that would be particularly useful for the stated business purpose (e.g., testimonial-ready quotes for marketing)`
      : ""
  }`;

  const userPrompt = `PROJECT: ${input.projectName}
OBJECTIVE: ${input.projectObjective || "Not specified"}${
    hasStrategicContext
      ? `
STRATEGIC CONTEXT TYPE: ${contextTypeLabel || "Not specified"}
STRATEGIC CONTEXT: ${input.strategicContext}`
      : ""
  }

TEMPLATE DATA:
${JSON.stringify(templateSummaries, null, 2)}

Analyze this comprehensive template data to identify:
1. Cross-cutting themes that appear across multiple templates
2. Strategic insights derived from the aggregated findings, consensus, and divergence points
3. An executive summary with key takeaways and recommended actions${
    hasStrategicContext
      ? `
4. Contextual recommendations tailored specifically to the strategic business context provided`
      : ""
  }

Pay special attention to the verbatims provided - use them to support your insights and include representative quotes in your output.${hasStrategicContext ? ` Ensure contextual recommendations are actionable and directly tied to the business goal of "${input.strategicContext?.substring(0, 100)}..."` : ""}`;

  try {
    const config = barbaraConfig.projectAnalytics;

    // Log data richness for debugging
    const dataStats = templateSummaries.map((t) => ({
      template: t.templateName,
      questions: t.questions.length,
      themes: t.themes.length,
      keyFindings: t.keyFindings.length,
      consensusPoints: t.consensusPoints.length,
      divergencePoints: t.divergencePoints.length,
      questionConsistency: t.questionConsistency.length,
    }));
    console.log(
      "[Project Analytics] Enriched template data stats:",
      JSON.stringify(dataStats, null, 2),
    );

    // Estimate token count (rough: ~4 chars per token)
    const templateDataStr = JSON.stringify(templateSummaries);
    const estimatedTokens = Math.ceil(templateDataStr.length / 4);
    console.log(
      `[Project Analytics] Estimated input tokens for template data: ~${estimatedTokens}`,
    );

    console.log(
      `[Project Analytics] Using model: ${config.model}, reasoning: ${config.reasoningEffort}`,
    );

    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_project_cross_template_analysis",
      timeoutMs: PROJECT_ANALYTICS_TIMEOUT_MS,
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 20000,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<typeof openai.chat.completions.create>[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log("[Project Analytics] Empty AI response, returning defaults");
      return createDefaultAIResult(input.projectName);
    }

    const parsed = JSON.parse(content);

    // Validate and transform the response
    const crossTemplateThemes: CrossTemplateTheme[] = (
      parsed.crossTemplateThemes || []
    )
      .slice(0, 10)
      .map((t: any, idx: number) => ({
        id: t.id || `cross_theme_${idx + 1}`,
        theme: t.theme || "",
        description: t.description || "",
        templatesAppeared: Array.isArray(t.templatesAppeared)
          ? t.templatesAppeared
          : [],
        totalMentions: t.totalMentions || 0,
        avgPrevalence: Math.min(100, Math.max(0, t.avgPrevalence || 0)),
        sentiment: validateSentiment(t.sentiment),
        isStrategic: Boolean(t.isStrategic),
        verbatims: (t.verbatims || []).slice(0, 5).map((v: any) => ({
          quote: v.quote || "",
          questionIndex: v.questionIndex || 0,
          sessionId: v.sessionId || "",
          sentiment: validateSentiment(v.sentiment),
        })),
      }));

    const strategicInsights = (parsed.strategicInsights || [])
      .slice(0, 5)
      .map((s: any) => ({
        insight: s.insight || "",
        significance: s.significance || "",
        supportingTemplates: Array.isArray(s.supportingTemplates)
          ? s.supportingTemplates
          : [],
        verbatims: (s.verbatims || []).slice(0, 3).map((v: any) => ({
          quote: v.quote || "",
          questionIndex: v.questionIndex || 0,
          sessionId: v.sessionId || "",
          sentiment: validateSentiment(v.sentiment),
        })),
      }));

    const executiveSummary = {
      headline:
        parsed.executiveSummary?.headline || `Analysis of ${input.projectName}`,
      keyTakeaways: Array.isArray(parsed.executiveSummary?.keyTakeaways)
        ? parsed.executiveSummary.keyTakeaways.slice(0, 5)
        : [],
      recommendedActions: Array.isArray(
        parsed.executiveSummary?.recommendedActions,
      )
        ? parsed.executiveSummary.recommendedActions.slice(0, 3)
        : [],
    };

    // Parse contextual recommendations if present
    let contextualRecommendations: AIProjectAnalysisResult["contextualRecommendations"] =
      undefined;
    if (parsed.contextualRecommendations) {
      const cr = parsed.contextualRecommendations;
      contextualRecommendations = {
        contextType: cr.contextType || "other",
        strategicContext: cr.strategicContext || "",
        actionItems: (cr.actionItems || []).slice(0, 10).map((item: any) => ({
          title: item.title || "",
          description: item.description || "",
          priority: ["high", "medium", "low"].includes(item.priority)
            ? item.priority
            : "medium",
          relatedThemes: Array.isArray(item.relatedThemes)
            ? item.relatedThemes
            : [],
          suggestedContent: item.suggestedContent || undefined,
        })),
        curatedVerbatims: (cr.curatedVerbatims || [])
          .slice(0, 10)
          .map((v: any) => ({
            quote: v.quote || "",
            usageNote: v.usageNote || "",
            theme: v.theme || "",
          })),
        strategicSummary: cr.strategicSummary || "",
      };
    }

    return {
      crossTemplateThemes,
      strategicInsights,
      executiveSummary,
      contextualRecommendations,
    };
  } catch (error) {
    console.error("[Project Analytics] AI analysis failed:", error);
    return createDefaultAIResult(input.projectName);
  }
}

function createDefaultAIResult(projectName: string): AIProjectAnalysisResult {
  return {
    crossTemplateThemes: [],
    strategicInsights: [],
    executiveSummary: {
      headline: `Analysis of ${projectName}`,
      keyTakeaways: ["Insufficient data for cross-template analysis"],
      recommendedActions: [
        "Run more interviews across templates to enable cross-template insights",
      ],
    },
  };
}

function createEmptyProjectAnalytics(): Omit<ProjectAnalytics, "generatedAt"> {
  return {
    templatePerformance: [],
    crossTemplateThemes: [],
    strategicInsights: [],
    executiveSummary: {
      headline: "No data available",
      keyTakeaways: [],
      recommendedActions: [],
    },
    projectMetrics: {
      totalTemplates: 0,
      totalCollections: 0,
      totalSessions: 0,
      avgQualityScore: 0,
      avgSessionDuration: 0,
      sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
    },
    recommendations: [],
  };
}

// Template Generation Types
export interface GeneratedQuestion {
  questionText: string;
  questionType: "open" | "yes_no" | "scale" | "numeric" | "multi_select";
  guidance: string;
  scaleMin?: number;
  scaleMax?: number;
  multiSelectOptions?: string[];
  timeHintSeconds?: number;
  recommendedFollowUps?: number;
}

export interface GeneratedTemplate {
  name: string;
  objective: string;
  tone: string;
  questions: GeneratedQuestion[];
}

export interface TemplateGenerationInput {
  projectName: string;
  description?: string | null;
  objective?: string | null;
  audienceContext?: string | null;
  contextType?: string | null;
  strategicContext?: string | null;
  tone?: string | null;
}

export async function generateTemplateFromProject(
  input: TemplateGenerationInput,
  usageContext?: LLMUsageAttribution,
): Promise<GeneratedTemplate> {
  console.log("[Barbara] Generating template from project:", input.projectName);

  const config = barbaraConfig.templateGeneration;

  const systemPrompt = `You are an expert research interview designer. Generate interview templates that elicit rich, actionable insights from respondents.

Output JSON with this exact structure:
{
  "name": "Template name based on research focus",
  "objective": "1-2 sentence interview objective",
  "tone": "professional|friendly|empathetic|neutral",
  "questions": [
    {
      "questionText": "The question to ask",
      "questionType": "open|yes_no|scale|numeric|multi_select",
      "guidance": "Instructions for the AI interviewer on what to probe",
      "scaleMin": 1,
      "scaleMax": 10,
      "multiSelectOptions": [],
      "timeHintSeconds": 60,
      "recommendedFollowUps": 2
    }
  ]
}

Guidelines:
- Generate 5-8 questions covering the research objectives
- Start with rapport-building, end with wrap-up/future questions
- Use "open" type for exploratory questions (most common)
- Use "scale" for satisfaction/rating questions (include scaleMin and scaleMax)
- Use "yes_no" sparingly for filtering questions
- Use "multi_select" only when specific options should be provided
- Write guidance that helps probe deeper on key themes
- Match tone to the project's specified tone or default to professional
- timeHintSeconds should be 30-120 based on question depth
- recommendedFollowUps should be 1-3 based on question importance`;

  const hasContent =
    input.description || input.objective || input.audienceContext;

  const userPrompt = `Generate an interview template for this research project:

PROJECT NAME: ${input.projectName}
${input.description ? `DESCRIPTION: ${input.description}` : ""}
${input.objective ? `RESEARCH OBJECTIVES: ${input.objective}` : ""}
${input.audienceContext ? `TARGET AUDIENCE: ${input.audienceContext}` : ""}
${input.contextType ? `CONTEXT TYPE: ${input.contextType}` : ""}
${input.strategicContext ? `STRATEGIC CONTEXT: ${input.strategicContext}` : ""}
${input.tone ? `PREFERRED TONE: ${input.tone}` : ""}

${hasContent ? `Focus questions on achieving the research objectives while keeping the target audience in mind.${input.contextType ? ` The context type is "${input.contextType}" so frame questions appropriately for ${input.contextType} research.` : ""}` : "Generate a general interview template based on the project name, suitable for exploratory research."}`;

  try {
    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_template_generation",
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 10000,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<
          typeof openai.chat.completions.create
        >[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in response");
    }

    const parsed = JSON.parse(content);

    const validatedQuestions: GeneratedQuestion[] = (
      parsed.questions || []
    ).map((q: any, idx: number) => ({
      questionText: q.questionText || `Question ${idx + 1}`,
      questionType: [
        "open",
        "yes_no",
        "scale",
        "numeric",
        "multi_select",
      ].includes(q.questionType)
        ? q.questionType
        : "open",
      guidance: q.guidance || "",
      scaleMin: q.questionType === "scale" ? q.scaleMin || 1 : undefined,
      scaleMax: q.questionType === "scale" ? q.scaleMax || 10 : undefined,
      multiSelectOptions:
        q.questionType === "multi_select"
          ? q.multiSelectOptions || []
          : undefined,
      timeHintSeconds: q.timeHintSeconds || 60,
      recommendedFollowUps: q.recommendedFollowUps || 2,
    }));

    const result: GeneratedTemplate = {
      name: parsed.name || `${input.projectName} Template`,
      objective: parsed.objective || input.objective || "",
      tone: ["professional", "friendly", "empathetic", "neutral"].includes(
        parsed.tone,
      )
        ? parsed.tone
        : input.tone || "professional",
      questions:
        validatedQuestions.length > 0
          ? validatedQuestions
          : getDefaultQuestions(),
    };

    console.log("[Barbara] Template generation complete:", {
      name: result.name,
      questionCount: result.questions.length,
    });

    return result;
  } catch (error) {
    console.error("[Barbara] Template generation failed:", error);
    throw new Error("Failed to generate template. Please try again.");
  }
}

function getDefaultQuestions(): GeneratedQuestion[] {
  return [
    {
      questionText:
        "Can you tell me a bit about yourself and your experience with this topic?",
      questionType: "open",
      guidance: "Build rapport and understand background context",
      timeHintSeconds: 60,
      recommendedFollowUps: 2,
    },
    {
      questionText: "What has been your overall experience so far?",
      questionType: "open",
      guidance: "Understand general impressions and satisfaction",
      timeHintSeconds: 90,
      recommendedFollowUps: 2,
    },
    {
      questionText: "What challenges or pain points have you encountered?",
      questionType: "open",
      guidance: "Probe for specific issues and their impact",
      timeHintSeconds: 90,
      recommendedFollowUps: 3,
    },
    {
      questionText:
        "What improvements would make the biggest difference for you?",
      questionType: "open",
      guidance: "Identify priorities and desired outcomes",
      timeHintSeconds: 90,
      recommendedFollowUps: 2,
    },
    {
      questionText: "Is there anything else you'd like to share?",
      questionType: "open",
      guidance: "Allow respondent to add anything missed",
      timeHintSeconds: 60,
      recommendedFollowUps: 1,
    },
  ];
}

// Additional Questions Generation - generates follow-up questions at end of interview
export interface AdditionalQuestionsInput {
  transcriptLog: TranscriptEntry[];
  templateQuestions: Array<{
    text: string;
    guidance: string | null;
  }>;
  questionSummaries: QuestionSummary[];
  projectObjective: string;
  audienceContext: string | null;
  tone: string | null;
  maxQuestions: number;
  crossInterviewContext?: {
    enabled: boolean;
    priorSessionSummaries?: Array<{
      sessionId: string;
      summaries: QuestionSummary[];
    }>;
  };
  analyticsHypotheses?: Array<{
    hypothesis: string;
    source: string;
    priority: string;
  }>;
}

export interface GeneratedAdditionalQuestion {
  questionText: string;
  rationale: string;
  questionType: "open";
  index: number;
}

export interface AdditionalQuestionsResult {
  questions: GeneratedAdditionalQuestion[];
  barbaraModel: string;
  usedCrossInterviewContext: boolean;
  priorSessionCount: number;
}

export async function generateAdditionalQuestions(
  input: AdditionalQuestionsInput,
  usageContext?: LLMUsageAttribution,
): Promise<AdditionalQuestionsResult> {
  const config = barbaraConfig.additionalQuestions;
  const startTime = Date.now();

  // If maxQuestions is 0, return empty immediately
  if (input.maxQuestions <= 0) {
    return {
      questions: [],
      barbaraModel: config.model,
      usedCrossInterviewContext: false,
      priorSessionCount: 0,
    };
  }

  try {
    const systemPrompt = buildAdditionalQuestionsSystemPrompt(input);
    const userPrompt = buildAdditionalQuestionsUserPrompt(input);

    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_additional_questions",
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 20000,
          reasoning_effort: config.reasoningEffort,
          verbosity: config.verbosity,
        } as Parameters<typeof openai.chat.completions.create>[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log("[Barbara] No content in additional questions response");
      return {
        questions: [],
        barbaraModel: config.model,
        usedCrossInterviewContext:
          input.crossInterviewContext?.enabled ?? false,
        priorSessionCount:
          input.crossInterviewContext?.priorSessionSummaries?.length ?? 0,
      };
    }

    const parsed = JSON.parse(content) as {
      questions: Array<{
        questionText: string;
        rationale: string;
      }>;
      noQuestionsNeeded?: boolean;
      reason?: string;
    };

    // If Barbara determined no questions are needed
    if (
      parsed.noQuestionsNeeded ||
      !parsed.questions ||
      parsed.questions.length === 0
    ) {
      console.log(
        `[Barbara] No additional questions needed: ${parsed.reason || "Coverage adequate"}`,
      );
      return {
        questions: [],
        barbaraModel: config.model,
        usedCrossInterviewContext:
          input.crossInterviewContext?.enabled ?? false,
        priorSessionCount:
          input.crossInterviewContext?.priorSessionSummaries?.length ?? 0,
      };
    }

    // Limit to maxQuestions and format the response
    const questions: GeneratedAdditionalQuestion[] = parsed.questions
      .slice(0, input.maxQuestions)
      .map((q, index) => ({
        questionText: q.questionText,
        rationale: q.rationale,
        questionType: "open" as const,
        index,
      }));

    const elapsed = Date.now() - startTime;
    console.log(
      `[Barbara] Generated ${questions.length} additional questions in ${elapsed}ms`,
    );

    return {
      questions,
      barbaraModel: config.model,
      usedCrossInterviewContext: input.crossInterviewContext?.enabled ?? false,
      priorSessionCount:
        input.crossInterviewContext?.priorSessionSummaries?.length ?? 0,
    };
  } catch (error) {
    console.error("[Barbara] Error generating additional questions:", error);
    // Graceful degradation - return empty array on error
    return {
      questions: [],
      barbaraModel: config.model,
      usedCrossInterviewContext: false,
      priorSessionCount: 0,
    };
  }
}

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

  return `You are Barbara, an expert research interview analyst. Your task is to review a completed interview and determine if there are any valuable additional questions to ask before the interview concludes.

CRITICAL RULES:
1. DO NOT repeat or rephrase any question that was already asked in the original template
2. DO NOT ask questions that were adequately covered in the respondent's answers
3. Only suggest questions that will provide genuinely NEW insights
4. Questions must be open-ended and conversational in tone
5. Maximum ${input.maxQuestions} additional question(s) - you may return fewer or zero if coverage is adequate

WHEN TO SUGGEST QUESTIONS:
- Important topics mentioned briefly but not explored in depth
- Interesting tangents the respondent hinted at but weren't followed up
- Gaps between the research objective and what was actually discussed
- Contradictions or ambiguities that could benefit from clarification
${crossInterviewSection}${analyticsHypothesesSection}

WHEN TO RETURN ZERO QUESTIONS:
- The interview comprehensively covered the research objective
- All important topics were explored to sufficient depth
- The respondent showed fatigue or limited engagement
- Adding more questions would not meaningfully enhance the research

Respond with a JSON object containing:
{
  "noQuestionsNeeded": boolean, // true if no additional questions needed
  "reason": string, // Brief explanation of your decision
  "questions": [
    {
      "questionText": string, // The question to ask (conversational tone)
      "rationale": string // Why this question adds value (for researcher reference)
    }
  ]
}`;
}

function buildAdditionalQuestionsUserPrompt(
  input: AdditionalQuestionsInput,
): string {
  // Format the template questions
  const templateQuestionsText = input.templateQuestions
    .map(
      (q, i) =>
        `Q${i + 1}: ${q.text}${q.guidance ? ` (Guidance: ${q.guidance})` : ""}`,
    )
    .join("\n");

  // Format the question summaries
  const summariesText = input.questionSummaries
    .map((s) => {
      const insights =
        s.keyInsights?.length > 0
          ? `Key insights: ${s.keyInsights.join("; ")}`
          : "";
      return `Q${s.questionIndex + 1} Summary: ${s.respondentSummary}\n${insights}\nCompleteness: ${s.completenessAssessment}`;
    })
    .join("\n\n");

  // Format transcript (condensed)
  const transcriptText = input.transcriptLog
    .map(
      (t) => `[Q${t.questionIndex + 1}] ${t.speaker.toUpperCase()}: ${t.text}`,
    )
    .join("\n");

  // Format cross-interview context if available
  let crossInterviewText = "";
  if (
    input.crossInterviewContext?.enabled &&
    input.crossInterviewContext.priorSessionSummaries
  ) {
    const priorSummaries = input.crossInterviewContext.priorSessionSummaries;
    if (priorSummaries.length > 0) {
      crossInterviewText = `\n\n=== PRIOR INTERVIEW INSIGHTS (${priorSummaries.length} sessions) ===\n`;

      // Aggregate themes from prior sessions
      const allInsights: string[] = [];
      priorSummaries.forEach((session, idx) => {
        session.summaries.forEach((s) => {
          if (s.keyInsights) {
            allInsights.push(
              ...s.keyInsights.map((insight) => `P${idx + 1}: ${insight}`),
            );
          }
        });
      });

      // Take top insights to avoid overwhelming context
      const topInsights = allInsights.slice(0, 15);
      crossInterviewText += `Key themes from prior respondents:\n${topInsights.join("\n")}`;
    }
  }

  let analyticsHypothesesText = "";
  if (input.analyticsHypotheses?.length) {
    analyticsHypothesesText = `\n\n=== PROJECT ANALYTICS HYPOTHESES ===\n`;
    analyticsHypothesesText += "These hypotheses from project-level analytics may warrant testing:\n";
    for (const h of input.analyticsHypotheses) {
      analyticsHypothesesText += `- [${h.priority}] ${h.hypothesis}\n`;
    }
    analyticsHypothesesText += "\nConsider these when generating additional questions, but only if they add genuine value and weren't already covered.";
  }

  return `=== RESEARCH OBJECTIVE ===
${input.projectObjective}

=== AUDIENCE CONTEXT ===
${input.audienceContext || "General audience"}

=== INTERVIEW TONE ===
${input.tone || "Professional and conversational"}

=== ORIGINAL TEMPLATE QUESTIONS ===
${templateQuestionsText}

=== QUESTION SUMMARIES ===
${summariesText}

=== FULL TRANSCRIPT ===
${transcriptText}
${crossInterviewText}${analyticsHypothesesText}

Based on this interview, identify up to ${input.maxQuestions} additional question(s) that would add genuine value, or indicate if no additional questions are needed.`;
}

// --- End-of-Interview Session Summary ---

export interface SessionSummaryInput {
  transcript: TranscriptEntry[];
  questionSummaries: QuestionSummary[];
  templateObjective: string;
  projectObjective?: string;
  strategicContext?: string;
  questions: Array<{ text: string; guidance: string | null }>;
}

export async function generateSessionSummary(
  input: SessionSummaryInput,
  usageContext?: LLMUsageAttribution,
): Promise<BarbaraSessionSummary> {
  const config = barbaraConfig.sessionSummary;

  const transcriptText = input.transcript
    .map((e) => `[${e.speaker === "alvia" ? "Interviewer" : "Respondent"}] ${e.text}`)
    .join("\n");

  const summariesText = input.questionSummaries
    .map((s) => `Q${s.questionIndex + 1} (${s.questionText}): ${s.respondentSummary}`)
    .join("\n\n");

  const questionsText = input.questions
    .map((q, i) => `Q${i + 1}: ${q.text}`)
    .join("\n");

  const systemPrompt = `You are Barbara, a research analyst reviewing a completed interview. Your role is to provide a rigorous, evidence-based analysis — not a conversational summary.

You are evaluating an interview conducted by an AI interviewer (Alvia). Your analysis should be independent and critical.

Output ONLY valid JSON matching this exact structure:
{
  "themes": [
    {
      "theme": "short theme name",
      "description": "one-sentence description of the theme",
      "supportingEvidence": ["direct quote or paraphrase from transcript"],
      "sentiment": "positive" | "negative" | "neutral" | "mixed"
    }
  ],
  "overallSummary": "3-5 sentence analytical narrative of key findings, patterns, and notable observations",
  "objectiveSatisfaction": {
    "rating": 0-100,
    "assessment": "How well the interview addressed the research objectives, with specific reasoning",
    "coveredObjectives": ["objectives that were adequately addressed"],
    "gapsIdentified": ["objectives or areas that were not sufficiently explored"]
  },
  "respondentEngagement": {
    "level": "low" | "moderate" | "high",
    "notes": "Brief observation about response depth, willingness to elaborate, and overall engagement quality"
  }
}

Guidelines:
- Identify 2-6 themes based on substance, not quantity of mentions
- Supporting evidence should reference specific statements from the transcript
- The objective satisfaction rating should reflect how thoroughly the research objectives were addressed (0=not at all, 100=completely)
- Be specific about gaps — vague assessments are unhelpful
- Engagement assessment should be factual, not judgmental`;

  const userPrompt = `=== RESEARCH OBJECTIVE ===
${input.templateObjective}
${input.projectObjective ? `\n=== BROADER RESEARCH OBJECTIVE ===\n${input.projectObjective}` : ""}
${input.strategicContext ? `\n=== STRATEGIC CONTEXT ===\n${input.strategicContext}` : ""}

=== INTERVIEW QUESTIONS ===
${questionsText}

=== QUESTION-BY-QUESTION SUMMARIES ===
${summariesText}

=== FULL TRANSCRIPT ===
${transcriptText}

Analyze this interview and provide your structured assessment.`;

  try {
    const tracked = await withTrackedLlmCall({
      attribution: usageContext || {},
      provider: "openai",
      model: config.model,
      useCase: "barbara_session_summary",
      callFn: async () => {
        return (await openai.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        } as Parameters<
          typeof openai.chat.completions.create
        >[0])) as ChatCompletion;
      },
      extractUsage: makeBarbaraUsageExtractor(config.model),
    });
    const response = tracked.result;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from Barbara session summary");
    }

    const parsed = JSON.parse(content) as BarbaraSessionSummary;
    parsed.generatedAt = Date.now();
    parsed.model = config.model;

    console.log(
      `[Barbara] Session summary generated: ${parsed.themes.length} themes, objective rating: ${parsed.objectiveSatisfaction.rating}`,
    );

    return parsed;
  } catch (error) {
    console.error("[Barbara] Session summary generation failed:", error);
    throw error;
  }
}
