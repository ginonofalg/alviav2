import { storage } from "./storage";
import type { InsertProject, InsertTemplate, InsertQuestion } from "@shared/schema";

const DEMO_PROJECT: Omit<InsertProject, "workspaceId"> = {
  name: "Alvia Demo — Your Coffee Ritual",
  description: "A demonstration template showcasing Alvia's unique interview capabilities: adaptive probing, cross-referencing prior answers, extracting qualitative depth from quantitative questions, and knowing when to move on.",
  objective: "Understand the emotional and functional drivers behind coffee consumption habits to inform the redesign of a premium café experience. Uncover not just what people do, but why — what frustrates them, what delights them, and what unmet needs exist beyond the obvious.",
  audienceContext: "General consumers aged 18+ who drink coffee at least a few times per week. No specialist knowledge required — everyone has a coffee story.",
  tone: "warm",
  timingGuidance: "This interview should take around 12-15 minutes. Allow respondents time to think and elaborate — the richest insights come from unhurried responses.",
  consentAudioRecording: true,
  consentTranscriptOnly: false,
  piiRedactionEnabled: true,
  crossInterviewContext: false,
  crossInterviewThreshold: 5,
  avoidRules: [
    "Do not ask about specific competitor brands by name",
    "Avoid leading questions that suggest a preferred answer",
    "Do not probe into personal financial circumstances beyond coffee spending"
  ],
  strategicContext: "CoffeeForward is a premium café chain planning a complete experience redesign across 200 locations. They need to understand what genuinely matters to customers beyond good coffee and fast service. Key business questions: Should they invest more in ambience, menu innovation, digital ordering, community spaces, or barista training? They suspect there are unmet emotional and social needs that competitors aren't addressing.",
  contextType: "cx"
};

const DEMO_TEMPLATE: Omit<InsertTemplate, "projectId"> = {
  name: "Coffee Ritual — Feature Showcase",
  version: 1,
  objective: "Explore the emotional and functional relationship people have with coffee and café experiences. Each question is designed to trigger a specific Alvia capability: adaptive probing, cross-referencing prior answers, extracting qualitative insight from quantitative questions, and graceful conversation management.",
  tone: "warm",
  constraints: "Let the conversation flow naturally. Avoid rushing between questions — the pauses and elaborations are where the best insights emerge. When respondents reference something from an earlier answer, acknowledge it explicitly. For scale and numeric questions, always probe for the reasoning behind the number.",
  isActive: true,
  defaultRecommendedFollowUps: 2
};

