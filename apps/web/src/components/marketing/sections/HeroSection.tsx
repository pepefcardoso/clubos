import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 sm:px-6 text-center overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-neutral-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, #d1cec6 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 30%, #fafaf8 100%)",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-[500px] h-[500px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #f0b429 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center gap-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-accent-50 px-4 py-1.5 text-xs font-semibold text-accent-500 shadow-sm">
          <Zap size={12} aria-hidden="true" className="text-accent-400" />
          Novo · Cobranças Pix automáticas
        </div>

        <h1
          id="hero-heading"
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight leading-[1.1]"
        >
          Chega de planilha.{" "}
          <span className="block">Comece a cobrar seus sócios</span>
          <span className="block text-primary-600">no automático.</span>
        </h1>

        <p className="text-base sm:text-lg text-neutral-500 max-w-xl leading-relaxed">
          Reduza a inadimplência do seu clube em até{" "}
          <strong className="font-semibold text-neutral-700">25%</strong> com
          cobranças Pix automáticas e régua de cobrança via WhatsApp — sem
          esforço manual.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Link href="/onboarding" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto px-8 shadow-md">
              Começar grátis
            </Button>
          </Link>
          <Link href="#features" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto px-8"
            >
              Ver como funciona
            </Button>
          </Link>
        </div>

        <p className="text-sm text-neutral-400">
          Sem cartão de crédito&nbsp;·&nbsp;Configuração em 5
          minutos&nbsp;·&nbsp;Cancele quando quiser
        </p>
      </div>
    </section>
  );
}
