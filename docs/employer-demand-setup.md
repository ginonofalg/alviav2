# Employer Demand & Capability Gaps — Quick Setup

## Project Overview

**Objective:** Understand employer demand and the capability gaps preventing successful recruitment across key sectors. Surfaces the roles employers genuinely need filled, why those roles aren't being filled, what capability or attitudinal gaps exist in the candidate pool, and what changes would make employers more likely to recruit locally.

**Initial sector:** Tech | **Template designed to be sector-adaptable** (e.g. Proud to Care)

---

## Setup Payload

```javascript
fetch('/api/admin/quick-setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project: {
      name: "Employer Demand & Capability Gaps",
      objective: "Understand employer demand and the capability gaps preventing successful recruitment across key sectors. This research surfaces four things: the roles employers genuinely need filled, why those roles aren't being filled, what capability or attitudinal gaps exist in the candidate pool, and what changes would make employers more likely to recruit locally, including openness to non-traditional entry routes.",
      audienceContext: "Employers and hiring managers across targeted sectors, starting with Tech, who are actively recruiting or anticipate recruitment needs in the next 6 to 12 months. Includes SMEs, larger employers, and organisations who have previously engaged with People Hub or similar employment programmes.",
      tone: "conversational",
      contextType: "other",
      crossInterviewContext: true,
      piiRedactionEnabled: true,
      consentAudioRecording: true,
      strategicContext: "This project generates actionable labour market intelligence for People Hub. The initial deployment targets the Tech sector, where recruitment often breaks down in the gap between formal qualifications and real workplace or project experience. Common capability gaps include applied technical skills, problem-solving, teamwork, and the ability to communicate with non-technical colleagues. Insights will inform programme design by aligning pre-employment training, bootcamps and work trials to actual employer needs; candidate pipeline development by identifying which entry routes employers will accept such as apprenticeships, career changers and return-to-work candidates; and sector partnerships by providing data-backed evidence to strengthen relationships with employers. The template is designed to be sector-adaptable; the same structure can be redeployed for other programmes such as Proud to Care for health and social care recruitment by adjusting the sector-specific context, with no changes to the core question set."
    },
    template: {
      name: "Employer Demand & Capability Gaps",
      objective: "Surface the roles employers genuinely need filled, where recruitment is breaking down, what capability or attitudinal gaps exist in the candidate pool, and what would make employers more likely to recruit locally. Uncover not just what employers say they need on paper, but the real friction points in hiring; the gap between qualifications and readiness, the behaviours that predict success, and genuine openness to non-traditional entry routes.",
      questions: [
        {
          questionText: "What roles are you currently recruiting for or expect to recruit for in the next 6 to 12 months, and which are the hardest to fill?",
          questionType: "open",
          guidance: "Probe for specific job titles, volume, and seniority. Once the respondent has listed roles, ask which are hardest to fill and why; listen for themes like location, salary, competition, candidate volume, or skills mismatch. If they mention only one role, ask whether there are others they anticipate needing soon.",
          recommendedFollowUps: 3,
          timeHintSeconds: 80,
          isRequired: true
        },
        {
          questionText: "When candidates apply for these roles, what skills, experience or qualifications are most often missing?",
          questionType: "open",
          guidance: "Explore both technical and soft skills. Probe for specific examples; ask what they see on CVs versus what they actually need. Listen for gaps in applied or practical experience versus formal qualifications. If relevant, ask whether these gaps have changed over recent years or are expected to shift.",
          recommendedFollowUps: 3,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "What attitudes, behaviours and values make someone successful in your organisation, and what most often causes new hires to struggle or leave?",
          questionType: "open",
          guidance: "This question covers both the positive and negative. First let the respondent describe what good looks like; work ethic, communication, reliability, initiative, values alignment. Then probe the flip side: what causes people to fail, drop out or not be hired. Listen for barriers such as attendance, confidence, expectations, transport or shift patterns. If they focus only on one side, gently steer to the other.",
          recommendedFollowUps: 3,
          timeHintSeconds: 80,
          isRequired: true
        },
        {
          questionText: "Would you consider recruiting someone who is returning to work, changing career, or coming through a training programme, and what support would make it easier for you to recruit and retain people locally?",
          questionType: "open",
          guidance: "Start with openness to non-traditional candidates; career changers, returners, apprentices, bootcamp graduates. Gauge genuine willingness versus polite agreement. Then move to support needs: pre-employment training, work trials, wage incentives, job coaching, mentoring. If they mention a specific support, probe whether they have used anything similar before and how it went.",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "If you could change one thing that would make recruitment easier for your business, what would it be?",
          questionType: "open",
          guidance: "This is the closing question, keep it open and let the respondent lead. Do not prompt with examples unless they struggle to answer. Listen for whether their answer reinforces earlier themes or surfaces something entirely new. If their answer is brief, ask why that one thing matters most to them.",
          recommendedFollowUps: 1,
          timeHintSeconds: 50,
          isRequired: true
        }
      ]
    },
    collection: {
      name: "Tech Sector, Pilot Conversations",
      description: "Initial pilot with Tech sector employers and hiring managers to map real labour demand, identify capability gaps in the candidate pipeline, and test openness to non-traditional entry routes such as apprenticeships, bootcamps and return-to-work programmes",
      targetResponses: 12,
      voiceProvider: "openai",
      maxAdditionalQuestions: 2,
      endOfInterviewSummaryEnabled: true,
      vadEagernessMode: "auto"
    }
  })
}).then(r => r.json()).then(d => { console.log(d); console.log('Interview URL:', d.interviewUrl); })
```
