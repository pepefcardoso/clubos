import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessLogExport } from "../../components/access/AccessLogExport";
import type { FieldAccessQueueEntry } from "../../lib/db/types";

const { mockDownloadCsv, mockToCsv } = vi.hoisted(() => ({
    mockDownloadCsv: vi.fn(),
    mockToCsv: vi.fn().mockReturnValue("mocked,csv,content"),
}));

vi.mock("@/lib/csv-export", () => ({
    toCsv: mockToCsv,
    downloadCsv: mockDownloadCsv,
}));

const makeEntry = (
    overrides: Partial<FieldAccessQueueEntry> = {},
): FieldAccessQueueEntry => ({
    localId: `local-${Math.random().toString(36).slice(2)}`,
    clubId: "club_001",
    eventId: "event_001",
    token: "header.payload.sig",
    scannedAt: new Date().toISOString(),
    syncStatus: "synced",
    syncError: null,
    localValid: true,
    serverId: "srv_001",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2025-06-15T10:00:00.000Z"));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("AccessLogExport", () => {
    it("renders the export button", () => {
        render(<AccessLogExport entries={[makeEntry()]} eventId="event_001" />);
        expect(screen.getByRole("button")).not.toBeNull();
    });

    it("is disabled when entries array is empty", () => {
        render(<AccessLogExport entries={[]} eventId="event_001" />);
        expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    });

    it("is enabled when entries exist", () => {
        render(<AccessLogExport entries={[makeEntry()]} eventId="event_001" />);
        expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    });

    it("calls downloadCsv with a filename containing the eventId and current date", () => {
        render(<AccessLogExport entries={[makeEntry()]} eventId="event_001" />);

        fireEvent.click(screen.getByRole("button"));

        expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
        const [, filename] = mockDownloadCsv.mock.calls[0] as [string, string];
        expect(filename).toContain("event_001");
        expect(filename).toContain("2025-06-15");
        expect(filename).toMatch(/\.csv$/);
    });

    it("calls toCsv with the correct column header keys", () => {
        render(<AccessLogExport entries={[makeEntry()]} eventId="event_001" />);

        fireEvent.click(screen.getByRole("button"));

        const [, headers] = mockToCsv.mock.calls[0] as [
            unknown[],
            Array<{ key: string; label: string }>,
        ];
        const keys = headers.map((h) => h.key);
        expect(keys).toContain("horario");
        expect(keys).toContain("resultado");
        expect(keys).toContain("sync");
        expect(keys).toContain("serverId");
        expect(keys).toContain("localId");
    });

    it("maps localValid=true to 'LIBERADO' in the CSV row", () => {
        render(<AccessLogExport entries={[makeEntry({ localValid: true, serverId: "srv_abc" })]} eventId="event_001" />);

        fireEvent.click(screen.getByRole("button"));

        const [rows] = mockToCsv.mock.calls[0] as [Array<Record<string, unknown>>];
        expect(rows[0]?.resultado).toBe("LIBERADO");
    });

    it("maps localValid=false to 'NEGADO' in the CSV row", () => {
        render(<AccessLogExport entries={[makeEntry({ localValid: false })]} eventId="event_001" />);

        fireEvent.click(screen.getByRole("button"));

        const [rows] = mockToCsv.mock.calls[0] as [Array<Record<string, unknown>>];
        expect(rows[0]?.resultado).toBe("NEGADO");
    });

    it("maps localValid=null to 'PENDENTE' in the CSV row", () => {
        render(<AccessLogExport entries={[makeEntry({ localValid: null })]} eventId="event_001" />);

        fireEvent.click(screen.getByRole("button"));

        const [rows] = mockToCsv.mock.calls[0] as [Array<Record<string, unknown>>];
        expect(rows[0]?.resultado).toBe("PENDENTE");
    });

    it("maps null serverId to '—' in the CSV row", () => {
        render(<AccessLogExport entries={[makeEntry({ serverId: null })]} eventId="event_001" />);

        fireEvent.click(screen.getByRole("button"));

        const [rows] = mockToCsv.mock.calls[0] as [Array<Record<string, unknown>>];
        expect(rows[0]?.serverId).toBe("—");
    });

    it("displays the entry count in the button when entries exist", () => {
        const entries = [makeEntry(), makeEntry(), makeEntry()];
        render(<AccessLogExport entries={entries} eventId="event_001" />);
        expect(screen.getByText("(3)")).not.toBeNull();
    });

    it("does not show the count when entries is empty", () => {
        render(<AccessLogExport entries={[]} eventId="event_001" />);
        expect(screen.queryByText(/\(\d+\)/)).toBeNull();
    });
});