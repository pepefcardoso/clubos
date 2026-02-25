import { describe, it, expect } from "vitest";
import { generateSlug, formatCnpjDisplay, stripCnpjMask } from "./wizard.types";

describe("generateSlug", () => {
  it("lowercases the input", () => {
    expect(generateSlug("Atletico")).toBe("atletico");
  });

  it("strips accents and diacritics", () => {
    expect(generateSlug("São Paulo FC")).toBe("sao-paulo-fc");
    expect(generateSlug("Grêmio Esportivo")).toBe("gremio-esportivo");
    expect(generateSlug("Fluminense")).toBe("fluminense");
    expect(generateSlug("Vânia")).toBe("vania");
  });

  it("replaces spaces with hyphens", () => {
    expect(generateSlug("Vila Nova")).toBe("vila-nova");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(generateSlug("Vila  Nova")).toBe("vila-nova");
    expect(generateSlug("Vila--Nova")).toBe("vila-nova");
  });

  it("strips leading and trailing hyphens", () => {
    expect(generateSlug("-test-")).toBe("test");
  });

  it("removes special characters", () => {
    expect(generateSlug("Club & Sport!")).toBe("club-sport");
    expect(generateSlug("A.C. Milan")).toBe("ac-milan");
  });

  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });

  it("handles all-special-char input", () => {
    expect(generateSlug("!@#$%")).toBe("");
  });

  it("preserves numbers", () => {
    expect(generateSlug("Sport Club 1905")).toBe("sport-club-1905");
  });
});

describe("formatCnpjDisplay", () => {
  it("formats a 14-digit CNPJ correctly", () => {
    expect(formatCnpjDisplay("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("handles already-masked input by stripping mask first", () => {
    expect(formatCnpjDisplay("12.345.678/0001-99")).toBe("12.345.678/0001-99");
  });

  it("handles partial input (fewer than 14 digits)", () => {
    expect(formatCnpjDisplay("1234")).toBe("12.34");
    expect(formatCnpjDisplay("12345678")).toBe("12.345.678/");
  });

  it("handles empty string", () => {
    expect(formatCnpjDisplay("")).toBe("");
  });
});

describe("stripCnpjMask", () => {
  it("removes all non-digit characters", () => {
    expect(stripCnpjMask("12.345.678/0001-99")).toBe("12345678000199");
  });

  it("passes through raw digits unchanged", () => {
    expect(stripCnpjMask("12345678000199")).toBe("12345678000199");
  });

  it("handles empty string", () => {
    expect(stripCnpjMask("")).toBe("");
  });
});
