import { describe, it, expect } from "vitest";

interface FormState {
  name: string;
  cpf: string;
  phone: string;
  email: string;
  planId: string;
  joinedAt: string;
}

interface FormErrors {
  name?: string;
  cpf?: string;
  phone?: string;
  email?: string;
}

const stripNonDigits = (v: string) => v.replace(/\D/g, "");

function validate(form: FormState, isEditing: boolean): FormErrors {
  const e: FormErrors = {};

  if (!form.name.trim()) {
    e.name = "Informe o nome do sócio";
  } else if (form.name.trim().length < 2) {
    e.name = "Nome deve ter pelo menos 2 caracteres";
  } else if (form.name.trim().length > 120) {
    e.name = "Nome deve ter no máximo 120 caracteres";
  }

  if (!isEditing) {
    if (!form.cpf) {
      e.cpf = "Informe o CPF";
    } else if (form.cpf.length !== 11) {
      e.cpf = "CPF deve ter exatamente 11 dígitos";
    }
  }

  if (!form.phone) {
    e.phone = "Informe o telefone";
  } else if (form.phone.length < 10 || form.phone.length > 11) {
    e.phone = "Telefone deve ter 10 ou 11 dígitos";
  }

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    e.email = "Informe um e-mail válido";
  }

  return e;
}

function isValid(errors: FormErrors) {
  return Object.keys(errors).length === 0;
}

const base: FormState = {
  name: "João da Silva",
  cpf: "12345678900",
  phone: "11999990000",
  email: "",
  planId: "",
  joinedAt: "2025-01-01",
};

describe("stripNonDigits", () => {
  it("removes hyphens and dots from CPF", () => {
    expect(stripNonDigits("123.456.789-00")).toBe("12345678900");
  });

  it("removes parentheses and spaces from phone", () => {
    expect(stripNonDigits("(11) 99999-0000")).toBe("11999990000");
  });

  it("returns empty string for all non-digits", () => {
    expect(stripNonDigits("abc-def")).toBe("");
  });

  it("leaves pure digit string unchanged", () => {
    expect(stripNonDigits("11999990000")).toBe("11999990000");
  });
});

describe("MemberFormModal — name validation", () => {
  it("passes with a valid name", () => {
    expect(isValid(validate(base, false))).toBe(true);
  });

  it("rejects empty name", () => {
    const errors = validate({ ...base, name: "" }, false);
    expect(errors.name).toBe("Informe o nome do sócio");
  });

  it("rejects whitespace-only name", () => {
    const errors = validate({ ...base, name: "   " }, false);
    expect(errors.name).toBe("Informe o nome do sócio");
  });

  it("rejects single-character name", () => {
    const errors = validate({ ...base, name: "A" }, false);
    expect(errors.name).toMatch(/2 caracteres/);
  });

  it("rejects name longer than 120 chars", () => {
    const errors = validate({ ...base, name: "A".repeat(121) }, false);
    expect(errors.name).toMatch(/120 caracteres/);
  });

  it("accepts name at boundary: 2 chars", () => {
    expect(isValid(validate({ ...base, name: "Jo" }, false))).toBe(true);
  });

  it("accepts name at boundary: 120 chars", () => {
    expect(isValid(validate({ ...base, name: "A".repeat(120) }, false))).toBe(
      true,
    );
  });
});

describe("MemberFormModal — CPF validation (create mode)", () => {
  it("rejects missing CPF in create mode", () => {
    const errors = validate({ ...base, cpf: "" }, false);
    expect(errors.cpf).toBe("Informe o CPF");
  });

  it("rejects CPF with fewer than 11 digits", () => {
    const errors = validate({ ...base, cpf: "1234567890" }, false);
    expect(errors.cpf).toMatch(/11 dígitos/);
  });

  it("rejects CPF with more than 11 digits", () => {
    const errors = validate({ ...base, cpf: "123456789012" }, false);
    expect(errors.cpf).toMatch(/11 dígitos/);
  });

  it("accepts CPF with exactly 11 digits", () => {
    const errors = validate({ ...base, cpf: "12345678900" }, false);
    expect(errors.cpf).toBeUndefined();
  });

  it("skips CPF validation in edit mode", () => {
    const errors = validate({ ...base, cpf: "" }, true);
    expect(errors.cpf).toBeUndefined();
  });
});

describe("MemberFormModal — phone validation", () => {
  it("rejects empty phone", () => {
    const errors = validate({ ...base, phone: "" }, false);
    expect(errors.phone).toBe("Informe o telefone");
  });

  it("rejects phone shorter than 10 digits", () => {
    const errors = validate({ ...base, phone: "119999900" }, false);
    expect(errors.phone).toMatch(/10 ou 11/);
  });

  it("rejects phone longer than 11 digits", () => {
    const errors = validate({ ...base, phone: "119999900001" }, false);
    expect(errors.phone).toMatch(/10 ou 11/);
  });

  it("accepts landline (10 digits)", () => {
    const errors = validate({ ...base, phone: "1133334444" }, false);
    expect(errors.phone).toBeUndefined();
  });

  it("accepts mobile (11 digits)", () => {
    const errors = validate({ ...base, phone: "11999990000" }, false);
    expect(errors.phone).toBeUndefined();
  });
});

describe("MemberFormModal — email validation", () => {
  it("skips validation when email is empty (optional field)", () => {
    const errors = validate({ ...base, email: "" }, false);
    expect(errors.email).toBeUndefined();
  });

  it("accepts a valid email", () => {
    const errors = validate({ ...base, email: "joao@clube.com" }, false);
    expect(errors.email).toBeUndefined();
  });

  it("rejects email without @", () => {
    const errors = validate({ ...base, email: "notanemail" }, false);
    expect(errors.email).toMatch(/e-mail/i);
  });

  it("rejects email without domain part", () => {
    const errors = validate({ ...base, email: "user@" }, false);
    expect(errors.email).toBeDefined();
  });

  it("rejects email without TLD", () => {
    const errors = validate({ ...base, email: "user@domain" }, false);
    expect(errors.email).toBeDefined();
  });
});

describe("MemberFormModal — edit mode", () => {
  it("passes with valid data in edit mode (no CPF required)", () => {
    const errors = validate({ ...base, cpf: "" }, true);
    expect(isValid(errors)).toBe(true);
  });

  it("collects all errors when all required fields are empty", () => {
    const errors = validate({ ...base, name: "", cpf: "", phone: "" }, false);
    expect(errors.name).toBeDefined();
    expect(errors.cpf).toBeDefined();
    expect(errors.phone).toBeDefined();
  });
});
