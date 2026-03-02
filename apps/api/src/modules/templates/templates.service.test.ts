import { describe, it, expect, vi, beforeEach } from "vitest";

let _mockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_mockTx),
  ),
}));

import {
  formatCurrency,
  formatDate,
  renderTemplate,
  getTemplate,
  buildRenderedMessage,
  listTemplates,
  upsertTemplate,
  resetTemplate,
} from "./templates.service.js";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS } from "./templates.constants.js";

function buildMockTx(
  overrides: {
    messageTemplateFindUnique?: { body: string; isActive: boolean } | null;
    messageTemplateFindMany?: Array<{
      key: string;
      body: string;
      isActive: boolean;
    }>;
    messageTemplateUpsert?: object;
    messageTemplateDeleteMany?: { count: number };
    auditLogCreate?: object;
  } = {},
) {
  return {
    messageTemplate: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.messageTemplateFindUnique !== undefined
            ? overrides.messageTemplateFindUnique
            : null,
        ),
      findMany: vi
        .fn()
        .mockResolvedValue(overrides.messageTemplateFindMany ?? []),
      upsert: vi.fn().mockResolvedValue(overrides.messageTemplateUpsert ?? {}),
      deleteMany: vi
        .fn()
        .mockResolvedValue(overrides.messageTemplateDeleteMany ?? { count: 0 }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue(overrides.auditLogCreate ?? {}),
    },
  };
}

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _mockTx = tx;
}

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-test-001";
const ACTOR_ID = "user-admin-001";

describe("formatCurrency", () => {
  it("TM-1: formats 9900 cents as R$ 99,00", () => {
    expect(formatCurrency(9900)).toBe("R$\u00a099,00");
  });

  it("TM-2: formats 149900 cents as R$ 1.499,00", () => {
    expect(formatCurrency(149900)).toBe("R$\u00a01.499,00");
  });

  it("TM-3: formats 0 cents as R$ 0,00", () => {
    expect(formatCurrency(0)).toBe("R$\u00a00,00");
  });
});

describe("formatDate", () => {
  it("TM-4: formats a UTC date as DD/MM/YYYY in America/Sao_Paulo timezone", () => {
    const result = formatDate(new Date("2025-03-31T12:00:00.000Z"));
    expect(result).toBe("31/03/2025");
  });

  it("handles midnight UTC correctly (does not drift to previous day for SP)", () => {
    const result = formatDate(new Date("2025-04-01T00:00:00.000Z"));
    expect(result).toBe("31/03/2025");
  });
});

describe("renderTemplate", () => {
  const vars = {
    nome: "Alice Costa",
    valor: "R$ 99,00",
    pix_link: "00020126580014br.gov.bcb.pix...",
    vencimento: "31/03/2025",
  };

  it("TM-5: substitutes all four variables correctly", () => {
    const body = "Olá, {nome}! Pague {valor} até {vencimento}.\n\n{pix_link}";
    const result = renderTemplate(body, vars);

    expect(result).toContain("Alice Costa");
    expect(result).toContain("R$ 99,00");
    expect(result).toContain("31/03/2025");
    expect(result).toContain("00020126580014br.gov.bcb.pix...");
    expect(result).not.toContain("{nome}");
    expect(result).not.toContain("{valor}");
    expect(result).not.toContain("{vencimento}");
    expect(result).not.toContain("{pix_link}");
  });

  it("TM-6: handles multiple occurrences of the same variable", () => {
    const body =
      "Olá, {nome}! Sim, {nome}, você deve {valor} e novamente {valor}.";
    const result = renderTemplate(body, vars);

    expect(result).toBe(
      "Olá, Alice Costa! Sim, Alice Costa, você deve R$ 99,00 e novamente R$ 99,00.",
    );
  });

  it("TM-7: leaves unknown placeholders untouched", () => {
    const body = "Olá, {nome}! Seu código: {codigo_desconhecido}.";
    const result = renderTemplate(body, vars);

    expect(result).toContain("Alice Costa");
    expect(result).toContain("{codigo_desconhecido}");
  });
});

