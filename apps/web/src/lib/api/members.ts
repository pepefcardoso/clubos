import type {
  PaginatedResponse,
  MemberStatus,
} from "../../../../../packages/shared-types/src/index.js";
import type { MemberResponse } from "../../../../api/src/modules/members/members.schema";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface FetchMembersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: MemberStatus | "";
}

export async function fetchMembers(
  params: FetchMembersParams,
  accessToken: string,
): Promise<PaginatedResponse<MemberResponse>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search && params.search.trim() !== "")
    query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);

  const res = await fetch(`${API_BASE}/api/members?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch members: ${res.status}`);
  }

  return res.json() as Promise<PaginatedResponse<MemberResponse>>;
}
