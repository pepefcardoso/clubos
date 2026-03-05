import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EvolutionProvider } from "./evolution.provider.js";
import { WhatsAppProviderError } from "../whatsapp.interface.js";

const VALID_ENV = {
  EVOLUTION_API_URL: "https://evolution.example.com",
  EVOLUTION_API_KEY: "test-api-key",
  EVOLUTION_INSTANCE_NAME: "clubos-test",
};

function setEnv(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }
}

function clearEnv(): void {
  delete process.env["EVOLUTION_API_URL"];
  delete process.env["EVOLUTION_API_KEY"];
  delete process.env["EVOLUTION_INSTANCE_NAME"];
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

describe("EvolutionProvider", () => {
  beforeEach(() => {
    setEnv(VALID_ENV);
  });

  afterEach(() => {
    clearEnv();
    vi.unstubAllGlobals();
  });

  describe("EP-1: successful send", () => {
    it("returns providerMessageId from key.id when present", async () => {
      mockFetchOk({
        key: { id: "evo-001", remoteJid: "5511999990000@s.whatsapp.net" },
      });

      const provider = new EvolutionProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("evo-001");
      expect(result.rawResponse).toMatchObject({ key: { id: "evo-001" } });
    });

    it("falls back to idempotencyKey when key.id is absent", async () => {
      mockFetchOk({ messageTimestamp: 1234567890 });

      const provider = new EvolutionProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("msg-abc-123");
    });

    it("falls back to idempotencyKey when key object is present but id is missing", async () => {
      mockFetchOk({ key: { remoteJid: "5511999990000@s.whatsapp.net" } });

      const provider = new EvolutionProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("msg-abc-123");
    });

    it("falls back to idempotencyKey when response body is empty object", async () => {
      mockFetchOk({});

      const provider = new EvolutionProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.providerMessageId).toBe("msg-abc-123");
    });

    it("calls the correct Evolution API URL with correct headers", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ key: { id: "evo-x" } }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const provider = new EvolutionProvider();
      await provider.sendMessage(INPUT);

      const [url, options] = fetchSpy.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string>; body: string },
      ];

      expect(url).toBe(
        "https://evolution.example.com/message/sendText/clubos-test",
      );
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["apikey"]).toBe("test-api-key");
    });

    it("sends phone and message body in the correct payload structure", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ key: { id: "evo-x" } }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const provider = new EvolutionProvider();
      await provider.sendMessage(INPUT);

      const [, options] = fetchSpy.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body) as Record<string, unknown>;
      expect(body["number"]).toBe("5511999990000");
      expect((body["textMessage"] as Record<string, unknown>)["text"]).toBe(
        "Olá! Sua cobrança vence amanhã.",
      );
    });

    it('provider name is "evolution"', () => {
      const provider = new EvolutionProvider();
      expect(provider.name).toBe("evolution");
    });

    it("uses EVOLUTION_INSTANCE_NAME env var in the URL", async () => {
      process.env["EVOLUTION_INSTANCE_NAME"] = "my-custom-instance";

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ key: { id: "evo-x" } }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const provider = new EvolutionProvider();
      await provider.sendMessage(INPUT);

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain("/message/sendText/my-custom-instance");
    });

    it('defaults instance name to "clubos" when EVOLUTION_INSTANCE_NAME is not set', async () => {
      delete process.env["EVOLUTION_INSTANCE_NAME"];

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ key: { id: "evo-x" } }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const provider = new EvolutionProvider();
      await provider.sendMessage(INPUT);

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain("/message/sendText/clubos");
    });

    it("returns full raw response in result", async () => {
      const raw = {
        key: { id: "evo-raw-001", remoteJid: "5511@s.whatsapp.net" },
        messageTimestamp: 9999,
        extra: "data",
      };
      mockFetchOk(raw);

      const provider = new EvolutionProvider();
      const result = await provider.sendMessage(INPUT);

      expect(result.rawResponse).toEqual(raw);
    });
  });

  describe("EP-2: HTTP error responses", () => {
    it("throws WhatsAppProviderError on HTTP 401", async () => {
      mockFetchError(401, { error: "Unauthorized" });

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        WhatsAppProviderError,
      );
    });

    it("throws WhatsAppProviderError on HTTP 422 with error details", async () => {
      mockFetchError(422, { error: "Invalid phone number" });

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        /Evolution API responded 422/,
      );
    });

    it("throws WhatsAppProviderError on HTTP 500", async () => {
      mockFetchError(500, { error: "Internal Server Error" });

      const provider = new EvolutionProvider();
      let caught: unknown;
      try {
        await provider.sendMessage(INPUT);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(WhatsAppProviderError);
      expect((caught as WhatsAppProviderError).providerName).toBe("evolution");
    });

    it("includes status code in error message for non-ok response", async () => {
      mockFetchError(403, { message: "Forbidden" });

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Evolution API responded 403",
      );
    });

    it("throws WhatsAppProviderError on HTTP 404 (instance not found)", async () => {
      mockFetchError(404, { message: "Instance not found" });

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        WhatsAppProviderError,
      );
    });

    it("sets providerName to 'evolution' on HTTP error", async () => {
      mockFetchError(503, { error: "Service Unavailable" });

      const provider = new EvolutionProvider();
      let caught: unknown;
      try {
        await provider.sendMessage(INPUT);
      } catch (err) {
        caught = err;
      }

      expect((caught as WhatsAppProviderError).providerName).toBe("evolution");
    });
  });

  describe("EP-3: network errors", () => {
    it("throws WhatsAppProviderError when fetch rejects (network failure)", async () => {
      mockFetchNetworkFailure("ECONNREFUSED");

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        WhatsAppProviderError,
      );
    });

    it("wraps network error message in WhatsAppProviderError", async () => {
      mockFetchNetworkFailure("DNS resolution failed");

      const provider = new EvolutionProvider();
      let caught: unknown;
      try {
        await provider.sendMessage(INPUT);
      } catch (err) {
        caught = err;
      }

      expect((caught as WhatsAppProviderError).message).toContain(
        "DNS resolution failed",
      );
      expect((caught as WhatsAppProviderError).providerName).toBe("evolution");
    });

    it('wraps non-Error network failures with "Unknown network failure"', async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue("string-error"));

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Unknown network failure",
      );
    });

    it("preserves the original error in WhatsAppProviderError.originalError", async () => {
      const originalError = new Error("ETIMEDOUT");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(originalError));

      const provider = new EvolutionProvider();
      let caught: unknown;
      try {
        await provider.sendMessage(INPUT);
      } catch (err) {
        caught = err;
      }

      expect((caught as WhatsAppProviderError).originalError).toBe(
        originalError,
      );
    });
  });

  describe("EP-4: missing env vars", () => {
    it("throws when EVOLUTION_API_URL is missing", async () => {
      delete process.env["EVOLUTION_API_URL"];

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Missing Evolution API config",
      );
    });

    it("throws when EVOLUTION_API_KEY is missing", async () => {
      delete process.env["EVOLUTION_API_KEY"];

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        "Missing Evolution API config",
      );
    });

    it("does not throw when EVOLUTION_INSTANCE_NAME is missing (uses default)", async () => {
      delete process.env["EVOLUTION_INSTANCE_NAME"];

      mockFetchOk({ key: { id: "evo-001" } });

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).resolves.not.toThrow();
    });

    it("error mentions required env var names when config is missing", async () => {
      delete process.env["EVOLUTION_API_URL"];
      delete process.env["EVOLUTION_API_KEY"];

      const provider = new EvolutionProvider();
      await expect(provider.sendMessage(INPUT)).rejects.toThrow(
        /EVOLUTION_API_URL/,
      );
    });
  });
});
