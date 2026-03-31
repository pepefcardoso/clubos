import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../../generated/prisma/index.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn({}),
  ),
}));

vi.mock("../integrations.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../integrations.service.js")>();
  return {
    ...original,
    verifyIntegrationToken: vi.fn(),
    ingestWorkloadFromToken: vi.fn(),
  };
});

import {
  verifyIntegrationToken,
  ingestWorkloadFromToken,
} from "../integrations.service.js";
import { integrationIngestRoutes } from "../integrations.ingest.routes.js";
import { UnauthorizedError, NotFoundError } from "../../../lib/errors.js";

const CLUB_ID = "testclubid0000000001";
const VALID_TOKEN = "a".repeat(64);

const METRIC_RESPONSE = {
  id: "metric_001",
  athleteId: "ath-001",
  date: new Date("2024-06-01"),
  rpe: 7,
  durationMinutes: 60,
  trainingLoadAu: 420,
  sessionType: "TRAINING",
  notes: null,
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", {} as PrismaClient);
  await app.register(integrationIngestRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

function authHeaders(token = VALID_TOKEN) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-club-id": CLUB_ID,
  };
}

const NORMALIZED_BODY = {
  athleteId: "ath-001",
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
};

const HEALTHKIT_BODY = {
  workoutActivityType: "HKWorkoutActivityTypeSoccer",
  duration: 3600,
  startDate: "2024-06-01T09:00:00.000Z",
  endDate: "2024-06-01T10:00:00.000Z",
  athleteId: "ath-001",
  rpe: 7,
};

const GOOGLEFIT_BODY = {
  activityType: 93,
  durationMillis: 3_600_000,
  startTimeMillis: 1717228800000,
  athleteId: "ath-001",
  rpe: 7,
};

describe("POST /ingest/workload — normalized payload", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
    vi.mocked(verifyIntegrationToken).mockResolvedValue({
      athleteId: "ath-001",
      tokenId: "tok-001",
    });
    vi.mocked(ingestWorkloadFromToken).mockResolvedValue(METRIC_RESPONSE);
  });

  afterEach(() => app.close());

  it("returns 201 with the created metric for a valid normalized payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: NORMALIZED_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "metric_001", trainingLoadAu: 420 });
  });

  it("calls verifyIntegrationToken with the correct prisma, clubId, and rawToken", async () => {
    await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: NORMALIZED_BODY,
    });
    expect(verifyIntegrationToken).toHaveBeenCalledWith(
      expect.anything(),
      CLUB_ID,
      VALID_TOKEN,
    );
  });

  it("calls ingestWorkloadFromToken with the correct tokenId and payload", async () => {
    await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: NORMALIZED_BODY,
    });
    expect(ingestWorkloadFromToken).toHaveBeenCalledWith(
      expect.anything(),
      CLUB_ID,
      "tok-001",
      expect.objectContaining({ athleteId: "ath-001", rpe: 7 }),
    );
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { "content-type": "application/json", "x-club-id": CLUB_ID },
      payload: NORMALIZED_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(verifyIntegrationToken).not.toHaveBeenCalled();
  });

  it("returns 401 when Bearer token is not 64 hex chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders("short-token"),
      payload: NORMALIZED_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(verifyIntegrationToken).not.toHaveBeenCalled();
  });

  it("returns 400 when x-club-id header is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: NORMALIZED_BODY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("x-club-id"),
    });
  });

  it("returns 401 when verifyIntegrationToken throws UnauthorizedError", async () => {
    vi.mocked(verifyIntegrationToken).mockRejectedValue(
      new UnauthorizedError("Token inválido ou revogado."),
    );
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: NORMALIZED_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(ingestWorkloadFromToken).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid normalized payload (bad date format)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: { ...NORMALIZED_BODY, date: "01/06/2024" },
    });
    expect(res.statusCode).toBe(400);
    expect(ingestWorkloadFromToken).not.toHaveBeenCalled();
  });

  it("returns 400 for rpe out of range", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: { ...NORMALIZED_BODY, rpe: 0 },
    });
    expect(res.statusCode).toBe(400);
    expect(ingestWorkloadFromToken).not.toHaveBeenCalled();
  });

  it("returns 404 when ingestWorkloadFromToken throws NotFoundError (unknown athlete)", async () => {
    vi.mocked(ingestWorkloadFromToken).mockRejectedValue(
      new NotFoundError("Atleta não encontrado."),
    );
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: NORMALIZED_BODY,
    });
    expect(res.statusCode).toBe(404);
  });

  it("idempotencyKey is forwarded to ingestWorkloadFromToken", async () => {
    const key = "aabbccddeeff00112233445566778899";
    await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: authHeaders(),
      payload: { ...NORMALIZED_BODY, idempotencyKey: key },
    });
    expect(ingestWorkloadFromToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ idempotencyKey: key }),
    );
  });

  it("returns 401 with standard error shape on missing token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { "content-type": "application/json", "x-club-id": CLUB_ID },
      payload: NORMALIZED_BODY,
    });
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
    });
  });
});

describe("POST /ingest/workload — HealthKit provider", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
    vi.mocked(verifyIntegrationToken).mockResolvedValue({
      athleteId: "ath-001",
      tokenId: "tok-001",
    });
    vi.mocked(ingestWorkloadFromToken).mockResolvedValue(METRIC_RESPONSE);
  });

  afterEach(() => app.close());

  it("returns 201 for a valid HealthKit payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { ...authHeaders(), "x-provider": "healthkit" },
      payload: HEALTHKIT_BODY,
    });
    expect(res.statusCode).toBe(201);
  });

  it("normalizes HealthKit payload before forwarding (sessionType=TRAINING for Soccer)", async () => {
    await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { ...authHeaders(), "x-provider": "healthkit" },
      payload: HEALTHKIT_BODY,
    });
    expect(ingestWorkloadFromToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        sessionType: "TRAINING",
        sourceProvider: "healthkit",
      }),
    );
  });

  it("returns 400 for invalid HealthKit payload (negative duration)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { ...authHeaders(), "x-provider": "healthkit" },
      payload: { ...HEALTHKIT_BODY, duration: -100 },
    });
    expect(res.statusCode).toBe(400);
    expect(ingestWorkloadFromToken).not.toHaveBeenCalled();
  });
});

describe("POST /ingest/workload — Google Fit provider", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
    vi.mocked(verifyIntegrationToken).mockResolvedValue({
      athleteId: "ath-001",
      tokenId: "tok-001",
    });
    vi.mocked(ingestWorkloadFromToken).mockResolvedValue(METRIC_RESPONSE);
  });

  afterEach(() => app.close());

  it("returns 201 for a valid Google Fit payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { ...authHeaders(), "x-provider": "google_fit" },
      payload: GOOGLEFIT_BODY,
    });
    expect(res.statusCode).toBe(201);
  });

  it("normalizes Google Fit payload before forwarding (sourceProvider=google_fit)", async () => {
    await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { ...authHeaders(), "x-provider": "google_fit" },
      payload: GOOGLEFIT_BODY,
    });
    expect(ingestWorkloadFromToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ sourceProvider: "google_fit" }),
    );
  });

  it("returns 400 for invalid Google Fit payload (negative durationMillis)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ingest/workload",
      headers: { ...authHeaders(), "x-provider": "google_fit" },
      payload: { ...GOOGLEFIT_BODY, durationMillis: -1 },
    });
    expect(res.statusCode).toBe(400);
    expect(ingestWorkloadFromToken).not.toHaveBeenCalled();
  });
});
