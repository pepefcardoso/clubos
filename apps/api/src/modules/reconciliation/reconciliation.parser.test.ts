import { describe, it, expect } from "vitest";
import {
  decodeOfxBuffer,
  validateOfxContent,
  parseOfxDate,
  parseOfxAmount,
  extractField,
  parseOfxFile,
} from "./reconciliation.parser.js";
import { OfxParseError } from "./reconciliation.schema.js";

const OFX_1X_SAMPLE = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20250115120000
<TRNAMT>-150.00
<FITID>2025011500001
<MEMO>PAGAMENTO BOLETO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20250120
<TRNAMT>5000.00
<FITID>2025012000001
<NAME>TRANSFERENCIA RECEBIDA
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`.trim();

const OFX_2X_SAMPLE = `
<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" DATA="OFXSGML" VERSION="211" SECURITY="NONE"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKACCTFROM>
          <BANKID>341</BANKID>
          <ACCTID>99999-9</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20250201</DTSTART>
          <DTEND>20250228</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20250210120000</DTPOSTED>
            <TRNAMT>-300.00</TRNAMT>
            <FITID>ABC123</FITID>
            <MEMO>DEBITO AUTOMATICO</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`.trim();

const OFX_NO_TRANSACTIONS = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`.trim();

const OFX_WITH_UNKNOWN_TRNTYPE = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
<STMTTRN>
<TRNTYPE>XYZUNKNOWN
<DTPOSTED>20250115
<TRNAMT>-100.00
<FITID>FITID001
<MEMO>UNKNOWN TYPE TXN
</STMTTRN>
</BANKTRANLIST>
</OFX>
`.trim();

const OFX_WITH_BAD_TRANSACTION = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20250115
<FITID>GOODONE
<TRNAMT>-50.00
<MEMO>VALID TXN
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<TRNAMT>-999.00
<MEMO>MISSING FITID AND DTPOSTED
</STMTTRN>
</BANKTRANLIST>
</OFX>
`.trim();

