import { AlertTriangle, CheckCircle } from "lucide-react";

export function ValuePropositionSection() {
  return (
    <section
      aria-labelledby="value-prop-heading"
      className="bg-white py-20 sm:py-28"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-primary-600 mb-4">
          Por que o ClubOS?
        </p>

        <h2
          id="value-prop-heading"
          className="text-center text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-14 max-w-xl mx-auto"
        >
          Da planilha bagunçada ao clube financeiramente organizado
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 max-w-4xl mx-auto">
          <div className="rounded-lg border border-red-100 bg-red-50/50 p-8 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-md bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle
                size={20}
                className="text-danger"
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 mb-2">
                O problema
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                O tesoureiro de clube perde horas todo mês cobrando sócios
                manualmente, controlando pagamentos em planilhas e enviando Pix
                um a um no WhatsApp.
              </p>
            </div>
            <ul
              className="flex flex-col gap-2 mt-2"
              aria-label="Problemas comuns"
            >
              {[
                "Horas perdidas em cobranças manuais",
                "Planilhas desatualizadas e confusas",
                "Inadimplência difícil de rastrear",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-xs text-neutral-500"
                >
                  <span
                    className="mt-0.5 w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-primary-100 bg-primary-50/50 p-8 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-md bg-primary-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle
                size={20}
                className="text-primary-600"
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 mb-2">
                A solução
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                O ClubOS automatiza toda a régua de cobrança — do Pix gerado ao
                lembrete enviado — enquanto você foca no que realmente importa:
                o seu clube.
              </p>
            </div>
            <ul
              className="flex flex-col gap-2 mt-2"
              aria-label="Benefícios do ClubOS"
            >
              {[
                "Cobranças Pix geradas automaticamente",
                "Lembretes WhatsApp sem intervenção",
                "Dashboard de inadimplência em tempo real",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-xs text-neutral-600"
                >
                  <span
                    className="mt-0.5 w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
