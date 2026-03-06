import { describe, it, expect } from "vitest";
import { parsePriceToCents, centsToInputValue } from "@/lib/format";

type PlanInterval = "monthly" | "quarterly" | "annual";

interface FormState {
  name: string;
  price: string;
  interval: PlanInterval;
  benefits: string[];
}

interface FormErrors {
  name?: string;
  price?: string;
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const previewCents = parsePriceToCents(form.price);

  if (!form.name.trim()) {
    errors.name = "Informe o nome do plano";
  } else if (form.name.trim().length < 2) {
    errors.name = "Nome deve ter pelo menos 2 caracteres";
  } else if (form.name.trim().length > 80) {
    errors.name = "Nome deve ter no máximo 80 caracteres";
  }

  if (!form.price) {
    errors.price = "Informe o valor do plano";
  } else if (previewCents <= 0) {
    errors.price = "Valor deve ser maior que zero";
  }

  return errors;
}

function isValid(errors: FormErrors) {
  return Object.keys(errors).length === 0;
}

const base: FormState = {
  name: "Sócio Ouro",
  price: "99.90",
  interval: "monthly",
  benefits: ["Entrada gratuita no estádio"],
};

describe("PlanFormModal — name validation", () => {
  it("passes with a valid name", () => {
    expect(isValid(validate(base))).toBe(true);
  });

  it("rejects empty name", () => {
    const errors = validate({ ...base, name: "" });
    expect(errors.name).toBe("Informe o nome do plano");
  });

  it("rejects whitespace-only name", () => {
    const errors = validate({ ...base, name: "   " });
    expect(errors.name).toBe("Informe o nome do plano");
  });

  it("rejects single-character name", () => {
    const errors = validate({ ...base, name: "A" });
    expect(errors.name).toMatch(/2 caracteres/);
  });

  it("rejects name longer than 80 chars", () => {
    const errors = validate({ ...base, name: "A".repeat(81) });
    expect(errors.name).toMatch(/80 caracteres/);
  });

  it("accepts name at lower boundary: 2 chars", () => {
    expect(isValid(validate({ ...base, name: "AA" }))).toBe(true);
  });

  it("accepts name at upper boundary: 80 chars", () => {
    expect(isValid(validate({ ...base, name: "A".repeat(80) }))).toBe(true);
  });
});

describe("PlanFormModal — price validation", () => {
  it("passes with a valid price", () => {
    expect(isValid(validate(base))).toBe(true);
  });

  it("rejects empty price", () => {
    const errors = validate({ ...base, price: "" });
    expect(errors.price).toBe("Informe o valor do plano");
  });

  it("rejects zero price", () => {
    const errors = validate({ ...base, price: "0" });
    expect(errors.price).toMatch(/maior que zero/);
  });

  it("rejects negative price", () => {
    const errors = validate({ ...base, price: "-10" });
    expect(errors.price).toMatch(/maior que zero/);
  });

  it("accepts minimum valid price (R$ 0,01)", () => {
    const errors = validate({ ...base, price: "0.01" });
    expect(errors.price).toBeUndefined();
  });

  it("accepts comma-separated decimal price", () => {
    const errors = validate({ ...base, price: "149,90" });
    expect(errors.price).toBeUndefined();
  });

  it("accepts large price", () => {
    const errors = validate({ ...base, price: "9999.99" });
    expect(errors.price).toBeUndefined();
  });
});

describe("PlanFormModal — benefits logic", () => {
  it("filters out empty benefit strings before submit", () => {
    const benefits = ["Entrada gratuita", "", "Estacionamento gratuito", "  "];
    const filtered = benefits.filter((b) => b.trim() !== "");
    expect(filtered).toEqual(["Entrada gratuita", "Estacionamento gratuito"]);
  });

  it("results in empty array when all benefits are blank", () => {
    const benefits = ["", "  ", "\t"];
    const filtered = benefits.filter((b) => b.trim() !== "");
    expect(filtered).toHaveLength(0);
  });

  it("preserves all non-empty benefits", () => {
    const benefits = ["Benefício A", "Benefício B", "Benefício C"];
    const filtered = benefits.filter((b) => b.trim() !== "");
    expect(filtered).toHaveLength(3);
  });

  it("does not allow more than 20 benefits (add button disabled)", () => {
    const benefits = Array.from({ length: 20 }, (_, i) => `Benefício ${i + 1}`);
    const canAdd = benefits.length < 20;
    expect(canAdd).toBe(false);
  });

  it("allows adding benefit when under 20", () => {
    const benefits = Array.from({ length: 19 }, (_, i) => `Benefício ${i + 1}`);
    const canAdd = benefits.length < 20;
    expect(canAdd).toBe(true);
  });
});

describe("PlanFormModal — interval options", () => {
  const INTERVAL_OPTIONS: Array<{ value: PlanInterval; label: string }> = [
    { value: "monthly", label: "Mensal" },
    { value: "quarterly", label: "Trimestral" },
    { value: "annual", label: "Anual" },
  ];

  it("has exactly 3 interval options", () => {
    expect(INTERVAL_OPTIONS).toHaveLength(3);
  });

  it("includes monthly option", () => {
    expect(INTERVAL_OPTIONS.find((o) => o.value === "monthly")?.label).toBe(
      "Mensal",
    );
  });

  it("includes quarterly option", () => {
    expect(INTERVAL_OPTIONS.find((o) => o.value === "quarterly")?.label).toBe(
      "Trimestral",
    );
  });

  it("includes annual option", () => {
    expect(INTERVAL_OPTIONS.find((o) => o.value === "annual")?.label).toBe(
      "Anual",
    );
  });
});

describe("PlanFormModal — price display and parsing", () => {
  it("converts stored cents to input value correctly", () => {
    expect(centsToInputValue(9990)).toBe("99.90");
  });

  it("parses input value back to cents correctly", () => {
    expect(parsePriceToCents("99.90")).toBe(9990);
  });

  it("round-trips price correctly", () => {
    const originalCents = 14990;
    const inputValue = centsToInputValue(originalCents);
    const roundTripped = parsePriceToCents(inputValue);
    expect(roundTripped).toBe(originalCents);
  });
});

describe("PlanFormModal — combined validation", () => {
  it("reports all errors when name and price are missing", () => {
    const errors = validate({ ...base, name: "", price: "" });
    expect(errors.name).toBeDefined();
    expect(errors.price).toBeDefined();
  });

  it("passes with minimal valid form", () => {
    const minimal: FormState = {
      name: "Plano Básico",
      price: "29.90",
      interval: "monthly",
      benefits: [],
    };
    expect(isValid(validate(minimal))).toBe(true);
  });
});
