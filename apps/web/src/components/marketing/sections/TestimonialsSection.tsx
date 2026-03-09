import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const TESTIMONIALS = [
  {
    quote: (
      <>
        Antes eu gastava 3 horas por semana a mandar Pix e a cobrar no WhatsApp. Hoje o ClubOS faz tudo. A inadimplência caiu de <strong className="font-mono text-primary-600 bg-primary-50 px-1 rounded">35%</strong> para <strong className="font-mono text-primary-600 bg-primary-50 px-1 rounded">12%</strong> em apenas 2 meses.
      </>
    ),
    name: "Roberto Alves",
    role: "Tesoureiro",
    club: "EC Alvarenga (MG)",
    initials: "RA",
    delay: "delay-200"
  },
  {
    quote: (
      <>
        Simples de configurar e fácil de usar. Os nossos sócios adoraram receber o Pix direto no WhatsApp com o <strong className="text-neutral-900">QR Code já pronto</strong>. Acabou a dor de cabeça no início do mês.
      </>
    ),
    name: "Cláudia Martins",
    role: "Presidente",
    club: "AA Monte Azul (SP)",
    initials: "CM",
    delay: "delay-400"
  },
] as const;

export function TestimonialsSection() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="bg-white py-24 sm:py-32 border-b border-neutral-200 overflow-hidden relative"
    >
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{ backgroundImage: `radial-gradient(circle at 1px 1px, black 1px, transparent 0)`, backgroundSize: '32px 32px' }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
            Prova Social
          </p>
          <h2
            id="testimonials-heading"
            className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight"
          >
            Clubes que já confiam no ClubOS
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10 max-w-5xl mx-auto">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className={cn(
                "bg-white rounded-3xl border border-neutral-200 shadow-sm p-8 sm:p-10 relative group hover:shadow-md transition-all duration-500 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-8 fill-mode-both",
                t.delay
              )}
            >
              <div
                aria-hidden="true"
                className="absolute top-6 right-8 text-8xl font-serif text-primary-50/50 leading-none select-none transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"
              >
                &ldquo;
              </div>

              <blockquote className="relative z-10 flex flex-col h-full justify-between gap-8">
                <div>
                  <div className="flex items-center gap-1 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} size={16} className="fill-accent-400 text-accent-400" />
                    ))}
                  </div>

                  <p className="text-neutral-700 leading-relaxed text-base sm:text-lg">
                    {t.quote}
                  </p>
                </div>

                <figcaption className="flex items-center gap-4 pt-6 border-t border-neutral-100">
                  <div
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0 border border-primary-50 shadow-inner"
                    aria-hidden="true"
                  >
                    <span className="text-sm font-bold text-primary-800">
                      {t.initials}
                    </span>
                  </div>
                  <div>
                    <cite className="not-italic font-bold text-neutral-900 text-sm block">
                      {t.name}
                    </cite>
                    <p className="text-neutral-500 text-xs mt-0.5 font-medium">
                      {t.role} · <span className="text-neutral-900">{t.club}</span>
                    </p>
                  </div>
                </figcaption>
              </blockquote>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}