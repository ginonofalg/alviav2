import { storage } from "../storage";
import { generateCrossInterviewAnalysis, generateTemplateAnalytics, generateProjectAnalytics } from "../barbara-orchestrator";
import type { LLMUsageAttribution, QuestionSummary, CollectionAnalytics, TemplateAnalytics, ProjectAnalytics } from "@shared/schema";
import type { InterviewSession, Collection, InterviewTemplate, Project, Question } from "@shared/schema";
import type { SessionScope } from "@shared/types/simulation";

export function filterSessionsByScope(sessions: InterviewSession[], scope: SessionScope): InterviewSession[] {
  if (scope === "combined") return sessions;
  if (scope === "simulated") return sessions.filter(s => s.isSimulated);
  return sessions.filter(s => !s.isSimulated);
}

export function buildSessionsWithSummaries(completedSessions: InterviewSession[]) {
  return completedSessions.map(s => {
    let durationMs = s.totalDurationMs || 0;
    if (durationMs === 0 && s.startedAt && s.completedAt) {
      const startTime = new Date(s.startedAt).getTime();
      const endTime = new Date(s.completedAt).getTime();
      durationMs = endTime - startTime;
    }
    return {
      sessionId: s.id,
      questionSummaries: (s.questionSummaries as QuestionSummary[]) || [],
      durationMs,
    };
  });
}

export function checkCollectionStaleness(
  collection: Collection,
  completedSessionCount: number,
  scope: SessionScope,
): boolean {
  const scopeMatches = collection.analyzedSessionScope === scope;
  return !collection.lastAnalyzedAt ||
    !scopeMatches ||
    (scopeMatches && completedSessionCount !== collection.analyzedSessionCount);
}

export async function refreshCollectionAnalytics(
  collection: Collection,
  template: InterviewTemplate,
  project: Project | undefined,
  questions: Question[],
  completedSessions: InterviewSession[],
  scope: SessionScope,
): Promise<{ analytics: CollectionAnalytics; analyzedSessionCount: number }> {
  const sessionsWithSummaries = buildSessionsWithSummaries(completedSessions);

  console.log("[Analytics] Starting analysis for collection:", collection.id);
  console.log("[Analytics] Sessions to analyze:", completedSessions.length);
  console.log("[Analytics] Total summaries:", sessionsWithSummaries.reduce((sum, s) => sum + s.questionSummaries.length, 0));

  const usageContext: LLMUsageAttribution = {
    projectId: template.projectId,
    templateId: template.id,
    collectionId: collection.id,
  };
  const analysisResult = await generateCrossInterviewAnalysis({
    sessions: sessionsWithSummaries,
    templateQuestions: questions.map(q => ({ text: q.questionText, guidance: q.guidance || "" })),
    templateObjective: project?.objective || "",
  }, usageContext);

  const analyticsData: CollectionAnalytics = {
    ...analysisResult,
    generatedAt: Date.now(),
  };

  await storage.updateCollection(collection.id, {
    lastAnalyzedAt: new Date(),
    analyzedSessionCount: completedSessions.length,
    analyzedSessionScope: scope,
    analyticsData,
  });

  return { analytics: analyticsData, analyzedSessionCount: completedSessions.length };
}

export type CollectionData = {
  collection: Collection;
  analytics: CollectionAnalytics | null;
  sessionCount: number;
};

export async function buildCollectionsData(
  collections: Collection[],
  scope: SessionScope,
): Promise<CollectionData[]> {
  return Promise.all(
    collections.map(async (collection) => {
      const sessions = await storage.getSessionsByCollection(collection.id);
      const completedSessions = filterSessionsByScope(sessions, scope).filter(s => s.status === "completed");
      return {
        collection,
        analytics: collection.analyticsData as CollectionAnalytics | null,
        sessionCount: completedSessions.length,
      };
    })
  );
}

export async function refreshTemplateAnalytics(
  template: InterviewTemplate,
  collectionsData: CollectionData[],
  questions: Question[],
  scope: SessionScope,
): Promise<{ analytics: TemplateAnalytics; analyzedCollectionCount: number }> {
  const collectionsWithAnalytics = collectionsData.filter(
    c => c.analytics !== null && c.collection.analyzedSessionScope === scope
  );

  console.log("[Template Analytics] Generating for template:", template.name);
  console.log("[Template Analytics] Collections with analytics (scope=%s):", scope, collectionsWithAnalytics.length);

  const usageContext: LLMUsageAttribution = {
    projectId: template.projectId,
    templateId: template.id,
  };
  const analysisResult = await generateTemplateAnalytics({
    collections: collectionsData,
    templateQuestions: questions.map((q, idx) => ({ text: q.questionText, index: idx })),
    templateName: template.name,
  }, usageContext);

  const analyticsData: TemplateAnalytics = {
    ...analysisResult,
    generatedAt: Date.now(),
  };

  await storage.updateTemplate(template.id, {
    lastAnalyzedAt: new Date(),
    analyzedCollectionCount: collectionsWithAnalytics.length,
    analyzedSessionScope: scope,
    analyticsData,
  });

  return { analytics: analyticsData, analyzedCollectionCount: collectionsWithAnalytics.length };
}

export type TemplateData = {
  template: InterviewTemplate;
  questions: Question[];
  analytics: TemplateAnalytics | null;
  collectionCount: number;
  totalSessions: number;
};

export async function buildTemplatesData(
  templates: InterviewTemplate[],
  scope: SessionScope,
): Promise<TemplateData[]> {
  return Promise.all(
    templates.map(async (template) => {
      const collections = await storage.getCollectionsByTemplate(template.id);
      const questions = await storage.getQuestionsByTemplate(template.id);
      let totalSessions = 0;
      for (const collection of collections) {
        const sessions = await storage.getSessionsByCollection(collection.id);
        totalSessions += filterSessionsByScope(sessions, scope).filter(s => s.status === "completed").length;
      }
      return {
        template,
        questions,
        analytics: template.analyticsData as TemplateAnalytics | null,
        collectionCount: collections.length,
        totalSessions,
      };
    })
  );
}

export async function refreshProjectAnalytics(
  project: Project,
  templatesData: TemplateData[],
  scope: SessionScope,
): Promise<{ analytics: ProjectAnalytics; analyzedTemplateCount: number }> {
  const templatesWithAnalytics = templatesData.filter(
    t => t.analytics !== null && t.template.analyzedSessionScope === scope
  );

  console.log("[Project Analytics] Generating for project:", project.name);
  console.log("[Project Analytics] Templates with analytics (scope=%s):", scope, templatesWithAnalytics.length);

  const usageContext: LLMUsageAttribution = {
    projectId: project.id,
  };
  const analysisResult = await generateProjectAnalytics({
    templates: templatesData,
    projectName: project.name,
    projectObjective: project.objective || "",
    strategicContext: project.strategicContext || undefined,
    contextType: project.contextType || undefined,
  }, usageContext);

  const analyticsData: ProjectAnalytics = {
    ...analysisResult,
    generatedAt: Date.now(),
  };

  await storage.updateProject(project.id, {
    lastAnalyzedAt: new Date(),
    analyzedTemplateCount: templatesWithAnalytics.length,
    analyzedSessionScope: scope,
    analyticsData,
  });

  return { analytics: analyticsData, analyzedTemplateCount: templatesWithAnalytics.length };
}
