import { describe, it, expect } from "vitest";
import { validateUploadForm } from "./BalanceSheetsPanel.js";

function makeFile(name: string, size: number, type = "application/pdf"): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function valid() {
  return {
    title: "Balanço Patrimonial 2024",
    period: "2024",
    file: makeFile("balanco.pdf", 1024),
  };
}

describe("validateUploadForm — title", () => {
  it("rejects empty title", () => {
    const errs = validateUploadForm({ ...valid(), title: "" });
    expect(errs.title).toBeTruthy();
  });

  it("rejects title with 1 char", () => {
    const errs = validateUploadForm({ ...valid(), title: "X" });
    expect(errs.title).toBeTruthy();
  });

  it("accepts title with exactly 2 chars (lower boundary)", () => {
    const errs = validateUploadForm({ ...valid(), title: "AB" });
    expect(errs.title).toBeUndefined();
  });

  it("accepts title with exactly 200 chars (upper boundary)", () => {
    const errs = validateUploadForm({ ...valid(), title: "A".repeat(200) });
    expect(errs.title).toBeUndefined();
  });

  it("rejects title with 201 chars", () => {
    const errs = validateUploadForm({ ...valid(), title: "A".repeat(201) });
    expect(errs.title).toBeTruthy();
  });

  it("accepts a normal title", () => {
    const errs = validateUploadForm(valid());
    expect(errs.title).toBeUndefined();
  });
});

describe("validateUploadForm — period", () => {
  it("rejects empty period", () => {
    const errs = validateUploadForm({ ...valid(), period: "" });
    expect(errs.period).toBeTruthy();
  });

  it("rejects period with 1 char", () => {
    const errs = validateUploadForm({ ...valid(), period: "X" });
    expect(errs.period).toBeTruthy();
  });

  it("accepts period with exactly 2 chars (lower boundary)", () => {
    const errs = validateUploadForm({ ...valid(), period: "Q1" });
    expect(errs.period).toBeUndefined();
  });

  it("accepts period with exactly 100 chars (upper boundary)", () => {
    const errs = validateUploadForm({ ...valid(), period: "A".repeat(100) });
    expect(errs.period).toBeUndefined();
  });

  it("rejects period with 101 chars", () => {
    const errs = validateUploadForm({ ...valid(), period: "A".repeat(101) });
    expect(errs.period).toBeTruthy();
  });

  it("accepts typical period strings", () => {
    for (const p of ["2024", "1º Trimestre 2025", "Jan-Jun 2024"]) {
      const errs = validateUploadForm({ ...valid(), period: p });
      expect(errs.period).toBeUndefined();
    }
  });
});

describe("validateUploadForm — file", () => {
  it("rejects null file", () => {
    const errs = validateUploadForm({ ...valid(), file: null });
    expect(errs.file).toBeTruthy();
  });

  it("rejects a non-PDF by MIME type", () => {
    const errs = validateUploadForm({
      ...valid(),
      file: makeFile("report.docx", 1024, "application/vnd.ms-word"),
    });
    expect(errs.file).toBeTruthy();
  });

  it("rejects a file with .docx extension even if MIME says pdf", () => {
    const errs = validateUploadForm({
      ...valid(),
      file: makeFile("report.docx", 1024, "application/vnd.ms-word"),
    });
    expect(errs.file).toBeTruthy();
  });

  it("rejects a file exceeding 10 MB", () => {
    const errs = validateUploadForm({
      ...valid(),
      file: makeFile("big.pdf", MAX_PDF_BYTES + 1),
    });
    expect(errs.file).toBeTruthy();
  });

  it("accepts a PDF at exactly 10 MB (boundary)", () => {
    const errs = validateUploadForm({
      ...valid(),
      file: makeFile("max.pdf", MAX_PDF_BYTES),
    });
    expect(errs.file).toBeUndefined();
  });

  it("accepts a valid PDF under the size limit", () => {
    const errs = validateUploadForm(valid());
    expect(errs.file).toBeUndefined();
  });

  it("accepts a .pdf file where MIME is empty string (some browsers)", () => {
    const errs = validateUploadForm({
      ...valid(),
      file: makeFile("balanco.pdf", 512, ""),
    });
    expect(errs.file).toBeUndefined();
  });
});

describe("validateUploadForm — multiple errors", () => {
  it("reports all field errors simultaneously", () => {
    const errs = validateUploadForm({ title: "", period: "", file: null });
    expect(errs.title).toBeTruthy();
    expect(errs.period).toBeTruthy();
    expect(errs.file).toBeTruthy();
  });

  it("returns empty object when all fields are valid", () => {
    const errs = validateUploadForm(valid());
    expect(Object.keys(errs)).toHaveLength(0);
  });
});
