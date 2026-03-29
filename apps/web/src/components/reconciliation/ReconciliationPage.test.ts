import { describe, it, expect } from "vitest";
import type {
  TransactionMatchResult,
  MatchCandidate,
} from "@/lib/api/reconciliation";

type MethodOverride = Record<
  string,
  "PIX" | "CASH" | "BANK_TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO"
>;

function getEffectiveChargeId(
  match: TransactionMatchResult,
  overrides: Record<string, string>,
): string | null {
  if (overrides[match.fitId]) return overrides[match.fitId]!;
  if (match.matchStatus === "matched")
    return match.candidates[0]?.chargeId ?? null;
  return null;
}

function getEffectiveMethod(
  fitId: string,
  methodOverrides: MethodOverride,
): MethodOverride[string] {
  return methodOverrides[fitId] ?? "PIX";
}

function filterConfirmable(
  matches: TransactionMatchResult[],
  selected: Set<string>,
  overrides: Record<string, string>,
): TransactionMatchResult[] {
  return matches.filter(
    (m) => selected.has(m.fitId) && getEffectiveChargeId(m, overrides) !== null,
  );
}

function makeCandidate(
  overrides: Partial<MatchCandidate> = {},
): MatchCandidate {
  return {
    chargeId: "charge-1",
    memberId: "member-1",
    memberName: "João Silva",
    amountCents: 8000,
    dueDate: "2025-01-15",
    status: "PENDING",
    dateDeltaDays: 0,
    confidence: "high",
    ...overrides,
  };
}

function makeMatch(
  overrides: Partial<TransactionMatchResult> = {},
): TransactionMatchResult {
  return {
    fitId: "FIT001",
    transaction: {
      fitId: "FIT001",
      type: "CREDIT",
      postedAt: "2025-01-15T12:00:00.000Z",
      amountCents: 8000,
      description: "PIX RECEBIDO",
    },
    matchStatus: "matched",
    candidates: [makeCandidate()],
    ...overrides,
  };
}

describe("getEffectiveChargeId — matched", () => {
  it("returns the first candidate's chargeId for a matched result", () => {
    const match = makeMatch({ matchStatus: "matched" });
    expect(getEffectiveChargeId(match, {})).toBe("charge-1");
  });

  it("returns null when matched but candidates array is empty", () => {
    const match = makeMatch({ matchStatus: "matched", candidates: [] });
    expect(getEffectiveChargeId(match, {})).toBeNull();
  });
});

describe("getEffectiveChargeId — ambiguous without override", () => {
  it("returns null when status is ambiguous and no override is set", () => {
    const match = makeMatch({
      matchStatus: "ambiguous",
      candidates: [makeCandidate(), makeCandidate({ chargeId: "charge-2" })],
    });
    expect(getEffectiveChargeId(match, {})).toBeNull();
  });
});

describe("getEffectiveChargeId — ambiguous with override", () => {
  it("returns the override chargeId when one is set", () => {
    const match = makeMatch({
      matchStatus: "ambiguous",
      candidates: [makeCandidate(), makeCandidate({ chargeId: "charge-2" })],
    });
    expect(getEffectiveChargeId(match, { FIT001: "charge-2" })).toBe(
      "charge-2",
    );
  });
});

describe("getEffectiveChargeId — unmatched", () => {
  it("returns null when status is unmatched and no override", () => {
    const match = makeMatch({ matchStatus: "unmatched", candidates: [] });
    expect(getEffectiveChargeId(match, {})).toBeNull();
  });

  it("returns override chargeId when user manually links an unmatched entry", () => {
    const match = makeMatch({ matchStatus: "unmatched", candidates: [] });
    expect(getEffectiveChargeId(match, { FIT001: "charge-manual" })).toBe(
      "charge-manual",
    );
  });
});

describe("getEffectiveChargeId — override takes priority over matched candidate", () => {
  it("returns override chargeId even when matchStatus is matched", () => {
    const match = makeMatch({ matchStatus: "matched" });
    expect(getEffectiveChargeId(match, { FIT001: "charge-override" })).toBe(
      "charge-override",
    );
  });
});

describe("getEffectiveMethod", () => {
  it("returns PIX as default when no override is set", () => {
    expect(getEffectiveMethod("FIT001", {})).toBe("PIX");
  });

  it("returns the overridden method when set", () => {
    expect(getEffectiveMethod("FIT001", { FIT001: "CASH" })).toBe("CASH");
  });

  it("returns default PIX for an unrelated fitId", () => {
    expect(getEffectiveMethod("FIT002", { FIT001: "CASH" })).toBe("PIX");
  });
});

describe("pre-selection logic", () => {
  it("pre-selects matched fitIds automatically", () => {
    const matches = [
      makeMatch({ fitId: "M1", matchStatus: "matched" }),
      makeMatch({ fitId: "A1", matchStatus: "ambiguous" }),
      makeMatch({ fitId: "U1", matchStatus: "unmatched" }),
    ];
    const preSelected = new Set(
      matches.filter((m) => m.matchStatus === "matched").map((m) => m.fitId),
    );
    expect(preSelected.has("M1")).toBe(true);
    expect(preSelected.has("A1")).toBe(false);
    expect(preSelected.has("U1")).toBe(false);
  });

  it("checkbox is disabled for unmatched when no override is set", () => {
    const match = makeMatch({ matchStatus: "unmatched", candidates: [] });
    const isConfirmable = getEffectiveChargeId(match, {}) !== null;
    expect(isConfirmable).toBe(false);
  });

  it("checkbox becomes enabled for unmatched when override is applied", () => {
    const match = makeMatch({ matchStatus: "unmatched", candidates: [] });
    const isConfirmable =
      getEffectiveChargeId(match, { [match.fitId]: "charge-manual" }) !== null;
    expect(isConfirmable).toBe(true);
  });
});

describe("confirmAll — filterConfirmable", () => {
  it("only confirms fitIds that are both selected and have an effective chargeId", () => {
    const matches = [
      makeMatch({ fitId: "M1", matchStatus: "matched" }),
      makeMatch({ fitId: "A1", matchStatus: "ambiguous", candidates: [] }),
      makeMatch({ fitId: "U1", matchStatus: "unmatched", candidates: [] }),
    ];
    const selected = new Set(["M1", "A1", "U1"]);
    const result = filterConfirmable(matches, selected, {});
    expect(result).toHaveLength(1);
    expect(result[0]?.fitId).toBe("M1");
  });

  it("includes an ambiguous entry if the user set an override and selected it", () => {
    const matches = [
      makeMatch({
        fitId: "A1",
        matchStatus: "ambiguous",
        candidates: [makeCandidate(), makeCandidate({ chargeId: "charge-2" })],
      }),
    ];
    const selected = new Set(["A1"]);
    const overrides = { A1: "charge-2" };
    const result = filterConfirmable(matches, selected, overrides);
    expect(result).toHaveLength(1);
    expect(result[0]?.fitId).toBe("A1");
  });

  it("excludes deselected rows even if they have an effective chargeId", () => {
    const matches = [makeMatch({ fitId: "M1", matchStatus: "matched" })];
    const selected = new Set<string>();
    const result = filterConfirmable(matches, selected, {});
    expect(result).toHaveLength(0);
  });
});
