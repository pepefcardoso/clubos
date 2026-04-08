const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type OfxTrnType =
  | "DEBIT"
  | "CREDIT"
  | "INT"
  | "DIV"
  | "FEE"
  | "SRVCHG"
  | "ATM"
  | "POS"
  | "XFER"
  | "CHECK"
  | "PAYMENT"
  | "CASH"
  | "DIRECTDEP"
  | "DIRECTDEBIT"
  | "REPEATPMT"
  | "OTHER";

export type OfxAcctType =
  | "CHECKING"
  | "SAVINGS"
  | "MONEYMRKT"
  | "CREDITLINE"
  | "CD";

export interface OfxBankAccount {
  bankId: string;
  acctId: string;
  acctType: OfxAcctType;
}

export interface OfxTransaction {
  fitId: string;
  type: OfxTrnType;
  /** ISO 8601 string — JSON serialisation of the backend Date */
  postedAt: string;
  /** Signed integer cents; negative = debit/outflow */
  amountCents: number;
  description: string;
  checkNum?: string;
}

export interface ParsedOfxStatement {
  account: OfxBankAccount;
  /** ISO 4217 currency code, e.g. "BRL" */
  currency: string;
  /** ISO 8601 string */
  startDate: string;
  /** ISO 8601 string */
  endDate: string;
  transactions: OfxTransaction[];
  rawTransactionCount: number;
}

export type MatchConfidence = "high" | "medium";
export type MatchStatus = "matched" | "ambiguous" | "unmatched";

export interface MatchCandidate {
  chargeId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  /** YYYY-MM-DD */
  dueDate: string;
  status: "PENDING" | "OVERDUE";
  dateDeltaDays: number;
  confidence: MatchConfidence;
}

export interface TransactionMatchResult {
  fitId: string;
  transaction: OfxTransaction;
  matchStatus: MatchStatus;
  candidates: MatchCandidate[];
}

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

export interface ConfirmMatchPayload {
  fitId: string;
  chargeId: string;
  /** ISO 8601 */
  paidAt: string;
  method: string;
}

export interface ConfirmMatchResponse {
  paymentId: string;
  chargeId: string;
  paidAt: string;
  amountCents: number;
  memberStatusUpdated: boolean;
}

export class ReconciliationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReconciliationApiError";
  }
}

/**
 * Uploads an OFX file to the backend parse endpoint and returns the
 * structured bank statement. No DB writes occur — this is a pure parse
 * operation whose result feeds the matching UI.
 */
export async function uploadOfxFile(
  file: File,
  accessToken: string,
): Promise<ParsedOfxStatement> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const res = await fetch(`${API_BASE}/api/reconciliation/parse-ofx`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ReconciliationApiError(
      body.message ?? `Erro ao processar arquivo OFX: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<ParsedOfxStatement>;
}

/**
 * Sends parsed OFX transactions to the backend matching algorithm.
 * Returns automatic correspondence results against open charges.
 * Pure read — no DB writes.
 */
export async function matchOfxTransactions(
  transactions: OfxTransaction[],
  accessToken: string,
): Promise<MatchResponse> {
  const res = await fetch(`${API_BASE}/api/reconciliation/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ transactions }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ReconciliationApiError(
      body.message ?? `Erro ao processar correspondências: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<MatchResponse>;
}

/**
 * Confirms a single OFX ↔ Charge correspondence.
 * Creates a Payment, marks the Charge as PAID, restores Member status if needed.
 * Idempotent via fitId.
 */
export async function confirmReconciliationMatch(
  payload: ConfirmMatchPayload,
  accessToken: string,
): Promise<ConfirmMatchResponse> {
  const res = await fetch(`${API_BASE}/api/reconciliation/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ReconciliationApiError(
      body.message ?? `Erro ao confirmar pagamento: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<ConfirmMatchResponse>;
}
