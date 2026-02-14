export type SessionScope = "real" | "simulated" | "combined";

export type PersonaAttitude = "cooperative" | "reluctant" | "neutral" | "evasive" | "enthusiastic";
export type PersonaVerbosity = "low" | "medium" | "high";
export type PersonaDomainKnowledge = "none" | "basic" | "intermediate" | "expert";

export type SimulationRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type PersonaCard = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  ageRange: string | null;
  gender: string | null;
  occupation: string | null;
  location: string | null;
  attitude: PersonaAttitude;
  verbosity: PersonaVerbosity;
  domainKnowledge: PersonaDomainKnowledge;
  traits: string[];
  communicationStyle: string | null;
  backgroundStory: string | null;
  topicsToAvoid: string[];
  biases: string[];
  isArchived: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type SimulationRun = {
  id: string;
  collectionId: string;
  launchedBy: string;
  status: SimulationRunStatus;
  personaIds: string[];
  enableBarbara: boolean;
  enableSummaries: boolean;
  enableAdditionalQuestions: boolean;
  totalSimulations: number;
  completedSimulations: number;
  failedSimulations: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date | null;
};

export type SimulationTurnAction = "continue" | "next_question" | "start_aq" | "complete";

export type SimulationConfig = {
  enableBarbara: boolean;
  enableSummaries: boolean;
  enableAdditionalQuestions: boolean;
  alviaModel: string;
  personaModel: string;
  maxTurnsPerQuestion: number;
  maxConcurrentSimulations: number;
  interTurnDelayMs: number;
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  enableBarbara: true,
  enableSummaries: true,
  enableAdditionalQuestions: true,
  alviaModel: "gpt-4o-mini",
  personaModel: "gpt-4o-mini",
  maxTurnsPerQuestion: 8,
  maxConcurrentSimulations: 2,
  interTurnDelayMs: 200,
};
