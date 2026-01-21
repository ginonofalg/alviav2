import type { DatabaseStorage } from '../../../server/storage';
import type { Scenario } from '../scenarios';

export interface GeneratedStructure {
  workspaceId: string;
  projectId: string;
  templateId: string;
  collectionId: string;
  questionIds: string[];
}

export async function generateStructure(
  storage: DatabaseStorage,
  scenario: Scenario,
  ownerId: string
): Promise<GeneratedStructure> {
  const workspace = await storage.createWorkspace({
    name: `${scenario.name} Workspace`,
    ownerId,
    retentionDays: 90
  });
  
  const project = await storage.createProject({
    workspaceId: workspace.id,
    name: scenario.projectName,
    description: scenario.projectDescription,
    objective: scenario.objective,
    audienceContext: scenario.audienceContext,
    tone: scenario.tone,
    strategicContext: scenario.strategicContext,
    contextType: scenario.contextType,
    consentAudioRecording: true,
    piiRedactionEnabled: true,
    avoidRules: [
      "Do not request unnecessary personal data",
      "Do not provide legal, medical, or financial advice",
      "Do not pressure the respondent to continue if they want to stop"
    ]
  });
  
  const template = await storage.createTemplate({
    projectId: project.id,
    name: scenario.templateName,
    objective: scenario.objective,
    tone: scenario.tone,
    defaultRecommendedFollowUps: scenario.defaultRecommendedFollowUps,
    isActive: true
  });
  
  const questionIds: string[] = [];
  for (let i = 0; i < scenario.questions.length; i++) {
    const q = scenario.questions[i];
    const question = await storage.createQuestion({
      templateId: template.id,
      orderIndex: i,
      questionText: q.text,
      questionType: q.type,
      guidance: q.guidance,
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      multiSelectOptions: q.multiSelectOptions,
      timeHintSeconds: q.timeHintSeconds,
      recommendedFollowUps: q.recommendedFollowUps,
      isRequired: true
    });
    questionIds.push(question.id);
  }
  
  const collection = await storage.createCollection({
    templateId: template.id,
    name: scenario.collectionName,
    description: `Data collection for ${scenario.name}`,
    isActive: true,
    targetResponses: 20
  });
  
  return {
    workspaceId: workspace.id,
    projectId: project.id,
    templateId: template.id,
    collectionId: collection.id,
    questionIds
  };
}
