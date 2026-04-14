"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import type {
  TransactionMatchResult,
  MatchCandidate,
  MatchStatus,
} from "@/lib/api/reconciliation";
import type { MethodOverride } from "@/hooks/use-reconciliation";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const STATUS_CONFIG: Record<
  MatchStatus,
  { label: string; icon: React.ReactNode; rowClass: string }
> = {
  matched: {
    label: "Correspondência",
    icon: (
      <CheckCircle2 size={14} className="text-primary-600" aria-hidden="true" />
    ),
    rowClass: "",
  },
  ambiguous: {
    label: "Ambíguo",
    icon: (
      <AlertTriangle size={14} className="text-amber-600" aria-hidden="true" />
    ),
    rowClass: "bg-amber-50/40",
  },
  unmatched: {
    label: "Sem correspondência",
    icon: <XCircle size={14} className="text-neutral-400" aria-hidden="true" />,
    rowClass: "bg-neutral-50",
  },
};

const PAYMENT_METHODS: Array<{ value: MethodOverride[string]; label: string }> =
  [
    { value: "PIX", label: "Pix" },
    { value: "CASH", label: "Dinheiro" },
    { value: "BANK_TRANSFER", label: "Transferência" },
    { value: "CREDIT_CARD", label: "Cartão de crédito" },
    { value: "DEBIT_CARD", label: "Cartão de débito" },
    { value: "BOLETO", label: "Boleto" },
  ];

function StatusBadge({ status }: { status: MatchStatus }) {
  const { label, icon } = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600">
      {icon}
      {label}
    </span>
  );
}

function CandidateSelect({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: MatchCandidate[];
  selectedId: string | null;
  onSelect: (chargeId: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full h-8 rounded border border-neutral-300 bg-white pl-2 pr-7 text-xs
          text-neutral-900 transition-colors appearance-none
          focus-visible:outline-none focus-visible:border-primary-500
          focus-visible:ring-2 focus-visible:ring-primary-500/20"
        aria-label="Selecionar cobrança correspondente"
      >
        <option value="">— Selecionar sócio —</option>
        {candidates.map((c) => (
          <option key={c.chargeId} value={c.chargeId}>
            {c.memberName} — {formatBRL(c.amountCents)} — venc.{" "}
            {formatDate(c.dueDate)} (
            {c.dateDeltaDays === 0
              ? "mesmo dia"
              : `${Math.round(c.dateDeltaDays)}d`}
            , {c.confidence === "high" ? "alta" : "média"} confiança)
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

interface MatchTableProps {
  matches: TransactionMatchResult[];
  selected: Set<string>;
  overrides: Record<string, string>;
  /**
   * Whether all confirmable rows in the current view are selected.
   * Computed by the parent (ReconciliationPage) so it reflects the filtered
   * subset correctly when a status filter is active.
   */
  allConfirmableSelected: boolean;
  getEffectiveChargeId: (match: TransactionMatchResult) => string | null;
  getEffectiveMethod: (fitId: string) => MethodOverride[string];
  onToggleSelected: (fitId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onChargeOverride: (fitId: string, chargeId: string) => void;
  onMethodOverride: (fitId: string, method: MethodOverride[string]) => void;
}

export function MatchTable({
  matches,
  selected,
  overrides,
  allConfirmableSelected,
  getEffectiveChargeId,
  getEffectiveMethod,
  onToggleSelected,
  onSelectAll,
  onDeselectAll,
  onChargeOverride,
  onMethodOverride,
}: MatchTableProps) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          aria-label="Correspondências bancárias"
        >
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th scope="col" className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allConfirmableSelected}
                  onChange={
                    allConfirmableSelected ? onDeselectAll : onSelectAll
                  }
                  className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  aria-label="Selecionar todos os itens confirmáveis visíveis"
                  title="Selecionar todos"
                />
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Data
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Descrição OFX
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Valor
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide min-w-[220px]"
              >
                Sócio / Cobrança
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide w-36"
              >
                Método
              </th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const config = STATUS_CONFIG[match.matchStatus];
              const effectiveChargeId = getEffectiveChargeId(match);
              const isConfirmable = effectiveChargeId !== null;
              const isSelected = selected.has(match.fitId);
              const effectiveMethod = getEffectiveMethod(match.fitId);

              return (
                <tr
                  key={match.fitId}
                  className={[
                    "border-b border-neutral-100 transition-colors",
                    config.rowClass,
                    isSelected ? "bg-primary-50/30" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isConfirmable}
                      onChange={() => onToggleSelected(match.fitId)}
                      className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500
                        disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={`Selecionar transação ${match.transaction.description}`}
                    />
                  </td>

                  <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                    {formatDateTime(match.transaction.postedAt)}
                  </td>

                  <td className="px-4 py-3 text-neutral-600 max-w-[200px]">
                    <span
                      className="block truncate"
                      title={match.transaction.description}
                    >
                      {match.transaction.description || "—"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900 whitespace-nowrap">
                    {formatBRL(match.transaction.amountCents)}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={match.matchStatus} />
                  </td>

                  <td className="px-4 py-3">
                    {match.matchStatus === "matched" &&
                      !overrides[match.fitId] ? (
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {match.candidates[0]?.memberName}
                        </p>
                        <p className="text-xs text-neutral-400">
                          venc.{" "}
                          {match.candidates[0]
                            ? formatDate(match.candidates[0].dueDate)
                            : "—"}
                          {" · "}
                          <button
                            type="button"
                            className="underline hover:text-neutral-600 transition-colors"
                            onClick={() => onChargeOverride(match.fitId, "")}
                          >
                            Trocar
                          </button>
                        </p>
                      </div>
                    ) : match.matchStatus === "unmatched" &&
                      !overrides[match.fitId] ? (
                      <span className="text-xs text-neutral-400 italic">
                        Nenhuma cobrança correspondente
                      </span>
                    ) : (
                      <CandidateSelect
                        candidates={match.candidates}
                        selectedId={overrides[match.fitId] ?? null}
                        onSelect={(chargeId) =>
                          onChargeOverride(match.fitId, chargeId)
                        }
                      />
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {isConfirmable ? (
                      <div className="relative">
                        <select
                          value={effectiveMethod}
                          onChange={(e) =>
                            onMethodOverride(
                              match.fitId,
                              e.target.value as MethodOverride[string],
                            )
                          }
                          className="h-8 w-full rounded border border-neutral-300 bg-white pl-2 pr-7
                            text-xs text-neutral-900 transition-colors appearance-none
                            focus-visible:outline-none focus-visible:border-primary-500
                            focus-visible:ring-2 focus-visible:ring-primary-500/20"
                          aria-label="Método de pagamento"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                          aria-hidden="true"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}