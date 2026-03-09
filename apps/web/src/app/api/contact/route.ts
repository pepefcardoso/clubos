import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

const contactSchema = z.object({
  name: z.string().min(2, "Informe seu nome completo").max(100),
  email: z.string().email("Informe um e-mail válido"),
  message: z
    .string()
    .min(10, "A mensagem deve ter ao menos 10 caracteres")
    .max(2000),
});

export async function POST(request: Request) {
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
        error:
          "Não foi possível enviar sua mensagem. Tente novamente.",
      },
      { status: 500 },
    );
  }
}