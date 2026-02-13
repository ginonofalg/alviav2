import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { withTrackedLlmCall, makeBarbaraUsageExtractor } from "./llm-usage";
import type { LLMUsageAttribution } from "@shared/schema";
import { storage } from "./storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const QUESTION_PARSING_MODEL = "gpt-5" as const;
const QUESTION_PARSING_REASONING_EFFORT = "low" as const;

export interface ParseQuestionsInput {
  rawText: string;
  existingQuestions?: string[];
  templateObjective?: string;
  projectId: string;
}

export interface ParsedQuestion {
  originalText: string;
  questionText: string;
  questionType: "open" | "yes_no" | "scale" | "numeric" | "multi_select";
  guidance: string;
  scaleMin?: number;
  scaleMax?: number;
  multiSelectOptions?: string[];
  timeHintSeconds: number;
  recommendedFollowUps: number;
  confidence: "high" | "medium" | "low";
  confidenceNote?: string;
  possibleDuplicate?: boolean;
  duplicateOf?: string;
}

export interface ParseQuestionsResult {
  suggestedObjective?: string;
  questions: ParsedQuestion[];
}

function buildProjectContext(project: {
  name: string;
  description?: string | null;
  objective?: string | null;
  audienceContext?: string | null;
  contextType?: string | null;
  strategicContext?: string | null;
  tone?: string | null;
  avoidRules?: string[] | null;
}): string {
  return [
    `Project: ${project.name}`,
    project.objective && `Research Objective: ${project.objective}`,
    project.description && `Description: ${project.description}`,
    project.audienceContext && `Target Audience: ${project.audienceContext}`,
    project.contextType && `Context Type: ${project.contextType}`,
    project.strategicContext && `Strategic Context: ${project.strategicContext}`,
    project.tone && `Interview Tone: ${project.tone}`,
    project.avoidRules?.length && `Topics to Avoid: ${project.avoidRules.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function buildSystemPrompt(
  projectContext: string,
  existingQuestions: string[],
  templateObjective: string | undefined,
): string {
  const existingQuestionsBlock = existingQuestions.length > 0
    ? `\nEXISTING TEMPLATE QUESTIONS (check for semantic overlap):\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

  return `You are a research interview designer converting raw question text into structured voice interview questions for an AI interviewer named Alvia.

PROJECT CONTEXT:
${projectContext}
${existingQuestionsBlock}

YOUR TASK:
Parse the user's pasted text into individual interview questions. For each question:

1. SEPARATE signal from noise — filter out headers, instructions, preamble, page numbers, and non-question text.
2. DETECT question type from phrasing:
   - Scale indicators ("on a scale of", "rate from X to Y", "1-10") → "scale" with extracted scaleMin/scaleMax
   - Binary indicators ("yes or no", "do you agree", "did you") → "yes_no"
   - Multi-select ("select all that apply", "which of the following", lists of options) → "multi_select" with options extracted
   - Numeric indicators ("how many", "what percentage", "how often per") → "numeric"
   - Everything else → "open"
3. REPHRASE for natural voice delivery — questions will be spoken aloud by Alvia in a conversational interview:
   - "Please rate your satisfaction on a scale of 1-5" → "How satisfied would you say you are, from one to five?"
   - "Select all that apply: A, B, C, D" → "Which of these resonate with you — A, B, C, or D? Feel free to pick as many as apply."
   - "Do you agree or disagree with the following statement: X" → "What's your take on X — do you agree with that?"
   - "Describe your experience with [product]" → "Tell me about your experience with [product]"
   - Remove "please rate", "on a scale of X to Y" phrasing → use natural conversation
   - Never start with "Please" — use "Tell me", "How", "What", "Walk me through"
4. GENERATE interviewer guidance that references the project objective and audience context. Be specific, not generic.
   - Good: "Probe for adoption barriers in enterprise context — procurement friction, IT approval, integration concerns"
   - Bad: "Ask follow-up questions about challenges"
5. ASSESS confidence for each parsed question:
   - "high": Clear question with unambiguous intent and type
   - "medium": Reasonable interpretation but some ambiguity in type or intent
   - "low": Ambiguous text that could be interpreted multiple ways
6. CHECK for semantic overlap with existing template questions. Flag possibleDuplicate=true and set duplicateOf to the existing question text it resembles.
7. SYNTHESIZE a template interview objective — Generate a concise, research-focused objective for this interview template by combining:
   - The project's research objective and strategic context (from PROJECT CONTEXT above)
   - The themes and topics covered by the parsed questions
   - Any preamble or research context found in the pasted text
   The objective should be 1-2 sentences describing what this specific interview template aims to discover or measure.${templateObjective ? `\n   The template currently has this objective: "${templateObjective}" — generate a refined/improved version that incorporates the parsed questions' themes. Only suggest a new one if it meaningfully improves on the existing one.` : "\n   The template has no objective yet — always generate one."}

HANDLING MESSY INPUT:
- Numbered lists, bullet points, tables — extract just the questions
- Sub-questions under a parent — make each a standalone question
- Headers mixed with questions — skip headers
- Instructional text — skip entirely
- Very long text (>500 chars for a single item) — split into multiple questions if appropriate, or summarize
- Non-English text — parse as-is without translating

OUTPUT FORMAT (JSON):
{
  "suggestedObjective": "synthesized interview objective based on project context and parsed questions",
  "questions": [
    {
      "originalText": "the raw text that was interpreted as this question",
      "questionText": "voice-optimized rephrased version",
      "questionType": "open|yes_no|scale|numeric|multi_select",
      "guidance": "context-aware interviewer guidance",
      "scaleMin": 1,
      "scaleMax": 10,
      "multiSelectOptions": ["option1", "option2"],
      "timeHintSeconds": 60,
      "recommendedFollowUps": 2,
      "confidence": "high|medium|low",
      "confidenceNote": "why confidence is not high (if applicable)",
      "possibleDuplicate": false,
      "duplicateOf": "text of the existing question it overlaps with"
    }
  ]
}

Rules:
- timeHintSeconds: 30-60 for yes_no/scale/numeric, 60-120 for open, 45-90 for multi_select
- recommendedFollowUps: 1-3 based on question importance and depth needed
- scaleMin/scaleMax only for "scale" type
- multiSelectOptions only for "multi_select" type
- Maximum 30 questions per parse
- Return empty questions array if no recognizable questions found`;
}

export async function parseQuestions(
  input: ParseQuestionsInput,
  usageContext?: LLMUsageAttribution,
): Promise<ParseQuestionsResult> {
  console.log("[QuestionParser] Parsing questions for project:", input.projectId);

  const project = await storage.getProject(input.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const projectContext = buildProjectContext(project);
  const systemPrompt = buildSystemPrompt(
    projectContext,
    input.existingQuestions || [],
    input.templateObjective,
  );

  const userPrompt = `Parse the following pasted text into structured interview questions:\n\n---\n${input.rawText}\n---`;

  const tracked = await withTrackedLlmCall({
    attribution: usageContext || {},
    provider: "openai",
    model: QUESTION_PARSING_MODEL,
    useCase: "barbara_question_parsing",
    callFn: async () => {
      return (await openai.chat.completions.create({
        model: QUESTION_PARSING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 10000,
        reasoning_effort: QUESTION_PARSING_REASONING_EFFORT,
      } as Parameters<typeof openai.chat.completions.create>[0])) as ChatCompletion;
    },
    extractUsage: makeBarbaraUsageExtractor(QUESTION_PARSING_MODEL),
  });

  const content = tracked.result.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in LLM response");
  }

  const parsed = JSON.parse(content);
  const validQuestionTypes = ["open", "yes_no", "scale", "numeric", "multi_select"];
  const validConfidence = ["high", "medium", "low"];

  const questions: ParsedQuestion[] = (parsed.questions || [])
    .slice(0, 30)
    .map((q: any) => ({
      originalText: q.originalText || "",
      questionText: q.questionText || "",
      questionType: validQuestionTypes.includes(q.questionType) ? q.questionType : "open",
      guidance: q.guidance || "",
      scaleMin: q.questionType === "scale" ? (q.scaleMin ?? 1) : undefined,
      scaleMax: q.questionType === "scale" ? (q.scaleMax ?? 10) : undefined,
      multiSelectOptions: q.questionType === "multi_select" ? (q.multiSelectOptions || []) : undefined,
      timeHintSeconds: q.timeHintSeconds || 60,
      recommendedFollowUps: q.recommendedFollowUps ?? 2,
      confidence: validConfidence.includes(q.confidence) ? q.confidence : "medium",
      confidenceNote: q.confidenceNote || undefined,
      possibleDuplicate: q.possibleDuplicate || false,
      duplicateOf: q.duplicateOf || undefined,
    }));

  return {
    suggestedObjective: parsed.suggestedObjective || undefined,
    questions,
  };
}
