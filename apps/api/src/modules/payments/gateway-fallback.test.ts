import { describe, it, expect, vi } from "vitest";
import { createChargeWithFallback } from "./gateway-fallback.js";
import type {
  PaymentGateway,
  CreateChargeInput,
  ChargeResult,
} from "./gateway.interface.js";

const BASE_INPUT: CreateChargeInput = {
  amountCents: 9900,
  dueDate: new Date("2025-12-31"),
  method: "PIX",
  customer: { name: "Test User", cpf: "12345678900", phone: "11999990000" },
  idempotencyKey: "idem-001",
};

const SUCCESS_RESULT: ChargeResult = {
  externalId: "ext-001",
  status: "PENDING",
  meta: {
    qrCodeBase64: "abc123",
    pixCopyPaste: "00020126580014br.gov.bcb.pix...",
  },
};

function makeGateway(name: string, fails = false): PaymentGateway {
  return {
    name,
    supportedMethods: ["PIX"],
    createCharge: fails
      ? vi.fn().mockRejectedValue(new Error(`${name} unavailable`))
      : vi.fn().mockResolvedValue(SUCCESS_RESULT),
    cancelCharge: vi.fn(),
    parseWebhook: vi.fn(),
  } as unknown as PaymentGateway;
}

describe("createChargeWithFallback — primary gateway succeeds", () => {
  it("returns result from first gateway when it succeeds", async () => {
    const gw = makeGateway("asaas");
    const result = await createChargeWithFallback([gw], BASE_INPUT);

    expect(result.resolvedGatewayName).toBe("asaas");
    expect(result.isStaticFallback).toBe(false);
    expect(result.externalId).toBe("ext-001");
    expect(result.attemptErrors).toHaveLength(0);
  });

  it("calls only the first gateway when it succeeds", async () => {
    const first = makeGateway("asaas");
    const second = makeGateway("pagarme");
    await createChargeWithFallback([first, second], BASE_INPUT);

    expect(first.createCharge).toHaveBeenCalledOnce();
    expect(second.createCharge).not.toHaveBeenCalled();
  });

  it("passes the full CreateChargeInput to the gateway", async () => {
    const gw = makeGateway("asaas");
    await createChargeWithFallback([gw], BASE_INPUT);

    expect(gw.createCharge).toHaveBeenCalledWith(BASE_INPUT);
  });

  it("spreads all ChargeResult fields into the return value", async () => {
    const gw = makeGateway("asaas");
    const result = await createChargeWithFallback([gw], BASE_INPUT);

    expect(result.status).toBe("PENDING");
    expect(result.meta).toEqual(SUCCESS_RESULT.meta);
  });
});

describe("createChargeWithFallback — primary fails, secondary succeeds", () => {
  it("falls through to second gateway when first throws", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme");
    const result = await createChargeWithFallback([first, second], BASE_INPUT);

    expect(result.resolvedGatewayName).toBe("pagarme");
    expect(result.isStaticFallback).toBe(false);
  });

  it("records the first gateway's error in attemptErrors", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme");
    const result = await createChargeWithFallback([first, second], BASE_INPUT);

    expect(result.attemptErrors).toHaveLength(1);
    expect(result.attemptErrors[0]!.gatewayName).toBe("asaas");
    expect(result.attemptErrors[0]!.error).toContain("unavailable");
  });

  it("attemptErrors is empty when secondary also has no prior failures", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme");
    const result = await createChargeWithFallback([first, second], BASE_INPUT);

    expect(result.attemptErrors).toHaveLength(1);
  });

  it("calls both gateways in order", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme");
    await createChargeWithFallback([first, second], BASE_INPUT);

    expect(first.createCharge).toHaveBeenCalledOnce();
    expect(second.createCharge).toHaveBeenCalledOnce();
  });
});