describe("getTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TM-8: returns custom body when an active custom template exists", async () => {
    const customBody = "Corpo personalizado do clube para D-3.";
    const tx = buildMockTx({
      messageTemplateFindUnique: { body: customBody, isActive: true },
    });
    setMockTx(tx);

    const result = await getTemplate(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D3,
    );

    expect(result).toBe(customBody);
  });

  it("TM-9: falls back to DEFAULT_TEMPLATES when no custom row exists (null)", async () => {
    const tx = buildMockTx({ messageTemplateFindUnique: null });
    setMockTx(tx);

    const result = await getTemplate(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D3,
    );

    expect(result).toBe(DEFAULT_TEMPLATES.charge_reminder_d3);
  });

  it("TM-10: falls back to default when custom template has isActive = false", async () => {
    const tx = buildMockTx({
      messageTemplateFindUnique: { body: "Corpo inativo", isActive: false },
    });
    setMockTx(tx);

    const result = await getTemplate(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.OVERDUE_NOTICE,
    );

    expect(result).toBe(DEFAULT_TEMPLATES.overdue_notice);
  });

  it("queries DB with correct key and channel", async () => {
    const tx = buildMockTx({ messageTemplateFindUnique: null });
    setMockTx(tx);

    await getTemplate(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D0,
      "EMAIL",
    );

    expect(tx.messageTemplate.findUnique).toHaveBeenCalledWith({
      where: { key_channel: { key: "charge_reminder_d0", channel: "EMAIL" } },
      select: { body: true, isActive: true },
    });
  });
});

describe("buildRenderedMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TM-11: produces a correctly interpolated string", async () => {
    const tx = buildMockTx({ messageTemplateFindUnique: null });
    setMockTx(tx);

    const result = await buildRenderedMessage(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D3,
      {
        amountCents: 9900,
        dueDate: new Date("2025-03-31T12:00:00.000Z"),
        gatewayMeta: {
          qrCodeBase64: "base64==",
          pixCopyPaste: "00020126580014br.gov.bcb.pix",
        },
      },
      "Bob Silva",
    );

    expect(result).toContain("Bob Silva");
    expect(result).toContain("R$\u00a099,00");
    expect(result).toContain("31/03/2025");
    expect(result).toContain("00020126580014br.gov.bcb.pix");
    expect(result).not.toMatch(
      /\{nome\}|\{valor\}|\{vencimento\}|\{pix_link\}/,
    );
  });

  it("TM-12: uses fallback pix_link text when gatewayMeta is null", async () => {
    const tx = buildMockTx({ messageTemplateFindUnique: null });
    setMockTx(tx);

    const result = await buildRenderedMessage(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.OVERDUE_NOTICE,
      {
        amountCents: 14900,
        dueDate: new Date("2025-03-31T12:00:00.000Z"),
        gatewayMeta: null,
      },
      "Carol Mendes",
    );

    expect(result).toContain("(código Pix indisponível)");
    expect(result).not.toContain("{pix_link}");
  });

  it("uses fallback pix_link when gatewayMeta has no pixCopyPaste property", async () => {
    const tx = buildMockTx({ messageTemplateFindUnique: null });
    setMockTx(tx);

    const result = await buildRenderedMessage(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D0,
      {
        amountCents: 5000,
        dueDate: new Date("2025-04-15T12:00:00.000Z"),
        gatewayMeta: { bankSlipUrl: "https://boleto.example.com" },
      },
      "Davi Rocha",
    );

    expect(result).toContain("(código Pix indisponível)");
  });

  it("uses custom template when club has one configured", async () => {
    const customBody =
      "Oi {nome}, pague {valor} via {pix_link} até {vencimento}. Obrigado!";
    const tx = buildMockTx({
      messageTemplateFindUnique: { body: customBody, isActive: true },
    });
    setMockTx(tx);

    const result = await buildRenderedMessage(
      PRISMA_STUB,
      CLUB_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D3,
      {
        amountCents: 4900,
        dueDate: new Date("2025-06-30T12:00:00.000Z"),
        gatewayMeta: {
          qrCodeBase64: "",
          pixCopyPaste: "pix-code-xyz",
        },
      },
      "Eva Lima",
    );

    expect(result).toBe(
      "Oi Eva Lima, pague R$\u00a049,00 via pix-code-xyz até 30/06/2025. Obrigado!",
    );
  });
});

