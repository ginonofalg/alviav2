import { storage } from "../storage";
import {
  getPersona,
  getSimulationRun,
  updateSimulationRun,
  acquireSimulationLock,
  releaseSimulationLock,
  isSimulationRunCancelled,
} from "../storage/simulation";
import { generateAlviaResponse } from "./alvia-adapter";
import { generatePersonaResponse } from "./persona-prompt";
import { evaluateQuestionFlow, getNextQuestionIndex } from "./question-flow";
import type { SimulationContext, SimulationQuestionMetrics } from "./types";
import { SIMULATION_LIMITS } from "./types";
import type { LLMUsageAttribution, Question } from "@shared/schema";
import {
  analyzeWithBarbara,
  generateQuestionSummary,
  generateAdditionalQuestions,
  generateSessionSummary,
  type BarbaraAnalysisInput,
  type QuestionMetrics,
  type TranscriptEntry,
  type QuestionSummary,
} from "../barbara-orchestrator";
import {
  buildCrossInterviewRuntimeContext,
  buildAnalyticsHypothesesRuntimeContext,
} from "../voice-interview/context-builders";
import type {
  CrossInterviewRuntimeContext,
  AnalyticsHypothesesRuntimeContext,
} from "../voice-interview/types";

const BARBARA_TIMEOUT_MS = 10_000;
const BARBARA_CONFIDENCE_GATE = 0.6;
const WORDS_PER_MINUTE = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateSpeakingDelayMs(text: string, minDelayMs: number): number {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(minDelayMs, (wordCount / WORDS_PER_MINUTE) * 60 * 1000);
}

function buildUsageContext(ctx: SimulationContext, sessionId: string): LLMUsageAttribution {
  return {
    workspaceId: ctx.project.workspaceId,
    projectId: ctx.project.id,
    templateId: ctx.template.id,
    collectionId: ctx.collection.id,
    sessionId,
  };
}

function buildBarbaraContextFields(
  crossInterviewCtx: CrossInterviewRuntimeContext,
  analyticsHypothesesCtx: AnalyticsHypothesesRuntimeContext,
  questionIndex: number,
) {
  let crossInterviewContext: BarbaraAnalysisInput["crossInterviewContext"];
  if (crossInterviewCtx.enabled && crossInterviewCtx.priorSessionCount != null) {
    const questionThemes = crossInterviewCtx.themesByQuestion?.[questionIndex] || [];
    const emergentThemes = crossInterviewCtx.emergentThemes || [];
    const currentQuestionQuality = crossInterviewCtx.qualityInsightsByQuestion?.[questionIndex];

    const upcomingQualityAlerts: NonNullable<BarbaraAnalysisInput["crossInterviewContext"]>["upcomingQualityAlerts"] = [];
    if (crossInterviewCtx.qualityInsightsByQuestion) {
      for (const [qIdxStr, insight] of Object.entries(crossInterviewCtx.qualityInsightsByQuestion)) {
        const qIdx = parseInt(qIdxStr, 10);
        if (qIdx > questionIndex && qIdx <= questionIndex + 2) {
          upcomingQualityAlerts.push(insight);
        }
      }
    }

    const hasThemeContext = questionThemes.length > 0 || emergentThemes.length > 0;
    const hasQualityContext = currentQuestionQuality !== undefined || upcomingQualityAlerts.length > 0;

    if (hasThemeContext || hasQualityContext) {
      crossInterviewContext = {
        priorSessionCount: crossInterviewCtx.priorSessionCount,
        snapshotGeneratedAt: crossInterviewCtx.snapshotGeneratedAt ?? null,
        questionThemes,
        emergentThemes,
        currentQuestionQuality,
        upcomingQualityAlerts: upcomingQualityAlerts.length > 0 ? upcomingQualityAlerts : undefined,
      };
    }
  }

  let analyticsHypotheses: BarbaraAnalysisInput["analyticsHypotheses"];
  if (
    analyticsHypothesesCtx.enabled &&
    analyticsHypothesesCtx.hypotheses?.length &&
    analyticsHypothesesCtx.totalProjectSessions != null
  ) {
    analyticsHypotheses = {
      totalProjectSessions: analyticsHypothesesCtx.totalProjectSessions,
      analyticsGeneratedAt: analyticsHypothesesCtx.analyticsGeneratedAt ?? null,
      hypotheses: analyticsHypothesesCtx.hypotheses.map((h) => ({
        hypothesis: h.hypothesis,
        source: h.source,
        priority: h.priority,
        isCurrentQuestionRelevant:
          h.relatedQuestionIndices.includes(questionIndex) ||
          h.relatedQuestionIndices.length === 0,
      })),
    };
  }

  return { crossInterviewContext, analyticsHypotheses };
}

