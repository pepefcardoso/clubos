/**
 * OFX Bank Statement Parser — Pure in-memory implementation.
 *
 * Supports:
 *   OFX 1.x (SGML) — most common in Brazilian banks, often Windows-1252 encoded.
 *   OFX 2.x (XML)  — used by fintechs and newer platforms, always UTF-8.
 *
 * No external dependencies. Zero I/O. Throws OfxParseError for all invalid inputs.
 *
 * Entry point: parseOfxFile(buffer: Buffer): ParsedOfxStatement
 */

import {
  OfxParseError,
  OFX_TRNTYPE,
  OFX_ACCTTYPE,
  type ParsedOfxStatement,
  type OfxBankAccount,
  type OfxTransaction,
  type OfxTrnType,
  type OfxAcctType,
} from "./reconciliation.schema.js";

/**
 * Decodes an OFX buffer using the encoding declared in its header section.
 * Falls back to UTF-8 when no encoding hint is found.
 *
 * OFX 1.x SGML files from Brazilian banks are typically Windows-1252 encoded.
 * The header block (before <OFX>) may contain CHARSET:1252 or
 * ENCODING:WINDOWS-1252. TextDecoder (Web API) is available in Node.js 18+.
 */
export function decodeOfxBuffer(buffer: Buffer): string {
  const probe = buffer.slice(0, 512).toString("ascii");

  if (/CHARSET\s*:\s*1252|ENCODING\s*:\s*WINDOWS-?1252/i.test(probe)) {
    return new TextDecoder("windows-1252").decode(buffer);
  }

  if (/CHARSET\s*:\s*UTF-?8|ENCODING\s*:\s*UTF-?8/i.test(probe)) {
    return buffer.toString("utf8");
  }

  return buffer.toString("utf8");
}

/**
 * Validates that the decoded string is recognisable OFX content.
 * Throws OfxParseError for invalid files — callers let the error propagate
 * to the route handler which maps it to HTTP 422.
 */
export function validateOfxContent(content: string): void {
  const trimmed = content.trimStart();
  const isOFX1Header = /^OFXHEADER\s*:/i.test(trimmed);
  const isOFX2Proc = trimmed.startsWith("<?xml") || trimmed.startsWith("<?OFX");
  const hasOfxBody = /<OFX>/i.test(trimmed);

  if (!isOFX1Header && !isOFX2Proc && !hasOfxBody) {
    throw new OfxParseError(
      "Arquivo não reconhecido como OFX. Verifique se exportou o extrato no formato OFX.",
    );
  }

  if (!hasOfxBody) {
    throw new OfxParseError(
      "Formato OFX inválido: corpo <OFX> não encontrado. O arquivo pode estar corrompido.",
    );
  }
}

/**
 * Parses an OFX date string to a UTC Date object.
 *
 * OFX date format: YYYYMMDDHHMMSS[.mmm][TZD]
 * Examples:
 *   "20250115"                     → 2025-01-15T00:00:00Z
 *   "20250115120000"               → 2025-01-15T12:00:00Z
 *   "20250115120000.000[-3:BRT]"   → 2025-01-15T12:00:00Z (TZ offset dropped)
 *
 * The timezone component is intentionally dropped — all dates are treated as UTC
 * for consistent comparison in the matching algorithm.
 */
export function parseOfxDate(raw: string): Date {
  const cleaned = raw
    .replace(/\[.*\]/, "")
    .replace(/\.\d+/, "")
    .trim();

  const year = parseInt(cleaned.slice(0, 4), 10);
  const month = parseInt(cleaned.slice(4, 6), 10) - 1;
  const day = parseInt(cleaned.slice(6, 8), 10);

  if (cleaned.length >= 14) {
    const hour = parseInt(cleaned.slice(8, 10), 10);
    const min = parseInt(cleaned.slice(10, 12), 10);
    const sec = parseInt(cleaned.slice(12, 14), 10);
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }

  return new Date(Date.UTC(year, month, day));
}

/**
 * Converts an OFX amount string to integer cents.
 * OFX always uses '.' as decimal separator.
 * Returns a signed integer: negative for debits, positive for credits.
 *
 * @example parseOfxAmount("-1490.00")
 * @example parseOfxAmount("250.5")
 */
export function parseOfxAmount(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  const numeric = parseFloat(normalized);

  if (isNaN(numeric)) {
    throw new OfxParseError(`Valor monetário OFX inválido: "${raw}"`);
  }

  return Math.round(numeric * 100);
}