describe("listTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 3 items — one per TEMPLATE_KEY", async () => {
    const tx = buildMockTx({ messageTemplateFindMany: [] });
    setMockTx(tx);

    const items = await listTemplates(PRISMA_STUB, CLUB_ID);
    expect(items).toHaveLength(3);
  });

  it("marks isCustom = true for keys that have an active custom row", async () => {
    const tx = buildMockTx({
      messageTemplateFindMany: [
        {
          key: TEMPLATE_KEYS.CHARGE_REMINDER_D3,
          body: "Custom D-3",
          isActive: true,
        },
      ],
    });
    setMockTx(tx);

    const items = await listTemplates(PRISMA_STUB, CLUB_ID);
    const d3 = items.find((i) => i.key === TEMPLATE_KEYS.CHARGE_REMINDER_D3)!;
    const d0 = items.find((i) => i.key === TEMPLATE_KEYS.CHARGE_REMINDER_D0)!;

    expect(d3.isCustom).toBe(true);
    expect(d3.body).toBe("Custom D-3");
    expect(d0.isCustom).toBe(false);
    expect(d0.body).toBe(DEFAULT_TEMPLATES.charge_reminder_d0);
  });

  it("marks isCustom = false for keys with isActive = false", async () => {
    const tx = buildMockTx({
      messageTemplateFindMany: [
        {
          key: TEMPLATE_KEYS.OVERDUE_NOTICE,
          body: "Inactive body",
          isActive: false,
        },
      ],
    });
    setMockTx(tx);

    const items = await listTemplates(PRISMA_STUB, CLUB_ID);
    const overdue = items.find((i) => i.key === TEMPLATE_KEYS.OVERDUE_NOTICE)!;

    expect(overdue.isCustom).toBe(false);
    expect(overdue.body).toBe(DEFAULT_TEMPLATES.overdue_notice);
  });
});

describe("upsertTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls messageTemplate.upsert with correct key, channel, and body", async () => {
    const tx = buildMockTx();
    setMockTx(tx);

    await upsertTemplate(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D0,
      "Novo corpo D-0 personalizado para o clube.",
      "WHATSAPP",
    );

    expect(tx.messageTemplate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key_channel: { key: "charge_reminder_d0", channel: "WHATSAPP" },
        },
        create: expect.objectContaining({
          key: "charge_reminder_d0",
          channel: "WHATSAPP",
        }),
        update: expect.objectContaining({
          body: "Novo corpo D-0 personalizado para o clube.",
        }),
      }),
    );
  });

  it("writes an auditLog entry", async () => {
    const tx = buildMockTx();
    setMockTx(tx);

    await upsertTemplate(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      TEMPLATE_KEYS.OVERDUE_NOTICE,
      "Corpo do lembrete de inadimplência personalizado.",
    );

    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe("resetTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls messageTemplate.deleteMany with correct key and channel", async () => {
    const tx = buildMockTx();
    setMockTx(tx);

    await resetTemplate(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D3,
      "WHATSAPP",
    );

    expect(tx.messageTemplate.deleteMany).toHaveBeenCalledWith({
      where: { key: "charge_reminder_d3", channel: "WHATSAPP" },
    });
  });

  it("does not throw when no custom row exists (idempotent)", async () => {
    const tx = buildMockTx({ messageTemplateDeleteMany: { count: 0 } });
    setMockTx(tx);

    await expect(
      resetTemplate(
        PRISMA_STUB,
        CLUB_ID,
        ACTOR_ID,
        TEMPLATE_KEYS.OVERDUE_NOTICE,
      ),
    ).resolves.toBeUndefined();
  });

  it("writes an auditLog entry after reset", async () => {
    const tx = buildMockTx();
    setMockTx(tx);

    await resetTemplate(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      TEMPLATE_KEYS.CHARGE_REMINDER_D0,
    );

    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
});
