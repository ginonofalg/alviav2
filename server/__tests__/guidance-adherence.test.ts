import { describe, it, expect } from "vitest";
import { scoreGuidanceAdherence } from "../guidance-adherence";
import type { BarbaraGuidanceLogEntry, PersistedTranscriptEntry } from "@shared/schema";

function makeEntry(overrides: Partial<BarbaraGuidanceLogEntry> = {}): BarbaraGuidanceLogEntry {
  return {
    index: 0,
    action: "probe_followup",
    messageSummary: "Probe deeper into the challenges with team collaboration",
    confidence: 0.8,
    injected: true,
    timestamp: 1000,
    questionIndex: 0,
    triggerTurnIndex: 0,
    ...overrides,
  };
}

function makeTranscript(overrides: Partial<PersistedTranscriptEntry> = {}): PersistedTranscriptEntry {
  return {
    speaker: "alvia",
    text: "",
    timestamp: 1100,
    questionIndex: 0,
    ...overrides,
  };
}

function score(entry: BarbaraGuidanceLogEntry, transcript: PersistedTranscriptEntry[]) {
  const results = scoreGuidanceAdherence([entry], transcript);
  return results[0];
}

describe("scoreProbeFollowup", () => {
  it("scores followed when Alvia asks a topically relevant probing question", () => {
    const entry = makeEntry({
      messageSummary: "Probe deeper into the challenges with team collaboration",
    });
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "Can you tell me more about those challenges? How do they affect your team collaboration?",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("followed");
    expect(result.adherenceReason).toContain("topically relevant");
  });

  it("scores partially_followed when Alvia probes but on a different topic", () => {
    const entry = makeEntry({
      messageSummary: "Probe deeper into the challenges with team collaboration",
    });
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "What do you think about the weather today? How does it make you feel?",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("partially_followed");
    expect(result.adherenceReason).toContain("different topic");
  });

  it("skips topical check when messageSummary yields fewer than 2 keywords", () => {
    const entry = makeEntry({
      messageSummary: "Probe deeper",
    });
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "Can you tell me more about that? What happened next?",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("followed");
    expect(result.adherenceReason).toContain("topical check skipped");
  });

  it("scores not_followed when Alvia has no question and no probe words", () => {
    const entry = makeEntry();
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "That sounds great. Thanks for sharing.",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("not_followed");
  });

  it("scores partially_followed when Alvia has question but no probe words", () => {
    const entry = makeEntry();
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "Is that so?",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("partially_followed");
    expect(result.adherenceReason).toContain("without clear probing language");
  });

  it("scores partially_followed when Alvia has probe words but no question", () => {
    const entry = makeEntry();
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "Tell me more about that, I want to understand deeper.",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("partially_followed");
    expect(result.adherenceReason).toContain("did not ask a direct question");
  });
});

describe("scoreSuggestNextQuestion", () => {
  it("scores followed when question advances within 2 entries", () => {
    const entry = makeEntry({
      action: "suggest_next_question",
      questionIndex: 0,
    });
    const transcript = [
      makeTranscript({ speaker: "respondent", text: "That was my answer", timestamp: 1100, questionIndex: 0 }),
      makeTranscript({ speaker: "alvia", text: "Let me move on to the next question.", timestamp: 1200, questionIndex: 1 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("followed");
  });

  it("scores partially_followed when question advances at entry 3", () => {
    const entry = makeEntry({
      action: "suggest_next_question",
      questionIndex: 0,
    });
    const transcript = [
      makeTranscript({ speaker: "respondent", text: "answer 1", timestamp: 1100, questionIndex: 0 }),
      makeTranscript({ speaker: "alvia", text: "interesting", timestamp: 1200, questionIndex: 0 }),
      makeTranscript({ speaker: "respondent", text: "answer 2", timestamp: 1300, questionIndex: 0 }),
      makeTranscript({ speaker: "alvia", text: "next topic", timestamp: 1400, questionIndex: 1 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("partially_followed");
    expect(result.adherenceReason).toContain("eventually advanced");
  });

  it("scores partially_followed with transition language but no advancement", () => {
    const entry = makeEntry({
      action: "suggest_next_question",
      questionIndex: 0,
    });
    const transcript = [
      makeTranscript({ speaker: "alvia", text: "Let's move on to the next question about something else.", timestamp: 1100, questionIndex: 0 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("partially_followed");
    expect(result.adherenceReason).toContain("transition language");
  });

  it("scores not_followed with no advancement and no transition", () => {
    const entry = makeEntry({
      action: "suggest_next_question",
      questionIndex: 0,
    });
    const transcript = [
      makeTranscript({ speaker: "alvia", text: "That is really interesting.", timestamp: 1100, questionIndex: 0 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("not_followed");
  });
});

describe("containsKeywords word boundaries", () => {
  it("'right' does NOT match 'alright'", () => {
    const entry = makeEntry({ action: "acknowledge_prior" });
    const transcript = [
      makeTranscript({ speaker: "respondent", text: "I said something", timestamp: 900 }),
      makeTranscript({ speaker: "alvia", text: "Alright, let me continue.", timestamp: 1100 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("not_followed");
  });

  it("'right' does NOT match 'brighter'", () => {
    const entry = makeEntry({ action: "acknowledge_prior" });
    const transcript = [
      makeTranscript({ speaker: "respondent", text: "I think things are getting better", timestamp: 900 }),
      makeTranscript({ speaker: "alvia", text: "The future looks brighter indeed.", timestamp: 1100 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("not_followed");
  });

  it("'right' DOES match 'that's right'", () => {
    const entry = makeEntry({ action: "acknowledge_prior" });
    const transcript = [
      makeTranscript({ speaker: "respondent", text: "I think the process is slow", timestamp: 900 }),
      makeTranscript({ speaker: "alvia", text: "That's right, I hear you on that.", timestamp: 1100 }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("followed");
  });

  it("'tell me more' matches 'could you tell me more about that'", () => {
    const entry = makeEntry({
      action: "probe_followup",
      messageSummary: "Probe into respondent's experience with onboarding",
    });
    const transcript = [
      makeTranscript({
        speaker: "alvia",
        text: "Could you tell me more about your onboarding experience?",
        timestamp: 1100,
      }),
    ];

    const result = score(entry, transcript);
    expect(result.adherence).toBe("followed");
  });
});
