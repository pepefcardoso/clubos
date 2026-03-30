import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";

const CARD_TOKEN_TTL_SECONDS = 24 * 60 * 60;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export interface MemberCardPayload {
  /** memberId */
  sub: string;
  clubId: string;
  memberName: string;
  memberStatus: string;
  clubSlug: string;
  clubName: string;
  /** Always "member_card" — prevents token confusion with access tokens */
  type: "member_card";
  iat: number;
  exp: number;
}

/**
 * Signs a member card token using HS256 with the provided secret.
 * Sets `iat` and `exp` automatically (24-hour TTL).
 *
 * Security: the `type: "member_card"` claim prevents this token from being
 * accepted by `verifyAccessToken` — each token type is validated by its
 * respective verifier.
 */
export function signCardToken(
  payload: Omit<MemberCardPayload, "iat" | "exp">,
  secret: string,
): string {
  const header = b64url(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    Buffer.from(
      JSON.stringify({
        ...payload,
        iat: now,
        exp: now + CARD_TOKEN_TTL_SECONDS,
      }),
    ),
  );
  const input = `${header}.${body}`;
  const sig = b64url(createHmac("sha256", secret).update(input).digest());
  return `${input}.${sig}`;
}

/**
 * Verifies and decodes a member card token.
 * Throws on invalid signature, expiry, or wrong token type.
 *
 * Always returns HTTP 200 from the public verify endpoint (caller catches here)
 * to avoid leaking existence information via HTTP status codes.
 */
export function verifyCardToken(
  token: string,
  secret: string,
): MemberCardPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [h, p, s] = parts as [string, string, string];
  const input = `${h}.${p}`;
  const expectedSig = b64url(
    createHmac("sha256", secret).update(input).digest(),
  );

  const sBuf = Buffer.from(s);
  const eBuf = Buffer.from(expectedSig);
  if (sBuf.length !== eBuf.length || !timingSafeEqual(sBuf, eBuf)) {
    throw new Error("Invalid signature");
  }

  const decoded = JSON.parse(
    fromB64url(p).toString("utf8"),
  ) as MemberCardPayload;

  if (decoded.type !== "member_card") {
    throw new Error("Invalid token type");
  }

  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return decoded;
}

export interface MemberCardData {
  cardToken: string;
  expiresAt: string;
  member: {
    id: string;
    name: string;
    status: string;
    joinedAt: string;
  };
  club: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
}

/**
 * Generates a signed digital membership card for a member.
 *
 * The card token embeds non-sensitive display data (member name, status, club
 * info) so the public verification page can render immediately before the
 * real-time status check resolves.
 *
 * CPF, phone, and any other encrypted fields are never included in the token.
 * `member.name` is stored as plaintext — only `cpf` and `phone` are BYTEA.
 *
 * @param prisma       Singleton Prisma client
 * @param clubId       Club ID from the authenticated user's JWT
 * @param memberId     Target member ID (already IDOR-checked by the route)
 * @param cardSecret   MEMBER_CARD_SECRET env var value
 */
export async function generateMemberCard(
  prisma: PrismaClient,
  clubId: string,
  memberId: string,
  cardSecret: string,
): Promise<MemberCardData> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });
  if (!club) throw new NotFoundError("Clube não encontrado.");

  const member = await withTenantSchema(prisma, clubId, async (tx) => {
    const m = await tx.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        name: true,
        status: true,
        joinedAt: true,
      },
    });
    if (!m) throw new NotFoundError("Sócio não encontrado.");
    return m;
  });

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date(
    (now + CARD_TOKEN_TTL_SECONDS) * 1000,
  ).toISOString();

  const cardToken = signCardToken(
    {
      sub: memberId,
      clubId,
      memberName: member.name,
      memberStatus: member.status,
      clubSlug: club.slug,
      clubName: club.name,
      type: "member_card",
    },
    cardSecret,
  );

  return {
    cardToken,
    expiresAt,
    member: {
      id: member.id,
      name: member.name,
      status: member.status,
      joinedAt: member.joinedAt.toISOString(),
    },
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      logoUrl: club.logoUrl ?? null,
    },
  };
}
