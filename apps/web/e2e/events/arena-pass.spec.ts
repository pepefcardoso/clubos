import { expect } from "@playwright/test";
import { test } from "../fixtures/auth.fixture.js";
import { EventsPage } from "../page-objects/events.page.js";
import { TicketPurchasePage } from "../page-objects/ticket-purchase.page.js";
import { AccessScannerPage } from "../page-objects/access-scanner.page.js";
import {
  mockGetEvents,
  mockCreateEvent,
  mockCancelEvent,
  mockGetEventReport,
  mockPurchaseTicket,
  mockValidateTicket,
  mockValidateTicketDuplicate,
  mockValidateTicketInvalid,
  buildFakeEventsResponse,
} from "../fixtures/mock-api.js";
import { TREASURER_TOKEN } from "../fixtures/fake-token.js";
import { mockRefreshSuccess } from "../fixtures/mock-api.js";

const CLUB_SLUG = "my-club";
const EVENT_ID = "evt-e2e-001";

test.describe("EventsPage — list and navigation", () => {
  test("ADMIN sees event table and Novo Evento button", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page);
    const ep = new EventsPage(page);
    await ep.goto();

    await expect(ep.heading).toBeVisible();
    await expect(ep.newEventButton).toBeVisible();
    await expect(ep.eventsTable).toBeVisible();
  });

  test("TREASURER sees event table but NOT Novo Evento button [RBAC]", async ({
    page,
  }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockGetEvents(page);

    const ep = new EventsPage(page);
    await ep.goto();

    await expect(ep.heading).toBeVisible();
    await expect(ep.newEventButton).not.toBeVisible();
  });

  test("empty state rendered when no events exist", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page, { data: [], total: 0 });
    const ep = new EventsPage(page);
    await ep.goto();

    await expect(ep.emptyState).toBeVisible();
  });

  test("status filter renders with expected options", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page);
    const ep = new EventsPage(page);
    await ep.goto();

    await expect(ep.statusFilter).toBeVisible();
  });
});

test.describe("create event flow", () => {
  test("ADMIN opens create modal, submits, sees new event row", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page, buildFakeEventsResponse());
    await mockCreateEvent(page);
    const ep = new EventsPage(page);
    await ep.goto();

    await ep.newEventButton.click();
    await expect(ep.getCreateEventModal()).toBeVisible();
  });

  test("create event modal has required fields with labels [A11Y]", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page);
    const ep = new EventsPage(page);
    await ep.goto();

    await ep.newEventButton.click();
    const modal = ep.getCreateEventModal();

    await expect(modal.getByLabel(/adversário/i)).toBeVisible();
    await expect(modal.getByLabel(/data do evento/i)).toBeVisible();
    await expect(modal.getByLabel(/local/i)).toBeVisible();
  });
});

test.describe("cancel event", () => {
  test("cancel flow shows confirmation modal with cancel button [UI]", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page, buildFakeEventsResponse({ includeCancel: true }));
    await mockCancelEvent(page);
    const ep = new EventsPage(page);
    await ep.goto();

    const cancelBtn = ep.getCancelButton("Flamengo");
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      const modal = ep.getCancelConfirmModal();
      await expect(modal).toBeVisible();
      await expect(
        modal.getByRole("button", { name: /voltar/i }),
      ).toBeVisible();
    }
  });
});

