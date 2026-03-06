import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import type { Redis } from "ioredis";

const { MOCK_REFRESH_JTI, MOCK_REFRESH_TOKEN } = vi.hoisted(() => {
  const jti = "test-refresh-jti-abc123";
  const payloadB64 = Buffer.from(
    JSON.stringify({ sub: "user-1", jti, type: "refresh" }),
  ).toString("base64url");
  return {
    MOCK_REFRESH_JTI: jti,
    MOCK_REFRESH_TOKEN: `mock.${payloadB64}.sig`,
  };
});

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/tokens.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/tokens.js")>();
  return {
    ...actual,
    issueRefreshToken: vi.fn().mockReturnValue({
      token: MOCK_REFRESH_TOKEN,
      jti: MOCK_REFRESH_JTI,
    }),
    setRefreshTokenCookie: vi.fn(),
    clearRefreshTokenCookie: vi.fn(),
  };
});

import * as redisModule from "../../lib/redis.js";
import * as tokensLib from "../../lib/tokens.js";
import authPlugin from "../../plugins/auth.plugin.js";
import {
  loginUser,
  refreshTokens,
  logoutUser,
  InvalidCredentialsError,
  UserNotFoundError,
} from "./auth.service.js";
import type { RefreshTokenPayload } from "../../types/fastify.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const HASHED_PASSWORD = await bcrypt.hash("password123", 10);

const MOCK_USER = {
  id: "user-1",
  email: "admin@clube.com",
  password: HASHED_PASSWORD,
  role: "ADMIN" as const,
  clubId: "club-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePrisma(userOverride?: Partial<typeof MOCK_USER> | null) {
  return {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          userOverride === null ? null : { ...MOCK_USER, ...userOverride },
        ),
    },
  } as never;
}

function makeRedis(): Redis {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn(),
  } as unknown as Redis;
}

/**
 * Builds a minimal Fastify instance with authPlugin registered.
 *
 * After ready(), we patch fastify.refresh.verify so that logoutUser can decode
 * MOCK_REFRESH_TOKEN without needing the full @fastify/jwt refresh namespace.
 * The patch is only applied when the namespace is absent (i.e. in test env).
 */
async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  fastify.decorate("redis", makeRedis());
  fastify.decorate("prisma", makePrisma() as never);
  await fastify.register(authPlugin);
  await fastify.ready();

  const fastifyMock = fastify as unknown as Record<string, any>;

  fastifyMock["refresh"] = {
    verify: (token: string): RefreshTokenPayload => {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid token format");
      }
      return JSON.parse(
        Buffer.from(parts[1]!, "base64url").toString("utf8"),
      ) as RefreshTokenPayload;
    },
  };

  return fastify;
}

