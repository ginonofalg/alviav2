import OpenAI from "openai";
import { getBarbaraConfig } from "../barbara-orchestrator";
import { withTrackedLlmCall, makeResponsesUsageExtractor } from "../llm-usage";
import type { PopulationBrief } from "./types";
import { populationBriefJsonSchema } from "./types";
import type { Project } from "@shared/schema";
import type { LLMUsageAttribution } from "@shared/schema";

const RESEARCH_SYSTEM_PROMPT = `You are a research population analyst. Your task is to research a target population
for a qualitative interview study and produce a structured population brief.

TASK:
Given the research context below, use web search to find real demographic data,
behavioral research, and domain-specific studies about this population. Search for
at least 3-5 different aspects of the population.

SEARCH STRATEGY:
- Search for demographic breakdowns (census data, industry reports, market sizing)
- Search for behavioral patterns (adoption studies, satisfaction surveys, usage data)
- Search for communication and cultural norms relevant to this population
- Search for domain knowledge distributions (professional qualifications, experience levels)
- Search for known biases, pain points, or sensitive topics in this population

CONFIDENCE ASSESSMENT:
After your research, assess your confidence level:
- "high": Found multiple credible sources with specific data for this population
- "medium": Found some relevant data but had to generalize from adjacent populations
- "low": Found little to no specific data; brief is primarily based on general knowledge

SUGGESTED PERSONA PROFILES:
Based on your research, suggest 3-8 distinct persona archetypes that would
represent the key segments of this population. For each, explain:
- What archetype they represent (e.g., "Early adopter professional", "Reluctant traditionalist")
- Why this archetype matters for the research (what perspective they bring)
- Roughly what percentage of the target population they represent

OUTPUT FORMAT:
Return a JSON object matching the PopulationBrief schema. Every claim should
include a source URL where possible. Do not fabricate sources -- if you cannot
find data for a dimension, omit the source field and note this in your
confidence assessment.`;

function buildResearchUserPrompt(
  researchPrompt: string,
  project: Project,
  additionalContext?: string,
): string {
  const parts: string[] = [`RESEARCH CONTEXT:\n${researchPrompt}`];

  const projectParts: string[] = [`Project: ${project.name}`];
  if (project.objective) projectParts.push(`Research Objectives: ${project.objective}`);
  if (project.audienceContext) projectParts.push(`Target Audience: ${project.audienceContext}`);
  if (project.contextType) projectParts.push(`Context Type: ${project.contextType}`);
  if (project.strategicContext) projectParts.push(`Strategic Context: ${project.strategicContext}`);
  if (project.avoidRules?.length) projectParts.push(`Topics/Rules to Avoid: ${project.avoidRules.join(", ")}`);
  parts.push(`\nPROJECT CONTEXT:\n${projectParts.join("\n")}`);

  if (additionalContext) {
    parts.push(`\nADDITIONAL CONTEXT PROVIDED BY RESEARCHER:\n${additionalContext}`);
  }

  parts.push("\nResearch this population thoroughly using web search. Produce a structured population brief with citations.");
  return parts.join("\n");
}

export async function researchPopulation(params: {
  researchPrompt: string;
  project: Project;
  additionalContext?: string;
  attribution: LLMUsageAttribution;
}): Promise<{ brief: PopulationBrief; citations: Array<{ url: string; title: string }> }> {
  const openai = new OpenAI();
  const config = getBarbaraConfig().personaResearch;

  const userPrompt = buildResearchUserPrompt(
    params.researchPrompt,
    params.project,
    params.additionalContext,
  );

  const tracked = await withTrackedLlmCall({
    attribution: params.attribution,
    provider: "openai",
    model: config.model,
    useCase: "barbara_persona_research",
    timeoutMs: 90_000,
    callFn: async () => {
      return await openai.responses.create({
        model: config.model,
        input: [
          { role: "system", content: RESEARCH_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{ type: "web_search" as any }],
        text: {
          format: {
            type: "json_schema",
            name: "population_brief",
            strict: true,
            schema: populationBriefJsonSchema,
          },
        },
        reasoning: { effort: config.reasoningEffort as any },
      } as any);
    },
    extractUsage: makeResponsesUsageExtractor(config.model),
  });

  const result = tracked.result as any;
  const briefText = result.output_text;
  const brief: PopulationBrief = JSON.parse(briefText);

  const citations: Array<{ url: string; title: string }> = [];
  try {
    const outputItems = result.output ?? [];
    for (const item of outputItems) {
      if (item.type === "message" && item.content) {
        for (const content of item.content) {
          if (content.annotations) {
            for (const annotation of content.annotations) {
              if (annotation.type === "url_citation") {
                citations.push({
                  url: annotation.url,
                  title: annotation.title ?? annotation.url,
                });
              }
            }
          }
        }
      }
    }
  } catch {
    // citations are supplementary, don't fail on extraction errors
  }

  return { brief, citations };
}
