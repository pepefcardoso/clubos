import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for /physio — PhysioDashboardPage.
 *
 * Covers both single-club (default) and multi-club (consolidated) layouts.
 * The "Visão Consolidada" toggle is only rendered when the PHYSIO has > 1 club.
 */
export class PhysioDashboardPage {
  readonly heading: Locator;
  readonly atRiskSection: Locator;
  readonly correlationSection: Locator;
  /** Rendered only when PHYSIO has access to more than one club. */
  readonly consolidatedViewButton: Locator;
  readonly activeClubButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /saúde dos atletas/i });
    this.atRiskSection = page.getByRole("region", {
      name: /atletas em zona de risco/i,
    });
    this.correlationSection = page.getByRole("region", {
      name: /correlação carga × lesão/i,
    });
    this.consolidatedViewButton = page.getByRole("button", {
      name: /visão consolidada/i,
    });
    this.activeClubButton = page.getByRole("button", {
      name: /clube ativo/i,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/physio");
  }
}
