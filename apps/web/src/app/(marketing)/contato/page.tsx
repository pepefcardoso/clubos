import type { Metadata } from "next";
import { Mail, MessageSquare } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";

const TITLE = "Contato — ClubOS";
const DESCRIPTION =
  "Fale com a equipa do ClubOS. Responderemos em até 1 dia útil.";
const PAGE_URL = "https://clubos.com.br/contato";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: "ClubOS",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

export default function ContactPage() {
  return (
    <section
      aria-labelledby="contact-heading"
      className="bg-neutral-50 py-20 sm:py-28 min-h-[calc(100vh-4rem)] relative overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, black 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 max-w-5xl mx-auto items-start">
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">
                Fale connosco
              </p>
              <h1
                id="contact-heading"
                className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight"
              >
                Como podemos ajudar?
              </h1>
              <p className="mt-4 text-neutral-500 text-base leading-relaxed">
                Dúvidas sobre planos, sugestões de funcionalidades ou quer saber
                mais sobre o ClubOS? Envie uma mensagem — a nossa equipa
                responde em até 1 dia útil.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0 shadow-sm"
                  aria-hidden="true"
                >
                  <Mail size={20} className="text-primary-600" />
                </div>
                <div className="pt-1">
                  <p className="text-sm font-bold text-neutral-900">
                    E-mail direto
                  </p>
                  <p className="text-sm text-neutral-500 mt-0.5">
                    contato@clubos.com.br
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl bg-accent-50 border border-accent-100 flex items-center justify-center flex-shrink-0 shadow-sm"
                  aria-hidden="true"
                >
                  <MessageSquare size={20} className="text-accent-500" />
                </div>
                <div className="pt-1">
                  <p className="text-sm font-bold text-neutral-900">
                    Tempo de Resposta
                  </p>
                  <p className="text-sm text-neutral-500 mt-0.5">
                    Em até 1 dia útil
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-neutral-200 shadow-xl p-8 sm:p-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 to-accent-400 opacity-80" />

            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
