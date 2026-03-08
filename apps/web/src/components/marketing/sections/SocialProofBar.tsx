export function SocialProofBar() {
  const stats = [
    {
      value: "+120",
      label: "clubes ativos",
      sub: "em todo o Brasil",
    },
    {
      value: "R$ 2,4M",
      label: "cobrados em Pix",
      sub: "nos últimos 12 meses",
    },
    {
      value: "96%",
      label: "taxa de entrega",
      sub: "mensagens WhatsApp",
    },
  ] as const;

  return (
    <section
      aria-label="Números do ClubOS"
      className="bg-white border-y border-neutral-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <dl className="flex flex-col sm:flex-row items-center justify-center divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 w-full">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1 w-full sm:w-1/3 py-6 sm:py-2 sm:px-8 text-center"
            >
              <dt className="sr-only">{stat.label}</dt>
              <dd
                aria-label={`${stat.value} ${stat.label}`}
                className="font-mono font-bold text-2xl sm:text-3xl text-primary-600 tracking-tight"
              >
                {stat.value}
              </dd>
              <p className="text-sm font-semibold text-neutral-700">
                {stat.label}
              </p>
              <p className="text-xs text-neutral-400">{stat.sub}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
