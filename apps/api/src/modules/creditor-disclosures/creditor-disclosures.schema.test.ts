import { describe, it, expect } from "vitest";
import {
  CreateCreditorDisclosureSchema,
  UpdateCreditorStatusSchema,
  ListCreditorDisclosuresQuerySchema,
} from "./creditor-disclosures.schema.js";

describe("CreateCreditorDisclosureSchema", () => {
  const VALID = {
    creditorName: "João Silva",
    amountCents: 1500000,
    dueDate: "2025-06-01",
  };

  it("accepts a valid minimal input (no description)", () => {
    expect(CreateCreditorDisclosureSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a valid input with description", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      description: "Rescisão contratual",
    });
    expect(result.success).toBe(true);
  });

  it("rejects amountCents: 0", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      amountCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amountCents", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      amountCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer amountCents (float)", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      amountCents: 1500.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects creditorName shorter than 2 characters", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      creditorName: "J",
    });
    expect(result.success).toBe(false);
  });

  it("rejects creditorName longer than 200 characters", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      creditorName: "A".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid dueDate format (YYYY/MM/DD)", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      dueDate: "2025/06/01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dueDate that is not a date string", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      dueDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing dueDate", () => {
    const { dueDate: _, ...withoutDueDate } = VALID;
    const result = CreateCreditorDisclosureSchema.safeParse(withoutDueDate);
    expect(result.success).toBe(false);
  });

  it("rejects description longer than 500 characters", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      description: "X".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("passes when description is exactly 500 characters", () => {
    const result = CreateCreditorDisclosureSchema.safeParse({
      ...VALID,
      description: "X".repeat(500),
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateCreditorStatusSchema", () => {
  it('accepts status "SETTLED"', () => {
    expect(
      UpdateCreditorStatusSchema.safeParse({ status: "SETTLED" }).success,
    ).toBe(true);
  });

  it('accepts status "DISPUTED"', () => {
    expect(
      UpdateCreditorStatusSchema.safeParse({ status: "DISPUTED" }).success,
    ).toBe(true);
  });

  it('rejects status "PENDING" — cannot revert to PENDING', () => {
    const result = UpdateCreditorStatusSchema.safeParse({ status: "PENDING" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status value", () => {
    const result = UpdateCreditorStatusSchema.safeParse({
      status: "CANCELLED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty object (status required)", () => {
    const result = UpdateCreditorStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("ListCreditorDisclosuresQuerySchema", () => {
  it("applies default page=1 and limit=20 when not provided", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string page to number", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({ page: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it("rejects limit > 100", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      limit: "101",
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit < 1", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it('accepts status filter "PENDING"', () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      status: "PENDING",
    });
    expect(result.success).toBe(true);
  });

  it('accepts status filter "SETTLED"', () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      status: "SETTLED",
    });
    expect(result.success).toBe(true);
  });

  it('accepts status filter "DISPUTED"', () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      status: "DISPUTED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status filter", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      status: "UNKNOWN",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid dueDateFrom in YYYY-MM-DD format", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      dueDateFrom: "2025-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects dueDateFrom in invalid format", () => {
    const result = ListCreditorDisclosuresQuerySchema.safeParse({
      dueDateFrom: "01/01/2025",
    });
    expect(result.success).toBe(false);
  });
});
