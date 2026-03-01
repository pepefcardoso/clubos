import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendWhatsAppMessage } from "./whatsapp.service.js";
import { WhatsAppProviderError } from "./whatsapp.interface.js";

vi.mock("./whatsapp.registry.js", () => ({
  WhatsAppRegistry: {
    get: vi.fn(),
  },
}));

vi.mock("../../lib/crypto.js", () => ({
  decryptField: vi.fn(),
  getEncryptionKey: vi
    .fn()
    .mockReturnValue("test-key-32-chars-minimum-length!"),
}));

let _currentMockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_currentMockTx),
  ),
}));

import { WhatsAppRegistry } from "./whatsapp.registry.js";
import * as cryptoLib from "../../lib/crypto.js";

function buildMockTx(
  overrides: {
    messageCreate?: object;
    messageUpdate?: object;
    auditLogCreate?: object;
    messageCreateError?: Error;
    messageUpdateError?: Error;
    auditLogCreateError?: Error;
  } = {},
) {
  const defaultMessage = {
    id: "msg-test-001",
    memberId: "member-001",
    channel: "WHATSAPP",
    template: "charge_reminder_d3",
    status: "PENDING",
    createdAt: new Date(),
  };

  return {
    message: {
      create: overrides.messageCreateError
        ? vi.fn().mockRejectedValue(overrides.messageCreateError)
        : vi.fn().mockResolvedValue(overrides.messageCreate ?? defaultMessage),
      update: overrides.messageUpdateError
        ? vi.fn().mockRejectedValue(overrides.messageUpdateError)
        : vi.fn().mockResolvedValue(overrides.messageUpdate ?? {}),
    },
    auditLog: {
      create: overrides.auditLogCreateError
        ? vi.fn().mockRejectedValue(overrides.auditLogCreateError)
        : vi.fn().mockResolvedValue(overrides.auditLogCreate ?? {}),
    },
  };
}

function buildMockProvider(
  overrides: {
    name?: string;
    sendResult?: object;
    sendError?: Error;
  } = {},
) {
  return {
    name: overrides.name ?? "zapi",
    sendMessage: overrides.sendError
      ? vi.fn().mockRejectedValue(overrides.sendError)
      : vi.fn().mockResolvedValue(
          overrides.sendResult ?? {
            providerMessageId: "zap-provider-001",
            rawResponse: { zaapId: "zap-provider-001", status: "sent" },
          },
        ),
  };
}

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _currentMockTx = tx;
}

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-001";

const BASE_INPUT = {
  clubId: CLUB_ID,
  memberId: "member-001",
  encryptedPhone: new Uint8Array([1, 2, 3, 4]),
  template: "charge_reminder_d3",
  renderedBody: "Olá Alice! Sua mensalidade de R$ 99,00 vence amanhã.",
};

