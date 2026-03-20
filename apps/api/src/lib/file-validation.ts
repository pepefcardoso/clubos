import { resolve, sep } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { ValidationError } from "./errors.js";

/**
 * MIME types accepted for club logo uploads.
 * Must stay in sync with ALLOWED_MIME_TYPES in clubs.service.ts.
 * The set is intentionally duplicated here to keep file-validation.ts
 * free of service-layer imports (no circular dependency risk).
 */
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Thrown when a buffer's magic bytes do not match any allowed image format.
 * Extends ValidationError so it is treated as an operational (4xx) error
 * and is NOT forwarded to Sentry.
 */
export class InvalidMagicBytesError extends ValidationError {
  constructor(detectedMime?: string) {
    super(
      detectedMime != null
        ? `Formato de arquivo inválido (detectado: ${detectedMime}). Envie uma imagem JPG, PNG, WebP ou GIF.`
        : `Arquivo não reconhecido como imagem. Envie uma imagem JPG, PNG, WebP ou GIF.`,
    );
  }
}

/**
 * Inspects the magic bytes of `buffer` and asserts the file is one of
 * the permitted image formats.
 *
 * Why magic bytes and not Content-Type?
 *   The `Content-Type` header is client-supplied and trivially spoofable.
 *   Magic bytes are part of the file's binary structure and cannot be
 *   faked without also making the file parseable as that format —
 *   which is exactly what we want to verify.
 *   See docs/security-guidelines.md §7 (L-05).
 *
 * @throws {InvalidMagicBytesError} when the buffer does not match any
 *   allowed image format.
 */
export async function validateImageMagicBytes(buffer: Buffer): Promise<void> {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected == null || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
    throw new InvalidMagicBytesError(detected?.mime);
  }
}

/**
 * Asserts that composing `uploadDir` + `filename` does not escape the
 * upload directory via path traversal sequences (e.g. `../`).
 *
 * Throws a generic Error (not an AppError) because a path-traversal
 * attempt is a sign of programmer error or active attack — it should
 * surface as a 500 and be captured by Sentry, not silently handled.
 *
 * @throws {Error} if the resolved path escapes `uploadDir`.
 */
export function assertSafePath(uploadDir: string, filename: string): void {
  const normalizedRoot = resolve(uploadDir);
  const resolvedTarget = resolve(uploadDir, filename);

  if (
    resolvedTarget !== normalizedRoot &&
    !resolvedTarget.startsWith(normalizedRoot + sep)
  ) {
    throw new Error(
      `[file-validation] Path traversal attempt blocked. ` +
        `filename="${filename}" resolved to "${resolvedTarget}" ` +
        `which is outside uploadDir="${normalizedRoot}".`,
    );
  }
}
