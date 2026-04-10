const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type InjuryGrade = "GRADE_1" | "GRADE_2" | "GRADE_3" | "COMPLETE";
export type InjuryMechanism = "CONTACT" | "NON_CONTACT" | "OVERUSE" | "UNKNOWN";

export interface MedicalRecordResponse {
  id: string;
  athleteId: string;
  athleteName: string;
  protocolId: string | null;
  /** ISO date string YYYY-MM-DD */
  occurredAt: string;
  structure: string;
  grade: InjuryGrade;
  mechanism: InjuryMechanism;
  /** Decrypted — null if not set */
  clinicalNotes: string | null;
  /** Decrypted — null if not set */
  diagnosis: string | null;
  /** Decrypted — null if not set */
  treatmentDetails: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalRecordSummary {
  id: string;
  athleteId: string;
  athleteName: string;
  protocolId: string | null;
  occurredAt: string;
  structure: string;
  grade: InjuryGrade;
  mechanism: InjuryMechanism;
  createdBy: string;
  createdAt: string;
}

export interface CreateMedicalRecordPayload {
  athleteId: string;
  protocolId?: string;
  occurredAt: string;
  structure: string;
  grade: InjuryGrade;
  mechanism: InjuryMechanism;
  clinicalNotes?: string;
  diagnosis?: string;
  treatmentDetails?: string;
}

export interface UpdateMedicalRecordPayload {
  protocolId?: string | null;
  occurredAt?: string;
  structure?: string;
  grade?: InjuryGrade;
  mechanism?: InjuryMechanism;
  clinicalNotes?: string | null;
  diagnosis?: string | null;
  treatmentDetails?: string | null;
}

export interface ListMedicalRecordsParams {
  athleteId?: string;
  grade?: InjuryGrade;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedMedicalRecords {
  data: MedicalRecordSummary[];
  total: number;
  page: number;
  limit: number;
}

export class MedicalRecordApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public error?: string,
  ) {
    super(message);
    this.name = "MedicalRecordApiError";
  }
}

export async function createMedicalRecord(
  payload: CreateMedicalRecordPayload,
  accessToken: string,
): Promise<MedicalRecordResponse> {
  const res = await fetch(`${API_BASE}/api/medical-records`, {
    method: "POST",
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
    throw new MedicalRecordApiError(
      body.message ?? "Erro ao registrar prontuário",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MedicalRecordResponse>;
}

export async function updateMedicalRecord(
  recordId: string,
  payload: UpdateMedicalRecordPayload,
  accessToken: string,
): Promise<MedicalRecordResponse> {
  const res = await fetch(`${API_BASE}/api/medical-records/${recordId}`, {
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
    throw new MedicalRecordApiError(
      body.message ?? "Erro ao atualizar prontuário",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MedicalRecordResponse>;
}

export async function getMedicalRecord(
  recordId: string,
  accessToken: string,
): Promise<MedicalRecordResponse> {
  const res = await fetch(`${API_BASE}/api/medical-records/${recordId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new MedicalRecordApiError(
      body.message ?? "Prontuário não encontrado",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MedicalRecordResponse>;
}

export async function listMedicalRecords(
  params: ListMedicalRecordsParams,
  accessToken: string,
): Promise<PaginatedMedicalRecords> {
  const query = new URLSearchParams();
  if (params.athleteId) query.set("athleteId", params.athleteId);
  if (params.grade) query.set("grade", params.grade);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));

  const res = await fetch(
    `${API_BASE}/api/medical-records?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new MedicalRecordApiError(
      body.message ?? `Erro ao buscar prontuários: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<PaginatedMedicalRecords>;
}

export async function deleteMedicalRecord(
  recordId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/medical-records/${recordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new MedicalRecordApiError(
      body.message ?? "Erro ao excluir prontuário",
      res.status,
      body.error,
    );
  }
}
