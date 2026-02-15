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
