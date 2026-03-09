import type { Metadata } from "next";
import { PricingSection } from "@/components/marketing/sections/PricingSection";
import { PricingFaqSection } from "@/components/marketing/sections/PricingFaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";

export const metadata: Metadata = {
    title: "Preços — ClubOS",
    description:
        "Planos acessíveis para clubes de futebol de todos os tamanhos. Comece grátis por 14 dias, sem cartão de crédito.",
};

export default function PricingPage() {
    return (
        <>
            <PricingSection />
            <PricingFaqSection />
            <FinalCtaSection />
        </>
    );
}