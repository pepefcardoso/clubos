import { describe, it, expect } from "vitest";
import { renderPreview, PREVIEW_VARS } from "./TemplatePreview";

describe("renderPreview", () => {
  it("substitutes all four placeholders", () => {
    const body =
      "Olá, {nome}! Valor: {valor}. Pix: {pix_link}. Vencimento: {vencimento}.";
    const result = renderPreview(body);
    expect(result).toContain(PREVIEW_VARS.nome);
    expect(result).toContain(PREVIEW_VARS.valor);
    expect(result).toContain(PREVIEW_VARS.pix_link);
    expect(result).toContain(PREVIEW_VARS.vencimento);
  });

  it("handles multiple occurrences of the same placeholder", () => {
    const body = "{nome} e {nome} são dois sócios chamados {nome}.";
    const result = renderPreview(body);
    expect(result).not.toContain("{nome}");
    const count = result.split(PREVIEW_VARS.nome).length - 1;
    expect(count).toBe(3);
  });

  it("leaves unknown placeholders untouched", () => {
    const body = "Olá, {nome}! Código: {codigo_desconhecido}.";
    const result = renderPreview(body);
    expect(result).toContain("{codigo_desconhecido}");
    expect(result).not.toContain("{nome}");
  });

  it("preserves newlines", () => {
    const body = "Linha 1\n\nLinha 2\n{nome}";
    const result = renderPreview(body);
    expect(result).toContain("Linha 1\n\nLinha 2\n");
    expect(result).toContain(PREVIEW_VARS.nome);
  });

  it("returns the body unchanged when no placeholders are present", () => {
    const body = "Mensagem sem variáveis.";
    expect(renderPreview(body)).toBe(body);
  });

  it("handles body with only whitespace around placeholders", () => {
    const body = "  {nome}  ";
    const result = renderPreview(body);
    expect(result).toBe(`  ${PREVIEW_VARS.nome}  `);
  });

  it("handles empty body", () => {
    expect(renderPreview("")).toBe("");
  });

  it("does not double-substitute (placeholder value does not contain another placeholder)", () => {
    const body = "{nome}";
    const result = renderPreview(body);
    expect(result).toBe(PREVIEW_VARS.nome);
    expect(result).not.toMatch(/\{[a-z_]+\}/);
  });

  it("handles all placeholders appearing multiple times in mixed order", () => {
    const body = "{valor} {nome} {vencimento} {pix_link} {nome} {valor}";
    const result = renderPreview(body);
    expect(result).not.toContain("{valor}");
    expect(result).not.toContain("{nome}");
    expect(result).not.toContain("{vencimento}");
    expect(result).not.toContain("{pix_link}");
  });
});
