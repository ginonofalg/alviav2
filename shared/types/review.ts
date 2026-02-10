import type { InterviewSession } from "../schema";

export type ReviewRatings = {
  questionClarity: number | null;
  alviaUnderstanding: number | null;
  conversationFlow: number | null;
  comfortLevel: number | null;
  technicalQuality: number | null;
  overallExperience: number | null;
};

export const RATING_DIMENSIONS = [
  { key: "questionClarity", label: "Question Clarity", description: "Were the interview questions clear and easy to understand?" },
  { key: "alviaUnderstanding", label: "Alvia Understanding", description: "Did Alvia understand your responses well?" },
  { key: "conversationFlow", label: "Conversation Flow", description: "How natural did the conversation feel?" },
  { key: "comfortLevel", label: "Comfort Level", description: "How comfortable were you during the interview?" },
  { key: "technicalQuality", label: "Technical Quality", description: "How was the audio and connection quality?" },
  { key: "overallExperience", label: "Overall Experience", description: "Overall, how was your interview experience?" },
] as const;

export type RatingDimensionKey = typeof RATING_DIMENSIONS[number]["key"];

export interface SessionWithRespondent extends InterviewSession {
  respondent?: {
    fullName: string | null;
    informalName: string | null;
  };
}
