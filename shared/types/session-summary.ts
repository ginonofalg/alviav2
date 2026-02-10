export type AlviaSessionSummary = {
  themes: Array<{
    theme: string;
    description: string;
  }>;
  overallSummary: string;
  objectiveSatisfaction: {
    assessment: string;
    coveredAreas: string[];
    gaps: string[];
  };
  generatedAt: number;
  model: string;
  provider: string;
};

export type BarbaraSessionSummary = {
  themes: Array<{
    theme: string;
    description: string;
    supportingEvidence: string[];
    sentiment: "positive" | "negative" | "neutral" | "mixed";
  }>;
  overallSummary: string;
  objectiveSatisfaction: {
    rating: number;
    assessment: string;
    coveredObjectives: string[];
    gapsIdentified: string[];
  };
  respondentEngagement: {
    level: "low" | "moderate" | "high";
    notes: string;
  };
  generatedAt: number;
  model: string;
};
