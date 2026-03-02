# HCRFC Energy for Tomorrow — Quick Setup

## About the Project

[Helensburgh Cricket and Rugby Football Club (HCRFC)](https://www.helensburghcrfc.co.uk/) ran a crowdfunding campaign to transform their 1970s clubhouse into an energy-efficient community hub. They were one of only six UK organisations — and the only one in Scotland — selected for [British Gas Energy for Tomorrow](https://www.centrica.com/sustainability/energy-for-tomorrow/) matchfunding.

**Key facts:**
- **£34,000 matched grant** from Scottish Gas — for every £1 raised, Energy for Tomorrow made it £3
- **Smashed their £51,000 target**, ultimately raising **£60,000**
- **Planned upgrades**: loft insulation, energy-efficient heating, LED pitch floodlights, solar panels, boiler replacement
- **Projected saving**: £10,000/year in energy costs
- Part of a wider Centrica programme (£1m committed) — 5 clubs raised £140,000+ from 850+ supporters in 2025

## About Energy for Tomorrow (British Gas / Centrica)

Established 2015. Offers matched funding, energy advice, and crowdfunding support to community organisations making energy-saving improvements. Supports charities, CICs, registered community groups, and not-for-profits. Individual pledges matched up to £250.

---

## Research Framing

The natural research objective here is understanding **what drives people to back community energy projects** — so the programme can replicate HCRFC's outsized success across future rounds. The questions probe supporter motivations, the role of matchfunding, community identity, and how people connect sustainability to local belonging.

---

## Quick-Setup Payload

```js
fetch('/api/admin/quick-setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project: {
      name: "What Makes People Back Community Energy Projects",
      objective: "Understand what drives supporters to fund community energy and sustainability upgrades through crowdfunding; how much is about the club, how much is about the cause, and what role matchfunding plays in tipping people from interest to action",
      audienceContext: "People who donated to the HCRFC Energy for Tomorrow crowdfunding campaign; mix of club members, local residents, parents of junior players, businesses who offered rewards, and broader community supporters in and around Helensburgh",
      tone: "conversational",
      contextType: "cx",
      crossInterviewContext: true,
      piiRedactionEnabled: true,
      consentAudioRecording: true,
      strategicContext: "HCRFC raised £60,000 against a £51,000 target, significantly outperforming other clubs in the Energy for Tomorrow programme. This research aims to understand why; what made this campaign resonate so strongly with supporters, and what can be learned for future rounds of the programme. Centrica has committed £1m to community sports energy projects, so understanding the supporter psychology behind successful campaigns directly informs how to structure, message, and support future projects across the UK."
    },
    template: {
      name: "Crowdfunding Supporter Deep Dive",
      objective: "Understand what drives supporters to fund community energy and sustainability upgrades through crowdfunding; how much is about the club, how much is about the cause, and what role matchfunding plays in tipping people from interest to action. Uncover the real motivations behind donations; whether people were backing the club, the energy cause, or responding to the matchfunding mechanic, and what the experience of supporting felt like from their side",
      questions: [
        {
          questionText: "Tell me about the moment you decided to back the HCRFC crowdfunding campaign. What was going through your mind?",
          questionType: "open",
          guidance: "Get them to a specific moment; not 'I saw it and thought it was good' but WHERE they saw it, WHO told them, what made them stop and actually open their wallet. Was it a social media post, a conversation at the club, an email? The trigger matters. Push for whether they decided immediately or sat on it. If they're a club member, explore whether they felt obligated or genuinely excited. If they're not a member, that's even more interesting; what pulled an outsider in?",
          recommendedFollowUps: 2,
          timeHintSeconds: 70,
          isRequired: true
        },
        {
          questionText: "When you think about why you donated, how much was it about the club itself versus the energy and sustainability side of things?",
          questionType: "open",
          guidance: "This is the key segmentation question. Some people backed the club they love and the energy angle was a bonus. Others care about sustainability and the club was the vehicle. And some were motivated primarily by the matchfunding multiplier. Don't let them say 'a bit of both' without unpacking it. Ask: 'If the campaign had been for new changing rooms instead of energy upgrades, would you still have donated the same amount?' That hypothetical reveals a lot. Listen for whether they even knew what the specific upgrades were (insulation, solar, LED floodlights) or just had a general sense.",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        },
        {
          questionText: "The campaign had matchfunding from British Gas, so your donation was effectively tripled. How much did that influence what you gave?",
          questionType: "open",
          guidance: "Matchfunding is the programme's core mechanic, so understanding its psychological impact is critical. Did they donate more because of it? Would they have donated at all without it? Did it make them feel their contribution was more meaningful, or did they barely register it? Some people love the leverage ('my £20 becomes £60'), others are motivated by the urgency matchfunding creates ('we need to hit the target to unlock it'). Probe both angles. Also ask whether they understood how the matching worked; if they didn't, that's valuable feedback for future campaign messaging.",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        },
        {
          questionText: "On a scale of 1 to 5, how connected do you feel to what happens at the clubhouse, even outside of match days?",
          questionType: "scale",
          scaleMin: 1,
          scaleMax: 5,
          guidance: "This measures community attachment beyond sport. A high score (4-5) suggests the club is a genuine community hub; ask what else they use it for or what it means to the area. A low score (1-2) from someone who still donated is fascinating; they backed a project for a place they rarely visit, so what drove that? Mid-range (3) often means 'my kids go there' or 'I used to be more involved'; explore whether the energy upgrades might change how they use the space. Connect their answer back to their donation motivation from Q1.",
          recommendedFollowUps: 1,
          timeHintSeconds: 50,
          isRequired: true
        },
        {
          questionText: "Now the campaign's done, what would make you feel like your money was really well spent? What do you want to see happen?",
          questionType: "open",
          guidance: "This surfaces expectations and what 'success' looks like from the supporter's perspective. Some will want tangible proof (lower energy bills, solar panels visible on the roof). Others want to feel the community benefit (warmer clubhouse, more events, junior sections thriving). Some may not have thought about it at all; that's interesting too. If they mention wanting updates or communication, probe what format; would they read an email, watch a video, want to see the energy savings data? This directly informs post-campaign engagement strategy for future Energy for Tomorrow projects.",
          recommendedFollowUps: 2,
          timeHintSeconds: 60,
          isRequired: true
        }
      ]
    },
    collection: {
      name: "HCRFC Supporter Conversations — Pilot",
      description: "Pilot conversations with HCRFC crowdfunding supporters to understand donation motivations, the role of matchfunding, community connection, and expectations for impact; insights to inform future Energy for Tomorrow programme design",
      targetResponses: 15,
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

- **Q1** (trigger moment) — identifies the channels and social dynamics that actually drove donations, not what people think should have worked
- **Q2** (club vs cause) — the key strategic question for the programme: are people funding sustainability or funding their club? The answer changes how future campaigns should be framed
- **Q3** (matchfunding) — directly evaluates the core programme mechanic; does tripling donations change behaviour or just feel nice?
- **Q4** (scale: community connection) — segments supporters by attachment level; explains why non-members donate and what the club means beyond sport
- **Q5** (expectations) — informs post-campaign communication and builds the case for what "impact reporting" should look like
- **Cross-interview context enabled** — patterns across supporter types (members vs locals vs businesses) will be the most valuable output
- **VAD set to "auto"** — supporters will likely be enthusiastic and talkative; no need for high eagerness
- **15 target responses** — slightly higher than a standard pilot to capture the range of supporter types (members, parents, local businesses, community residents)
- **2 additional questions** — lets Barbara dig into specifics like reward selection, sharing behaviour, or whether they'd back another club's campaign

## Sources

- [HCRFC Crowdfunder page](https://www.crowdfunder.co.uk/p/hcrfc-eft)
- [HCRFC club website](https://www.helensburghcrfc.co.uk/)
- [British Gas Energy for Tomorrow fund](https://www.crowdfunder.co.uk/funds/energy-for-tomorrow)
- [Centrica Energy for Tomorrow programme](https://www.centrica.com/sustainability/energy-for-tomorrow/)
- [Helensburgh Advertiser — campaign launch](https://www.helensburghadvertiser.co.uk/news/25478277.helensburgh-cricket-rugby-club-launches-campaign/)
- [Helensburgh Advertiser — target smashed](https://www.helensburghadvertiser.co.uk/news/25618973.helensburgh-cricket-rugby-club-secures-british-gas-grant/)
