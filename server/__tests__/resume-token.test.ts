import { describe, it, expect } from "vitest";
import {
  generateResumeToken,
  hashToken,
  getTokenExpiryDate,
  isTokenExpired,
} from "../resume-token";

describe("generateResumeToken", () => {
  it("returns a base64url string of 43 characters", () => {
    const token = generateResumeToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens on each call", () => {
    const token1 = generateResumeToken();
    const token2 = generateResumeToken();
    expect(token1).not.toBe(token2);
  });
});

describe("hashToken", () => {
  it("returns a hex string", () => {
    const hash = hashToken("test-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const hash1 = hashToken("same-input");
    const hash2 = hashToken("same-input");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hashToken("input-a");
    const hash2 = hashToken("input-b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("getTokenExpiryDate", () => {
  it("returns a date 7 days in the future when called with no arguments", () => {
    const now = Date.now();
    const expiry = getTokenExpiryDate();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const diff = expiry.getTime() - now;
    expect(diff).toBeGreaterThan(sevenDaysMs - 1000);
    expect(diff).toBeLessThan(sevenDaysMs + 1000);
  });

  it("returns correct expiry for a custom TTL", () => {
    const ttlMs = 60 * 60 * 1000;
    const now = Date.now();
    const expiry = getTokenExpiryDate(ttlMs);
    const diff = expiry.getTime() - now;
    expect(diff).toBeGreaterThan(ttlMs - 1000);
    expect(diff).toBeLessThan(ttlMs + 1000);
  });
});

describe("isTokenExpired", () => {
  it("returns true for a past date", () => {
    const past = new Date(Date.now() - 1000);
    expect(isTokenExpired(past)).toBe(true);
  });

  it("returns false for a future date", () => {
    const future = new Date(Date.now() + 60000);
    expect(isTokenExpired(future)).toBe(false);
  });

  it("returns true for null", () => {
    expect(isTokenExpired(null)).toBe(true);
  });
});
