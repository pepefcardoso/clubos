import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Returns the absolute path to the upload directory.
 * Defaults to <cwd>/uploads when UPLOAD_DIR is not set.
 */
export function getUploadDir(): string {
  return process.env["UPLOAD_DIR"] ?? join(process.cwd(), "uploads");
}

/**
 * Returns the public base URL used to build asset URLs.
 * In development this is typically http://localhost:3001.
 * In production set STORAGE_BASE_URL to the CDN / reverse-proxy origin.
 */
export function getStorageBaseUrl(): string {
  return (
    process.env["STORAGE_BASE_URL"] ??
    `http://localhost:${process.env["PORT"] ?? 3001}`
  );
}

/**
 * Ensures the upload directory exists, then writes the buffer to disk.
 *
 * @param filename  - Final filename including extension (e.g. "logo-abc123.webp")
 * @param buffer    - File contents to persist
 * @returns         The public URL to the saved file
 */
export async function saveFile(
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return `${getStorageBaseUrl()}/uploads/${filename}`;
}
