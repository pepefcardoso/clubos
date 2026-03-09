import type { Metadata } from "next";
import { PricingSection } from "@/components/marketing/sections/PricingSection";
import { PricingFaqSection } from "@/components/marketing/sections/PricingFaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";

const TITLE = "Preços — ClubOS";
const DESCRIPTION =
  "Planos acessíveis para clubes de futebol de todos os tamanhos. Comece grátis por 14 dias, sem cartão de crédito.";
const PAGE_URL = "https://clubos.com.br/precos";

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

export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <PricingFaqSection />
      <FinalCtaSection />
    </>
  );
}
