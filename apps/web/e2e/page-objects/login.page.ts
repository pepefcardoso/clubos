import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the /login route.
 * Locators are ARIA-first — `data-testid` only as a fallback.
 */
export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly serverErrorAlert: Locator;
  readonly emailError: Locator;
  readonly passwordError: Locator;
  readonly showPasswordButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel(/e-mail/i);
    this.passwordInput = page.getByLabel(/^senha/i).first();
    this.submitButton = page.getByRole("button", { name: /^entrar$/i });
    this.serverErrorAlert = page
      .getByRole("alert")
      .filter({ hasText: /e-mail ou senha inválidos/i });
    this.emailError = page
      .getByRole("alert")
      .filter({ hasText: /e-mail válido/i });
    this.passwordError = page
      .getByRole("alert")
      .filter({ hasText: /8 caracteres/i });
    this.showPasswordButton = page.getByRole("button", {
      name: /mostrar senha/i,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/login");
  }

  async fillAndSubmit(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
