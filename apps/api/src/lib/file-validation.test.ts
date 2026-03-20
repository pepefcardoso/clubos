/**
 * Unit tests for src/lib/file-validation.ts
 *
 * file-type is mocked via vi.hoisted() so the module under test never
 * performs real binary inspection — correctness of the allowlist logic
 * and error shapes are what we verify here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

const mockFileTypeFromBuffer = vi.hoisted(() => vi.fn());
vi.mock("file-type", () => ({
  fileTypeFromBuffer: mockFileTypeFromBuffer,
}));

import {
  validateImageMagicBytes,
  assertSafePath,
  InvalidMagicBytesError,
  ALLOWED_IMAGE_MIME_TYPES,
} from "./file-validation.js";

describe("ALLOWED_IMAGE_MIME_TYPES", () => {
  it("contains exactly the four permitted image types", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES.size).toBe(4);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("image/webp")).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("image/gif")).toBe(true);
  });

  it("does not contain dangerous types", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES.has("image/svg+xml")).toBe(false);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("application/pdf")).toBe(false);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("text/html")).toBe(false);
  });

  it("does not contain video or audio types", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES.has("video/mp4")).toBe(false);
    expect(ALLOWED_IMAGE_MIME_TYPES.has("audio/mpeg")).toBe(false);
  });

  it("does not contain octet-stream", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES.has("application/octet-stream")).toBe(
      false,
    );
  });
});

describe("InvalidMagicBytesError", () => {
  it("is an instance of Error", () => {
    expect(new InvalidMagicBytesError()).toBeInstanceOf(Error);
  });

  it("includes the detected MIME in the message when provided", () => {
    const err = new InvalidMagicBytesError("application/pdf");
    expect(err.message).toContain("application/pdf");
  });

  it("uses a fallback message when no MIME is provided", () => {
    const err = new InvalidMagicBytesError();
    expect(err.message).toMatch(/não reconhecido/i);
  });

  it("always mentions the allowed formats", () => {
    const err = new InvalidMagicBytesError("text/plain");
    expect(err.message).toMatch(/JPG|PNG|WebP|GIF/);
  });

  it("fallback message (no arg) also mentions allowed formats", () => {
    const err = new InvalidMagicBytesError();
    expect(err.message).toMatch(/JPG|PNG|WebP|GIF/);
  });

  it("has name equal to the class name", () => {
    const err = new InvalidMagicBytesError("image/bmp");
    expect(err.name).toBe("InvalidMagicBytesError");
  });
});

describe("validateImageMagicBytes()", () => {
  const fakeBuffer = Buffer.from("fake");

  beforeEach(() => {
    mockFileTypeFromBuffer.mockReset();
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ])("resolves for %s (allowed)", async (mime, ext) => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime, ext });
    await expect(validateImageMagicBytes(fakeBuffer)).resolves.toBeUndefined();
  });

  it.each([
    ["application/pdf", "pdf"],
    ["text/html", "html"],
    ["image/svg+xml", "svg"],
    ["application/octet-stream", "bin"],
    ["video/mp4", "mp4"],
    ["text/plain", "txt"],
    ["application/zip", "zip"],
  ])("throws InvalidMagicBytesError for %s (rejected)", async (mime, ext) => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime, ext });
    await expect(validateImageMagicBytes(fakeBuffer)).rejects.toBeInstanceOf(
      InvalidMagicBytesError,
    );
  });

  it("throws InvalidMagicBytesError when file-type returns undefined (unrecognized format)", async () => {
    mockFileTypeFromBuffer.mockResolvedValue(undefined);
    await expect(validateImageMagicBytes(fakeBuffer)).rejects.toBeInstanceOf(
      InvalidMagicBytesError,
    );
  });

  it("error message contains the detected MIME type when format is rejected", async () => {
    mockFileTypeFromBuffer.mockResolvedValue({
      mime: "application/pdf",
      ext: "pdf",
    });
    const err = await validateImageMagicBytes(fakeBuffer).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(InvalidMagicBytesError);
    expect((err as InvalidMagicBytesError).message).toContain(
      "application/pdf",
    );
  });

  it("error message uses fallback text when file-type returns undefined", async () => {
    mockFileTypeFromBuffer.mockResolvedValue(undefined);
    const err = await validateImageMagicBytes(fakeBuffer).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(InvalidMagicBytesError);
    expect((err as InvalidMagicBytesError).message).toMatch(/não reconhecido/i);
  });

  it("calls fileTypeFromBuffer exactly once per invocation", async () => {
    mockFileTypeFromBuffer.mockResolvedValue({
      mime: "image/jpeg",
      ext: "jpg",
    });
    await validateImageMagicBytes(fakeBuffer);
    expect(mockFileTypeFromBuffer).toHaveBeenCalledOnce();
  });

  it("passes the buffer unchanged to fileTypeFromBuffer", async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime: "image/png", ext: "png" });
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await validateImageMagicBytes(buf);
    expect(mockFileTypeFromBuffer).toHaveBeenCalledWith(buf);
  });

  it("propagates unexpected errors thrown by fileTypeFromBuffer", async () => {
    mockFileTypeFromBuffer.mockRejectedValue(new Error("internal lib error"));
    await expect(validateImageMagicBytes(fakeBuffer)).rejects.toThrow(
      "internal lib error",
    );
  });
});

describe("assertSafePath()", () => {
  const uploadDir = join("/var", "data", "uploads");

  it("does not throw for a safe filename (no path components)", () => {
    expect(() => assertSafePath(uploadDir, "logo-abc.webp")).not.toThrow();
  });

  it("does not throw for a deterministic logo filename pattern", () => {
    expect(() =>
      assertSafePath(uploadDir, "logo-clxyz1234567890abcdef.webp"),
    ).not.toThrow();
  });

  it("does not throw for a filename that merely contains dots (not traversal)", () => {
    expect(() => assertSafePath(uploadDir, "my.logo.webp")).not.toThrow();
  });

  it("does not throw for filenames with hyphens and underscores", () => {
    expect(() => assertSafePath(uploadDir, "club_logo-v2.png")).not.toThrow();
  });

  it("throws for a path traversal using ../", () => {
    expect(() => assertSafePath(uploadDir, "../etc/passwd")).toThrow(
      /traversal/i,
    );
  });

  it("throws for a path traversal using ../../", () => {
    expect(() => assertSafePath(uploadDir, "../../etc/shadow")).toThrow();
  });

  it("throws for an absolute path that escapes the upload dir", () => {
    expect(() => assertSafePath(uploadDir, "/etc/passwd")).toThrow();
  });

  it("throws for a filename with encoded traversal (subdir/../../outside)", () => {
    expect(() =>
      assertSafePath(uploadDir, "subdir/../../outside.txt"),
    ).toThrow();
  });

  it("error message identifies it as a path traversal attempt", () => {
    expect(() => assertSafePath(uploadDir, "../secret.key")).toThrow(
      /traversal/i,
    );
  });

  it("error message includes the blocked filename", () => {
    try {
      assertSafePath(uploadDir, "../malicious");
    } catch (err) {
      expect((err as Error).message).toContain("malicious");
    }
  });

  it("throws a plain Error (not an AppError) for traversal attempts", async () => {
    const { AppError } = await import("./errors.js");
    try {
      assertSafePath(uploadDir, "../etc/passwd");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(AppError);
    }
  });
});
