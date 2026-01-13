import OpenAI from "openai";

// Use gpt-4o-mini for fast, cost-effective analysis
const BARBARA_MODEL = "gpt-4o-mini";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  action: "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "none";
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

export async function analyzeWithBarbara(input: BarbaraAnalysisInput): Promise<BarbaraGuidance> {
  try {
    const systemPrompt = buildBarbaraSystemPrompt();
    const userPrompt = buildBarbaraUserPrompt(input);

    const response = await openai.chat.completions.create({
      model: BARBARA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { action: "none", message: "", confidence: 0, reasoning: "No response from Barbara" };
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
    return { action: "none", message: "", confidence: 0, reasoning: "Error during analysis" };
  }
}

function buildBarbaraSystemPrompt(): string {
  return `You are Barbara, an intelligent interview orchestrator. Your role is to monitor voice interviews conducted by Alvia (the AI interviewer) and provide real-time guidance.

Your responsibilities:
1. PRIOR CONTEXT DETECTION: Check if the respondent has already addressed parts of the current question earlier in the transcript. If so, Alvia should acknowledge this.
2. COMPLETENESS EVALUATION: Assess whether the respondent's answer to the current question is comprehensive based on the question's guidance criteria. If complete, suggest moving to the next question.
3. TIME/LENGTH MONITORING: If the response is running long (>2 minutes active time or >400 words), consider suggesting wrapping up.

You must respond with a JSON object containing:
{
  "action": "acknowledge_prior" | "probe_followup" | "suggest_next_question" | "time_reminder" | "none",
  "message": "A brief, natural instruction for Alvia (max 100 words)",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your decision"
}

Action meanings:
- "acknowledge_prior": The respondent mentioned something relevant earlier - remind Alvia to acknowledge this
- "probe_followup": The answer lacks depth - suggest a specific follow-up probe
- "suggest_next_question": The answer is complete - suggest transitioning to the next question
- "time_reminder": The response is running long - suggest wrapping up
- "none": No intervention needed - let the conversation flow naturally

Be conservative - only intervene when there's a clear benefit. Most of the time, "none" is appropriate.`;
}

function buildBarbaraUserPrompt(input: BarbaraAnalysisInput): string {
  const transcriptSummary = input.transcriptLog
    .map(entry => `[${entry.speaker.toUpperCase()}] (Q${entry.questionIndex + 1}): ${entry.text}`)
    .join("\n");

  const previousQuestions = input.allQuestions
    .slice(0, input.currentQuestionIndex)
    .map((q, i) => `Q${i + 1}: ${q.text}`)
    .join("\n");

  const currentQuestionResponses = input.transcriptLog
    .filter(e => e.questionIndex === input.currentQuestionIndex && e.speaker === "respondent")
    .map(e => e.text)
    .join(" ");

  const wordCount = currentQuestionResponses.split(/\s+/).filter(w => w.length > 0).length;
  const activeTimeSeconds = Math.round(input.questionMetrics.activeTimeMs / 1000);

  // Build summaries text from available previous question summaries
  const summariesText = input.previousQuestionSummaries
    .filter(s => s && s.questionIndex < input.currentQuestionIndex)
    .map(s => `Q${s.questionIndex + 1}: ${s.questionText}
  Response Summary: ${s.respondentSummary}
  Key Insights: ${s.keyInsights.join("; ")}
  Completeness: ${s.completenessAssessment}`)
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

${summariesText ? `PREVIOUS QUESTIONS SUMMARY:\n${summariesText}\n\n` : ""}${previousQuestions ? `PREVIOUS QUESTIONS:\n${previousQuestions}\n` : ""}

FULL TRANSCRIPT SO FAR:
${transcriptSummary || "(No transcript yet)"}

RESPONDENT'S ANSWER TO CURRENT QUESTION:
${currentQuestionResponses || "(No response yet)"}

Based on this context, should Alvia receive any guidance? Respond with your analysis in JSON format.`;
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

export interface QuestionSummary {
  questionIndex: number;
  questionText: string;
  respondentSummary: string;
  keyInsights: string[];
  completenessAssessment: string;
  relevantToFutureQuestions: string[];
  wordCount: number;
  turnCount: number;
  activeTimeMs: number;
  timestamp: number;
}

const SUMMARY_TIMEOUT_MS = 45000;

export async function generateQuestionSummary(
  questionIndex: number,
  questionText: string,
  questionGuidance: string,
  transcript: TranscriptEntry[],
  metrics: QuestionMetrics,
  templateObjective: string,
): Promise<QuestionSummary> {
  const questionTranscript = transcript.filter(e => e.questionIndex === questionIndex);
  
  if (questionTranscript.length === 0) {
    return createEmptySummary(questionIndex, questionText, metrics);
  }

  const respondentText = questionTranscript
    .filter(e => e.speaker === "respondent")
    .map(e => e.text)
    .join(" ");

  const wordCount = respondentText.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount < 10) {
    return createEmptySummary(questionIndex, questionText, metrics);
  }

  const transcriptFormatted = questionTranscript
    .map(e => `[${e.speaker.toUpperCase()}]: ${e.text}`)
    .join("\n");

  const systemPrompt = `You are Barbara, an interview analysis assistant. Your task is to create a structured summary of a respondent's answer to an interview question.

You must respond with a JSON object containing:
{
  "respondentSummary": "A 2-3 sentence summary of what the respondent said",
  "keyInsights": ["3-5 bullet points of main themes, insights, or memorable quotes"],
  "completenessAssessment": "Brief note on answer quality/depth (e.g., 'Comprehensive with specific examples' or 'Brief but covered key points')",
  "relevantToFutureQuestions": ["Topics mentioned that might connect to later questions"]
}

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
      setTimeout(() => reject(new Error("Summary generation timeout")), SUMMARY_TIMEOUT_MS);
    });

    const summaryPromise = openai.chat.completions.create({
      model: BARBARA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });

    const response = await Promise.race([summaryPromise, timeoutPromise]);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      return createEmptySummary(questionIndex, questionText, metrics);
    }

    const parsed = JSON.parse(content);

    return {
      questionIndex,
      questionText,
      respondentSummary: parsed.respondentSummary || "No summary available.",
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
      completenessAssessment: parsed.completenessAssessment || "Assessment unavailable.",
      relevantToFutureQuestions: Array.isArray(parsed.relevantToFutureQuestions) ? parsed.relevantToFutureQuestions : [],
      wordCount,
      turnCount: metrics.turnCount,
      activeTimeMs: metrics.activeTimeMs,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(`[Barbara] Error generating summary for Q${questionIndex + 1}:`, error);
    return createEmptySummary(questionIndex, questionText, metrics);
  }
}

