import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParentalConsentModal } from "./ParentalConsentModal";

vi.mock("@/lib/api/tryout-consent", () => ({
  CURRENT_CONSENT_VERSION: "v1.0",
  ConsentApiError: class ConsentApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
      this.name = "ConsentApiError";
    }
  },
  recordParentalConsent: vi.fn(),
}));

vi.mock("@/lib/consent/consent-text", () => ({
  CONSENT_V1_TEXT: "Short mock consent text for testing purposes.",
  CURRENT_CONSENT_VERSION: "v1.0",
}));

import { recordParentalConsent } from "@/lib/api/tryout-consent";

const DEFAULT_PROPS = {
  clubSlug: "ec-alvarenga",
  athleteName: "João Silva",
  guardianName: "Maria Silva",
  guardianPhone: "11999990000",
  guardianRelationship: "mae" as const,
  onConsentRecorded: vi.fn(),
  onClose: vi.fn(),
};

function renderModal(overrides?: Partial<typeof DEFAULT_PROPS>) {
  return render(<ParentalConsentModal {...DEFAULT_PROPS} {...overrides} />);
}

/**
 * Helper: scroll the consent text area to the bottom to satisfy Gate 1.
 */
function scrollToBottom() {
  const scrollArea = screen.getByRole("region", {
    name: /texto do termo de consentimento/i,
  });
  Object.defineProperty(scrollArea, "scrollHeight", { value: 500 });
  Object.defineProperty(scrollArea, "scrollTop", { value: 500 });
  Object.defineProperty(scrollArea, "clientHeight", { value: 10 });
  fireEvent.scroll(scrollArea);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ParentalConsentModal — rendering", () => {
  it("renders with role=dialog and aria-modal", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("shows the athlete name in the warning banner", () => {
    renderModal();
    expect(screen.getByText(/João Silva/)).toBeDefined();
  });

  it("shows the consent document text", () => {
    renderModal();
    expect(screen.getByText(/Short mock consent text/)).toBeDefined();
  });

  it("renders the 'Confirmar e Aceitar' button", () => {
    renderModal();
    expect(
      screen.getByRole("button", { name: /confirmar e aceitar/i }),
    ).toBeDefined();
  });
});

describe("ParentalConsentModal — Gate 1: scroll", () => {
  it("'Confirmar' button is disabled before scrolling to bottom", () => {
    renderModal();
    const btn = screen.getByRole("button", { name: /confirmar e aceitar/i });
    expect(btn).toHaveProperty("disabled", true);
  });

  it("scroll prompt is visible before scrolling", () => {
    renderModal();
    expect(screen.getByText(/role o texto até ao final/i)).toBeDefined();
  });

  it("scroll prompt disappears after scrolling to bottom", () => {
    renderModal();
    scrollToBottom();
    expect(screen.queryByText(/role o texto até ao final/i)).toBeNull();
  });
});

describe("ParentalConsentModal — Gate 2: name confirmation", () => {
  it("button remains disabled after scroll if name field is empty", () => {
    renderModal();
    scrollToBottom();
    const btn = screen.getByRole("button", { name: /confirmar e aceitar/i });
    expect(btn).toHaveProperty("disabled", true);
  });

  it("shows error when name does not match", () => {
    renderModal();
    scrollToBottom();
    const input = screen.getByPlaceholderText(/Digite:/i);
    fireEvent.change(input, { target: { value: "Wrong Name" } });
    expect(screen.getByText(/nome não coincide/i)).toBeDefined();
  });

  it("does not show name error when field is empty", () => {
    renderModal();
    scrollToBottom();
    expect(screen.queryByText(/nome não coincide/i)).toBeNull();
  });

  it("name comparison is case-insensitive", () => {
    renderModal();
    scrollToBottom();
    const input = screen.getByPlaceholderText(/Digite:/i);
    fireEvent.change(input, { target: { value: "MARIA SILVA" } });
    expect(screen.queryByText(/nome não coincide/i)).toBeNull();
  });
});

describe("ParentalConsentModal — Gate 3: checkbox", () => {
  it("button remains disabled after scroll + name if checkbox is unchecked", () => {
    renderModal();
    scrollToBottom();
    const input = screen.getByPlaceholderText(/Digite:/i);
    fireEvent.change(input, { target: { value: "Maria Silva" } });
    const btn = screen.getByRole("button", { name: /confirmar e aceitar/i });
    expect(btn).toHaveProperty("disabled", true);
  });
});

describe("ParentalConsentModal — all gates satisfied", () => {
  function satisfyAllGates() {
    scrollToBottom();
    const input = screen.getByPlaceholderText(/Digite:/i);
    fireEvent.change(input, { target: { value: "Maria Silva" } });
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
  }

  it("button is enabled when all three gates are satisfied", () => {
    renderModal();
    satisfyAllGates();
    const btn = screen.getByRole("button", { name: /confirmar e aceitar/i });
    expect(btn).toHaveProperty("disabled", false);
  });

  it("calls recordParentalConsent with correct payload on confirm", async () => {
    vi.mocked(recordParentalConsent).mockResolvedValueOnce({
      consentId: "consent-123",
      consentToken: "token.hmac",
      issuedAt: new Date().toISOString(),
    });

    renderModal();
    satisfyAllGates();
    fireEvent.click(
      screen.getByRole("button", { name: /confirmar e aceitar/i }),
    );

    await waitFor(() => {
      expect(recordParentalConsent).toHaveBeenCalledWith({
        clubSlug: "ec-alvarenga",
        athleteName: "João Silva",
        guardianName: "Maria Silva",
        guardianPhone: "11999990000",
        guardianRelationship: "mae",
        consentVersion: "v1.0",
      });
    });
  });

  it("calls onConsentRecorded with the returned token", async () => {
    const onConsentRecorded = vi.fn();
    vi.mocked(recordParentalConsent).mockResolvedValueOnce({
      consentId: "consent-abc",
      consentToken: "mytoken.myhmac",
      issuedAt: new Date().toISOString(),
    });

    renderModal({ onConsentRecorded });
    satisfyAllGates();
    fireEvent.click(
      screen.getByRole("button", { name: /confirmar e aceitar/i }),
    );

    await waitFor(() => {
      expect(onConsentRecorded).toHaveBeenCalledWith("mytoken.myhmac");
    });
  });
});

describe("ParentalConsentModal — API error handling", () => {
  it("shows error message when API call fails", async () => {
    const { ConsentApiError } = await import("@/lib/api/tryout-consent");
    vi.mocked(recordParentalConsent).mockRejectedValueOnce(
      new ConsentApiError("Clube não encontrado.", 404),
    );

    renderModal();
    scrollToBottom();
    fireEvent.change(screen.getByPlaceholderText(/Digite:/i), {
      target: { value: "Maria Silva" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: /confirmar e aceitar/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Clube não encontrado.")).toBeDefined();
    });
  });

  it("re-enables the button after an API error (retry possible)", async () => {
    vi.mocked(recordParentalConsent).mockRejectedValueOnce(
      new Error("Network error"),
    );

    renderModal();
    scrollToBottom();
    fireEvent.change(screen.getByPlaceholderText(/Digite:/i), {
      target: { value: "Maria Silva" },
    });
    fireEvent.click(screen.getByRole("checkbox"));

    const btn = screen.getByRole("button", { name: /confirmar e aceitar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveProperty("disabled", false);
    });
  });
});

describe("ParentalConsentModal — keyboard / close", () => {
  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Cancelar button is clicked", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
