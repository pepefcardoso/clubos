const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface PosProductItem {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
  stock: number | null;
}

export interface PosChargeResult {
  saleId: string;
  paymentMethod: string;
  gatewayMeta?: Record<string, unknown>;
  usedFallback: boolean;
}

export async function fetchActivePosProducts(
  clubId: string,
  token: string,
): Promise<PosProductItem[]> {
  const res = await fetch(
    `${API_BASE}/api/clubs/${clubId}/pos-products?activeOnly=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Erro ao carregar produtos.");
  const body = (await res.json()) as { data: PosProductItem[] };
  return body.data;
}

export async function postPosCharge(
  eventId: string,
  payload: { productName: string; amountCents: number; method: "CARD" | "PIX" },
  token: string,
  idempotencyKey: string,
): Promise<PosChargeResult> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/pos/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Erro ao registrar venda.");
  }
  return res.json() as Promise<PosChargeResult>;
}
