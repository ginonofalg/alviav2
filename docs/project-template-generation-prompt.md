# Prompt for Generating Alvia Project and Template Content

You are helping create content for Alvia, a voice-based AI interview platform. Generate realistic project and template data for the following research context:

**Research Context:**
[INSERT YOUR PROJECT IDEA AND CONTEXT HERE]

---

Output the content in the exact order shown below, which matches the UI form fields. Use the exact field names as headers.

## PROJECT

### Step 1: Project Details

**name:** (max 100 chars)
A concise, descriptive project name

**description:** (max 500 chars)
Brief description of the research project's purpose

**objective:** (max 1000 chars)
What you're trying to learn from this research. This helps the AI interviewer understand context and ask better follow-up questions.

**audienceContext:** (max 500 chars)
Who the target respondents are (e.g., "New customers in the first 30 days")

**tone:**
Choose one: professional | friendly | formal | empathetic

### Step 2: Settings (typically use defaults)

**consentAudioRecording:** true
**piiRedactionEnabled:** true
**crossInterviewContext:** false
**crossInterviewThreshold:** 5

### Step 3: Strategic Context

**contextType:**
Choose one: content | product | marketing | cx | other

Where:
- content = Content Strategy (newsletters, blogs, social media)
- product = Product Development (features, roadmap decisions)
- marketing = Marketing Campaign (campaigns, targeting, messaging)
- cx = Customer Experience (support, onboarding, retention)
- other = Custom business context

**strategicContext:** (max 2000 chars)
Your business context including goals, constraints, and what decisions these insights will inform. Be specific about how you'll use the findings.

---

## TEMPLATE

### Template Details

**name:** (max 100 chars)
Name for this interview template

**objective:** (max 1000 chars)
The specific goal of this interview

**tone:**
Choose one: professional | friendly | formal | empathetic

**defaultRecommendedFollowUps:** (number 0-10, optional)
Default probing depth for all questions unless overridden

**constraints:** (optional)
Topics or areas the AI should avoid during this interview

---

### Questions

For each question, provide:

**Question 1:**
- questionText: (the actual question to ask)
- questionType: open | yes_no | scale | numeric | multi_select
- timeHintSeconds: (optional, suggested response time)
- scaleMin / scaleMax: (only if scale type, e.g., 1-10)
- multiSelectOptions: (only if multi_select, list of options)
- guidance: (instructions for AI on what makes a good answer and what to probe for)
- recommendedFollowUps: (optional, 0-10, overrides template default)
- isRequired: true | false

**Question 2:**
[Same format...]

**Question 3:**
[Same format...]

[Continue for 5-8 questions typical for a thorough interview]

---

## Guidelines for Good Questions

1. Start with easy rapport-building questions before diving deep
2. Use "open" type for exploratory questions that need rich responses
3. Use "scale" for satisfaction or likelihood ratings
4. Use "yes_no" for qualifying or filtering questions
5. Guidance should explain what insights you're seeking, not lead the respondent
6. Aim for 5-8 questions total; the AI will probe naturally within each
7. Consider logical flow and how earlier answers might inform later questions

## Guidelines for Good Guidance

The guidance field tells Barbara (the AI orchestrator) what to look for. Good guidance includes:
- What specific information you're hoping to extract
- When the AI should probe deeper vs. move on
- What types of examples or specifics to ask for
- Any context about why this question matters for your research objective
