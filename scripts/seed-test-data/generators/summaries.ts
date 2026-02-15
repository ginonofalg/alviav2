import OpenAI from 'openai';
import { SEED_CONFIG, type QualityTendency } from '../config';
import type { GeneratedPersona } from './personas';
import type { ScenarioQuestion } from '../scenarios';

export interface Verbatim {
  quote: string;
  context: string;
  themeTag: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
}

export interface QuestionSummaryData {
  questionIndex: number;
  questionText: string;
  respondentSummary: string;
  keyInsights: string[];
  verbatims: Verbatim[];
  qualityScore: number;
  qualityFlags: string[];
  qualityNotes: string;
  wordCount: number;
  turnCount: number;
  activeTimeMs: number;
  timestamp: number;
  completenessAssessment: string;
  relevantToFutureQuestions: string[];
}

const SUMMARY_PROMPT = `Analyze this interview response and generate a structured summary.

QUESTION: "{questionText}"
RESPONDENT BACKGROUND: {background}
QUALITY TENDENCY: {qualityTendency}

TRANSCRIPT:
{transcript}

Generate a summary with:
1. A 2-3 sentence summary of the respondent's answer
2. 3-5 key insights (bullet points)
3. 2-4 notable verbatim quotes with context and theme tags
4. Quality assessment (score 0-100, flags, notes)
5. Completeness assessment
6. Topics relevant to future questions

Return ONLY valid JSON:
{
  "respondentSummary": "...",
  "keyInsights": ["insight1", "insight2"],
  "verbatims": [
    {
      "quote": "exact quote from transcript",
      "context": "when/why they said this",
      "themeTag": "theme_name",
      "sentiment": "positive|negative|neutral|mixed"
    }
  ],
  "qualityScore": 75,
  "qualityFlags": ["low_engagement"] or [],
  "qualityNotes": "Brief assessment...",
  "completenessAssessment": "How complete was the answer",
  "relevantToFutureQuestions": ["topic1", "topic2"]
}`;

export async function generateQuestionSummary(
  openai: OpenAI,
  questionText: string,
  transcript: string,
  persona: GeneratedPersona,
  questionIndex: number,
  wordCount: number,
  turnCount: number,
  timestamp: number
): Promise<QuestionSummaryData> {
  const prompt = SUMMARY_PROMPT
    .replace('{questionText}', questionText)
    .replace('{background}', persona.background)
    .replace('{qualityTendency}', persona.qualityTendency)
    .replace('{transcript}', transcript);
  
  const response = await openai.responses.create({
    model: SEED_CONFIG.model,
    input: [{ role: 'user', content: prompt }],
    text: { format: { type: "json_object" } },
  });
  
  const content = response.output_text;
  if (!content) throw new Error('Empty response from OpenAI');
  
  const parsed = JSON.parse(content);
  
  let qualityScore = parsed.qualityScore || 50;
  if (persona.qualityTendency === 'high_quality') {
    qualityScore = Math.max(qualityScore, 70);
  } else if (persona.qualityTendency === 'brief') {
    qualityScore = Math.min(qualityScore, 60);
  }
  
  return {
    questionIndex,
    questionText,
    respondentSummary: parsed.respondentSummary || '',
    keyInsights: parsed.keyInsights || [],
    verbatims: parsed.verbatims || [],
    qualityScore,
    qualityFlags: parsed.qualityFlags || [],
    qualityNotes: parsed.qualityNotes || '',
    wordCount,
    turnCount,
    activeTimeMs: 0,
    timestamp,
    completenessAssessment: parsed.completenessAssessment || '',
    relevantToFutureQuestions: parsed.relevantToFutureQuestions || []
  };
}

export function calculateOverallQualityScore(summaries: QuestionSummaryData[]): number {
  if (summaries.length === 0) return 0;
  const total = summaries.reduce((sum, s) => sum + s.qualityScore, 0);
  return Math.round(total / summaries.length);
}
