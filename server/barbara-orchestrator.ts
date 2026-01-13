import OpenAI from "openai";

// GPT-5-mini for fast, cost-effective analysis
// Note: gpt-5-mini only supports default temperature (1)
const BARBARA_MODEL = "gpt-5-mini";

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
      max_completion_tokens: 400,
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
  return `You are Barbara, interview orchestrator. Monitor Alvia (AI interviewer) and provide real-time guidance.

OUTPUT FORMAT (strict JSON):
{"action":"<ACTION>","message":"<50 words max>","confidence":<0.0-1.0>,"reasoning":"<20 words max>"}

ACTIONS:
- acknowledge_prior: Respondent covered this topic earlier. Tell Alvia to reference it.
- probe_followup: Answer lacks depth. Give Alvia a specific follow-up.
- suggest_next_question: Answer complete per guidance criteria. Move on.
- time_reminder: >2min or >400 words. Wrap up.
- none: No intervention needed.

RULES:
1. Default to "none" unless clear benefit exists.
2. Message must be a direct instruction to Alvia, not a description.
3. Keep message under 50 words.
4. Confidence 0.8+ required for any action except "none".
5. Do not repeat what respondent said in message.`;
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

  return `OBJECTIVE: ${input.templateObjective}
TONE: ${input.templateTone}

CURRENT Q${input.currentQuestionIndex + 1}: "${input.currentQuestion.text}"
GUIDANCE: ${input.currentQuestion.guidance || "None"}

METRICS: ${wordCount} words, ${activeTimeSeconds}s, ${input.questionMetrics.turnCount} turns

${previousQuestions ? `PRIOR QUESTIONS:\n${previousQuestions}\n\n` : ""}${summariesText ? `PRIOR SUMMARIES:\n${summariesText}\n\n` : ""}TRANSCRIPT:
${transcriptSummary || "(empty)"}

CURRENT ANSWER:
${currentQuestionResponses || "(none)"}

Analyze and output JSON.`;
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

  const systemPrompt = `Summarize respondent's answer. Output strict JSON only.

FORMAT:
{"respondentSummary":"<string>","keyInsights":["<string array>"],"completenessAssessment":"<string>","relevantToFutureQuestions":["<string array>"]}

RULES:
1. respondentSummary: 2-3 sentences on what respondent said. Ignore interviewer.
2. keyInsights: 3-5 items covering main themes, insights, or quotes.
3. completenessAssessment: Describe answer quality/depth (e.g., "Comprehensive with specific examples" or "Touched on topic but lacked detail").
4. relevantToFutureQuestions: Topics that may connect to later questions.`;

  const userPrompt = `OBJECTIVE: ${templateObjective}
Q${questionIndex + 1}: "${questionText}"
GUIDANCE: ${questionGuidance || "None"}

TRANSCRIPT:
${transcriptFormatted}

METRICS: ${wordCount} words, ${metrics.turnCount} turns, ${Math.round(metrics.activeTimeMs / 1000)}s

Output JSON.`;

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
      max_completion_tokens: 500,
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

  const systemPrompt = `Detect if upcoming question's topic was already discussed. Output strict JSON only.

FORMAT:
{"hasOverlap":<bool>,"overlapSummary":"<string>","suggestedIntro":"<string>","relatedQuestionIndices":[<int array>],"confidence":<0.0-1.0>}

RULES:
1. hasOverlap=true ONLY if respondent meaningfully discussed this topic before.
2. Minor tangential mentions = hasOverlap=false.
3. overlapSummary: 1-2 sentences describing what was previously said. Empty if no overlap.
4. suggestedIntro: Natural transition acknowledging prior mention (e.g., "Earlier you mentioned X..."). Empty if no overlap.
5. relatedQuestionIndices: Question numbers where topic was discussed.
6. confidence 0.7+ required for hasOverlap=true.`;

  const summariesText = validSummaries
    .map(s => `Q${s.questionIndex + 1}: "${s.questionText}"
  Response: ${s.respondentSummary}
  Key Insights: ${s.keyInsights.join("; ")}
  Topics for future: ${s.relevantToFutureQuestions.join("; ")}`)
    .join("\n\n");

  const userPrompt = `OBJECTIVE: ${templateObjective}

UPCOMING Q${upcomingQuestionIndex + 1}: "${upcomingQuestion.text}"
GUIDANCE: ${upcomingQuestion.guidance || "None"}

PRIOR ANSWERS:
${summariesText}

Output JSON.`;

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
      max_completion_tokens: 350,
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