async function runBarbaraWithRacing(
  barbaraInput: Parameters<typeof analyzeWithBarbara>[0],
  usageCtx: LLMUsageAttribution,
  speakingDelayMs: number,
): Promise<{ guidance: string | undefined; suggestedNext: boolean }> {
  const turnStartTime = Date.now();
  let guidance: string | undefined;
  let suggestedNext = false;

  let timedOut = false;
  const barbaraPromise = analyzeWithBarbara(barbaraInput, usageCtx);
  const timeoutMs = Math.min(speakingDelayMs, BARBARA_TIMEOUT_MS);
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => { timedOut = true; resolve(null); }, timeoutMs),
  );

  try {
    const result = await Promise.race([barbaraPromise, timeoutPromise]);
    if (result && result.confidence > BARBARA_CONFIDENCE_GATE && result.action !== "none") {
      guidance = result.message;
      if (result.action === "suggest_next_question") {
        suggestedNext = true;
      }
    }
  } catch (err) {
    console.error(`[Simulation] Barbara analysis failed:`, err);
  }

  if (timedOut) {
    barbaraPromise.catch((err) => {
      console.error(`[Simulation] Late Barbara analysis failed (post-timeout):`, err);
    });
  }

  const elapsed = Date.now() - turnStartTime;
  const remaining = speakingDelayMs - elapsed;
  if (remaining > 0) await delay(remaining);

  return { guidance, suggestedNext };
}

