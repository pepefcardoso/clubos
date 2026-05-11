import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the public ticket purchase page:
 * /eventos/:clubSlug/:eventId
 */
export class TicketPurchasePage {
  readonly heading: Locator;
  readonly sectorSelect: Locator;
  readonly fanNameInput: Locator;
  readonly fanEmailInput: Locator;
  readonly fanPhoneInput: Locator;
  readonly fanCpfInput: Locator;
  readonly submitButton: Locator;
  readonly pixResult: Locator;
  readonly soldOutMessage: Locator;
  readonly cancelledEventMessage: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /compra de ingresso/i });
    this.sectorSelect = page.locator("#sectorId");
    this.fanNameInput = page.locator("#fanName");
    this.fanEmailInput = page.locator("#fanEmail");
    this.fanPhoneInput = page.locator("#fanPhone");
    this.fanCpfInput = page.locator("#fanCpf");
    this.submitButton = page.getByRole("button", {
      name: /gerar cobrança pix/i,
    });
    this.pixResult = page.getByText(/aguardando pagamento/i);
    this.soldOutMessage = page.getByText(/setor sem capacidade/i);
    this.cancelledEventMessage = page.getByText(/evento não disponível/i);
  }

  async goto(clubSlug: string, eventId: string): Promise<void> {
    await this.page.goto(`/eventos/${clubSlug}/${eventId}`);
  }

  async fillPurchaseForm(data: {
    fanName: string;
    fanEmail: string;
    fanPhone: string;
    fanCpf: string;
  }): Promise<void> {
    await this.fanNameInput.fill(data.fanName);
    await this.fanEmailInput.fill(data.fanEmail);
    await this.fanPhoneInput.fill(data.fanPhone);
    await this.fanCpfInput.fill(data.fanCpf);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  getPixQrCode(): Locator {
    return this.page.getByRole("img", { name: /qr code pix/i });
  }

  getPixCopyPaste(): Locator {
    return this.page.getByRole("button", { name: /copiar código pix/i });
  }

  getAmountDisplay(): Locator {
    return this.page.locator("[data-testid='ticket-amount']");
  }
}
