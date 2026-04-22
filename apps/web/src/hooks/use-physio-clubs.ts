"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchPhysioClubs,
  switchPhysioClub,
  fetchMultiClubDashboard,
  grantPhysioAccess,
  revokePhysioAccess,
  transferMedicalRecord,
} from "@/lib/api/physio";

export const PHYSIO_CLUBS_QUERY_KEY = ["physio-clubs"] as const;
export const PHYSIO_DASHBOARD_QUERY_KEY = ["physio-dashboard"] as const;

/**
 * Fetches the list of clubs the authenticated PHYSIO has access to.
 * Disabled for non-PHYSIO roles — callers should guard with isPhysio(user.role).
 */
export function usePhysioClubs() {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: PHYSIO_CLUBS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchPhysioClubs(token);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Mutation to switch the active club for the PHYSIO session.
 * On success:
 *   - Calls the provided onTokenReceived callback with the new access token
 *     so the AuthProvider can update in-memory state.
 *   - Clears all React Query cache (data belongs to the previous club).
 */
export function useSwitchPhysioClub(options?: {
  onTokenReceived?: (token: string) => void;
}) {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (targetClubId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return switchPhysioClub(targetClubId, token);
    },
    onSuccess: (data) => {
      options?.onTokenReceived?.(data.accessToken);
      qc.clear();
    },
  });
}

/**
 * Fetches the multi-club at-risk athlete dashboard for the authenticated PHYSIO.
 * Polls all linked clubs server-side and returns a consolidated sorted list.
 */
export function useMultiClubDashboard(minAcwr = 1.3) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...PHYSIO_DASHBOARD_QUERY_KEY, minAcwr],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchMultiClubDashboard(minAcwr, token);
    },
    staleTime: 4 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
    refetchInterval: 4 * 60 * 60 * 1000,
  });
}

/** ADMIN mutation to grant a PHYSIO user access to their club. */
export function useGrantPhysioAccess() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      physioUserId,
      targetClubId,
    }: {
      physioUserId: string;
      targetClubId: string;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return grantPhysioAccess(physioUserId, targetClubId, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PHYSIO_CLUBS_QUERY_KEY });
    },
  });
}

/** ADMIN mutation to revoke a PHYSIO user's access to a club. */
export function useRevokePhysioAccess() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (accessId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return revokePhysioAccess(accessId, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PHYSIO_CLUBS_QUERY_KEY });
    },
  });
}

/**
 * Mutation to transfer a medical record from the current club to a target club.
 * Both clubs must be linked to the same PHYSIO user.
 * The target club must already have the athlete registered (matched by CPF).
 */
export function useTransferMedicalRecord() {
  const { getAccessToken } = useAuth();

  return useMutation({
    mutationFn: async ({
      recordId,
      targetClubId,
      consentNotes,
    }: {
      recordId: string;
      targetClubId: string;
      consentNotes: string;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return transferMedicalRecord(recordId, targetClubId, consentNotes, token);
    },
  });
}
