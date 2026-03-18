/**
 * Unit tests for apps/api/src/plugins/sentry.plugin.ts
 *
 * Tests focus on the exported `buildBeforeSend` function, which contains
 * all the sensitive-data scrubbing and error-suppression logic.
 * Sentry.init() is never called in these tests.
 */

import { describe, it, expect } from "vitest";
import type {
  ErrorEvent as SentryEvent,
  EventHint as SentryEventHint,
} from "@sentry/node";
import { buildBeforeSend } from "./sentry.plugin.js";
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
} from "../lib/errors.js";

const COOKIE_NAME = "refresh_token";
const beforeSend = buildBeforeSend(COOKIE_NAME);

function makeEvent(overrides: Partial<SentryEvent> = {}): SentryEvent {
  return {
    request: {
      url: "https://api.clubos.com.br/api/members",
      method: "POST",
      cookies: { refresh_token: "tok-abc", session: "sess-xyz" },
      data: { name: "Fulano", cpf: "123.456.789-00", password: "secret123" },
    },
    ...overrides,
  } as SentryEvent;
}

function makeHint(err: unknown = new Error("unexpected")): SentryEventHint {
  return { originalException: err };
}

describe("buildBeforeSend — operational error suppression", () => {
  const operationalErrors: [string, AppError][] = [
    ["UnauthorizedError", new UnauthorizedError()],
    ["ForbiddenError", new ForbiddenError()],
    ["NotFoundError", new NotFoundError()],
    ["ConflictError", new ConflictError()],
    ["ValidationError", new ValidationError()],
    ["TooManyRequestsError", new TooManyRequestsError()],
  ];

  for (const [name, err] of operationalErrors) {
    it(`returns null for ${name} (isOperational = true)`, () => {
      const result = beforeSend(makeEvent(), makeHint(err));
      expect(result).toBeNull();
    });
  }

  it("returns null for a custom operational AppError subclass", () => {
    class DuplicateCpfError extends ConflictError {
      constructor() {
        super("Sócio com este CPF já está cadastrado");
      }
    }
    const result = beforeSend(makeEvent(), makeHint(new DuplicateCpfError()));
    expect(result).toBeNull();
  });

  it("returns the event for a non-operational AppError (isOperational = false)", () => {
    const infraError = new AppError("DB connection lost", 500, false);
    const result = beforeSend(makeEvent(), makeHint(infraError));
    expect(result).not.toBeNull();
  });

  it("returns the event for a plain Error (not AppError)", () => {
    const result = beforeSend(makeEvent(), makeHint(new Error("unexpected")));
    expect(result).not.toBeNull();
  });

  it("returns the event when originalException is null", () => {
    const result = beforeSend(makeEvent(), makeHint(null));
    expect(result).not.toBeNull();
  });

  it("returns the event when originalException is undefined", () => {
    const result = beforeSend(makeEvent(), makeHint(undefined));
    expect(result).not.toBeNull();
  });
});

describe("buildBeforeSend — refresh_token cookie scrubbing", () => {
  it("removes the refresh_token cookie from the event", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint());
    expect(result).not.toBeNull();
    expect(
      (result!.request!.cookies as Record<string, string>)["refresh_token"],
    ).toBeUndefined();
  });

  it("preserves other cookies", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint());
    expect(
      (result!.request!.cookies as Record<string, string>)["session"],
    ).toBe("sess-xyz");
  });

  it("does not mutate the original event's cookies object", () => {
    const event = makeEvent();
    const originalCookies = event.request!.cookies as Record<string, string>;
    beforeSend(event, makeHint());
    expect(originalCookies["refresh_token"]).toBe("tok-abc");
  });

  it("handles events with no cookies gracefully", () => {
    const event = makeEvent({ request: { url: "/" } });
    expect(() => beforeSend(event, makeHint())).not.toThrow();
  });

  it("handles events with no request object gracefully", () => {
    const event = {} as SentryEvent;
    expect(() => beforeSend(event, makeHint())).not.toThrow();
    expect(beforeSend(event, makeHint())).not.toBeNull();
  });

  it("uses the cookieName provided to buildBeforeSend, not a magic string", () => {
    const customBeforeSend = buildBeforeSend("my_custom_cookie");
    const event = makeEvent({
      request: {
        cookies: {
          my_custom_cookie: "sensitive",
          other: "keep-me",
        },
      },
    });
    const result = customBeforeSend(event, makeHint());
    expect(
      (result!.request!.cookies as Record<string, string>)["my_custom_cookie"],
    ).toBeUndefined();
    expect((result!.request!.cookies as Record<string, string>)["other"]).toBe(
      "keep-me",
    );
  });
});

describe("buildBeforeSend — request body scrubbing", () => {
  it("removes password from request body", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint());
    expect(
      (result!.request!.data as Record<string, unknown>)["password"],
    ).toBeUndefined();
  });

  it("removes cpf from request body", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint());
    expect(
      (result!.request!.data as Record<string, unknown>)["cpf"],
    ).toBeUndefined();
  });

  it("preserves other body fields", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint());
    expect((result!.request!.data as Record<string, unknown>)["name"]).toBe(
      "Fulano",
    );
  });

  it("does not mutate the original event's data object", () => {
    const event = makeEvent();
    const originalData = event.request!.data as Record<string, unknown>;
    beforeSend(event, makeHint());
    expect(originalData["password"]).toBe("secret123");
    expect(originalData["cpf"]).toBe("123.456.789-00");
  });

  it("handles events with no data gracefully", () => {
    const event = makeEvent({ request: { url: "/" } });
    expect(() => beforeSend(event, makeHint())).not.toThrow();
  });

  it("handles non-object data gracefully (e.g. a raw string body)", () => {
    const event = makeEvent({ request: { url: "/", data: "raw-body-string" } });
    expect(() => beforeSend(event, makeHint())).not.toThrow();
  });
});

describe("buildBeforeSend — combined scrubbing", () => {
  it("scrubs both cookies and body in a single pass", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint());
    expect(result).not.toBeNull();
    const cookies = result!.request!.cookies as Record<string, string>;
    const data = result!.request!.data as Record<string, unknown>;
    expect(cookies["refresh_token"]).toBeUndefined();
    expect(data["password"]).toBeUndefined();
    expect(data["cpf"]).toBeUndefined();
    expect(cookies["session"]).toBe("sess-xyz");
    expect(data["name"]).toBe("Fulano");
  });

  it("returns null before scrubbing when error is operational", () => {
    const event = makeEvent();
    const result = beforeSend(event, makeHint(new NotFoundError()));
    expect(result).toBeNull();
    const cookies = event.request!.cookies as Record<string, string>;
    expect(cookies["refresh_token"]).toBe("tok-abc");
  });
});
