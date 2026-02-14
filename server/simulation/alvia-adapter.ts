import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { buildInterviewInstructions } from "../voice-interview/instructions";
import { withTrackedLlmCall, makeBarbaraUsageExtractor } from "../llm-usage";
import type { LLMUsageAttribution } from "@shared/schema";
import type { TranscriptEntry } from "../voice-interview/types";
import type { Question, InterviewTemplate } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEXT_MODE_OVERRIDE = `
TEXT SIMULATION MODE:
This is a text-based simulation, not a live voice interview. Adjust your behavior:
- Do NOT mention clicking buttons, audio, speaking aloud, or any UI elements
- Do NOT mention a "Next Question button" or tell the respondent to "click" anything
- Simply proceed through questions naturally as a text conversation
- When you are ready to move to the next question, end your message clearly
- Keep your responses conversational but text-appropriate`;

function buildConversationMessages(
  transcript: TranscriptEntry[],
  systemPrompt: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const entry of transcript) {
    if (entry.speaker === "alvia") {
      messages.push({ role: "assistant", content: entry.text });
    } else if (entry.speaker === "respondent") {
      messages.push({ role: "user", content: entry.text });
    }
  }

  return messages;
}

export async function generateAlviaResponse(
  template: InterviewTemplate,
  currentQuestion: Question,
  questionIndex: number,
  totalQuestions: number,
  transcript: TranscriptEntry[],
  barbaraGuidance: string | undefined,
  respondentName: string | null,
  allQuestions: Question[],
  followUpContext: { followUpCount: number; recommendedFollowUps: number | null },
  alviaHasSpokenOnCurrentQuestion: boolean,
  model: string,
  usageContext: LLMUsageAttribution,
): Promise<string> {
  const instructions = buildInterviewInstructions(
    template,
    currentQuestion,
    questionIndex,
    totalQuestions,
    barbaraGuidance,
    respondentName,
    allQuestions.map((q) => ({ questionText: q.questionText })),
    followUpContext,
    null,
    alviaHasSpokenOnCurrentQuestion,
  );

  const fullInstructions = instructions + TEXT_MODE_OVERRIDE;
  const messages = buildConversationMessages(transcript, fullInstructions);

  const tracked = await withTrackedLlmCall({
    attribution: usageContext,
    provider: "openai",
    model,
    useCase: "simulation_alvia",
    callFn: async () => {
      return (await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 600,
      })) as ChatCompletion;
    },
    extractUsage: makeBarbaraUsageExtractor(),
  });

  return tracked.result.choices[0]?.message?.content?.trim() || "";
}
