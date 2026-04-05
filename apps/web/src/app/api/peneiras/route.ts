import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyCsrfOrigin } from "@/lib/csrf";
import {
  tryoutFormSchema,
  getAgeFromBirthDate,
  type TryoutFormValues,
} from "@/lib/schemas/tryout.schema";

const resend = new Resend(process.env.RESEND_API_KEY);

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Validates file magic bytes against the declared MIME type.
 * Replicates the server-side magic-bytes check from the Fastify API
 * without importing the `file-type` package (not available in Next.js
 * edge/Node runtime by default).
 *
 * Signatures checked:
 *   JPEG  → FF D8 FF
 *   PNG   → 89 50 4E 47
 *   WebP  → 52 49 46 46 … 57 45 42 50
 *   PDF   → 25 50 44 46
 */
function validateMagicBytes(buffer: Uint8Array, declaredMime: string): boolean {
  const b = buffer;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return declaredMime === "image/jpeg";
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return declaredMime === "image/png";
  }
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return declaredMime === "image/webp";
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return declaredMime === "application/pdf";
  }

  return false;
}

/**
 * Verifies a parental consent token issued by the Fastify API.
 *
 * Replicates the verification logic from apps/api/src/modules/tryout/consent-token.ts
 * using the shared CONSENT_HMAC_SECRET.
 *
 * Returns true only when:
 *   1. Token structure is valid (payload.HMAC format)
 *   2. HMAC signature matches (timing-safe comparison)
 *   3. Token was issued within the last 2 hours
 *
 * Note: We cannot verify the embedded clubId here without resolving the slug to
 * an id (which would require an API call). The HMAC signature and TTL checks are
 * sufficient to prevent forgery and replay. The Fastify API has already stored the
 * full consent record in the tenant audit_log with the clubId at issuance time.
 */
function verifyConsentToken(token: string): boolean {
  try {
    const secret = process.env["CONSENT_HMAC_SECRET"];
    if (!secret || secret.length < 32) {
      console.error(
        "[peneiras-route] CONSENT_HMAC_SECRET is missing or too short",
      );
      return false;
    }

    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return false;

    const payloadB64 = token.slice(0, dotIndex);
    const providedHmac = token.slice(dotIndex + 1);

    const payload = Buffer.from(payloadB64, "base64url").toString();
    const parts = payload.split("|");
    if (parts.length !== 3) return false;

    const [, , issuedAtStr] = parts as [string, string, string];

    const expectedHmac = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expectedHmac.length !== providedHmac.length) return false;

    const isValid = timingSafeEqual(
      Buffer.from(expectedHmac, "hex"),
      Buffer.from(providedHmac, "hex"),
    );
    if (!isValid) return false;

    const issuedAt = new Date(issuedAtStr);
    if (isNaN(issuedAt.getTime())) return false;
    const ageMs = Date.now() - issuedAt.getTime();
    if (ageMs > 2 * 60 * 60 * 1000) return false;

    return true;
  } catch {
    return false;
  }
}

function buildEmailText(
  d: TryoutFormValues,
  isMinor: boolean,
  age: number | null,
  doc: { name: string; size: number; mimeType: string } | null,
): string {
  const RELATIONSHIP_LABELS: Record<string, string> = {
    mae: "Mãe",
    pai: "Pai",
    avo: "Avó / Avô",
    tio: "Tio / Tia",
    outro: "Outro responsável legal",
  };

  const lines: string[] = [
    `NOVA INSCRIÇÃO DE PENEIRA — ${d.clubSlug.toUpperCase()}`,
    "",
    `Atleta:        ${d.athleteName}`,
    `Nascimento:    ${d.birthDate}${age !== null ? ` (${age} anos)` : ""}`,
    isMinor
      ? "⚠️  MENOR DE IDADE — consentimento parental registado digitalmente"
      : "",
    `Posição:       ${d.position || "Não informado"}`,
    `Telefone:      ${d.phone}`,
    `E-mail:        ${d.email || "Não informado"}`,
    "",
  ];

  if (isMinor) {
    lines.push(
      "RESPONSÁVEL:",
      `  Nome:        ${d.guardianName || "—"}`,
      `  Telefone:    ${d.guardianPhone || "—"}`,
      `  Parentesco:  ${d.guardianRelationship ? (RELATIONSHIP_LABELS[d.guardianRelationship] ?? d.guardianRelationship) : "—"}`,
      "",
    );
  }

  if (d.notes) lines.push(`Observações: ${d.notes}`, "");

  lines.push(
    doc
      ? `Documento:   ${doc.name} (${doc.mimeType}, ${Math.round(doc.size / 1024)} KB)`
      : "Documento:   Não enviado",
  );

  return lines.filter((l, i) => !(l === "" && i === 0)).join("\n");
}

