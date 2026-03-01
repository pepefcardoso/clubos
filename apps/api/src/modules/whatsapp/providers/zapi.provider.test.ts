import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ZApiProvider } from "./zapi.provider.js";
import { WhatsAppProviderError } from "../whatsapp.interface.js";

const VALID_ENV = {
  ZAPI_INSTANCE_ID: "test-instance-id",
  ZAPI_TOKEN: "test-token",
  ZAPI_CLIENT_TOKEN: "test-client-token",
};

function setEnv(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }
}

function clearEnv(): void {
  delete process.env["ZAPI_INSTANCE_ID"];
  delete process.env["ZAPI_TOKEN"];
  delete process.env["ZAPI_CLIENT_TOKEN"];
}

function mockFetchOk(body: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchError(status: number, body: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchNetworkFailure(message = "Connection refused"): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(message)));
}

const INPUT = {
  phone: "5511999990000",
  body: "Olá! Sua cobrança vence amanhã.",
  idempotencyKey: "msg-abc-123",
};

describe("ZApiProvider", () => {
  beforeEach(() => {
    setEnv(VALID_ENV);
  });

  afterEach(() => {
    clearEnv();
    vi.unstubAllGlobals();
  });

  describe("ZP-1: successful send", () => {
    it("returns providerMessageId from zaapId when present", async () => {
      mockFetchOk({ zaapId: "zap-001", status: "sent" });

      const provider = new ZApiProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("zap-001");
      expect(result.rawResponse).toMatchObject({ zaapId: "zap-001" });
    });

    it("falls back to messageId when zaapId is absent", async () => {
      mockFetchOk({ messageId: "msg-fallback-001" });

      const provider = new ZApiProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("msg-fallback-001");
    });

    it("falls back to id field when neither zaapId nor messageId is present", async () => {
      mockFetchOk({ id: "id-fallback-001" });

      const provider = new ZApiProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("id-fallback-001");
    });

    it("uses idempotencyKey as providerMessageId when no ID field is in response", async () => {
      mockFetchOk({ status: "queued" });

      const provider = new ZApiProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("msg-abc-123");
    });

    it("calls the correct Z-API URL with correct headers", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ zaapId: "zap-x" }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const provider = new ZApiProvider();
      await provider.sendMessage(INPUT);

      const [url, options] = fetchSpy.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string>; body: string },
      ];

      expect(url).toBe(
        "https://api.z-api.io/instances/test-instance-id/token/test-token/send-text",
      );
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["Client-Token"]).toBe("test-client-token");
    });

    it("sends phone and message in the request body", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ zaapId: "zap-x" }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const provider = new ZApiProvider();
      await provider.sendMessage(INPUT);

      const [, options] = fetchSpy.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body) as Record<string, unknown>;
      expect(body["phone"]).toBe("5511999990000");
      expect(body["message"]).toBe("Olá! Sua cobrança vence amanhã.");
    });

    it('provider name is "zapi"', () => {
      const provider = new ZApiProvider();
      expect(provider.name).toBe("zapi");
    });
  });

  describe("ZP-2: HTTP error responses", () => {
    it("throws WhatsAppProviderError on HTTP 401", async () => {
      mockFetchError(401, { error: "Unauthorized" });

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        WhatsAppProviderError,
      );
    });

    it("throws WhatsAppProviderError on HTTP 422 with error details", async () => {
      mockFetchError(422, { error: "Invalid phone number" });

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        /Z-API responded 422/,
      );
    });

    it("throws WhatsAppProviderError on HTTP 500", async () => {
      mockFetchError(500, { error: "Internal Server Error" });

      const provider = new ZApiProvider();
      let caught: unknown;
      try {
        await provider.sendMessage(INPUT);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(WhatsAppProviderError);
      expect((caught as WhatsAppProviderError).providerName).toBe("zapi");
    });

    it("includes status code in error message for non-ok response", async () => {
      mockFetchError(403, { message: "Forbidden" });

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Z-API responded 403",
      );
    });
  });

  describe("ZP-3: network errors", () => {
    it("throws WhatsAppProviderError when fetch rejects (network failure)", async () => {
      mockFetchNetworkFailure("ECONNREFUSED");

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        WhatsAppProviderError,
      );
    });

    it("wraps network error message in WhatsAppProviderError", async () => {
      mockFetchNetworkFailure("DNS resolution failed");

      const provider = new ZApiProvider();
      let caught: unknown;
      try {
        await provider.sendMessage(INPUT);
      } catch (err) {
        caught = err;
      }

      expect((caught as WhatsAppProviderError).message).toContain(
        "DNS resolution failed",
      );
      expect((caught as WhatsAppProviderError).providerName).toBe("zapi");
    });

    it('wraps non-Error network failures with "Unknown network failure"', async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue("string-error"));

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Unknown network failure",
      );
    });
  });

  describe("ZP-4: missing env vars", () => {
    it("throws when ZAPI_INSTANCE_ID is missing", async () => {
      delete process.env["ZAPI_INSTANCE_ID"];

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Missing Z-API config",
      );
    });

    it("throws when ZAPI_TOKEN is missing", async () => {
      delete process.env["ZAPI_TOKEN"];

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Missing Z-API config",
      );
    });

    it("throws when ZAPI_CLIENT_TOKEN is missing", async () => {
      delete process.env["ZAPI_CLIENT_TOKEN"];

      const provider = new ZApiProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Missing Z-API config",
      );
    });
  });
});