const OFX_WITH_CHECKNUM = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
<STMTTRN>
<TRNTYPE>CHECK
<DTPOSTED>20250115
<TRNAMT>-200.00
<FITID>CHK001
<CHECKNUM>10042
<MEMO>CHEQUE COMPENSADO
</STMTTRN>
</BANKTRANLIST>
</OFX>
`.trim();

describe("decodeOfxBuffer()", () => {
  it("detects Windows-1252 from CHARSET:1252 header and uses TextDecoder", () => {
    const content = "OFXHEADER:100\nCHARSET:1252\n<OFX>";
    const buffer = Buffer.from(content, "ascii");
    const result = decodeOfxBuffer(buffer);
    expect(result).toContain("<OFX>");
  });

  it("detects UTF-8 from ENCODING:UTF-8 header", () => {
    const content = "OFXHEADER:100\nENCODING:UTF-8\n<OFX>";
    const buffer = Buffer.from(content, "utf8");
    const result = decodeOfxBuffer(buffer);
    expect(result).toContain("<OFX>");
  });

  it("defaults to UTF-8 when no charset header is present", () => {
    const content = '<?xml version="1.0"?><OFX><STMTRS></STMTRS></OFX>';
    const buffer = Buffer.from(content, "utf8");
    const result = decodeOfxBuffer(buffer);
    expect(result).toContain("<OFX>");
  });

  it("handles ENCODING:WINDOWS-1252 variant header", () => {
    const content = "OFXHEADER:100\nENCODING:WINDOWS-1252\n<OFX>";
    const buffer = Buffer.from(content, "ascii");
    const result = decodeOfxBuffer(buffer);
    expect(result).toContain("<OFX>");
  });
});

describe("validateOfxContent()", () => {
  it("accepts a valid OFX 1.x SGML file with OFXHEADER and <OFX>", () => {
    expect(() => validateOfxContent(OFX_1X_SAMPLE)).not.toThrow();
  });

  it("accepts a valid OFX 2.x XML file starting with <?xml ?>", () => {
    expect(() => validateOfxContent(OFX_2X_SAMPLE)).not.toThrow();
  });

  it("throws OfxParseError when content is a CSV file", () => {
    const csv = "nome,cpf,telefone\nJoão,12345678901,11999990000";
    expect(() => validateOfxContent(csv)).toThrow(OfxParseError);
    expect(() => validateOfxContent(csv)).toThrow(
      /Arquivo não reconhecido como OFX/,
    );
  });

  it("throws OfxParseError when OFX header present but <OFX> body missing", () => {
    const missingBody = "OFXHEADER:100\nDATA:OFXSGML\nSOMETHING:ELSE";
    expect(() => validateOfxContent(missingBody)).toThrow(OfxParseError);
    expect(() => validateOfxContent(missingBody)).toThrow(
      /corpo <OFX> não encontrado/,
    );
  });

  it("throws OfxParseError for an empty string", () => {
    expect(() => validateOfxContent("")).toThrow(OfxParseError);
  });

  it("throws OfxParseError for plain JSON content", () => {
    expect(() => validateOfxContent('{"key": "value"}')).toThrow(OfxParseError);
  });
});

describe("parseOfxDate()", () => {
  it("parses a date-only YYYYMMDD string to UTC midnight", () => {
    const result = parseOfxDate("20250115");
    expect(result.toISOString()).toBe("2025-01-15T00:00:00.000Z");
  });

  it("parses YYYYMMDDHHMMSS with full time component", () => {
    const result = parseOfxDate("20250115120000");
    expect(result.toISOString()).toBe("2025-01-15T12:00:00.000Z");
  });

  it("strips timezone offset and milliseconds correctly", () => {
    const result = parseOfxDate("20250115120000.000[-3:BRT]");
    expect(result.toISOString()).toBe("2025-01-15T12:00:00.000Z");
  });

  it("strips positive timezone offset", () => {
    const result = parseOfxDate("20250115090000.000[+1:CET]");
    expect(result.toISOString()).toBe("2025-01-15T09:00:00.000Z");
  });

  it("returns a Date instance", () => {
    expect(parseOfxDate("20250101")).toBeInstanceOf(Date);
  });
});

describe("parseOfxAmount()", () => {
  it("converts a debit string to negative cents", () => {
    expect(parseOfxAmount("-150.00")).toBe(-15000);
  });

  it("converts a credit string to positive cents", () => {
    expect(parseOfxAmount("5000.00")).toBe(500000);
  });

  it("handles half-cent rounding (0.01 → 1 cent)", () => {
    expect(parseOfxAmount("0.01")).toBe(1);
  });

  it("handles a fractional amount with one decimal place", () => {
    expect(parseOfxAmount("250.5")).toBe(25050);
  });

  it("handles a whole number amount with no decimal", () => {
    expect(parseOfxAmount("1000")).toBe(100000);
  });

  it("throws OfxParseError for a non-numeric string", () => {
    expect(() => parseOfxAmount("abc")).toThrow(OfxParseError);
    expect(() => parseOfxAmount("abc")).toThrow(/Valor monetário OFX inválido/);
  });

  it("handles leading/trailing whitespace in the raw string", () => {
    expect(parseOfxAmount("  -99.99  ")).toBe(-9999);
  });

  it("handles comma as decimal separator (defensive normalisation)", () => {
    expect(parseOfxAmount("1490,00")).toBe(149000);
  });
});

describe("extractField()", () => {
  it("extracts value from SGML-style tag (no closing tag)", () => {
    const text = "<TRNTYPE>DEBIT\n<DTPOSTED>20250115";
    expect(extractField("TRNTYPE", text)).toBe("DEBIT");
  });

  it("extracts value from XML-style tag (with closing tag)", () => {
    const text = "<TRNTYPE>CREDIT</TRNTYPE>";
    expect(extractField("TRNTYPE", text)).toBe("CREDIT");
  });

  it("returns null when the tag is absent", () => {
    expect(extractField("CHECKNUM", "<TRNTYPE>DEBIT\n")).toBeNull();
  });

  it("trims whitespace around extracted value", () => {
    const text = "<MEMO>  PAGAMENTO BOLETO  </MEMO>";
    expect(extractField("MEMO", text)).toBe("PAGAMENTO BOLETO");
  });

  it("is case-insensitive on the tag name", () => {
    const text = "<memo>TEST VALUE</memo>";
    expect(extractField("MEMO", text)).toBe("TEST VALUE");
  });

  it("prefers XML closing-tag match over SGML line match", () => {
    const text = "<ACCTTYPE>SAVINGS</ACCTTYPE>";
    expect(extractField("ACCTTYPE", text)).toBe("SAVINGS");
  });
});

describe("parseOfxFile() — OFX 1.x SGML", () => {
  it("returns correct account info for OFX 1.x", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    expect(result.account.bankId).toBe("001");
    expect(result.account.acctId).toBe("12345-6");
    expect(result.account.acctType).toBe("CHECKING");
  });

  it("returns currency BRL", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    expect(result.currency).toBe("BRL");
  });

  it("parses 2 transactions from OFX 1.x sample", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    expect(result.transactions).toHaveLength(2);
    expect(result.rawTransactionCount).toBe(2);
  });

  it("correctly parses the DEBIT transaction", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    const debit = result.transactions.find((t) => t.fitId === "2025011500001");
    expect(debit).toBeDefined();
    expect(debit!.type).toBe("DEBIT");
    expect(debit!.amountCents).toBe(-15000);
    expect(debit!.description).toBe("PAGAMENTO BOLETO");
    expect(debit!.postedAt.toISOString()).toBe("2025-01-15T12:00:00.000Z");
  });

  it("correctly parses the CREDIT transaction (uses NAME as description fallback)", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    const credit = result.transactions.find((t) => t.fitId === "2025012000001");
    expect(credit).toBeDefined();
    expect(credit!.type).toBe("CREDIT");
    expect(credit!.amountCents).toBe(500000);
    expect(credit!.description).toBe("TRANSFERENCIA RECEBIDA");
  });

  it("returns correct period dates", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    expect(result.startDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(result.endDate.toISOString()).toBe("2025-01-31T00:00:00.000Z");
  });
});

describe("parseOfxFile() — OFX 2.x XML", () => {
  it("returns correct account info for OFX 2.x", () => {
    const result = parseOfxFile(Buffer.from(OFX_2X_SAMPLE));
    expect(result.account.bankId).toBe("341");
    expect(result.account.acctId).toBe("99999-9");
    expect(result.account.acctType).toBe("CHECKING");
  });

  it("parses 1 transaction from OFX 2.x sample", () => {
    const result = parseOfxFile(Buffer.from(OFX_2X_SAMPLE));
    expect(result.transactions).toHaveLength(1);
  });

  it("correctly parses the transaction amount in OFX 2.x", () => {
    const result = parseOfxFile(Buffer.from(OFX_2X_SAMPLE));
    const trn = result.transactions[0]!;
    expect(trn.fitId).toBe("ABC123");
    expect(trn.amountCents).toBe(-30000);
    expect(trn.description).toBe("DEBITO AUTOMATICO");
  });
});

describe("parseOfxFile() — edge cases", () => {
  it("returns empty transactions array when BANKTRANLIST has no STMTTRN blocks", () => {
    const result = parseOfxFile(Buffer.from(OFX_NO_TRANSACTIONS));
    expect(result.transactions).toHaveLength(0);
    expect(result.rawTransactionCount).toBe(0);
  });

  it("falls back to 'OTHER' for an unrecognised TRNTYPE", () => {
    const result = parseOfxFile(Buffer.from(OFX_WITH_UNKNOWN_TRNTYPE));
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.type).toBe("OTHER");
  });

  it("skips a malformed transaction (missing FITID) and keeps valid ones", () => {
    const result = parseOfxFile(Buffer.from(OFX_WITH_BAD_TRANSACTION));
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.fitId).toBe("GOODONE");
  });

  it("extracts CHECKNUM field when present", () => {
    const result = parseOfxFile(Buffer.from(OFX_WITH_CHECKNUM));
    expect(result.transactions[0]!.checkNum).toBe("10042");
  });

  it("checkNum is undefined when not present in transaction", () => {
    const result = parseOfxFile(Buffer.from(OFX_1X_SAMPLE));
    expect(result.transactions[0]!.checkNum).toBeUndefined();
  });

  it("throws OfxParseError for a non-OFX buffer (CSV bytes)", () => {
    const csvBuffer = Buffer.from("nome,cpf,telefone\nJoão,12345678901,11999");
    expect(() => parseOfxFile(csvBuffer)).toThrow(OfxParseError);
  });

  it("throws OfxParseError for an empty buffer", () => {
    expect(() => parseOfxFile(Buffer.from(""))).toThrow(OfxParseError);
  });

  it("handles a file with only CREDIT type transactions", () => {
    const ofx = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20250115
<TRNAMT>1200.50
<FITID>CRED001
<MEMO>SALARIO
</STMTTRN>
</BANKTRANLIST>
</OFX>`.trim();
    const result = parseOfxFile(Buffer.from(ofx));
    expect(result.transactions[0]!.amountCents).toBe(120050);
    expect(result.transactions[0]!.type).toBe("CREDIT");
  });

  it("defaults account acctType to CHECKING when BANKACCTFROM block is absent", () => {
    const ofxNoAccount = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
</BANKTRANLIST>
</OFX>`.trim();
    const result = parseOfxFile(Buffer.from(ofxNoAccount));
    expect(result.account.acctType).toBe("CHECKING");
    expect(result.account.bankId).toBe("");
    expect(result.account.acctId).toBe("");
  });

  it("defaults currency to BRL when CURDEF is absent", () => {
    const ofxNoCurrency = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<DTSTART>20250101
<DTEND>20250131
</BANKTRANLIST>
</OFX>`.trim();
    const result = parseOfxFile(Buffer.from(ofxNoCurrency));
    expect(result.currency).toBe("BRL");
  });
});
