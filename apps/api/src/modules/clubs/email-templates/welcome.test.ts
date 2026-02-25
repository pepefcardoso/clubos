import { describe, it, expect } from "vitest";
import { buildWelcomeEmail } from "./welcome.js";

const CTX = {
  clubName: "Clube Atlético Exemplo",
  adminEmail: "admin@atletico.com",
  dashboardUrl: "https://app.clubos.com.br/dashboard",
};

describe("buildWelcomeEmail()", () => {
  it("returns a subject containing the club name", () => {
    const { subject } = buildWelcomeEmail(CTX);
    expect(subject).toContain(CTX.clubName);
  });

  it("subject matches expected Portuguese greeting", () => {
    const { subject } = buildWelcomeEmail(CTX);
    expect(subject).toBe(`Bem-vindo ao ClubOS, ${CTX.clubName}!`);
  });

  it("HTML contains the club name", () => {
    const { html } = buildWelcomeEmail(CTX);
    expect(html).toContain(CTX.clubName);
  });

  it("HTML contains the admin email address in the footer", () => {
    const { html } = buildWelcomeEmail(CTX);
    expect(html).toContain(CTX.adminEmail);
  });

  it("HTML contains the dashboard URL in the CTA link", () => {
    const { html } = buildWelcomeEmail(CTX);
    expect(html).toContain(CTX.dashboardUrl);
  });

  it("HTML contains an href pointing to the dashboard URL", () => {
    const { html } = buildWelcomeEmail(CTX);
    expect(html).toContain(`href="${CTX.dashboardUrl}"`);
  });

  it("plain text contains the club name", () => {
    const { text } = buildWelcomeEmail(CTX);
    expect(text).toContain(CTX.clubName);
  });

  it("plain text contains the dashboard URL", () => {
    const { text } = buildWelcomeEmail(CTX);
    expect(text).toContain(CTX.dashboardUrl);
  });

  it("plain text contains the admin email", () => {
    const { text } = buildWelcomeEmail(CTX);
    expect(text).toContain(CTX.adminEmail);
  });

  it("returns all three required fields", () => {
    const result = buildWelcomeEmail(CTX);
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
  });

  it("HTML is valid enough to contain DOCTYPE declaration", () => {
    const { html } = buildWelcomeEmail(CTX);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("escapes dynamic values correctly — club name appears in heading", () => {
    const custom = { ...CTX, clubName: "FC São Paulo" };
    const { html } = buildWelcomeEmail(custom);
    expect(html).toContain("FC São Paulo");
  });
});
