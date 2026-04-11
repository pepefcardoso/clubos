"use client";

import { useState, useMemo } from "react";
import { Activity, Clock, Info, AlertTriangle, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInjuryCorrelation } from "@/hooks/use-injury-load-correlation";
import { RiskZoneBadge } from "@/components/training/RiskZoneBadge";
import type { RiskZone } from "@/lib/api/workload";

/** Warn when ACWR data is more than 5 hours old. */
const STALE_THRESHOLD_MS = 5 * 60 * 60 * 1000;

const DAY_OPTIONS = [
  { label: "30d", value: 30, ariaLabel: "Últimos 30 dias" },
  { label: "60d", value: 60, ariaLabel: "Últimos 60 dias" },
  { label: "90d", value: 90, ariaLabel: "Últimos 90 dias" },
] as const;

const ACWR_OPTIONS = [
  { label: "≥ 1.3", value: 1.3 },
  { label: "≥ 1.5", value: 1.5 },
  { label: "≥ 2.0", value: 2.0 },
] as const;

/** Injury grade → display label + color classes */
const GRADE_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  GRADE_1: {
    label: "Grau I",
    bgClass: "bg-primary-50",
    textClass: "text-primary-700",
    borderClass: "border-primary-200",
  },
  GRADE_2: {
    label: "Grau II",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    borderClass: "border-amber-200",
  },
  GRADE_3: {
    label: "Grau III",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
  },
  COMPLETE: {
    label: "Completa",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200",
  },
};

const MECHANISM_LABELS: Record<string, string> = {
  CONTACT: "Contato",
  NON_CONTACT: "Sem contato",
  OVERUSE: "Sobrecarga",
  UNKNOWN: "Desconhecido",
};

