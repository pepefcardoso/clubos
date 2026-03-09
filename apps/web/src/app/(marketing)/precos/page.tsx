import { FeaturesSection } from "@/components/marketing/sections/FeaturesSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { HeroSection } from "@/components/marketing/sections/HeroSection";
import { SocialProofBar } from "@/components/marketing/sections/SocialProofBar";
import { TestimonialsSection } from "@/components/marketing/sections/TestimonialsSection";
import { ValuePropositionSection } from "@/components/marketing/sections/ValuePropositionSection";
import type { Metadata } from "next";

const TITLE = "ClubOS — Gestão financeira para clubes de futebol";
const DESCRIPTION =
  "Reduza a inadimplência do seu clube em até 25% com cobranças Pix automáticas e régua de cobrança via WhatsApp.";
const BASE_URL = "https://clubos.com.br";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: BASE_URL,
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
    canonical: BASE_URL,
  },
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <SocialProofBar />
      <ValuePropositionSection />
      <FeaturesSection />
      <TestimonialsSection />
      <FinalCtaSection />
    </>
  );
}
