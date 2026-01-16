import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";

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

export interface TranscriptEntry {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
  questionIndex: number;
}

export interface QuestionMetrics {
  questionIndex: number;
  wordCount: number;
  activeTimeMs: number;
  turnCount: number;
  startedAt: number | null;
}

export interface BarbaraGuidance {
  action:
    | "acknowledge_prior"
    | "probe_followup"
    | "suggest_next_question"
    | "time_reminder"
    | "none";
  message: string;
  confidence: number;
  reasoning: string;
}

interface BarbaraAnalysisInput {
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
}

export async function analyzeWithBarbara(
  input: BarbaraAnalysisInput,
): Promise<BarbaraGuidance> {
  try {
    const systemPrompt = buildBarbaraSystemPrompt();
    const userPrompt = buildBarbaraUserPrompt(input);

    const config = barbaraConfig.analysis;
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
      reasoning_effort: config.reasoningEffort,
      verbosity: config.verbosity,
    } as Parameters<typeof openai.chat.completions.create>[0]) as ChatCompletion;

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
  return `You are Barbara, an intelligent interview orchestrator. Your role is to monitor voice interviews conducted by Alvia (the AI interviewer) and provide strategic guidance.

IMPORTANT TIMING: Your guidance will be incorporated into Alvia's NEXT response, not her current one. The conversation continues while you analyze, so phrase your guidance to remain relevant even if the respondent says something else in the meantime.

Your responsibilities:
1. PRIOR CONTEXT DETECTION: Check if the respondent has already addressed parts of the current question earlier in the transcript. If so, Alvia should acknowledge this.
2. COMPLETENESS EVALUATION: Assess whether the respondent's answer to the current question is comprehensive based on the question's guidance criteria. If complete, suggest offering to move to the next question.
3. TIME/LENGTH MONITORING: If the response is running long (>2 minutes active time or >400 words), consider suggesting a move to the next question.
4. QUESTION DEDUPLICATION: Review the UPCOMING QUESTIONS list. If Alvia is about to ask a follow-up that overlaps with a future template question, guide her to avoid that topic - it will be covered later. This prevents repetitive questioning and maintains interview flow.

You must respond with a JSON object containing:
{
  "action": "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "none",
  "message": "A brief, natural instruction for Alvia (max 100 words)",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your decision"
}

Action meanings:
- "acknowledge_prior": The respondent mentioned something relevant earlier - remind Alvia to acknowledge this when appropriate
- "probe_followup": The answer lacks depth - suggest a specific follow-up probe for when the opportunity arises.
- "suggest_next_question": The answer appears complete - Alvia should offer to move on when there's a natural pause
- "time_reminder": The response is running long - suggest moving the next question gracefully
- "none": No intervention needed - let the conversation flow naturally

Be conservative - only intervene when there's a clear benefit. Most of the time, "none" is appropriate. Phrase guidance flexibly since the conversation may have progressed by the time Alvia uses it.`;
}

