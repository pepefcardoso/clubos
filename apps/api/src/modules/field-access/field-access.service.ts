import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  withTenantSchema,
  isPrismaUniqueConstraintError,
} from "../../lib/prisma.js";
import type {
  ValidateAccessInput,
  ValidateAccessResponse,
  QrTokenPayload,
} from "./field-access.schema.js";

const QR_TOKEN_TTL_SECONDS = 4 * 60 * 60;

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

/**
 * Signs a field-access QR token (HS256).
 *
 * Called by the future QR generation endpoint (outside T-131 scope).
 * Defined here so the signing and verification live in the same module
 * and share constants.
 */
export function signQrToken(
  payload: Omit<QrTokenPayload, "iat" | "exp">,
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
        exp: now + QR_TOKEN_TTL_SECONDS,
      }),
    ),
  );
  const input = `${header}.${body}`;
  const sig = b64url(createHmac("sha256", secret).update(input).digest());
  return `${input}.${sig}`;
}

/**
 * Verifies a field-access QR token.
 *
 * Throws a descriptive Error on any failure. The service layer catches
 * these and maps them to the `rejectionReason` stored in the log row —
 * the HTTP response always returns 200 with `valid: false` to avoid
 * leaking information about token structure to gate staff.
 */
export function verifyQrToken(token: string, secret: string): QrTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Formato de token inválido.");

  const [h, p, s] = parts as [string, string, string];
  const input = `${h}.${p}`;
  const expectedSig = b64url(
    createHmac("sha256", secret).update(input).digest(),
  );

  const sBuf = Buffer.from(s);
  const eBuf = Buffer.from(expectedSig);
  if (sBuf.length !== eBuf.length || !timingSafeEqual(sBuf, eBuf)) {
    throw new Error("Assinatura inválida.");
  }

  const decoded = JSON.parse(fromB64url(p).toString("utf8")) as QrTokenPayload;

  if (decoded.type !== "field_access") {
    throw new Error("Tipo de token inválido.");
  }

  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("QR Code expirado.");
  }

  return decoded;
}

export interface ValidateAccessOptions {
  clubId: string;
  actorId: string;
  eventId: string;
  input: ValidateAccessInput;
  secret: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Validates a QR Code access token and records the result in field_access_logs.
 *
 * Idempotency contract:
 *   When `idempotencyKey` is provided and a log row with that key already
 *   exists, the function returns the stored result unchanged — no second
 *   row is inserted. This supports offline Background Sync: a scanner
 *   may retry the same scan submission multiple times before connectivity
 *   is confirmed; only the first reaches the DB.
 *
 * Security contract:
 *   ALWAYS returns HTTP 200. `valid: false` with a human-readable `reason`
 *   for any failure case — consistent with /api/public/verify-member-card.
 *   This prevents gate staff from seeing raw error messages and avoids
 *   leaking token structure information via HTTP status codes.
 */
export async function validateFieldAccess(
  prisma: PrismaClient,
  options: ValidateAccessOptions,
): Promise<ValidateAccessResponse> {
  const { clubId, actorId, eventId, input, secret } = options;
  const { idempotencyKey } = input;

  if (idempotencyKey) {
    const existing = await withTenantSchema(prisma, clubId, async (tx) => {
      return tx.fieldAccessLog.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          isValid: true,
          rejectionReason: true,
          scannedAt: true,
        },
      });
    });
    if (existing) {
      return {
        valid: existing.isValid,
        accessLogId: existing.id,
        reason: existing.rejectionReason ?? undefined,
        scannedAt: existing.scannedAt.toISOString(),
      };
    }
  }

  let decoded: QrTokenPayload | null = null;
  let rejectionReason: string | null = null;
  let isValid = false;

  try {
    decoded = verifyQrToken(input.token, secret);

    if (decoded.eventId !== null && decoded.eventId !== eventId) {
      rejectionReason = "QR Code não corresponde a este evento.";
    } else {
      isValid = true;
    }
  } catch (err) {
    rejectionReason = (err as Error).message;
  }

  const scannedAt = input.scannedAt ? new Date(input.scannedAt) : new Date();

  const logId = await withTenantSchema(prisma, clubId, async (tx) => {
    try {
      const log = await tx.fieldAccessLog.create({
        data: {
          id: randomUUID(),
          eventId: eventId || null,
          scannedBy: actorId,
          payload: input.token,
          isValid,
          rejectionReason,
          idempotencyKey: idempotencyKey ?? null,
          scannedAt,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          actorId,
          action: "FIELD_ACCESS_LOGGED",
          entityId: log.id,
          entityType: "FieldAccessLog",
          metadata: {
            eventId: eventId || null,
            isValid,
            ...(rejectionReason ? { rejectionReason } : {}),
          },
        },
      });

      return log.id;
    } catch (err) {
      if (isPrismaUniqueConstraintError(err) && idempotencyKey) {
        const existing = await tx.fieldAccessLog.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        return existing?.id ?? randomUUID();
      }
      throw err;
    }
  });

  return {
    valid: isValid,
    accessLogId: logId,
    reason: rejectionReason ?? undefined,
    scannedAt: scannedAt.toISOString(),
  };
}