function GradeBadge({ grade }: { grade: string }) {
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG["GRADE_1"]!;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        cfg.bgClass,
        cfg.textClass,
        cfg.borderClass,
      )}
    >
      {cfg.label}
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 rounded bg-neutral-200 animate-pulse"
                style={{
                  width: j === 0 ? "80%" : j === 5 ? "60%" : "55%",
                  animationDelay: `${(i * 6 + j) * 40}ms`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Displays a table of injury events that occurred while the athlete's ACWR
 * was above the configured threshold.
 *
 * Only plaintext medical_record fields are shown (structure, grade, mechanism).
 * Clinical fields (clinicalNotes, diagnosis, treatmentDetails) are never
 * fetched by this component.
 *
 * Role guard: must only render when canAccessClinicalData() is true.
 * The API enforces ADMIN | PHYSIO independently.
 */
export function InjuryLoadCorrelationPanel() {
  const [days, setDays] = useState<number>(30);
  const [minAcwr, setMinAcwr] = useState<number>(1.3);

  const { data, isLoading, isError, dataUpdatedAt } = useInjuryCorrelation({
    days,
    minAcwr,
  });

  const acwrDataAsOf = data?.acwrDataAsOf ?? null;
  const isStale = useMemo(() => {
    if (!acwrDataAsOf || !dataUpdatedAt) return false;
    return (
      dataUpdatedAt - new Date(acwrDataAsOf).getTime() > STALE_THRESHOLD_MS
    );
  }, [acwrDataAsOf, dataUpdatedAt]);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR").format(new Date(iso + "T00:00:00"));

  return (
    <section
      aria-labelledby="correlation-heading"
      className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <HeartPulse
            size={16}
            className="text-red-500 flex-shrink-0"
            aria-hidden="true"
          />
          <h2
            id="correlation-heading"
            className="text-sm font-semibold text-neutral-900"
          >
            Correlação Carga × Lesão
          </h2>
          {!isLoading && data && (
            <span className="text-xs text-neutral-400 font-normal">
              ({data.totalEvents} evento{data.totalEvents !== 1 ? "s" : ""})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Período de análise"
          >
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={cn(
                  "h-7 px-2.5 rounded text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                  days === opt.value
                    ? "bg-primary-500 text-white"
                    : "text-neutral-500 hover:bg-neutral-100",
                )}
                aria-pressed={days === opt.value}
                aria-label={opt.ariaLabel}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Limiar ACWR mínimo"
          >
            {ACWR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMinAcwr(opt.value)}
                className={cn(
                  "h-7 px-2.5 rounded text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                  minAcwr === opt.value
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-500 hover:bg-neutral-100",
                )}
                aria-pressed={minAcwr === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isStale && (
        <div
          role="note"
          className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs"
        >
          <Clock size={12} className="flex-shrink-0" aria-hidden="true" />
          Dados de ACWR podem ter até 4h de defasagem — atualização automática
          em andamento.
        </div>
      )}

      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          aria-label="Eventos de lesão correlacionados com ACWR elevado"
          aria-busy={isLoading}
        >
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Atleta
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Data
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Estrutura
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Grau
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                ACWR na lesão
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Pico ACWR
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : isError ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <AlertTriangle
                    size={28}
                    className="mx-auto text-neutral-300 mb-2"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-neutral-500 font-medium">
                    Não foi possível carregar os dados.
                  </p>
                </td>
              </tr>
            ) : !data || data.totalEvents === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Activity
                    size={36}
                    className="mx-auto text-neutral-200 mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-neutral-600">
                    Nenhum evento de lesão com ACWR ≥ {minAcwr} nos últimos{" "}
                    {days} dias
                  </p>
                  <p className="text-xs text-neutral-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    Ajuste os filtros de período ou limiar ACWR, ou aguarde o
                    registro de novos prontuários.
                  </p>
                </td>
              </tr>
            ) : (
              data.events.map((event, index) => (
                <tr
                  key={`${event.athleteId}-${event.injuryDate}-${index}`}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-neutral-900 text-sm">
                      {event.athleteName}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {event.position ?? "—"}
                      {event.mechanism && event.mechanism !== "UNKNOWN" && (
                        <span className="text-neutral-300 mx-1">·</span>
                      )}
                      {event.mechanism && event.mechanism !== "UNKNOWN" && (
                        <span>
                          {MECHANISM_LABELS[event.mechanism] ?? event.mechanism}
                        </span>
                      )}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                    {formatDate(event.injuryDate)}
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-sm text-neutral-800 font-medium">
                      {event.structure}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <GradeBadge grade={event.grade} />
                  </td>

                  <td className="px-4 py-3 text-right">
                    {event.acwrRatioAtInjury !== null ? (
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className="font-mono text-sm font-bold text-neutral-800 tabular-nums"
                          aria-label={`ACWR ${event.acwrRatioAtInjury.toFixed(2)} na data da lesão`}
                        >
                          {event.acwrRatioAtInjury.toFixed(2)}
                        </span>
                        {event.riskZoneAtInjury && (
                          <RiskZoneBadge
                            zone={event.riskZoneAtInjury as RiskZone}
                            size="sm"
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400 text-xs">
                        Sem dados
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {event.peakAcwrInWindow !== null ? (
                      <span
                        className={cn(
                          "font-mono text-sm font-bold tabular-nums",
                          event.peakAcwrInWindow >= 2.0
                            ? "text-red-700"
                            : event.peakAcwrInWindow >= 1.5
                              ? "text-orange-600"
                              : "text-amber-600",
                        )}
                        aria-label={`Pico de ACWR ${event.peakAcwrInWindow.toFixed(2)} nos ${days} dias anteriores`}
                      >
                        {event.peakAcwrInWindow.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-neutral-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 text-[0.65rem] text-neutral-400 flex items-center gap-1.5">
        <Info size={10} className="flex-shrink-0" aria-hidden="true" />
        Exibe lesões registradas quando ACWR nos {days} dias anteriores ≥{" "}
        {minAcwr}. Dados clínicos detalhados disponíveis no prontuário
        individual. ACWR atualizado a cada 4h.
      </div>
    </section>
  );
}
