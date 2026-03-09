const FAQS = [
    {
        q: "Preciso de cartão de crédito para o teste grátis?",
        a: "Não. Os 14 dias são 100% gratuitos e sem necessidade de cartão de crédito. Você só insere os dados de pagamento se decidir continuar.",
    },
    {
        q: "Posso mudar de plano depois?",
        a: "Sim. Você pode fazer upgrade ou downgrade a qualquer momento pelo painel de configurações. A cobrança é ajustada proporcionalmente.",
    },
    {
        q: "O que acontece se eu superar o limite de sócios?",
        a: "Você receberá um aviso no dashboard para fazer upgrade. Nenhuma cobrança ativa é bloqueada automaticamente — sua operação não para.",
    },
    {
        q: "Como funciona o cancelamento?",
        a: "Cancele quando quiser diretamente pelo painel. Sem multas, sem burocracia. Seus dados ficam disponíveis por 30 dias após o cancelamento.",
    },
    {
        q: "O ClubOS funciona com qualquer banco ou conta Pix?",
        a: "Sim. As cobranças Pix são geradas via gateway de pagamento (Asaas) e o sócio pode pagar de qualquer banco ou carteira digital.",
    },
    {
        q: "Os dados dos meus sócios ficam seguros?",
        a: "Sim. CPF e telefone são criptografados em repouso com AES-256. Cada clube tem um banco de dados isolado — seus dados nunca se misturam com os de outro clube.",
    },
] as const;

export function PricingFaqSection() {
    return (
        <section
            aria-labelledby="faq-heading"
            className="bg-white py-20 sm:py-24 border-t border-neutral-200"
        >
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-12">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
                        Dúvidas frequentes
                    </p>
                    <h2
                        id="faq-heading"
                        className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight"
                    >
                        Perguntas e respostas
                    </h2>
                </div>

                <dl className="flex flex-col divide-y divide-neutral-100">
                    {FAQS.map((faq) => (
                        <details
                            key={faq.q}
                            className="group py-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                        >
                            <summary className="flex items-center justify-between gap-4 select-none">
                                <dt className="text-sm font-semibold text-neutral-900">
                                    {faq.q}
                                </dt>
                                <span
                                    aria-hidden="true"
                                    className="flex-shrink-0 w-5 h-5 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 transition-transform group-open:rotate-45"
                                >
                                    <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 10 10"
                                        fill="none"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M5 1v8M1 5h8"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </span>
                            </summary>
                            <dd className="mt-3 text-sm text-neutral-500 leading-relaxed pr-8">
                                {faq.a}
                            </dd>
                        </details>
                    ))}
                </dl>
            </div>
        </section>
    );
}