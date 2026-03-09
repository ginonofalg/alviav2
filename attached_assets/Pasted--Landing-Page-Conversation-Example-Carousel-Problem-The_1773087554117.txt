# Landing Page: Conversation Example Carousel

## Problem

The current hero section shows a static Q&A pairing that reads like a traditional survey:

> "Tell me about a time when the onboarding process exceeded your expectations."
> "Well, I remember when I joined my current company, the first week was incredibly structured..."

This doesn't communicate what makes Alvia different. We need examples that showcase three capabilities surveys can't replicate:

1. **Adaptive follow-up** — Alvia listens and probes deeper based on what the respondent actually said
2. **Cross-interview insight** — Alvia surfaces emerging patterns from other interviews (without identifying anyone)
3. **Analytics-guided probing** — Barbara detects gaps or themes in real-time and steers Alvia to explore them

## Proposed Pairings

### Category 1: Adaptive Follow-Up

Alvia references something the respondent said earlier and probes deeper. These show that Alvia is listening, not reading from a script.

| # | Alvia | Respondent | Q# |
|---|-------|------------|-----|
| 1 | "You mentioned the onboarding felt really structured. What specifically made you feel supported during that first week?" | "Honestly, it was having a buddy assigned from day one. I never had to wonder who to ask..." | Q3 of 8 |
| 2 | "You said the app felt frustrating at checkout. Can you walk me through what happened?" | "I'd added everything to my cart, but then it asked me to re-enter my address even though I was logged in..." | Q4 of 7 |
| 3 | "That's interesting — you said cost wasn't the main factor. What ultimately tipped your decision?" | "It was really about trust. The other provider had better reviews from people in my situation..." | Q5 of 9 |
| 4 | "You mentioned feeling 'out of the loop' during the project. When did that start to affect your work?" | "It was about two weeks in. Decisions were being made in meetings I wasn't invited to..." | Q3 of 6 |

### Category 2: Cross-Interview Insight

Alvia references patterns emerging across the study without identifying anyone. This shows the platform learning in real-time across a collection — something impossible with isolated survey responses.

| # | Alvia | Respondent | Q# |
|---|-------|------------|-----|
| 5 | "A number of people in this study have mentioned trust as a deciding factor. What does trust look like for you when choosing a provider?" | "For me, it's about transparency. If I can't see the pricing clearly upfront, I'm already suspicious..." | Q4 of 7 |
| 6 | "We're hearing a pattern around the first two weeks being the most critical. How did your experience during that window shape your long-term view?" | "Completely. By day three I'd already decided whether I was going to stick with it or start looking elsewhere..." | Q3 of 8 |
| 7 | "Interestingly, speed of response keeps coming up as more important than getting the perfect answer. Does that resonate with your experience?" | "Absolutely. I'd rather get a good-enough answer in five minutes than wait two days for the ideal one..." | Q5 of 8 |

### Category 3: Analytics-Guided Probing

Barbara (the orchestrator) detects a gap, an unexplored theme, or a contradiction — and Alvia follows up. These show the intelligence layer working behind the scenes. The respondent doesn't know Barbara exists; they just experience a remarkably perceptive interviewer.

| # | Alvia | Respondent | Q# |
|---|-------|------------|-----|
| 8 | "You've talked about what worked well, but I'm curious — was there a moment where things didn't go as smoothly?" | "Actually, yes. The migration process was a nightmare. We lost two weeks of data and nobody took ownership..." | Q5 of 7 |
| 9 | "Earlier you mentioned the team was great, but you also said you nearly left after six months. Help me understand what changed." | "It wasn't the people — it was the lack of growth. I could see the ceiling very clearly, and nobody was talking about it..." | Q4 of 6 |
| 10 | "You've focused a lot on the technical side. I'd love to hear how this affected you day-to-day — what was the emotional toll?" | "That's a good question. I think I was more stressed than I realised at the time. My partner kept saying I was bringing work home..." | Q6 of 8 |

