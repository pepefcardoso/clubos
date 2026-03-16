"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchTemplates,
  upsertTemplate,
  resetTemplate,
  type TemplateListItem,
} from "@/lib/api/templates";

export const TEMPLATES_QUERY_KEY = ["templates"] as const;

/**
 * Fetches all template entries for the active channel.
 * Stale time is 60s — templates change infrequently.
 */
export function useTemplates(channel: "WHATSAPP" | "EMAIL" = "WHATSAPP") {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...TEMPLATES_QUERY_KEY, channel],
    queryFn: async (): Promise<TemplateListItem[]> => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchTemplates(token, channel);
    },
    staleTime: 60_000,
  });
}

/**
 * Creates or updates a custom template body.
 * Invalidates the templates query on success so cards refresh.
 */
export function useUpsertTemplate(channel: "WHATSAPP" | "EMAIL") {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, body }: { key: string; body: string }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return upsertTemplate(key, { body, channel }, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });
}

/**
 * Deletes a custom template override, reverting the club to the system default.
 * Invalidates the templates query on success.
 */
export function useResetTemplate(channel: "WHATSAPP" | "EMAIL") {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return resetTemplate(key, channel, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });
}
