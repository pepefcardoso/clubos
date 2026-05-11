import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the /events route.
 */
export class EventsPage {
  readonly heading: Locator;
  readonly newEventButton: Locator;
  readonly statusFilter: Locator;
  readonly eventsTable: Locator;
  readonly emptyState: Locator;
  readonly toastRegion: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /eventos/i });
    this.newEventButton = page.getByRole("button", { name: /novo evento/i });
    this.statusFilter = page.getByLabel(/filtrar por status/i);
    this.eventsTable = page.getByRole("table", { name: /lista de eventos/i });
    this.emptyState = page.getByText(/nenhum evento encontrado/i);
    this.toastRegion = page.locator('[aria-live="polite"]');
  }

  async goto(): Promise<void> {
    await this.page.goto("/events");
  }

  getToasts(): Locator {
    return this.page.getByRole("status");
  }

  getToastWith(text: string | RegExp): Locator {
    return this.getToasts().filter({ hasText: text });
  }

  getEventRow(opponent: string): Locator {
    return this.eventsTable.getByRole("row").filter({ hasText: opponent });
  }

  getCancelButton(opponent: string): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`cancelar evento.*${opponent}`, "i"),
    });
  }

  getChecklistButton(opponent: string): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`checklist.*${opponent}`, "i"),
    });
  }

  getReportButton(opponent: string): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`relatório.*${opponent}`, "i"),
    });
  }

  getCreateEventModal(): Locator {
    return this.page.getByRole("dialog", { name: /novo evento/i });
  }

  getCancelConfirmModal(): Locator {
    return this.page.getByRole("dialog", { name: /cancelar evento/i });
  }

  getConfirmCancelButton(): Locator {
    return this.getCancelConfirmModal().getByRole("button", {
      name: /confirmar cancelamento/i,
    });
  }
}
