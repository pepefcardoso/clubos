const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

export interface PublicSector {
  id: string;
  name: string;
  priceCents: number;
  capacity: number;
  available: number;
}

export interface PublicEventDetails {
  id: string;
  opponent: string;
  eventDate: string;
  venue: string;
  description: string | null;
  status: string;
  sectors: PublicSector[];
}

export interface PurchaseTicketPayload {
  sectorId: string;
  fanName: string;
  fanEmail: string;
  fanPhone: string;
  fanCpf: string;
}

export interface PurchaseTicketResult {
  ticketId: string;
  status: "PENDING";
  fanEmail: string;
  sectorName: string;
  amountCents: number;
  gatewayMeta: {
    qrCodeBase64?: string;
    pixCopyPaste?: string;
    [k: string]: unknown;
  };
}

export async function fetchPublicEventDetails(
  clubSlug: string,
  eventId: string,
): Promise<PublicEventDetails> {
  const res = await fetch(
    `${API_BASE}/api/events/${encodeURIComponent(clubSlug)}/${encodeURIComponent(eventId)}`,
    { next: { revalidate: 30 } },
  );
  if (res.status === 404) throw new EventNotFoundError();
  if (!res.ok) throw new Error(`Failed to fetch event: ${res.status}`);
  return res.json() as Promise<PublicEventDetails>;
}

export async function purchaseTicketPublic(
  clubSlug: string,
  eventId: string,
  body: PurchaseTicketPayload,
): Promise<PurchaseTicketResult> {
  const res = await fetch(
    `${API_BASE}/api/events/${encodeURIComponent(clubSlug)}/${encodeURIComponent(eventId)}/tickets/purchase`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? "Erro ao realizar compra.");
  }
  return res.json() as Promise<PurchaseTicketResult>;
}
