import type { QualityTendency } from "./config";

export type QuestionType =
  | "open"
  | "yes_no"
  | "scale"
  | "numeric"
  | "multi_select";

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
    projectDescription:
      "Understanding how B2B professionals discover and evaluate new software tools",
    templateName: "Product Discovery Interview v1",
    collectionName: "January 2026 Product Discovery",
    objective:
      "Understand how users discover, evaluate, and adopt new software tools for their work",
    audienceContext:
      "B2B SaaS professionals at companies with 50-500 employees who evaluate productivity and collaboration tools",
    strategicContext:
      "We are planning to launch a new AI-powered productivity tool and need to understand the competitive landscape and user decision-making process to inform product positioning and feature prioritization.",
    contextType: "product",
    tone: "conversational",
    defaultRecommendedFollowUps: 2,
    questions: [
      {
        text: "How do you typically discover new tools for your work?",
        type: "open",
        guidance:
          "Probe for specific channels: word of mouth, social media, review sites, search, conferences. Ask for recent examples.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "Think about the last software tool you adopted at work. What made you decide to try it?",
        type: "open",
        guidance:
          "Explore the trigger event, pain point, or opportunity that led to the search. Get specific details about the situation.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3,
      },
      {
        text: "On a scale of 1 to 10, how satisfied are you with your current workflow tools?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance:
          "After the rating, probe for what's working well and what frustrates them most.",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "What factors matter most when you're evaluating a new tool?",
        type: "open",
        guidance:
          "Look for: price, ease of use, integrations, team adoption, security, support. Rank importance.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "Have you ever abandoned a tool after trying it? What went wrong?",
        type: "open",
        guidance:
          "Understand failure modes: complexity, lack of adoption, poor support, missing features, cost.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3,
      },
      {
        text: "If you could wave a magic wand and improve one thing about how you work, what would it be?",
        type: "open",
        guidance:
          "Listen for unmet needs and latent desires. This often reveals the strongest product opportunities.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
    ],
  },
  {
    name: "Customer Experience Feedback",
    projectName: "Customer Support Experience Study",
    projectDescription:
      "Evaluating customer satisfaction with support interactions and identifying improvement opportunities",
    templateName: "Support Experience Interview v1",
    collectionName: "Q1 2026 Support Feedback",
    objective:
      "Evaluate customer satisfaction with support interactions and identify opportunities to improve the support experience",
    audienceContext:
      "Customers who have contacted customer support in the past 30 days across various channels (phone, chat, email)",
    strategicContext:
      "We are redesigning our customer support experience and need to understand pain points, channel preferences, and expectations to reduce resolution time and increase CSAT scores.",
    contextType: "cx",
    tone: "empathetic",
    defaultRecommendedFollowUps: 2,
    questions: [
      {
        text: "Can you tell me about your most recent experience contacting our support team?",
        type: "open",
        guidance:
          "Let them narrate freely first. Note the channel used, issue type, and emotional tone.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3,
      },
      {
        text: "How would you rate the overall support experience on a scale of 1 to 10?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance:
          "After rating, ask what would have made it a 10 (or why it was a 10).",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "Was your issue resolved to your satisfaction?",
        type: "yes_no",
        guidance:
          "If no, explore what's still unresolved. If yes, ask how long it took and if that met expectations.",
        timeHintSeconds: 60,
        recommendedFollowUps: 2,
      },
      {
        text: "Which support channels have you used, and which do you prefer?",
        type: "multi_select",
        multiSelectOptions: [
          "Phone",
          "Email",
          "Live Chat",
          "Self-service/Help Center",
          "Social Media",
        ],
        guidance:
          "After selection, probe for why they prefer certain channels and when they use each.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "What frustrated you most about the support experience?",
        type: "open",
        guidance:
          "Listen for: wait times, transfers, repeating information, unclear solutions, tone issues.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "If you could change one thing about how we handle support, what would it be?",
        type: "open",
        guidance:
          "Capture specific, actionable suggestions. Probe for the underlying need behind the request.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
    ],
  },
  {
    name: "Renewal Value and Pricing Signals",
    projectName: "Home Heating Cover Renewal Decision Study",
    projectDescription:
      "Understanding what drives renewals and churn, how customers judge value for money, and which proposition changes would improve retention without killing margin",
    templateName: "Commercial Renewal Interview v1",
    collectionName: "Q1 2026 Renewal Deep Dives",
    objective:
      "Identify the value drivers and deal-breakers that influence renewal decisions, and test appetite for tiered bundles and add-ons to reduce churn and improve sustainable profitability",
    audienceContext:
      "Customers up for renewal in the next 60 days, plus customers who cancelled in the last 90 days, across different plans and tenure bands",
    strategicContext:
      "We are redesigning our propositions and pricing for home heating cover. Internal data shows churn spikes after price changes and after certain claim journeys, but we don't know which parts are 'price pain' versus 'value doubt'. We need to learn what customers actually value, where they feel short-changed, which alternatives they compare us to, and what trade-offs they will accept (cover scope, excess, response times, servicing, bundles). We will use findings to shape tier design, messaging, retention interventions, and prioritise fixes that move both retention and profit.",
    contextType: "product",
    tone: "pragmatic",
    defaultRecommendedFollowUps: 2,
    questions: [
      {
        text: "Talk me through why you chose your current plan in the first place, what problem were you trying to solve?",
        type: "open",
        guidance:
          "Let them narrate. Listen for trigger events (breakdown, moving house, bad prior experience), and whether it was proactive peace-of-mind or reactive panic buying.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3,
      },
      {
        text: "When you think about renewing, what are the top 3 things you weigh up?",
        type: "open",
        guidance:
          "Push for prioritisation. Capture the hierarchy: price, trust, speed, cover scope, convenience, service history, hassle avoidance.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "On a scale of 1 to 10, how confident are you that your plan is good value for money?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance:
          "After the score, ask what makes it that number. Probe for their internal 'fair price' anchor and what evidence they use to judge value.",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "Which parts of the plan matter most to you?",
        type: "multi_select",
        multiSelectOptions: [
          "Fast engineer response",
          "Fixing it first time",
          "No excess",
          "Predictable monthly cost",
          "Annual service included",
          "Cover for multiple appliances",
          "24/7 advice and support",
          "Trusted brand",
          "Ability to book easily",
          "Clear terms and what’s included",
        ],
        guidance:
          "After selection, ask what they’d happily lose if price dropped, and what they’d never compromise on.",
        timeHintSeconds: 150,
        recommendedFollowUps: 2,
      },
      {
        text: "Have you looked at alternatives in the last year, like comparison sites or other providers?",
        type: "yes_no",
        guidance:
          "If yes, ask which ones, what they noticed first (price, excess, exclusions, reviews), and why they did or didn’t switch. If no, explore what keeps them from shopping around.",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "Think about the last time you interacted with us (service, claim, call, engineer visit). What worked well and what didn’t?",
        type: "open",
        guidance:
          "Listen for emotional moments. Note friction like repeating info, waiting, reschedules, uncertainty, and how that shapes renewal intent.",
        timeHintSeconds: 150,
        recommendedFollowUps: 3,
      },
      {
        text: "What would have to happen for you to decide not to renew, even if you like us?",
        type: "open",
        guidance:
          "Capture deal-breakers: unexpected price rise, bad service moment, exclusion surprises, competitor offer, financial pressure, trust issues.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "If we offered an 'Essentials' tier (cheaper, narrower cover) and a 'Premium' tier (more cover and faster service), which would you choose and why?",
        type: "open",
        guidance:
          "Probe trade-offs explicitly. Ask what they'd expect to get or give up, and what price difference feels worth it.",
        timeHintSeconds: 150,
        recommendedFollowUps: 2,
      },
      {
        text: "How likely are you to recommend this plan to a friend or neighbour on a scale of 0 to 10?",
        type: "scale",
        scaleMin: 0,
        scaleMax: 10,
        guidance:
          "Ask why, then what single change would increase their score by 2 points. This usually surfaces the real leverage points.",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "If you could change one thing about the plan or how we communicate it, what would you change?",
        type: "open",
        guidance:
          "Push for something concrete: terms clarity, proactive comms, service scheduling, pricing transparency, add-ons, loyalty recognition.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
    ],
  },
  {
    name: "Quote to Close Sales Journey",
    projectName: "Heating Install Conversion and Objections Study",
    projectDescription:
      "Exploring buying journeys, objections, trust signals, and sales experience across wins and losses to improve quote-to-sale conversion and reduce cost per sale",
    templateName: "Sales Journey Interview v1",
    collectionName: "Q1 2026 Lost Deals and Wins",
    objective:
      "Understand why prospects buy or drop off, identify the moments that create confidence or doubt, and improve sales messaging, follow-up, and offer design to lift conversion",
    audienceContext:
      "Homeowners who requested a boiler or heat pump quote in the last 60 days, split between those who purchased and those who did not, across phone and digital journeys",
    strategicContext:
      "We are scaling install sales and have proprietary funnel data showing drop-offs after the survey and quote stages, plus variation in conversion by channel, region, and adviser. We are trialling new finance options, a simplified digital quote pack, and updated call scripts. We need to pinpoint the real objections (spoken and unspoken), decision-maker dynamics, competitor comparisons, and which trust signals matter most, so we can make changes that increase conversion without relying on discounting.",
    contextType: "product",
    tone: "friendly",
    defaultRecommendedFollowUps: 2,
    questions: [
      {
        text: "What triggered you to start looking for a new boiler or heat pump, and why now?",
        type: "open",
        guidance:
          "Listen for urgency versus planned upgrade. Capture context like breakdown risk, bills, comfort, home move, renovation, or regulations.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "Who else was involved in the decision, and did you all care about the same things?",
        type: "open",
        guidance:
          "Identify decision-makers and influencers. Look for consensus versus tension (budget, disruption, sustainability, brand trust).",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "Where did you go to research options before speaking to any supplier?",
        type: "multi_select",
        multiSelectOptions: [
          "Google search",
          "Comparison site",
          "Friends or family recommendations",
          "Online reviews",
          "Manufacturer website",
          "Local independent installers",
          "Social media",
          "Existing service provider",
          "Other",
        ],
        guidance:
          "After selection, ask which source they trusted most and what information they couldn’t easily find.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "What mattered most when choosing who to get a quote from?",
        type: "multi_select",
        multiSelectOptions: [
          "Price",
          "Trust/brand",
          "Speed and availability",
          "Quality of install",
          "Warranty/aftercare",
          "Finance options",
          "Clear explanation of what’s included",
          "Low disruption",
          "Energy efficiency/sustainability",
          "Reviews and reputation",
        ],
        guidance:
          "Make them rank their top 2. Listen for trade-offs and what they’d sacrifice to get their top priority.",
        timeHintSeconds: 150,
        recommendedFollowUps: 2,
      },
      {
        text: "On a scale of 1 to 10, how clear was our quote and what it included?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance:
          "Probe confusion points: scope, exclusions, warranty, timelines, finance details, or what happens if something goes wrong.",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "On a scale of 1 to 10, how confident were you that we would deliver a high-quality install with minimal hassle?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 10,
        guidance:
          "Ask what built confidence (brand, adviser, surveyor, reviews, guarantees) and what undermined it (gaps, delays, mixed messages).",
        timeHintSeconds: 90,
        recommendedFollowUps: 2,
      },
      {
        text: "Did you feel pressured at any point during the sales process?",
        type: "yes_no",
        guidance:
          "If yes, identify what created pressure (urgency tactics, repeated calls, upsell). If no, ask what felt respectful and helpful.",
        timeHintSeconds: 60,
        recommendedFollowUps: 2,
      },
      {
        text: "What was your biggest worry or objection, even if you didn’t say it out loud?",
        type: "open",
        guidance:
          "Listen for unspoken objections: hidden costs, disruption, trust, installer competence, finance fear, regret, partner disagreement.",
        timeHintSeconds: 120,
        recommendedFollowUps: 3,
      },
      {
        text: "Did you end up buying from us?",
        type: "yes_no",
        guidance:
          "If yes, ask what specifically sealed the deal and what nearly stopped it. If no, ask who they chose instead and what tipped it.",
        timeHintSeconds: 60,
        recommendedFollowUps: 2,
      },
      {
        text: "Thinking about the follow-up after the quote, what was useful and what was annoying or unnecessary?",
        type: "open",
        guidance:
          "Capture preferred cadence, channel, and content. Look for moments where they wanted reassurance versus silence.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
      {
        text: "If we could change one thing about our sales approach to make the decision easier, what should it be?",
        type: "open",
        guidance:
          "Push for a single, high-impact change. Probe whether it’s about offer design, clarity, trust signals, or adviser behaviour.",
        timeHintSeconds: 120,
        recommendedFollowUps: 2,
      },
    ],
  },
];
