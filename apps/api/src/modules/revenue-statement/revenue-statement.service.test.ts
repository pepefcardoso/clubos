import { describe, it, expect } from "vitest";
import { resolveDateRange } from "./revenue-statement.service.js";

const REF = new Date("2025-03-15T10:00:00.000Z");

describe("resolveDateRange — months mode", () => {
  it("returns last 12 months: fromDate is April 2024, toDate is March 2025", () => {
    const { fromDate, toDate } = resolveDateRange({ months: 12 }, REF);
    expect(fromDate.toISOString().slice(0, 7)).toBe("2024-04");
    expect(toDate.toISOString().slice(0, 7)).toBe("2025-03");
  });

  it("returns current month only when months=1", () => {
    const { fromDate, toDate } = resolveDateRange({ months: 1 }, REF);
    expect(fromDate.toISOString().slice(0, 7)).toBe("2025-03");
    expect(toDate.toISOString().slice(0, 7)).toBe("2025-03");
  });

  it("fromDate is the first day of the start month at 00:00:00 UTC", () => {
    const { fromDate } = resolveDateRange({ months: 6 }, REF);
    expect(fromDate.getUTCDate()).toBe(1);
    expect(fromDate.getUTCHours()).toBe(0);
    expect(fromDate.getUTCMinutes()).toBe(0);
    expect(fromDate.getUTCSeconds()).toBe(0);
  });

  it("toDate is the last moment of the current month (23:59:59.999 UTC)", () => {
    const { toDate } = resolveDateRange({ months: 12 }, REF);
    expect(toDate.getUTCHours()).toBe(23);
    expect(toDate.getUTCMinutes()).toBe(59);
    expect(toDate.getUTCSeconds()).toBe(59);
    expect(toDate.getUTCMilliseconds()).toBe(999);
  });

  it("handles months=6 from October (crosses year boundary correctly)", () => {
    const oct = new Date("2025-10-10T00:00:00.000Z");
    const { fromDate, toDate } = resolveDateRange({ months: 6 }, oct);
    expect(fromDate.toISOString().slice(0, 7)).toBe("2025-05");
    expect(toDate.toISOString().slice(0, 7)).toBe("2025-10");
  });
});

describe("resolveDateRange — year mode", () => {
  it("returns 1 Jan → 31 Dec for the given year", () => {
    const { fromDate, toDate } = resolveDateRange({ year: 2024 });
    expect(fromDate.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(toDate.getUTCMonth()).toBe(11);
    expect(toDate.getUTCDate()).toBe(31);
    expect(toDate.getUTCHours()).toBe(23);
    expect(toDate.getUTCSeconds()).toBe(59);
  });

  it("handles a leap year (2024) correctly — Feb 29 is within range", () => {
    const { fromDate, toDate } = resolveDateRange({ year: 2024 });
    const feb29 = new Date("2024-02-29T12:00:00.000Z");
    expect(feb29 >= fromDate && feb29 <= toDate).toBe(true);
  });
});

describe("resolveDateRange — range mode", () => {
  it("returns exact fromDate at 00:00:00.000Z", () => {
    const { fromDate } = resolveDateRange({ from: "2025-01-01", to: "2025-06-30" });
    expect(fromDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("returns exact toDate at 23:59:59.999Z", () => {
    const { toDate } = resolveDateRange({ from: "2025-01-01", to: "2025-06-30" });
    expect(toDate.toISOString()).toBe("2025-06-30T23:59:59.999Z");
  });

  it("supports single-day range (from === to)", () => {
    const { fromDate, toDate } = resolveDateRange({
      from: "2025-03-15",
      to: "2025-03-15",
    });
    expect(fromDate.toISOString().slice(0, 10)).toBe("2025-03-15");
    expect(toDate.toISOString().slice(0, 10)).toBe("2025-03-15");
    expect(toDate > fromDate).toBe(true);
  });
});

describe("resolveDateRange — default (empty query)", () => {
  it("falls back to trailing 12 months when no params provided", () => {
    const { fromDate, toDate } = resolveDateRange({}, REF);
    const explicit = resolveDateRange({ months: 12 }, REF);
    expect(fromDate.toISOString()).toBe(explicit.fromDate.toISOString());
    expect(toDate.toISOString()).toBe(explicit.toDate.toISOString());
  });
});

describe("resolveDateRange — months takes priority over year and range", () => {
  it("months wins when multiple keys are present (route guards prevent this in prod)", () => {
    const { fromDate } = resolveDateRange({ months: 3, year: 2020 }, REF);
    const expected = resolveDateRange({ months: 3 }, REF);
    expect(fromDate.toISOString()).toBe(expected.fromDate.toISOString());
  });
});