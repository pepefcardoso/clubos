const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface PublicClubInfo {
  id: string;
  name: string;
  logoUrl: string | null;
}

export class ClubNotFoundError extends Error {
  constructor(slug: string) {
    super(`Club "${slug}" not found`);
    this.name = "ClubNotFoundError";
  }
}

/**
 * Fetches minimal public club info (name, logoUrl) by slug.
 * Used by public-facing pages like the tryout form.
 *
 * - 404 → throws ClubNotFoundError (caller should call notFound())
 * - Other non-OK → throws generic Error
 *
 * ISR cache: 5 minutes — club name/logo rarely change.
 */
export async function fetchPublicClubInfo(
  slug: string,
): Promise<PublicClubInfo> {
  const res = await fetch(
    `${API_BASE}/api/public/clubs/${encodeURIComponent(slug)}/info`,
    { next: { revalidate: 300 } },
  );

  if (res.status === 404) throw new ClubNotFoundError(slug);

  if (!res.ok) {
    throw new Error(`Failed to fetch club info: ${res.status}`);
  }

  return res.json() as Promise<PublicClubInfo>;
}