### Design Notes

- **Adaptive follow-ups** use phrases like "You mentioned...", "You said...", "Earlier you described..."
- **Cross-interview insights** use phrases like "A number of people...", "We're hearing a pattern...", "...keeps coming up" — never naming or identifying anyone
- **Analytics-guided probes** feel natural but expose blind spots: contradictions ("great team but nearly left"), missing dimensions ("technical but what about emotional"), and unexplored negatives ("what worked well, but what didn't")
- **Responses feel conversational** — fragments, hedges, natural speech patterns — not polished survey answers
- **Varied question numbers** (Q3–Q6 of 6–9) imply this happens throughout interviews, not just at the start

## Implementation

### Data Structure

```typescript
type ConversationCategory = "adaptive" | "cross_interview" | "analytics_guided";

interface ConversationExample {
  question: string;
  response: string;
  questionNumber: number;
  totalQuestions: number;
  category: ConversationCategory;
}

const conversationExamples: ConversationExample[] = [
  // ... all 10 pairings above
];
```

The `category` field isn't displayed in the UI — it's there for potential future use (e.g. filtering, or showing a subtle label like "Adaptive Probing" vs "Cross-Interview Insight" beneath the question counter).

### Cycling Logic

```typescript
const [currentIndex, setCurrentIndex] = useState(0);
const [isPaused, setIsPaused] = useState(false);

useEffect(() => {
  if (isPaused) return;
  const interval = setInterval(() => {
    setCurrentIndex((prev) => (prev + 1) % conversationExamples.length);
  }, 6000);
  return () => clearInterval(interval);
}, [isPaused]);
```

6 seconds balances readability (the longest example is ~30 words per bubble) with keeping the carousel feeling dynamic. Pause-on-hover prevents frustration when someone is mid-read.

### Animation

Wrap the question and response in Framer Motion's `AnimatePresence`:

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={currentIndex}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.4 }}
    className="space-y-3"
  >
    <p className="text-lg font-medium">
      "{conversationExamples[currentIndex].question}"
    </p>
    {/* waveform visualiser stays constant — only text cycles */}
    <div className="pt-4 border-t border-border">
      <p className="text-sm text-muted-foreground italic">
        "{conversationExamples[currentIndex].response}"
      </p>
    </div>
  </motion.div>
</AnimatePresence>
```

The waveform animation (the bouncing bars) stays constant and doesn't re-render on transition — only the text crossfades. This keeps the card feeling alive even during transitions.

### Dynamic Question Counter

Replace the static "Question 3 of 8":

```tsx
<p className="text-sm text-muted-foreground">
  Question {conversationExamples[currentIndex].questionNumber} of{" "}
  {conversationExamples[currentIndex].totalQuestions}
</p>
```

### Optional: Dot Indicators

Small dots below the card showing position in the carousel. Clickable to jump to a specific example:

```tsx
<div className="flex justify-center gap-1.5 pt-4">
  {conversationExamples.map((_, i) => (
    <button
      key={i}
      onClick={() => setCurrentIndex(i)}
      className={cn(
        "w-1.5 h-1.5 rounded-full transition-all duration-300",
        i === currentIndex
          ? "bg-primary w-4"
          : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
      )}
    />
  ))}
</div>
```

### Accessibility

- Respect `prefers-reduced-motion`: disable cycling and show a randomly selected static example
- Dot indicators get `aria-label="Example {n} of {total}"`
- Pause cycling when card has focus (not just hover)

### Changes Required

**Single file**: `client/src/pages/landing.tsx`

- Add `conversationExamples` array (~50 lines)
- Add cycling state + pause logic (~10 lines)
- Import `AnimatePresence` from `framer-motion` (already a dependency)
- Replace static text in the hero card with dynamic cycling content (~15 lines modified)
- Optional: add dot indicators (~15 lines)

**Total**: ~75 new lines, ~15 modified lines, no new dependencies.
