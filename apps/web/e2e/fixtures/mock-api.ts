import type { Page } from "@playwright/test";
import { ADMIN_TOKEN } from "./fake-token";

const API_BASE = process.env["PLAYWRIGHT_API_URL"] ?? "http://localhost:3001";

/**
 * Intercepts POST /api/auth/refresh and returns a successful auth response.
 * Register this BEFORE page.goto() so the AuthProvider bootstrap() call is
 * intercepted immediately on mount.
 */
export async function mockRefreshSuccess(
  page: Page,
  token = ADMIN_TOKEN,
): Promise<void> {
  await page.route(`${API_BASE}/api/auth/refresh`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: token }),
    }),
  );
}

/**
 * Intercepts POST /api/auth/refresh and returns 401.
 * Results in an unauthenticated AuthProvider state after bootstrap.
 */
export async function mockRefreshFailure(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/auth/refresh`, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or expired refresh token.",
      }),
    }),
  );
}

export async function mockLoginSuccess(
  page: Page,
  token = ADMIN_TOKEN,
): Promise<void> {
  await page.route(`${API_BASE}/api/auth/login`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: token,
        user: {
          id: "user-e2e-admin-001",
          email: "admin@clube.com",
          role: "ADMIN",
          clubId: "club-e2e-001",
        },
      }),
    }),
  );
}

export async function mockLoginFailure(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/auth/login`, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid credentials",
      }),
    }),
  );
}

export async function mockLogout(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/auth/logout`, (route) =>
    route.fulfill({ status: 204 }),
  );
}

/**
 * Minimal valid 1×1 PNG in base64 — avoids broken-image errors in headless.
 */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export interface FakeChargesResponseOverrides {
  data?: unknown[];
  total?: number;
  page?: number;
  limit?: number;
}

export function buildFakeChargesResponse(
  overrides: FakeChargesResponseOverrides = {},
) {
  const now = new Date();
  const dueDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28),
  ).toISOString();

  const defaultData = [
    {
      id: "chg-e2e-001",
      memberId: "mem-e2e-001",
      memberName: "João Silva",
      amountCents: 9900,
      dueDate,
      status: "PENDING",
      method: "PIX",
      gatewayName: "asaas",
      externalId: "ext-001",
      gatewayMeta: {
        qrCodeBase64: TINY_PNG_B64,
        pixCopyPaste: "00020126580014br.gov.bcb.pix0136test-key",
      },
      retryCount: 0,
      createdAt: now.toISOString(),
    },
  ];

  return {
    data: overrides.data ?? defaultData,
    total: overrides.total ?? (overrides.data ? overrides.data.length : 1),
    page: overrides.page ?? 1,
    limit: overrides.limit ?? 20,
  };
}

/**
 * Intercepts GET /api/charges* (wildcard).
 *
 * IMPORTANT: Register more-specific routes (e.g. /api/charges/generate) BEFORE
 * calling this helper — Playwright uses first-match ordering.
 */
export async function mockGetCharges(
  page: Page,
  responseOverrides: FakeChargesResponseOverrides = {},
): Promise<void> {
  await page.route(`${API_BASE}/api/charges?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildFakeChargesResponse(responseOverrides)),
    }),
  );
}

export async function mockGenerateChargesSuccess(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/charges/generate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated: 3,
        skipped: 1,
        errors: [],
        gatewayErrors: [],
        staticPixFallbackCount: 0,
      }),
    }),
  );
}

export async function mockGenerateChargesNoPlan(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/charges/generate`, (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 422,
        error: "Unprocessable Entity",
        message:
          "O clube não possui nenhum plano ativo. Crie ao menos um plano antes de gerar cobranças.",
      }),
    }),
  );
}

export function buildFakeAtRiskAthletesResponse(
  overrides: Partial<{ athletes: unknown[]; acwrDataAsOf: string }> = {},
) {
  return {
    athletes: overrides.athletes ?? [
      {
        athleteId: "athlete-e2e-001",
        athleteName: "Carlos Eduardo",
        position: "Atacante",
        currentAcwr: 1.45,
        currentRiskZone: "high",
        acwrDate: "2025-01-15",
        lastInjuryDate: "2025-01-10",
        lastInjuryStructure: "Isquiotibiais",
      },
    ],
    minAcwr: 1.3,
    acwrDataAsOf: overrides.acwrDataAsOf ?? "2025-01-15T08:00:00.000Z",
  };
}

export async function mockGetAtRiskAthletes(
  page: Page,
  responseOverrides: Parameters<typeof buildFakeAtRiskAthletesResponse>[0] = {},
): Promise<void> {
  await page.route(`${API_BASE}/api/workload/at-risk-athletes?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildFakeAtRiskAthletesResponse(responseOverrides)),
    }),
  );
}

