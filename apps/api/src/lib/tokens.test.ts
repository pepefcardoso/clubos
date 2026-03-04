/**
 * Unit tests for src/lib/tokens.ts
 *
 * Fastify and its JWT plugin are not started — instead a minimal mock is
 * used so the token helpers can be tested in pure-unit style without
 * spinning up an HTTP server.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  issueAccessToken,
  issueRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  REFRESH_TOKEN_COOKIE,
} from "./tokens.js";

/**
 * Minimal Fastify mock.
 * The original version stored call records in typed arrays, which violated
 * exactOptionalPropertyTypes (TS2379): `options: object | undefined` is not
 * assignable to `options?: object` because exact mode treats "absent" and
 * "undefined" as distinct. Removed the arrays — all assertions use
 * vi.fn().mock.calls directly and cast to Record<string, unknown>.
 */
function makeMockFastify() {
  return {
    jwt: {
      sign: vi.fn((_payload: object, _options?: object) => "access.token"),
    },
    refresh: {
      sign: vi.fn((_payload: object, _options?: object) => "refresh.token"),
    },
  };
}

function makeMockReply() {
  return {
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  };
}

describe("exported constants", () => {
  it("ACCESS_TOKEN_EXPIRY is '15m'", () => {
    expect(ACCESS_TOKEN_EXPIRY).toBe("15m");
  });

  it("REFRESH_TOKEN_EXPIRY is '7d'", () => {
    expect(REFRESH_TOKEN_EXPIRY).toBe("7d");
  });

  it("REFRESH_TOKEN_COOKIE is 'refresh_token'", () => {
    expect(REFRESH_TOKEN_COOKIE).toBe("refresh_token");
  });
});

describe("issueAccessToken()", () => {
  let fastify: ReturnType<typeof makeMockFastify>;

  beforeEach(() => {
    fastify = makeMockFastify();
  });

  it("calls fastify.jwt.sign once", () => {
    issueAccessToken(fastify as never, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });
    expect(fastify.jwt.sign).toHaveBeenCalledOnce();
  });

  it("injects type: 'access' into the payload", () => {
    issueAccessToken(fastify as never, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });
    const payload = fastify.jwt.sign.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload["type"]).toBe("access");
  });

  it("passes expiresIn: ACCESS_TOKEN_EXPIRY as the sign option", () => {
    issueAccessToken(fastify as never, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });
    const options = fastify.jwt.sign.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(options).toEqual({ expiresIn: ACCESS_TOKEN_EXPIRY });
  });

  it("includes the caller-provided payload fields", () => {
    issueAccessToken(fastify as never, {
      sub: "user-99",
      clubId: "club-99",
      role: "TREASURER",
    });
    const payload = fastify.jwt.sign.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      sub: "user-99",
      clubId: "club-99",
      role: "TREASURER",
    });
  });

  it("returns the string produced by fastify.jwt.sign", () => {
    const token = issueAccessToken(fastify as never, {
      sub: "u",
      clubId: "c",
      role: "ADMIN",
    });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});

describe("issueRefreshToken()", () => {
  let fastify: ReturnType<typeof makeMockFastify>;

  beforeEach(() => {
    fastify = makeMockFastify();
  });

  it("calls fastify.refresh.sign once", () => {
    issueRefreshToken(fastify as never, "user-1");
    expect(fastify.refresh.sign).toHaveBeenCalledOnce();
  });

  it("returns an object with token and jti", () => {
    const result = issueRefreshToken(fastify as never, "user-1");
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("jti");
  });

  it("jti is a non-empty string (UUID format)", () => {
    const { jti } = issueRefreshToken(fastify as never, "user-1");
    expect(typeof jti).toBe("string");
    expect(jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("injects type: 'refresh' into the payload", () => {
    issueRefreshToken(fastify as never, "user-1");
    const payload = fastify.refresh.sign.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload["type"]).toBe("refresh");
  });

  it("includes sub equal to the userId", () => {
    issueRefreshToken(fastify as never, "user-42");
    const payload = fastify.refresh.sign.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload["sub"]).toBe("user-42");
  });

  it("includes the jti in the sign payload", () => {
    const { jti } = issueRefreshToken(fastify as never, "user-1");
    const payload = fastify.refresh.sign.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload["jti"]).toBe(jti);
  });

  it("passes expiresIn: REFRESH_TOKEN_EXPIRY", () => {
    issueRefreshToken(fastify as never, "user-1");
    const options = fastify.refresh.sign.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(options).toEqual({ expiresIn: REFRESH_TOKEN_EXPIRY });
  });

  it("generates a different jti on each call", () => {
    const { jti: jti1 } = issueRefreshToken(fastify as never, "user-1");
    const { jti: jti2 } = issueRefreshToken(fastify as never, "user-1");
    expect(jti1).not.toBe(jti2);
  });
});