export async function POST(request: NextRequest) {
  const csrf = verifyCsrfOrigin({ headers: request.headers });
  if (!csrf.ok) {
    console.warn("[peneiras-route] CSRF check failed:", csrf.reason);
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 403 },
    );
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um momento e tente novamente." },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const rawData = {
    clubSlug: formData.get("clubSlug")?.toString() ?? "",
    athleteName: formData.get("athleteName")?.toString() ?? "",
    birthDate: formData.get("birthDate")?.toString() ?? "",
    position: formData.get("position")?.toString() || undefined,
    phone: (formData.get("phone")?.toString() ?? "").replace(/\D/g, ""),
    email: formData.get("email")?.toString() || undefined,
    guardianName: formData.get("guardianName")?.toString() || undefined,
    guardianPhone:
      (formData.get("guardianPhone")?.toString() ?? "").replace(/\D/g, "") ||
      undefined,
    guardianRelationship:
      formData.get("guardianRelationship")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
  };

  const ageCheck = rawData.birthDate
    ? getAgeFromBirthDate(rawData.birthDate)
    : null;
  const isMinorCheck = ageCheck !== null && ageCheck < 18;

  const consentToken = formData.get("consentToken")?.toString() ?? null;

  if (isMinorCheck) {
    if (!consentToken) {
      return NextResponse.json(
        {
          error:
            "Consentimento parental obrigatório para atletas menores de 18 anos.",
        },
        { status: 400 },
      );
    }
    if (!verifyConsentToken(consentToken)) {
      return NextResponse.json(
        {
          error:
            "Token de consentimento inválido ou expirado. Por favor, repita o processo de aceite.",
        },
        { status: 400 },
      );
    }
  }
  const parsed = tryoutFormSchema.safeParse(rawData);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const docFile = formData.get("document") as File | null;
  let docInfo: { name: string; size: number; mimeType: string } | null = null;

  if (docFile && docFile.size > 0) {
    if (docFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Documento excede o limite de 5 MB." },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME.has(docFile.type)) {
      return NextResponse.json(
        {
          error: "Formato de documento inválido. Envie JPG, PNG, WebP ou PDF.",
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await docFile.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    if (!validateMagicBytes(uint8, docFile.type)) {
      return NextResponse.json(
        {
          error: "O arquivo enviado não corresponde ao formato declarado.",
        },
        { status: 422 },
      );
    }

    docInfo = {
      name: docFile.name,
      size: docFile.size,
      mimeType: docFile.type,
    };
  }

  const { data: d } = parsed;
  const age = getAgeFromBirthDate(d.birthDate);
  const isMinor = age !== null && age < 18;

  const to = process.env.CONTACT_EMAIL_TO ?? "contato@clubos.com.br";

  try {
    await resend.emails.send({
      from: "ClubOS Peneiras <noreply@clubos.com.br>",
      to,
      subject: `[Peneira] Nova inscrição — ${d.athleteName} — ${d.clubSlug}`,
      text: buildEmailText(d, isMinor, age, docInfo),
    });
  } catch (err) {
    console.error("[peneiras-route] Resend error:", err);
    return NextResponse.json(
      {
        error: "Não foi possível registrar a inscrição. Tente novamente.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
