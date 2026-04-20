import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScanResultOverlay } from "../../components/access/ScanResultOverlay";
import type { ScanState } from "../../hooks/use-access-scanner";
import type { FieldAccessQueueEntry } from "../../lib/db/types";

const fakeEntry: FieldAccessQueueEntry = {
    localId: "aabbccdd-eeff-0011-2233-445566778899",
    clubId: "club_001",
    eventId: "event_001",
    token: "header.payload.sig",
    scannedAt: new Date().toISOString(),
    syncStatus: "pending",
    syncError: null,
    localValid: true,
    serverId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
};

function assertPresent(el: HTMLElement | null | undefined): asserts el is HTMLElement {
    expect(el).not.toBeNull();
    expect(el).not.toBeUndefined();
}

describe("ScanResultOverlay", () => {
    it("renders nothing when phase is idle", () => {
        const state: ScanState = { phase: "idle" };
        const { container } = render(<ScanResultOverlay state={state} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders nothing when phase is detecting", () => {
        const state: ScanState = { phase: "detecting" };
        const { container } = render(<ScanResultOverlay state={state} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders processing state with spinner text", () => {
        const state: ScanState = { phase: "processing", token: "some.token.here" };
        render(<ScanResultOverlay state={state} />);

        assertPresent(screen.getByRole("alert"));
        assertPresent(screen.getByText("Verificando…"));
    });

    it("renders green ACESSO LIBERADO when valid=true", () => {
        const state: ScanState = { phase: "result", valid: true, entry: fakeEntry };
        render(<ScanResultOverlay state={state} />);

        const overlay = screen.getByRole("alert");
        assertPresent(overlay);
        assertPresent(screen.getByText("ACESSO LIBERADO"));
        expect(overlay.className).toContain("emerald");
    });

    it("renders red ACESSO NEGADO when valid=false", () => {
        const state: ScanState = {
            phase: "result",
            valid: false,
            reason: "QR Code expirado.",
            entry: fakeEntry,
        };
        render(<ScanResultOverlay state={state} />);

        assertPresent(screen.getByText("ACESSO NEGADO"));
        assertPresent(screen.getByText("QR Code expirado."));
        expect(screen.getByRole("alert").className).toContain("red");
    });

    it("renders ACESSO NEGADO with a fallback reason when no reason is provided", () => {
        const state: ScanState = { phase: "result", valid: false, entry: fakeEntry };
        render(<ScanResultOverlay state={state} />);

        assertPresent(screen.getByText(/QR Code inválido/i));
    });

    it("renders amber SEM CONEXÃO when phase is queued", () => {
        const state: ScanState = { phase: "queued", entry: fakeEntry };
        render(<ScanResultOverlay state={state} />);

        assertPresent(screen.getByText("SEM CONEXÃO"));
        assertPresent(screen.getByText(/sincronizado ao reconectar/i));
        expect(screen.getByRole("alert").className).toContain("amber");
    });

    it("renders error state with the provided message", () => {
        const state: ScanState = { phase: "error", message: "Sessão expirada." };
        render(<ScanResultOverlay state={state} />);

        assertPresent(screen.getByText("ERRO"));
        assertPresent(screen.getByText("Sessão expirada."));
    });

    it("uses role=alert and aria-live=assertive for screen readers", () => {
        const state: ScanState = { phase: "result", valid: true, entry: fakeEntry };
        render(<ScanResultOverlay state={state} />);

        const overlay = screen.getByRole("alert");
        expect(overlay.getAttribute("aria-live")).toBe("assertive");
        expect(overlay.getAttribute("aria-atomic")).toBe("true");
    });

    it("calls onDismiss when the overlay is clicked (non-processing state)", () => {
        const onDismiss = vi.fn();
        const state: ScanState = { phase: "result", valid: true, entry: fakeEntry };
        render(<ScanResultOverlay state={state} onDismiss={onDismiss} />);

        fireEvent.click(screen.getByRole("alert"));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("shows 'Toque para continuar' hint when onDismiss is provided (non-processing)", () => {
        const state: ScanState = { phase: "result", valid: true, entry: fakeEntry };
        render(<ScanResultOverlay state={state} onDismiss={vi.fn()} />);

        assertPresent(screen.getByText(/toque para continuar/i));
    });

    it("does NOT show 'Toque para continuar' hint during processing", () => {
        const state: ScanState = { phase: "processing", token: "t.t.t" };
        render(<ScanResultOverlay state={state} onDismiss={vi.fn()} />);

        expect(screen.queryByText(/toque para continuar/i)).toBeNull();
    });
});