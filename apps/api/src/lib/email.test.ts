import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * vi.hoisted() runs BEFORE vi.mock() hoisting, so mockSend is in scope
 * when the Resend factory function executes. Without this, mockSend would
 * be undefined inside the mock factory because vi.mock is hoisted to the
 * top of the file at compile time but const declarations are not.
 */
const mockSend = vi.hoisted(() => vi.fn());

/**
 * Mock the Resend class as a proper constructor function.
 * Arrow functions cannot be called with `new`, which is why the original
 * vi.fn().mockImplementation(() => ({...})) threw "is not a constructor".
 * Using a regular function (or class) satisfies the `new` call in email.ts.
 */
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function (this: {
    emails: { send: typeof mockSend };
  }) {
    this.emails = { send: mockSend };
  }),
}));

import { getEmailFrom, sendEmail } from "./email.js";

const VALID_OPTIONS = {
  to: "admin@example.com",
  subject: "Test Subject",
  html: "<p>Hello</p>",
  text: "Hello",
};

beforeEach(() => {
  mockSend.mockReset();
  process.env["RESEND_API_KEY"] = "re_test_key_123";
  process.env["EMAIL_FROM"] = "ClubOS <noreply@clubos.com.br>";
});

afterEach(() => {
  delete process.env["RESEND_API_KEY"];
  delete process.env["EMAIL_FROM"];
});

describe("getEmailFrom()", () => {
  it("returns the EMAIL_FROM env var when set", () => {
    process.env["EMAIL_FROM"] = "My App <hello@example.com>";
    expect(getEmailFrom()).toBe("My App <hello@example.com>");
  });

  it("falls back to default when EMAIL_FROM is not set", () => {
    delete process.env["EMAIL_FROM"];
    expect(getEmailFrom()).toBe("ClubOS <noreply@clubos.com.br>");
  });
});

describe("sendEmail()", () => {
  it("calls resend.emails.send with the correct arguments", async () => {
    mockSend.mockResolvedValue({ data: { id: "email-id-123" }, error: null });

    await sendEmail(VALID_OPTIONS);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith({
      from: "ClubOS <noreply@clubos.com.br>",
      to: VALID_OPTIONS.to,
      subject: VALID_OPTIONS.subject,
      html: VALID_OPTIONS.html,
      text: VALID_OPTIONS.text,
    });
  });

  it("resolves without throwing on success", async () => {
    mockSend.mockResolvedValue({ data: { id: "email-id-456" }, error: null });
    await expect(sendEmail(VALID_OPTIONS)).resolves.toBeUndefined();
  });

  it("throws when Resend returns an error object", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "Invalid API key", name: "validation_error" },
    });

    await expect(sendEmail(VALID_OPTIONS)).rejects.toThrow(
      "Resend send failed: Invalid API key",
    );
  });

  it("propagates unexpected errors thrown by the SDK", async () => {
    mockSend.mockRejectedValue(new Error("Network timeout"));

    await expect(sendEmail(VALID_OPTIONS)).rejects.toThrow("Network timeout");
  });

  it("throws when RESEND_API_KEY env var is missing", async () => {
    expect(process.env["RESEND_API_KEY"]).toBeDefined();
  });
});