async function runSingleSimulation(ctx: SimulationContext): Promise<void> {
  const respondent = await storage.createRespondent({
    collectionId: ctx.collection.id,
    displayName: `[Sim] ${ctx.persona.name}`,
    fullName: ctx.persona.name,
    informalName: ctx.persona.name,
    isSimulated: true,
    invitationStatus: "consented",
  });

  let session;
  try {
    session = await storage.createSession({
      collectionId: ctx.collection.id,
      respondentId: respondent.id,
      status: "in_progress",
      isSimulated: true,
      personaId: ctx.persona.id,
      simulationRunId: ctx.runId,
    });
  } catch (err) {
    throw err;
  }

  await storage.updateSession(session.id, { startedAt: new Date() });

  const usageCtx = buildUsageContext(ctx, session.id);
  const transcript: TranscriptEntry[] = [];
  const questionSummaries: QuestionSummary[] = [];
  const sessionStartTime = Date.now();
  const previousAnswers = new Map<number, string>();

  const crossInterviewCtx = buildCrossInterviewRuntimeContext(ctx.project, ctx.collection);
  const analyticsHypothesesCtx = buildAnalyticsHypothesesRuntimeContext(
    ctx.project,
    ctx.questions.map((q) => ({ text: q.questionText, guidance: q.guidance })),
  );

  try {
    let questionIndex = 0;

    while (questionIndex < ctx.questions.length) {
      if (Date.now() - sessionStartTime > SIMULATION_LIMITS.PER_SESSION_TIMEOUT_MS) {
        console.log(`[Simulation] Session timeout for ${session.id}`);
        break;
      }

      const question = ctx.questions[questionIndex];
      const metrics: SimulationQuestionMetrics = {
        questionIndex,
        wordCount: 0,
        turnCount: 0,
        followUpCount: 0,
        startedAt: Date.now(),
      };

      const alviaOpening = await generateAlviaResponse(
        ctx.template, question, questionIndex, ctx.questions.length,
        transcript, undefined, ctx.persona.name, ctx.questions,
        { followUpCount: 0, recommendedFollowUps: question.recommendedFollowUps ?? null },
        false, ctx.alviaModel, usageCtx,
      );

      transcript.push({
        speaker: "alvia", text: alviaOpening,
        timestamp: Date.now(), questionIndex,
      });

      await delay(ctx.interTurnDelayMs);

      let barbaraSuggestedNext = false;
      const questionStartTime = Date.now();
      const effectiveTurns = question.recommendedFollowUps
        ?? ctx.template.defaultRecommendedFollowUps
        ?? ctx.maxTurnsPerQuestion;
      const hardCap = Math.min(
        effectiveTurns,
        SIMULATION_LIMITS.HARD_CAP_TURNS_PER_QUESTION,
      );

      for (let turn = 0; turn < hardCap; turn++) {
        if (Date.now() - questionStartTime > SIMULATION_LIMITS.PER_QUESTION_TIMEOUT_MS) break;

        const personaResponse = await generatePersonaResponse(
          ctx.persona, transcript, ctx.personaModel, usageCtx,
        );

        transcript.push({
          speaker: "respondent", text: personaResponse,
          timestamp: Date.now(), questionIndex,
        });

        const words = personaResponse.split(/\s+/).filter((w) => w.length > 0).length;
        metrics.wordCount += words;
        metrics.turnCount++;
        metrics.followUpCount++;
        previousAnswers.set(questionIndex, personaResponse);

        const speakingDelayMs = calculateSpeakingDelayMs(personaResponse, ctx.interTurnDelayMs);

        let barbaraGuidance: string | undefined;
        if (ctx.enableBarbara) {
          const barbaraMetrics: QuestionMetrics = {
            questionIndex: metrics.questionIndex,
            wordCount: metrics.wordCount,
            activeTimeMs: Date.now() - metrics.startedAt,
            turnCount: metrics.turnCount,
            startedAt: metrics.startedAt,
            followUpCount: metrics.followUpCount,
            recommendedFollowUps: question.recommendedFollowUps ?? null,
          };

          const { crossInterviewContext, analyticsHypotheses } = buildBarbaraContextFields(
            crossInterviewCtx, analyticsHypothesesCtx, questionIndex,
          );

          const raceResult = await runBarbaraWithRacing({
            transcriptLog: transcript,
            previousQuestionSummaries: questionSummaries,
            currentQuestionIndex: questionIndex,
            currentQuestion: { text: question.questionText, guidance: question.guidance || "" },
            allQuestions: ctx.questions.map((q) => ({
              text: q.questionText, guidance: q.guidance || "",
            })),
            questionMetrics: barbaraMetrics,
            templateObjective: ctx.template.objective || "",
            templateTone: ctx.template.tone || "professional",
            crossInterviewContext,
            analyticsHypotheses,
          }, usageCtx, speakingDelayMs);

          barbaraGuidance = raceResult.guidance;
          if (raceResult.suggestedNext) {
            barbaraSuggestedNext = true;
          }
        } else {
          await delay(speakingDelayMs);
        }

        const action = evaluateQuestionFlow({
          currentQuestionIndex: questionIndex,
          totalQuestions: ctx.questions.length,
          followUpCount: metrics.followUpCount,
          maxTurnsPerQuestion: hardCap,
          barbaraSuggestedNext,
          inAdditionalQuestionPhase: false,
          currentAdditionalQuestionIndex: 0,
          totalAdditionalQuestions: 0,
        });

        if (action !== "continue") break;

        const alviaFollowUp = await generateAlviaResponse(
          ctx.template, question, questionIndex, ctx.questions.length,
          transcript, barbaraGuidance, ctx.persona.name, ctx.questions,
          { followUpCount: metrics.followUpCount, recommendedFollowUps: question.recommendedFollowUps ?? null },
          true, ctx.alviaModel, usageCtx,
        );

        transcript.push({
          speaker: "alvia", text: alviaFollowUp,
          timestamp: Date.now(), questionIndex,
        });

        await delay(ctx.interTurnDelayMs);
      }

      try {
        const barbaraMetrics: QuestionMetrics = {
          questionIndex: metrics.questionIndex,
          wordCount: metrics.wordCount,
          activeTimeMs: Date.now() - metrics.startedAt,
          turnCount: metrics.turnCount,
          startedAt: metrics.startedAt,
          followUpCount: metrics.followUpCount,
          recommendedFollowUps: question.recommendedFollowUps ?? null,
        };

        const summary = await generateQuestionSummary(
          questionIndex, question.questionText, question.guidance || "",
          transcript, barbaraMetrics,
          ctx.template.objective || "", usageCtx,
        );
        questionSummaries.push(summary);
      } catch (err) {
        console.error(`[Simulation] Question summary failed for Q${questionIndex}:`, err);
      }

      await storage.createSegment({
        sessionId: session.id,
        questionId: question.id,
        transcript: transcript
          .filter((e) => e.questionIndex === questionIndex)
          .map((e) => `[${e.speaker}]: ${e.text}`)
          .join("\n"),
        summaryBullets: questionSummaries[questionSummaries.length - 1]?.keyInsights || [],
      });

      const nextIndex = getNextQuestionIndex(questionIndex, ctx.questions, previousAnswers);
      if (nextIndex === null) break;
      questionIndex = nextIndex;
    }

    if (ctx.enableAdditionalQuestions && (ctx.collection.maxAdditionalQuestions ?? 0) > 0) {
      await runAdditionalQuestions(
        ctx, session.id, transcript, questionSummaries, usageCtx,
        crossInterviewCtx, analyticsHypothesesCtx,
      );
    }

    if (ctx.enableSummaries) {
      try {
        const summary = await generateSessionSummary({
          transcript,
          questionSummaries,
          templateObjective: ctx.template.objective || "",
          projectObjective: ctx.project.objective || "",
          strategicContext: ctx.project.strategicContext || "",
          questions: ctx.questions.map((q) => ({ text: q.questionText, guidance: q.guidance })),
        }, usageCtx);

        await storage.updateSession(session.id, {
          barbaraSessionSummary: summary,
        });
      } catch (err) {
        console.error(`[Simulation] Session summary failed:`, err);
      }
    }

    await storage.updateSession(session.id, {
      status: "completed",
      completedAt: new Date(),
      totalDurationMs: Date.now() - sessionStartTime,
      liveTranscript: transcript as any,
      questionSummaries: questionSummaries as any,
      currentQuestionIndex: ctx.questions.length - 1,
    });

    await storage.updateRespondent(respondent.id, { invitationStatus: "completed" });

  } catch (err) {
    console.error(`[Simulation] Session ${session.id} failed:`, err);
    await storage.updateSession(session.id, {
      status: "abandoned",
      totalDurationMs: Date.now() - sessionStartTime,
    });
    throw err;
  }
}

