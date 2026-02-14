export interface PopulationBriefDemographicDistribution {
  dimension: string;
  breakdown: string;
  source?: string;
}

export interface PopulationBriefBehavioralPattern {
  pattern: string;
  prevalence: string;
  source?: string;
}

export interface PopulationBriefCommunicationNorm {
  norm: string;
  context: string;
}

export interface PopulationBriefDomainKnowledgeLevel {
  segment: string;
  level: "none" | "basic" | "intermediate" | "expert";
  description: string;
}

export interface PopulationBriefBiasOrSensitivity {
  topic: string;
  nature: string;
  source?: string;
}

export interface PopulationBriefSuggestedProfile {
  archetype: string;
  rationale: string;
  representsPct: string;
}

export interface PopulationBriefSource {
  url: string;
  title: string;
  relevance: string;
}

export interface PopulationBrief {
  targetPopulation: string;
  confidence: "high" | "medium" | "low";
  demographics: {
    summary: string;
    distributions: PopulationBriefDemographicDistribution[];
  };
  behavioralPatterns: PopulationBriefBehavioralPattern[];
  communicationNorms: PopulationBriefCommunicationNorm[];
  domainKnowledgeLevels: PopulationBriefDomainKnowledgeLevel[];
  biasesAndSensitivities: PopulationBriefBiasOrSensitivity[];
  suggestedPersonaProfiles: PopulationBriefSuggestedProfile[];
  sources: PopulationBriefSource[];
}

export type DiversityMode = "balanced" | "maximize";

export interface GenerationConfig {
  personaCount: number;
  diversityMode: DiversityMode;
  edgeCases: boolean;
}

export interface GeneratedPersona {
  name: string;
  description: string;
  ageRange: string;
  gender: string;
  occupation: string;
  location: string;
  attitude: "cooperative" | "reluctant" | "neutral" | "evasive" | "enthusiastic";
  verbosity: "low" | "medium" | "high";
  domainKnowledge: "none" | "basic" | "intermediate" | "expert";
  traits: string[];
  communicationStyle: string;
  backgroundStory: string;
  topicsToAvoid: string[];
  biases: string[];
}

export const populationBriefJsonSchema = {
  type: "object" as const,
  properties: {
    targetPopulation: { type: "string" as const },
    confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
    demographics: {
      type: "object" as const,
      properties: {
        summary: { type: "string" as const },
        distributions: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              dimension: { type: "string" as const },
              breakdown: { type: "string" as const },
              source: { type: "string" as const },
            },
            required: ["dimension", "breakdown"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "distributions"],
      additionalProperties: false,
    },
    behavioralPatterns: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          pattern: { type: "string" as const },
          prevalence: { type: "string" as const },
          source: { type: "string" as const },
        },
        required: ["pattern", "prevalence"],
        additionalProperties: false,
      },
    },
    communicationNorms: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          norm: { type: "string" as const },
          context: { type: "string" as const },
        },
        required: ["norm", "context"],
        additionalProperties: false,
      },
    },
    domainKnowledgeLevels: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          segment: { type: "string" as const },
          level: { type: "string" as const, enum: ["none", "basic", "intermediate", "expert"] },
          description: { type: "string" as const },
        },
        required: ["segment", "level", "description"],
        additionalProperties: false,
      },
    },
    biasesAndSensitivities: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          topic: { type: "string" as const },
          nature: { type: "string" as const },
          source: { type: "string" as const },
        },
        required: ["topic", "nature"],
        additionalProperties: false,
      },
    },
    suggestedPersonaProfiles: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          archetype: { type: "string" as const },
          rationale: { type: "string" as const },
          representsPct: { type: "string" as const },
        },
        required: ["archetype", "rationale", "representsPct"],
        additionalProperties: false,
      },
    },
    sources: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          url: { type: "string" as const },
          title: { type: "string" as const },
          relevance: { type: "string" as const },
        },
        required: ["url", "title", "relevance"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "targetPopulation", "confidence", "demographics", "behavioralPatterns",
    "communicationNorms", "domainKnowledgeLevels", "biasesAndSensitivities",
    "suggestedPersonaProfiles", "sources",
  ],
  additionalProperties: false,
};

export const generatedPersonasJsonSchema = {
  type: "object" as const,
  properties: {
    personas: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          description: { type: "string" as const },
          ageRange: { type: "string" as const },
          gender: { type: "string" as const },
          occupation: { type: "string" as const },
          location: { type: "string" as const },
          attitude: { type: "string" as const, enum: ["cooperative", "reluctant", "neutral", "evasive", "enthusiastic"] },
          verbosity: { type: "string" as const, enum: ["low", "medium", "high"] },
          domainKnowledge: { type: "string" as const, enum: ["none", "basic", "intermediate", "expert"] },
          traits: { type: "array" as const, items: { type: "string" as const } },
          communicationStyle: { type: "string" as const },
          backgroundStory: { type: "string" as const },
          topicsToAvoid: { type: "array" as const, items: { type: "string" as const } },
          biases: { type: "array" as const, items: { type: "string" as const } },
        },
        required: [
          "name", "description", "ageRange", "gender", "occupation", "location",
          "attitude", "verbosity", "domainKnowledge", "traits", "communicationStyle",
          "backgroundStory", "topicsToAvoid", "biases",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["personas"],
  additionalProperties: false,
};
