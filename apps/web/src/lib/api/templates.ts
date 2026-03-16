const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public error?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TemplateListItem {
  key: string;
  channel: "WHATSAPP" | "EMAIL";
  body: string;
  isCustom: boolean;
}

export async function fetchTemplates(
  accessToken: string,
  _channel: "WHATSAPP" | "EMAIL" = "WHATSAPP",
): Promise<TemplateListItem[]> {
  const res = await fetch(`${API_BASE}/api/templates`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao carregar templates: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<TemplateListItem[]>;
}

export async function upsertTemplate(
  key: string,
  payload: { body: string; channel: "WHATSAPP" | "EMAIL" },
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/templates/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao salvar template: ${res.status}`,
      res.status,
      body.error,
    );
  }
}

export async function resetTemplate(
  key: string,
  channel: "WHATSAPP" | "EMAIL",
  accessToken: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/templates/${key}?channel=${channel}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao restaurar template: ${res.status}`,
      res.status,
      body.error,
    );
  }
}
