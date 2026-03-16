import { describe, it, expect } from "vitest";
import { resolveQrDisplay } from "./QrCodeModal";
import type { ChargeListItem } from "@/lib/api/charges";

function makeCharge(
    overrides: Partial<ChargeListItem> = {},
): ChargeListItem {
    return {
        id: "chg_001",
        memberId: "mem_001",
        memberName: "João Silva",
        amountCents: 9900,
        dueDate: "2025-03-31T23:59:59.999Z",
        status: "PENDING",
        method: "PIX",
        gatewayName: "asaas",
        externalId: "ext_001",
        gatewayMeta: null,
        retryCount: 0,
        createdAt: "2025-03-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("resolveQrDisplay", () => {
    it("returns type 'none' when gatewayMeta is null", () => {
        const charge = makeCharge({ gatewayMeta: null });
        expect(resolveQrDisplay(charge)).toEqual({ type: "none" });
    });

    it("returns type 'none' for an empty meta object", () => {
        const charge = makeCharge({ gatewayMeta: {} });
        expect(resolveQrDisplay(charge)).toEqual({ type: "none" });
    });

    it("returns type 'base64' for Asaas/Pagarme meta with qrCodeBase64", () => {
        const charge = makeCharge({
            gatewayName: "asaas",
            gatewayMeta: {
                qrCodeBase64: "abc123==",
                pixCopyPaste: "00020126...",
            },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("base64");
        expect(result.imgSrc).toBe("data:image/png;base64,abc123==");
        expect(result.pixCopyPaste).toBe("00020126...");
    });

    it("returns type 'base64' for Pagarme meta (same shape as Asaas)", () => {
        const charge = makeCharge({
            gatewayName: "pagarme",
            gatewayMeta: {
                qrCodeBase64: "xyz789==",
                pixCopyPaste: "000201...",
            },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("base64");
        expect(result.imgSrc).toBe("data:image/png;base64,xyz789==");
    });

    it("returns type 'url' for Stripe meta (hosted PNG URL)", () => {
        const charge = makeCharge({
            gatewayName: "stripe",
            gatewayMeta: {
                qrCodeUrl: "https://stripe.com/qr/some-image.png",
                pixCopyPaste: "00020126stripe",
                paymentIntentId: "pi_abc",
            },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("url");
        expect(result.imgSrc).toBe("https://stripe.com/qr/some-image.png");
        expect(result.pixCopyPaste).toBe("00020126stripe");
    });

    it("returns type 'url' for Stripe even when pixCopyPaste is absent", () => {
        const charge = makeCharge({
            gatewayName: "stripe",
            gatewayMeta: {
                qrCodeUrl: "https://stripe.com/qr/img.png",
                paymentIntentId: "pi_xyz",
            },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("url");
        expect(result.pixCopyPaste).toBeUndefined();
    });

    it("returns type 'static_pix' for static PIX fallback meta", () => {
        const charge = makeCharge({
            gatewayName: null,
            gatewayMeta: { type: "static_pix", pixKey: "12345678000195" },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("static_pix");
        expect(result.pixKey).toBe("12345678000195");
    });

    it("prefers static_pix branch over qrCodeBase64 when type=static_pix is set", () => {
        const charge = makeCharge({
            gatewayName: null,
            gatewayMeta: {
                type: "static_pix",
                pixKey: "pix@clube.com",
                qrCodeBase64: "should-be-ignored",
            },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("static_pix");
        expect(result.pixKey).toBe("pix@clube.com");
    });

    it("returns type 'none' for offline CASH method with empty meta", () => {
        const charge = makeCharge({ method: "CASH", gatewayMeta: {} });
        expect(resolveQrDisplay(charge)).toEqual({ type: "none" });
    });

    it("does not return type 'url' for Asaas even if qrCodeUrl is somehow present", () => {
        const charge = makeCharge({
            gatewayName: "asaas",
            gatewayMeta: {
                qrCodeBase64: "realdata==",
                qrCodeUrl: "https://should-not-be-used.com",
                pixCopyPaste: "pix",
            },
        });
        const result = resolveQrDisplay(charge);
        expect(result.type).toBe("base64");
        expect(result.imgSrc).toBe("data:image/png;base64,realdata==");
    });
});