describe("sendWhatsAppMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("5511999990000");
  });

  describe("WT-1: successful send", () => {
    it("returns status SENT and providerMessageId when provider succeeds", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      const result = await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(result.status).toBe("SENT");
      expect(result.providerMessageId).toBe("zap-provider-001");
      expect(result.failReason).toBeUndefined();
    });

    it("sets sentAt on the Message row when status is SENT", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      const updateCall = tx.message.update.mock.calls[0]?.[0] as {
        data: { status: string; sentAt?: Date };
      };
      expect(updateCall.data.status).toBe("SENT");
      expect(updateCall.data.sentAt).toBeInstanceOf(Date);
    });

    it("creates the Message row with PENDING status before calling provider", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberId: "member-001",
            channel: "WHATSAPP",
            template: "charge_reminder_d3",
            status: "PENDING",
          }),
        }),
      );

      const createOrder = tx.message.create.mock.invocationCallOrder[0];
      const providerOrder = provider.sendMessage.mock.invocationCallOrder[0];
      expect(createOrder).toBeLessThan(providerOrder!);
    });

    it("returns the internal messageId from the created Message row", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx({
        messageCreate: {
          id: "msg-specific-id",
          status: "PENDING",
          memberId: "member-001",
          channel: "WHATSAPP",
          template: "charge_reminder_d3",
          createdAt: new Date(),
        },
      });
      setMockTx(tx);

      const result = await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(result.messageId).toBe("msg-specific-id");
    });
  });

  describe("WT-2: WhatsAppProviderError handling", () => {
    it("returns status FAILED without re-throwing when provider throws WhatsAppProviderError", async () => {
      const provider = buildMockProvider({
        sendError: new WhatsAppProviderError("Asaas network timeout", "zapi"),
      });
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      const result = await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(result.status).toBe("FAILED");
      expect(result.failReason).toBe("Asaas network timeout");
    });

    it("updates Message status to FAILED and omits sentAt", async () => {
      const provider = buildMockProvider({
        sendError: new WhatsAppProviderError("Z-API responded 503", "zapi"),
      });
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      const updateCall = tx.message.update.mock.calls[0]?.[0] as {
        data: { status: string; sentAt?: Date; failReason?: string };
      };
      expect(updateCall.data.status).toBe("FAILED");
      expect(updateCall.data.sentAt).toBeUndefined();
      expect(updateCall.data.failReason).toBe("Z-API responded 503");
    });
  });

  describe("WT-3: generic Error handling", () => {
    it("captures a plain Error as failReason and returns FAILED", async () => {
      const provider = buildMockProvider({
        sendError: new Error("Unexpected provider crash"),
      });
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      const result = await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(result.status).toBe("FAILED");
      expect(result.failReason).toBe("Unexpected provider crash");
    });

    it('captures non-Error throws as "Unknown provider error"', async () => {
      const provider = buildMockProvider();
      provider.sendMessage = vi.fn().mockRejectedValue("string-error");
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      const result = await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(result.status).toBe("FAILED");
      expect(result.failReason).toBe("Unknown provider error");
    });
  });

  describe("WT-4: decryptField failure propagation", () => {
    it("re-throws when decryptField fails (system misconfiguration)", async () => {
      vi.mocked(cryptoLib.decryptField).mockRejectedValue(
        new Error("pgp_sym_decrypt returned no result"),
      );

      const tx = buildMockTx();
      setMockTx(tx);

      await expect(
        sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT),
      ).rejects.toThrow("pgp_sym_decrypt returned no result");
    });

    it("does not create a Message row when decryptField throws", async () => {
      vi.mocked(cryptoLib.decryptField).mockRejectedValue(
        new Error("decrypt failed"),
      );

      const tx = buildMockTx();
      setMockTx(tx);

      await expect(
        sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT),
      ).rejects.toThrow();

      expect(tx.message.create).not.toHaveBeenCalled();
    });
  });

  describe("WT-5: AuditLog creation", () => {
    it("calls auditLog.create with action=MESSAGE_SENT and correct metadata on success", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT, "user-admin-001");

      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberId: "member-001",
            actorId: "user-admin-001",
            action: "MESSAGE_SENT",
            entityType: "Message",
            metadata: expect.objectContaining({
              channel: "WHATSAPP",
              template: "charge_reminder_d3",
              status: "SENT",
              providerMessageId: "zap-provider-001",
            }),
          }),
        }),
      );
    });

    it("includes failReason in AuditLog metadata when status is FAILED", async () => {
      const provider = buildMockProvider({
        sendError: new WhatsAppProviderError("Provider down", "zapi"),
      });
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      const auditCall = tx.auditLog.create.mock.calls[0]?.[0] as {
        data: { metadata: { failReason: string; status: string } };
      };
      expect(auditCall.data.metadata.status).toBe("FAILED");
      expect(auditCall.data.metadata.failReason).toBe("Provider down");
    });
  });

  describe("WT-6: phone normalization", () => {
    it("strips non-digit characters before passing phone to provider", async () => {
      vi.mocked(cryptoLib.decryptField).mockResolvedValue(
        "+55 (11) 99999-0000",
      );

      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(provider.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "5511999990000" }),
      );
    });

    it("passes already-normalized phone through unchanged", async () => {
      vi.mocked(cryptoLib.decryptField).mockResolvedValue("5511999990000");

      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(provider.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "5511999990000" }),
      );
    });

    it('normalizes phone with dashes and spaces: "55-11-99999-0000"', async () => {
      vi.mocked(cryptoLib.decryptField).mockResolvedValue("55-11-99999-0000");

      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(provider.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "55119999900000" }),
      );
    });
  });

  describe("WT-7: no registered provider", () => {
    it("returns FAILED result when WhatsAppRegistry.get throws", async () => {
      vi.mocked(WhatsAppRegistry.get).mockImplementation(() => {
        throw new Error("No WhatsApp provider registered.");
      });
      const tx = buildMockTx();
      setMockTx(tx);

      const result = await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(result.status).toBe("FAILED");
      expect(result.failReason).toContain("No WhatsApp provider registered.");
    });
  });

  describe("WT-8: actorId default", () => {
    it('uses "system:job" as actorId in AuditLog when not specified', async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actorId: "system:job" }),
        }),
      );
    });

    it("uses the provided actorId when specified", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx();
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT, "user-treasurer-007");

      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actorId: "user-treasurer-007" }),
        }),
      );
    });
  });

  describe("idempotency key", () => {
    it("passes internal message.id as idempotencyKey to provider", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx({
        messageCreate: {
          id: "msg-idempotent-key",
          status: "PENDING",
          memberId: "member-001",
          channel: "WHATSAPP",
          template: "charge_reminder_d3",
          createdAt: new Date(),
        },
      });
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(provider.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "msg-idempotent-key" }),
      );
    });
  });

  describe("message.update target", () => {
    it("updates the correct message by id", async () => {
      const provider = buildMockProvider();
      vi.mocked(WhatsAppRegistry.get).mockReturnValue(provider as never);
      const tx = buildMockTx({
        messageCreate: {
          id: "msg-target-123",
          status: "PENDING",
          memberId: "member-001",
          channel: "WHATSAPP",
          template: "charge_reminder_d3",
          createdAt: new Date(),
        },
      });
      setMockTx(tx);

      await sendWhatsAppMessage(PRISMA_STUB, BASE_INPUT);

      expect(tx.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "msg-target-123" } }),
      );
    });
  });
});
