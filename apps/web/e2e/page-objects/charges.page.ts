import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the /charges route.
 */
export class ChargesPage {
  readonly heading: Locator;
  readonly generateButton: Locator;
  readonly monthFilter: Locator;
  readonly statusFilter: Locator;
  readonly chargesTable: Locator;
  readonly emptyState: Locator;
  /** Live-region container for all toasts. */
  readonly toastRegion: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /cobranças/i });
    this.generateButton = page.getByRole("button", {
      name: /gerar cobranças/i,
    });
    this.monthFilter = page.getByLabel(/filtrar por mês/i);
    this.statusFilter = page.getByLabel(/filtrar por status/i);
    this.chargesTable = page.getByRole("table", {
      name: /lista de cobranças/i,
    });
    this.emptyState = page.getByText(/nenhuma cobrança encontrada/i);
    this.toastRegion = page.locator('[aria-live="polite"]');
  }

  async goto(): Promise<void> {
    await this.page.goto("/charges");
  }

  /** Returns all visible toast status elements. */
  getToasts(): Locator {
    return this.page.getByRole("status");
  }

  /** Returns a toast that contains the given text. */
  getToastWith(text: string | RegExp): Locator {
    return this.getToasts().filter({ hasText: text });
  }

  /**
   * Clicks the "Ver QR" button for the specified member.
   * The aria-label follows the pattern: "Ver QR Code da cobrança de <name>"
   */
  async clickViewQr(memberName: string): Promise<void> {
    await this.page
      .getByRole("button", {
        name: new RegExp(`Ver QR Code da cobrança de ${memberName}`, "i"),
      })
      .click();
  }

  /** Returns the QR Code modal dialog element. */
  getQrModal(): Locator {
    return this.page.getByRole("dialog", { name: /cobrança pix/i });
  }
}
