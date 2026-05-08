const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ChecklistItemResponse {
  id: string;
  eventId: string;
  category: string;
  item: string;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistResponse {
  eventId: string;
  byCategory: Record<string, ChecklistItemResponse[]>;
  totalItems: number;
  completedItems: number;
}

export async function fetchChecklist(
  eventId: string,
  accessToken: string,
): Promise<ChecklistResponse> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/checklist`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(body.message ?? "Erro ao buscar checklist."),
      {
        status: res.status,
      },
    );
  }
  return res.json() as Promise<ChecklistResponse>;
}

export async function toggleChecklistItem(
  eventId: string,
  itemId: string,
  completed: boolean,
  accessToken: string,
): Promise<ChecklistItemResponse> {
  const res = await fetch(
    `${API_BASE}/api/events/${eventId}/checklist/${itemId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ completed }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? "Erro ao atualizar item."), {
      status: res.status,
    });
  }
  return res.json() as Promise<ChecklistItemResponse>;
}
