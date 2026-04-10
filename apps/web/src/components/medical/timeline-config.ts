import type { InjuryGrade } from "@/lib/api/medical-records";

export const GRADE_BADGE: Record<
  InjuryGrade,
  { bg: string; text: string; label: string }
> = {
  GRADE_1: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Grau I — Leve",
  },
  GRADE_2: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    label: "Grau II — Moderado",
  },
  GRADE_3: {
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Grau III — Grave",
  },
  COMPLETE: {
    bg: "bg-red-100",
    text: "text-red-800",
    label: "Ruptura Completa",
  },
};

export const MECHANISM_LABEL: Record<string, string> = {
  CONTACT: "Contato",
  NON_CONTACT: "Sem contato",
  OVERUSE: "Sobrecarga",
  UNKNOWN: "Desconhecido",
};

export const RTP_BADGE: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  AFASTADO: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    label: "Afastado",
  },
  RETORNO_PROGRESSIVO: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
    label: "Retorno Progressivo",
  },
  LIBERADO: {
    bg: "bg-primary-50",
    text: "text-primary-700",
    dot: "bg-primary-500",
    label: "Liberado",
  },
};

export const EVENT_DOT: Record<string, string> = {
  injury: "bg-danger",
  rtp: "bg-accent-300",
  evaluation: "bg-info",
};

export const EVENT_LABEL: Record<string, string> = {
  injury: "Lesão registrada",
  rtp: "Status RTP",
  evaluation: "Avaliação técnica",
};
