import OpenAI from 'openai';
import { SEED_CONFIG, type QualityTendency, type SentimentLeaning } from '../config';

export interface GeneratedPersona {
  name: string;
  fullName: string;
  email: string;
  background: string;
  traits: string[];
  opinions: Record<string, string>;
  qualityTendency: QualityTendency;
  sentimentLeaning: SentimentLeaning;
}

const PERSONA_PROMPT = `Generate a realistic interview respondent persona for research about: {objective}

Target audience: {audienceContext}

Create a unique, believable person with:
- First and last name
- Professional background (2-3 sentences)
- 3-4 personality traits relevant to how they communicate
- 2-3 opinions/attitudes related to the research topic
- General sentiment leaning: {sentimentLeaning}

Return ONLY valid JSON (no markdown):
{
  "firstName": "...",
  "lastName": "...",
  "background": "...",
  "traits": ["trait1", "trait2", "trait3"],
  "opinions": {
    "topic1": "their view...",
    "topic2": "their view..."
  }
}`;

export async function generatePersonas(
  openai: OpenAI,
  objective: string,
  audienceContext: string,
  count: number
): Promise<GeneratedPersona[]> {
  const personas: GeneratedPersona[] = [];
  const qualityAssignments = assignQualities(count);
  const sentimentAssignments = assignSentiments(count);
  
  for (let i = 0; i < count; i++) {
    const sentiment = sentimentAssignments[i];
    const prompt = PERSONA_PROMPT
      .replace('{objective}', objective)
      .replace('{audienceContext}', audienceContext)
      .replace('{sentimentLeaning}', sentiment);
    
    const response = await openai.responses.create({
      model: SEED_CONFIG.model,
      input: [{ role: 'user', content: prompt }],
      text: { format: { type: "json_object" } },
    });
    
    const content = response.output_text;
    if (!content) throw new Error('Empty response from OpenAI');
    
    const parsed = JSON.parse(content);
    
    personas.push({
      name: parsed.firstName,
      fullName: `${parsed.firstName} ${parsed.lastName}`,
      email: `${parsed.firstName.toLowerCase()}.${parsed.lastName.toLowerCase()}@test-${i}.example.com`,
      background: parsed.background,
      traits: parsed.traits,
      opinions: parsed.opinions,
      qualityTendency: qualityAssignments[i],
      sentimentLeaning: sentiment
    });
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  return personas;
}

function assignQualities(count: number): QualityTendency[] {
  const assignments: QualityTendency[] = [];
  const dist = SEED_CONFIG.qualityDistribution;
  
  const counts = {
    high_quality: Math.round(count * dist.high_quality),
    moderate: Math.round(count * dist.moderate),
    brief: Math.round(count * dist.brief),
    off_topic: Math.max(0, count - Math.round(count * dist.high_quality) - Math.round(count * dist.moderate) - Math.round(count * dist.brief))
  };
  
  for (const [quality, c] of Object.entries(counts)) {
    for (let i = 0; i < c; i++) {
      assignments.push(quality as QualityTendency);
    }
  }
  
  return assignments.sort(() => Math.random() - 0.5);
}

function assignSentiments(count: number): SentimentLeaning[] {
  const assignments: SentimentLeaning[] = [];
  const dist = SEED_CONFIG.sentimentDistribution;
  
  const counts = {
    positive: Math.round(count * dist.positive),
    neutral: Math.round(count * dist.neutral),
    negative: Math.round(count * dist.negative),
    mixed: Math.max(0, count - Math.round(count * dist.positive) - Math.round(count * dist.neutral) - Math.round(count * dist.negative))
  };
  
  for (const [sentiment, c] of Object.entries(counts)) {
    for (let i = 0; i < c; i++) {
      assignments.push(sentiment as SentimentLeaning);
    }
  }
  
  return assignments.sort(() => Math.random() - 0.5);
}
