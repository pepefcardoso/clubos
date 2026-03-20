import { describe, it, expect, afterEach } from "vitest";
import { extractHost, verifyCsrfOrigin, getAllowedHosts } from "./csrf";

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

const XRW = { "x-requested-with": "XMLHttpRequest" };

describe("extractHost()", () => {
  it("extracts hostname from a full https origin", () => {
    expect(extractHost("https://clubos.com.br")).toBe("clubos.com.br");
  });

  it("extracts hostname from a url with path (referer format)", () => {
    expect(extractHost("https://clubos.com.br/contato")).toBe("clubos.com.br");
  });

  it('returns null for the string "null" (privacy-sensitive origin)', () => {
    expect(extractHost("null")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractHost("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractHost(null)).toBeNull();
  });

  it("returns null for a non-http scheme", () => {
    expect(extractHost("file:///etc/passwd")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractHost("not-a-url")).toBeNull();
  });

  it("extracts hostname from http (dev)", () => {
    expect(extractHost("http://localhost:3000")).toBe("localhost");
  });
});

describe("verifyCsrfOrigin() — X-Requested-With guard", () => {
  const allowed = ["clubos.com.br"];

  it("fails when X-Requested-With is absent", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({ origin: "https://clubos.com.br" }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/X-Requested-With/);
  });

  it("fails when X-Requested-With has wrong value", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({
        ...XRW,
        "x-requested-with": "fetch",
        origin: "https://clubos.com.br",
      }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(false);
  });
});

describe("verifyCsrfOrigin() — Origin header", () => {
  const allowed = ["clubos.com.br", "www.clubos.com.br"];

  it("passes when Origin host is in the allowed list", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({ ...XRW, origin: "https://clubos.com.br" }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(true);
  });

  it("passes for www subdomain when explicitly in allowed list", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({ ...XRW, origin: "https://www.clubos.com.br" }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(true);
  });

  it("fails when Origin host is NOT in the allowed list", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({ ...XRW, origin: "https://evil.com" }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/evil\.com/);
  });

  it("fails for a subdomain not explicitly allowed", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({ ...XRW, origin: "https://admin.clubos.com.br" }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(false);
  });
});

describe("verifyCsrfOrigin() — Referer fallback", () => {
  const allowed = ["clubos.com.br"];

  it("passes via Referer when Origin is absent", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({
        ...XRW,
        referer: "https://clubos.com.br/contato",
      }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(true);
  });

  it("fails via Referer when host not allowed", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({ ...XRW, referer: "https://evil.com/trap" }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/evil\.com/);
  });

  it("prefers Origin over Referer when both are present", () => {
    const result = verifyCsrfOrigin({
      headers: makeHeaders({
        ...XRW,
        origin: "https://evil.com",
        referer: "https://clubos.com.br/contato",
      }),
      allowedHosts: allowed,
    });
    expect(result.ok).toBe(false);
  });
});

describe("verifyCsrfOrigin() — missing headers in production", () => {
  const allowed = ["clubos.com.br"];

  it("fails in production when both Origin and Referer are absent", () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      const result = verifyCsrfOrigin({
        headers: makeHeaders(XRW),
        allowedHosts: allowed,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/absent in production/);
    } finally {
      process.env["NODE_ENV"] = originalEnv;
    }
  });

  it("passes in development when both headers are absent (curl/Postman)", () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    try {
      const result = verifyCsrfOrigin({
        headers: makeHeaders(XRW),
        allowedHosts: allowed,
      });
      expect(result.ok).toBe(true);
    } finally {
      process.env["NODE_ENV"] = originalEnv;
    }
  });
});

describe("getAllowedHosts()", () => {
  afterEach(() => {
    delete process.env["NEXT_PUBLIC_DOMAIN"];
  });

  it("includes the configured domain", () => {
    process.env["NEXT_PUBLIC_DOMAIN"] = "clubos.com.br";
    const hosts = getAllowedHosts();
    expect(hosts).toContain("clubos.com.br");
  });

  it("auto-adds www. prefix when domain does not start with www", () => {
    process.env["NEXT_PUBLIC_DOMAIN"] = "clubos.com.br";
    const hosts = getAllowedHosts();
    expect(hosts).toContain("www.clubos.com.br");
  });

  it("includes localhost in non-production", () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    try {
      const hosts = getAllowedHosts();
      expect(hosts).toContain("localhost");
    } finally {
      process.env["NODE_ENV"] = originalEnv;
    }
  });
});
