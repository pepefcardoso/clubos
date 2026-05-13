import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

let _s3: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!_s3) {
    const endpoint = process.env["CLOUDFLARE_R2_ENDPOINT"];
    const accessKeyId = process.env["CLOUDFLARE_R2_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["CLOUDFLARE_R2_SECRET_ACCESS_KEY"];

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "[r2] Missing Cloudflare R2 env vars (CLOUDFLARE_R2_ENDPOINT, " +
          "CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY). " +
          "See .env.example.",
      );
    }

    _s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _s3;
}

export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const bucket = process.env["CLOUDFLARE_R2_BUCKET"];
  if (!bucket) throw new Error("[r2] CLOUDFLARE_R2_BUCKET not set.");

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

export async function deleteFromR2(key: string): Promise<void> {
  const bucket = process.env["CLOUDFLARE_R2_BUCKET"];
  if (!bucket) throw new Error("[r2] CLOUDFLARE_R2_BUCKET not set.");

  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}

/** FOR TEST USE ONLY — resets the singleton so tests can inject different env vars. */
export function _resetR2Client(): void {
  _s3 = null;
}
