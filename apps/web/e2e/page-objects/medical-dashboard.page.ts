import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for /medical — MedicalDashboardPage.
 *
 * Uses ARIA-first locators aligned with the `aria-labelledby` attributes
 * on AtRiskAthletesPanel and InjuryLoadCorrelationPanel.
 */
export class MedicalDashboardPage {
  readonly heading: Locator;
  readonly atRiskSection: Locator;
  readonly correlationSection: Locator;
  readonly acwrInfoBox: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /saúde dos atletas/i });
    this.atRiskSection = page.getByRole("region", {
      name: /atletas em zona de risco/i,
    });
    this.correlationSection = page.getByRole("region", {
      name: /correlação carga × lesão/i,
    });
    this.acwrInfoBox = page.getByText(/o que é o acwr/i);
  }

  async goto(): Promise<void> {
    await this.page.goto("/medical");
  }

  /** Returns the listitem inside the at-risk panel that contains the athlete's name. */
  getAtRiskAthleteRow(athleteName: string): Locator {
    return this.atRiskSection
      .getByRole("listitem")
      .filter({ hasText: athleteName });
  }

  /** Returns the table row in the correlation panel for a given athlete name. */
  getCorrelationRow(athleteName: string): Locator {
    return this.correlationSection
      .getByRole("row")
      .filter({ hasText: athleteName });
  }

  /** Returns the period toggle button (e.g. "30d", "60d", "90d") in the correlation panel. */
  getPeriodFilterButton(label: string): Locator {
    return this.correlationSection.getByRole("button", { name: label });
  }

  /** Returns the ACWR threshold button (e.g. "≥ 1.3") in the correlation panel. */
  getAcwrThresholdButton(label: string): Locator {
    return this.correlationSection.getByRole("button", { name: label });
  }
}
