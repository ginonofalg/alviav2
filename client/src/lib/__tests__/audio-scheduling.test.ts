import { describe, it, expect } from "vitest";
import {
  computeOverlap,
  computeCurrentEnvelopeValue,
  shouldDrainMore,
  computeFadeTime,
  isGenerationComplete,
  OVERLAP_CAP,
} from "../audio-scheduling";

describe("computeOverlap", () => {
  it("returns 10% of chunk duration when below the cap", () => {
    expect(computeOverlap(0.01)).toBeCloseTo(0.001);
  });

  it("caps at OVERLAP_CAP for long chunks", () => {
    expect(computeOverlap(0.2)).toBe(OVERLAP_CAP);
    expect(computeOverlap(1.0)).toBe(OVERLAP_CAP);
  });

  it("returns 0 for zero or negative duration", () => {
    expect(computeOverlap(0)).toBe(0);
    expect(computeOverlap(-0.5)).toBe(0);
  });

  it("respects a custom overlap cap", () => {
    expect(computeOverlap(0.2, 0.001)).toBe(0.001);
    expect(computeOverlap(0.005, 0.001)).toBeCloseTo(0.0005);
  });

  it("handles very short chunks (1ms) correctly", () => {
    expect(computeOverlap(0.001)).toBeCloseTo(0.0001);
  });
});

describe("computeCurrentEnvelopeValue", () => {
  const start = 10;
  const end = 11;
  const fade = 0.05;

  it("returns 0 before scheduledStart", () => {
    expect(computeCurrentEnvelopeValue(9.5, start, end, fade)).toBe(0);
  });

  it("linearly ramps 0→1 during fade-in", () => {
    expect(computeCurrentEnvelopeValue(start, start, end, fade)).toBe(0);
    expect(
      computeCurrentEnvelopeValue(start + fade / 2, start, end, fade),
    ).toBeCloseTo(0.5);
    expect(
      computeCurrentEnvelopeValue(start + fade, start, end, fade),
    ).toBeCloseTo(1);
  });

  it("returns 1 in sustain region", () => {
    expect(computeCurrentEnvelopeValue(10.5, start, end, fade)).toBe(1);
  });

  it("linearly ramps 1→0 during fade-out", () => {
    const fadeOutStart = end - fade;
    expect(
      computeCurrentEnvelopeValue(fadeOutStart, start, end, fade),
    ).toBeCloseTo(1);
    expect(
      computeCurrentEnvelopeValue(fadeOutStart + fade / 2, start, end, fade),
    ).toBeCloseTo(0.5);
    expect(computeCurrentEnvelopeValue(end, start, end, fade)).toBeCloseTo(0);
  });

  it("returns 0 past scheduledEnd", () => {
    expect(computeCurrentEnvelopeValue(12, start, end, fade)).toBe(0);
  });

  it("clamps to [0, 1]", () => {
    const val = computeCurrentEnvelopeValue(10.5, start, end, fade);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });

  it("returns 0 when fadeTime is 0", () => {
    expect(computeCurrentEnvelopeValue(10.5, start, end, 0)).toBe(0);
  });
});

describe("shouldDrainMore", () => {
  it("always returns true when scheduledThisPass is 0", () => {
    expect(shouldDrainMore(100, 0, 0.2, 0)).toBe(true);
  });

  it("returns true when ahead is below maxAhead", () => {
    expect(shouldDrainMore(1.1, 1.0, 0.2, 1)).toBe(true);
  });

  it("returns false when ahead exceeds maxAhead", () => {
    expect(shouldDrainMore(1.21, 1.0, 0.2, 1)).toBe(false);
    expect(shouldDrainMore(1.5, 1.0, 0.2, 1)).toBe(false);
  });

  it("returns true when ahead equals maxAhead exactly", () => {
    expect(shouldDrainMore(1.2, 1.0, 0.2, 1)).toBe(true);
  });
});

describe("computeFadeTime", () => {
  it("always equals computeOverlap for any input", () => {
    const durations = [0, 0.001, 0.01, 0.05, 0.1, 0.2, 1.0];
    for (const d of durations) {
      expect(computeFadeTime(d)).toBe(computeOverlap(d));
    }
  });

  it("respects a custom overlap cap", () => {
    expect(computeFadeTime(0.2, 0.001)).toBe(computeOverlap(0.2, 0.001));
  });
});

describe("isGenerationComplete", () => {
  it("returns true when no active sources match and queue is empty", () => {
    const sources = [{ generation: 0 }, { generation: 1 }];
    expect(isGenerationComplete(sources, 2, 0)).toBe(true);
  });

  it("returns false when an active source matches current generation", () => {
    const sources = [{ generation: 2 }, { generation: 1 }];
    expect(isGenerationComplete(sources, 2, 0)).toBe(false);
  });

  it("returns false when queue is not empty", () => {
    expect(isGenerationComplete([], 0, 1)).toBe(false);
  });

  it("returns true with empty sources and empty queue", () => {
    expect(isGenerationComplete([], 5, 0)).toBe(true);
  });
});
