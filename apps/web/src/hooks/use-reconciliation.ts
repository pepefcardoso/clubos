"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  uploadOfxFile,
  matchOfxTransactions,
  confirmReconciliationMatch,
  ReconciliationApiError,
  type ParsedOfxStatement,
  type MatchResponse,
  type TransactionMatchResult,
  type ConfirmMatchPayload,
  type MatchStatus,
} from "@/lib/api/reconciliation";
import { CHARGES_QUERY_KEY } from "@/hooks/use-charges";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import { formatBRL } from "@/lib/format";

export type ReconciliationStep = "upload" | "matching" | "review" | "done";

/** Filter applied to the match table in the review step. */
export type StatusFilter = MatchStatus | "all";

/**
 * Payment method override per-fitId.
 * The user can change the method from the default PIX in the review step.
 */
export type MethodOverride = Record<
  string,
  "PIX" | "CASH" | "BANK_TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO"
>;

/** Progress counter for the sequential batch confirmation loop. */
export interface ConfirmProgress {
  done: number;
  total: number;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  matched: "Correspondência",
  ambiguous: "Ambíguo",
  unmatched: "Sem correspondência",
};

export function useReconciliation() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<ReconciliationStep>("upload");
  const [statement, setStatement] = useState<ParsedOfxStatement | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);

  /**
   * fitId → chargeId override map.
   * Set when the user manually resolves an ambiguous or unmatched entry.
   */
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  /**
   * fitId → method override map.
   * Defaults to PIX for all. User can change per-row.
   */
  const [methodOverrides, setMethodOverrides] = useState<MethodOverride>({});

  /**
   * fitIds that the user has checked for confirmation.
   * Pre-populated with all "matched" fitIds after the match step.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** Number of successfully confirmed payments in the done step. */
  const [confirmedCount, setConfirmedCount] = useState(0);

  /**
   * Active status filter for the review table.
   * "all" shows every transaction; other values show only matching rows.
   */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  /**
   * Per-item progress counter during batch confirmation.
   * null when no confirmation is in progress.
   */
  const [confirmProgress, setConfirmProgress] =
    useState<ConfirmProgress | null>(null);

  /**
   * Derived: matches filtered by the active statusFilter.
   * Computed without useState to avoid synchronisation issues with `selected`.
   * The full matchResult.matches remains the source of truth.
   */
  const filteredMatches = useMemo<TransactionMatchResult[]>(() => {
    if (!matchResult) return [];
    if (statusFilter === "all") return matchResult.matches;
    return matchResult.matches.filter((m) => m.matchStatus === statusFilter);
  }, [matchResult, statusFilter]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return uploadOfxFile(file, token);
    },
    onSuccess: async (parsed) => {
      setStatement(parsed);
      setStep("matching");

      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Não autenticado");
        const result = await matchOfxTransactions(parsed.transactions, token);
        setMatchResult(result);

        const preSelected = new Set(
          result.matches
            .filter((m) => m.matchStatus === "matched")
            .map((m) => m.fitId),
        );
        setSelected(preSelected);

        setStep("review");
      } catch (err) {
        if (err instanceof ReconciliationApiError) {
          throw err;
        }
        throw err;
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: ConfirmMatchPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return confirmReconciliationMatch(payload, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHARGES_QUERY_KEY });
    },
  });

  const setChargeOverride = (fitId: string, chargeId: string) => {
    setOverrides((prev) => ({ ...prev, [fitId]: chargeId }));
  };

  const clearChargeOverride = (fitId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[fitId];
      return next;
    });
  };

  const setMethodOverride = (fitId: string, method: MethodOverride[string]) => {
    setMethodOverrides((prev) => ({ ...prev, [fitId]: method }));
  };

  const toggleSelected = (fitId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fitId)) {
        next.delete(fitId);
      } else {
        next.add(fitId);
      }
      return next;
    });
  };

  /**
   * Selects all currently visible (filtered) confirmable matches.
   * Does not deselect confirmable rows that are hidden by the active filter.
   */
  const selectAll = () => {
    if (!matchResult) return;
    const confirmableInView = filteredMatches.filter(
      (m) => getEffectiveChargeId(m) !== null,
    );
    setSelected((prev) => {
      const next = new Set(prev);
      confirmableInView.forEach((m) => next.add(m.fitId));
      return next;
    });
  };

  /**
   * Deselects all currently visible (filtered) matches.
   * Does not affect selections outside the current filter view.
   */
  const deselectAll = () => {
    const visibleFitIds = new Set(filteredMatches.map((m) => m.fitId));
    setSelected((prev) => {
      const next = new Set(prev);
      visibleFitIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const getEffectiveChargeId = (
    match: TransactionMatchResult,
  ): string | null => {
    if (overrides[match.fitId]) return overrides[match.fitId]!;
    if (match.matchStatus === "matched")
      return match.candidates[0]?.chargeId ?? null;
    return null;
  };

  const getEffectiveMethod = (fitId: string): MethodOverride[string] => {
    return methodOverrides[fitId] ?? "PIX";
  };

  /**
   * Confirms all selected+confirmable transactions sequentially.
   * Updates `confirmProgress` per-item so the UI can render a progress bar.
   * Sequential (not concurrent) to avoid overwhelming the tenant schema writes.
   */
  const confirmAll = async (): Promise<void> => {
    if (!matchResult) return;

    const toConfirm = matchResult.matches.filter(
      (m) => selected.has(m.fitId) && getEffectiveChargeId(m) !== null,
    );

    setConfirmProgress({ done: 0, total: toConfirm.length });

    let count = 0;
    for (const match of toConfirm) {
      const chargeId = getEffectiveChargeId(match)!;
      await confirmMutation.mutateAsync({
        fitId: match.fitId,
        chargeId,
        paidAt: match.transaction.postedAt,
        method: getEffectiveMethod(match.fitId),
      });
      count++;
      setConfirmProgress({ done: count, total: toConfirm.length });
    }

    setConfirmedCount(count);
    setConfirmProgress(null);
    setStep("done");
  };

  /**
   * Generates and downloads a CSV of all match results (all statuses, not just filtered).
   * Each row includes: transaction info, match status, linked member/charge, and confirmation flag.
   *
   * Uses UTF-8 BOM for Excel pt-BR compatibility.
   */
  const exportCsv = (): void => {
    if (!matchResult) return;

    const rows = matchResult.matches.map((m) => {
      const chargeId = getEffectiveChargeId(m);
      const candidate = chargeId
        ? m.candidates.find((c) => c.chargeId === chargeId)
        : null;

      return {
        fitId: m.fitId,
        postedAt: new Date(m.transaction.postedAt).toLocaleDateString("pt-BR"),
        description: m.transaction.description,
        amountBrl: formatBRL(m.transaction.amountCents),
        status: STATUS_LABEL[m.matchStatus],
        memberName: candidate?.memberName ?? "",
        chargeDueDate: candidate?.dueDate
          ? new Date(candidate.dueDate).toLocaleDateString("pt-BR", {
              timeZone: "UTC",
            })
          : "",
        chargeStatus: candidate?.status ?? "",
        confirmed: selected.has(m.fitId) && chargeId !== null ? "Sim" : "Não",
        method: getEffectiveMethod(m.fitId),
      };
    });

    const headers = [
      { key: "fitId", label: "ID OFX" },
      { key: "postedAt", label: "Data" },
      { key: "description", label: "Descrição OFX" },
      { key: "amountBrl", label: "Valor" },
      { key: "status", label: "Status" },
      { key: "memberName", label: "Sócio" },
      { key: "chargeDueDate", label: "Vencimento da Cobrança" },
      { key: "chargeStatus", label: "Status da Cobrança" },
      { key: "confirmed", label: "Confirmado" },
      { key: "method", label: "Método" },
    ];

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(toCsv(rows, headers), `conciliacao-${dateStr}.csv`);
  };

  const reset = () => {
    setStep("upload");
    setStatement(null);
    setMatchResult(null);
    setOverrides({});
    setMethodOverrides({});
    setSelected(new Set());
    setConfirmedCount(0);
    setStatusFilter("all");
    setConfirmProgress(null);
  };

  return {
    step,
    statement,
    matchResult,
    overrides,
    methodOverrides,
    selected,
    confirmedCount,
    statusFilter,
    setStatusFilter,
    filteredMatches,
    confirmProgress,
    uploadMutation,
    confirmMutation,
    setChargeOverride,
    clearChargeOverride,
    setMethodOverride,
    toggleSelected,
    selectAll,
    deselectAll,
    getEffectiveChargeId,
    getEffectiveMethod,
    confirmAll,
    exportCsv,
    reset,
    isConfirming: confirmMutation.isPending,
  };
}
