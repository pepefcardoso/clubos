import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a single class unchanged", () => {
    expect(cn("flex")).toBe("flex");
  });

  it("merges multiple classes into a single string", () => {
    expect(cn("flex", "items-center", "gap-4")).toBe("flex items-center gap-4");
  });

  it("ignores falsy values (false, null, undefined)", () => {
    expect(cn("flex", false, null, undefined, "gap-2")).toBe("flex gap-2");
  });

  it("handles conditional classes via object syntax", () => {
    expect(cn("p-4", { "bg-red-500": true, "bg-blue-500": false })).toBe(
      "p-4 bg-red-500",
    );
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("deduplicates conflicting background colors", () => {
    expect(cn("bg-red-500", "bg-green-500")).toBe("bg-green-500");
  });

  it("handles array inputs", () => {
    expect(cn(["flex", "gap-2"], "p-4")).toBe("flex gap-2 p-4");
  });

  it("returns empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns empty string for all falsy arguments", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("handles mixed conditionals and strings", () => {
    const isActive = true;
    const isDisabled = false;
    expect(
      cn("btn", { "btn-active": isActive, "btn-disabled": isDisabled }),
    ).toBe("btn btn-active");
  });
});
