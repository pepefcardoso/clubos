import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv-export";

const HEADERS = [
  { key: "name", label: "Nome" },
  { key: "amount", label: "Valor" },
];

describe("toCsv — header row", () => {
  it("produces a header row with double-quoted labels", () => {
    const csv = toCsv([], HEADERS);
    expect(csv).toBe('"Nome","Valor"');
  });

  it("uses \\r\\n as the row separator (RFC 4180)", () => {
    const csv = toCsv([{ name: "João", amount: "R$ 80,00" }], HEADERS);
    expect(csv).toContain("\r\n");
  });
});

describe("toCsv — data rows", () => {
  it("produces a header row followed by data rows", () => {
    const csv = toCsv([{ name: "João", amount: "R$ 80,00" }], HEADERS);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"Nome","Valor"');
    expect(lines[1]).toBe('"João","R$ 80,00"');
  });

  it("renders empty string for null values", () => {
    const csv = toCsv([{ name: null, amount: null }], HEADERS);
    expect(csv).toContain('"",""');
  });

  it("renders empty string for undefined values", () => {
    const csv = toCsv([{ name: undefined, amount: undefined }], HEADERS);
    expect(csv).toContain('"",""');
  });

  it("renders boolean values as strings", () => {
    const csv = toCsv([{ name: "Sim", amount: "true" }], HEADERS);
    expect(csv).toContain('"Sim"');
  });

  it("renders numeric values as strings", () => {
    const csv = toCsv([{ name: "Pagamento", amount: 14990 }], HEADERS);
    expect(csv).toContain('"14990"');
  });
});

describe("toCsv — CSV injection sanitisation", () => {
  it("sanitises = (formula prefix)", () => {
    const csv = toCsv([{ name: "=EVIL()", amount: "0" }], HEADERS);
    expect(csv).toContain("'=EVIL()");
  });

  it("sanitises + prefix", () => {
    const csv = toCsv([{ name: "+1234", amount: "0" }], HEADERS);
    expect(csv).toContain("'+1234");
  });

  it("sanitises - prefix", () => {
    const csv = toCsv([{ name: "-1234", amount: "0" }], HEADERS);
    expect(csv).toContain("'-1234");
  });

  it("sanitises @ prefix", () => {
    const csv = toCsv([{ name: "@SUM(A1:A2)", amount: "0" }], HEADERS);
    expect(csv).toContain("'@SUM(A1:A2)");
  });

  it("does not sanitise values that start with safe characters", () => {
    const csv = toCsv([{ name: "João Silva", amount: "0" }], HEADERS);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('"João Silva","0"');
  });

  it("does not sanitise an empty string", () => {
    const csv = toCsv([{ name: "", amount: "0" }], HEADERS);
    expect(csv).toContain('"","0"');
  });
});

describe("toCsv — quote escaping", () => {
  it("escapes internal double-quotes per RFC 4180", () => {
    const csv = toCsv([{ name: 'He said "hi"', amount: "0" }], HEADERS);
    expect(csv).toContain('"He said ""hi"""');
  });

  it("escapes multiple internal double-quotes", () => {
    const csv = toCsv([{ name: '"A" and "B"', amount: "0" }], HEADERS);
    expect(csv).toContain('"""A"" and ""B"""');
  });
});

describe("toCsv — multiple rows", () => {
  it("produces one data line per row", () => {
    const rows = [
      { name: "Alice", amount: "R$ 100,00" },
      { name: "Bruno", amount: "R$ 200,00" },
      { name: "Carla", amount: "R$ 300,00" },
    ];
    const lines = toCsv(rows, HEADERS).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('"Alice","R$ 100,00"');
    expect(lines[2]).toBe('"Bruno","R$ 200,00"');
    expect(lines[3]).toBe('"Carla","R$ 300,00"');
  });
});

describe("toCsv — Brazilian locale specific", () => {
  it("preserves BRL formatted values with comma decimal separator", () => {
    const csv = toCsv([{ name: "Sócio", amount: "R$ 1.490,00" }], HEADERS);
    expect(csv).toContain('"R$ 1.490,00"');
  });

  it("preserves accented characters without mangling", () => {
    const csv = toCsv(
      [{ name: "Associação Atlética", amount: "R$ 80,00" }],
      HEADERS,
    );
    expect(csv).toContain('"Associação Atlética"');
  });
});
