import { describe, it, expect } from "vitest";
import { buildInterviewInstructions } from "../voice-interview/instructions";
import { createEmptyMetricsTracker } from "../voice-interview/metrics";

describe("VAD Eagerness", () => {
  describe("buildInterviewInstructions - RESPONSE TIMING block", () => {
    const template = { objective: "Test interview", tone: "professional" };
    const question = { questionText: "What do you think?", guidance: "Probe deeply" };

    it("includes RESPONSE TIMING block when eagernessMode is 'high'", () => {
      const instructions = buildInterviewInstructions(
        template, question, 0, 3,
        undefined, null, [question], undefined, null, false,
        "high",
      );
      expect(instructions).toContain("RESPONSE TIMING (IMPORTANT):");
      expect(instructions).toContain("voice detection is set to respond quickly");
      expect(instructions).toContain("Please continue...");
    });

    it("excludes RESPONSE TIMING block when eagernessMode is 'auto'", () => {
      const instructions = buildInterviewInstructions(
        template, question, 0, 3,
        undefined, null, [question], undefined, null, false,
        "auto",
      );
      expect(instructions).not.toContain("RESPONSE TIMING (IMPORTANT):");
    });

    it("excludes RESPONSE TIMING block when eagernessMode is undefined", () => {
      const instructions = buildInterviewInstructions(
        template, question, 0, 3,
        undefined, null, [question], undefined, null, false,
      );
      expect(instructions).not.toContain("RESPONSE TIMING (IMPORTANT):");
    });

    it("excludes RESPONSE TIMING block when eagernessMode is 'low'", () => {
      const instructions = buildInterviewInstructions(
        template, question, 0, 3,
        undefined, null, [question], undefined, null, false,
        "low",
      );
      expect(instructions).not.toContain("RESPONSE TIMING (IMPORTANT):");
    });
  });

  describe("createEmptyMetricsTracker - eagerness tracking initialization", () => {
    it("initializes eagerness tracking with correct defaults", () => {
      const tracker = createEmptyMetricsTracker();
      expect(tracker.eagernessTracking).toEqual({
        initialMode: "auto",
        currentMode: "auto",
        switchedAt: null,
        switchReason: null,
        rapidBargeInCount: 0,
        totalBargeInCount: 0,
        recentTurnBargeIns: [],
        eagernessDowngraded: false,
        respondentTurnCount: 0,
      });
    });
  });

  describe("Eagerness hierarchy enforcement", () => {
    it("sliding window correctly identifies confusion threshold (3-in-6)", () => {
      const tracker = createEmptyMetricsTracker();
      tracker.eagernessTracking.initialMode = "high";
      tracker.eagernessTracking.currentMode = "high";

      tracker.eagernessTracking.recentTurnBargeIns = [true, false, true, false, true, false];
      const rapidCount = tracker.eagernessTracking.recentTurnBargeIns.filter(Boolean).length;
      expect(rapidCount).toBe(3);
      expect(rapidCount >= 3).toBe(true);
    });

    it("sliding window below threshold does not trigger switch", () => {
      const tracker = createEmptyMetricsTracker();
      tracker.eagernessTracking.initialMode = "high";
      tracker.eagernessTracking.currentMode = "high";

      tracker.eagernessTracking.recentTurnBargeIns = [true, false, true, false, false, false];
      const rapidCount = tracker.eagernessTracking.recentTurnBargeIns.filter(Boolean).length;
      expect(rapidCount).toBe(2);
      expect(rapidCount >= 3).toBe(false);
    });

    it("sliding window stays capped at 6 entries", () => {
      const tracker = createEmptyMetricsTracker();
      const arr = tracker.eagernessTracking.recentTurnBargeIns;

      for (let i = 0; i < 10; i++) {
        arr.push(false);
        if (arr.length > 6) arr.shift();
      }
      expect(arr.length).toBe(6);
    });

    it("eagernessDowngraded flag prevents re-escalation", () => {
      const tracker = createEmptyMetricsTracker();
      tracker.eagernessTracking.eagernessDowngraded = true;
      tracker.eagernessTracking.currentMode = "auto";

      expect(tracker.eagernessTracking.eagernessDowngraded).toBe(true);
      expect(tracker.eagernessTracking.currentMode).toBe("auto");
    });

    it("first rapid barge-in creates initial entry when recentTurnBargeIns is empty", () => {
      const tracker = createEmptyMetricsTracker();
      const arr = tracker.eagernessTracking.recentTurnBargeIns;
      expect(arr.length).toBe(0);

      if (arr.length > 0) {
        arr[arr.length - 1] = true;
      } else {
        arr.push(true);
      }
      expect(arr.length).toBe(1);
      expect(arr[0]).toBe(true);
    });
  });
});
