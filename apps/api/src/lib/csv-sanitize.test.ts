import { describe, it, expect } from "vitest";
import { hasCsvInjection, sanitizeCsvField } from "./csv-sanitize.js";

describe("hasCsvInjection()", () => {
  it.each([
    ["=SUM(A1)", "equals sign"],
    ["+cmd|calc", "plus sign"],
    ["-1+1", "minus sign"],
    ["@SUM(A1)", "at sign"],
    ["\tshift", "tab character"],
    ["\rbreak", "carriage return"],
    ["|DDE", "pipe character"],
    ["%percent", "percent sign"],
  ])("returns true for dangerous value starting with %s (%s)", (val) => {
    expect(hasCsvInjection(val)).toBe(true);
  });

  it.each([
    ["João Silva", "regular name"],
    ["joao@email.com", "email (@ not at start)"],
    ["12345678901", "digits only"],
    ["normal text", "plain text"],
    ["hello=world", "equals not at start"],
    ["name+surname", "plus not at start"],
    ["", "empty string"],
  ])("returns false for safe value: %s (%s)", (val) => {
    expect(hasCsvInjection(val)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasCsvInjection("")).toBe(false);
  });

  it("is sensitive to position — only the first character matters", () => {
    expect(hasCsvInjection("safe=formula")).toBe(false);
    expect(hasCsvInjection("=unsafe")).toBe(true);
  });

  it("handles a single-character trigger string", () => {
    expect(hasCsvInjection("=")).toBe(true);
    expect(hasCsvInjection("+")).toBe(true);
    expect(hasCsvInjection("-")).toBe(true);
    expect(hasCsvInjection("@")).toBe(true);
  });
});

describe("sanitizeCsvField()", () => {
  it("prefixes '=' with apostrophe", () => {
    expect(sanitizeCsvField('=HYPERLINK("evil.com")')).toBe(
      '\'=HYPERLINK("evil.com")',
    );
  });

  it("prefixes '+' with apostrophe", () => {
    expect(sanitizeCsvField("+cmd|calc")).toBe("'+cmd|calc");
  });

  it("prefixes '-' with apostrophe", () => {
    expect(sanitizeCsvField("-1+1")).toBe("'-1+1");
  });

  it("prefixes '@' with apostrophe", () => {
    expect(sanitizeCsvField("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("prefixes tab with apostrophe", () => {
    expect(sanitizeCsvField("\tshift")).toBe("'\tshift");
  });

  it("prefixes '|' with apostrophe", () => {
    expect(sanitizeCsvField("|DDE")).toBe("'|DDE");
  });

  it("prefixes '%' with apostrophe", () => {
    expect(sanitizeCsvField("%percent")).toBe("'%percent");
  });

  it("does not modify safe strings", () => {
    expect(sanitizeCsvField("João Silva")).toBe("João Silva");
  });

  it("does not modify email addresses (@ not at start)", () => {
    expect(sanitizeCsvField("joao@email.com")).toBe("joao@email.com");
  });

  it("returns empty string for null", () => {
    expect(sanitizeCsvField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(sanitizeCsvField(undefined)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(sanitizeCsvField("")).toBe("");
  });

  it("does not double-prefix an already-prefixed value", () => {
    expect(sanitizeCsvField("'safe")).toBe("'safe");
  });

  it("only prefixes when trigger char is first character", () => {
    expect(sanitizeCsvField("hello=world")).toBe("hello=world");
  });
});
