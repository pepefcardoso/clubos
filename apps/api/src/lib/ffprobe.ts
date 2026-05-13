import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { ValidationError } from "./errors.js";

const execFileAsync = promisify(execFile);

export const MAX_VIDEO_DURATION_SECONDS = 90;

export class VideoDurationExceededError extends ValidationError {
  constructor(actualSeconds: number) {
    super(
      `Vídeo excede o limite de ${MAX_VIDEO_DURATION_SECONDS}s ` +
        `(duração detectada: ${actualSeconds}s).`,
    );
    this.name = "VideoDurationExceededError";
  }
}

export class VideoProbeError extends ValidationError {
  constructor() {
    super(
      "Não foi possível determinar a duração do vídeo. " +
        "Certifique-se de que o arquivo não está corrompido.",
    );
    this.name = "VideoProbeError";
  }
}

/**
 * Writes `buffer` to a temp file, runs ffprobe to extract duration, then
 * cleans up the temp file.
 *
 * Client-supplied duration metadata is NEVER trusted — only the ffprobe
 * reading of the actual binary is authoritative. [SEC-FILE]
 *
 * @returns Duration in whole seconds (Math.ceil).
 * @throws {VideoDurationExceededError} when duration > MAX_VIDEO_DURATION_SECONDS.
 * @throws {VideoProbeError} when ffprobe cannot parse the file.
 */
export async function assertVideoDurationWithinLimit(
  buffer: Buffer,
): Promise<number> {
  const ffprobe = process.env["FFPROBE_PATH"] ?? "ffprobe";
  const tmpPath = join(tmpdir(), `clubos-video-${randomUUID()}.tmp`);

  try {
    await writeFile(tmpPath, buffer);

    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(ffprobe, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        tmpPath,
      ]));
    } catch {
      throw new VideoProbeError();
    }

    const seconds = parseFloat(stdout.trim());
    if (!isFinite(seconds)) throw new VideoProbeError();

    const ceiled = Math.ceil(seconds);
    if (ceiled > MAX_VIDEO_DURATION_SECONDS) {
      throw new VideoDurationExceededError(ceiled);
    }

    return ceiled;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
