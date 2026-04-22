import { test, expect } from "../fixtures/auth.fixture";
import {
  mockGetAtRiskAthletes,
  mockGetAtRiskAthletesEmpty,
  mockGetInjuryCorrelation,
  mockGetInjuryCorrelationEmpty,
  mockRefreshSuccess,
} from "../fixtures/mock-api";
import { MedicalDashboardPage } from "../page-objects/medical-dashboard.page";
import { TREASURER_TOKEN } from "../fixtures/fake-token";

test.describe("Medical Dashboard — ADMIN role", () => {
  test("renders page heading, at-risk panel and correlation panel", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(mp.heading).toBeVisible();
    await expect(mp.atRiskSection).toBeVisible();
    await expect(mp.correlationSection).toBeVisible();
    await expect(mp.acwrInfoBox).toBeVisible();
  });

  test("shows at-risk athlete row with name and ACWR value", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    const row = mp.getAtRiskAthleteRow("Carlos Eduardo");
    await expect(row).toBeVisible();
    await expect(row).toContainText("1.45");
  });

  test("shows empty state in at-risk panel when no athletes are in risk zone", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletesEmpty(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(
      page.getByText(/nenhum atleta em zona de risco/i),
    ).toBeVisible();
  });

  test("shows injury correlation row with athlete name and structure", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(
      page.getByRole("cell", { name: "Carlos Eduardo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Isquiotibiais" }),
    ).toBeVisible();
  });

  test("shows empty state in correlation panel when no events", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelationEmpty(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(
      page.getByText(/nenhum evento de lesão com acwr/i),
    ).toBeVisible();
  });

  test("period filter buttons 30d, 60d, 90d are all visible", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(mp.getPeriodFilterButton("30d")).toBeVisible();
    await expect(mp.getPeriodFilterButton("60d")).toBeVisible();
    await expect(mp.getPeriodFilterButton("90d")).toBeVisible();
  });

  test("ACWR threshold filter buttons are all visible", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(mp.getAcwrThresholdButton("≥ 1.3")).toBeVisible();
    await expect(mp.getAcwrThresholdButton("≥ 1.5")).toBeVisible();
    await expect(mp.getAcwrThresholdButton("≥ 2.0")).toBeVisible();
  });

  test("clicking a period filter button sends the correct query param", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    const capturedUrls: string[] = [];
    const API_BASE =
      process.env["PLAYWRIGHT_API_URL"] ?? "http://localhost:3001";

    await page.route(
      `${API_BASE}/api/workload/injury-correlation?*`,
      (route) => {
        capturedUrls.push(route.request().url());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            events: [],
            totalEvents: 0,
            windowDays: 60,
            minAcwr: 1.3,
            acwrDataAsOf: null,
          }),
        });
      },
    );
    await mockGetAtRiskAthletes(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    // Wait for initial render
    await expect(mp.correlationSection).toBeVisible();
    const initialCount = capturedUrls.length;

    // Click 60d period filter
    await mp.getPeriodFilterButton("60d").click();
    await page.waitForTimeout(500);

    const filteredUrl = capturedUrls
      .slice(initialCount)
      .find((u) => u.includes("days=60"));
    expect(filteredUrl).toBeDefined();
  });
});

test.describe("Medical Dashboard — PHYSIO role", () => {
  test("PHYSIO can access /medical and sees the dashboard", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(mp.heading).toBeVisible();
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("PHYSIO sees the same at-risk panel data as ADMIN", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const mp = new MedicalDashboardPage(page);
    await mp.goto();

    await expect(mp.getAtRiskAthleteRow("Carlos Eduardo")).toBeVisible();
  });
});

test.describe("Medical Dashboard — role isolation", () => {
  test("TREASURER is redirected to /dashboard when accessing /medical", async ({
    page,
  }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    await page.goto("/medical");

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
});