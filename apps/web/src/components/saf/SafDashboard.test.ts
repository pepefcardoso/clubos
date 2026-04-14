import { describe, it, expect } from "vitest";
import { deriveComplianceStatus } from "@/hooks/use-saf-dashboard";

const NOW = new Date("2025-06-15T00:00:00.000Z");
const THIS_YEAR_DATE = "2025-03-01T10:00:00.000Z";
const LAST_YEAR_DATE = "2024-11-30T10:00:00.000Z";

describe("deriveComplianceStatus — no balance sheet", () => {
  it("returns 'irregular' when lastPublishedAt is null", () => {
    expect(deriveComplianceStatus(null, 0, NOW)).toBe("irregular");
  });

  it("returns 'irregular' even with pending liabilities when no sheet", () => {
    expect(deriveComplianceStatus(null, 500_000, NOW)).toBe("irregular");
  });
});

describe("deriveComplianceStatus — last year balance sheet", () => {
  it("returns 'irregular' when last sheet was published in a prior year", () => {
    expect(deriveComplianceStatus(LAST_YEAR_DATE, 0, NOW)).toBe("irregular");
  });

  it("returns 'irregular' for prior year even with zero pending liabilities", () => {
    expect(deriveComplianceStatus(LAST_YEAR_DATE, 0, NOW)).toBe("irregular");
  });
});

describe("deriveComplianceStatus — current year balance sheet, no pending liabilities", () => {
  it("returns 'compliant' when sheet is this year and pending is 0", () => {
    expect(deriveComplianceStatus(THIS_YEAR_DATE, 0, NOW)).toBe("compliant");
  });

  it("returns 'compliant' for same-month publication with no pending", () => {
    const today = "2025-06-01T00:00:00.000Z";
    expect(deriveComplianceStatus(today, 0, NOW)).toBe("compliant");
  });
});

describe("deriveComplianceStatus — current year balance sheet, with pending liabilities", () => {
  it("returns 'warning' when sheet is this year but pending > 0", () => {
    expect(deriveComplianceStatus(THIS_YEAR_DATE, 100_000, NOW)).toBe(
      "warning",
    );
  });

  it("returns 'warning' for any positive pending amount, even 1 cent", () => {
    expect(deriveComplianceStatus(THIS_YEAR_DATE, 1, NOW)).toBe("warning");
  });
});

describe("deriveComplianceStatus — year boundary edge cases", () => {
  it("publication on Jan 1 of current year is compliant (with no pending)", () => {
    const jan1 = new Date("2025-01-01T00:00:00.000Z");
    expect(deriveComplianceStatus("2025-01-01T00:00:00.000Z", 0, jan1)).toBe(
      "compliant",
    );
  });

  it("publication on Dec 31 of prior year is irregular", () => {
    expect(deriveComplianceStatus("2024-12-31T23:59:59.999Z", 0, NOW)).toBe(
      "irregular",
    );
  });

  it("uses injected `now` — works for year 2026", () => {
    const now2026 = new Date("2026-03-15T00:00:00.000Z");
    expect(deriveComplianceStatus(THIS_YEAR_DATE, 0, now2026)).toBe(
      "irregular",
    );
  });
});
