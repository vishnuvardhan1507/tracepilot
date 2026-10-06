import { describe, it, expect } from "vitest";
import { duration, money, number } from "./api";
describe("telemetry presentation", () => {
  it("distinguishes unknown cost from zero", () => {
    expect(money(null)).toBe("Unavailable");
    expect(money(0)).toBe("$0.00");
  });
  it("distinguishes incomplete duration from zero", () => {
    expect(duration(null)).toBe("In progress");
    expect(duration(0)).toBe("0ms");
    expect(duration(2400)).toBe("2.40s");
  });
  it("does not present missing counts as zero", () => {
    expect(number(null)).toBe("—");
    expect(number(0)).toBe("0");
  });
});