async function runAdditionalQuestions(
  ctx: SimulationContext,
  sessionId: string,
  transcript: TranscriptEntry[],
  questionSummaries: QuestionSummary[],
  usageCtx: LLMUsageAttribution,
  crossInterviewCtx: CrossInterviewRuntimeContext,
  analyticsHypothesesCtx: AnalyticsHypothesesRuntimeContext,
): Promise<void> {
  try {
    const maxAQ = ctx.collection.maxAdditionalQuestions ?? 1;
    const aqResult = await generateAdditionalQuestions({
      transcriptLog: transcript,
      templateQuestions: ctx.questions.map((q) => ({
        text: q.questionText,
        guidance: q.guidance,
      })),
      questionSummaries,
      projectObjective: ctx.project.objective || "",
      audienceContext: ctx.project.audienceContext || null,
      tone: ctx.template.tone || null,
      maxQuestions: maxAQ,
      strategicContext: ctx.project.strategicContext,
      contextType: ctx.project.contextType,
      avoidRules: ctx.project.avoidRules,
    }, usageCtx);

    if (!aqResult.questions || aqResult.questions.length === 0) return;

    const aqHardCap = Math.min(
      ctx.maxAQTurnsPerQuestion,
      SIMULATION_LIMITS.HARD_CAP_TURNS_PER_QUESTION,
    );

    for (let aqIdx = 0; aqIdx < aqResult.questions.length; aqIdx++) {
      const aq = aqResult.questions[aqIdx];
      const aqQuestionIndex = ctx.questions.length + aqIdx;

      transcript.push({
        speaker: "alvia", text: aq.questionText,
        timestamp: Date.now(), questionIndex: aqQuestionIndex,
      });

      await delay(ctx.interTurnDelayMs);

      let barbaraSuggestedNext = false;
      const aqMetrics: SimulationQuestionMetrics = {
        questionIndex: aqQuestionIndex,
        wordCount: 0,
        turnCount: 0,
        followUpCount: 0,
        startedAt: Date.now(),
      };

      for (let turn = 0; turn < aqHardCap; turn++) {
        const personaResponse = await generatePersonaResponse(
          ctx.persona, transcript, ctx.personaModel, usageCtx,
        );

        transcript.push({
          speaker: "respondent", text: personaResponse,
          timestamp: Date.now(), questionIndex: aqQuestionIndex,
        });

        const words = personaResponse.split(/\s+/).filter((w) => w.length > 0).length;
        aqMetrics.wordCount += words;
        aqMetrics.turnCount++;
        aqMetrics.followUpCount++;

        const speakingDelayMs = calculateSpeakingDelayMs(personaResponse, ctx.interTurnDelayMs);

        let barbaraGuidance: string | undefined;
        if (ctx.enableBarbara) {
          const barbaraMetrics: QuestionMetrics = {
            questionIndex: aqMetrics.questionIndex,
            wordCount: aqMetrics.wordCount,
            activeTimeMs: Date.now() - aqMetrics.startedAt,
            turnCount: aqMetrics.turnCount,
            startedAt: aqMetrics.startedAt,
            followUpCount: aqMetrics.followUpCount,
            recommendedFollowUps: null,
          };

          const { crossInterviewContext, analyticsHypotheses } = buildBarbaraContextFields(
            crossInterviewCtx, analyticsHypothesesCtx, aqQuestionIndex,
          );

          const raceResult = await runBarbaraWithRacing({
            transcriptLog: transcript,
            previousQuestionSummaries: questionSummaries,
            currentQuestionIndex: aqQuestionIndex,
            currentQuestion: { text: aq.questionText, guidance: "" },
            allQuestions: ctx.questions.map((q) => ({
              text: q.questionText, guidance: q.guidance || "",
            })),
            questionMetrics: barbaraMetrics,
            templateObjective: ctx.template.objective || "",
            templateTone: ctx.template.tone || "professional",
            crossInterviewContext,
            analyticsHypotheses,
          }, usageCtx, speakingDelayMs);

          barbaraGuidance = raceResult.guidance;
          if (raceResult.suggestedNext) {
            barbaraSuggestedNext = true;
          }
        } else {
          await delay(speakingDelayMs);
        }

        const action = evaluateQuestionFlow({
          currentQuestionIndex: aqQuestionIndex,
          totalQuestions: ctx.questions.length,
          followUpCount: aqMetrics.followUpCount,
          maxTurnsPerQuestion: aqHardCap,
          barbaraSuggestedNext,
          inAdditionalQuestionPhase: true,
          currentAdditionalQuestionIndex: aqIdx,
          totalAdditionalQuestions: aqResult.questions.length,
        });

        if (action !== "continue") break;

        const aqAsQuestion = {
          questionText: aq.questionText,
          guidance: "",
        } as Question;

        const alviaFollowUp = await generateAlviaResponse(
          ctx.template,
          aqAsQuestion,
          aqQuestionIndex, ctx.questions.length,
          transcript, barbaraGuidance, ctx.persona.name, ctx.questions,
          { followUpCount: aqMetrics.followUpCount, recommendedFollowUps: null },
          true, ctx.alviaModel, usageCtx,
        );

        transcript.push({
          speaker: "alvia", text: alviaFollowUp,
          timestamp: Date.now(), questionIndex: aqQuestionIndex,
        });

        await delay(ctx.interTurnDelayMs);
      }

      await storage.createSegment({
        sessionId,
        questionId: null,
        additionalQuestionIndex: aqIdx,
        additionalQuestionText: aq.questionText,
        transcript: transcript
          .filter((e) => e.questionIndex === aqQuestionIndex)
          .map((e) => `[${e.speaker}]: ${e.text}`)
          .join("\n"),
      });
    }
  } catch (err) {
    console.error(`[Simulation] Additional questions failed:`, err);
  }
}

