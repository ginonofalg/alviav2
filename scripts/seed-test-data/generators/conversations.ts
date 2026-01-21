import OpenAI from 'openai';
import { SEED_CONFIG, type QualityTendency } from '../config';
import type { GeneratedPersona } from './personas';
import type { ScenarioQuestion } from '../scenarios';
import { generateTurnTimestamps } from '../utils/timestamps';

export interface TranscriptEntry {
  speaker: 'alvia' | 'respondent';
  text: string;
  timestamp: number;
  confidence?: number;
  questionIndex?: number;
}

export interface GeneratedConversation {
  transcript: TranscriptEntry[];
  respondentText: string;
  followUpCount: number;
  wordCount: number;
  extractedValue?: number | string | string[] | null;
}

const CONVERSATION_PROMPT = `You are simulating a voice interview between Alvia (an AI interviewer) and {respondentName}.

CONTEXT:
- Interview objective: {objective}
- Respondent background: {background}
- Respondent traits: {traits}
- Respondent opinions: {opinions}
- Sentiment leaning: {sentimentLeaning}
- Quality level: {qualityTendency}

CURRENT QUESTION:
Question: "{questionText}"
Type: {questionType}
Guidance for interviewer: {guidance}
{previousContext}

QUALITY GUIDELINES for "{qualityTendency}":
{qualityGuidelines}

Generate a {followUpCount}-turn conversation:
1. Alvia asks the question naturally
2. Respondent answers (matching persona and quality)
{followUpInstructions}

{extractionInstructions}

Return ONLY valid JSON:
{
  "turns": [
    { "speaker": "alvia", "text": "..." },
    { "speaker": "respondent", "text": "..." }
  ],
  "extractedValue": null
}`;

const QUALITY_GUIDELINES: Record<QualityTendency, string> = {
  high_quality: `- Give detailed, specific responses with concrete examples
- Show emotional depth and personal investment
- Provide 100-300 words per response
- Stay focused and articulate clear points`,

  moderate: `- Give reasonable responses with some detail
- Show moderate engagement
- Provide 50-150 words per response
- Stay mostly on topic`,

  brief: `- Give short, surface-level responses
- Require probing to get details
- Provide 15-50 words per response
- Answer literally without elaboration`,

  off_topic: `- Tend to go on tangents
- Include personal anecdotes that drift
- Provide 80-200 words but much tangential
- Eventually answer in a roundabout way`
};

export async function generateConversation(
  openai: OpenAI,
  persona: GeneratedPersona,
  question: ScenarioQuestion,
  questionIndex: number,
  objective: string,
  previousContext: string,
  baseTimestamp: number
): Promise<GeneratedConversation> {
  const chars = SEED_CONFIG.responseCharacteristics[persona.qualityTendency];
  const followUpCount = question.recommendedFollowUps ?? chars.followUpDepth;
  
  let extractionInstructions = '';
  if (question.type === 'scale') {
    extractionInstructions = `Extract the numeric rating (${question.scaleMin}-${question.scaleMax}) as "extractedValue".`;
  } else if (question.type === 'yes_no') {
    extractionInstructions = `Extract "yes" or "no" as "extractedValue".`;
  } else if (question.type === 'numeric') {
    extractionInstructions = `Extract the numeric value as "extractedValue".`;
  } else if (question.type === 'multi_select') {
    extractionInstructions = `Extract selected options as array in "extractedValue". Options: ${question.multiSelectOptions?.join(', ')}`;
  }
  
  let followUpInstructions = '';
  if (followUpCount > 0) {
    followUpInstructions = `3. Alvia asks ${followUpCount} follow-up question(s) probing deeper\n4. Respondent responds to each`;
  }
  
  const prompt = CONVERSATION_PROMPT
    .replace('{respondentName}', persona.name)
    .replace('{objective}', objective)
    .replace('{background}', persona.background)
    .replace('{traits}', persona.traits.join(', '))
    .replace('{opinions}', JSON.stringify(persona.opinions))
    .replace('{sentimentLeaning}', persona.sentimentLeaning)
    .replace('{qualityTendency}', persona.qualityTendency)
    .replace('{questionText}', question.text)
    .replace('{questionType}', question.type)
    .replace('{guidance}', question.guidance)
    .replace('{previousContext}', previousContext ? `Previous context: ${previousContext}` : '')
    .replace('{qualityGuidelines}', QUALITY_GUIDELINES[persona.qualityTendency])
    .replace('{followUpCount}', String(2 + followUpCount * 2))
    .replace('{followUpInstructions}', followUpInstructions)
    .replace('{extractionInstructions}', extractionInstructions);
  
  const response = await openai.chat.completions.create({
    model: SEED_CONFIG.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: "json_object" }
  });
  
  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty response from OpenAI');
  
  const parsed = JSON.parse(content);
  const turns = parsed.turns || [];
  const timestamps = generateTurnTimestamps(baseTimestamp, turns.length);
  
  const transcript: TranscriptEntry[] = turns.map((turn: { speaker: string; text: string }, i: number) => ({
    speaker: turn.speaker as 'alvia' | 'respondent',
    text: turn.text,
    timestamp: timestamps[i],
    confidence: turn.speaker === 'respondent' ? 0.85 + Math.random() * 0.1 : undefined,
    questionIndex
  }));
  
  const respondentText = turns
    .filter((t: { speaker: string }) => t.speaker === 'respondent')
    .map((t: { text: string }) => t.text)
    .join(' ');
  
  const wordCount = respondentText.split(/\s+/).filter(Boolean).length;
  
  return {
    transcript,
    respondentText,
    followUpCount,
    wordCount,
    extractedValue: parsed.extractedValue
  };
}
