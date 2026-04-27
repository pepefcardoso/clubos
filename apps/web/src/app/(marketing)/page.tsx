import { HeroSection } from "@/components/marketing/sections/HeroSection";
import { SocialProofBar } from "@/components/marketing/sections/SocialProofBar";
import { ValuePropositionSection } from "@/components/marketing/sections/ValuePropositionSection";
import { DetailedFeatures } from "@/components/marketing/sections/DetailedFeatures"; // Novo
import { FeaturesSection } from "@/components/marketing/sections/FeaturesSection";
import { TestimonialsSection } from "@/components/marketing/sections/TestimonialsSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <SocialProofBar />
      <ValuePropositionSection />
      <DetailedFeatures />
      <FeaturesSection />
      <TestimonialsSection />
      <FinalCtaSection />
    </>
  );
}