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
 * operation whose result feeds the T-099 matching UI.
 *
 * The caller should retain the returned `ParsedOfxStatement` in component
 * state and pass `transactions[]` directly to the matching algorithm without
 * re-uploading the file.
 *
 * @param file        - The .ofx File object from an <input type="file"> element
 * @param accessToken - Bearer token from the AuthProvider
 *
 * @throws {ReconciliationApiError} on any 4xx / 5xx response
 *   - 400: file missing, wrong extension, or exceeds 2 MB
 *   - 403: authenticated user does not have ADMIN role
 *   - 422: file is recognisably OFX but failed to parse (content error)
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
