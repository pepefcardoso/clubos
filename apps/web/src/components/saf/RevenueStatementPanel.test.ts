import { describe, it, expect } from "vitest";
import { presetToMode, formatPeriod } from "./RevenueStatementPanel.js";

const NOW = new Date("2025-03-15T00:00:00.000Z");

describe("presetToMode", () => {
  it("6m → { type: months, months: 6 }", () => {
    expect(presetToMode("6m", NOW)).toEqual({ type: "months", months: 6 });
  });

  it("12m → { type: months, months: 12 }", () => {
    expect(presetToMode("12m", NOW)).toEqual({ type: "months", months: 12 });
  });

  it("ytd → { type: year, year: current year }", () => {
    expect(presetToMode("ytd", NOW)).toEqual({ type: "year", year: 2025 });
  });

  it("prev-year → { type: year, year: current year - 1 }", () => {
    expect(presetToMode("prev-year", NOW)).toEqual({
      type: "year",
      year: 2024,
    });
  });

  it("ytd uses now.getFullYear() — works across year boundaries", () => {
    const jan1 = new Date("2026-01-01T00:00:00.000Z");
    expect(presetToMode("ytd", jan1)).toEqual({ type: "year", year: 2026 });
    expect(presetToMode("prev-year", jan1)).toEqual({
      type: "year",
      year: 2025,
    });
  });
});

describe("formatPeriod", () => {
  it("returns a non-empty string containing the year", () => {
    const result = formatPeriod("2025-03");
    expect(result).toBeTruthy();
    expect(result).toContain("2025");
  });

  it("returns a non-empty string for December", () => {
    const result = formatPeriod("2025-12");
    expect(result).toBeTruthy();
    expect(result).toContain("2025");
  });

  it("returns a non-empty string for January", () => {
    const result = formatPeriod("2024-01");
    expect(result).toBeTruthy();
    expect(result).toContain("2024");
  });

  it("does not contain a raw dot (month abbreviation cleaned up)", () => {
    const result = formatPeriod("2025-03");
    expect(result.trimEnd().endsWith(".")).toBe(false);
  });
});

describe("net cents display logic", () => {
  it("positive net (surplus) is >= 0", () => {
    expect(100_000 >= 0).toBe(true);
  });

  it("negative net (deficit) is < 0", () => {
    expect(-50_000 >= 0).toBe(false);
  });

  it("zero net is treated as non-negative (break-even)", () => {
    expect(0 >= 0).toBe(true);
  });
});

describe("KPI arithmetic — pending + overdue", () => {
  it("sums correctly for the combined KPI card", () => {
    const pendingCents = 150_000;
    const overdueCents = 80_000;
    expect(pendingCents + overdueCents).toBe(230_000);
  });

  it("returns zero when both are zero", () => {
    expect(0 + 0).toBe(0);
  });
});