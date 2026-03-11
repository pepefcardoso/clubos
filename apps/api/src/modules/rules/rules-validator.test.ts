/**
 * Unit tests for rules-validator.ts
 *
 * The validator is a pure function with no I/O — zero mocks required.
 * All tests construct snapshots inline and assert on the returned ValidationResult.
 *
 * Coverage targets:
 *   - Every violation code (7 unique codes)
 *   - Short-circuit on NO_ACTIVE_CONTRACT
 *   - Multiple simultaneous violations
 *   - asOf injection for deterministic date-sensitive tests
 *   - calculateAgeAtDate: before, on, and after birthday in reference year
 *   - contractActiveDays: basic, zero-day, and negative-clamping cases
 */

import { describe, it, expect } from "vitest";
import {
  validateAthleteEligibility,
  calculateAgeAtDate,
  contractActiveDays,
} from "./rules-validator.js";
import type {
  AthleteSnapshot,
  ContractSnapshot,
  RuleSet,
} from "./rules.types.js";

const BASE_RULES: RuleSet = {
  maxAgeFormativeYears: 20,
  maxAgeAmateurYears: 23,
  minContractDurationDays: 30,
  allowedContractTypesForEscalation: [
    "PROFESSIONAL",
    "AMATEUR",
    "FORMATIVE",
    "LOAN",
  ],
  escalationRequirements: {
    requireBidRegistered: true,
    requireActiveContract: true,
    minContractActiveDays: 1,
  },
};

/** An athlete who turns 19 on 2000-06-15; reference date 2025-01-01 → age 24 */
const ACTIVE_ATHLETE: AthleteSnapshot = {
  id: "athlete-1",
  birthDate: new Date("2001-01-01"),
  status: "ACTIVE",
};

const PROFESSIONAL_CONTRACT: ContractSnapshot = {
  id: "contract-1",
  type: "PROFESSIONAL",
  status: "ACTIVE",
  startDate: new Date("2025-01-01"),
  endDate: new Date("2026-01-01"),
  bidRegistered: true,
};

const AS_OF = new Date("2025-06-01");

describe("calculateAgeAtDate()", () => {
  it("returns correct age before the birthday in the reference year", () => {
    expect(
      calculateAgeAtDate(new Date("2000-07-01"), new Date("2025-06-01")),
    ).toBe(24);
  });

  it("returns correct age on the exact birthday", () => {
    expect(
      calculateAgeAtDate(new Date("2000-06-01"), new Date("2025-06-01")),
    ).toBe(25);
  });

  it("returns correct age after the birthday in the reference year", () => {
    expect(
      calculateAgeAtDate(new Date("2000-05-01"), new Date("2025-06-01")),
    ).toBe(25);
  });

  it("handles a leap-year birthday (Feb 29) correctly", () => {
    expect(
      calculateAgeAtDate(new Date("2000-02-29"), new Date("2025-03-01")),
    ).toBe(25);
  });

  it("returns 0 for a newborn on their birth date", () => {
    const d = new Date("2025-06-01");
    expect(calculateAgeAtDate(d, d)).toBe(0);
  });
});

describe("contractActiveDays()", () => {
  it("returns correct days for a 365-day span", () => {
    expect(
      contractActiveDays(new Date("2025-01-01"), new Date("2026-01-01")),
    ).toBe(365);
  });

  it("returns 0 when start and reference are the same date", () => {
    const d = new Date("2025-06-01");
    expect(contractActiveDays(d, d)).toBe(0);
  });

  it("clamps negative values to 0 (reference before startDate)", () => {
    expect(
      contractActiveDays(new Date("2025-06-01"), new Date("2025-01-01")),
    ).toBe(0);
  });

  it("returns 1 for a one-day span", () => {
    expect(
      contractActiveDays(new Date("2025-06-01"), new Date("2025-06-02")),
    ).toBe(1);
  });
});

