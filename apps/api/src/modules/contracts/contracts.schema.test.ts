import { describe, it, expect } from "vitest";
import {
  CreateContractSchema,
  UpdateContractSchema,
  ListContractsQuerySchema,
} from "./contracts.schema.js";

describe("CreateContractSchema", () => {
  const valid = {
    athleteId: "athlete_abc123",
    type: "PROFESSIONAL",
    startDate: "2024-01-01",
  };

  it("accepts a minimal valid payload", () => {
    const result = CreateContractSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      endDate: "2025-12-31",
      bidRegistered: true,
      federationCode: "CBF-12345",
      notes: "Contract notes here",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.endDate).toBe("2025-12-31");
      expect(result.data.bidRegistered).toBe(true);
      expect(result.data.federationCode).toBe("CBF-12345");
    }
  });

  it("leaves bidRegistered undefined when omitted (default applied by service layer)", () => {
    const result = CreateContractSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bidRegistered).toBeUndefined();
  });

  it("rejects missing athleteId", () => {
    const { athleteId: _, ...rest } = valid;
    const result = CreateContractSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty athleteId", () => {
    const result = CreateContractSchema.safeParse({ ...valid, athleteId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid type value", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      type: "INTERNSHIP",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all four valid type values", () => {
    for (const type of [
      "PROFESSIONAL",
      "AMATEUR",
      "FORMATIVE",
      "LOAN",
    ] as const) {
      const result = CreateContractSchema.safeParse({ ...valid, type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects startDate in wrong format", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      startDate: "01/01/2024",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toMatch(/YYYY-MM-DD/);
  });

  it("rejects startDate as ISO datetime string", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      startDate: "2024-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects endDate in wrong format", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      endDate: "31-12-2025",
    });
    expect(result.success).toBe(false);
  });

  it("rejects federationCode longer than 100 characters", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      federationCode: "X".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes longer than 1000 characters", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      notes: "A".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes of exactly 1000 characters", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      notes: "A".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = CreateContractSchema.safeParse({
      ...valid,
      clubId: "should-be-stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("clubId");
  });

  it("does NOT include athleteId stripping — athleteId is required and passed through", () => {
    const result = CreateContractSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.athleteId).toBe(valid.athleteId);
  });
});

describe("UpdateContractSchema", () => {
  it("accepts an empty object (no fields required)", () => {
    expect(UpdateContractSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial update with only status", () => {
    const result = UpdateContractSchema.safeParse({ status: "EXPIRED" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("EXPIRED");
  });

  it("accepts all four valid status values", () => {
    for (const status of [
      "ACTIVE",
      "EXPIRED",
      "TERMINATED",
      "SUSPENDED",
    ] as const) {
      const result = UpdateContractSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status value", () => {
    const result = UpdateContractSchema.safeParse({ status: "OVERDUE" });
    expect(result.success).toBe(false);
  });

  it("accepts endDate: null (clears the field)", () => {
    const result = UpdateContractSchema.safeParse({ endDate: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.endDate).toBeNull();
  });

  it("accepts a valid endDate update", () => {
    const result = UpdateContractSchema.safeParse({ endDate: "2026-06-30" });
    expect(result.success).toBe(true);
  });

  it("rejects endDate in wrong format", () => {
    const result = UpdateContractSchema.safeParse({ endDate: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("accepts bidRegistered as boolean", () => {
    const result = UpdateContractSchema.safeParse({ bidRegistered: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bidRegistered).toBe(true);
  });

  it("accepts federationCode: null (clears the field)", () => {
    const result = UpdateContractSchema.safeParse({ federationCode: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.federationCode).toBeNull();
  });

  it("rejects federationCode longer than 100 characters", () => {
    const result = UpdateContractSchema.safeParse({
      federationCode: "X".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes: null (clears the field)", () => {
    const result = UpdateContractSchema.safeParse({ notes: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBeNull();
  });

  it("rejects notes longer than 1000 characters", () => {
    const result = UpdateContractSchema.safeParse({ notes: "A".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("does NOT include athleteId — athleteId is immutable post-creation", () => {
    const result = UpdateContractSchema.safeParse({ athleteId: "athlete_xyz" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("athleteId");
  });

  it("does NOT include type — type is immutable post-creation", () => {
    const result = UpdateContractSchema.safeParse({ type: "LOAN" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("type");
  });
});

describe("ListContractsQuerySchema", () => {
  it("applies defaults when no params are given", () => {
    const result = ListContractsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces page and limit from strings (query-string style)", () => {
    const result = ListContractsQuerySchema.safeParse({
      page: "3",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects page < 1", () => {
    expect(ListContractsQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects limit < 1", () => {
    expect(ListContractsQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
  });

  it("rejects limit > 100", () => {
    expect(ListContractsQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });

  it("accepts limit of exactly 100", () => {
    expect(ListContractsQuerySchema.safeParse({ limit: 100 }).success).toBe(
      true,
    );
  });

  it("accepts an optional athleteId filter", () => {
    const result = ListContractsQuerySchema.safeParse({
      athleteId: "athlete_abc",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.athleteId).toBe("athlete_abc");
  });

  it("accepts valid status filters", () => {
    for (const status of [
      "ACTIVE",
      "EXPIRED",
      "TERMINATED",
      "SUSPENDED",
    ] as const) {
      const result = ListContractsQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status filter", () => {
    expect(
      ListContractsQuerySchema.safeParse({ status: "DELETED" }).success,
    ).toBe(false);
  });
});
