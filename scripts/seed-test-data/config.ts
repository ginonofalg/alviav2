export const SEED_CONFIG = {
  model: "gpt-5-mini" as const,
  verbosity: "low" as const,
  reasoningEffort: "low" as const,
  
  respondentsPerCollection: 18,
  questionsPerTemplate: 6,
  
  qualityDistribution: {
    high_quality: 0.45,
    moderate: 0.30,
    brief: 0.15,
    off_topic: 0.10
  },
  
  responseCharacteristics: {
    high_quality: { minWords: 100, maxWords: 300, followUpDepth: 3 },
    moderate: { minWords: 50, maxWords: 150, followUpDepth: 2 },
    brief: { minWords: 15, maxWords: 50, followUpDepth: 1 },
    off_topic: { minWords: 80, maxWords: 200, followUpDepth: 2 }
  },
  
  sentimentDistribution: {
    positive: 0.45,
    neutral: 0.30,
    negative: 0.20,
    mixed: 0.05
  },
  
  preComputeAnalytics: false
};

export type QualityTendency = keyof typeof SEED_CONFIG.qualityDistribution;
export type SentimentLeaning = keyof typeof SEED_CONFIG.sentimentDistribution;
