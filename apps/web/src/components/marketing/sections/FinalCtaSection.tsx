import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight } from "lucide-react";

export function FinalCtaSection() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative bg-primary-900 py-24 sm:py-32 overflow-hidden border-t border-primary-800"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #4d9e4d 1px, transparent 1px), linear-gradient(to bottom, #4d9e4d 1px, transparent 1px)`,
          backgroundSize: '4rem 4rem',
        }}
      />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center flex flex-col items-center">

        <div
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-700 to-primary-800 border border-primary-600 flex items-center justify-center mb-8 shadow-2xl shadow-primary-900/50 animate-in fade-in slide-in-from-bottom-4 duration-700"
          aria-hidden="true"
        >
          <Shield size={32} className="text-accent-400" strokeWidth={2} />
        </div>

        <h2
          id="final-cta-heading"
          className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 fill-mode-both"
        >
          Pronto para organizar o seu clube<br className="hidden sm:block" />
          <span className="text-primary-300">de uma vez por todas?</span>
        </h2>

        <p className="text-primary-100/80 text-lg sm:text-xl max-w-xl mx-auto mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
          Junte-se a dezenas de tesoureiros e presidentes que já automatizaram as suas cobranças com o ClubOS.
        </p>

        <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-700 delay-300 fill-mode-both w-full sm:w-auto">

          <Link href="/onboarding" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto bg-accent-500 hover:bg-accent-600 text-white shadow-xl shadow-accent-500/20 border-none h-14 px-10 text-base font-bold group"
            >
              Começar grátis agora
              <ArrowRight size={18} className="ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>

          <div className="flex flex-col items-center gap-3">
            <div className="flex -space-x-2 overflow-hidden">
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-primary-900 bg-neutral-200" />
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-primary-900 bg-neutral-300" />
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-primary-900 bg-neutral-400" />
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-primary-900 bg-primary-800 text-[10px] font-bold text-white">
                +120
              </div>
            </div>

            <p className="text-primary-200/60 text-sm font-medium">
              Sem necessidade de cartão de crédito
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}