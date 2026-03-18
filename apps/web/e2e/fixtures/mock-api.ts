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
