import { describe, it, expect } from "vitest";

describe("module imports", () => {
  it("can import resume-token module", async () => {
    const mod = await import("../resume-token");
    expect(typeof mod.generateResumeToken).toBe("function");
    expect(typeof mod.hashToken).toBe("function");
    expect(typeof mod.getTokenExpiryDate).toBe("function");
    expect(typeof mod.isTokenExpired).toBe("function");
  });

  it("can import shared schema", async () => {
    const mod = await import("@shared/schema");
    expect(mod).toBeDefined();
    expect(typeof mod).toBe("object");
  });
});
