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

  // Debug logging to trace transcript filtering issues
  const speakerBreakdown = questionTranscript.reduce((acc, e) => {
    acc[e.speaker] = (acc[e.speaker] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(
    `[Summary] Q${questionIndex + 1} transcript breakdown: ${JSON.stringify(speakerBreakdown)}, ` +
    `entries: ${questionTranscript.length}`
  );

  if (questionTranscript.length === 0) {
    console.log(`[Summary] Q${questionIndex + 1}: No transcript entries found, returning empty summary`);
    return createEmptySummary(questionIndex, questionText, metrics);
  }

  const respondentEntries = questionTranscript.filter((e) => e.speaker === "respondent");
  const respondentText = respondentEntries
    .map((e) => e.text)
    .join(" ");

  const wordCount = respondentText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  console.log(
    `[Summary] Q${questionIndex + 1}: ${respondentEntries.length} respondent entries, ${wordCount} words`
  );

  if (wordCount < 10) {
    console.log(`[Summary] Q${questionIndex + 1}: Only ${wordCount} words from respondent (threshold: 10), returning empty summary`);
    return createEmptySummary(questionIndex, questionText, metrics);
  }

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
      max_completion_tokens: 800, // Increased for verbatims
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

    // Parse and validate verbatims
    const validSentiments = ["positive", "negative", "neutral", "mixed"] as const;
    type ValidSentiment = typeof validSentiments[number];
    const verbatims = Array.isArray(parsed.verbatims)
      ? parsed.verbatims
          .filter((v: { quote?: string; context?: string }) => v && typeof v.quote === "string" && v.quote.trim().length > 0)
          .map((v: { quote: string; context?: string; sentiment?: string; themeTag?: string }) => ({
            quote: v.quote.trim(),
            context: v.context?.trim() || "Response to question",
            sentiment: validSentiments.includes(v.sentiment as ValidSentiment) ? v.sentiment as ValidSentiment : undefined,
            themeTag: v.themeTag?.trim() || undefined,
          }))
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
      qualityScore: typeof parsed.qualityScore === "number" ? Math.min(100, Math.max(0, parsed.qualityScore)) : undefined,
      qualityNotes: parsed.qualityNotes || undefined,
      verbatims: verbatims.length > 0 ? verbatims : undefined,
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
  CollectionAnalytics 
} from "@shared/schema";

const CROSS_ANALYSIS_TIMEOUT_MS = 90000;

export async function generateCrossInterviewAnalysis(
  input: CrossInterviewAnalysisInput,
): Promise<Omit<CollectionAnalytics, 'generatedAt'>> {
  const allFlags: QualityFlag[] = ["incomplete", "ambiguous", "contradiction", "distress_cue", "off_topic", "low_engagement"];
  
  // Calculate basic question performance metrics
  const baseQuestionPerformance = input.templateQuestions.map((q, idx) => {
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
    
    // Determine response richness based on average word count
    const responseRichness: "brief" | "moderate" | "detailed" = 
      avgWordCount < 30 ? "brief" : avgWordCount < 100 ? "moderate" : "detailed";
    
    return {
      questionIndex: idx,
      questionText: q.text,
      avgWordCount: Math.round(avgWordCount),
      avgTurnCount: Math.round(avgTurnCount * 10) / 10,
      avgQualityScore: Math.round(avgQualityScore),
      responseCount: responses.length,
      qualityFlagCounts: flagCounts,
      responseRichness,
      summaries: responses.map(r => r.respondentSummary),
    };
  });

  // Calculate overall stats
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

  // Run AI-powered analysis in parallel
  console.log("[Barbara] Starting enhanced cross-interview analysis...");
  
  const [enhancedAnalysis] = await Promise.all([
    extractEnhancedAnalysis(input, baseQuestionPerformance),
  ]);

  // Generate recommendations based on metrics
  const recommendations = generateRecommendations(baseQuestionPerformance, enhancedAnalysis.themes, input);

  // Calculate theme stats
  const themesPerSession = input.sessions.map(s => {
    const sessionInsights = s.questionSummaries.flatMap(qs => qs.keyInsights);
    return enhancedAnalysis.themes.filter(t => t.sessions.includes(s.sessionId)).length;
  });
  const avgThemesPerSession = themesPerSession.length > 0
    ? themesPerSession.reduce((sum, t) => sum + t, 0) / themesPerSession.length : 0;
  
  const themeDepthScore = enhancedAnalysis.themes.length > 0
    ? Math.round(enhancedAnalysis.themes.reduce((sum, t) => sum + t.depthScore, 0) / enhancedAnalysis.themes.length)
    : 0;

  // Build enhanced question performance
  const questionPerformance: EnhancedQuestionPerformance[] = baseQuestionPerformance.map((q, idx) => ({
    questionIndex: q.questionIndex,
    questionText: q.questionText,
    avgWordCount: q.avgWordCount,
    avgTurnCount: q.avgTurnCount,
    avgQualityScore: q.avgQualityScore,
    responseCount: q.responseCount,
    qualityFlagCounts: q.qualityFlagCounts,
    primaryThemes: enhancedAnalysis.themes
      .filter(t => t.relatedQuestions.includes(idx))
      .slice(0, 3)
      .map(t => t.theme),
    verbatims: enhancedAnalysis.questionVerbatims[idx] || [],
    perspectiveRange: enhancedAnalysis.questionPerspectives[idx] || "moderate",
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
  questionPerformance: { questionIndex: number; questionText: string; avgQualityScore: number; avgWordCount: number; responseRichness: string }[],
  themes: EnhancedTheme[],
  input: CrossInterviewAnalysisInput
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Flag underperforming questions
  questionPerformance.forEach(q => {
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
  themes.forEach(t => {
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
  themes.filter(t => t.isEmergent).forEach(t => {
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
  sentimentDistribution: { positive: number; neutral: number; negative: number };
}

async function extractEnhancedAnalysis(
  input: CrossInterviewAnalysisInput,
  questionPerformance: { questionIndex: number; questionText: string; summaries: string[] }[]
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
    const summariesByQuestion = s.questionSummaries.map(qs => ({
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

  const questionList = input.templateQuestions.map((q, i) => `Q${i + 1}: ${q.text}`).join("\n");
  
  const sessionSummaries = sessionData.map(s => {
    const responses = s.summariesByQuestion.map(q => {
      const verbatimText = q.verbatims.length > 0 
        ? ` | Verbatims: ${q.verbatims.map(v => `"${v.quote}" [${v.sentiment || 'neutral'}${v.themeTag ? `, ${v.themeTag}` : ''}]`).join("; ")}` 
        : '';
      return `  Q${q.questionIndex + 1}: ${q.summary} | Insights: ${q.insights.join("; ")}${verbatimText}`;
    }).join("\n");
    return `${s.participantLabel}:\n${responses}`;
  }).join("\n\n");

  const userPrompt = `INTERVIEW OBJECTIVE: ${input.templateObjective}

TEMPLATE QUESTIONS:
${questionList}

INTERVIEW DATA FROM ${input.sessions.length} PARTICIPANTS:
${sessionSummaries}

Analyze these interviews and provide comprehensive insights with anonymized verbatims.`;

  try {
    console.log("[Barbara] Building enhanced analysis prompt with", sessionData.length, "sessions");
    console.log("[Barbara] Session summaries preview:", sessionSummaries.substring(0, 500));
    
    const config = barbaraConfig.summarisation;
    console.log("[Barbara] Using model:", config.model);
    
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
      reasoning_effort: config.reasoningEffort,
      verbosity: config.verbosity,
    } as Parameters<typeof openai.chat.completions.create>[0]) as ChatCompletion;

    console.log("[Barbara] Full API response:", JSON.stringify(response, null, 2).substring(0, 1000));
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("[Barbara] No content in AI response");
      console.error("[Barbara] Response choices:", JSON.stringify(response.choices, null, 2));
      return createEmptyAnalysis();
    }

    console.log("[Barbara] AI response received, length:", content.length);
    const parsed = JSON.parse(content);
    console.log("[Barbara] Parsed response - themes:", parsed.themes?.length || 0, "findings:", parsed.keyFindings?.length || 0);
    
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
  totalSessions: number
): EnhancedAnalysisResult {
  const themes: EnhancedTheme[] = (parsed.themes || []).map((t: any) => {
    const verbatims: ThemeVerbatim[] = (t.verbatims || []).map((v: any) => ({
      quote: v.quote || "",
      questionIndex: v.questionIndex || 0,
      sessionId: sessionData[v.participantIndex]?.sessionId || sessionData[0]?.sessionId || "",
      sentiment: validateSentiment(v.sentiment),
    }));

    const sessionsWithTheme = Array.from(new Set(verbatims.map(v => v.sessionId)));

    return {
      id: t.id || `theme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      theme: t.theme || "Unnamed Theme",
      description: t.description || "",
      count: sessionsWithTheme.length || 1,
      sessions: sessionsWithTheme,
      prevalence: Math.round((sessionsWithTheme.length / totalSessions) * 100),
      verbatims: verbatims.slice(0, 7),
      sentiment: validateSentiment(t.sentiment),
      sentimentBreakdown: t.sentimentBreakdown || { positive: 0, neutral: 0, negative: 0 },
      depth: validateDepth(t.depth),
      depthScore: Math.min(100, Math.max(0, t.depthScore || 50)),
      relatedQuestions: Array.isArray(t.relatedQuestions) ? t.relatedQuestions : [],
      subThemes: Array.isArray(t.subThemes) ? t.subThemes : undefined,
      isEmergent: t.isEmergent === true,
    };
  });

  const keyFindings: KeyFinding[] = (parsed.keyFindings || []).slice(0, 5).map((f: any) => ({
    finding: f.finding || "",
    significance: f.significance || "",
    supportingVerbatims: (f.supportingVerbatims || []).slice(0, 3).map((v: any) => ({
      quote: v.quote || "",
      questionIndex: v.questionIndex || 0,
      sessionId: sessionData[v.participantIndex]?.sessionId || "",
      sentiment: validateSentiment(v.sentiment),
    })),
    relatedThemes: Array.isArray(f.relatedThemes) ? f.relatedThemes : [],
  }));

  const consensusPoints: ConsensusPoint[] = (parsed.consensusPoints || []).slice(0, 3).map((c: any) => ({
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

  const divergencePoints: DivergencePoint[] = (parsed.divergencePoints || []).slice(0, 3).map((d: any) => ({
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
  const questionPerspectives: Record<number, "narrow" | "moderate" | "diverse"> = {};
  
  (parsed.questionAnalysis || []).forEach((qa: any) => {
    const qIdx = qa.questionIndex;
    questionVerbatims[qIdx] = (qa.keyVerbatims || []).slice(0, 4).map((v: any) => ({
      quote: v.quote || "",
      questionIndex: qIdx,
      sessionId: sessionData[v.participantIndex]?.sessionId || "",
      sentiment: validateSentiment(v.sentiment),
    }));
    questionPerspectives[qIdx] = validatePerspective(qa.perspectiveRange);
  });

  const sentimentDistribution = parsed.overallSentiment || { positive: 0, neutral: 0, negative: 0 };

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
  if (s === "positive" || s === "negative" || s === "neutral" || s === "mixed") return s;
  return "neutral";
}

function validateDepth(d: any): "mentioned" | "explored" | "deeply_explored" {
  if (d === "mentioned" || d === "explored" || d === "deeply_explored") return d;
  return "explored";
}

function validatePerspective(p: any): "narrow" | "moderate" | "diverse" {
  if (p === "narrow" || p === "moderate" || p === "diverse") return p;
  return "moderate";
}