export async function mockGetAtRiskAthletesEmpty(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/workload/at-risk-athletes?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        athletes: [],
        minAcwr: 1.3,
        acwrDataAsOf: null,
      }),
    }),
  );
}

export function buildFakeInjuryCorrelationResponse(
  overrides: Partial<{ events: unknown[]; totalEvents: number }> = {},
) {
  return {
    events: overrides.events ?? [
      {
        athleteId: "athlete-e2e-001",
        athleteName: "Carlos Eduardo",
        position: "Atacante",
        injuryDate: "2025-01-10",
        structure: "Isquiotibiais",
        grade: "GRADE_2",
        mechanism: "OVERUSE",
        acwrRatioAtInjury: 1.45,
        riskZoneAtInjury: "high",
        peakAcwrInWindow: 1.52,
      },
    ],
    totalEvents: overrides.totalEvents ?? 1,
    windowDays: 30,
    minAcwr: 1.3,
    acwrDataAsOf: "2025-01-15T08:00:00.000Z",
  };
}

export async function mockGetInjuryCorrelation(
  page: Page,
  responseOverrides: Parameters<
    typeof buildFakeInjuryCorrelationResponse
  >[0] = {},
): Promise<void> {
  await page.route(`${API_BASE}/api/workload/injury-correlation?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildFakeInjuryCorrelationResponse(responseOverrides),
      ),
    }),
  );
}

export async function mockGetInjuryCorrelationEmpty(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/workload/injury-correlation?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [],
        totalEvents: 0,
        windowDays: 30,
        minAcwr: 1.3,
        acwrDataAsOf: null,
      }),
    }),
  );
}

export async function mockGetMedicalRecords(
  page: Page,
  overrides: { data?: unknown[]; total?: number } = {},
): Promise<void> {
  const data = overrides.data ?? [
    {
      id: "mr-e2e-001",
      athleteId: "athlete-e2e-001",
      athleteName: "Carlos Eduardo",
      protocolId: null,
      occurredAt: "2025-01-10",
      structure: "Isquiotibiais",
      grade: "GRADE_2",
      mechanism: "OVERUSE",
      clinicalNotes: null,
      diagnosis: null,
      treatmentDetails: null,
      createdBy: "user-e2e-admin-001",
      createdAt: "2025-01-10T10:00:00.000Z",
      updatedAt: "2025-01-10T10:00:00.000Z",
    },
  ];
  await page.route(`${API_BASE}/api/medical-records?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data,
        total: overrides.total ?? (data as unknown[]).length,
        page: 1,
        limit: 20,
      }),
    }),
  );
}

/**
 * Intercepts POST /api/medical-records and returns a 201 with a fake record.
 *
 * IMPORTANT: Register this BEFORE mockGetMedicalRecords — Playwright uses
 * first-match ordering. The handler checks the HTTP method to avoid
 * intercepting GET /api/medical-records.
 */
export async function mockCreateMedicalRecordSuccess(
  page: Page,
): Promise<void> {
  await page.route(`${API_BASE}/api/medical-records`, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "mr-e2e-002",
        athleteId: "athlete-e2e-001",
        athleteName: "Carlos Eduardo",
        protocolId: null,
        occurredAt: "2025-01-20",
        structure: "LCA",
        grade: "GRADE_3",
        mechanism: "CONTACT",
        clinicalNotes: null,
        diagnosis: null,
        treatmentDetails: null,
        createdBy: "user-e2e-admin-001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
  });
}

/**
 * Intercepts GET /api/athletes/:id/rtp (wildcard athleteId).
 *
 * Pass `null` as status to simulate an athlete with no RTP record yet.
 */
export async function mockGetAthleteRtp(
  page: Page,
  status: "AFASTADO" | "RETORNO_PROGRESSIVO" | "LIBERADO" | null = "AFASTADO",
): Promise<void> {
  await page.route(`${API_BASE}/api/athletes/*/rtp`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        athleteId: "athlete-e2e-001",
        status,
        medicalRecordId: status ? "mr-e2e-001" : null,
        protocolId: null,
        clearedAt: status === "LIBERADO" ? new Date().toISOString() : null,
        clearedBy: null,
        notes: null,
        updatedAt: "2025-01-10T10:00:00.000Z",
      }),
    }),
  );
}

export async function mockGetInjuryProtocols(page: Page): Promise<void> {
  await page.route(`${API_BASE}/api/injury-protocols?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "proto-e2e-001",
            name: "Protocolo Grau II — Isquiotibiais",
            structure: "Isquiotibiais",
            grade: "GRADE_2",
            durationDays: 21,
            isActive: true,
          },
          {
            id: "proto-e2e-002",
            name: "Protocolo Grau III — LCA",
            structure: "LCA",
            grade: "GRADE_3",
            durationDays: 90,
            isActive: true,
          },
        ],
        total: 2,
        page: 1,
        limit: 100,
      }),
    }),
  );
}
