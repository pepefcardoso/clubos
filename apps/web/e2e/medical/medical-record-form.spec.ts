import { test, expect } from "../fixtures/auth.fixture";
import {
  mockGetAthleteRtp,
  mockGetMedicalRecords,
  mockCreateMedicalRecordSuccess,
  mockGetInjuryProtocols,
  mockRefreshSuccess,
} from "../fixtures/mock-api";
import { MedicalRecordFormPage } from "../page-objects/medical-record-form.page";
import { TREASURER_TOKEN, PHYSIO_TOKEN } from "../fixtures/fake-token";

const API_BASE = process.env["PLAYWRIGHT_API_URL"] ?? "http://localhost:3001";

async function mockAthletesForMedicalTests(
  page: import("@playwright/test").Page,
) {
  await page.route(`${API_BASE}/api/athletes?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "athlete-e2e-001",
            name: "Carlos Eduardo",
            cpf: "12345678901",
            birthDate: "2000-05-10T00:00:00.000Z",
            position: "Atacante",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      }),
    }),
  );
}

test.describe("Medical Record Form — ADMIN role", () => {
  test.beforeEach(async ({ page, authenticatedAsAdmin: _ }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, "AFASTADO");
  });

  test("opens 'Registrar Lesão' modal when prontuário button is clicked", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /registrar lesão para carlos eduardo/i,
      })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.modal).toBeVisible();
    await expect(form.occurredAtInput).toBeVisible();
    await expect(form.structureInput).toBeVisible();
    await expect(form.saveButton).toBeVisible();
  });

  test("save button is disabled when required fields are empty", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.modal).toBeVisible();
    await expect(form.saveButton).toBeDisabled();
  });

  test("all four grade radio cards are rendered", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.getGradeButton("Grau I")).toBeVisible();
    await expect(form.getGradeButton("Grau II")).toBeVisible();
    await expect(form.getGradeButton("Grau III")).toBeVisible();
    await expect(form.getGradeButton("Ruptura")).toBeVisible();
  });

  test("save button becomes enabled after all required fields are filled", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetInjuryProtocols(page);
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.saveButton).toBeDisabled();

    await form.occurredAtInput.fill("2025-01-15");
    await form.structureInput.fill("LCA");
    await form.getGradeButton("Grau III").click();

    await expect(form.saveButton).toBeEnabled();
  });

  test("protocol select is enabled after a grade is selected", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetInjuryProtocols(page);
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);

    await expect(form.protocolSelect).toBeDisabled();

    await form.getGradeButton("Grau II").click();

    await expect(form.protocolSelect).not.toBeDisabled();
  });

  test("grade radio card toggles aria-checked correctly", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    const gradeIIButton = form.getGradeButton("Grau II");

    await expect(gradeIIButton).toHaveAttribute("aria-checked", "false");
    await gradeIIButton.click();
    await expect(gradeIIButton).toHaveAttribute("aria-checked", "true");
  });

  test("successful form submission closes the modal", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetInjuryProtocols(page);
    await mockCreateMedicalRecordSuccess(page);

    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await form.occurredAtInput.fill("2025-01-15");
    await form.structureInput.fill("LCA");
    await form.getGradeButton("Grau III").click();
    await form.saveButton.click();

    await expect(form.modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("cancel button closes the modal without saving", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.modal).toBeVisible();

    await form.cancelButton.click();

    await expect(form.modal).not.toBeVisible({ timeout: 2_000 });
  });

  test("backdrop click closes the modal", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.modal).toBeVisible();

    await page.mouse.click(8, 8);

    await expect(form.modal).not.toBeVisible({ timeout: 2_000 });
  });

  test("shows 'Salvando…' and disables save button during submission", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockGetInjuryProtocols(page);

    let resolveFulfill!: () => void;
    const fulfillReady = new Promise<void>((res) => {
      resolveFulfill = res;
    });

    await page.route(`${API_BASE}/api/medical-records`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await fulfillReady;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "mr-e2e-002",
          athleteId: "athlete-e2e-001",
          occurredAt: "2025-01-15",
          structure: "LCA",
          grade: "GRADE_3",
          mechanism: "CONTACT",
          createdAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await form.occurredAtInput.fill("2025-01-15");
    await form.structureInput.fill("LCA");
    await form.getGradeButton("Grau III").click();

    void form.saveButton.click();

    const savingButton = page.getByRole("button", { name: /salvando/i });
    await expect(savingButton).toBeVisible();
    await expect(savingButton).toBeDisabled();

    resolveFulfill();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

test.describe("RTP Status — display in Athletes table", () => {
  test("shows 'Afastado' badge for athlete with AFASTADO RTP status", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, "AFASTADO");

    await page.goto("/athletes");

    await expect(
      page.getByLabel(/atleta afastado — não apto para jogo/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows 'Ret. Progressivo' badge for RETORNO_PROGRESSIVO status", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, "RETORNO_PROGRESSIVO");

    await page.goto("/athletes");

    await expect(
      page.getByLabel(/atleta em retorno progressivo ao jogo/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows 'Liberado' badge for athlete with LIBERADO RTP status", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, "LIBERADO");

    await page.goto("/athletes");

    await expect(
      page.getByLabel(/atleta liberado para jogo/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows '—' dash when athlete has no RTP status", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, null);

    await page.goto("/athletes");

    await expect(
      page.getByLabel(/sem status rtp registrado/i),
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Medical Timeline Modal", () => {
  test.beforeEach(async ({ page, authenticatedAsAdmin: _ }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, "AFASTADO");
    await mockGetMedicalRecords(page);
  });

  test("opens timeline modal when 'Histórico' button is clicked", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /ver histórico clínico de carlos eduardo/i,
      })
      .click();

    const timelineModal = page.getByRole("dialog", {
      name: /histórico clínico/i,
    });
    await expect(timelineModal).toBeVisible();
  });

  test("timeline modal shows the athlete's name in the header", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /ver histórico clínico de carlos eduardo/i,
      })
      .click();

    const timelineModal = page.getByRole("dialog", {
      name: /histórico clínico/i,
    });
    await expect(timelineModal.getByText("Carlos Eduardo")).toBeVisible();
  });

  test("timeline modal shows injury event with structure", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /ver histórico clínico de carlos eduardo/i,
      })
      .click();

    const timelineModal = page.getByRole("dialog", {
      name: /histórico clínico/i,
    });
    await expect(timelineModal).toBeVisible();
    await expect(timelineModal).toContainText("Isquiotibiais");
  });

  test("timeline modal shows legend with Lesão, Status RTP and Avaliação", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /ver histórico clínico de carlos eduardo/i,
      })
      .click();

    const timelineModal = page.getByRole("dialog", {
      name: /histórico clínico/i,
    });
    await expect(timelineModal.getByText(/lesão/i)).toBeVisible();
    await expect(timelineModal.getByText(/status rtp/i)).toBeVisible();
    await expect(timelineModal.getByText(/avaliação/i)).toBeVisible();
  });

  test("timeline modal closes when the close button is clicked", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /ver histórico clínico de carlos eduardo/i,
      })
      .click();

    const timelineModal = page.getByRole("dialog", {
      name: /histórico clínico/i,
    });
    await expect(timelineModal).toBeVisible();

    await timelineModal
      .getByRole("button", { name: /fechar histórico clínico/i })
      .click();

    await expect(timelineModal).not.toBeVisible({ timeout: 2_000 });
  });

  test("timeline modal closes on backdrop click", async ({
    page,
    authenticatedAsAdmin: _,
  }) => {
    await page.goto("/athletes");

    await page
      .getByRole("button", {
        name: /ver histórico clínico de carlos eduardo/i,
      })
      .click();

    const timelineModal = page.getByRole("dialog", {
      name: /histórico clínico/i,
    });
    await expect(timelineModal).toBeVisible();

    await page.mouse.click(8, 8);

    await expect(timelineModal).not.toBeVisible({ timeout: 2_000 });
  });
});

test.describe("Medical Record Form — role isolation", () => {
  test("PHYSIO can see and click the prontuário button", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, null);

    await page.goto("/athletes");

    const prontuarioBtn = page.getByRole("button", {
      name: /registrar lesão para carlos eduardo/i,
    });
    await expect(prontuarioBtn).toBeVisible();
  });

  test("PHYSIO can open the medical record form modal", async ({
    page,
    authenticatedAsPhysio: _,
  }) => {
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, null);

    await page.goto("/athletes");

    await page
      .getByRole("button", { name: /registrar lesão para carlos eduardo/i })
      .click();

    const form = new MedicalRecordFormPage(page);
    await expect(form.modal).toBeVisible();
  });

  test("TREASURER does NOT see the prontuário button", async ({ page }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, null);

    await page.goto("/athletes");

    await expect(
      page.getByRole("table", { name: /lista de atletas/i }),
    ).toBeVisible();

    const prontuarioBtn = page.getByRole("button", {
      name: /registrar lesão para carlos eduardo/i,
    });
    await expect(prontuarioBtn).not.toBeVisible();
  });

  test("TREASURER does NOT see the histórico button", async ({ page }) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockAthletesForMedicalTests(page);
    await mockGetAthleteRtp(page, null);

    await page.goto("/athletes");

    await expect(
      page.getByRole("table", { name: /lista de atletas/i }),
    ).toBeVisible();

    const historicoBtn = page.getByRole("button", {
      name: /ver histórico clínico de carlos eduardo/i,
    });
    await expect(historicoBtn).not.toBeVisible();
  });
});