import { describe, it, expect } from "vitest";
import { parsePriceToCents } from "@/lib/format";

interface FormErrors {
  description?: string;
  amountStr?: string;
  date?: string;
}

function validate(form: {
  description: string;
  amountStr: string;
  date: string;
}): FormErrors {
  const e: FormErrors = {};

  if (!form.description.trim()) {
    e.description = "Informe a descrição da despesa";
  } else if (form.description.trim().length < 2) {
    e.description = "Descrição deve ter pelo menos 2 caracteres";
  } else if (form.description.trim().length > 200) {
    e.description = "Descrição deve ter no máximo 200 caracteres";
  }

  const cents = parsePriceToCents(form.amountStr);
  if (!form.amountStr.trim() || isNaN(parseFloat(form.amountStr))) {
    e.amountStr = "Informe o valor da despesa";
  } else if (cents <= 0) {
    e.amountStr = "O valor deve ser maior que zero";
  }

  if (!form.date) {
    e.date = "Informe a data da despesa";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    e.date = "Data inválida";
  }

  return e;
}

function isValid(errors: FormErrors) {
  return Object.keys(errors).length === 0;
}

const base = {
  description: "Salário do goleiro",
  amountStr: "5000.00",
  date: "2025-03-01",
};

describe("parsePriceToCents", () => {
  it("converts dot-decimal string to integer cents", () => {
    expect(parsePriceToCents("149.90")).toBe(14990);
  });

  it("converts comma-decimal string to integer cents", () => {
    expect(parsePriceToCents("149,90")).toBe(14990);
  });

  it("handles whole numbers", () => {
    expect(parsePriceToCents("5000")).toBe(500000);
  });

  it("returns 0 for empty string", () => {
    expect(parsePriceToCents("")).toBe(0);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parsePriceToCents("abc")).toBe(0);
  });
});

describe("ExpenseFormModal — description validation", () => {
  it("passes with a valid description", () => {
    expect(isValid(validate(base))).toBe(true);
  });

  it("rejects empty description", () => {
    const errors = validate({ ...base, description: "" });
    expect(errors.description).toBe("Informe a descrição da despesa");
  });

  it("rejects whitespace-only description", () => {
    const errors = validate({ ...base, description: "   " });
    expect(errors.description).toBe("Informe a descrição da despesa");
  });

  it("rejects single-character description", () => {
    const errors = validate({ ...base, description: "X" });
    expect(errors.description).toMatch(/2 caracteres/);
  });

  it("rejects description longer than 200 chars", () => {
    const errors = validate({ ...base, description: "A".repeat(201) });
    expect(errors.description).toMatch(/200 caracteres/);
  });

  it("accepts description at boundary: 2 chars", () => {
    expect(isValid(validate({ ...base, description: "Ab" }))).toBe(true);
  });

  it("accepts description at boundary: 200 chars", () => {
    expect(isValid(validate({ ...base, description: "A".repeat(200) }))).toBe(
      true,
    );
  });
});

describe("ExpenseFormModal — amountCents validation", () => {
  it("accepts a valid positive amount", () => {
    expect(isValid(validate(base))).toBe(true);
  });

  it("rejects empty amountStr", () => {
    const errors = validate({ ...base, amountStr: "" });
    expect(errors.amountStr).toBe("Informe o valor da despesa");
  });

  it("rejects non-numeric amountStr", () => {
    const errors = validate({ ...base, amountStr: "abc" });
    expect(errors.amountStr).toBe("Informe o valor da despesa");
  });

  it("rejects zero amount", () => {
    const errors = validate({ ...base, amountStr: "0.00" });
    expect(errors.amountStr).toMatch(/maior que zero/);
  });

  it("rejects negative amount", () => {
    const errors = validate({ ...base, amountStr: "-100" });
    expect(errors.amountStr).toMatch(/maior que zero/);
  });

  it("converts '5000.00' correctly to 500000 cents (does not trigger error)", () => {
    const errors = validate({ ...base, amountStr: "5000.00" });
    expect(errors.amountStr).toBeUndefined();
  });

  it("accepts comma-decimal input '1490,50'", () => {
    const errors = validate({ ...base, amountStr: "1490,50" });
    expect(errors.amountStr).toBeUndefined();
  });

  it("accepts minimum valid amount of 0.01", () => {
    const errors = validate({ ...base, amountStr: "0.01" });
    expect(errors.amountStr).toBeUndefined();
  });
});

describe("ExpenseFormModal — date validation", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(isValid(validate(base))).toBe(true);
  });

  it("rejects empty date", () => {
    const errors = validate({ ...base, date: "" });
    expect(errors.date).toBe("Informe a data da despesa");
  });

  it("rejects date in DD/MM/YYYY format", () => {
    const errors = validate({ ...base, date: "01/03/2025" });
    expect(errors.date).toMatch(/inválida/i);
  });

  it("rejects ISO datetime string (time component present)", () => {
    const errors = validate({ ...base, date: "2025-03-01T00:00:00.000Z" });
    expect(errors.date).toMatch(/inválida/i);
  });

  it("accepts boundary date like 2000-01-01", () => {
    expect(isValid(validate({ ...base, date: "2000-01-01" }))).toBe(true);
  });
});

describe("ExpenseFormModal — combined validation", () => {
  it("collects errors for all invalid fields simultaneously", () => {
    const errors = validate({ description: "", amountStr: "", date: "" });
    expect(errors.description).toBeDefined();
    expect(errors.amountStr).toBeDefined();
    expect(errors.date).toBeDefined();
  });

  it("passes with all fields valid", () => {
    expect(
      isValid(
        validate({
          description: "Equipamento de treino",
          amountStr: "350.00",
          date: "2025-04-15",
        }),
      ),
    ).toBe(true);
  });
});
