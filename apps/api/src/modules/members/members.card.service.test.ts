/**
 * Unit tests for members.card.service.ts
 *
 * Covers:
 *   1. signCardToken produces valid HS256 JWT with correct claims
 *   2. verifyCardToken accepts valid tokens
 *   3. verifyCardToken throws on tampered signature
 *   4. verifyCardToken throws on expired token
 *   5. verifyCardToken throws on wrong `type` claim
 *   6. Token never contains CPF or phone (structural check)
 */

import { describe, it, expect } from "vitest";
import { signCardToken, verifyCardToken } from "./members.card.service.js";

const SECRET = "test-card-secret-at-least-32-characters-long!";

const BASE_PAYLOAD = {
  sub: "member-abc-123",
  clubId: "club-xyz-456",
  memberName: "João Silva",
  memberStatus: "ACTIVE",
  clubSlug: "gremio-test",
  clubName: "Grêmio Teste",
  type: "member_card" as const,
};

describe("signCardToken()", () => {
  it("returns a string with three dot-separated parts (JWT format)", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("encodes the correct sub (memberId)", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const decoded = verifyCardToken(token, SECRET);
    expect(decoded.sub).toBe("member-abc-123");
  });

  it("encodes memberName correctly", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const decoded = verifyCardToken(token, SECRET);
    expect(decoded.memberName).toBe("João Silva");
  });

  it("encodes type as 'member_card'", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const decoded = verifyCardToken(token, SECRET);
    expect(decoded.type).toBe("member_card");
  });

  it("sets iat in the past or present", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const decoded = verifyCardToken(token, SECRET);
    expect(decoded.iat).toBeGreaterThanOrEqual(before - 1);
    expect(decoded.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
  });

  it("sets exp approximately 24 hours after iat", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const decoded = verifyCardToken(token, SECRET);
    const diff = decoded.exp - decoded.iat;
    expect(diff).toBe(24 * 60 * 60);
  });

  it("does not include CPF or phone in the token payload", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const payloadB64 = token.split(".")[1]!;
    const payloadJson = Buffer.from(
      payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    expect(payloadJson).not.toContain("cpf");
    expect(payloadJson).not.toContain("phone");
  });

  it("produces different tokens for different secrets", () => {
    const t1 = signCardToken(BASE_PAYLOAD, SECRET);
    const t2 = signCardToken(BASE_PAYLOAD, SECRET + "different");
    expect(t1).not.toBe(t2);
  });
});

describe("verifyCardToken()", () => {
  it("round-trips all payload fields correctly", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const decoded = verifyCardToken(token, SECRET);

    expect(decoded.sub).toBe(BASE_PAYLOAD.sub);
    expect(decoded.clubId).toBe(BASE_PAYLOAD.clubId);
    expect(decoded.memberName).toBe(BASE_PAYLOAD.memberName);
    expect(decoded.memberStatus).toBe(BASE_PAYLOAD.memberStatus);
    expect(decoded.clubSlug).toBe(BASE_PAYLOAD.clubSlug);
    expect(decoded.clubName).toBe(BASE_PAYLOAD.clubName);
    expect(decoded.type).toBe("member_card");
  });

  it("throws 'Invalid token format' for a malformed token (2 parts)", () => {
    expect(() => verifyCardToken("header.body", SECRET)).toThrow(
      "Invalid token format",
    );
  });

  it("throws 'Invalid token format' for an empty string", () => {
    expect(() => verifyCardToken("", SECRET)).toThrow("Invalid token format");
  });

  it("throws 'Invalid signature' when the signature segment is tampered", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.TAMPERED_SIGNATURE_HERE`;
    expect(() => verifyCardToken(tampered, SECRET)).toThrow();
  });

  it("throws when last 5 characters of signature are replaced", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyCardToken(tampered, SECRET)).toThrow();
  });

  it("throws when payload is modified (changing memberName)", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    const parts = token.split(".");

    const maliciousPayload = Buffer.from(
      JSON.stringify({
        ...BASE_PAYLOAD,
        memberName: "Hacker",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const tampered = `${parts[0]}.${maliciousPayload}.${parts[2]}`;
    expect(() => verifyCardToken(tampered, SECRET)).toThrow();
  });

  it("throws 'Token expired' for a token with exp in the past", async () => {
    function b64url(buf: Buffer): string {
      return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    const { createHmac } = await import("node:crypto");
    const header = b64url(
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    );
    const body = b64url(
      Buffer.from(
        JSON.stringify({
          ...BASE_PAYLOAD,
          iat: 1000000,
          exp: 1000001,
        }),
      ),
    );
    const input = `${header}.${body}`;
    const sig = b64url(createHmac("sha256", SECRET).update(input).digest());
    const expiredToken = `${input}.${sig}`;

    expect(() => verifyCardToken(expiredToken, SECRET)).toThrow(
      "Token expired",
    );
  });

  it("throws 'Invalid token type' when type is 'access'", async () => {
    function b64url(buf: Buffer): string {
      return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    const { createHmac } = await import("node:crypto");
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    );
    const body = b64url(
      Buffer.from(
        JSON.stringify({
          ...BASE_PAYLOAD,
          type: "access",
          iat: now,
          exp: now + 86400,
        }),
      ),
    );
    const input = `${header}.${body}`;
    const sig = b64url(createHmac("sha256", SECRET).update(input).digest());
    const wrongTypeToken = `${input}.${sig}`;

    expect(() => verifyCardToken(wrongTypeToken, SECRET)).toThrow(
      "Invalid token type",
    );
  });

  it("throws 'Invalid token type' when type is 'refresh'", async () => {
    function b64url(buf: Buffer): string {
      return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    const { createHmac } = await import("node:crypto");
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    );
    const body = b64url(
      Buffer.from(
        JSON.stringify({
          ...BASE_PAYLOAD,
          type: "refresh",
          iat: now,
          exp: now + 86400,
        }),
      ),
    );
    const input = `${header}.${body}`;
    const sig = b64url(createHmac("sha256", SECRET).update(input).digest());
    const token = `${input}.${sig}`;

    expect(() => verifyCardToken(token, SECRET)).toThrow("Invalid token type");
  });

  it("throws when verified with a different secret", () => {
    const token = signCardToken(BASE_PAYLOAD, SECRET);
    expect(() =>
      verifyCardToken(token, "wrong-secret-32-chars-minimum-xx"),
    ).toThrow();
  });
});