const DEMO_QUESTIONS: Omit<InsertQuestion, "templateId">[] = [
  {
    orderIndex: 0,
    questionText: "Walk me through your typical morning — from the moment you wake up to when you're settled into your day.",
    questionType: "open",
    guidance: "Probe for the role that coffee or beverages play in their morning routine. Listen for emotional language about rituals, habits, and the feeling of settling in. Note any mentions of specific places, brands, or social interactions around morning beverages — these will become valuable cross-references in later questions. Many respondents will give a brief, surface-level answer first (\"I wake up, shower, make coffee, go to work\"). If this happens, probe gently: what does that coffee moment actually feel like? Is it rushed or savoured? Alone or with someone?",
    timeHintSeconds: 90,
    isRequired: true,
    recommendedFollowUps: 2
  },
  {
    orderIndex: 1,
    questionText: "On a scale of 1 to 10, how satisfied are you with your current go-to place for coffee?",
    questionType: "scale",
    guidance: "After capturing the rating, this is the key moment: probe for the reasoning behind that specific number. What drives it? What would move it up to a 10? What's holding it back? Listen carefully for both functional factors (speed, price, consistency) and emotional factors (how the place makes them feel, whether they feel welcome, whether it's \"theirs\"). The gap between their number and 10 is where the richest insight lives.",
    scaleMin: 1,
    scaleMax: 10,
    timeHintSeconds: 75,
    isRequired: true,
    recommendedFollowUps: 2
  },
  {
    orderIndex: 2,
    questionText: "Tell me about the last time a café or coffee experience genuinely surprised you — positively or negatively.",
    questionType: "open",
    guidance: "This question is designed to showcase adaptive probing. Many respondents will start with a vague answer (\"It was really nice\" or \"Nothing comes to mind\"). Push past generalisations toward concrete, sensory details: What did they see, smell, taste? How did it make them feel? Did it change their behaviour afterward — did they go back, tell someone about it, or avoid the place? With 3 recommended follow-ups, there is room to go deep. The goal is a vivid story, not a summary. If they truly struggle to recall a café experience, broaden to any memorable food or drink experience.",
    timeHintSeconds: 90,
    isRequired: true,
    recommendedFollowUps: 3
  },
  {
    orderIndex: 3,
    questionText: "What makes a café feel like your place — somewhere you'd actually want to return to regularly?",
    questionType: "open",
    guidance: "By this point the respondent has described their morning routine (Q1), rated their current spot (Q2), and recounted a surprising experience (Q3). This question deliberately overlaps with all three. When topic overlap is detected, acknowledge it explicitly — \"You mentioned earlier that...\" or \"It sounds like this connects to what you said about...\" — this is the \"wow, it was actually listening\" moment. Explore emotional attachment and belonging. What creates loyalty beyond habit? Listen for sensory, social, and identity-related factors. Distinguish between functional requirements (good coffee, convenient location) and emotional pull (feeling known, feeling like it's part of their identity).",
    timeHintSeconds: 75,
    isRequired: true,
    recommendedFollowUps: 2
  },
  {
    orderIndex: 4,
    questionText: "Roughly how much would you say you spend on coffee in a typical week?",
    questionType: "numeric",
    guidance: "After capturing the amount, probe for how they feel about that number. Is it too much? Worth every penny? A guilty pleasure they try not to think about? Explore whether they've ever tried to cut back and what happened. Listen for value perception — what makes coffee \"worth it\" versus feeling like a waste. This question also demonstrates follow-up deduplication: do NOT probe into café preferences or atmosphere here, as Q4 already covered that territory. Stay focused on the spending/value dimension.",
    timeHintSeconds: 60,
    isRequired: true,
    recommendedFollowUps: 2
  },
  {
    orderIndex: 5,
    questionText: "If you could design your perfect coffee experience from scratch — the space, the service, the whole thing — what would it look like?",
    questionType: "open",
    guidance: "This is the culminating question. Let the respondent dream freely. Listen for whether their \"perfect\" experience reflects the frustrations and delights they described in earlier answers — the satisfaction gaps from Q2, the surprising moments from Q3, the belonging factors from Q4, the value tensions from Q5. Acknowledge these connections when natural (\"It sounds like your perfect place would solve that issue you mentioned earlier...\"). Probe gently for specifics but don't over-direct — this should feel imaginative and expansive. This is also where \"knowing when to stop\" matters most: once they've painted a vivid picture, wrap gracefully rather than pushing for yet more detail. A strong, complete answer here is the natural end of the interview.",
    timeHintSeconds: 90,
    isRequired: true,
    recommendedFollowUps: 2
  }
];

export async function seedDemoProjectIfNeeded(userId: string): Promise<void> {
  try {
    const userProjects = await storage.getProjectsByUser(userId);
    
    if (userProjects.length > 0) {
      return;
    }
    
    const userWorkspaces = await storage.getWorkspacesByOwner(userId);
    if (userWorkspaces.length === 0) {
      console.error("[demo-seed] No workspace found for user after getProjectsByUser call");
      return;
    }
    
    const workspace = userWorkspaces[0];
    
    const project = await storage.createProject({
      ...DEMO_PROJECT,
      workspaceId: workspace.id
    });
    
    const template = await storage.createTemplate({
      ...DEMO_TEMPLATE,
      projectId: project.id
    });
    
    const questionsToCreate: InsertQuestion[] = DEMO_QUESTIONS.map(q => ({
      ...q,
      templateId: template.id
    }));
    
    await storage.createQuestions(questionsToCreate);
    
    console.log(`[demo-seed] Created demo project for user ${userId}: project=${project.id}, template=${template.id}`);
  } catch (error) {
    console.error("[demo-seed] Failed to seed demo project:", error);
    throw error;
  }
}
