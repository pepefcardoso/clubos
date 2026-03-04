/**
 * Unit tests for src/lib/storage.ts
 *
 * fs/promises is mocked so no real file-system operations occur.
 * All expected paths are built with node:path's join() so the tests
 * pass on both POSIX (forward slashes) and Windows (backslashes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";

const mockMkdir = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWriteFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

import { getUploadDir, getStorageBaseUrl, saveFile } from "./storage.js";

describe("getUploadDir()", () => {
  afterEach(() => {
    delete process.env["UPLOAD_DIR"];
  });

  it("returns UPLOAD_DIR env var when set", () => {
    process.env["UPLOAD_DIR"] = join("custom", "uploads");
    expect(getUploadDir()).toBe(join("custom", "uploads"));
  });

  it("falls back to <cwd>/uploads when UPLOAD_DIR is not set", () => {
    delete process.env["UPLOAD_DIR"];
    expect(getUploadDir()).toBe(join(process.cwd(), "uploads"));
  });
});

describe("getStorageBaseUrl()", () => {
  afterEach(() => {
    delete process.env["STORAGE_BASE_URL"];
    delete process.env["PORT"];
  });

  it("returns STORAGE_BASE_URL env var when set", () => {
    process.env["STORAGE_BASE_URL"] = "https://cdn.example.com";
    expect(getStorageBaseUrl()).toBe("https://cdn.example.com");
  });

  it("falls back to http://localhost:3001 when neither var is set", () => {
    delete process.env["STORAGE_BASE_URL"];
    delete process.env["PORT"];
    expect(getStorageBaseUrl()).toBe("http://localhost:3001");
  });

  it("falls back using PORT env var when STORAGE_BASE_URL is absent", () => {
    delete process.env["STORAGE_BASE_URL"];
    process.env["PORT"] = "4000";
    expect(getStorageBaseUrl()).toBe("http://localhost:4000");
  });
});

describe("saveFile()", () => {
  const filename = "logo-abc123.webp";
  const buffer = Buffer.from("fake image bytes");

  beforeEach(() => {
    mockMkdir.mockReset();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
    delete process.env["UPLOAD_DIR"];
    delete process.env["STORAGE_BASE_URL"];
    delete process.env["PORT"];
  });

  it("calls mkdir with the upload dir and { recursive: true }", async () => {
    await saveFile(filename, buffer);

    expect(mockMkdir).toHaveBeenCalledOnce();
    const [dir, opts] = mockMkdir.mock.calls[0]!;
    expect(dir).toBe(getUploadDir());
    expect(opts).toEqual({ recursive: true });
  });

  it("calls writeFile with the OS-native full path and the buffer", async () => {
    const uploadDir = join("var", "uploads");
    process.env["UPLOAD_DIR"] = uploadDir;

    await saveFile(filename, buffer);

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [filePath, buf] = mockWriteFile.mock.calls[0]!;
    expect(filePath).toBe(join(uploadDir, filename));
    expect(buf).toBe(buffer);
  });

  it("returns the public URL using STORAGE_BASE_URL", async () => {
    process.env["STORAGE_BASE_URL"] = "https://cdn.clubos.com.br";

    const url = await saveFile(filename, buffer);

    expect(url).toBe(`https://cdn.clubos.com.br/uploads/${filename}`);
  });

  it("returns the public URL using the default base when no env vars are set", async () => {
    const url = await saveFile(filename, buffer);

    expect(url).toBe(`http://localhost:3001/uploads/${filename}`);
  });

  it("returns the public URL using PORT when STORAGE_BASE_URL is absent", async () => {
    process.env["PORT"] = "5000";

    const url = await saveFile(filename, buffer);

    expect(url).toBe(`http://localhost:5000/uploads/${filename}`);
  });

  it("mkdir is always called before writeFile", async () => {
    const order: string[] = [];
    mockMkdir.mockImplementation(async () => {
      order.push("mkdir");
    });
    mockWriteFile.mockImplementation(async () => {
      order.push("writeFile");
    });

    await saveFile(filename, buffer);

    expect(order).toEqual(["mkdir", "writeFile"]);
  });

  it("propagates errors thrown by mkdir", async () => {
    mockMkdir.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(saveFile(filename, buffer)).rejects.toThrow("EACCES");
  });

  it("propagates errors thrown by writeFile", async () => {
    mockWriteFile.mockRejectedValue(new Error("ENOSPC: no space left"));

    await expect(saveFile(filename, buffer)).rejects.toThrow("ENOSPC");
  });

  it("uses a custom UPLOAD_DIR in the writeFile path", async () => {
    const customDir = join("srv", "media");
    process.env["UPLOAD_DIR"] = customDir;

    await saveFile("photo.png", buffer);

    const [filePath] = mockWriteFile.mock.calls[0]!;
    expect(filePath).toBe(join(customDir, "photo.png"));
  });
});
