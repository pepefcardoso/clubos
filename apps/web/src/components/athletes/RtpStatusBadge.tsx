"use client";

import { cn } from "@/lib/utils";

export type RtpStatus = "AFASTADO" | "RETORNO_PROGRESSIVO" | "LIBERADO" | null;

const CONFIG: Record<
  NonNullable<RtpStatus>,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
    dot: string;
    ariaLabel: string;
  }
> = {
  AFASTADO: {
    label: "Afastado",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
    ariaLabel: "Atleta afastado — não apto para jogo",
  },
  RETORNO_PROGRESSIVO: {
    label: "Ret. Progressivo",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-400",
    ariaLabel: "Atleta em retorno progressivo ao jogo",
  },
  LIBERADO: {
    label: "Liberado",
    bg: "bg-primary-50",
    text: "text-primary-700",
    border: "border-primary-200",
    dot: "bg-primary-500",
    ariaLabel: "Atleta liberado para jogo",
  },
};

interface RtpStatusBadgeProps {
  status: RtpStatus;
  size?: "sm" | "md";
}

export function RtpStatusBadge({ status, size = "sm" }: RtpStatusBadgeProps) {
  if (!status) {
    return (
      <span
        className="text-neutral-400 text-xs"
        aria-label="Sem status RTP registrado"
      >
        —
      </span>
    );
  }

  const cfg = CONFIG[status];
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border",
        cfg.bg,
        cfg.text,
        cfg.border,
        padding,
      )}
      aria-label={cfg.ariaLabel}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", cfg.dot)}
        aria-hidden="true"
      />
      {cfg.label}
    </span>
  );
}
