import Link from "next/link";
import { CheckCircle2, X, Zap } from "lucide-react";
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
        description: "Para clubes que estão a começar a organizar as finanças.",
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
            "1 utilizador",
        ],
        notIncluded: [
            "Fallback por e-mail",
            "Relatórios exportáveis",
            "Múltiplos utilizadores",
            "Suporte prioritário",
        ],
    },
    {
        id: "pro",
        name: "Pro",
        description: "Para clubes em crescimento que precisam de mais controlo.",
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
            "Múltiplos utilizadores (ADMIN + TREASURER)",
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
        ctaLabel: "Falar com a equipa",
        ctaHref: "/contato",
        features: [
            "Cobranças Pix automáticas",
            "Régua WhatsApp (D-3, D0, D+3)",
            "Dashboard de inadimplência",
            "Importação CSV de sócios",
            "Sócios ilimitados",
            "Fallback por e-mail",
            "Relatórios exportáveis",
            "Múltiplos utilizadores (ADMIN + TREASURER)",
            "Suporte prioritário",
            "Onboarding assistido",
        ],
        notIncluded: [],
    },
];

function PricingCard({ tier, index }: { tier: PricingTier; index: number }) {
    const animationDelay = index === 0 ? "delay-100" : index === 1 ? "delay-200" : "delay-300";

    return (
        <li
            className={cn(
                "relative flex flex-col rounded-3xl p-8 transition-all duration-500 animate-in fade-in slide-in-from-bottom-8 fill-mode-both hover:-translate-y-2",
                animationDelay,
                tier.highlighted
                    ? "bg-neutral-900 text-white shadow-2xl shadow-neutral-900/20 ring-1 ring-neutral-800 lg:scale-105 z-10"
                    : "bg-white text-neutral-900 border border-neutral-200 shadow-sm"
            )}
        >
            {tier.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
                        <Zap size={14} aria-hidden="true" />
                        {tier.badge}
                    </span>
                </div>
            )}

            <div className="mb-8">
                <h3 className={cn("text-lg font-bold", tier.highlighted ? "text-white" : "text-neutral-900")}>
                    {tier.name}
                </h3>
                <p className={cn("mt-2 text-sm leading-relaxed", tier.highlighted ? "text-neutral-400" : "text-neutral-500")}>
                    {tier.description}
                </p>
            </div>

            <div className="mb-8 flex items-baseline gap-1.5">
                <span className={cn("font-mono text-4xl sm:text-5xl font-bold tracking-tight", tier.highlighted ? "text-white" : "text-neutral-900")}>
                    {formatBRL(tier.priceCents)}
                </span>
                <span className={cn("text-sm font-medium", tier.highlighted ? "text-neutral-500" : "text-neutral-400")}>/mês</span>
            </div>

            <Link href={tier.ctaHref} className="w-full mt-auto">
                <Button
                    variant={tier.highlighted ? "default" : "secondary"}
                    className={cn(
                        "w-full h-11 rounded-lg font-semibold text-sm transition-all",
                        tier.highlighted
                            ? "bg-accent-500 hover:bg-accent-600 text-white border-none shadow-lg shadow-accent-500/25"
                            : "bg-white hover:bg-neutral-50"
                    )}
                >
                    {tier.ctaLabel}
                </Button>
            </Link>

            <hr className={cn("my-8", tier.highlighted ? "border-neutral-800" : "border-neutral-100")} />

            <ul
                className="flex flex-col gap-4"
                aria-label={`Funcionalidades do plano ${tier.name}`}
            >
                {tier.features.map((feature) => (
                    <li
                        key={feature}
                        className={cn("flex items-start gap-3 text-sm", tier.highlighted ? "text-neutral-200" : "text-neutral-700")}
                    >
                        <CheckCircle2
                            size={18}
                            className={cn("mt-0.5 flex-shrink-0", tier.highlighted ? "text-primary-400" : "text-primary-500")}
                            aria-hidden="true"
                        />
                        <span>{feature}</span>
                    </li>
                ))}
                {tier.notIncluded.map((feature) => (
                    <li
                        key={feature}
                        className={cn("flex items-start gap-3 text-sm", tier.highlighted ? "text-neutral-600" : "text-neutral-400")}
                    >
                        <X
                            size={18}
                            className="mt-0.5 flex-shrink-0 opacity-50"
                            aria-hidden="true"
                        />
                        <span className="line-through opacity-80">{feature}</span>
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
            className="bg-white py-24 sm:py-32 relative overflow-hidden"
        >
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
                <div className="text-center max-w-2xl mx-auto mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
                        Planos Transparentes
                    </p>
                    <h2
                        id="pricing-heading"
                        className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight"
                    >
                        O investimento que se paga na primeira cobrança
                    </h2>
                    <p className="mt-4 text-neutral-500 text-base leading-relaxed">
                        14 dias grátis em qualquer plano. Sem cartão de crédito exigido. Cancele
                        quando quiser.
                    </p>
                </div>

                <ul
                    className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-6 max-w-6xl mx-auto items-center"
                    role="list"
                >
                    {PRICING_TIERS.map((tier, index) => (
                        <PricingCard key={tier.id} tier={tier} index={index} />
                    ))}
                </ul>

                <div className="text-center mt-12 animate-in fade-in duration-1000 delay-500">
                    <p className="text-sm font-medium text-neutral-500">
                        Todos os preços em BRL · Cobrado mensalmente · <span className="text-primary-600">Sem taxa de setup</span>
                    </p>
                </div>
            </div>
        </section>
    );
}