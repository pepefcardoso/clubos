import { test, expect } from "../fixtures/auth.fixture";
import {
  mockGetCharges,
  mockGenerateChargesSuccess,
  mockGenerateChargesNoPlan,
  mockRefreshSuccess,
  buildFakeChargesResponse,
} from "../fixtures/mock-api";
import { ChargesPage } from "../page-objects/charges.page";
import { TREASURER_TOKEN } from "../fixtures/fake-token";

const API_BASE = process.env["PLAYWRIGHT_API_URL"] ?? "http://localhost:3001";

test.describe("Charges Page — ADMIN user", () => {
  test("renders the page heading and charges table", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(cp.heading).toBeVisible();
    await expect(cp.chargesTable).toBeVisible();
  });

  test("displays a charge row with correct member name and formatted amount", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(
      page.getByRole("cell", { name: "João Silva", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /R\$\s*99[,.]00/i }),
    ).toBeVisible();
  });

  test("shows empty state when the API returns an empty list", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page, { data: [], total: 0 });
    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(cp.emptyState).toBeVisible();
    await expect(cp.chargesTable).toBeVisible();
  });

  test("shows 'Gerar cobranças' button for ADMIN role", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(cp.generateButton).toBeVisible();
    await expect(cp.generateButton).toBeEnabled();
  });

  test("shows success toast with generated count after charge generation", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGenerateChargesSuccess(page);
    await mockGetCharges(page);

    const cp = new ChargesPage(page);
    await cp.goto();
    await cp.generateButton.click();

    const toast = cp.getToastWith(/3 cobranças geradas/i);
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test("includes skipped count in success toast when applicable", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGenerateChargesSuccess(page);
    await mockGetCharges(page);

    const cp = new ChargesPage(page);
    await cp.goto();
    await cp.generateButton.click();

    const toast = cp.getToastWith(/ignorada/i);
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test("shows error toast when club has no active plan (422)", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGenerateChargesNoPlan(page);
    await mockGetCharges(page);

    const cp = new ChargesPage(page);
    await cp.goto();
    await cp.generateButton.click();

    const toast = cp.getToastWith(/plano ativo/i);
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test("generate button shows 'Gerando…' and is disabled during the request", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    let resolveFulfill!: () => void;
    const fulfillReady = new Promise<void>((res) => {
      resolveFulfill = res;
    });

    await page.route(`${API_BASE}/api/charges/generate`, async (route) => {
      await fulfillReady;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generated: 0,
          skipped: 0,
          errors: [],
          gatewayErrors: [],
          staticPixFallbackCount: 0,
        }),
      });
    });
    await mockGetCharges(page);

    const cp = new ChargesPage(page);
    await cp.goto();

    void cp.generateButton.click();

    const loadingBtn = page.getByRole("button", { name: /gerando/i });
    await expect(loadingBtn).toBeVisible();
    await expect(loadingBtn).toBeDisabled();

    resolveFulfill();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("opens QR code modal with image when 'Ver QR' is clicked", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await cp.clickViewQr("João Silva");

    const modal = cp.getQrModal();
    await expect(modal).toBeVisible();
    await expect(
      modal.getByRole("img", { name: /QR Code Pix/i }),
    ).toBeVisible();
    await expect(modal.getByText("João Silva")).toBeVisible();
  });

  test("QR modal shows the 'Copiar código Pix' button when pixCopyPaste is available", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await cp.clickViewQr("João Silva");

    const modal = cp.getQrModal();
    await expect(
      modal.getByRole("button", { name: /copiar código pix/i }),
    ).toBeVisible();
  });

  test("closes QR modal when the close button is clicked", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await cp.clickViewQr("João Silva");
    const modal = cp.getQrModal();
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: /fechar modal/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 2_000 });
  });

  test("closes QR modal on backdrop click", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    const cp = new ChargesPage(page);
    await cp.goto();

    await cp.clickViewQr("João Silva");
    const modal = cp.getQrModal();
    await expect(modal).toBeVisible();

    await page.mouse.click(8, 8);
    await expect(modal).not.toBeVisible({ timeout: 2_000 });
  });

  test("status filter appends status query param to the charges request", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    const capturedUrls: string[] = [];

    await page.route(`${API_BASE}/api/charges?*`, (route) => {
      capturedUrls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildFakeChargesResponse()),
      });
    });

    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(cp.chargesTable).toBeVisible();
    const initialCount = capturedUrls.length;

    await cp.statusFilter.selectOption("OVERDUE");

    await page
      .waitForFunction(
        (count) =>
          (window as Window & { _capturedUrlCount?: number }).document
            .readyState !== undefined && count > 0,
        initialCount,
        { timeout: 3_000 },
      )
      .catch(() => {
        // fallback: just wait briefly for the route to be called
      });

    await page.waitForTimeout(600);

    const filteredUrl = capturedUrls.find((u) => u.includes("status=OVERDUE"));
    expect(filteredUrl).toBeDefined();
  });
});

test.describe("Charges Page — TREASURER user", () => {
  test("does NOT show 'Gerar cobranças' button for TREASURER role", async ({
    page,
  }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockGetCharges(page);

    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(cp.heading).toBeVisible();
    await expect(cp.generateButton).not.toBeVisible();
  });
});

test.describe("Charges Page — pagination", () => {
  test("shows pagination controls when there are multiple pages", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page, { total: 25, limit: 20 });
    const cp = new ChargesPage(page);
    await cp.goto();

    await expect(page.getByRole("button", { name: /próxima/i })).toBeVisible();
    await expect(page.getByText(/mostrando 1.+de 25/i)).toBeVisible();
  });
});
