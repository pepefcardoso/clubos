import { Resend } from "resend";

let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (!_resend) {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Missing RESEND_API_KEY env var. " +
          "Create an API key at https://resend.com and set it in .env",
      );
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export function getEmailFrom(): string {
  return process.env["EMAIL_FROM"] ?? "ClubOS <noreply@clubos.com.br>";
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
