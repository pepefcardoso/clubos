import { describe, it, expect } from "vitest";
import { getTargetDayRange } from "./job-utils.js";

describe("getTargetDayRange", () => {
  it("BR-10: returns correct UTC day boundaries 3 days from now", () => {
    const now = new Date("2025-03-01T12:00:00.000Z");
    const [start, end] = getTargetDayRange(3, now);

    expect(start).toEqual(new Date("2025-03-04T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-03-04T23:59:59.999Z"));
  });

  it("BR-11: handles midnight UTC edge without day drift", () => {
    const now = new Date("2025-03-01T00:00:00.000Z");
    const [start, end] = getTargetDayRange(3, now);

    expect(start).toEqual(new Date("2025-03-04T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-03-04T23:59:59.999Z"));
  });

  it("correctly rolls over month boundary (March 30 + 3 = April 2)", () => {
    const now = new Date("2025-03-30T00:00:00.000Z");
    const [start] = getTargetDayRange(3, now);

    expect(start.getUTCDate()).toBe(2);
    expect(start.getUTCMonth()).toBe(3);
    expect(start.getUTCFullYear()).toBe(2025);
  });

  it("correctly handles year boundary (Dec 30 + 3 = Jan 2)", () => {
    const now = new Date("2024-12-30T00:00:00.000Z");
    const [start] = getTargetDayRange(3, now);

    expect(start.getUTCDate()).toBe(2);
    expect(start.getUTCMonth()).toBe(0);
    expect(start.getUTCFullYear()).toBe(2025);
  });

  it("end boundary always ends at 23:59:59.999 UTC", () => {
    const now = new Date("2025-06-15T18:30:00.000Z");
    const [, end] = getTargetDayRange(3, now);

    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);
  });

  it("returns correct past-day boundaries with negative offsetDays", () => {
    const now = new Date("2025-03-04T12:00:00.000Z");
    const [start, end] = getTargetDayRange(-3, now);

    expect(start).toEqual(new Date("2025-03-01T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-03-01T23:59:59.999Z"));
  });

  it("negative offset at midnight UTC does not drift a day", () => {
    const now = new Date("2025-03-04T00:00:00.000Z");
    const [start, end] = getTargetDayRange(-3, now);

    expect(start).toEqual(new Date("2025-03-01T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-03-01T23:59:59.999Z"));
  });

  it("negative offset rolls back across month boundary (Mar 2 - 3 = Feb 27)", () => {
    const now = new Date("2025-03-02T00:00:00.000Z");
    const [start] = getTargetDayRange(-3, now);

    expect(start.getUTCDate()).toBe(27);
    expect(start.getUTCMonth()).toBe(1);
    expect(start.getUTCFullYear()).toBe(2025);
  });

  it("negative offset rolls back across year boundary (Jan 2 - 3 = Dec 30)", () => {
    const now = new Date("2025-01-02T00:00:00.000Z");
    const [start] = getTargetDayRange(-3, now);

    expect(start.getUTCDate()).toBe(30);
    expect(start.getUTCMonth()).toBe(11);
    expect(start.getUTCFullYear()).toBe(2024);
  });

  it("end boundary is always 23:59:59.999 UTC regardless of negative offset", () => {
    const now = new Date("2025-06-15T18:30:00.000Z");
    const [, end] = getTargetDayRange(-3, now);

    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);
  });

  it("offsetDays=0 returns today full day", () => {
    const now = new Date("2025-05-10T09:15:00.000Z");
    const [start, end] = getTargetDayRange(0, now);

    expect(start).toEqual(new Date("2025-05-10T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-05-10T23:59:59.999Z"));
  });
});
