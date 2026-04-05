import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  issueConsentToken,
  verifyConsentToken,
  computeConsentHash,
  getConsentHmacSecret,
} from "./consent-token.js";

const TEST_SECRET = "test-secret-that-is-at-least-32-chars-long!!";
const CLUB_ID = "testclubid12345678901234";
const CONSENT_ID = "testconsentid12345678901";

beforeEach(() => {
  process.env["CONSENT_HMAC_SECRET"] = TEST_SECRET;
});

afterEach(() => {
  delete process.env["CONSENT_HMAC_SECRET"];
  vi.useRealTimers();
});

describe("getConsentHmacSecret()", () => {
  it("returns the key when CONSENT_HMAC_SECRET is set and long enough", () => {
    expect(getConsentHmacSecret()).toBe(TEST_SECRET);
  });

  it("throws when CONSENT_HMAC_SECRET is not set", () => {
    delete process.env["CONSENT_HMAC_SECRET"];
    expect(() => getConsentHmacSecret()).toThrow(/CONSENT_HMAC_SECRET/);
  });

  it("throws when CONSENT_HMAC_SECRET is shorter than 32 chars", () => {
    process.env["CONSENT_HMAC_SECRET"] = "tooshort";
    expect(() => getConsentHmacSecret()).toThrow(/CONSENT_HMAC_SECRET/);
  });

  it("does not throw at exactly 32 chars (boundary)", () => {
    process.env["CONSENT_HMAC_SECRET"] = "a".repeat(32);
    expect(() => getConsentHmacSecret()).not.toThrow();
  });
});

describe("issueConsentToken()", () => {
  it("returns a token string and an issuedAt Date", () => {
    const { token, issuedAt } = issueConsentToken(CONSENT_ID, CLUB_ID);
    expect(typeof token).toBe("string");
    expect(issuedAt).toBeInstanceOf(Date);
  });

  it("token contains exactly one dot separator", () => {
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);
    const dotCount = (token.match(/\./g) ?? []).length;
    expect(dotCount).toBe(1);
  });

  it("produces different tokens for different consentIds", () => {
    const { token: t1 } = issueConsentToken("id-one", CLUB_ID);
    const { token: t2 } = issueConsentToken("id-two", CLUB_ID);
    expect(t1).not.toBe(t2);
  });

  it("produces different tokens for different clubIds", () => {
    const { token: t1 } = issueConsentToken(CONSENT_ID, "club-aaa");
    const { token: t2 } = issueConsentToken(CONSENT_ID, "club-bbb");
    expect(t1).not.toBe(t2);
  });
});

describe("issueConsentToken / verifyConsentToken round-trip", () => {
  it("verifies a freshly issued token", () => {
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);
    const result = verifyConsentToken(token, CLUB_ID);
    expect(result).not.toBeNull();
    expect(result?.consentId).toBe(CONSENT_ID);
    expect(result?.clubId).toBe(CLUB_ID);
  });

  it("returns an issuedAt Date matching the issue time", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-01T09:00:00.000Z");
    vi.setSystemTime(now);

    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);
    const result = verifyConsentToken(token, CLUB_ID);

    expect(result?.issuedAt.toISOString()).toBe(now.toISOString());
  });
});

describe("verifyConsentToken() — rejection cases", () => {
  it("returns null for a tampered HMAC suffix", () => {
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);
    const tampered = token.slice(0, -4) + "xxxx";
    expect(verifyConsentToken(tampered, CLUB_ID)).toBeNull();
  });

  it("returns null when the payload is base64-modified", () => {
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);
    const dotIdx = token.lastIndexOf(".");
    const hmac = token.slice(dotIdx);
    const badPayload = token.slice(0, dotIdx - 1) + "Z";
    expect(verifyConsentToken(badPayload + hmac, CLUB_ID)).toBeNull();
  });

  it("returns null for wrong expectedClubId", () => {
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);
    expect(verifyConsentToken(token, "wrong-club-id-00000000000")).toBeNull();
  });

  it("returns null for a token older than 2 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T10:00:00.000Z"));
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);

    vi.setSystemTime(new Date("2025-01-01T12:01:00.000Z"));
    expect(verifyConsentToken(token, CLUB_ID)).toBeNull();
  });

  it("accepts a token that is exactly 1 minute before the 2-hour boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T10:00:00.000Z"));
    const { token } = issueConsentToken(CONSENT_ID, CLUB_ID);

    vi.setSystemTime(new Date("2025-01-01T11:59:00.000Z"));
    expect(verifyConsentToken(token, CLUB_ID)).not.toBeNull();
  });

  it("returns null for a malformed token with no dot", () => {
    expect(verifyConsentToken("nodotinthisstring", CLUB_ID)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyConsentToken("", CLUB_ID)).toBeNull();
  });

  it("returns null when payload decodes to fewer than 3 pipe-separated parts", () => {
    const badPayload = Buffer.from("onlytwo|parts").toString("base64url");
    const fakeToken = badPayload + ".badhmacsuffix";
    expect(verifyConsentToken(fakeToken, CLUB_ID)).toBeNull();
  });
});

describe("computeConsentHash()", () => {
  const BASE_PARAMS = {
    athleteName: "João Silva",
    guardianName: "Maria Silva",
    guardianPhone: "11999990000",
    guardianRelationship: "mae",
    clubSlug: "ec-alvarenga",
    consentVersion: "v1.0",
    consentText: "full consent text here",
    issuedAt: "2025-06-01T09:00:00.000Z",
  };

  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = computeConsentHash(BASE_PARAMS);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same hash for identical inputs (deterministic)", () => {
    expect(computeConsentHash(BASE_PARAMS)).toBe(
      computeConsentHash({ ...BASE_PARAMS }),
    );
  });

  it("returns a different hash when athleteName changes", () => {
    const h1 = computeConsentHash(BASE_PARAMS);
    const h2 = computeConsentHash({
      ...BASE_PARAMS,
      athleteName: "Pedro Costa",
    });
    expect(h1).not.toBe(h2);
  });

  it("returns a different hash when consentText changes", () => {
    const h1 = computeConsentHash(BASE_PARAMS);
    const h2 = computeConsentHash({
      ...BASE_PARAMS,
      consentText: "different text",
    });
    expect(h1).not.toBe(h2);
  });

  it("returns a different hash when issuedAt changes", () => {
    const h1 = computeConsentHash(BASE_PARAMS);
    const h2 = computeConsentHash({
      ...BASE_PARAMS,
      issuedAt: "2025-06-02T09:00:00.000Z",
    });
    expect(h1).not.toBe(h2);
  });
});
