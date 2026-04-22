import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the MedicalRecordFormModal.
 *
 * The modal is identified by `role="dialog"` with an aria-label matching
 * either "Registrar Lesão" (create mode) or "Editar Prontuário" (edit mode).
 * All child locators are scoped to the modal element for isolation.
 */
export class MedicalRecordFormPage {
  readonly modal: Locator;
  readonly occurredAtInput: Locator;
  readonly structureInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly protocolSelect: Locator;

  constructor(private readonly page: Page) {
    this.modal = page.getByRole("dialog", {
      name: /registrar lesão|editar prontuário/i,
    });
    this.occurredAtInput = this.modal.locator("#mr-occurred-at");
    this.structureInput = this.modal.locator("#mr-structure");
    this.saveButton = this.modal.getByRole("button", {
      name: /registrar lesão|atualizar prontuário/i,
    });
    this.cancelButton = this.modal.getByRole("button", { name: /cancelar/i });
    this.protocolSelect = this.modal.locator("#mr-protocol");
  }

  /**
   * Returns the grade radio card button by its label text.
   * e.g. "Grau I", "Grau II", "Grau III", "Ruptura"
   */
  getGradeButton(gradeLabel: string): Locator {
    return this.modal.getByRole("radio", { name: new RegExp(gradeLabel, "i") });
  }

  getMechanismSelect(): Locator {
    return this.modal.locator("#mr-mechanism");
  }
}
