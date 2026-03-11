import { describe, it, expect } from "vitest";
import { shouldDrainMore, isGenerationComplete } from "../audio-scheduling";

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