describe("setRefreshTokenCookie()", () => {
  let reply: ReturnType<typeof makeMockReply>;

  beforeEach(() => {
    reply = makeMockReply();
    delete process.env["NODE_ENV"];
  });

  it("calls reply.setCookie once", () => {
    setRefreshTokenCookie(reply as never, "tok");
    expect(reply.setCookie).toHaveBeenCalledOnce();
  });

  it("uses the REFRESH_TOKEN_COOKIE name", () => {
    setRefreshTokenCookie(reply as never, "tok");
    expect(reply.setCookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "tok",
      expect.any(Object),
    );
  });

  it("sets httpOnly: true", () => {
    setRefreshTokenCookie(reply as never, "tok");
    const opts = reply.setCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts["httpOnly"]).toBe(true);
  });

  it("sets sameSite: strict", () => {
    setRefreshTokenCookie(reply as never, "tok");
    const opts = reply.setCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts["sameSite"]).toBe("strict");
  });

  it("sets path: /api/auth", () => {
    setRefreshTokenCookie(reply as never, "tok");
    const opts = reply.setCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts["path"]).toBe("/api/auth");
  });

  it("sets maxAge to 7 days in seconds", () => {
    setRefreshTokenCookie(reply as never, "tok");
    const opts = reply.setCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts["maxAge"]).toBe(7 * 24 * 60 * 60);
  });

  it("sets secure: false in non-production", () => {
    process.env["NODE_ENV"] = "development";
    setRefreshTokenCookie(reply as never, "tok");
    const opts = reply.setCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts["secure"]).toBe(false);
  });

  it("sets secure: true in production", () => {
    process.env["NODE_ENV"] = "production";
    setRefreshTokenCookie(reply as never, "tok");
    const opts = reply.setCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts["secure"]).toBe(true);
  });
});

describe("clearRefreshTokenCookie()", () => {
  let reply: ReturnType<typeof makeMockReply>;

  beforeEach(() => {
    reply = makeMockReply();
    delete process.env["NODE_ENV"];
  });

  it("calls reply.clearCookie once", () => {
    clearRefreshTokenCookie(reply as never);
    expect(reply.clearCookie).toHaveBeenCalledOnce();
  });

  it("clears the REFRESH_TOKEN_COOKIE", () => {
    clearRefreshTokenCookie(reply as never);
    expect(reply.clearCookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      expect.any(Object),
    );
  });

  it("uses httpOnly: true", () => {
    clearRefreshTokenCookie(reply as never);
    const opts = reply.clearCookie.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts["httpOnly"]).toBe(true);
  });

  it("uses path: /api/auth", () => {
    clearRefreshTokenCookie(reply as never);
    const opts = reply.clearCookie.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts["path"]).toBe("/api/auth");
  });

  it("sets secure: false in non-production", () => {
    process.env["NODE_ENV"] = "development";
    clearRefreshTokenCookie(reply as never);
    const opts = reply.clearCookie.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts["secure"]).toBe(false);
  });

  it("sets secure: true in production", () => {
    process.env["NODE_ENV"] = "production";
    clearRefreshTokenCookie(reply as never);
    const opts = reply.clearCookie.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts["secure"]).toBe(true);
  });
});
