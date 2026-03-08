import { Zap, MessageCircle, BarChart3, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: "Cobranças Pix Automáticas",
    description:
      "Gera e envia o Pix para cada sócio no início do mês, sem intervenção manual. QR Code pronto no WhatsApp.",
  },
  {
    icon: MessageCircle,
    title: "Régua WhatsApp Inteligente",
    description:
      "Lembretes D-3, D0 e cobrança D+3 enviados automaticamente. Fallback por e-mail quando necessário.",
  },
  {
    icon: BarChart3,
    title: "Dashboard de Inadimplência",
    description:
      "Veja em tempo real quem está em dia, quem está em atraso e quanto tem a receber este mês.",
  },
  {
    icon: Users,
    title: "Gestão Completa de Sócios",
    description:
      "Importe via CSV ou cadastre manualmente. Controle planos, status e histórico de cada sócio.",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="bg-neutral-50 py-20 sm:py-28 border-t border-neutral-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
            Funcionalidades
          </p>
          <h2
            id="features-heading"
            className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight"
          >
            Tudo que seu clube precisa para cobrar sem stress
          </h2>
        </div>

        <ul
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          role="list"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.title}>
                <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm h-full flex flex-col gap-4 transition-shadow hover:shadow-md">
                  <div
                    className="w-10 h-10 rounded-md bg-primary-50 flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    <Icon size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 mb-2 text-sm">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
