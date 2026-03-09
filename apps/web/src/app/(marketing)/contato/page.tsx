import type { Metadata } from "next";
import { Mail, MessageSquare } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = {
    title: "Contato — ClubOS",
    description:
        "Fale com o time do ClubOS. Responderemos em até 1 dia útil.",
};

export default function ContactPage() {
    return (
        <section
            aria-labelledby="contact-heading"
            className="bg-neutral-50 py-20 sm:py-28 min-h-[calc(100vh-4rem)]"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 max-w-5xl mx-auto">
                    <div className="flex flex-col gap-6">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
                                Fale conosco
                            </p>
                            <h1
                                id="contact-heading"
                                className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight"
                            >
                                Como podemos ajudar?
                            </h1>
                            <p className="mt-4 text-neutral-500 text-sm leading-relaxed">
                                Dúvidas sobre planos, sugestões de funcionalidades ou quer
                                saber mais sobre o ClubOS? Envie uma mensagem — respondemos
                                em até 1 dia útil.
                            </p>
                        </div>

                        <div className="flex flex-col gap-4 mt-2">
                            <div className="flex items-start gap-3">
                                <div
                                    className="w-9 h-9 rounded-md bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5"
                                    aria-hidden="true"
                                >
                                    <Mail size={16} className="text-primary-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-neutral-900">
                                        E-mail
                                    </p>
                                    <p className="text-sm text-neutral-500">
                                        contato@clubos.com.br
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div
                                    className="w-9 h-9 rounded-md bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5"
                                    aria-hidden="true"
                                >
                                    <MessageSquare size={16} className="text-primary-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-neutral-900">
                                        Resposta
                                    </p>
                                    <p className="text-sm text-neutral-500">
                                        Em até 1 dia útil
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-8">
                        <ContactForm />
                    </div>
                </div>
            </div>
        </section>
    );
}