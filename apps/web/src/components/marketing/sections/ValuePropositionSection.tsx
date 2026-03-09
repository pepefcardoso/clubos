import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileSpreadsheet, Smartphone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function ValuePropositionSection() {
  return (
    <section
      aria-labelledby="value-prop-heading"
      className="bg-neutral-50 py-24 sm:py-32 border-b border-neutral-200 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
            Por que o ClubOS?
          </p>
          <h2
            id="value-prop-heading"
            className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight max-w-2xl mx-auto"
          >
            Da planilha bagunçada ao clube financeiramente organizado
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch max-w-5xl mx-auto">

          <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-8 sm:p-10 flex flex-col relative overflow-hidden animate-in fade-in slide-in-from-left-8 duration-700 delay-200 fill-mode-both">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50 pointer-events-none" />

            <div className="relative z-10 mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 text-danger mb-6">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 mb-3">
                O jeito antigo (e cansativo)
              </h3>
              <p className="text-neutral-500 leading-relaxed text-sm">
                Perder horas a cruzar quem pagou com quem não pagou, mandar mensagens manuais no WhatsApp e atualizar planilhas que nunca batem certo.
              </p>
            </div>

            <div className="mt-auto bg-neutral-50 border border-neutral-200 rounded-xl p-4 transform rotate-1 shadow-inner">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-neutral-200">
                <FileSpreadsheet size={16} className="text-green-600" />
                <span className="text-xs font-semibold text-neutral-600">Controle_Mensalidades_Final_v3.xlsx</span>
              </div>
              <div className="space-y-2">
                {[
                  { nome: "João Silva", valor: "R$ 80,00", status: "Pago?", cor: "text-neutral-400" },
                  { nome: "Carlos M.", valor: "R$ 80,00", status: "Atrasado!!", cor: "text-danger font-bold" },
                  { nome: "Ana Costa", valor: "R$ 80,00", status: "Mandar msg", cor: "text-warning font-bold" },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 bg-white border border-neutral-100 rounded shadow-sm">
                    <span className="text-neutral-700 w-1/3 truncate">{row.nome}</span>
                    <span className="font-mono text-neutral-500 w-1/3 text-center">{row.valor}</span>
                    <span className={cn("w-1/3 text-right", row.cor)}>{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full border border-neutral-200 shadow-sm items-center justify-center text-neutral-400">
            <ArrowRight size={20} />
          </div>

          <div className="bg-neutral-900 rounded-3xl border border-neutral-800 shadow-xl p-8 sm:p-10 flex flex-col relative overflow-hidden animate-in fade-in slide-in-from-right-8 duration-700 delay-500 fill-mode-both">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-900 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50 pointer-events-none" />

            <div className="relative z-10 mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-500/20 text-primary-400 mb-6 border border-primary-500/20">
                <Zap size={24} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">
                O jeito ClubOS
              </h3>
              <p className="text-neutral-400 leading-relaxed text-sm">
                O sistema trabalha por si. A cobrança é gerada, o sócio é avisado e a baixa é automática. Foco no clube, não na burocracia.
              </p>
            </div>

            <div className="mt-auto space-y-4 relative before:absolute before:inset-y-4 before:left-[19px] before:w-px before:bg-neutral-800">

              <div className="flex gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-neutral-400" />
                </div>
                <div className="pt-2">
                  <p className="text-sm font-semibold text-white">Dia 1</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Sistema gera as cobranças Pix.</p>
                </div>
              </div>

              <div className="flex gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-accent-500/20 border border-accent-500/30 flex items-center justify-center shrink-0">
                  <Smartphone size={16} className="text-accent-400" />
                </div>
                <div className="pt-2">
                  <p className="text-sm font-semibold text-white">Dia 3</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Sócio recebe lembrete com QR Code no WhatsApp.</p>
                </div>
              </div>

              <div className="flex gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-primary-500 border border-primary-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(45,125,45,0.4)]">
                  <CheckCircle2 size={16} className="text-white" />
                </div>
                <div className="pt-2">
                  <p className="text-sm font-semibold text-white">Dia 5</p>
                  <p className="text-xs text-primary-300 mt-0.5">Pix pago e conciliação automática feita.</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}