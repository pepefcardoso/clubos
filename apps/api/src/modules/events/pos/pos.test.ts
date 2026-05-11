import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPosCharge } from "./pos.service.js";
import {
  listPosProducts,
  createPosProduct,
  updatePosProduct,
  deletePosProduct,
  PosProductNotFoundError,
  DuplicatePosProductNameError,
} from "./products.service.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_p: unknown, _c: string, fn: (tx: unknown) => unknown) => fn(makePosTx()),
  ),
}));

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/env.js", () => ({
  getEnv: vi.fn().mockReturnValue({
    POS_PROVIDER: undefined,
    ACCESS_QR_SECRET: "test-secret-32chars-minimum!!!!!",
  }),
}));

vi.mock("../payments/gateway.registry.js", () => ({
  GatewayRegistry: {
    get: vi.fn(),
    listForMethod: vi.fn(),
  },
}));

vi.mock("../payments/gateway-fallback.js", () => ({
  createChargeWithFallback: vi.fn().mockResolvedValue({
    externalId: "pix_001",
    status: "PENDING",
    meta: { pixCopyPaste: "00020126...", qrCodeBase64: "abc123" },
  }),
}));

import { withTenantSchema } from "../../../lib/prisma.js";
import { GatewayRegistry } from "../../payments/gateway.registry.js";
import { createChargeWithFallback } from "../../payments/gateway-fallback.js";

const CLUB_ID = "clubabc123456789012345";
const EVENT_ID = "evt_01";
const ACTOR_ID = "user-admin-001";

function makePosTx(
  overrides: {
    productFindFirst?: object | null;
    productCreate?: object;
    productFindUnique?: object | null;
    productUpdate?: object;
    saleCreate?: object;
  } = {},
) {
  return {
    posProduct: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(overrides.productFindFirst ?? null),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.productFindUnique !== undefined
            ? overrides.productFindUnique
            : makeProductRow(),
        ),
      create: vi
        .fn()
        .mockResolvedValue(overrides.productCreate ?? makeProductRow()),
      update: vi
        .fn()
        .mockResolvedValue(overrides.productUpdate ?? makeProductRow()),
    },
    posSale: {
      create: vi.fn().mockResolvedValue(
        overrides.saleCreate ?? {
          id: "sale-01",
          eventId: EVENT_ID,
          productName: "Água",
          amountCents: 500,
          paymentMethod: "PIX",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ),
    },
  };
}

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-01",
    name: "Água",
    priceCents: 500,
    category: "Bebidas",
    stock: 100,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockPrisma = {} as Parameters<typeof createPosCharge>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makePosTx() as unknown as Parameters<typeof fn>[0]),
  );
});

describe("createPosCharge", () => {
  it("PIX method resolves via createChargeWithFallback", async () => {
    const tx = makePosTx();
    let callCount = 0;
    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, fn) => {
      callCount++;
      if (callCount === 2) return fn(tx as never);
      return fn(makePosTx() as never);
    });

    const result = await createPosCharge(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      { productName: "Água", amountCents: 500, method: "PIX" },
    );

    expect(createChargeWithFallback).toHaveBeenCalled();
    expect(result.saleId).toBeDefined();
    expect(Number.isInteger(result.amountCents)).toBe(true);
    expect(result.usedFallback).toBe(false);
  });

  it("CARD method with no POS_PROVIDER env falls back to PIX", async () => {
    const { getEnv } = await import("../../../lib/env.js");
    vi.mocked(getEnv).mockReturnValueOnce({ POS_PROVIDER: undefined } as never);

    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, fn) =>
      fn(makePosTx() as never),
    );

    const result = await createPosCharge(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      { productName: "Refrigerante", amountCents: 700, method: "CARD" },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.paymentMethod).toBe("PIX");
    expect(createChargeWithFallback).toHaveBeenCalled();
  });

  it("CARD method with POS_PROVIDER uses mPOS gateway", async () => {
    const { getEnv } = await import("../../../lib/env.js");
    vi.mocked(getEnv).mockReturnValue({ POS_PROVIDER: "pagarme" } as never);

    const mockMposGateway = {
      createCharge: vi.fn().mockResolvedValue({
        externalId: "mpos_001",
        status: "PENDING",
        meta: {},
      }),
    };
    vi.mocked(GatewayRegistry.get).mockReturnValue(mockMposGateway as never);

    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, fn) =>
      fn(makePosTx() as never),
    );

    const result = await createPosCharge(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      { productName: "Cerveja", amountCents: 1200, method: "CARD" },
    );

    expect(GatewayRegistry.get).toHaveBeenCalledWith("pagarme");
    expect(result.usedFallback).toBe(false);
  });

  it("CARD with POS_PROVIDER gateway failure falls back to PIX", async () => {
    const { getEnv } = await import("../../../lib/env.js");
    vi.mocked(getEnv).mockReturnValue({ POS_PROVIDER: "pagarme" } as never);

    vi.mocked(GatewayRegistry.get).mockReturnValue({
      createCharge: vi.fn().mockRejectedValue(new Error("mPOS timeout")),
    } as never);

    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, fn) =>
      fn(makePosTx() as never),
    );

    const result = await createPosCharge(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      { productName: "Agua", amountCents: 500, method: "CARD" },
    );

    expect(result.usedFallback).toBe(true);
    expect(createChargeWithFallback).toHaveBeenCalled();
  });

  it("amountCents in result is always an integer [FIN]", async () => {
    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, fn) =>
      fn(
        makePosTx({
          saleCreate: {
            id: "s1",
            eventId: EVENT_ID,
            productName: "Suco",
            amountCents: 700,
            paymentMethod: "PIX",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }) as never,
      ),
    );

    const result = await createPosCharge(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      { productName: "Suco", amountCents: 700, method: "PIX" },
    );

    expect(Number.isInteger(result.amountCents)).toBe(true);
  });
});

