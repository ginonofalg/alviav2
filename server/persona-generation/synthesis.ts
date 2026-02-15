import OpenAI from "openai";
import { getBarbaraConfig } from "../barbara-orchestrator";
import { withTrackedLlmCall, makeResponsesUsageExtractor } from "../llm-usage";
import type {
  PopulationBrief,
  GenerationConfig,
  GeneratedPersona,
} from "./types";
import { generatedPersonasJsonSchema } from "./types";
import type { LLMUsageAttribution } from "@shared/schema";

const SYNTHESIS_TIMEOUT_MS = 300_000;

function buildSynthesisSystemPrompt(config: GenerationConfig): string {
  const diversityBlock =
    config.diversityMode === "balanced"
      ? `- Use at least 2 distinct values for attitude, verbosity, and domainKnowledge
- No single enum value should appear on more than 40% of personas`
      : `- Every persona must have a unique (attitude, verbosity, domainKnowledge) combination
- Use at least 3 distinct values for each enum if generating 5+ personas`;

  const edgeCaseBlock = config.edgeCases
    ? `\nEDGE CASES: Include 1-2 outlier personas -- people who are atypical for this population but still realistic. Examples: an extreme skeptic, a domain expert with unconventional views, someone from an unexpected demographic segment.`
    : "";

  return `You are an expert persona designer for qualitative research simulations. Your task
is to generate realistic, diverse interview personas grounded in population research.

INPUT:
You will receive a population brief containing demographic distributions, behavioral
patterns, communication norms, domain knowledge levels, and biases/sensitivities
for a target population. You will also receive configuration settings.

PERSONA SCHEMA:
Each persona MUST include ALL of the following fields:

{
  "name": "string -- realistic full name appropriate to the persona's demographics and location",
  "description": "string -- 1-2 sentence summary of who this person is (max 500 chars)",
  "ageRange": "string -- specific range, e.g. '25-34', '45-54', '65+'",
  "gender": "string -- e.g. 'Female', 'Male', 'Non-binary'",
  "occupation": "string -- specific job title, not generic (max 100 chars)",
  "location": "string -- city or region, specific enough to be meaningful (max 100 chars)",
  "attitude": "MUST be one of: cooperative, reluctant, neutral, evasive, enthusiastic",
  "verbosity": "MUST be one of: low, medium, high",
  "domainKnowledge": "MUST be one of: none, basic, intermediate, expert",
  "traits": ["array of 3-5 personality traits as strings"],
  "communicationStyle": "string -- how this persona expresses themselves (max 500 chars)",
  "backgroundStory": "string -- 2-4 sentence backstory grounding this persona in reality (max 2000 chars)",
  "topicsToAvoid": ["array of 0-3 sensitive topics this persona deflects on"],
  "biases": ["array of 1-3 preconceptions or strong opinions this persona holds"]
}

GROUNDING RULES:
1. Every persona's demographics (age, occupation, location) MUST be drawn from
   the population brief's demographic data. Do not invent demographics unsupported
   by the research.
2. If the research did not find data for a specific dimension, use reasonable
   defaults consistent with the research prompt and note this.
3. Names must be culturally appropriate for the persona's stated location and
   cultural background.
4. Background stories must reflect individual circumstances, not demographic
   generalizations.

DIVERSITY RULES:
1. Do NOT assign personality traits based on demographic stereotypes (e.g., do not
   make all young people "tech-savvy" or all older people "resistant to change").
2. Vary occupation and education independently of age and gender.
3. Assign "reluctant" or "evasive" attitudes to demographically diverse personas --
   not only to older or less educated segments.
4. Background stories should reflect individual circumstances, not demographic
   generalizations.
5. Ensure at least one persona contradicts the "expected" profile for their
   demographic segment.

ENUM DISTRIBUTION (${config.diversityMode} mode):
${diversityBlock}
${edgeCaseBlock}

OUTPUT:
Return a JSON object with a single key "personas" containing an array of exactly
${config.personaCount} persona objects matching the schema above.`;
}

function buildSynthesisUserPrompt(
  brief: PopulationBrief,
  config: GenerationConfig,
): string {
  return `POPULATION BRIEF:
${JSON.stringify(brief, null, 2)}

CONFIGURATION:
- Generate exactly ${config.personaCount} personas
- Diversity mode: ${config.diversityMode}
- Edge case personas: ${config.edgeCases ? "Yes -- include 1-2 outlier personas" : "No"}

Generate ${config.personaCount} diverse, research-grounded personas for this population.`;
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

export async function synthesizePersonas(params: {
  brief: PopulationBrief;
  config: GenerationConfig;
  attribution: LLMUsageAttribution;
  correctionPrompt?: string;
}): Promise<GeneratedPersona[]> {
  const openai = new OpenAI();
  const barbaraConfig = getBarbaraConfig().personaGeneration;
  const startTime = Date.now();

  console.log(`[PersonaGeneration] Synthesis started | model=${barbaraConfig.model} | personaCount=${params.config.personaCount} | diversityMode=${params.config.diversityMode} | edgeCases=${params.config.edgeCases} | hasCorrection=${!!params.correctionPrompt}`);

  const systemPrompt = buildSynthesisSystemPrompt(params.config);
  let userPrompt = buildSynthesisUserPrompt(params.brief, params.config);

  if (params.correctionPrompt) {
    userPrompt += `\n\n${params.correctionPrompt}`;
  }

  try {
    const tracked = await withTrackedLlmCall({
      attribution: params.attribution,
      provider: "openai",
      model: barbaraConfig.model,
      useCase: "barbara_persona_generation",
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
      callFn: async () => {
        return await openai.responses.create({
          model: barbaraConfig.model,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "generated_personas",
              strict: true,
              schema: generatedPersonasJsonSchema,
            },
          },
          reasoning: { effort: barbaraConfig.reasoningEffort as any },
        } as any);
      },
      extractUsage: makeResponsesUsageExtractor(barbaraConfig.model),
    });

    const result = tracked.result as any;
    const parsed = JSON.parse(result.output_text);
    const personas = parsed.personas as GeneratedPersona[];

    console.log(`[PersonaGeneration] Synthesis completed | personasGenerated=${personas.length} | elapsed=${elapsed(startTime)}`);

    return personas;
  } catch (error: any) {
    console.error(`[PersonaGeneration] Synthesis OpenAI call failed | error=${error?.message ?? String(error)} | status=${error?.status ?? "unknown"} | elapsed=${elapsed(startTime)}`);
    throw error;
  }
}
