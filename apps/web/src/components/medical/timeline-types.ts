export type ClinicalEventType = "injury" | "rtp" | "evaluation";

interface BaseEvent {
  id: string;
  /** ISO date string — used for display and sorting (newest-first). */
  date: string;
  type: ClinicalEventType;
}

export interface InjuryEvent extends BaseEvent {
  type: "injury";
  structure: string;
  /** "GRADE_1" | "GRADE_2" | "GRADE_3" | "COMPLETE" */
  grade: string;
  mechanism: string;
}

export interface RtpEvent extends BaseEvent {
  type: "rtp";
  /** "AFASTADO" | "RETORNO_PROGRESSIVO" | "LIBERADO" */
  status: string;
  notes: string | null;
}

export interface EvaluationEvent extends BaseEvent {
  type: "evaluation";
  microcycle: string;
  averageScore: number;
}

export type ClinicalEvent = InjuryEvent | RtpEvent | EvaluationEvent;
