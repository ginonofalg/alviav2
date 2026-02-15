import OpenAI from "openai";
import type { Response as OAIResponse } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import { getBarbaraConfig } from "../barbara-orchestrator";
import { withTrackedLlmCall, makeResponsesUsageExtractor } from "../llm-usage";
import type { PopulationBrief } from "./types";
import { populationBriefJsonSchema } from "./types";
import type { Project } from "@shared/schema";
import type { LLMUsageAttribution } from "@shared/schema";

const RESEARCH_TIMEOUT_MS = 900_000;

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
find data for a dimension, set the source field to an empty string and note
this in your confidence assessment.`;

const FALLBACK_SYSTEM_PROMPT = `You are a research population analyst. Your task is to produce a structured
population brief for a qualitative interview study based on your existing knowledge.

NOTE: Web search was unavailable for this request. Use your best knowledge of
demographics, behavioral science, and domain expertise to construct a reasonable
population brief. Set confidence to "low" since this is not grounded in live
web research. Clearly note in your sources array that no web sources were available.

SUGGESTED PERSONA PROFILES:
Based on your knowledge, suggest 3-8 distinct persona archetypes that would
represent the key segments of this population. For each, explain:
- What archetype they represent
- Why this archetype matters for the research
- Roughly what percentage of the target population they represent

OUTPUT FORMAT:
Return a JSON object matching the PopulationBrief schema.`;

export interface UploadedFile {
  data: string;
  fileName: string;
  mimeType: string;
}

function buildResearchUserPrompt(
  researchPrompt: string,
  project: Project,
  additionalContext?: string,
): string {
  const parts: string[] = [`RESEARCH CONTEXT:\n${researchPrompt}`];

  const projectParts: string[] = [`Project: ${project.name}`];
  if (project.objective)
    projectParts.push(`Research Objectives: ${project.objective}`);
  if (project.audienceContext)
    projectParts.push(`Target Audience: ${project.audienceContext}`);
  if (project.contextType)
    projectParts.push(`Context Type: ${project.contextType}`);
  if (project.strategicContext)
    projectParts.push(`Strategic Context: ${project.strategicContext}`);
  if (project.avoidRules?.length)
    projectParts.push(
      `Topics/Rules to Avoid: ${project.avoidRules.join(", ")}`,
    );
  parts.push(`\nPROJECT CONTEXT:\n${projectParts.join("\n")}`);

  if (additionalContext) {
    parts.push(
      `\nADDITIONAL CONTEXT PROVIDED BY RESEARCHER:\n${additionalContext}`,
    );
  }

  parts.push(
    "\nResearch this population thoroughly using web search. Produce a structured population brief with citations.",
  );
  return parts.join("\n");
}

function buildInputMessages(
  systemPrompt: string,
  userPrompt: string,
  uploadedFile?: UploadedFile,
): any[] {
  const messages: any[] = [{ role: "system", content: systemPrompt }];

  if (uploadedFile) {
    messages.push({
      role: "user",
      content: [
        {
          type: "input_file",
          filename: uploadedFile.fileName,
          file_data: `data:${uploadedFile.mimeType};base64,${uploadedFile.data}`,
        },
        {
          type: "input_text",
          text: `The above file ("${uploadedFile.fileName}") contains reference data about the target population. Use it alongside web search to inform the population brief.\n\n${userPrompt}`,
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: userPrompt });
  }

  return messages;
}

function isRateLimitError(error: any): boolean {
  if (!error) return false;
  const status = error.status ?? error.statusCode;
  if (status === 429) return true;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("too many requests")
  );
}

function isWebSearchUnavailable(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("web_search") ||
    (msg.includes("tool") && msg.includes("unavailable"))
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

export interface ResearchResult {
  brief: PopulationBrief;
  citations: Array<{ url: string; title: string }>;
  ungrounded: boolean;
}

export async function researchPopulation(params: {
  researchPrompt: string;
  project: Project;
  additionalContext?: string;
  uploadedFile?: UploadedFile;
  attribution: LLMUsageAttribution;
}): Promise<ResearchResult> {
  const openai = new OpenAI();
  const config = getBarbaraConfig().personaResearch;
  const overallStart = Date.now();

  console.log(`[PersonaGeneration] Research started | model=${config.model} | promptLength=${params.researchPrompt.length} | hasFile=${!!params.uploadedFile} | project=${params.project.name}`);

  const userPrompt = buildResearchUserPrompt(
    params.researchPrompt,
    params.project,
    params.additionalContext,
  );

  let lastError: any = null;
  let useFallback = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[PersonaGeneration] OpenAI research call starting | attempt=${attempt + 1}/2 | webSearch=true | elapsed=${elapsed(overallStart)}`);

      const tracked = await withTrackedLlmCall({
        attribution: params.attribution,
        provider: "openai",
        model: config.model,
        useCase: "barbara_persona_research",
        timeoutMs: RESEARCH_TIMEOUT_MS,
        callFn: async (signal) => {
          return await openai.responses.create({
            model: config.model,
            input: buildInputMessages(
              RESEARCH_SYSTEM_PROMPT,
              userPrompt,
              params.uploadedFile,
            ),
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "population_brief",
                strict: true,
                schema: populationBriefJsonSchema,
              },
            },
            reasoning: { effort: config.reasoningEffort as ReasoningEffort },
          }, { signal, maxRetries: 0, timeout: RESEARCH_TIMEOUT_MS });
        },
        extractUsage: makeResponsesUsageExtractor(config.model),
      });

      const result = tracked.result;
      const briefText = result.output_text;
      const brief: PopulationBrief = JSON.parse(briefText);

      const citations = extractCitations(result);

      console.log(`[PersonaGeneration] Research completed | confidence=${brief.confidence} | citations=${citations.length} | demographics=${brief.demographics?.distributions?.length ?? 0} | profiles=${brief.suggestedPersonaProfiles?.length ?? 0} | elapsed=${elapsed(overallStart)}`);

      if (brief.confidence === "low" && citations.length === 0) {
        console.warn(
          `[PersonaGeneration] Web search returned no useful results, flagging as ungrounded | elapsed=${elapsed(overallStart)}`,
        );
        return { brief, citations, ungrounded: true };
      }

      return { brief, citations, ungrounded: false };
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message ?? String(error);

      if (isRateLimitError(error) && attempt === 0) {
        console.warn(
          `[PersonaGeneration] Rate limited by OpenAI, retrying in 5s... | elapsed=${elapsed(overallStart)}`,
        );
        await delay(5000);
        continue;
      }

      if (isWebSearchUnavailable(error)) {
        console.warn(
          `[PersonaGeneration] Web search unavailable, falling back to prompt-only | error=${errorMsg} | elapsed=${elapsed(overallStart)}`,
        );
        useFallback = true;
        break;
      }

      console.error(`[PersonaGeneration] Research OpenAI call failed | attempt=${attempt + 1} | error=${errorMsg} | status=${error?.status ?? "unknown"} | elapsed=${elapsed(overallStart)}`);
      throw error;
    }
  }

  if (useFallback) {
    return await researchWithoutWebSearch(params, openai, config, userPrompt, overallStart);
  }

  throw lastError;
}

