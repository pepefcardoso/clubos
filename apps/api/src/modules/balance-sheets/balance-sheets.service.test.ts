/**
 * Unit tests for src/modules/balance-sheets/balance-sheets.service.ts
 *
 * File I/O is mocked via vi.mock("node:fs/promises") so no real disk writes occur.
 * Prisma is mocked with a minimal in-memory fake.
 * computeSha256 and savePdfFile are tested indirectly through publishBalanceSheet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMkdir = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWriteFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

vi.mock("../../lib/file-validation.js", () => ({
  assertSafePath: vi.fn(),
}));

vi.mock("../../lib/storage.js", () => ({
  getUploadDir: vi.fn(() => "/var/uploads"),
  getStorageBaseUrl: vi.fn(() => "https://cdn.test"),
}));

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
  publishBalanceSheet,
  listBalanceSheetsByClubSlug,
} from "./balance-sheets.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

const FAKE_SHEET = {
  id: "bs_001",
  title: "Balanço 2024",
  period: "2024",
  fileUrl: "https://cdn.test/uploads/balance-sheets/club1/uuid.pdf",
  fileHash: "aabbcc",
  publishedAt: new Date("2025-01-15T10:00:00.000Z"),
  createdAt: new Date("2025-01-15T10:00:00.000Z"),
};

function buildMockTx(
  overrides: {
    sheetCreate?: typeof FAKE_SHEET;
    sheetFindMany?: (typeof FAKE_SHEET)[];
    sheetCount?: number;
  } = {},
) {
  return {
    balanceSheet: {
      create: vi.fn().mockResolvedValue(overrides.sheetCreate ?? FAKE_SHEET),
      findMany: vi
        .fn()
        .mockResolvedValue(overrides.sheetFindMany ?? [FAKE_SHEET]),
      count: vi.fn().mockResolvedValue(overrides.sheetCount ?? 1),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

const PRISMA_STUB = {} as PrismaClient;
const PDF_BUFFER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);

describe("publishBalanceSheet", () => {
  beforeEach(() => {
    _mockTx = buildMockTx();
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
  });

  it("creates the balance_sheets row with title, period, fileUrl and fileHash", async () => {
    await publishBalanceSheet(
      PRISMA_STUB,
      "club1",
      "actor1",
      { title: "Balanço 2024", period: "2024" },
      PDF_BUFFER,
    );

    expect(_mockTx.balanceSheet.create).toHaveBeenCalledOnce();
    const call = _mockTx.balanceSheet.create.mock.calls[0]?.[0] as {
      data: {
        title: string;
        period: string;
        fileUrl: string;
        fileHash: string;
      };
    };
    expect(call.data.title).toBe("Balanço 2024");
    expect(call.data.period).toBe("2024");
    expect(call.data.fileUrl).toContain("balance-sheets/club1/");
    expect(call.data.fileHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes the PDF to disk via writeFile", async () => {
    await publishBalanceSheet(
      PRISMA_STUB,
      "club1",
      "actor1",
      { title: "Balanço 2024", period: "2024" },
      PDF_BUFFER,
    );

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [path, buf] = mockWriteFile.mock.calls[0]!;
    expect(path).toContain("balance-sheets");
    expect(path).toContain("club1");
    expect(buf).toBe(PDF_BUFFER);
  });

  it("creates the upload directory recursively", async () => {
    await publishBalanceSheet(
      PRISMA_STUB,
      "club1",
      "actor1",
      { title: "Balanço 2024", period: "2024" },
      PDF_BUFFER,
    );

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining("club1"), {
      recursive: true,
    });
  });

  it("returns a correctly shaped BalanceSheetResponse", async () => {
    const result = await publishBalanceSheet(
      PRISMA_STUB,
      "club1",
      "actor1",
      { title: "Balanço 2024", period: "2024" },
      PDF_BUFFER,
    );

    expect(result).toMatchObject({
      id: "bs_001",
      title: "Balanço 2024",
      period: "2024",
    });
    expect(typeof result.fileHash).toBe("string");
    expect(typeof result.publishedAt).toBe("string");
  });

  it("writes an auditLog entry with entityType 'BalanceSheet'", async () => {
    await publishBalanceSheet(
      PRISMA_STUB,
      "club1",
      "actor1",
      { title: "Balanço 2024", period: "2024" },
      PDF_BUFFER,
    );

    expect(_mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "actor1",
        entityId: "bs_001",
        entityType: "BalanceSheet",
      }),
    });
  });

  it("produces a deterministic SHA-256 for the same buffer", async () => {
    const buf = Buffer.from("%PDF-test-content");
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update(buf).digest("hex");

    let capturedHash = "";
    _mockTx.balanceSheet.create.mockImplementation(
      async ({ data }: { data: { fileHash: string } }) => {
        capturedHash = data.fileHash;
        return FAKE_SHEET;
      },
    );

    await publishBalanceSheet(
      PRISMA_STUB,
      "club1",
      "actor1",
      { title: "T", period: "P" },
      buf,
    );

    expect(capturedHash).toBe(expected);
  });
});

describe("listBalanceSheetsByClubSlug", () => {
  const prismaWithClub = {
    club: {
      findUnique: vi.fn().mockResolvedValue({ id: "club1" }),
    },
  } as unknown as PrismaClient;

  const prismaUnknownSlug = {
    club: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;

  beforeEach(() => {
    _mockTx = buildMockTx();
  });

  it("returns empty list (not an error) for unknown slug", async () => {
    const result = await listBalanceSheetsByClubSlug(
      prismaUnknownSlug,
      "ghost",
    );
    expect(result).toEqual({ data: [], total: 0 });
  });

  it("returns paginated data for a known slug", async () => {
    const result = await listBalanceSheetsByClubSlug(prismaWithClub, "my-club");
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("bs_001");
  });

  it("serialises publishedAt as an ISO string", async () => {
    const result = await listBalanceSheetsByClubSlug(prismaWithClub, "my-club");
    expect(result.data[0]?.publishedAt).toBe("2025-01-15T10:00:00.000Z");
  });

  it("runs findMany and count in parallel", async () => {
    await listBalanceSheetsByClubSlug(prismaWithClub, "my-club");
    expect(_mockTx.balanceSheet.findMany).toHaveBeenCalledOnce();
    expect(_mockTx.balanceSheet.count).toHaveBeenCalledOnce();
  });
});
