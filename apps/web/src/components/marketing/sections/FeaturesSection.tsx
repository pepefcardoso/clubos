import { Zap, MessageCircle, BarChart3, Users, QrCode, ArrowDownRight, TrendingDown } from "lucide-react";

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="bg-neutral-50 py-24 sm:py-32 border-t border-neutral-200 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
            A Plataforma
          </p>
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight"
          >
            Tudo o que o seu clube precisa para cobrar sem stress
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(300px,auto)]">

          <div className="group relative bg-white rounded-2xl border border-neutral-200 p-8 shadow-sm hover:shadow-md transition-all overflow-hidden md:col-span-2 flex flex-col sm:flex-row gap-8 items-center justify-between">
            <div className="flex-1 z-10">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-6">
                <Zap size={24} className="text-primary-600" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-3">
                Cobranças Pix Automáticas
              </h3>
              <p className="text-neutral-500 leading-relaxed max-w-sm">
                Gera e envia o Pix para cada sócio no início do mês, sem qualquer intervenção manual. O dinheiro cai direto na conta do clube.
              </p>
            </div>

            <div className="relative w-full sm:w-64 flex-shrink-0 transform transition-transform group-hover:scale-105 duration-500">
              <div className="bg-white border border-neutral-200 rounded-xl shadow-lg p-5 w-full relative z-10">
                <div className="flex justify-between items-start border-b border-neutral-100 pb-4 mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Vence hoje</p>
                    <p className="text-2xl font-mono font-bold text-neutral-900">R$ 120,00</p>
                  </div>
                  <QrCode size={40} className="text-neutral-800" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 w-full animate-pulse" />
                  </div>
                </div>
                <p className="text-xs text-center text-primary-600 font-medium mt-3">Pronto para pagamento</p>
              </div>
              <div className="absolute -inset-4 bg-primary-50 rounded-full blur-2xl -z-10 opacity-50" />
            </div>
          </div>

          <div className="group relative bg-white rounded-2xl border border-neutral-200 p-8 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between h-full">
            <div className="z-10 mb-8">
              <div className="w-12 h-12 rounded-xl bg-accent-50 flex items-center justify-center mb-6">
                <MessageCircle size={24} className="text-accent-500" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-3">
                Régua WhatsApp Inteligente
              </h3>
              <p className="text-neutral-500 leading-relaxed text-sm">
                Lembretes automáticos 3 dias antes, no dia do vencimento e cobranças amigáveis para quem atrasou.
              </p>
            </div>

            <div className="relative mt-auto w-full flex justify-end transform transition-transform group-hover:-translate-x-2 duration-500">
              <div className="bg-[#DCF8C6] text-neutral-900 text-xs p-3 rounded-lg rounded-tr-none shadow-sm max-w-[85%] border border-green-200">
                Opa! Passando para lembrar que a mensalidade vence amanhã. ⚽️
              </div>
            </div>
          </div>

          <div className="group relative bg-white rounded-2xl border border-neutral-200 p-8 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between h-full">
            <div className="z-10 mb-8">
              <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center mb-6">
                <Users size={24} className="text-neutral-600" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-3">
                Gestão Completa de Sócios
              </h3>
              <p className="text-neutral-500 leading-relaxed text-sm">
                Importe via CSV. Controle planos, status e todo o histórico financeiro de cada pessoa num só lugar.
              </p>
            </div>

            <div className="mt-auto space-y-2 transform transition-transform group-hover:-translate-y-2 duration-500">
              {[
                { name: "João Silva", plan: "Sócio Ouro", status: "ACTIVE" },
                { name: "Carlos Mendes", plan: "Sócio Prata", status: "ACTIVE" },
              ].map((socio, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded border border-neutral-100 bg-neutral-50">
                  <div>
                    <p className="text-xs font-semibold text-neutral-900">{socio.name}</p>
                    <p className="text-[10px] text-neutral-500">{socio.plan}</p>
                  </div>
                  <span className="bg-primary-50 text-primary-700 rounded-full text-[10px] font-medium px-2 py-0.5">
                    {socio.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="group relative bg-neutral-900 rounded-2xl border border-neutral-800 p-8 shadow-lg hover:shadow-xl transition-all overflow-hidden md:col-span-2 flex flex-col sm:flex-row gap-8 items-center justify-between text-white">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`, backgroundSize: '24px 24px' }} />

            <div className="flex-1 z-10">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-6 backdrop-blur-sm">
                <BarChart3 size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Dashboard de Inadimplência
              </h3>
              <p className="text-neutral-400 leading-relaxed max-w-sm">
                Pare de cruzar dados em planilhas. Veja em tempo real quem está em dia, quem está em atraso e o dinheiro a receber.
              </p>
            </div>

            <div className="relative w-full sm:w-64 flex-shrink-0 transform transition-transform group-hover:scale-105 duration-500">
              <div className="bg-white/10 border border-white/10 backdrop-blur-md rounded-xl p-5 w-full relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-neutral-300">Inadimplência</p>
                  <div className="w-8 h-8 rounded bg-accent-500/20 flex items-center justify-center">
                    <TrendingDown size={16} className="text-accent-400" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-mono font-bold text-white">12%</span>
                  <span className="flex items-center text-xs font-medium text-accent-400">
                    <ArrowDownRight size={12} className="mr-0.5" /> -13%
                  </span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-2">Comparado ao mês passado</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}