async function researchWithoutWebSearch(
  params: {
    researchPrompt: string;
    project: Project;
    additionalContext?: string;
    uploadedFile?: UploadedFile;
    attribution: LLMUsageAttribution;
  },
  openai: OpenAI,
  config: { model: string; reasoningEffort: string },
  userPrompt: string,
  overallStart: number,
): Promise<ResearchResult> {
  console.log(`[PersonaGeneration] Fallback research call starting (no web search) | elapsed=${elapsed(overallStart)}`);

  const tracked = await withTrackedLlmCall({
    attribution: params.attribution,
    provider: "openai",
    model: config.model,
    useCase: "barbara_persona_research",
    timeoutMs: RESEARCH_TIMEOUT_MS,
    callFn: async (signal) => {
      return await openai.responses.create({
        model: config.model,
        input: buildInputMessages(
          FALLBACK_SYSTEM_PROMPT,
          userPrompt,
          params.uploadedFile,
        ),
        text: {
          format: {
            type: "json_schema",
            name: "population_brief",
            strict: true,
            schema: populationBriefJsonSchema,
          },
        },
        reasoning: { effort: config.reasoningEffort as ReasoningEffort },
      }, { signal, maxRetries: 0, timeout: RESEARCH_TIMEOUT_MS });
    },
    extractUsage: makeResponsesUsageExtractor(config.model),
  });

  const result = tracked.result;
  const brief: PopulationBrief = JSON.parse(result.output_text);

  console.log(`[PersonaGeneration] Fallback research completed | confidence=${brief.confidence} | profiles=${brief.suggestedPersonaProfiles?.length ?? 0} | elapsed=${elapsed(overallStart)}`);

  return { brief, citations: [], ungrounded: true };
}

function extractCitations(result: OAIResponse): Array<{ url: string; title: string }> {
  const citations: Array<{ url: string; title: string }> = [];
  try {
    const outputItems = result.output ?? [];
    for (const item of outputItems) {
      if (item.type === "message" && item.content) {
        for (const content of item.content) {
          if (content.type === "output_text" && content.annotations) {
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
  return citations;
}