function buildBarbaraUserPrompt(input: BarbaraAnalysisInput): string {
  const transcriptSummary = input.transcriptLog
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

  // Build summaries text from available previous question summaries
  const summariesText = input.previousQuestionSummaries
    .filter((s) => s && s.questionIndex < input.currentQuestionIndex)
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

${summariesText ? `PREVIOUS QUESTIONS SUMMARY:\n${summariesText}\n\n` : ""}${previousQuestions ? `PREVIOUS QUESTIONS:\n${previousQuestions}\n\n` : ""}${upcomingQuestions ? `UPCOMING QUESTIONS (avoid asking follow-ups that overlap with these):\n${upcomingQuestions}\n` : ""}

FULL TRANSCRIPT SO FAR:
${transcriptSummary || "(No transcript yet)"}

RESPONDENT'S ANSWER TO CURRENT QUESTION:
${currentQuestionResponses || "(No response yet)"} //check this gets pushed

Based on this context, should Alvia receive any guidance? Respond with  your analysis in JSON format.`;
}

export function createEmptyMetrics(questionIndex: number): QuestionMetrics {
  return {
    questionIndex,
    wordCount: 0,
    activeTimeMs: 0,
    turnCount: 0,
    startedAt: null,
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

    let timedOut = false;
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => {
        timedOut = true;
        const elapsed = Date.now() - startTime;
        console.log(
          `[TopicOverlap] Detection timed out after ${elapsed}ms (limit: ${TOPIC_OVERLAP_TIMEOUT_MS}ms)`,
        );
        resolve(null);
      }, TOPIC_OVERLAP_TIMEOUT_MS),
    );

    const detectionPromise = openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 200,
      reasoning_effort: config.reasoningEffort,
      verbosity: config.verbosity,
    } as Parameters<typeof openai.chat.completions.create>[0]);

    const response = await Promise.race([detectionPromise, timeoutPromise]);

    if (timedOut) {
      return null;
    }

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
): Promise<QuestionSummary> {
  const questionTranscript = transcript.filter(
    (e) => e.questionIndex === questionIndex,
  );

  if (questionTranscript.length === 0) {
    return createEmptySummary(questionIndex, questionText, metrics);
  }

  const respondentText = questionTranscript
    .filter((e) => e.speaker === "respondent")
    .map((e) => e.text)
    .join(" ");

  const wordCount = respondentText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  if (wordCount < 10) {
    return createEmptySummary(questionIndex, questionText, metrics);
  }

  const transcriptFormatted = questionTranscript
    .map((e) => `[${e.speaker.toUpperCase()}]: ${e.text}`)
    .join("\n");

  const systemPrompt = `You are Barbara, an interview analysis assistant. Your task is to create a structured summary of a respondent's answer to an interview question, including quality analysis.

You must respond with a JSON object containing:
{
  "respondentSummary": "A 2-3 sentence summary of what the respondent said",
  "keyInsights": ["3-5 bullet points of main themes, insights, or memorable quotes"],
  "completenessAssessment": "Brief note on answer quality/depth (e.g., 'Comprehensive with specific examples' or 'Brief but covered key points')",
  "relevantToFutureQuestions": ["Topics mentioned that might connect to later questions"],
  "qualityFlags": ["Array of applicable flags from: incomplete, ambiguous, contradiction, distress_cue, off_topic, low_engagement"],
  "qualityScore": 0-100,
  "qualityNotes": "Brief explanation of quality assessment"
}

Quality flags definitions:
- incomplete: Answer doesn't address key aspects of the question
- ambiguous: Response is unclear or could be interpreted multiple ways
- contradiction: Contains conflicting statements
- distress_cue: Shows signs of discomfort, anxiety, or distress
- off_topic: Significantly strays from the question topic
- low_engagement: Very short or disengaged responses

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
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Summary generation timeout")),
        SUMMARY_TIMEOUT_MS,
      );
    });

    const config = barbaraConfig.summarisation;
    const summaryPromise = openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
      reasoning_effort: config.reasoningEffort,
      verbosity: config.verbosity,
    } as Parameters<typeof openai.chat.completions.create>[0]) as Promise<ChatCompletion>;

    const response = await Promise.race([summaryPromise, timeoutPromise]);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      return createEmptySummary(questionIndex, questionText, metrics);
    }

    const parsed = JSON.parse(content);

    const validFlags: QualityFlag[] = ["incomplete", "ambiguous", "contradiction", "distress_cue", "off_topic", "low_engagement"];
    const qualityFlags = Array.isArray(parsed.qualityFlags)
      ? parsed.qualityFlags.filter((f: string) => validFlags.includes(f as QualityFlag))
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
      qualityScore: typeof parsed.qualityScore === "number" ? Math.min(100, Math.max(0, parsed.qualityScore)) : undefined,
      qualityNotes: parsed.qualityNotes || undefined,
    };
  } catch (error) {
    console.error(
      `[Barbara] Error generating summary for Q${questionIndex + 1}:`,
      error,
    );
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
  }[];
  templateQuestions: { text: string; guidance: string }[];
  templateObjective: string;
}

export interface ThemeResult {
  theme: string;
  count: number;
  sessions: string[];
}

const CROSS_ANALYSIS_TIMEOUT_MS = 60000;

