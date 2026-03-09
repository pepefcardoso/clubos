import { ChevronDown, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "Preciso de cartão de crédito para o teste grátis?",
    a: "Não. Os 14 dias são 100% gratuitos e sem necessidade de cartão de crédito. Só insere os dados de pagamento se decidir continuar a usar o sistema.",
  },
  {
    q: "Posso mudar de plano depois?",
    a: "Sim. Pode fazer upgrade ou downgrade a qualquer momento pelo painel de configurações. A cobrança é ajustada proporcionalmente e sem taxas ocultas.",
  },
  {
    q: "O que acontece se eu superar o limite de sócios?",
    a: "Receberá um aviso no dashboard para fazer o upgrade do plano. Nenhuma cobrança ativa é bloqueada automaticamente — a sua operação não para.",
  },
  {
    q: "Como funciona o cancelamento?",
    a: "Cancele quando quiser diretamente pelo painel. Sem multas, sem contratos de fidelização e sem burocracia. Os seus dados ficam disponíveis para exportação durante 30 dias após o cancelamento.",
  },
  {
    q: "O ClubOS funciona com qualquer banco ou conta Pix?",
    a: "Sim. As cobranças Pix são geradas via gateway de pagamento integrado (Asaas) e o sócio pode pagar usando a app de qualquer banco ou carteira digital.",
  },
  {
    q: "Os dados dos meus sócios ficam seguros?",
    a: "Absolutamente. CPF e telefone são criptografados com padrões bancários (AES-256). Além disso, cada clube tem um banco de dados isolado — os seus dados nunca se misturam com os de outro clube.",
  },
] as const;

const DELAY_CLASSES = [
  "delay-100",
  "delay-200",
  "delay-300",
  "[400ms]",
  "delay-500",
  "delay-500",
] as const;

export function PricingFaqSection() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="bg-neutral-50 py-24 sm:py-32 relative overflow-hidden"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mx-auto mb-6">
            <MessageCircleQuestion size={24} className="text-primary-600" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
            Dúvidas frequentes
          </p>
          <h2
            id="faq-heading"
            className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight"
          >
            Perguntas e respostas
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          {FAQS.map((faq, index) => {
            const delayClass =
              DELAY_CLASSES[Math.min(index, DELAY_CLASSES.length - 1)];

            return (
              <details
                key={faq.q}
                className={cn(
                  "group bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary-200 cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                  "animate-in fade-in slide-in-from-bottom-4 fill-mode-both",
                  delayClass,
                )}
              >
                <summary className="flex items-center justify-between gap-4 outline-none select-none">
                  <span className="text-base sm:text-lg font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors">
                    {faq.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 transition-all duration-300 group-open:bg-primary-50 group-open:text-primary-600 group-open:rotate-180"
                  >
                    <ChevronDown size={18} strokeWidth={2.5} />
                  </span>
                </summary>
                <div className="mt-4 pr-8 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
