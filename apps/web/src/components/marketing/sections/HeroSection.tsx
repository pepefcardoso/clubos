import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, MessageCircle, CheckCircle2 } from "lucide-react";

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex flex-col justify-center min-h-[calc(100vh-4rem)] px-4 sm:px-6 overflow-hidden bg-primary-900"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #4d9e4d 1px, transparent 1px), linear-gradient(to bottom, #4d9e4d 1px, transparent 1px)`,
          backgroundSize: '4rem 4rem',
          maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)'
        }}
      />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center py-16 lg:py-0">

        <div className="flex flex-col items-start gap-6 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-700 bg-primary-800/50 backdrop-blur-sm px-4 py-1.5 text-xs font-semibold text-primary-100 shadow-sm">
            <Zap size={14} aria-hidden="true" className="text-accent-400" />
            Novo · Cobranças Pix automáticas
          </div>

          <h1
            id="hero-heading"
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1]"
          >
            Chega de planilha.<br />
            <span className="text-primary-300">Seu clube no automático.</span>
          </h1>

          <p className="text-base sm:text-lg text-primary-100/80 max-w-xl leading-relaxed">
            Reduza a inadimplência em até <strong className="font-semibold text-white">25%</strong>.
            O ClubOS envia o Pix, manda lembretes no WhatsApp e concilia os pagamentos dos seus sócios enquanto você foca no jogo.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mt-4">
            <Link href="/onboarding" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto px-8 bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20 border-none">
                Começar grátis
              </Button>
            </Link>
            <Link href="#features" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto px-8 bg-primary-800 hover:bg-primary-700 text-white border-primary-700"
              >
                Ver como funciona
              </Button>
            </Link>
          </div>

          <p className="text-sm text-primary-200/60 font-medium">
            Sem cartão de crédito · Configuração em 5 min
          </p>
        </div>

        <div className="relative w-full aspect-square max-w-md mx-auto lg:mr-0 flex items-center justify-center">

          <div className="relative w-full h-full flex flex-col justify-center gap-6">

            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-2xl border border-neutral-100 w-11/12 md:w-4/5 self-end transform transition-transform hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shadow-sm">
                  <MessageCircle size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-neutral-900">ClubOS Bot</p>
                  <p className="text-[10px] text-neutral-400">Agora mesmo</p>
                </div>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed mb-3">
                Fala, Roberto! A mensalidade do <strong>EC Alvarenga</strong> vence hoje. ⚽️
                <br /><br />
                Pague rapidinho com o Pix abaixo:
              </p>
              <div className="bg-neutral-50 border border-neutral-200 rounded p-3 flex justify-between items-center">
                <span className="font-mono text-sm text-neutral-900 truncate mr-2">000201010211...</span>
                <Button variant="secondary" size="sm" className="h-7 text-xs px-2 shrink-0">Copiar</Button>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-2xl border border-neutral-100 w-3/4 self-start transform transition-transform hover:-translate-y-1 -mt-8 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-700 fill-mode-both">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={20} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pix Recebido</p>
                  <p className="text-xl font-mono font-bold text-neutral-900 mt-0.5">R$ 80,00</p>
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-3 pt-3 border-t border-neutral-100">
                Mensalidade Sócio Torcedor · Roberto Alves
              </p>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}