import type { QualityTendency } from './config';

export type QuestionType = "open" | "yes_no" | "scale" | "numeric" | "multi_select";

export interface ScenarioQuestion {
  text: string;
  type: QuestionType;
  guidance: string;
  scaleMin?: number;
  scaleMax?: number;
  multiSelectOptions?: string[];
  timeHintSeconds?: number;
  recommendedFollowUps?: number;
}

export interface Scenario {
  name: string;
  projectName: string;
  projectDescription: string;
  templateName: string;
  collectionName: string;
  objective: string;
  audienceContext: string;
  strategicContext: string;
  contextType: "product" | "cx" | "content" | "marketing" | "other";
  tone: string;
  defaultRecommendedFollowUps?: number;
  questions: ScenarioQuestion[];
}

export const SCENARIOS: Scenario[] = [
  {
    name: "Product Discovery Research",
    projectName: "Product Discovery Study Q1 2026",
    projectDescription: "Understanding how B2B professionals discover and evaluate new software tools",
    templateName: "Product Discovery Interview v1",
    collectionName: "January 2026 Product Discovery",
    objective: "Understand how users discover, evaluate, and adopt new software tools for their work",
    audienceContext: "B2B SaaS professionals at companies with 50-500 employees who evaluate productivity and collaboration tools",
    strategicContext: "We are planning to launch a new AI-powered productivity tool and need to understand the competitive landscape and user decision-making process to inform product positioning and feature prioritization.",
    contextType: "product",
    tone: "conversational",
    defaultRecommendedFollowUps: 2,
    questions: [
      {
        text: "How do you typically discover new tools for your work?",
        type: "open",
        guidance: "Probe for specific channels: word of mouth, social media, review sites, search, conferences. Ask for recent examples.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2
      },
      {
        text: "Think about the last software tool you adopted at work. What made you decide to try it?",
        type: "open",
        guidance: "Explore the trigger event, pain point, or opportunity that led to the search. Get specific details about the situation.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3
      },
      {
        text: "On a scale of 1 to 10, how satisfied are you with your current workflow tools?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance: "After the rating, probe for what's working well and what frustrates them most.",
        timeHintSeconds: 90,
        recommendedFollowUps: 2
      },
      {
        text: "What factors matter most when you're evaluating a new tool?",
        type: "open",
        guidance: "Look for: price, ease of use, integrations, team adoption, security, support. Rank importance.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2
      },
      {
        text: "Have you ever abandoned a tool after trying it? What went wrong?",
        type: "open",
        guidance: "Understand failure modes: complexity, lack of adoption, poor support, missing features, cost.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3
      },
      {
        text: "If you could wave a magic wand and improve one thing about how you work, what would it be?",
        type: "open",
        guidance: "Listen for unmet needs and latent desires. This often reveals the strongest product opportunities.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2
      }
    ]
  },
  {
    name: "Customer Experience Feedback",
    projectName: "Customer Support Experience Study",
    projectDescription: "Evaluating customer satisfaction with support interactions and identifying improvement opportunities",
    templateName: "Support Experience Interview v1",
    collectionName: "Q1 2026 Support Feedback",
    objective: "Evaluate customer satisfaction with support interactions and identify opportunities to improve the support experience",
    audienceContext: "Customers who have contacted customer support in the past 30 days across various channels (phone, chat, email)",
    strategicContext: "We are redesigning our customer support experience and need to understand pain points, channel preferences, and expectations to reduce resolution time and increase CSAT scores.",
    contextType: "cx",
    tone: "empathetic",
    defaultRecommendedFollowUps: 2,
    questions: [
      {
        text: "Can you tell me about your most recent experience contacting our support team?",
        type: "open",
        guidance: "Let them narrate freely first. Note the channel used, issue type, and emotional tone.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3
      },
      {
        text: "How would you rate the overall support experience on a scale of 1 to 10?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance: "After rating, ask what would have made it a 10 (or why it was a 10).",
        timeHintSeconds: 90,
        recommendedFollowUps: 2
      },
      {
        text: "Was your issue resolved to your satisfaction?",
        type: "yes_no",
        guidance: "If no, explore what's still unresolved. If yes, ask how long it took and if that met expectations.",
        timeHintSeconds: 60,
        recommendedFollowUps: 2
      },
      {
        text: "Which support channels have you used, and which do you prefer?",
        type: "multi_select",
        multiSelectOptions: ["Phone", "Email", "Live Chat", "Self-service/Help Center", "Social Media"],
        guidance: "After selection, probe for why they prefer certain channels and when they use each.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2
      },
      {
        text: "What frustrated you most about the support experience?",
        type: "open",
        guidance: "Listen for: wait times, transfers, repeating information, unclear solutions, tone issues.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2
      },
      {
        text: "If you could change one thing about how we handle support, what would it be?",
        type: "open",
        guidance: "Capture specific, actionable suggestions. Probe for the underlying need behind the request.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2
      }
    ]
  }
];
