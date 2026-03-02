# Open Britain — Quick Setup

## About Open Britain

[Open Britain](https://www.open-britain.co.uk/) is a UK not-for-profit movement focused on making democracy work for everyone. Their key priorities:

- **Defending UK democracy** — they set up the All-Party Parliamentary Group for Fair Elections with 120+ MPs and peers
- **Combatting disinformation** in public debate
- **Informing and educating people** about the politics affecting their lives
- **Electoral reform** — pushing for a more representative system
- **Countering populist misinformation** — exposing misleading claims in political discourse

Mark's specific interest is a tool to help people **think through issues where disinformation or media bias may have skewed public understanding** — without pushing any particular political view. That non-partisan constraint is critical.

---

## Quick-Setup Payload

```js
fetch('/api/admin/quick-setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project: {
      name: "How People Navigate Political Information",
      objective: "Understand how UK citizens encounter, evaluate, and form views on politically charged issues; where their information comes from, how they assess what's trustworthy, and how media framing or disinformation may have shaped their understanding without them realising",
      audienceContext: "UK adults across the political spectrum who follow news and current affairs to varying degrees — from daily news consumers to those who mostly pick things up through social media or conversation",
      tone: "conversational",
      contextType: "cx",
      crossInterviewContext: true,
      piiRedactionEnabled: true,
      consentAudioRecording: true,
      strategicContext: "This research supports Open Britain's mission to help people think through issues where disinformation or media bias may have distorted public understanding. The goal is NOT to push any political view — it's to surface the patterns in how people process political information, where trust breaks down, and what would actually help citizens feel more confident in their own judgement. Insights will inform the design of a public-facing tool for democratic education."
    },
    template: {
      name: "Information Landscape Deep Dive",
      objective: "Understand how UK citizens encounter, evaluate, and form views on politically charged issues; where their information comes from, how they assess what's trustworthy, and how media framing or disinformation may have shaped their understanding without them realising. Surface the real information ecosystem each person lives in; not what they think they should say about media, but how they actually encounter and evaluate political claims, and the moments where they've realised something they believed was wrong or misleading",
      questions: [
        {
          questionText: "Think about a political issue you feel quite strongly about. Where did your view on that actually come from, can you trace it back?",
          questionType: "open",
          guidance: "Get them to pick ONE specific issue and genuinely try to trace their view back to its origins. Most people will start with 'I just think...'; push past that. Was it a news story? A conversation? Something on social media? A personal experience? The gold is in the gap between what they believe and how little they may know about where that belief originated. Don't challenge the view itself; stay curious about the journey.",
          recommendedFollowUps: 2,
          timeHintSeconds: 80,
          isRequired: true
        },
        {
          questionText: "Has there been a time when you discovered that something you'd believed about a political issue turned out to be wrong or misleading? What happened?",
          questionType: "open",
          guidance: "This is the hardest question. Nobody enjoys admitting they were wrong. If they say 'not really', try: 'What about something where you later found out the full picture was more complicated than you'd first heard?' Accept partial examples. Listen for HOW they discovered it; did someone tell them, did they stumble on it, did the story just evolve? The mechanism of correction matters as much as the example. Stay completely non-judgmental.",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "When you see a claim about politics that you're not sure about, what do you actually do? Walk me through it honestly.",
          questionType: "open",
          guidance: "People will want to say 'I check multiple sources'; push for what they ACTUALLY do, not what they think the right answer is. Do they scroll past? Google it? Ask someone? Accept it if it feels right? The honest answer is often 'nothing' or 'it depends' and that's fine; explore what 'depends' means. Look for the difference between issues they care about (where they might check) and issues they don't (where they just absorb).",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        },
        {
          questionText: "On a scale of 1 to 5, how confident are you that you can tell the difference between reliable and unreliable political information?",
          questionType: "scale",
          scaleMin: 1,
          scaleMax: 5,
          guidance: "The number opens the door; the conversation after it is what matters. High confidence (4-5): ask what gives them that confidence, then gently probe with 'Is there any area where you feel less sure?' Low confidence (1-2): ask what specifically makes it hard; is it volume, contradictions, distrust of all sources? Mid-range (3): often the most interesting; ask what tips something from 'I'm not sure' to 'I believe this'. Connect back to the examples they gave earlier.",
          recommendedFollowUps: 1,
          timeHintSeconds: 50,
          isRequired: true
        },
        {
          questionText: "If something existed that could help you think through a political issue more clearly - without telling you what to think - what would that actually look like for you?",
          questionType: "open",
          guidance: "This is the design question; it directly informs what Open Britain might build. Resist letting them describe a fact-checker (that already exists). Push toward: what format? When would they use it? What would make them trust it? Would they want to be challenged or just given context? Listen for emotional needs as much as functional ones; do they want to feel smarter, more confident, less manipulated? If they say 'I don't know', try: 'Think about that moment from earlier when you weren't sure about something; what would have helped right then?'",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        }
      ]
    },
    collection: {
      name: "Open Britain — Pilot Conversations",
      description: "Initial pilot with diverse UK citizens to understand information consumption patterns, susceptibility to media bias, and appetite for a non-partisan democratic education tool",
      targetResponses: 12,
      voiceProvider: "openai",
      maxAdditionalQuestions: 2,
      endOfInterviewSummaryEnabled: true,
      vadEagernessMode: "auto"
    }
  })
}).then(r => r.json()).then(d => { console.log(d); console.log('Interview URL:', d.interviewUrl); })
```

---

## Design Rationale

- **Non-partisan by design** — no questions ask about specific parties or policies. The focus is on information *processes*, not political *positions*
- **Q1** traces belief origins — surfaces how people's views are shaped without them realising
- **Q2** finds moments of correction — the most revealing data for understanding disinformation impact
- **Q3** exposes real verification behaviour (vs. aspirational) — critical for tool design
- **Q4** (scale) creates a calibration point — confidence vs. actual media literacy
- **Q5** is the direct design input — what would a useful tool look like from the citizen's perspective
- **Cross-interview context enabled** — patterns across respondents will be valuable for Open Britain
- **VAD set to "auto"** rather than "high" — these are thoughtful, sometimes uncomfortable topics where people need space to think
- **2 additional questions** — lets Barbara probe gaps around specific disinformation experiences or tool preferences
