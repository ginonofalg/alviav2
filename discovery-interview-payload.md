# Discovery Interview — Quick Setup Payload

Alvia discovery interview for research professionals. The interview itself is the product demo.

```javascript
fetch('/api/admin/quick-setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project: {
      name: "How Researchers Gather Deep Customer Insights",
      objective: "Understand the real frustrations research professionals face when trying to gather deep, nuanced qualitative insights at scale — what breaks down in their current methods, where they compromise on depth or volume, and what would make them trust an AI-conducted interview enough to use it with their own respondents",
      audienceContext: "Research professionals across disciplines — market researchers, UX researchers, HR professionals, sales consultants, business consultants, and anyone who commissions or conducts qualitative research. Mix of in-house and agency, junior to senior, across sectors.",
      tone: "conversational",
      contextType: "cx",
      crossInterviewContext: true,
      piiRedactionEnabled: true,
      consentAudioRecording: true,
      strategicContext: "This is a discovery interview that doubles as a product demo. The respondent is experiencing AI-conducted interviewing first-hand while telling us what they need from it. Every question should feel like a genuine research conversation — not a sales pitch — but the interview itself is the proof point. Insights directly inform product positioning, early access conversion strategy, and feature prioritisation for Alvia's go-to-market with research professionals."
    },
    template: {
      name: "Qualitative Research Pain Points & AI Trust",
      objective: "Surface the specific, lived frustrations people have with gathering deep qualitative insights at scale. Understand where current methods fail them; not in theory, but in their last few projects. Then explore what would need to be true for them to trust AI-conducted interviews, and what an early access opportunity would need to look like to actually convert interest into them giving it a go.",
      questions: [
        {
          questionText: "Think about the last time you needed to get deep, nuanced insights from customers or respondents. What was that project, and where did the process let you down?",
          questionType: "open",
          guidance: "This is the most important question in the interview. Get them to pick ONE specific, recent project — not a general complaint. Push for concrete frustrations: was it the quality of responses? The time it took? The cost? The gap between what they needed and what they got? If they say 'it went fine', probe harder: 'What did you have to compromise on — depth, sample size, timeline, budget?' Everyone compromises somewhere. The gold is in the specific trade-offs they make and how those trade-offs affect the quality of their decisions. Stay here as long as it's productive.",
          recommendedFollowUps: 3,
          timeHintSeconds: 90,
          isRequired: true
        },
        {
          questionText: "When you think about the interviews or conversations that gave you the best insights, what was it about those that worked? And what stops you doing that every time?",
          questionType: "open",
          guidance: "This gets at their gold standard versus their reality. Most will describe something high-touch and unscalable — a brilliant moderator, a perfectly recruited respondent, enough time to go deep. Then the constraint: cost, logistics, availability, consistency. Listen for the tension between quality and scale — that's the exact problem Alvia solves. If they're a consultant who does the interviews themselves, listen for the personal bottleneck ('I can only do so many'). If they commission research, listen for control issues ('I never know if the moderator actually probed on the right things').",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "You're having this conversation with an AI right now. What's your honest reaction to that experience so far, and what would need to be true for you to trust something like this with your own respondents?",
          questionType: "open",
          guidance: "This is the meta-moment — they're evaluating the product while using it. Don't be defensive about any criticism; lean into it. If they say it's surprisingly good, ask what specifically surprised them. If they have reservations, get specific: is it the depth of probing? Rapport? The voice? Trust from respondents? Ethical concerns? Data security? Push past 'it's interesting' to 'I would or wouldn't actually use this because...' Their conditions for trust are directly actionable for product and positioning. Connect their answer back to the frustrations they described earlier — would this have helped with that project?",
          recommendedFollowUps: 2,
          timeHintSeconds: 80,
          isRequired: true
        },
        {
          questionText: "If you could get early access to a tool like this; AI-conducted interviews that go deep, at scale, what would you actually want to do with it first? What's the project or problem you'd point it at?",
          questionType: "open",
          guidance: "This is the conversion question. A specific use case means genuine intent; a vague answer means polite interest. Push for specifics: what project, what audience, how many interviews, what timeline? If they name a real upcoming project, that's a hot lead. If they say 'I'd need to think about it', ask what they'd need to see or know before they'd try it. Listen for objections disguised as questions ('Would it work for sensitive topics?' means they have sensitive topics). End warm — this is the last thing they'll remember.",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        }
      ]
    },
    collection: {
      name: "Alvia Discovery — Research Professionals Pilot",
      description: "Discovery interviews with research professionals to understand qualitative research pain points, reactions to AI-conducted interviewing (experienced first-hand), and early access conversion intent",
      targetResponses: 20,
      voiceProvider: "openai",
      maxAdditionalQuestions: 1,
      endOfInterviewSummaryEnabled: true,
      vadEagernessMode: "auto"
    }
  })
}).then(r => r.json()).then(d => { console.log(d); console.log('Interview URL:', d.interviewUrl); })
```
