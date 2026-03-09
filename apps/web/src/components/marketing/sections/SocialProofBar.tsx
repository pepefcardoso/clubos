import { ShieldCheck, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function SocialProofBar() {
  const stats = [
    {
      icon: ShieldCheck,
      value: "+120",
      label: "clubes ativos",
      sub: "em todo o Brasil",
      color: "text-primary-600",
      bg: "bg-primary-50",
    },
    {
      icon: TrendingUp,
      value: "R$ 2,4M",
      label: "cobrados em Pix",
      sub: "nos últimos 12 meses",
      color: "text-neutral-900",
      bg: "bg-neutral-100",
    },
    {
      icon: Zap,
      value: "96%",
      label: "taxa de entrega",
      sub: "mensagens WhatsApp",
      color: "text-accent-500",
      bg: "bg-accent-50",
    },
  ] as const;

  const DELAY_CLASSES = [
    "delay-700",
    "delay-[800ms]",
    "delay-[900ms]",
  ] as const;

  return (
    <section
      aria-label="Números do ClubOS"
      className="bg-white border-b border-neutral-200 relative z-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            const delay = DELAY_CLASSES[index];

            return (
              <div
                key={stat.label}
                className={cn(
                  "flex flex-col items-center justify-center pt-8 sm:pt-0 sm:px-8 text-center animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700",
                  delay,
                )}
              >
                <dt className="sr-only">{stat.label}</dt>

                <div className="flex flex-col items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center mb-1",
                      stat.bg,
                    )}
                    aria-hidden="true"
                  >
                    <Icon size={20} className={stat.color} />
                  </div>

                  <dd
                    aria-label={`${stat.value} ${stat.label}`}
                    className={cn(
                      "font-mono font-extrabold text-4xl sm:text-5xl tracking-tight leading-none",
                      stat.color,
                    )}
                  >
                    {stat.value}
                  </dd>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="text-xs text-neutral-500 font-medium mt-1">
                    {stat.sub}
                  </p>
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
