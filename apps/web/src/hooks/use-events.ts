"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  type CreateEventPayload,
  type UpdateEventPayload,
  type FetchEventsParams,
} from "@/lib/api/events";

export const EVENTS_QUERY_KEY = ["events"] as const;

export function useEvents(params: FetchEventsParams = {}) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...EVENTS_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchEvents({ limit: 20, ...params }, token);
    },
  });
}

export function useCreateEvent() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateEventPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createEvent(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_QUERY_KEY }),
  });
}

export function useUpdateEvent() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      payload,
    }: {
      eventId: string;
      payload: UpdateEventPayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateEvent(eventId, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_QUERY_KEY }),
  });
}

export function useCancelEvent() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return cancelEvent(eventId, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_QUERY_KEY }),
  });
}
