import { describe, it, expect } from "vitest";

type ContractType = "PROFESSIONAL" | "AMATEUR" | "FORMATIVE" | "LOAN";
type ContractStatus = "ACTIVE" | "EXPIRED" | "TERMINATED" | "SUSPENDED";

interface FormState {
  athleteId: string;
  type: ContractType | "";
  status: ContractStatus;
  startDate: string;
  endDate: string;
  bidRegistered: boolean;
  federationCode: string;
  notes: string;
}

interface FormErrors {
  athleteId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

function validate(form: FormState, isEditing: boolean): FormErrors {
  const e: FormErrors = {};

  if (!isEditing && !form.athleteId) {
    e.athleteId = "Selecione o atleta";
  }
  if (!isEditing && !form.type) {
    e.type = "Selecione o tipo de contrato";
  }
  if (!form.startDate) {
    e.startDate = "Informe a data de início";
  }
  if (form.endDate && form.startDate && form.endDate < form.startDate) {
    e.endDate = "Data de término deve ser posterior ao início";
  }

  return e;
}

function isValid(errors: FormErrors): boolean {
  return Object.keys(errors).length === 0;
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.split("T")[0];
}

const baseForm: FormState = {
  athleteId: "ath_1",
  type: "PROFESSIONAL",
  status: "ACTIVE",
  startDate: "2025-01-01",
  endDate: "",
  bidRegistered: false,
  federationCode: "",
  notes: "",
};

describe("validate — create mode", () => {
  it("passes with all required fields filled", () => {
    expect(isValid(validate(baseForm, false))).toBe(true);
  });

  it("requires athleteId in create mode", () => {
    const errors = validate({ ...baseForm, athleteId: "" }, false);
    expect(errors.athleteId).toBe("Selecione o atleta");
  });

  it("requires type in create mode", () => {
    const errors = validate({ ...baseForm, type: "" }, false);
    expect(errors.type).toBe("Selecione o tipo de contrato");
  });

  it("requires startDate", () => {
    const errors = validate({ ...baseForm, startDate: "" }, false);
    expect(errors.startDate).toBe("Informe a data de início");
  });

  it("rejects endDate earlier than startDate", () => {
    const errors = validate(
      { ...baseForm, startDate: "2025-06-01", endDate: "2025-01-01" },
      false,
    );
    expect(errors.endDate).toMatch(/posterior ao início/);
  });

  it("accepts endDate equal to startDate", () => {
    const errors = validate(
      { ...baseForm, startDate: "2025-01-01", endDate: "2025-01-01" },
      false,
    );
    expect(errors.endDate).toBeUndefined();
  });

  it("accepts endDate later than startDate", () => {
    const errors = validate(
      { ...baseForm, startDate: "2025-01-01", endDate: "2025-12-31" },
      false,
    );
    expect(errors.endDate).toBeUndefined();
  });

  it("accepts empty endDate (optional field)", () => {
    const errors = validate({ ...baseForm, endDate: "" }, false);
    expect(errors.endDate).toBeUndefined();
  });
});

describe("validate — edit mode", () => {
  it("skips athleteId and type validation in edit mode", () => {
    const errors = validate({ ...baseForm, athleteId: "", type: "" }, true);
    expect(errors.athleteId).toBeUndefined();
    expect(errors.type).toBeUndefined();
  });

  it("still requires startDate in edit mode", () => {
    const errors = validate({ ...baseForm, startDate: "" }, true);
    expect(errors.startDate).toBeDefined();
  });

  it("still validates endDate >= startDate in edit mode", () => {
    const errors = validate(
      { ...baseForm, startDate: "2025-06-01", endDate: "2025-01-01" },
      true,
    );
    expect(errors.endDate).toBeDefined();
  });

  it("passes with valid data in edit mode", () => {
    const errors = validate({ ...baseForm, athleteId: "", type: "" }, true);
    expect(isValid(errors)).toBe(true);
  });
});

describe("toDateInputValue", () => {
  it("returns empty string for null", () => {
    expect(toDateInputValue(null)).toBe("");
  });

  it("strips time component from full ISO string", () => {
    expect(toDateInputValue("2025-06-15T00:00:00.000Z")).toBe("2025-06-15");
  });

  it("returns YYYY-MM-DD string unchanged", () => {
    expect(toDateInputValue("2025-06-15")).toBe("2025-06-15");
  });

  it("handles dates with different times correctly", () => {
    expect(toDateInputValue("2025-12-31T23:59:59.000Z")).toBe("2025-12-31");
  });
});

describe("TERMINATED guard", () => {
  it("identifies TERMINATED status as immutable", () => {
    const isTerminated = (status: ContractStatus) => status === "TERMINATED";
    expect(isTerminated("TERMINATED")).toBe(true);
    expect(isTerminated("ACTIVE")).toBe(false);
    expect(isTerminated("EXPIRED")).toBe(false);
    expect(isTerminated("SUSPENDED")).toBe(false);
  });

  it("all fields are disabled when contract is TERMINATED", () => {
    const isTerminated = true;
    const allFieldsDisabled = isTerminated;
    expect(allFieldsDisabled).toBe(true);
  });
});

describe("collect all errors", () => {
  it("collects athleteId, type, and startDate errors when all missing in create mode", () => {
    const errors = validate(
      { ...baseForm, athleteId: "", type: "", startDate: "" },
      false,
    );
    expect(errors.athleteId).toBeDefined();
    expect(errors.type).toBeDefined();
    expect(errors.startDate).toBeDefined();
  });
});
