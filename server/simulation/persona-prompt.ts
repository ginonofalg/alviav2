import type { Persona } from "@shared/schema";
import type { TranscriptEntry } from "../barbara-orchestrator";
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { withTrackedLlmCall, makeBarbaraUsageExtractor } from "../llm-usage";
import type { LLMUsageAttribution } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VERBOSITY_TEMP: Record<string, number> = {
  low: 0.6,
  medium: 0.8,
  high: 1.0,
};

const VERBOSITY_MAX_TOKENS: Record<string, number> = {
  low: 200,
  medium: 500,
  high: 800,
};

const VERBOSITY_GUIDANCE: Record<string, string> = {
  low: "Keep responses to 1-2 sentences. Be brief and direct.",
  medium: "Give responses of 3-5 sentences. Provide some detail but stay focused.",
  high: "Give detailed responses of 5+ sentences. Elaborate on points and share examples.",
};

const ATTITUDE_GUIDANCE: Record<string, string> = {
  cooperative: "You are willing to share openly and engage fully with questions. You try to give helpful, thoughtful answers.",
  reluctant: "You are somewhat guarded. You sometimes give short or deflecting answers, especially on sensitive topics. You may need encouragement to elaborate.",
  neutral: "You answer questions straightforwardly without strong enthusiasm or resistance. You stick to facts and direct responses.",
  evasive: "You tend to avoid giving direct answers. You may change the subject, give vague responses, or redirect. You are uncomfortable with probing questions.",
  enthusiastic: "You are highly engaged and eager to share. You volunteer extra information and examples. You enjoy the conversation.",
};

const DOMAIN_GUIDANCE: Record<string, string> = {
  none: "You have no particular knowledge of the subject matter. You answer based on general common sense and personal experience only.",
  basic: "You have a basic understanding of the subject. You know common terminology but lack depth.",
  intermediate: "You have solid working knowledge. You can discuss specifics and share informed opinions.",
  expert: "You have deep expertise. You use precise terminology, reference specifics, and can discuss nuances and edge cases.",
};

function buildPersonaSystemPrompt(persona: Persona): string {
  const traits = (persona.traits || []).join(", ");
  const avoidTopics = (persona.topicsToAvoid || []).join(", ");
  const biases = (persona.biases || []).join(", ");

  let prompt = `You are role-playing as a research interview respondent. Stay in character throughout the entire conversation. Never break character or acknowledge you are an AI.

PERSONA: ${persona.name}`;

  if (persona.ageRange) prompt += `\nAGE: ${persona.ageRange}`;
  if (persona.gender) prompt += `\nGENDER: ${persona.gender}`;
  if (persona.occupation) prompt += `\nOCCUPATION: ${persona.occupation}`;
  if (persona.location) prompt += `\nLOCATION: ${persona.location}`;

  prompt += `\n\nATTITUDE: ${persona.attitude}
${ATTITUDE_GUIDANCE[persona.attitude] || ATTITUDE_GUIDANCE.neutral}

VERBOSITY: ${persona.verbosity}
${VERBOSITY_GUIDANCE[persona.verbosity] || VERBOSITY_GUIDANCE.medium}

DOMAIN KNOWLEDGE: ${persona.domainKnowledge}
${DOMAIN_GUIDANCE[persona.domainKnowledge] || DOMAIN_GUIDANCE.basic}`;

  if (traits) prompt += `\n\nPERSONALITY TRAITS: ${traits}`;
  if (persona.communicationStyle) prompt += `\nCOMMUNICATION STYLE: ${persona.communicationStyle}`;
  if (persona.backgroundStory) prompt += `\n\nBACKGROUND: ${persona.backgroundStory}`;
  if (avoidTopics) prompt += `\n\nTOPICS TO AVOID: ${avoidTopics}\nWhen asked about these topics, deflect or give minimal answers.`;
  if (biases) prompt += `\n\nBIASES/PREFERENCES: ${biases}`;

  prompt += `\n
BEHAVIORAL RULES:
1. Match the verbosity level strictly
2. If reluctant or evasive, give short or deflecting answers sometimes
3. Stay consistent with your background and prior answers in this conversation
4. Never break character or mention being an AI
5. Respond naturally as a real person would in a research interview
6. Include natural speech patterns like brief hesitations or filler words occasionally
7. If you don't know something, say so naturally rather than making up detailed answers`;

  return prompt;
}

function buildConversationMessages(
  transcript: TranscriptEntry[],
  systemPrompt: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const entry of transcript) {
    if (entry.speaker === "alvia") {
      messages.push({ role: "user", content: entry.text });
    } else if (entry.speaker === "respondent") {
      messages.push({ role: "assistant", content: entry.text });
    }
  }

  return messages;
}

export async function generatePersonaResponse(
  persona: Persona,
  transcript: TranscriptEntry[],
  model: string,
  usageContext: LLMUsageAttribution,
): Promise<string> {
  const systemPrompt = buildPersonaSystemPrompt(persona);
  const messages = buildConversationMessages(transcript, systemPrompt);
  const temperature = VERBOSITY_TEMP[persona.verbosity] || 0.8;

  const tracked = await withTrackedLlmCall({
    attribution: usageContext,
    provider: "openai",
    model,
    useCase: "simulation_persona",
    callFn: async () => {
      return (await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: VERBOSITY_MAX_TOKENS[persona.verbosity] || 500,
      })) as ChatCompletion;
    },
    extractUsage: makeBarbaraUsageExtractor(),
  });

  return tracked.result.choices[0]?.message?.content?.trim() || "I'm not sure how to answer that.";
}
