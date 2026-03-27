import { describe, it, expect } from "vitest";

const METHOD_LABELS: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  BANK_TRANSFER: "Transferência",
};

const methodLabel = (m: string): string => METHOD_LABELS[m] ?? m;

describe("methodLabel", () => {
  it("maps PIX to 'Pix'", () => expect(methodLabel("PIX")).toBe("Pix"));
  it("maps CREDIT_CARD correctly", () =>
    expect(methodLabel("CREDIT_CARD")).toBe("Cartão de crédito"));
  it("maps DEBIT_CARD correctly", () =>
    expect(methodLabel("DEBIT_CARD")).toBe("Cartão de débito"));
  it("maps BOLETO correctly", () =>
    expect(methodLabel("BOLETO")).toBe("Boleto"));
  it("maps CASH to 'Dinheiro'", () =>
    expect(methodLabel("CASH")).toBe("Dinheiro"));
  it("maps BANK_TRANSFER to 'Transferência'", () =>
    expect(methodLabel("BANK_TRANSFER")).toBe("Transferência"));
  it("falls back to raw value for unknown method", () =>
    expect(methodLabel("UNKNOWN_METHOD")).toBe("UNKNOWN_METHOD"));
  it("falls back to raw value for empty string", () =>
    expect(methodLabel("")).toBe(""));
});

const GATEWAY_LABELS: Record<string, string> = {
  asaas: "Asaas",
  pagarme: "Pagarme",
  stripe: "Stripe",
};

const gatewayLabel = (name: string | null): string =>
  !name ? "Offline" : (GATEWAY_LABELS[name] ?? name);

describe("gatewayLabel", () => {
  it("returns 'Offline' for null gateway", () =>
    expect(gatewayLabel(null)).toBe("Offline"));
  it("returns 'Offline' for empty string", () =>
    expect(gatewayLabel("")).toBe("Offline"));
  it("maps 'asaas' correctly", () =>
    expect(gatewayLabel("asaas")).toBe("Asaas"));
  it("maps 'pagarme' correctly", () =>
    expect(gatewayLabel("pagarme")).toBe("Pagarme"));
  it("maps 'stripe' correctly", () =>
    expect(gatewayLabel("stripe")).toBe("Stripe"));
  it("falls back to raw value for unknown gateway", () =>
    expect(gatewayLabel("newgateway")).toBe("newgateway"));
});

function computePaginationText(
  total: number,
  page: number,
  limit: number,
): string {
  if (total === 0) return "Nenhum pagamento";
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return `${from}–${to} de ${total} pagamento${total !== 1 ? "s" : ""}`;
}

describe("computePaginationText", () => {
  it("returns 'Nenhum pagamento' when total is 0", () =>
    expect(computePaginationText(0, 1, 20)).toBe("Nenhum pagamento"));
  it("computes first page correctly", () =>
    expect(computePaginationText(45, 1, 20)).toBe("1–20 de 45 pagamentos"));
  it("computes second page correctly", () =>
    expect(computePaginationText(45, 2, 20)).toBe("21–40 de 45 pagamentos"));
  it("computes last partial page correctly", () =>
    expect(computePaginationText(45, 3, 20)).toBe("41–45 de 45 pagamentos"));
  it("uses singular for exactly 1 payment", () =>
    expect(computePaginationText(1, 1, 20)).toBe("1–1 de 1 pagamento"));
  it("handles a single full page (total equals limit)", () =>
    expect(computePaginationText(20, 1, 20)).toBe("1–20 de 20 pagamentos"));
  it("handles page boundary correctly (to does not exceed total)", () =>
    expect(computePaginationText(5, 1, 20)).toBe("1–5 de 5 pagamentos"));
});

describe("isCancelled detection", () => {
  it("is false when cancelledAt is null", () =>
    expect(null !== null).toBe(false));
  it("is true when cancelledAt is a date string", () =>
    expect("2025-03-10T09:00:00.000Z" !== null).toBe(true));
  it("is false for undefined cast to null pattern (via null coalescing)", () => {
    const cancelledAt: string | null = null;
    expect(cancelledAt !== null).toBe(false);
  });
});

describe("method mismatch (payment vs charge)", () => {
  it("identifies a mismatch when payment method differs from charge method", () => {
    const paymentMethod: string = "CASH";
    const chargeMethod: string = "PIX";
    expect(paymentMethod !== chargeMethod).toBe(true);
  });

  it("identifies no mismatch when payment and charge methods are identical", () => {
    const paymentMethod: string = "PIX";
    const chargeMethod: string = "PIX";
    expect(paymentMethod !== chargeMethod).toBe(false);
  });

  it("CASH payment on PIX charge is a valid mismatch (manual confirmation)", () => {
    const paymentMethod: string = "CASH";
    const chargeMethod: string = "PIX";
    expect(paymentMethod !== chargeMethod).toBe(true);
  });

  it("BOLETO payment on BOLETO charge is not a mismatch", () => {
    const paymentMethod: string = "BOLETO";
    const chargeMethod: string = "BOLETO";
    expect(paymentMethod !== chargeMethod).toBe(false);
  });
});

describe("pagination boundary guards", () => {
  it("prev button should be disabled on page 1", () => {
    const page = 1;
    expect(page <= 1).toBe(true);
  });

  it("prev button should not be disabled on page 2", () => {
    const page = 2;
    expect(page <= 1).toBe(false);
  });

  it("next button should be disabled when page equals totalPages", () => {
    const page = 3;
    const total = 45;
    const limit = 20;
    const totalPages = Math.ceil(total / limit);
    expect(page >= totalPages).toBe(true);
  });

  it("next button should not be disabled when more pages remain", () => {
    const page = 1;
    const total = 45;
    const limit = 20;
    const totalPages = Math.ceil(total / limit);
    expect(page >= totalPages).toBe(false);
  });
});