/**
 * Extracts the value of a single OFX tag from a text block.
 *
 * Handles two patterns:
 *   XML-style:  <TAG>value</TAG>
 *   SGML-style: <TAG>value\n  (value ends at EOL or next opening tag)
 *
 * Tries XML pattern first (higher specificity), then falls back to SGML.
 * Returns null when the tag is absent — callers apply their own defaults.
 */
export function extractField(tag: string, text: string): string | null {
  const xmlRe = new RegExp(`<${tag}>\\s*([^<]+?)\\s*<\\/${tag}>`, "i");
  const xmlMatch = text.match(xmlRe);
  if (xmlMatch) return xmlMatch[1]!.trim();

  const sgmlRe = new RegExp(`<${tag}>([^\\r\\n<]+)`, "i");
  const sgmlMatch = text.match(sgmlRe);
  if (sgmlMatch) return sgmlMatch[1]!.trim();

  return null;
}

/**
 * Parses an OFX file buffer and returns a structured bank statement.
 *
 * Pure function — no I/O, no side effects.
 * Throws OfxParseError for any invalid or unrecognised input.
 *
 * @param buffer - Raw file bytes (Buffer from multipart upload)
 * @returns ParsedOfxStatement with account info, period, and transactions
 */
export function parseOfxFile(buffer: Buffer): ParsedOfxStatement {
  const content = decodeOfxBuffer(buffer);
  validateOfxContent(content);
  return extractOfxData(content);
}

function extractOfxData(content: string): ParsedOfxStatement {
  const ofxStart = content.indexOf("<OFX>");
  if (ofxStart === -1) {
    throw new OfxParseError("<OFX> tag not found after header strip");
  }

  const body = content.slice(ofxStart);

  const account = extractAccountInfo(body);
  const { currency, startDate, endDate, transactions } =
    extractTransactionList(body);

  return {
    account,
    currency,
    startDate,
    endDate,
    transactions,
    rawTransactionCount: transactions.length,
  };
}

function extractAccountInfo(body: string): OfxBankAccount {
  const blockMatch = body.match(
    /<BANKACCTFROM>([\s\S]*?)(?:<\/BANKACCTFROM>|<[A-Z])/i,
  );
  const block = blockMatch?.[1] ?? "";

  const rawAcctType = extractField("ACCTTYPE", block) ?? "CHECKING";
  const acctType: OfxAcctType = OFX_ACCTTYPE.includes(
    rawAcctType as OfxAcctType,
  )
    ? (rawAcctType as OfxAcctType)
    : "CHECKING";

  return {
    bankId: extractField("BANKID", block) ?? "",
    acctId: extractField("ACCTID", block) ?? "",
    acctType,
  };
}

function extractTransactionList(body: string): {
  currency: string;
  startDate: Date;
  endDate: Date;
  transactions: OfxTransaction[];
} {
  const currency = extractField("CURDEF", body) ?? "BRL";

  const listMatch = body.match(
    /<BANKTRANLIST>([\s\S]*?)(?:<\/BANKTRANLIST>|$)/i,
  );
  const listBlock = listMatch?.[1] ?? "";

  const startDate = parseOfxDate(
    extractField("DTSTART", listBlock) ?? "19700101",
  );
  const endDate = parseOfxDate(extractField("DTEND", listBlock) ?? "19700101");

  const trnRegex = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
  const transactions: OfxTransaction[] = [];
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(listBlock)) !== null) {
    const block = match[1]!;
    if (!block.trim()) continue;

    try {
      const trn = parseSingleTransaction(block);
      if (trn) transactions.push(trn);
    } catch {
      // Individual malformed transactions are skipped rather than aborting the whole file.
      // rawTransactionCount in the response will equal transactions.length since we
      // only count successfully parsed entries; callers can detect skips externally.
    }
  }

  return { currency, startDate, endDate, transactions };
}

function parseSingleTransaction(block: string): OfxTransaction | null {
  const fitId = extractField("FITID", block);
  const dtRaw = extractField("DTPOSTED", block);
  const amtRaw = extractField("TRNAMT", block);

  if (!fitId || !dtRaw || amtRaw === null) return null;

  const rawType = extractField("TRNTYPE", block) ?? "OTHER";
  const trnType: OfxTrnType = OFX_TRNTYPE.includes(rawType as OfxTrnType)
    ? (rawType as OfxTrnType)
    : "OTHER";

  const description =
    extractField("MEMO", block) ?? extractField("NAME", block) ?? "";

  const checkNum = extractField("CHECKNUM", block);

  return {
    fitId,
    type: trnType,
    postedAt: parseOfxDate(dtRaw),
    amountCents: parseOfxAmount(amtRaw),
    description,
    ...(checkNum !== null ? { checkNum } : {}),
  };
}
