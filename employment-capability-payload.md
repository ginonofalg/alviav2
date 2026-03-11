# Employment Capability Assessment — Quick Setup Payload

```javascript
fetch('/api/admin/quick-setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project: {
      name: "Employment Capability Assessment",
      objective: "Assess an individual's current capability for employment by exploring three dimensions: whether they have the skills and experience to work, whether they are motivated and ready to enter the labour market, and what barriers, such as health, confidence, transport, or skills gaps need to be addressed to make sustainable employment realistic.",
      audienceContext: "Adults who are currently out of work or underemployed and engaging with employability support programmes such as Connect to Work",
      tone: "conversational",
      contextType: "cx",
      crossInterviewContext: true,
      piiRedactionEnabled: true,
      consentAudioRecording: true,
      strategicContext: "This research supports the evaluation of employability programmes by evidencing three things for each participant: employment capability (can they work?), employment readiness (are they ready to work?), and barriers to employment (what's stopping them?). Insights will inform programme design, commissioner reporting, and decisions about where to focus support resources."
    },
    template: {
      name: "Work Readiness Deep Dive",
      objective: "Explore the participant's work readiness across three areas: (1) their employment capability; past experience, transferable skills, qualifications, and confidence in workplace behaviours; (2) their employment readiness; motivation, clarity about the work they want, and job search activity; and (3) their barriers and support needs, including health, caring responsibilities, transport, digital skills, and anything else preventing them from moving into work. The goal is to build a clear picture of where they are now and what needs to change.",
      questions: [
        {
          questionText: "Tell me about any work you've done before, paid or unpaid. What did you do, and what were you good at?",
          questionType: "open",
          guidance: "A good answer mentions specific roles, tasks, or responsibilities, including informal work like volunteering or caring. Probe for skills they used, what they enjoyed, and how long they did it. If they say they've never worked, explore anything that involved responsibility.",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "Have you done any training or qualifications, even informal ones, and how confident do you feel about things like timekeeping, teamwork, and communication at work?",
          questionType: "open",
          guidance: "Both parts need covering. Get specific examples of any learning and an honest self-assessment of workplace behaviours. If confidence is low, ask what's behind it.",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        },
        {
          questionText: "What sort of work would you like to do in the next 6 to 12 months, and what have you been doing to look for it?",
          questionType: "open",
          guidance: "A good answer names a type of work and shows some active steps; searching, applying, talking to someone. If the goal is vague or they've taken no steps, explore why, it often links to barriers.",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        },
        {
          questionText: "What's currently getting in the way of you finding or starting work?",
          questionType: "open",
          guidance: "Probe across health, caring, transport, money, housing, skills, confidence, and digital access. Most people face more than one barrier, so don't stop at the first answer.",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "What would need to change, or what help would you need, for you to feel ready to start work?",
          questionType: "open",
          guidance: "A good answer identifies practical support, not just 'a job' or 'I don't know.' If they struggle, try 'if we could fix one thing, what would make the biggest difference?' Listen for what matters most to them.",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        }
      ]
    },
    collection: {
      name: "Connect to Work, Pilot Interviews",
      description: "Initial pilot interviews with programme participants to assess employment capability, readiness, and barriers to sustainable work",
      targetResponses: 12,
      voiceProvider: "openai",
      maxAdditionalQuestions: 1,
      endOfInterviewSummaryEnabled: true,
      vadEagernessMode: "high"
    }
  })
}).then(r => r.json()).then(d => { console.log(d); console.log('Interview URL:', d.interviewUrl); })
```
