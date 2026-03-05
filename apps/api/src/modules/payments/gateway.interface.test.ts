import { describe, it, expect } from "vitest";
import { WebhookSignatureError } from "./gateway.interface.js";

describe("WebhookSignatureError", () => {
  it("is an instance of Error", () => {
    const err = new WebhookSignatureError("asaas");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of WebhookSignatureError", () => {
    const err = new WebhookSignatureError("asaas");
    expect(err).toBeInstanceOf(WebhookSignatureError);
  });

  it("sets name to 'WebhookSignatureError'", () => {
    const err = new WebhookSignatureError("asaas");
    expect(err.name).toBe("WebhookSignatureError");
  });

  it("includes the gateway name in the message", () => {
    const err = new WebhookSignatureError("pagarme");
    expect(err.message).toContain("pagarme");
  });

  it("message differs by gateway name", () => {
    const a = new WebhookSignatureError("asaas");
    const b = new WebhookSignatureError("stripe");
    expect(a.message).not.toBe(b.message);
    expect(b.message).toContain("stripe");
  });

  it("can be caught as a generic Error", () => {
    expect(() => {
      throw new WebhookSignatureError("asaas");
    }).toThrow(Error);
  });

  it("can be caught specifically as WebhookSignatureError", () => {
    expect(() => {
      throw new WebhookSignatureError("asaas");
    }).toThrow(WebhookSignatureError);
  });

  it("has a stack trace", () => {
    const err = new WebhookSignatureError("asaas");
    expect(err.stack).toBeDefined();
  });
});
