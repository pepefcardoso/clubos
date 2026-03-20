import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { verifyCsrfOrigin } from "@/lib/csrf";

const resend = new Resend(process.env.RESEND_API_KEY);

const contactSchema = z.object({
  name: z.string().min(2, "Informe seu nome completo").max(100),
  email: z.email("Informe um e-mail válido"),
  message: z
    .string()
    .min(10, "A mensagem deve ter ao menos 10 caracteres")
    .max(2000),
});

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

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count += 1;
  return false;
}

export async function POST(request: NextRequest) {
  const csrf = verifyCsrfOrigin({ headers: request.headers });
  if (!csrf.ok) {
    console.warn("[contact-route] CSRF check failed:", csrf.reason);
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

  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { name, email, message } = parsed.data;

    await resend.emails.send({
      from: "ClubOS <noreply@clubos.com.br>",
      to: process.env.CONTACT_EMAIL_TO ?? "contato@clubos.com.br",
      replyTo: email,
      subject: `[Contato ClubOS] Mensagem de ${name}`,
      text: `Nome: ${name}\nE-mail: ${email}\n\nMensagem:\n${message}`,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[contact-route]", err);
    return NextResponse.json(
      {
        error: "Não foi possível enviar sua mensagem. Tente novamente.",
      },
      { status: 500 },
    );
  }
}