describe("createChargeWithFallback — all gateways fail, static PIX fallback", () => {
  it("returns static PIX result when pixKeyFallback is provided", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme", true);
    const result = await createChargeWithFallback([first, second], BASE_INPUT, {
      pixKeyFallback: "clube@email.com",
    });

    expect(result.isStaticFallback).toBe(true);
    expect(result.resolvedGatewayName).toBeNull();
    expect(result.meta["type"]).toBe("static_pix");
    expect(result.meta["pixKey"]).toBe("clube@email.com");
    expect(result.externalId).toBe("");
    expect(result.status).toBe("PENDING");
  });

  it("records all gateway errors in attemptErrors before static fallback", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme", true);
    const result = await createChargeWithFallback([first, second], BASE_INPUT, {
      pixKeyFallback: "11999990000",
    });

    expect(result.attemptErrors).toHaveLength(2);
    expect(result.attemptErrors[0]!.gatewayName).toBe("asaas");
    expect(result.attemptErrors[1]!.gatewayName).toBe("pagarme");
  });

  it("includes the pixKey in meta for frontend display", async () => {
    const gw = makeGateway("asaas", true);
    const result = await createChargeWithFallback([gw], BASE_INPUT, {
      pixKeyFallback: "12345678000199",
    });

    expect(result.meta["pixKey"]).toBe("12345678000199");
  });

  it("works with a phone number as pixKeyFallback", async () => {
    const gw = makeGateway("asaas", true);
    const result = await createChargeWithFallback([gw], BASE_INPUT, {
      pixKeyFallback: "+5511999990000",
    });

    expect(result.isStaticFallback).toBe(true);
    expect(result.meta["pixKey"]).toBe("+5511999990000");
  });
});

describe("createChargeWithFallback — all gateways fail, no static PIX", () => {
  it("throws when all gateways fail and no pixKeyFallback is set", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme", true);

    await expect(
      createChargeWithFallback([first, second], BASE_INPUT),
    ).rejects.toThrow(/all payment gateways failed/i);
  });

  it("error message includes the last gateway name", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme", true);

    await expect(
      createChargeWithFallback([first, second], BASE_INPUT),
    ).rejects.toThrow(/pagarme/i);
  });

  it("error message includes the last gateway's error text", async () => {
    const first = makeGateway("asaas", true);
    const second = makeGateway("pagarme", true);

    await expect(
      createChargeWithFallback([first, second], BASE_INPUT),
    ).rejects.toThrow(/pagarme unavailable/i);
  });

  it("throws when all gateways fail and pixKeyFallback is null", async () => {
    const gw = makeGateway("asaas", true);

    await expect(
      createChargeWithFallback([gw], BASE_INPUT, { pixKeyFallback: null }),
    ).rejects.toThrow();
  });

  it("throws when all gateways fail and pixKeyFallback is undefined", async () => {
    const gw = makeGateway("asaas", true);

    await expect(
      createChargeWithFallback([gw], BASE_INPUT, { pixKeyFallback: undefined }),
    ).rejects.toThrow();
  });
});

describe("createChargeWithFallback — empty gateway list", () => {
  it("falls through to static PIX immediately when list is empty and key is set", async () => {
    const result = await createChargeWithFallback([], BASE_INPUT, {
      pixKeyFallback: "12345678000199",
    });

    expect(result.isStaticFallback).toBe(true);
    expect(result.resolvedGatewayName).toBeNull();
    expect(result.attemptErrors).toHaveLength(0);
  });

  it("static PIX result has correct meta shape when list is empty", async () => {
    const result = await createChargeWithFallback([], BASE_INPUT, {
      pixKeyFallback: "clube@pix.com",
    });

    expect(result.meta).toEqual({
      type: "static_pix",
      pixKey: "clube@pix.com",
    });
  });

  it("throws with 'no payment gateway available' when list is empty and no pixKeyFallback", async () => {
    await expect(createChargeWithFallback([], BASE_INPUT)).rejects.toThrow(
      /no payment gateway available/i,
    );
  });

  it("throws when list is empty and pixKeyFallback is null", async () => {
    await expect(
      createChargeWithFallback([], BASE_INPUT, { pixKeyFallback: null }),
    ).rejects.toThrow(/no payment gateway available/i);
  });
});

describe("createChargeWithFallback — non-Error gateway throws", () => {
  it("captures string throws in attemptErrors", async () => {
    const gw: PaymentGateway = {
      name: "weird-gw",
      supportedMethods: ["PIX"],
      createCharge: vi.fn().mockRejectedValue("string error"),
      cancelCharge: vi.fn(),
      parseWebhook: vi.fn(),
    } as unknown as PaymentGateway;

    const result = await createChargeWithFallback([gw], BASE_INPUT, {
      pixKeyFallback: "key123",
    });

    expect(result.isStaticFallback).toBe(true);
    expect(result.attemptErrors[0]!.error).toBe("string error");
  });
});