function createEmptySummary(questionIndex: number, questionText: string, metrics: QuestionMetrics): QuestionSummary {
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
  };
}

// Topic overlap analysis for question transitions
export interface TopicOverlapResult {
  hasOverlap: boolean;
  overlapSummary: string;
  suggestedIntro: string;
  relatedQuestionIndices: number[];
  confidence: number;
}

const TOPIC_OVERLAP_TIMEOUT_MS = 8000;

export async function analyzeTopicOverlap(
  upcomingQuestion: { text: string; guidance: string },
  upcomingQuestionIndex: number,
  previousSummaries: QuestionSummary[],
  templateObjective: string,
): Promise<TopicOverlapResult> {
  // Filter to only summaries that have actual content
  const validSummaries = previousSummaries.filter(s => 
    s && s.keyInsights.length > 0 && s.respondentSummary !== "Minimal or no response provided."
  );

  if (validSummaries.length === 0) {
    return {
      hasOverlap: false,
      overlapSummary: "",
      suggestedIntro: "",
      relatedQuestionIndices: [],
      confidence: 1.0,
    };
  }

  const systemPrompt = `You are Barbara, an interview orchestrator. Your task is to analyze whether the upcoming interview question's topic has already been touched on by the respondent in previous answers.

You must respond with a JSON object containing:
{
  "hasOverlap": true/false,
  "overlapSummary": "If hasOverlap is true, briefly describe what the respondent already said about this topic (1-2 sentences). Empty if no overlap.",
  "suggestedIntro": "If hasOverlap is true, a natural way for the interviewer to introduce the question while acknowledging the prior mention (e.g., 'Earlier you mentioned X. I'd love to explore that more...'). Empty if no overlap.",
  "relatedQuestionIndices": [array of question numbers where the topic was touched on],
  "confidence": 0.0-1.0
}

Be conservative - only flag overlap when there's a clear, meaningful connection. Minor tangential mentions don't count.`;

  const summariesText = validSummaries
    .map(s => `Q${s.questionIndex + 1}: "${s.questionText}"
  Response: ${s.respondentSummary}
  Key Insights: ${s.keyInsights.join("; ")}
  Topics for future: ${s.relevantToFutureQuestions.join("; ")}`)
    .join("\n\n");

  const userPrompt = `INTERVIEW OBJECTIVE: ${templateObjective}

UPCOMING QUESTION (Q${upcomingQuestionIndex + 1}):
"${upcomingQuestion.text}"

GUIDANCE FOR THIS QUESTION:
${upcomingQuestion.guidance || "No specific guidance provided."}

PREVIOUS ANSWERS SUMMARY:
${summariesText}

Has the respondent already touched on the topic of the upcoming question? If so, how should the interviewer acknowledge this when asking the question?`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Topic overlap timeout")), TOPIC_OVERLAP_TIMEOUT_MS);
    });

    const analysisPromise = openai.chat.completions.create({
      model: BARBARA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 400,
    });

    const response = await Promise.race([analysisPromise, timeoutPromise]);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      return {
        hasOverlap: false,
        overlapSummary: "",
        suggestedIntro: "",
        relatedQuestionIndices: [],
        confidence: 0,
      };
    }

    const parsed = JSON.parse(content);

    console.log(`[Barbara] Topic overlap for Q${upcomingQuestionIndex + 1}: hasOverlap=${parsed.hasOverlap}, confidence=${parsed.confidence}`);
    if (parsed.hasOverlap && parsed.suggestedIntro) {
      console.log(`[Barbara] Suggested intro: "${parsed.suggestedIntro}"`);
    }

    return {
      hasOverlap: parsed.hasOverlap === true,
      overlapSummary: parsed.overlapSummary || "",
      suggestedIntro: parsed.suggestedIntro || "",
      relatedQuestionIndices: Array.isArray(parsed.relatedQuestionIndices) ? parsed.relatedQuestionIndices : [],
      confidence: parsed.confidence || 0,
    };
  } catch (error) {
    console.error(`[Barbara] Error analyzing topic overlap:`, error);
    return {
      hasOverlap: false,
      overlapSummary: "",
      suggestedIntro: "",
      relatedQuestionIndices: [],
      confidence: 0,
    };
  }
}
