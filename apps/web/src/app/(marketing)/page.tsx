import { FeaturesSection } from "@/components/marketing/sections/FeaturesSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { HeroSection } from "@/components/marketing/sections/HeroSection";
import { SocialProofBar } from "@/components/marketing/sections/SocialProofBar";
import { TestimonialsSection } from "@/components/marketing/sections/TestimonialsSection";
import { ValuePropositionSection } from "@/components/marketing/sections/ValuePropositionSection";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClubOS — Gestão financeira para clubes de futebol",
  description:
    "Reduza a inadimplência do seu clube em até 25% com cobranças Pix automáticas e régua de cobrança via WhatsApp.",
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
