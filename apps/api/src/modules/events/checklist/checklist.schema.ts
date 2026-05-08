import { z } from "zod";

export interface ChecklistItemResponse {
  id: string;
  eventId: string;
  category: string;
  item: string;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistResponse {
  eventId: string;
  byCategory: Record<string, ChecklistItemResponse[]>;
  totalItems: number;
  completedItems: number;
}

export const ToggleChecklistItemSchema = z.object({
  completed: z.boolean(),
});

export type ToggleChecklistItemInput = z.infer<
  typeof ToggleChecklistItemSchema
>;

export const DEFAULT_CHECKLIST_ITEMS: ReadonlyArray<{
  category: string;
  item: string;
}> = [
  { category: "EQUIPAMENTOS", item: "Uniformes titulares conferidos" },
  { category: "EQUIPAMENTOS", item: "Uniformes reservas disponíveis" },
  { category: "EQUIPAMENTOS", item: "Bolas de jogo preparadas" },
  { category: "LOGÍSTICA", item: "Transporte confirmado" },
  { category: "LOGÍSTICA", item: "Horário de concentração definido" },
  { category: "LOGÍSTICA", item: "Local de concentração comunicado" },
  { category: "MÉDICO", item: "Kit de primeiros socorros preparado" },
  { category: "MÉDICO", item: "Fisioterapeuta confirmado" },
  { category: "DOCUMENTAÇÃO", item: "Súmula preenchida" },
  { category: "DOCUMENTAÇÃO", item: "Identidades dos atletas conferidas" },
  { category: "CAMPO", item: "Chegada ao estádio confirmada" },
  { category: "CAMPO", item: "Aquecimento realizado" },
] as const;
