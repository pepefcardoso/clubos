const TESTIMONIALS = [
  {
    quote:
      "Antes eu gastava 3 horas por semana mandando Pix e cobrando no WhatsApp. Hoje o ClubOS faz tudo. A inadimplência caiu de 35% para 12% em 2 meses.",
    name: "Roberto Alves",
    role: "Tesoureiro",
    club: "EC Alvarenga (MG)",
    initials: "RA",
  },
  {
    quote:
      "Simples de configurar e fácil de usar. Nossos sócios adoraram receber o Pix direto no WhatsApp com o QR Code já pronto.",
    name: "Claudia Martins",
    role: "Presidente",
    club: "AA Monte Azul (SP)",
    initials: "CM",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="bg-white py-20 sm:py-28 border-t border-neutral-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3">
            Depoimentos
          </p>
          <h2
            id="testimonials-heading"
            className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight"
          >
            Clubes que já usam o ClubOS
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name}>
              <blockquote className="bg-neutral-50 rounded-lg border border-neutral-200 p-8 h-full flex flex-col justify-between gap-6">
                <div
                  aria-hidden="true"
                  className="text-4xl font-serif text-primary-200 leading-none select-none"
                >
                  &ldquo;
                </div>
                <p className="text-neutral-700 leading-relaxed text-sm -mt-4">
                  {t.quote}
                </p>
                <figcaption className="flex items-center gap-3 pt-4 border-t border-neutral-200">
                  <div
                    className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    <span className="text-xs font-bold text-primary-700">
                      {t.initials}
                    </span>
                  </div>
                  <div>
                    <cite className="not-italic font-semibold text-neutral-900 text-sm block">
                      {t.name}
                    </cite>
                    <p className="text-neutral-400 text-xs mt-0.5">
                      {t.role}&nbsp;·&nbsp;{t.club}
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
