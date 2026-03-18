import type { Page, Locator } from "@playwright/test";

export class DashboardPage {
  readonly heading: Locator;
  readonly logoutButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /dashboard/i });
    this.logoutButton = page.getByRole("button", { name: /sair|logout/i });
  }

  async goto(): Promise<void> {
    await this.page.goto("/dashboard");
  }
}
