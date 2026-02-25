import { describe, it, expect } from "vitest";
import {
  formatBRL,
  parsePriceToCents,
  centsToInputValue,
  intervalLabel,
} from "./format";

describe("formatBRL", () => {
  it("formats zero cents", () => {
    expect(formatBRL(0)).toMatch(/R\$\s*0,00/);
  });

  it("formats a typical amount", () => {
    expect(formatBRL(14990)).toMatch(/R\$\s*149,90/);
  });

  it("formats thousands with separator", () => {
    expect(formatBRL(100000)).toMatch(/R\$\s*1\.000,00/);
  });

  it("formats large amounts correctly", () => {
    expect(formatBRL(1234567)).toMatch(/R\$\s*12\.345,67/);
  });

  it("formats single cent", () => {
    expect(formatBRL(1)).toMatch(/R\$\s*0,01/);
  });
});

describe("parsePriceToCents", () => {
  it("parses a decimal string with dot separator", () => {
    expect(parsePriceToCents("149.90")).toBe(14990);
  });

  it("parses a decimal string with comma separator", () => {
    expect(parsePriceToCents("149,90")).toBe(14990);
  });

  it("parses an integer string", () => {
    expect(parsePriceToCents("100")).toBe(10000);
  });

  it("returns 0 for invalid (non-numeric) input", () => {
    expect(parsePriceToCents("abc")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parsePriceToCents("")).toBe(0);
  });

  it("avoids float precision issues via Math.round", () => {
    expect(parsePriceToCents("1.005")).toBe(101);
  });

  it("parses zero", () => {
    expect(parsePriceToCents("0")).toBe(0);
  });

  it("parses small values like 0.99", () => {
    expect(parsePriceToCents("0.99")).toBe(99);
  });
});

describe("centsToInputValue", () => {
  it("converts cents to a 2-decimal string", () => {
    expect(centsToInputValue(14990)).toBe("149.90");
  });

  it("converts zero", () => {
    expect(centsToInputValue(0)).toBe("0.00");
  });

  it("handles values without a fractional part", () => {
    expect(centsToInputValue(10000)).toBe("100.00");
  });

  it("handles single-digit cents", () => {
    expect(centsToInputValue(1)).toBe("0.01");
  });
});

describe("intervalLabel", () => {
  it("returns correct label for monthly", () => {
    expect(intervalLabel["monthly"]).toBe("Mensal");
  });

  it("returns correct label for quarterly", () => {
    expect(intervalLabel["quarterly"]).toBe("Trimestral");
  });

  it("returns correct label for annual", () => {
    expect(intervalLabel["annual"]).toBe("Anual");
  });
});
