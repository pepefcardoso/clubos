import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

export function FinalCtaSection() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative bg-primary-500 py-24 overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 100% at 50% 100%, #1a481a 0%, transparent 70%)",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, #7cbd7c 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 text-center flex flex-col items-center gap-6">
        <div
          className="w-12 h-12 rounded-xl bg-primary-400/40 border border-primary-400/40 flex items-center justify-center"
          aria-hidden="true"
        >
          <Shield size={24} className="text-white" strokeWidth={2} />
        </div>

        <h2
          id="final-cta-heading"
          className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight"
        >
          Pronto para reduzir a inadimplência do seu clube?
        </h2>

        <p className="text-primary-100 text-base sm:text-lg">
          Comece grátis hoje. Sem cartão de crédito.
        </p>

        <Link href="/onboarding">
          <Button
            size="lg"
            className="bg-white text-primary-700 hover:bg-primary-50 active:bg-primary-100 shadow-lg px-10 font-semibold"
          >
            Começar grátis
          </Button>
        </Link>

        <p className="text-primary-200 text-sm">
          Configuração em 5 minutos&nbsp;·&nbsp;Cancele quando quiser
        </p>
      </div>
    </section>
  );
}