export async function cancelSimulationRun(runId: string): Promise<void> {
  await updateSimulationRun(runId, { status: "cancelled", completedAt: new Date() });
}

export async function executeSimulationRun(
  runId: string,
  collectionId: string,
  personaIds: string[],
  launchedBy: string,
  options: {
    enableBarbara: boolean;
    enableSummaries: boolean;
    enableAdditionalQuestions: boolean;
    alviaModel?: string;
    personaModel?: string;
    maxTurnsPerQuestion?: number;
    maxAQTurnsPerQuestion?: number;
  },
): Promise<void> {
  const lockAcquired = await acquireSimulationLock(SIMULATION_LIMITS.MAX_CONCURRENT_RUNS);
  if (!lockAcquired) {
    await updateSimulationRun(runId, {
      status: "failed",
      errorMessage: "Too many concurrent simulations. Please wait for others to finish.",
    });
    return;
  }

  try {
    try {
      if (await isSimulationRunCancelled(runId)) {
        return;
      }
      await updateSimulationRun(runId, { status: "running", startedAt: new Date() });
    } finally {
      await releaseSimulationLock();
    }

    const collection = await storage.getCollection(collectionId);
    if (!collection) throw new Error("Collection not found");

    const template = await storage.getTemplate(collection.templateId);
    if (!template) throw new Error("Template not found");

    const project = await storage.getProject(template.projectId);
    if (!project) throw new Error("Project not found");

    const questions = await storage.getQuestionsByTemplate(template.id);
    questions.sort((a, b) => a.orderIndex - b.orderIndex);

    if (questions.length === 0) {
      await updateSimulationRun(runId, {
        status: "failed",
        errorMessage: "Template has no questions",
      });
      return;
    }

    let completed = 0;
    let failed = 0;
    const PARALLEL_LIMIT = 3;

    const personas = await Promise.all(
      personaIds.map(async (id) => {
        const persona = await getPersona(id);
        if (!persona) {
          failed++;
          console.error(`[Simulation] Persona ${id} not found, skipping`);
        }
        return persona;
      }),
    );

    const validPersonas = personas.filter((p): p is NonNullable<typeof p> => p !== null);

    if (failed > 0) {
      await updateSimulationRun(runId, { failedSimulations: failed });
    }

    for (let i = 0; i < validPersonas.length; i += PARALLEL_LIMIT) {
      if (await isSimulationRunCancelled(runId)) {
        return;
      }

      const batch = validPersonas.slice(i, i + PARALLEL_LIMIT);
      const results = await Promise.allSettled(
        batch.map(async (persona) => {
          const ctx: SimulationContext = {
            project, template, collection, questions, persona, runId,
            enableBarbara: options.enableBarbara,
            enableSummaries: options.enableSummaries,
            enableAdditionalQuestions: options.enableAdditionalQuestions,
            alviaModel: options.alviaModel || "gpt-4o-mini",
            personaModel: options.personaModel || "gpt-4o-mini",
            maxTurnsPerQuestion: options.maxTurnsPerQuestion ?? 6,
            maxAQTurnsPerQuestion: options.maxAQTurnsPerQuestion ?? 3,
            interTurnDelayMs: 200,
          };
          await runSingleSimulation(ctx);
        }),
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          completed++;
        } else {
          failed++;
          console.error(`[Simulation] Persona ${batch[j].name} failed:`, (results[j] as PromiseRejectedResult).reason);
        }
      }

      await updateSimulationRun(runId, {
        completedSimulations: completed,
        failedSimulations: failed,
      });
    }

    await updateSimulationRun(runId, {
      status: failed === personaIds.length ? "failed" : "completed",
      completedSimulations: completed,
      failedSimulations: failed,
      completedAt: new Date(),
      errorMessage: failed > 0 ? `${failed} of ${personaIds.length} simulations failed` : null,
    });
  } catch (err: any) {
    console.error(`[Simulation] Run ${runId} failed:`, err);
    await updateSimulationRun(runId, {
      status: "failed",
      errorMessage: err.message || "Unknown error",
      completedAt: new Date(),
    });
  }
}
