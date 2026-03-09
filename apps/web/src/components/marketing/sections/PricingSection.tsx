import Link from "next/link";
import { CheckCircle, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type PlanTierId = "starter" | "pro" | "clube";

interface PricingTier {
    id: PlanTierId;
    name: string;
    description: string;
    priceCents: number;
    interval: "monthly";
    highlighted: boolean;
    badge?: string;
    ctaLabel: string;
    ctaHref: string;
    features: string[];
    notIncluded: string[];
}

const PRICING_TIERS: PricingTier[] = [
    {
        id: "starter",
        name: "Starter",
        description: "Para clubes que estão começando a organizar as finanças.",
        priceCents: 9700,
        interval: "monthly",
        highlighted: false,
        ctaLabel: "Começar grátis",
        ctaHref: "/onboarding",
        features: [
            "Cobranças Pix automáticas",
            "Régua WhatsApp (D-3, D0, D+3)",
            "Dashboard de inadimplência",
            "Importação CSV de sócios",
            "Até 100 sócios",
            "1 usuário",
        ],
        notIncluded: [
            "Fallback por e-mail",
            "Relatórios exportáveis",
            "Múltiplos usuários",
            "Suporte prioritário",
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "Para clubes em crescimento que precisam de mais controle.",
        priceCents: 19700,
        interval: "monthly",
        highlighted: true,
        badge: "Mais popular",
        ctaLabel: "Começar grátis",
        ctaHref: "/onboarding",
        features: [
            "Cobranças Pix automáticas",
            "Régua WhatsApp (D-3, D0, D+3)",
            "Dashboard de inadimplência",
            "Importação CSV de sócios",
            "Até 500 sócios",
            "Fallback por e-mail",
            "Relatórios exportáveis",
            "Múltiplos usuários (ADMIN + TREASURER)",
        ],
        notIncluded: ["Suporte prioritário", "Onboarding assistido"],
    },
    {
        id: "clube",
        name: "Clube",
        description: "Para clubes consolidados com operação financeira exigente.",
        priceCents: 39700,
        interval: "monthly",
        highlighted: false,
        ctaLabel: "Falar com a equipe",
        ctaHref: "/contato",
        features: [
            "Cobranças Pix automáticas",
            "Régua WhatsApp (D-3, D0, D+3)",
            "Dashboard de inadimplência",
            "Importação CSV de sócios",
            "Sócios ilimitados",
            "Fallback por e-mail",
            "Relatórios exportáveis",
            "Múltiplos usuários (ADMIN + TREASURER)",
            "Suporte prioritário",
            "Onboarding assistido",
        ],
        notIncluded: [],
    },
];

function PricingCard({ tier }: { tier: PricingTier }) {
    return (
        <li
            className={cn(
                "relative flex flex-col rounded-lg border bg-white p-8 transition-shadow",
                tier.highlighted
                    ? "border-primary-500 ring-2 ring-primary-500 shadow-lg"
                    : "border-neutral-200 shadow-sm hover:shadow-md",
            )}
        >
            {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-500 px-3 py-1 text-xs font-semibold text-white">
                        <Zap size={10} aria-hidden="true" />
                        {tier.badge}
                    </span>
                </div>
            )}

            <div className="mb-6">
                <h3 className="text-base font-bold text-neutral-900">{tier.name}</h3>
                <p className="mt-1.5 text-sm text-neutral-500 leading-relaxed">
                    {tier.description}
                </p>
            </div>

            <div className="mb-8 flex items-end gap-1">
                <span className="font-mono text-4xl font-bold text-neutral-900 leading-none">
                    {formatBRL(tier.priceCents)}
                </span>
                <span className="text-sm text-neutral-400 mb-0.5">/mês</span>
            </div>

            <Link href={tier.ctaHref}>
                <Button
                    variant={tier.highlighted ? "default" : "secondary"}
                    className="w-full"
                >
                    {tier.ctaLabel}
                </Button>
            </Link>

            <hr className="my-8 border-neutral-100" />

            <ul
                className="flex flex-col gap-3"
                aria-label={`Funcionalidades do plano ${tier.name}`}
            >
                {tier.features.map((feature) => (
                    <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-neutral-700"
                    >
                        <CheckCircle
                            size={16}
                            className="mt-0.5 flex-shrink-0 text-primary-500"
                            aria-hidden="true"
                        />
                        {feature}
                    </li>
                ))}
                {tier.notIncluded.map((feature) => (
                    <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-neutral-400"
                    >
                        <XCircle
                            size={16}
                            className="mt-0.5 flex-shrink-0 text-neutral-300"
                            aria-hidden="true"
                        />
                        <span className="line-through">{feature}</span>
                    </li>
                ))}
            </ul>
        </li>
    );
}

export function PricingSection() {
    return (
        <section
            aria-labelledby="pricing-heading"
            className="bg-neutral-50 py-20 sm:py-28"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="text-center max-w-xl mx-auto mb-14">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
                        Planos
                    </p>
                    <h2
                        id="pricing-heading"
                        className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight"
                    >
                        Preço justo para cada tamanho de clube
                    </h2>
                    <p className="mt-4 text-neutral-500 text-sm leading-relaxed">
                        14 dias grátis em qualquer plano. Sem cartão de crédito. Cancele
                        quando quiser.
                    </p>
                </div>

                <ul
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto"
                    role="list"
                >
                    {PRICING_TIERS.map((tier) => (
                        <PricingCard key={tier.id} tier={tier} />
                    ))}
                </ul>

                <p className="text-center text-xs text-neutral-400 mt-10">
                    Todos os preços em BRL · Cobrado mensalmente · Sem taxa de setup
                </p>
            </div>
        </section>
    );
}