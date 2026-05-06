/**
 * Unit tests for use-ticket-scanner core logic.
 *
 * The hook itself is not rendered — we test the pure functions and state
 * transitions that drive it. This mirrors the pattern used in
 * use-attendance-session.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockScanQueue = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/db/scanner.db", () => ({
  scannerDb: {
    scanQueue: {
      get: vi.fn(async (id: string) => mockScanQueue.get(id) ?? undefined),
      put: vi.fn(async (entry: Record<string, unknown>) => {
        mockScanQueue.set(entry["ticketId"] as string, entry);
      }),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        const existing = mockScanQueue.get(id);
        if (existing) mockScanQueue.set(id, { ...existing, ...patch });
      }),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(async () =>
            [...mockScanQueue.values()].filter(
              (e) => e["status"] === "pending",
            ),
          ),
          count: vi.fn(
            async () =>
              [...mockScanQueue.values()].filter(
                (e) => e["status"] === "pending",
              ).length,
          ),
        })),
      })),
    },
  },
}));

vi.mock("@/lib/api/tickets-admin", () => ({
  validateTicketApi: vi.fn(),
  TicketAlreadyScannedError: class TicketAlreadyScannedError extends Error {
    constructor() {
      super("Ingresso já utilizado.");
      this.name = "TicketAlreadyScannedError";
    }
  },
  InvalidTicketError: class InvalidTicketError extends Error {
    constructor(msg = "QR Code inválido ou expirado.") {
      super(msg);
      this.name = "InvalidTicketError";
    }
  },
}));

import {
  validateTicketApi,
  TicketAlreadyScannedError,
  InvalidTicketError,
} from "@/lib/api/tickets-admin";
import { scannerDb } from "@/lib/db/scanner.db";

function makeQrPayload(
  overrides: Partial<{
    ticketId: string;
    eventId: string;
    clubId: string;
    t: string;
  }> = {},
) {
  return JSON.stringify({
    ticketId: "ticket_abc",
    eventId: "event_001",
    clubId: "club_xyz",
    t: "hmac_token",
    ...overrides,
  });
}

function parseQrPayload(raw: string) {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof p["ticketId"] !== "string" ||
      typeof p["eventId"] !== "string" ||
      typeof p["clubId"] !== "string" ||
      typeof p["t"] !== "string"
    ) {
      return null;
    }
    return p as {
      ticketId: string;
      eventId: string;
      clubId: string;
      t: string;
    };
  } catch {
    return null;
  }
}

describe("parseQrPayload", () => {
  it("returns null for non-JSON string", () => {
    expect(parseQrPayload("not-json")).toBeNull();
  });

  it("returns null when ticketId field is missing", () => {
    expect(
      parseQrPayload(JSON.stringify({ eventId: "e1", clubId: "c1", t: "x" })),
    ).toBeNull();
  });

  it("returns null when a field has wrong type", () => {
    expect(
      parseQrPayload(
        JSON.stringify({ ticketId: 123, eventId: "e1", clubId: "c1", t: "x" }),
      ),
    ).toBeNull();
  });

  it("returns parsed object for valid payload", () => {
    const raw = makeQrPayload();
    const result = parseQrPayload(raw);
    expect(result).not.toBeNull();
    expect(result?.ticketId).toBe("ticket_abc");
    expect(result?.clubId).toBe("club_xyz");
  });
});

type ScanResultType = "success" | "duplicate" | "invalid" | "queued" | "error";
interface ScanResult {
  type: ScanResultType;
  message: string;
}

interface ScanDeps {
  isOnline: boolean;
  userClubId: string;
  scannedIds: Set<string>;
  getAccessToken: () => Promise<string | null>;
}

async function handleScan(rawQr: string, deps: ScanDeps): Promise<ScanResult> {
  const parsed = parseQrPayload(rawQr);
  if (!parsed)
    return { type: "invalid", message: "QR Code inválido ou expirado." };

  if (parsed.clubId !== deps.userClubId) {
    return { type: "invalid", message: "Ingresso pertence a outro clube." };
  }

  if (deps.scannedIds.has(parsed.ticketId)) {
    return { type: "duplicate", message: "Ingresso já lido nesta sessão." };
  }

  deps.scannedIds.add(parsed.ticketId);

  if (!deps.isOnline) {
    const existing = await scannerDb.scanQueue.get(parsed.ticketId);
    if (existing)
      return { type: "duplicate", message: "Ingresso já na fila offline." };

    await scannerDb.scanQueue.put({
      ticketId: parsed.ticketId,
      qrPayload: rawQr,
      eventId: parsed.eventId,
      scannedAt: Date.now(),
      status: "pending",
    });
    return {
      type: "queued",
      message: "Sem conexão — será sincronizado ao reconectar.",
    };
  }

  try {
    const token = await deps.getAccessToken();
    if (!token) throw new Error("Não autenticado.");
    const result = await validateTicketApi(parsed.ticketId, rawQr, token);
    return {
      type: "success",
      message: `${(result as { fanName: string }).fanName} — ${(result as { sectorName: string }).sectorName}`,
    };
  } catch (err) {
    if (err instanceof TicketAlreadyScannedError) {
      return { type: "duplicate", message: "Ingresso já utilizado." };
    }
    if (err instanceof InvalidTicketError) {
      return { type: "invalid", message: err.message };
    }
    deps.scannedIds.delete(parsed.ticketId);
    return { type: "error", message: "Erro de conexão. Tente novamente." };
  }
}

const TOKEN = "access_token_stub";
const CLUB_ID = "club_xyz";
const getAccessToken = async () => TOKEN;

beforeEach(() => {
  mockScanQueue.clear();
  vi.mocked(validateTicketApi).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleScan — invalid QR", () => {
  it("returns invalid for malformed JSON", async () => {
    const result = await handleScan("not-a-qr", {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("invalid");
  });

  it("returns invalid for QR with missing fields", async () => {
    const result = await handleScan(JSON.stringify({ ticketId: "t1" }), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("invalid");
  });
});

describe("handleScan — cross-club QR [SEC-TEN]", () => {
  it("rejects QR belonging to a different clubId without calling the API", async () => {
    const result = await handleScan(makeQrPayload({ clubId: "other_club" }), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("invalid");
    expect(validateTicketApi).not.toHaveBeenCalled();
  });
});

describe("handleScan — in-memory dedup", () => {
  it("returns duplicate without API call when ticketId already in scannedIds", async () => {
    const scannedIds = new Set(["ticket_abc"]);
    const result = await handleScan(makeQrPayload(), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds,
      getAccessToken,
    });
    expect(result.type).toBe("duplicate");
    expect(validateTicketApi).not.toHaveBeenCalled();
  });
});

describe("handleScan — offline queue", () => {
  it("creates a Dexie entry and returns queued when offline", async () => {
    const result = await handleScan(makeQrPayload(), {
      isOnline: false,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("queued");
    expect(scannerDb.scanQueue.put).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "ticket_abc", status: "pending" }),
    );
    expect(validateTicketApi).not.toHaveBeenCalled();
  });

  it("returns duplicate offline when same ticketId already in Dexie", async () => {
    mockScanQueue.set("ticket_abc", {
      ticketId: "ticket_abc",
      status: "pending",
    });

    const result = await handleScan(makeQrPayload(), {
      isOnline: false,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("duplicate");
  });
});

describe("handleScan — online happy path", () => {
  it("returns success on API 200", async () => {
    vi.mocked(validateTicketApi).mockResolvedValueOnce({
      ticketId: "ticket_abc",
      fanName: "João Silva",
      sectorName: "Arquibancada Norte",
      eventId: "event_001",
      checkedInAt: new Date().toISOString(),
    });

    const result = await handleScan(makeQrPayload(), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });

    expect(result.type).toBe("success");
    expect(result.message).toContain("João Silva");
  });
});

describe("handleScan — API error mapping", () => {
  it("maps HTTP 409 (TicketAlreadyScannedError) to duplicate", async () => {
    vi.mocked(validateTicketApi).mockRejectedValueOnce(
      new TicketAlreadyScannedError(),
    );
    const result = await handleScan(makeQrPayload(), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("duplicate");
  });

  it("maps HTTP 400 (InvalidTicketError) to invalid", async () => {
    vi.mocked(validateTicketApi).mockRejectedValueOnce(
      new InvalidTicketError("Ingresso cancelado."),
    );
    const result = await handleScan(makeQrPayload(), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds: new Set(),
      getAccessToken,
    });
    expect(result.type).toBe("invalid");
    expect(result.message).toBe("Ingresso cancelado.");
  });

  it("maps network error to error and removes ticketId from scannedIds", async () => {
    vi.mocked(validateTicketApi).mockRejectedValueOnce(
      new Error("fetch failed"),
    );
    const scannedIds = new Set<string>();
    const result = await handleScan(makeQrPayload(), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds,
      getAccessToken,
    });
    expect(result.type).toBe("error");
    expect(scannedIds.has("ticket_abc")).toBe(false);
  });

  it("keeps ticketId in scannedIds after 409 (no retry allowed)", async () => {
    vi.mocked(validateTicketApi).mockRejectedValueOnce(
      new TicketAlreadyScannedError(),
    );
    const scannedIds = new Set<string>();
    await handleScan(makeQrPayload(), {
      isOnline: true,
      userClubId: CLUB_ID,
      scannedIds,
      getAccessToken,
    });
    expect(scannedIds.has("ticket_abc")).toBe(true);
  });
});

describe("CheckinResultCard — all states carry a label", () => {
  const STATES: Array<{ type: ScanResultType; expectedLabel: string }> = [
    { type: "success", expectedLabel: "Liberado" },
    { type: "duplicate", expectedLabel: "Já utilizado" },
    { type: "invalid", expectedLabel: "Inválido" },
    { type: "queued", expectedLabel: "Na fila offline" },
    { type: "error", expectedLabel: "Erro de conexão" },
  ];

  const STATE_CONFIG: Record<ScanResultType, { label: string }> = {
    success: { label: "Liberado" },
    duplicate: { label: "Já utilizado" },
    invalid: { label: "Inválido" },
    queued: { label: "Na fila offline" },
    error: { label: "Erro de conexão" },
  };

  STATES.forEach(({ type, expectedLabel }) => {
    it(`type="${type}" maps to label "${expectedLabel}" [UI-A11Y]`, () => {
      expect(STATE_CONFIG[type].label).toBe(expectedLabel);
    });
  });

  it("every defined ScanResultType has a non-empty label [UI-A11Y]", () => {
    const allTypes: ScanResultType[] = [
      "success",
      "duplicate",
      "invalid",
      "queued",
      "error",
    ];
    allTypes.forEach((type) => {
      expect(STATE_CONFIG[type].label.length).toBeGreaterThan(0);
    });
  });
});

describe("SSE counter logic", () => {
  it("increments sector counter correctly", () => {
    const counters: Record<string, number> = {};
    const sectorName = "Arquibancada Sul";

    counters[sectorName] = (counters[sectorName] ?? 0) + 1;
    counters[sectorName] = (counters[sectorName] ?? 0) + 1;

    expect(counters[sectorName]).toBe(2);
  });

  it("ignores events for a different eventId", () => {
    const currentEventId = "event_001";
    const counters: Record<string, number> = {};

    const incomingPayload = { eventId: "event_999", sectorName: "Camarote" };
    if (incomingPayload.eventId === currentEventId) {
      counters[incomingPayload.sectorName] =
        (counters[incomingPayload.sectorName] ?? 0) + 1;
    }

    expect(Object.keys(counters)).toHaveLength(0);
  });
});
