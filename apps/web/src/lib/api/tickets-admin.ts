const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Mirrors ValidateTicketResponse from apps/api/src/modules/events/tickets.validate.schema.ts */
export interface ValidateTicketResponse {
  ticketId: string;
  fanName: string;
  sectorName: string;
  eventId: string;
  checkedInAt: string;
}

export class TicketAlreadyScannedError extends Error {
  constructor() {
    super("Ingresso já utilizado.");
    this.name = "TicketAlreadyScannedError";
  }
}

export class InvalidTicketError extends Error {
  constructor(msg = "QR Code inválido ou expirado.") {
    super(msg);
    this.name = "InvalidTicketError";
  }
}

/**
 * Calls POST /api/tickets/:ticketId/validate.
 *
 * The backend cross-validates :ticketId against the parsed QR payload to
 * prevent ticket substitution attacks. Both values must match.
 *
 * @throws {TicketAlreadyScannedError} HTTP 409 — ticket already checked-in
 * @throws {InvalidTicketError}        HTTP 400 — tampered/expired QR, cancelled ticket, etc.
 * @throws {Error}                     Other HTTP errors or network failures
 */
export async function validateTicketApi(
  ticketId: string,
  qrPayload: string,
  accessToken: string,
): Promise<ValidateTicketResponse> {
  const res = await fetch(
    `${API_BASE}/api/tickets/${encodeURIComponent(ticketId)}/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ qrPayload }),
    },
  );

  if (res.status === 409) throw new TicketAlreadyScannedError();

  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new InvalidTicketError(body.message);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Erro ao validar ingresso.");
  }

  return res.json() as Promise<ValidateTicketResponse>;
}