describe("validateAthleteEligibility() — happy path", () => {
  it("returns eligible=true and empty violations for a fully compliant athlete", () => {
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      PROFESSIONAL_CONTRACT,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("is eligible when requireBidRegistered=false even with bidRegistered=false", () => {
    const rules: RuleSet = {
      ...BASE_RULES,
      escalationRequirements: {
        ...BASE_RULES.escalationRequirements,
        requireBidRegistered: false,
      },
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      bidRegistered: false,
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      AS_OF,
    );
    expect(result.eligible).toBe(true);
    expect(
      result.violations.find((v) => v.code === "BID_NOT_REGISTERED"),
    ).toBeUndefined();
  });

  it("is eligible when requireActiveContract=false and no contract provided", () => {
    const rules: RuleSet = {
      ...BASE_RULES,
      escalationRequirements: {
        ...BASE_RULES.escalationRequirements,
        requireActiveContract: false,
      },
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      null,
      rules,
      AS_OF,
    );
    expect(result.eligible).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("is eligible when contract has null endDate (open-ended contract)", () => {
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      startDate: new Date("2025-01-01"),
      endDate: null,
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(true);
  });
});

describe("validateAthleteEligibility() — violation: ATHLETE_NOT_ACTIVE", () => {
  it("returns ATHLETE_NOT_ACTIVE for a SUSPENDED athlete", () => {
    const athlete: AthleteSnapshot = { ...ACTIVE_ATHLETE, status: "SUSPENDED" };
    const result = validateAthleteEligibility(
      athlete,
      PROFESSIONAL_CONTRACT,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find((v) => v.code === "ATHLETE_NOT_ACTIVE");
    expect(v).toBeDefined();
    expect(v?.field).toBe("status");
    expect(v?.message).toContain("suspenso");
  });

  it("returns ATHLETE_NOT_ACTIVE for an INACTIVE athlete", () => {
    const athlete: AthleteSnapshot = { ...ACTIVE_ATHLETE, status: "INACTIVE" };
    const result = validateAthleteEligibility(
      athlete,
      PROFESSIONAL_CONTRACT,
      BASE_RULES,
      AS_OF,
    );
    const v = result.violations.find((v) => v.code === "ATHLETE_NOT_ACTIVE");
    expect(v).toBeDefined();
    expect(v?.message).toContain("inativo");
  });
});

describe("validateAthleteEligibility() — violation: NO_ACTIVE_CONTRACT", () => {
  it("returns NO_ACTIVE_CONTRACT and short-circuits when contract is null", () => {
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      null,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain("NO_ACTIVE_CONTRACT");
    expect(codes).not.toContain("BID_NOT_REGISTERED");
    expect(codes).not.toContain("CONTRACT_TYPE_NOT_ALLOWED");
  });
});

describe("validateAthleteEligibility() — violation: BID_NOT_REGISTERED", () => {
  it("returns BID_NOT_REGISTERED when bidRegistered=false and requireBidRegistered=true", () => {
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      bidRegistered: false,
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find((v) => v.code === "BID_NOT_REGISTERED");
    expect(v).toBeDefined();
    expect(v?.field).toBe("contract.bidRegistered");
  });
});

describe("validateAthleteEligibility() — violation: CONTRACT_TYPE_NOT_ALLOWED", () => {
  it("returns CONTRACT_TYPE_NOT_ALLOWED when contract type is excluded", () => {
    const rules: RuleSet = {
      ...BASE_RULES,
      allowedContractTypesForEscalation: ["PROFESSIONAL"],
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "AMATEUR",
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find(
      (v) => v.code === "CONTRACT_TYPE_NOT_ALLOWED",
    );
    expect(v).toBeDefined();
    expect(v?.field).toBe("contract.type");
    expect(v?.message).toContain("AMATEUR");
  });
});

describe("validateAthleteEligibility() — violation: CONTRACT_TOO_NEW", () => {
  it("returns CONTRACT_TOO_NEW when minContractActiveDays not yet met", () => {
    const rules: RuleSet = {
      ...BASE_RULES,
      escalationRequirements: {
        ...BASE_RULES.escalationRequirements,
        minContractActiveDays: 30,
      },
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      startDate: new Date("2025-05-27"),
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find((v) => v.code === "CONTRACT_TOO_NEW");
    expect(v).toBeDefined();
    expect(v?.field).toBe("contract.startDate");
    expect(v?.message).toContain("5 dia");
  });

  it("does NOT return CONTRACT_TOO_NEW when exactly at the threshold", () => {
    const rules: RuleSet = {
      ...BASE_RULES,
      escalationRequirements: {
        ...BASE_RULES.escalationRequirements,
        minContractActiveDays: 5,
      },
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      startDate: new Date("2025-05-27"),
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      AS_OF,
    );
    const v = result.violations.find((v) => v.code === "CONTRACT_TOO_NEW");
    expect(v).toBeUndefined();
  });
});

describe("validateAthleteEligibility() — violation: CONTRACT_DURATION_TOO_SHORT", () => {
  it("returns CONTRACT_DURATION_TOO_SHORT when total duration is below minimum", () => {
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-15"),
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find(
      (v) => v.code === "CONTRACT_DURATION_TOO_SHORT",
    );
    expect(v).toBeDefined();
    expect(v?.field).toBe("contract.endDate");
    expect(v?.message).toContain("14 dias");
  });
});

describe("validateAthleteEligibility() — violation: AGE_EXCEEDS_FORMATIVE_LIMIT", () => {
  it("returns AGE_EXCEEDS_FORMATIVE_LIMIT for a 21-year-old on a FORMATIVE contract", () => {
    const athlete: AthleteSnapshot = {
      ...ACTIVE_ATHLETE,
      birthDate: new Date("2003-01-01"),
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "FORMATIVE",
    };
    const result = validateAthleteEligibility(
      athlete,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find(
      (v) => v.code === "AGE_EXCEEDS_FORMATIVE_LIMIT",
    );
    expect(v).toBeDefined();
    expect(v?.field).toBe("birthDate");
    expect(v?.message).toContain("20 anos");
  });

  it("does NOT return AGE_EXCEEDS_FORMATIVE_LIMIT when exactly at limit", () => {
    const athlete: AthleteSnapshot = {
      ...ACTIVE_ATHLETE,
      birthDate: new Date("2005-06-01"),
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "FORMATIVE",
    };
    const result = validateAthleteEligibility(
      athlete,
      contract,
      BASE_RULES,
      AS_OF,
    );
    const v = result.violations.find(
      (v) => v.code === "AGE_EXCEEDS_FORMATIVE_LIMIT",
    );
    expect(v).toBeUndefined();
  });

  it("skips FORMATIVE age check when maxAgeFormativeYears is null", () => {
    const rules: RuleSet = { ...BASE_RULES, maxAgeFormativeYears: null };
    const athlete: AthleteSnapshot = {
      ...ACTIVE_ATHLETE,
      birthDate: new Date("1990-01-01"),
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "FORMATIVE",
    };
    const result = validateAthleteEligibility(athlete, contract, rules, AS_OF);
    const v = result.violations.find(
      (v) => v.code === "AGE_EXCEEDS_FORMATIVE_LIMIT",
    );
    expect(v).toBeUndefined();
  });
});

describe("validateAthleteEligibility() — violation: AGE_EXCEEDS_AMATEUR_LIMIT", () => {
  it("returns AGE_EXCEEDS_AMATEUR_LIMIT for a 24-year-old on an AMATEUR contract", () => {
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "AMATEUR",
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const v = result.violations.find(
      (v) => v.code === "AGE_EXCEEDS_AMATEUR_LIMIT",
    );
    expect(v).toBeDefined();
    expect(v?.field).toBe("birthDate");
    expect(v?.message).toContain("23 anos");
  });

  it("skips AMATEUR age check when maxAgeAmateurYears is null", () => {
    const rules: RuleSet = { ...BASE_RULES, maxAgeAmateurYears: null };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "AMATEUR",
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      AS_OF,
    );
    const v = result.violations.find(
      (v) => v.code === "AGE_EXCEEDS_AMATEUR_LIMIT",
    );
    expect(v).toBeUndefined();
  });
});

describe("validateAthleteEligibility() — multiple violations", () => {
  it("returns multiple violations when several rules fail simultaneously", () => {
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "AMATEUR",
      bidRegistered: false,
    };
    const result = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain("BID_NOT_REGISTERED");
    expect(codes).toContain("AGE_EXCEEDS_AMATEUR_LIMIT");
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("combines ATHLETE_NOT_ACTIVE with contract violations", () => {
    const athlete: AthleteSnapshot = { ...ACTIVE_ATHLETE, status: "SUSPENDED" };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      bidRegistered: false,
    };
    const result = validateAthleteEligibility(
      athlete,
      contract,
      BASE_RULES,
      AS_OF,
    );
    expect(result.eligible).toBe(false);
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain("ATHLETE_NOT_ACTIVE");
    expect(codes).toContain("BID_NOT_REGISTERED");
  });
});

describe("validateAthleteEligibility() — asOf injection", () => {
  it("uses asOf for age calculation — same athlete is eligible at one date, not at another", () => {
    const athlete: AthleteSnapshot = {
      ...ACTIVE_ATHLETE,
      birthDate: new Date("2004-06-02"),
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      type: "FORMATIVE",
    };

    const dayBefore = new Date("2025-06-01");
    const resultBefore = validateAthleteEligibility(
      athlete,
      contract,
      BASE_RULES,
      dayBefore,
    );
    expect(
      resultBefore.violations.find(
        (v) => v.code === "AGE_EXCEEDS_FORMATIVE_LIMIT",
      ),
    ).toBeUndefined();

    const birthday = new Date("2025-06-02");
    const resultOnDay = validateAthleteEligibility(
      athlete,
      contract,
      BASE_RULES,
      birthday,
    );
    expect(
      resultOnDay.violations.find(
        (v) => v.code === "AGE_EXCEEDS_FORMATIVE_LIMIT",
      ),
    ).toBeDefined();
  });

  it("uses asOf for CONTRACT_TOO_NEW check", () => {
    const rules: RuleSet = {
      ...BASE_RULES,
      escalationRequirements: {
        ...BASE_RULES.escalationRequirements,
        minContractActiveDays: 10,
      },
    };
    const contract: ContractSnapshot = {
      ...PROFESSIONAL_CONTRACT,
      startDate: new Date("2025-05-25"),
    };

    const tooSoon = new Date("2025-05-31");
    const r1 = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      tooSoon,
    );
    expect(
      r1.violations.find((v) => v.code === "CONTRACT_TOO_NEW"),
    ).toBeDefined();

    const exactDay = new Date("2025-06-04");
    const r2 = validateAthleteEligibility(
      ACTIVE_ATHLETE,
      contract,
      rules,
      exactDay,
    );
    expect(
      r2.violations.find((v) => v.code === "CONTRACT_TOO_NEW"),
    ).toBeUndefined();
  });
});
