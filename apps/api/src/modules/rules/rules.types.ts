export interface EscalationRequirements {
  /** Athlete must have bidRegistered=true on their active contract */
  requireBidRegistered: boolean;
  /** Athlete must have at least one ACTIVE contract */
  requireActiveContract: boolean;
  /**
   * Minimum days a contract must have been active before the athlete
   * is eligible for escalation. 0 = same-day escalation allowed.
   */
  minContractActiveDays: number;
}

export interface RuleSet {
  /**
   * Maximum age (inclusive) for FORMATIVE contract eligibility.
   * Null = no upper age limit enforced by this rule set.
   */
  maxAgeFormativeYears: number | null;
  /**
   * Maximum age (inclusive) for AMATEUR contract eligibility.
   * Null = no limit.
   */
  maxAgeAmateurYears: number | null;
  /** Minimum duration in days for any contract to be valid. Default: 30. */
  minContractDurationDays: number;
  /** Which contract types are permitted for escalation by this federation. */
  allowedContractTypesForEscalation: Array<
    "PROFESSIONAL" | "AMATEUR" | "FORMATIVE" | "LOAN"
  >;
  /** Rules that must be satisfied at time of escalation. */
  escalationRequirements: EscalationRequirements;
}

export interface RuleViolation {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationResult {
  eligible: boolean;
  violations: RuleViolation[];
}

/** Shape of athlete data passed into the validator. */
export interface AthleteSnapshot {
  id: string;
  birthDate: Date;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}

/** Shape of contract data passed into the validator. */
export interface ContractSnapshot {
  id: string;
  type: "PROFESSIONAL" | "AMATEUR" | "FORMATIVE" | "LOAN";
  status: "ACTIVE" | "EXPIRED" | "TERMINATED" | "SUSPENDED";
  startDate: Date;
  endDate: Date | null;
  bidRegistered: boolean;
}