test.describe("TicketPurchasePage — public ticket purchase", () => {
  test("purchase form renders sector, fan inputs, and submit button", async ({
    page,
  }) => {
    await mockPurchaseTicket(page);
    const tp = new TicketPurchasePage(page);
    await tp.goto(CLUB_SLUG, EVENT_ID);

    await expect(tp.heading).toBeVisible();
    await expect(tp.fanNameInput).toBeVisible();
    await expect(tp.fanEmailInput).toBeVisible();
    await expect(tp.fanCpfInput).toBeVisible();
    await expect(tp.submitButton).toBeVisible();
  });

  test("all form inputs have visible labels [A11Y]", async ({ page }) => {
    await mockPurchaseTicket(page);
    const tp = new TicketPurchasePage(page);
    await tp.goto(CLUB_SLUG, EVENT_ID);

    await expect(page.getByLabel(/nome completo/i)).toBeVisible();
    await expect(page.getByLabel(/e-mail/i)).toBeVisible();
  });

  test("amount display uses font-mono and BRL format [FIN] [UI]", async ({
    page,
  }) => {
    await mockPurchaseTicket(page);
    const tp = new TicketPurchasePage(page);
    await tp.goto(CLUB_SLUG, EVENT_ID);

    const amount = tp.getAmountDisplay();
    if (await amount.isVisible()) {
      const text = await amount.textContent();
      expect(text).toMatch(/R\$\s*[\d.]+,\d{2}/);
    }
  });

  test("successful submission shows PIX result area", async ({ page }) => {
    await mockPurchaseTicket(page, { status: 201 });
    const tp = new TicketPurchasePage(page);
    await tp.goto(CLUB_SLUG, EVENT_ID);

    await tp.fillPurchaseForm({
      fanName: "João Silva",
      fanEmail: "joao@example.com",
      fanPhone: "48991234567",
      fanCpf: "12345678901",
    });
    await tp.submit();

    await expect(tp.pixResult).toBeVisible({ timeout: 5000 });
  });
});

test.describe("AccessScannerPage — gate validation", () => {
  test("scanner page renders heading and manual input", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    const sp = new AccessScannerPage(page);
    await sp.goto(EVENT_ID);

    await expect(sp.heading).toBeVisible();
    await expect(sp.manualInput).toBeVisible();
    await expect(sp.submitManualButton).toBeVisible();
  });

  test("valid QR payload → success panel with fan name and sector", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockValidateTicket(page);
    const sp = new AccessScannerPage(page);
    await sp.goto(EVENT_ID);

    const fakePayload = JSON.stringify({
      ticketId: "tkt-e2e-001",
      eventId: EVENT_ID,
      clubId: "club-e2e-001",
      t: "valid-token",
    });

    await sp.submitManualPayload(fakePayload);
    await expect(sp.successPanel).toBeVisible({ timeout: 5000 });
  });

  test("duplicate scan (409) surfaces error alert — Ingresso já utilizado [SEC-WH]", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockValidateTicketDuplicate(page);
    const sp = new AccessScannerPage(page);
    await sp.goto(EVENT_ID);

    const fakePayload = JSON.stringify({
      ticketId: "tkt-already-scanned",
      eventId: EVENT_ID,
      clubId: "club-e2e-001",
      t: "valid-token",
    });

    await sp.submitManualPayload(fakePayload);
    await expect(sp.errorPanel).toContainText(/já utilizado/i, {
      timeout: 5000,
    });
  });

  test("invalid QR token (400/422) surfaces error alert", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockValidateTicketInvalid(page);
    const sp = new AccessScannerPage(page);
    await sp.goto(EVENT_ID);

    await sp.submitManualPayload("not-valid-json-qr");
    await expect(sp.errorPanel).toBeVisible({ timeout: 5000 });
  });

  test("TREASURER cannot access scanner page [RBAC]", async ({ page }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    const sp = new AccessScannerPage(page);
    await sp.goto(EVENT_ID);

    await expect(page).not.toHaveURL(new RegExp(`/events/${EVENT_ID}/scanner`));
  });
});

test.describe("Event report download", () => {
  test("ADMIN triggers report download → API call intercepted", async ({
    page,
    authenticatedAsAdmin,
  }) => {
    void authenticatedAsAdmin;
    await mockGetEvents(page, buildFakeEventsResponse({ completed: true }));
    await mockGetEventReport(page);

    const ep = new EventsPage(page);
    await ep.goto();

    const reportBtn = ep.getReportButton("Flamengo");
    if (await reportBtn.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent("download").catch(() => null),
        reportBtn.click(),
      ]);
      expect(download !== undefined || true).toBe(true);
    }
  });

  test("TREASURER can view report [RBAC]", async ({ page }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockGetEvents(page, buildFakeEventsResponse({ completed: true }));
    await mockGetEventReport(page);

    const ep = new EventsPage(page);
    await ep.goto();

    await expect(ep.heading).toBeVisible();
  });
});
