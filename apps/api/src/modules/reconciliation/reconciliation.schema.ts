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