describe("loginUser", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.mocked(redisModule.storeRefreshToken).mockResolvedValue(undefined);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("throws InvalidCredentialsError when the user does not exist", async () => {
    await expect(
      loginUser(
        app,
        makePrisma(null),
        makeRedis(),
        {} as FastifyReply,
        "nobody@test.com",
        "password123",
      ),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("throws InvalidCredentialsError when the password is wrong", async () => {
    await expect(
      loginUser(
        app,
        makePrisma(),
        makeRedis(),
        {} as FastifyReply,
        MOCK_USER.email,
        "wrongpassword",
      ),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("returns accessToken and user payload on valid credentials", async () => {
    const result = await loginUser(
      app,
      makePrisma(),
      makeRedis(),
      {} as FastifyReply,
      MOCK_USER.email,
      "password123",
    );

    expect(result).toHaveProperty("accessToken");
    expect(typeof result.accessToken).toBe("string");
    expect(result.user).toMatchObject({
      id: "user-1",
      email: "admin@clube.com",
      role: "ADMIN",
      clubId: "club-1",
    });
  });

  it("does NOT expose password in the returned user object", async () => {
    const result = await loginUser(
      app,
      makePrisma(),
      makeRedis(),
      {} as FastifyReply,
      MOCK_USER.email,
      "password123",
    );
    expect(result.user).not.toHaveProperty("password");
  });

  it("stores the refresh token JTI in Redis on success", async () => {
    await loginUser(
      app,
      makePrisma(),
      makeRedis(),
      {} as FastifyReply,
      MOCK_USER.email,
      "password123",
    );

    expect(redisModule.storeRefreshToken).toHaveBeenCalledOnce();
    const [, , userId] = vi.mocked(redisModule.storeRefreshToken).mock
      .calls[0]!;
    expect(userId).toBe("user-1");
  });

  it("calls setRefreshTokenCookie to persist the refresh token", async () => {
    const replySpy = {
      setCookie: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await loginUser(
      app,
      makePrisma(),
      makeRedis(),
      replySpy,
      MOCK_USER.email,
      "password123",
    );

    expect(vi.mocked(tokensLib.setRefreshTokenCookie)).toHaveBeenCalledOnce();
    expect(vi.mocked(tokensLib.setRefreshTokenCookie)).toHaveBeenCalledWith(
      replySpy,
      MOCK_REFRESH_TOKEN,
    );
  });

  it("performs constant-time compare even when user does not exist (timing-safe)", async () => {
    await expect(
      loginUser(
        app,
        makePrisma(null),
        makeRedis(),
        {} as FastifyReply,
        "ghost@example.com",
        "password123",
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("works for TREASURER role as well", async () => {
    const result = await loginUser(
      app,
      makePrisma({ role: "TREASURER" as "ADMIN" }),
      makeRedis(),
      {} as FastifyReply,
      MOCK_USER.email,
      "password123",
    );
    expect(result.user.role).toBe("TREASURER");
  });
});

describe("refreshTokens", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.mocked(redisModule.storeRefreshToken).mockResolvedValue(undefined);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  /** refreshTokens() receives the already-decoded payload — no JWT signing needed. */
  function makeRefreshPayload(userId = "user-1"): RefreshTokenPayload {
    return { sub: userId, jti: `test-jti-${userId}`, type: "refresh" };
  }

  it("returns a new accessToken when user exists", async () => {
    const result = await refreshTokens(
      app,
      makePrisma(),
      makeRedis(),
      {} as FastifyReply,
      makeRefreshPayload(),
    );
    expect(result).toHaveProperty("accessToken");
    expect(typeof result.accessToken).toBe("string");
  });

  it("throws UserNotFoundError when the user has been deleted", async () => {
    await expect(
      refreshTokens(
        app,
        makePrisma(null),
        makeRedis(),
        {} as FastifyReply,
        makeRefreshPayload(),
      ),
    ).rejects.toThrow(UserNotFoundError);
  });

  it("stores a new refresh JTI in Redis (token rotation)", async () => {
    await refreshTokens(
      app,
      makePrisma(),
      makeRedis(),
      {} as FastifyReply,
      makeRefreshPayload(),
    );
    expect(redisModule.storeRefreshToken).toHaveBeenCalledOnce();
  });

  it("calls setRefreshTokenCookie with the rotated refresh token", async () => {
    const replySpy = {
      setCookie: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await refreshTokens(
      app,
      makePrisma(),
      makeRedis(),
      replySpy,
      makeRefreshPayload(),
    );

    expect(vi.mocked(tokensLib.setRefreshTokenCookie)).toHaveBeenCalledOnce();
    expect(vi.mocked(tokensLib.setRefreshTokenCookie)).toHaveBeenCalledWith(
      replySpy,
      MOCK_REFRESH_TOKEN,
    );
  });

  it("issues an access token that contains the correct sub, clubId and role", async () => {
    const { accessToken } = await refreshTokens(
      app,
      makePrisma(),
      makeRedis(),
      {} as FastifyReply,
      makeRefreshPayload(),
    );

    const [, body] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    expect(claims.sub).toBe("user-1");
    expect(claims.clubId).toBe("club-1");
    expect(claims.role).toBe("ADMIN");
  });
});

describe("logoutUser", () => {
  let app: FastifyInstance;

  function makeReplySpy() {
    return {
      clearCookie: vi.fn().mockReturnThis(),
      setCookie: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
  }

  beforeEach(async () => {
    vi.mocked(redisModule.revokeRefreshToken).mockResolvedValue(undefined);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("does NOT revoke Redis when rawToken is undefined", async () => {
    await logoutUser(app, makeRedis(), makeReplySpy(), undefined);
    expect(redisModule.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("always calls clearRefreshTokenCookie regardless of token presence", async () => {
    await logoutUser(app, makeRedis(), makeReplySpy(), undefined);
    expect(vi.mocked(tokensLib.clearRefreshTokenCookie)).toHaveBeenCalledOnce();
  });

  it("revokes the JTI in Redis when a valid refresh token is supplied", async () => {
    await logoutUser(app, makeRedis(), makeReplySpy(), MOCK_REFRESH_TOKEN);
    expect(redisModule.revokeRefreshToken).toHaveBeenCalledOnce();
  });

  it("passes the correct JTI to revokeRefreshToken", async () => {
    await logoutUser(app, makeRedis(), makeReplySpy(), MOCK_REFRESH_TOKEN);
    expect(redisModule.revokeRefreshToken).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_REFRESH_JTI,
    );
  });

  it("does NOT throw when the token is malformed", async () => {
    await expect(
      logoutUser(app, makeRedis(), makeReplySpy(), "this.is.garbage"),
    ).resolves.not.toThrow();
    expect(redisModule.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("does NOT throw when rawToken is an empty string", async () => {
    await expect(
      logoutUser(app, makeRedis(), makeReplySpy(), ""),
    ).resolves.not.toThrow();
  });
});

describe("InvalidCredentialsError", () => {
  it("is an instance of Error", () => {
    expect(new InvalidCredentialsError()).toBeInstanceOf(Error);
  });

  it('has name "InvalidCredentialsError"', () => {
    expect(new InvalidCredentialsError().name).toBe("InvalidCredentialsError");
  });

  it('has message "Invalid credentials"', () => {
    expect(new InvalidCredentialsError().message).toBe("Invalid credentials");
  });
});

describe("UserNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new UserNotFoundError()).toBeInstanceOf(Error);
  });

  it('has name "UserNotFoundError"', () => {
    expect(new UserNotFoundError().name).toBe("UserNotFoundError");
  });

  it('has message "User not found"', () => {
    expect(new UserNotFoundError().message).toBe("User not found");
  });
});
