export interface SectorReportRow {
  sectorId: string;
  name: string;
  capacity: number;
  /** Total tickets in PAID status */
  sold: number;
  checkedIn: number;
  /** PAID && !checkedIn */
  noShows: number;
  /** (sold / capacity) × 100, rounded to 1 decimal. 0 when capacity = 0. */
  occupancyPct: number;
  /** sold × priceCents — integer cents [FIN] */
  revenueCents: number;
  priceCents: number;
}

export interface EventReportResponse {
  eventId: string;
  opponent: string;
  eventDate: string;
  venue: string;
  status: string;
  generatedAt: string;
  sectors: SectorReportRow[];
  /** Sum of sector revenueCents [FIN] */
  totalTicketRevenueCents: number;
  /** Sum of pos_sales.amountCents [FIN] */
  totalPosSalesCents: number;
  /** ticket + POS [FIN] */
  totalCombinedCents: number;
  totalCheckIns: number;
  totalNoShows: number;
  totalCapacity: number;
  totalSold: number;
  /** (totalSold / totalCapacity) × 100, rounded to 1 decimal */
  overallOccupancyPct: number;
  /** SHA-256 of deterministic fields */
  integrityHash: string;
}