export async function generateCrossInterviewAnalysis(
  input: CrossInterviewAnalysisInput,
): Promise<{
  themes: ThemeResult[];
  questionPerformance: {
    questionIndex: number;
    questionText: string;
    avgWordCount: number;
    avgTurnCount: number;
    avgQualityScore: number;
    responseCount: number;
    qualityFlagCounts: Record<QualityFlag, number>;
  }[];
  overallStats: {
    totalCompletedSessions: number;
    avgSessionDuration: number;
    avgQualityScore: number;
    commonQualityIssues: { flag: QualityFlag; count: number }[];
  };
}> {
  const allFlags: QualityFlag[] = ["incomplete", "ambiguous", "contradiction", "distress_cue", "off_topic", "low_engagement"];
  
  const questionPerformance = input.templateQuestions.map((q, idx) => {
    const responses = input.sessions
      .map(s => s.questionSummaries.find(qs => qs.questionIndex === idx))
      .filter((qs): qs is QuestionSummary => qs !== undefined);
    
    const flagCounts: Record<QualityFlag, number> = {
      incomplete: 0, ambiguous: 0, contradiction: 0, 
      distress_cue: 0, off_topic: 0, low_engagement: 0
    };
    
    responses.forEach(r => {
      (r.qualityFlags || []).forEach(f => {
        if (allFlags.includes(f)) flagCounts[f]++;
      });
    });
    
    const avgWordCount = responses.length > 0 
      ? responses.reduce((sum, r) => sum + r.wordCount, 0) / responses.length : 0;
    const avgTurnCount = responses.length > 0
      ? responses.reduce((sum, r) => sum + r.turnCount, 0) / responses.length : 0;
    const qualityScores = responses.filter(r => r.qualityScore !== undefined).map(r => r.qualityScore!);
    const avgQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length : 0;
    
    return {
      questionIndex: idx,
      questionText: q.text,
      avgWordCount: Math.round(avgWordCount),
      avgTurnCount: Math.round(avgTurnCount * 10) / 10,
      avgQualityScore: Math.round(avgQualityScore),
      responseCount: responses.length,
      qualityFlagCounts: flagCounts,
    };
  });

  const allQualityScores = input.sessions.flatMap(s => 
    s.questionSummaries.filter(qs => qs.qualityScore !== undefined).map(qs => qs.qualityScore!)
  );
  const avgQualityScore = allQualityScores.length > 0
    ? allQualityScores.reduce((sum, s) => sum + s, 0) / allQualityScores.length : 0;

  const totalFlagCounts: Record<QualityFlag, number> = {
    incomplete: 0, ambiguous: 0, contradiction: 0, 
    distress_cue: 0, off_topic: 0, low_engagement: 0
  };
  input.sessions.forEach(s => {
    s.questionSummaries.forEach(qs => {
      (qs.qualityFlags || []).forEach(f => {
        if (allFlags.includes(f)) totalFlagCounts[f]++;
      });
    });
  });

  const commonQualityIssues = allFlags
    .map(f => ({ flag: f, count: totalFlagCounts[f] }))
    .filter(i => i.count > 0)
    .sort((a, b) => b.count - a.count);

  const avgDuration = input.sessions.length > 0
    ? input.sessions.reduce((sum, s) => sum + s.durationMs, 0) / input.sessions.length : 0;

  const themes = await extractThemesWithAI(input);

  return {
    themes,
    questionPerformance,
    overallStats: {
      totalCompletedSessions: input.sessions.length,
      avgSessionDuration: Math.round(avgDuration / 60000),
      avgQualityScore: Math.round(avgQualityScore),
      commonQualityIssues,
    },
  };
}

async function extractThemesWithAI(input: CrossInterviewAnalysisInput): Promise<ThemeResult[]> {
  if (input.sessions.length === 0) return [];

  const allInsights: { sessionId: string; insight: string }[] = [];
  input.sessions.forEach(s => {
    s.questionSummaries.forEach(qs => {
      qs.keyInsights.forEach(insight => {
        allInsights.push({ sessionId: s.sessionId, insight });
      });
    });
  });

  if (allInsights.length === 0) return [];

  const systemPrompt = `You are Barbara, an interview analysis assistant. Analyze the key insights from multiple interview sessions and identify common themes.

Return a JSON object with:
{
  "themes": [
    {
      "theme": "Brief theme name (2-5 words)",
      "description": "One sentence description",
      "relatedInsights": ["insight1", "insight2"]
    }
  ]
}

Identify 3-8 significant themes. Focus on recurring topics, sentiments, or patterns across interviews.`;

  const insightsBySession = input.sessions.map(s => ({
    sessionId: s.sessionId,
    insights: s.questionSummaries.flatMap(qs => qs.keyInsights),
  }));

  const userPrompt = `INTERVIEW OBJECTIVE: ${input.templateObjective}

INSIGHTS FROM ${input.sessions.length} INTERVIEW SESSIONS:
${insightsBySession.map(s => `Session ${s.sessionId}: ${s.insights.join("; ")}`).join("\n")}

Identify common themes across these interviews.`;

  try {
    const config = barbaraConfig.summarisation;
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
      reasoning_effort: config.reasoningEffort,
      verbosity: config.verbosity,
    } as Parameters<typeof openai.chat.completions.create>[0]) as ChatCompletion;

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.themes)) return [];

    return parsed.themes.map((t: { theme: string; relatedInsights?: string[] }) => {
      const relatedInsights = Array.isArray(t.relatedInsights) ? t.relatedInsights : [];
      const matchingSessions = input.sessions
        .filter(s => s.questionSummaries.some(qs => 
          qs.keyInsights.some(ki => relatedInsights.some(ri => ki.toLowerCase().includes(ri.toLowerCase().substring(0, 20)))))
        )
        .map(s => s.sessionId);
      
      return {
        theme: t.theme,
        count: matchingSessions.length || 1,
        sessions: matchingSessions.length > 0 ? matchingSessions : [input.sessions[0]?.sessionId].filter(Boolean),
      };
    });
  } catch (error) {
    console.error("[Barbara] Error extracting themes:", error);
    return [];
  }
}