describe("listPosProducts", () => {
  it("returns active products only when activeOnly=true", async () => {
    const products = [
      makeProductRow(),
      makeProductRow({ id: "prod-02", isActive: false }),
    ];
    const tx = {
      posProduct: {
        findMany: vi.fn().mockResolvedValue([products[0]!]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    const result = await listPosProducts(mockPrisma, CLUB_ID, {
      activeOnly: true,
    });

    const findManyCall = vi.mocked(tx.posProduct.findMany).mock
      .calls[0]![0] as { where: Record<string, unknown> };
    expect(findManyCall.where).toEqual({ isActive: true });
    expect(result.total).toBe(1);
  });

  it("returns all products when activeOnly=false", async () => {
    const tx = {
      posProduct: {
        findMany: vi.fn().mockResolvedValue([makeProductRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await listPosProducts(mockPrisma, CLUB_ID, { activeOnly: false });

    const call = vi.mocked(tx.posProduct.findMany).mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({});
  });
});

describe("createPosProduct", () => {
  it("creates product and returns PosProductResponse", async () => {
    const tx = makePosTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    const result = await createPosProduct(mockPrisma, CLUB_ID, {
      name: "Água",
      priceCents: 500,
    });

    expect(result.id).toBeDefined();
    expect(Number.isInteger(result.priceCents)).toBe(true);
  });

  it("throws DuplicatePosProductNameError when active product with same name exists", async () => {
    const tx = makePosTx({ productFindFirst: makeProductRow() });
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await expect(
      createPosProduct(mockPrisma, CLUB_ID, { name: "Água", priceCents: 500 }),
    ).rejects.toBeInstanceOf(DuplicatePosProductNameError);
  });
});

describe("updatePosProduct", () => {
  it("updates only provided fields", async () => {
    const tx = makePosTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await updatePosProduct(mockPrisma, CLUB_ID, "prod-01", {
      name: "Água Mineral",
    });

    const call = vi.mocked(tx.posProduct.update).mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toHaveProperty("name", "Água Mineral");
    expect(call.data).not.toHaveProperty("priceCents");
  });

  it("throws PosProductNotFoundError when product is absent", async () => {
    const tx = makePosTx({ productFindUnique: null });
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await expect(
      updatePosProduct(mockPrisma, CLUB_ID, "ghost", { name: "X" }),
    ).rejects.toBeInstanceOf(PosProductNotFoundError);
  });
});

describe("deletePosProduct", () => {
  it("sets isActive=false instead of hard delete", async () => {
    const tx = makePosTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await deletePosProduct(mockPrisma, CLUB_ID, "prod-01");

    expect(tx.posProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it("throws PosProductNotFoundError when product is absent", async () => {
    const tx = makePosTx({ productFindUnique: null });
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await expect(
      deletePosProduct(mockPrisma, CLUB_ID, "ghost"),
    ).rejects.toBeInstanceOf(PosProductNotFoundError);
  });
});
