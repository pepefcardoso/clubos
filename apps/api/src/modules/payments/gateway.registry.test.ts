import { describe, it, expect, beforeEach } from "vitest";
import { GatewayRegistry } from "./gateway.registry.js";
import type {
  PaymentGateway,
  PaymentMethod,
  CreateChargeInput,
  ChargeResult,
  WebhookEvent,
} from "./gateway.interface.js";

function makeGateway(
  name: string,
  methods: PaymentMethod[] = ["PIX"],
): PaymentGateway {
  return {
    name,
    supportedMethods: methods,
    createCharge: async (_input: CreateChargeInput): Promise<ChargeResult> => ({
      externalId: "ext-001",
      status: "PENDING",
      meta: {},
    }),
    cancelCharge: async (_externalId: string): Promise<void> => {},
    parseWebhook: (
      _rawBody: Buffer,
      _headers: Record<string, string | string[] | undefined>,
    ): WebhookEvent => ({
      type: "UNKNOWN",
      gatewayTxId: "",
      rawPayload: {},
    }),
  };
}

beforeEach(() => {
  GatewayRegistry._reset();
});

describe("GatewayRegistry.register()", () => {
  it("registers a gateway without throwing", () => {
    expect(() => GatewayRegistry.register(makeGateway("asaas"))).not.toThrow();
  });

  it("throws when the same gateway name is registered twice", () => {
    GatewayRegistry.register(makeGateway("asaas"));
    expect(() => GatewayRegistry.register(makeGateway("asaas"))).toThrow(
      /already registered/i,
    );
  });

  it("allows registering two gateways with different names", () => {
    expect(() => {
      GatewayRegistry.register(makeGateway("asaas"));
      GatewayRegistry.register(makeGateway("pagarme"));
    }).not.toThrow();
  });
});

describe("GatewayRegistry.get()", () => {
  it("returns the registered gateway by name", () => {
    const gw = makeGateway("asaas");
    GatewayRegistry.register(gw);
    expect(GatewayRegistry.get("asaas")).toBe(gw);
  });

  it("is case-insensitive (uppercase lookup)", () => {
    const gw = makeGateway("asaas");
    GatewayRegistry.register(gw);
    expect(GatewayRegistry.get("ASAAS")).toBe(gw);
  });

  it("is case-insensitive (mixed-case lookup)", () => {
    const gw = makeGateway("asaas");
    GatewayRegistry.register(gw);
    expect(GatewayRegistry.get("Asaas")).toBe(gw);
  });

  it("throws for an unknown gateway name", () => {
    expect(() => GatewayRegistry.get("unknown")).toThrow(/not registered/i);
  });

  it("error message includes the requested gateway name", () => {
    expect(() => GatewayRegistry.get("stripe")).toThrow(/stripe/i);
  });

  it("error message lists available gateways when registry is non-empty", () => {
    GatewayRegistry.register(makeGateway("asaas"));
    let message = "";
    try {
      GatewayRegistry.get("stripe");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("asaas");
  });
});

describe("GatewayRegistry.forMethod()", () => {
  it("returns a gateway that supports the requested method", () => {
    const gw = makeGateway("asaas", ["PIX", "BOLETO"]);
    GatewayRegistry.register(gw);
    expect(GatewayRegistry.forMethod("PIX")).toBe(gw);
  });

  it("resolves BOLETO when gateway supports it", () => {
    const gw = makeGateway("asaas", ["PIX", "BOLETO"]);
    GatewayRegistry.register(gw);
    expect(GatewayRegistry.forMethod("BOLETO")).toBe(gw);
  });

  it("throws when no gateway supports the method", () => {
    GatewayRegistry.register(makeGateway("asaas", ["PIX"]));
    expect(() => GatewayRegistry.forMethod("CASH")).toThrow(
      /no gateway registered/i,
    );
  });

  it("throws when the registry is empty", () => {
    expect(() => GatewayRegistry.forMethod("PIX")).toThrow(
      /no gateway registered/i,
    );
  });

  it("returns the first matching gateway when multiple are registered", () => {
    const first = makeGateway("asaas", ["PIX"]);
    const second = makeGateway("pagarme", ["PIX", "CREDIT_CARD"]);
    GatewayRegistry.register(first);
    GatewayRegistry.register(second);
    const resolved = GatewayRegistry.forMethod("PIX");
    expect(resolved).toBe(first);
  });

  it("falls through to the second gateway when the first does not support the method", () => {
    const pixOnly = makeGateway("asaas", ["PIX"]);
    const cardOnly = makeGateway("pagarme", ["CREDIT_CARD"]);
    GatewayRegistry.register(pixOnly);
    GatewayRegistry.register(cardOnly);
    expect(GatewayRegistry.forMethod("CREDIT_CARD")).toBe(cardOnly);
  });
});

describe("GatewayRegistry.list()", () => {
  it("returns an empty array when no gateways are registered", () => {
    expect(GatewayRegistry.list()).toEqual([]);
  });

  it("returns the name of a single registered gateway", () => {
    GatewayRegistry.register(makeGateway("asaas"));
    expect(GatewayRegistry.list()).toEqual(["asaas"]);
  });

  it("returns all registered gateway names", () => {
    GatewayRegistry.register(makeGateway("asaas"));
    GatewayRegistry.register(makeGateway("pagarme"));
    expect(GatewayRegistry.list()).toContain("asaas");
    expect(GatewayRegistry.list()).toContain("pagarme");
    expect(GatewayRegistry.list()).toHaveLength(2);
  });
});

describe("GatewayRegistry._reset()", () => {
  it("removes all registered gateways", () => {
    GatewayRegistry.register(makeGateway("asaas"));
    GatewayRegistry._reset();
    expect(GatewayRegistry.list()).toHaveLength(0);
  });

  it("allows re-registering the same name after a reset", () => {
    GatewayRegistry.register(makeGateway("asaas"));
    GatewayRegistry._reset();
    expect(() => GatewayRegistry.register(makeGateway("asaas"))).not.toThrow();
  });
});
