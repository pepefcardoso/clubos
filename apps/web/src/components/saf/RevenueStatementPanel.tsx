"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useRevenueStatement } from "@/hooks/use-revenue-statement";
import { formatBRL, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RevenueStatementMode } from "@/lib/api/revenue-statement";

type PeriodPreset = "6m" | "12m" | "ytd" | "prev-year";

const PRESET_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "ytd", label: "Este ano" },
  { value: "prev-year", label: "Ano anterior" },
];

/**
 * Converts a PeriodPreset into the RevenueStatementMode shape expected
 * by the API client and React Query hook.
 *
 * Exported for unit testing — pure function, no I/O.
 */
export function presetToMode(
  preset: PeriodPreset,
  now: Date = new Date(),
): RevenueStatementMode {
  const year = now.getFullYear();
  switch (preset) {
    case "6m":
      return { type: "months", months: 6 };
    case "12m":
      return { type: "months", months: 12 };
    case "ytd":
      return { type: "year", year };
    case "prev-year":
      return { type: "year", year: year - 1 };
  }
}



function NetIndicator({ cents }: { cents: number }) {
  if (cents > 0)
    return <TrendingUp size={14} className="text-green-600 shrink-0" aria-hidden />;
  if (cents < 0)
    return <TrendingDown size={14} className="text-red-500 shrink-0" aria-hidden />;
  return <Minus size={14} className="text-neutral-400 shrink-0" aria-hidden />;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-neutral-100">
          {Array.from({ length: 6 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 rounded bg-neutral-200 animate-pulse"
                style={{ width: `${50 + ((i * 3 + j * 7) % 40)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-14 text-center">
        <p className="text-neutral-500 font-medium text-[0.9375rem]">
          Nenhum dado disponível para o período selecionado
        </p>
        <p className="text-neutral-400 text-sm mt-1">
          Receitas, despesas e cobranças aparecerão aqui à medida que forem
          registradas.
        </p>
      </td>
    </tr>
  );
}

interface KpiCardProps {
  label: string;
  valueNode: React.ReactNode;
  sublabel?: string;
}

function KpiCard({ label, valueNode, sublabel }: KpiCardProps) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      {valueNode}
      {sublabel && (
        <p className="text-xs text-neutral-400 mt-0.5">{sublabel}</p>
      )}
    </div>
  );
}

/**
 * RevenueStatementPanel
 *
 * Self-contained SAF financial panel. Fetches and renders the integrated
 * revenue statement (receitas + despesas + resultado líquido) per calendar
 * month with a period-preset selector.
 *
 * Consumed by the SAF Dashboard (T-123) — no props required.
 *
 * Design follows CreditorDisclosuresPanel conventions (ui-guidelines.md):
 *   - font-mono tabular-nums for all monetary values
 *   - Skeleton rows while loading
 *   - Explicit empty state
 *   - Period sub-text for the audited range
 */
export function RevenueStatementPanel() {
  const [preset, setPreset] = useState<PeriodPreset>("12m");
  const mode = presetToMode(preset);
  const { data, isLoading } = useRevenueStatement(mode);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
            Demonstrativo de Receitas
          </h2>
          <p className="text-neutral-500 text-sm mt-0.5">
            Receitas, despesas e resultado líquido consolidados por mês.
          </p>
        </div>

        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as PeriodPreset)}
          className="h-9 rounded border border-neutral-300 bg-white px-3
            text-sm text-neutral-900 focus-visible:outline-none
            focus-visible:border-primary-500 focus-visible:ring-2
            focus-visible:ring-primary-500/20"
          aria-label="Selecionar período do demonstrativo"
        >
          {PRESET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Receitas"
            valueNode={
              <p className="text-lg font-bold font-mono text-primary-700 tabular-nums">
                {formatBRL(data.totals.revenueCents)}
              </p>
            }
            sublabel={`${data.totals.paymentCount} pagamento${data.totals.paymentCount !== 1 ? "s" : ""}`}
          />

          <KpiCard
            label="Despesas"
            valueNode={
              <p className="text-lg font-bold font-mono text-red-600 tabular-nums">
                {formatBRL(data.totals.expensesCents)}
              </p>
            }
          />

          <KpiCard
            label="Resultado Líquido"
            valueNode={
              <p
                className={cn(
                  "text-lg font-bold font-mono tabular-nums",
                  data.totals.netCents >= 0
                    ? "text-primary-700"
                    : "text-red-600",
                )}
              >
                {formatBRL(data.totals.netCents)}
              </p>
            }
          />

          <KpiCard
            label="Pendente + Inadimplente"
            valueNode={
              <p className="text-lg font-bold font-mono text-amber-600 tabular-nums">
                {formatBRL(
                  data.totals.pendingCents + data.totals.overdueCents,
                )}
              </p>
            }
            sublabel={`${data.totals.chargeCount} cobrança${data.totals.chargeCount !== 1 ? "s" : ""}`}
          />
        </div>
      )}

      <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            aria-label="Demonstrativo mensal de receitas"
          >
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {(
                  [
                    { label: "Período", align: "left" },
                    { label: "Receitas", align: "right" },
                    { label: "Despesas", align: "right" },
                    { label: "Líquido", align: "right" },
                    { label: "Pendente", align: "right" },
                    { label: "Inadimplente", align: "right" },
                  ] as const
                ).map((col) => (
                  <th
                    key={col.label}
                    scope="col"
                    className={cn(
                      "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !data || data.periods.length === 0 ? (
                <EmptyState />
              ) : (
                data.periods.map((row) => (
                  <tr
                    key={row.period}
                    className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 whitespace-nowrap">
                      {formatPeriod(row.period)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-primary-700 tabular-nums">
                      {formatBRL(row.revenueCents)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-red-600 tabular-nums">
                      {formatBRL(row.expensesCents)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-mono tabular-nums",
                          row.netCents >= 0
                            ? "text-primary-700"
                            : "text-red-600",
                        )}
                      >
                        <NetIndicator cents={row.netCents} />
                        {formatBRL(row.netCents)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-amber-700 tabular-nums">
                      {formatBRL(row.pendingCents)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-red-500 tabular-nums">
                      {formatBRL(row.overdueCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <p className="text-xs text-neutral-400 text-right">
          Período auditado:{" "}
          {new Intl.DateTimeFormat("pt-BR").format(
            new Date(`${data.from}T12:00:00Z`),
          )}{" "}
          —{" "}
          {new Intl.DateTimeFormat("pt-BR").format(
            new Date(`${data.to}T12:00:00Z`),
          )}
        </p>
      )}
    </div>
  );
}