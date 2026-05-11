import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the gate access scanner:
 * /events/:eventId/scanner (or equivalent route)
 */
export class AccessScannerPage {
  readonly heading: Locator;
  readonly scannerArea: Locator;
  readonly manualInput: Locator;
  readonly submitManualButton: Locator;
  readonly successPanel: Locator;
  readonly errorPanel: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /controle de acesso/i });
    this.scannerArea = page.locator("[data-testid='scanner-viewport']");
    this.manualInput = page.locator("#qrPayload");
    this.submitManualButton = page.getByRole("button", {
      name: /validar ingresso/i,
    });
    this.successPanel = page.getByRole("region", { name: /acesso liberado/i });
    this.errorPanel = page.getByRole("alert");
  }

  async goto(eventId: string): Promise<void> {
    await this.page.goto(`/events/${eventId}/scanner`);
  }

  async submitManualPayload(payload: string): Promise<void> {
    await this.manualInput.fill(payload);
    await this.submitManualButton.click();
  }

  getFanNameDisplay(): Locator {
    return this.successPanel.getByTestId("fan-name");
  }

  getSectorNameDisplay(): Locator {
    return this.successPanel.getByTestId("sector-name");
  }

  getCheckedInAt(): Locator {
    return this.successPanel.getByTestId("checked-in-at");
  }

  getErrorMessage(): Locator {
    return this.errorPanel;
  }
}
