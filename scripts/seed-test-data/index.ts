import OpenAI from 'openai';
import { DatabaseStorage } from '../../server/storage';
import { SEED_CONFIG } from './config';
import { SCENARIOS } from './scenarios';
import { generateStructure, type GeneratedStructure } from './generators/structure';
import { generatePersonas, type GeneratedPersona } from './generators/personas';
import { generateConversation, type TranscriptEntry } from './generators/conversations';
import { generateQuestionSummary, calculateOverallQualityScore, type QuestionSummaryData } from './generators/summaries';
import { generateSessionTimestamps } from './utils/timestamps';

interface QuestionState {
  questionIndex: number;
  status: 'pending' | 'in_progress' | 'answered' | 'skipped';
  barbaraSuggestedMoveOn: boolean;
  wordCount: number;
  turnCount: number;
  activeTimeMs: number;
  followUpCount?: number;
  recommendedFollowUps?: number;
}

async function cleanTestData(storage: DatabaseStorage): Promise<void> {
  console.log('Cleaning previous test data...');
  console.log('   Note: Manual cleanup may be needed for test-harness workspaces');
}

async function seedScenario(
  storage: DatabaseStorage,
  openai: OpenAI,
  scenario: typeof SCENARIOS[0],
  respondentCount: number,
  dryRun: boolean
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario: ${scenario.name}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const testUserId = 'test-harness-user';
  
  console.log('Creating project structure...');
  let structure: GeneratedStructure;
  
  if (dryRun) {
    console.log('   [DRY RUN] Would create workspace, project, template, collection');
    structure = {
      workspaceId: 'dry-run-workspace',
      projectId: 'dry-run-project',
      templateId: 'dry-run-template',
      collectionId: 'dry-run-collection',
      questionIds: scenario.questions.map((_, i) => `dry-run-question-${i}`)
    };
  } else {
    structure = await generateStructure(storage, scenario, testUserId);
    console.log(`   Workspace: ${structure.workspaceId}`);
    console.log(`   Project: ${structure.projectId}`);
    console.log(`   Template: ${structure.templateId}`);
    console.log(`   Collection: ${structure.collectionId}`);
    console.log(`   Questions: ${structure.questionIds.length}`);
  }
  
  console.log(`\nGenerating ${respondentCount} respondent personas...`);
  const personas = await generatePersonas(
    openai,
    scenario.objective,
    scenario.audienceContext,
    respondentCount
  );
  
  const qualityCounts = personas.reduce((acc, p) => {
    acc[p.qualityTendency] = (acc[p.qualityTendency] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('   Quality distribution:');
  Object.entries(qualityCounts).forEach(([q, c]) => console.log(`      - ${q}: ${c}`));
  
  console.log(`\nSimulating ${respondentCount} interviews...`);
  
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`\n   [${i + 1}/${respondentCount}] ${persona.fullName} (${persona.qualityTendency})`);
    
    if (dryRun) {
      console.log('      [DRY RUN] Would generate conversation and save session');
      continue;
    }
    
    const respondent = await storage.createRespondent({
      collectionId: structure.collectionId,
      email: persona.email,
      displayName: persona.name,
      fullName: persona.fullName,
      informalName: persona.name,
      profileFields: {
        background: persona.background,
        traits: persona.traits
      }
    });
    
    const { sessionStart, baseTimestamps, totalDurationMs } = generateSessionTimestamps(
      scenario.questions.length
    );
    
    const allTranscript: TranscriptEntry[] = [];
    const questionStates: QuestionState[] = [];
    const questionSummaries: QuestionSummaryData[] = [];
    let previousContext = '';
    
    for (let qIndex = 0; qIndex < scenario.questions.length; qIndex++) {
      const question = scenario.questions[qIndex];
      process.stdout.write(`      Q${qIndex + 1}...`);
      
      const conversation = await generateConversation(
        openai,
        persona,
        question,
        qIndex,
        scenario.objective,
        previousContext,
        baseTimestamps[qIndex]
      );
      
      allTranscript.push(...conversation.transcript);
      
      const questionState: QuestionState = {
        questionIndex: qIndex,
        status: 'answered',
        barbaraSuggestedMoveOn: Math.random() > 0.7,
        wordCount: conversation.wordCount,
        turnCount: conversation.transcript.length,
        activeTimeMs: 0,
        followUpCount: conversation.followUpCount,
        recommendedFollowUps: question.recommendedFollowUps
      };
      questionStates.push(questionState);
      
      const transcriptText = conversation.transcript
        .map(t => `${t.speaker === 'alvia' ? 'Alvia' : persona.name}: ${t.text}`)
        .join('\n');
      
      const summary = await generateQuestionSummary(
        openai,
        question.text,
        transcriptText,
        persona,
        qIndex,
        conversation.wordCount,
        conversation.transcript.length,
        baseTimestamps[qIndex]
      );
      questionSummaries.push(summary);
      
      previousContext = summary.keyInsights.slice(0, 2).join('; ');
      
      process.stdout.write(' done\n');
    }
    
    const session = await storage.createSession({
      collectionId: structure.collectionId,
      respondentId: respondent.id,
      status: 'completed',
      currentQuestionIndex: scenario.questions.length,
      startedAt: sessionStart,
      completedAt: new Date(sessionStart.getTime() + totalDurationMs),
      totalDurationMs: Math.round(totalDurationMs),
      liveTranscript: allTranscript,
      questionStates: questionStates,
      questionSummaries: questionSummaries,
      reviewRatings: generateReviewRatings(persona),
      reviewCompletedAt: new Date(sessionStart.getTime() + totalDurationMs + 60000)
    });
    
    for (let qIndex = 0; qIndex < scenario.questions.length; qIndex++) {
      const summary = questionSummaries[qIndex];
      const questionTranscript = allTranscript
        .filter(t => t.questionIndex === qIndex)
        .map(t => `${t.speaker === 'alvia' ? 'Alvia' : persona.name}: ${t.text}`)
        .join('\n');
      
      await storage.createSegment({
        sessionId: session.id,
        questionId: structure.questionIds[qIndex],
        transcript: questionTranscript,
        startTimeMs: Math.round(baseTimestamps[qIndex] - sessionStart.getTime()),
        endTimeMs: Math.round((baseTimestamps[qIndex + 1] || (sessionStart.getTime() + totalDurationMs)) - sessionStart.getTime()),
        summaryBullets: summary.keyInsights,
        keyQuotes: summary.verbatims,
        qualityScore: summary.qualityScore,
        qualityFlags: summary.qualityFlags
      });
    }
    
    console.log(`      Session ${session.id.slice(0, 8)}... saved with ${scenario.questions.length} segments`);
  }
  
  console.log(`\nScenario "${scenario.name}" complete!`);
}

function generateReviewRatings(persona: GeneratedPersona): Record<string, number> {
  const baseRating = persona.sentimentLeaning === 'positive' ? 4 :
                     persona.sentimentLeaning === 'negative' ? 3 :
                     persona.sentimentLeaning === 'mixed' ? 3.5 : 4;
  
  return {
    overallExperience: Math.min(5, Math.max(1, Math.round(baseRating + (Math.random() - 0.5)))),
    alviaUnderstanding: Math.min(5, Math.max(1, Math.round(baseRating + (Math.random() - 0.3)))),
    questionClarity: Math.min(5, Math.max(1, Math.round(baseRating + 0.5 + (Math.random() - 0.5)))),
    conversationFlow: Math.min(5, Math.max(1, Math.round(baseRating + (Math.random() - 0.5)))),
    technicalQuality: Math.min(5, Math.max(1, Math.round(baseRating + 0.3 + (Math.random() - 0.5))))
  };
}

async function main() {
  console.log('Starting Analytics Test Harness\n');
  
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cleanFirst = args.includes('--clean');
  const scenarioFilter = args.find(a => a.startsWith('--scenario='))?.split('=')[1];
  const countOverride = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '0');
  
  const respondentCount = countOverride || SEED_CONFIG.respondentsPerCollection;
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }
  
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const storage = new DatabaseStorage();
  
  if (cleanFirst) {
    await cleanTestData(storage);
  }
  
  const scenariosToRun = scenarioFilter
    ? SCENARIOS.filter(s => s.name.toLowerCase().includes(scenarioFilter.toLowerCase()))
    : SCENARIOS;
  
  console.log(`Running ${scenariosToRun.length} scenario(s) with ${respondentCount} respondents each`);
  if (dryRun) console.log('DRY RUN MODE - No data will be written\n');
  
  for (const scenario of scenariosToRun) {
    await seedScenario(storage, openai, scenario, respondentCount, dryRun);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test harness complete!');
  console.log('='.repeat(60));
  
  if (!dryRun) {
    console.log('\nNext steps:');
    console.log('1. Navigate to the dashboard to see the new projects');
    console.log('2. Open a collection and click "Refresh Analytics"');
    console.log('3. Navigate up to Template and Project levels to test those analytics');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
