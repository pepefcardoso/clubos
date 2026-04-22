import { test, expect } from "../fixtures/auth.fixture";
import {
  mockGetAtRiskAthletes,
  mockGetAtRiskAthletesEmpty,
  mockGetInjuryCorrelation,
  mockRefreshSuccess,
} from "../fixtures/mock-api";
import { PhysioDashboardPage } from "../page-objects/physio-dashboard.page";
import { ADMIN_TOKEN, TREASURER_TOKEN } from "../fixtures/fake-token";

const API_BASE = process.env["PLAYWRIGHT_API_URL"] ?? "http://localhost:3001";

/**
 * Mocks GET /api/physio/clubs with a single club.
 * Use this for tests where multi-club features (ClubSwitcher, consolidated view)
 * should NOT appear.
 */
async function mockPhysioClubsSingleClub(
  page: import("@playwright/test").Page,
) {
  await page.route(`${API_BASE}/api/physio/clubs`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        clubs: [
          {
            clubId: "club-e2e-001",
            clubName: "Clube E2E",
            clubLogoUrl: null,
            isPrimary: true,
          },
        ],
      }),
    }),
  );
}

/**
 * Mocks GET /api/physio/clubs with two clubs so the ClubSwitcher and
 * "Visão Consolidada" toggle are rendered.
 */
async function mockPhysioClubsMultiple(page: import("@playwright/test").Page) {
  await page.route(`${API_BASE}/api/physio/clubs`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        clubs: [
          {
            clubId: "club-e2e-001",
            clubName: "Clube E2E Primário",
            clubLogoUrl: null,
            isPrimary: true,
          },
          {
            clubId: "club-e2e-002",
            clubName: "Clube E2E Secundário",
            clubLogoUrl: null,
            isPrimary: false,
          },
        ],
      }),
    }),
  );
}

test.describe("Physio Dashboard — PHYSIO role", () => {
  test("renders page heading and both clinic panels", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsSingleClub(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(pp.heading).toBeVisible();
    await expect(pp.atRiskSection).toBeVisible();
    await expect(pp.correlationSection).toBeVisible();
  });

  test("does NOT show 'Visão Consolidada' toggle when PHYSIO has only one club", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsSingleClub(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(pp.heading).toBeVisible();
    await expect(pp.consolidatedViewButton).not.toBeVisible();
  });

  test("shows empty state in at-risk panel when no athletes are at risk", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsSingleClub(page);
    await mockGetAtRiskAthletesEmpty(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(
      page.getByText(/nenhum atleta em zona de risco/i),
    ).toBeVisible();
  });

  test("shows at-risk athlete with name and ACWR value", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsSingleClub(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(pp.atRiskSection.getByText("Carlos Eduardo")).toBeVisible();
    await expect(pp.atRiskSection.getByText("1.45")).toBeVisible();
  });

  test("shows ACWR info box explaining the metric", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsSingleClub(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(page.getByText(/o que é o acwr/i)).toBeVisible();
  });
});

test.describe("Physio Dashboard — multi-club features", () => {
  test("shows 'Visão Consolidada' toggle when PHYSIO has multiple clubs", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsMultiple(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(pp.consolidatedViewButton).toBeVisible();
    await expect(pp.activeClubButton).toBeVisible();
  });

  test("'Clube Ativo' is the default selected view", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockPhysioClubsMultiple(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await expect(pp.activeClubButton).toHaveAttribute("aria-pressed", "true");
    await expect(pp.consolidatedViewButton).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("clicking 'Visão Consolidada' switches aria-pressed state", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await page.route(`${API_BASE}/api/physio/dashboard?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          athletes: [],
          clubCount: 2,
          minAcwr: 1.3,
          acwrDataAsOf: null,
        }),
      }),
    );

    await mockPhysioClubsMultiple(page);
    await mockGetAtRiskAthletes(page);
    await mockGetInjuryCorrelation(page);

    const pp = new PhysioDashboardPage(page);
    await pp.goto();

    await pp.consolidatedViewButton.click();

    await expect(pp.consolidatedViewButton).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(pp.activeClubButton).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Physio Dashboard — role isolation", () => {
  test("ADMIN is redirected to /dashboard when accessing /physio", async ({
    page,
  }) => {
    await mockRefreshSuccess(page, ADMIN_TOKEN);
    await mockPhysioClubsSingleClub(page);

    await page.goto("/physio");

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test("TREASURER is redirected to /dashboard when accessing /physio", async ({
    page,
  }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);

    await page.goto("/physio");

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test("unauthenticated user is redirected to /login when accessing /physio", async ({
    page,
  }) => {
    const { mockRefreshFailure } = await import("../fixtures/mock-api");
    await mockRefreshFailure(page);

    await page.goto("/physio");

    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
