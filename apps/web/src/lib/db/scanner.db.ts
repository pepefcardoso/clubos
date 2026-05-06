import Dexie, { type Table } from "dexie";

export type ScanQueueStatus = "pending" | "synced" | "error";

export interface ScanQueueEntry {
  /** PK — structural dedup: one row per ticketId */
  ticketId: string;
  qrPayload: string;
  eventId: string;
  /** Date.now() at scan time */
  scannedAt: number;
  status: ScanQueueStatus;
  errorMessage?: string;
}

class ScannerDb extends Dexie {
  scanQueue!: Table<ScanQueueEntry, string>;

  constructor() {
    super("clubos-scanner");
    this.version(1).stores({
      scanQueue: "ticketId, status, scannedAt",
    });
  }
}

/**
 * Isolated Dexie instance for the gate-scanner module.
 * Separate from the main `clubos-db` instance to allow independent versioning
 * and avoid migration coupling with the coaching workflow tables.
 *
 * BROWSER-ONLY — do not import in Server Components or API Routes.
 */
export const scannerDb = new ScannerDb();
