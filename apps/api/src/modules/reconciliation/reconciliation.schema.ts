import { z } from "zod";

export const OFX_TRNTYPE = [
  "DEBIT",
  "CREDIT",
  "INT",
  "DIV",
  "FEE",
  "SRVCHG",
  "ATM",
  "POS",
  "XFER",
  "CHECK",
  "PAYMENT",
  "CASH",
  "DIRECTDEP",
  "DIRECTDEBIT",
  "REPEATPMT",
  "OTHER",
] as const;

export type OfxTrnType = (typeof OFX_TRNTYPE)[number];

export const OFX_ACCTTYPE = [
  "CHECKING",
  "SAVINGS",
  "MONEYMRKT",
  "CREDITLINE",
  "CD",
] as const;

export type OfxAcctType = (typeof OFX_ACCTTYPE)[number];

export interface OfxBankAccount {
  bankId: string;
  acctId: string;
  acctType: OfxAcctType;
}

export interface OfxTransaction {
  fitId: string;
  type: OfxTrnType;
  postedAt: Date;
  amountCents: number;
  description: string;
  checkNum?: string;
}

export interface ParsedOfxStatement {
  account: OfxBankAccount;
  currency: string;
  startDate: Date;
  endDate: Date;
  transactions: OfxTransaction[];
  rawTransactionCount: number;
}

export const ParsedOfxStatementSchema = z.object({
  account: z.object({
    bankId: z.string(),
    acctId: z.string(),
    acctType: z.enum(OFX_ACCTTYPE),
  }),
  currency: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  transactions: z.array(
    z.object({
      fitId: z.string(),
      type: z.enum(OFX_TRNTYPE),
      postedAt: z.date(),
      amountCents: z.number().int(),
      description: z.string(),
      checkNum: z.string().optional(),
    }),
  ),
  rawTransactionCount: z.number().int(),
});

/** Degree of confidence in an automatic match. */
export type MatchConfidence = "high" | "medium";

/** Status of the correspondence for an OFX transaction. */
export type MatchStatus = "matched" | "ambiguous" | "unmatched";

/** A charge candidate for receiving the OFX transaction. */
export interface MatchCandidate {
  chargeId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  /** ISO string YYYY-MM-DD */
  dueDate: string;
  status: "PENDING" | "OVERDUE";
  /** Absolute number of days between transaction.postedAt and charge.dueDate */
  dateDeltaDays: number;
  confidence: MatchConfidence;
}

/** Match result for a single OFX transaction. */
export interface TransactionMatchResult {
  fitId: string;
  transaction: OfxTransaction;
  matchStatus: MatchStatus;
  /** Ordered by confidence desc, dateDeltaDays asc */
  candidates: MatchCandidate[];
}

/** Input body for POST /api/reconciliation/match */
export interface MatchRequestBody {
  transactions: OfxTransaction[];
}

/** Response from POST /api/reconciliation/match */
export interface MatchResponse {
  matches: TransactionMatchResult[];
  summary: {
    total: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    skippedDebits: number;
  };
}

/** Input body for POST /api/reconciliation/confirm */
export interface ConfirmMatchBody {
  /** Used as gatewayTxid for idempotency */
  fitId: string;
  chargeId: string;
  /** ISO 8601 — timestamp when the bank registered the credit */
  paidAt: string;
  method:
    | "PIX"
    | "CASH"
    | "BANK_TRANSFER"
    | "CREDIT_CARD"
    | "DEBIT_CARD"
    | "BOLETO";
}

/** Response from POST /api/reconciliation/confirm */
export interface ConfirmMatchResponse {
  paymentId: string;
  chargeId: string;
  paidAt: string;
  amountCents: number;
  memberStatusUpdated: boolean;
}

const OfxTransactionSchema = z.object({
  fitId: z.string().min(1),
  type: z.enum(OFX_TRNTYPE),
  postedAt: z.string().datetime(),
  amountCents: z.number().int(),
  description: z.string(),
  checkNum: z.string().optional(),
});

export const MatchRequestSchema = z.object({
  transactions: z
    .array(OfxTransactionSchema)
    .min(1, "Pelo menos uma transação é obrigatória")
    .max(500, "Máximo de 500 transações por requisição"),
});

export const ConfirmMatchSchema = z.object({
  fitId: z.string().min(1).max(200),
  chargeId: z.string().min(1),
  paidAt: z.string().datetime(),
  method: z.enum([
    "PIX",
    "CASH",
    "BANK_TRANSFER",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "BOLETO",
  ]),
});

/**
 * Thrown by the OFX parser for all invalid or unrecognised file content.
 * Caught explicitly by the route handler and mapped to HTTP 422.
 * Does NOT extend AppError — the route handler is responsible for the response,
 * so this error never reaches the global Sentry handler.
 */
export class OfxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfxParseError";
  }
}
