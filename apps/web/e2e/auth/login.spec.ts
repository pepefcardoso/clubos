import { test, expect } from "../fixtures/auth.fixture";
import {
  mockLoginSuccess,
  mockLoginFailure,
  mockRefreshSuccess,
  mockGetCharges,
} from "../fixtures/mock-api";
import { LoginPage } from "../page-objects/login.page";
import { ADMIN_TOKEN } from "../fixtures/fake-token";

const API_BASE = process.env["PLAYWRIGHT_API_URL"] ?? "http://localhost:3001";

test.describe("Login Page — unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    const { mockRefreshFailure } = await import("../fixtures/mock-api");
    await mockRefreshFailure(page);
  });

  test("renders email, password, and submit on /login", async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();

    await expect(page).toHaveURL(/\/login/);
    await expect(lp.emailInput).toBeVisible();
    await expect(lp.passwordInput).toBeVisible();
    await expect(lp.submitButton).toBeVisible();
  });

  test("shows client-side email validation error on blur", async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();

    await lp.emailInput.fill("notanemail");
    await lp.emailInput.blur();

    await expect(lp.emailError).toBeVisible();
  });

  test("shows client-side password validation error on blur", async ({
    page,
  }) => {
    const lp = new LoginPage(page);
    await lp.goto();

    await lp.passwordInput.fill("short");
    await lp.passwordInput.blur();

    await expect(lp.passwordError).toBeVisible();
  });

  test("shows server error alert on invalid credentials (401)", async ({
    page,
  }) => {
    await mockLoginFailure(page);
    const lp = new LoginPage(page);
    await lp.goto();

    await lp.fillAndSubmit("wrong@clube.com", "wrongpassword");

    await expect(lp.serverErrorAlert).toBeVisible();
    await expect(lp.serverErrorAlert).toContainText(
      "E-mail ou senha inválidos",
    );
  });

  test("redirects to /dashboard on successful login", async ({ page }) => {
    await mockLoginSuccess(page, ADMIN_TOKEN);
    await mockGetCharges(page);

    const lp = new LoginPage(page);
    await lp.goto();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockRefreshSuccess(page, ADMIN_TOKEN);
    await mockLoginSuccess(page, ADMIN_TOKEN);
    await mockGetCharges(page);

    await lp.fillAndSubmit("admin@clube.com", "password123");

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("disables submit and shows 'Entrando…' during submission", async ({
    page,
  }) => {
    const lp = new LoginPage(page);
    await lp.goto();

    await expect(lp.emailInput).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockRefreshSuccess(page, ADMIN_TOKEN);

    await page.route(`${API_BASE}/api/auth/login`, async (route) => {
      await page.waitForTimeout(400);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: ADMIN_TOKEN,
          user: {
            id: "user-e2e-admin-001",
            email: "admin@clube.com",
            role: "ADMIN",
            clubId: "club-e2e-001",
          },
        }),
      });
    });

    await lp.emailInput.fill("admin@clube.com");
    await lp.passwordInput.fill("password123");
    await lp.submitButton.click();

    await expect(page.getByRole("button", { name: /entrando/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /entrando/i }),
    ).toBeDisabled();
  });

  test("password field toggles between masked and plain text", async ({
    page,
  }) => {
    const lp = new LoginPage(page);
    await lp.goto();

    await expect(lp.passwordInput).toHaveAttribute("type", "password");

    await lp.showPasswordButton.click();
    await expect(lp.passwordInput).toHaveAttribute("type", "text");

    await expect(
      page.getByRole("button", { name: /ocultar senha/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /ocultar senha/i }).click();
    await expect(lp.passwordInput).toHaveAttribute("type", "password");
  });
});

test.describe("Login Page — already authenticated", () => {
  test("redirects to /dashboard when already authenticated", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetCharges(page);
    await page.goto("/login");

    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("Protected Routes — unauthenticated access", () => {
  test.beforeEach(async ({ page }) => {
    const { mockRefreshFailure } = await import("../fixtures/mock-api");
    await mockRefreshFailure(page);
  });

  test("redirects /dashboard → /login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects /charges → /login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/charges");
    await expect(page).toHaveURL(/\/login/);
  });
});
