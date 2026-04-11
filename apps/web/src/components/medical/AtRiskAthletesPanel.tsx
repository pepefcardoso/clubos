"use client";

import { useMemo } from "react";
import { AlertTriangle, Clock, Info, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAtRiskAthletes } from "@/hooks/use-injury-load-correlation";
import { RiskZoneBadge } from "@/components/training/RiskZoneBadge";

/** Warn when ACWR data is more than 5 hours old. */
const STALE_THRESHOLD_MS = 5 * 60 * 60 * 1000;

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0"
          aria-hidden="true"
        >
          <div
            className="h-8 w-8 rounded-full bg-neutral-200 animate-pulse flex-shrink-0"
            style={{ animationDelay: `${i * 80}ms` }}
          />
          <div className="flex-1 space-y-1.5 min-w-0">
            <div
              className="h-4 rounded bg-neutral-200 animate-pulse"
              style={{ width: `${48 + ((i * 17) % 35)}%` }}
            />
            <div className="h-3 w-20 rounded bg-neutral-200 animate-pulse" />
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className="h-5 w-12 rounded bg-neutral-200 animate-pulse" />
            <div className="h-5 w-20 rounded-full bg-neutral-200 animate-pulse" />
          </div>
        </div>
      ))}
    </>
  );
}

interface AtRiskAthletesProps {
  minAcwr?: number;
}

/**
 * Proactive injury-prevention panel — lists currently active athletes whose
 * ACWR ratio is at or above the risk threshold.
 *
 * Athletes are ordered by ACWR descending (highest-risk first).
 * Displays the athlete's last known injury structure as context for the physio.
 *
 * Role guard: this component should only render when canAccessClinicalData()
 * returns true. The API enforces ADMIN | PHYSIO; this guard is UI-layer only.
 */
export function AtRiskAthletesPanel({ minAcwr = 1.3 }: AtRiskAthletesProps) {
  const { data, isLoading, isError, dataUpdatedAt } = useAtRiskAthletes({
    minAcwr,
  });

  const acwrDataAsOf = data?.acwrDataAsOf ?? null;
  const isStale = useMemo(() => {
    if (!acwrDataAsOf || !dataUpdatedAt) return false;
    return (
      dataUpdatedAt - new Date(acwrDataAsOf).getTime() > STALE_THRESHOLD_MS
    );
  }, [acwrDataAsOf, dataUpdatedAt]);

  const athleteCount = data?.athletes.length ?? 0;

  return (
    <section
      aria-labelledby="at-risk-heading"
      className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={16}
            className={cn(
              "flex-shrink-0",
              athleteCount > 0 ? "text-red-500" : "text-neutral-400",
            )}
            aria-hidden="true"
          />
          <h2
            id="at-risk-heading"
            className="text-sm font-semibold text-neutral-900"
          >
            Atletas em Zona de Risco
          </h2>
        </div>

        {!isLoading && athleteCount > 0 && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"
            aria-label={`${athleteCount} atleta${athleteCount > 1 ? "s" : ""} em risco`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"
              aria-hidden="true"
            />
            {athleteCount} em risco
          </span>
        )}
      </div>

      {isStale && (
        <div
          role="note"
          className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs"
        >
          <Clock size={12} className="flex-shrink-0" aria-hidden="true" />
          Dados de risco podem ter até 4h de defasagem — atualização automática
          em andamento.
        </div>
      )}

      <div
        role="list"
        aria-label="Atletas com ACWR elevado"
        aria-busy={isLoading}
      >
        {isLoading ? (
          <SkeletonRows />
        ) : isError ? (
          <div className="py-10 text-center px-4">
            <AlertTriangle
              size={28}
              className="mx-auto text-neutral-300 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm text-neutral-500 font-medium">
              Não foi possível carregar os dados.
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Verifique sua conexão e tente novamente.
            </p>
          </div>
        ) : athleteCount === 0 ? (
          <div className="py-12 text-center px-4">
            <ShieldCheck
              size={36}
              className="mx-auto text-primary-300 mb-3"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-neutral-700">
              Nenhum atleta em zona de risco
            </p>
            <p className="text-xs text-neutral-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Todos os atletas ativos estão com ACWR abaixo de {minAcwr}. Bom
              sinal de gestão de carga!
            </p>
          </div>
        ) : (
          data!.athletes.map((athlete, index) => (
            <div
              key={athlete.athleteId}
              role="listitem"
              className={cn(
                "flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0",
                "hover:bg-neutral-50 transition-colors",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  index === 0
                    ? "bg-red-100 text-red-700"
                    : "bg-neutral-100 text-neutral-500",
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {athlete.athleteName}
                </p>
                <p className="text-xs text-neutral-400 truncate">
                  {athlete.position ?? "Posição não informada"}
                  {athlete.lastInjuryStructure && (
                    <span className="text-neutral-300 mx-1">·</span>
                  )}
                  {athlete.lastInjuryStructure && (
                    <span className="text-amber-600 font-medium">
                      Últ. lesão: {athlete.lastInjuryStructure}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  className="font-mono text-sm font-bold text-red-700 tabular-nums"
                  aria-label={`ACWR ${athlete.currentAcwr.toFixed(2)}`}
                >
                  {athlete.currentAcwr.toFixed(2)}
                </span>
                <RiskZoneBadge zone={athlete.currentRiskZone} size="sm" />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 text-[0.65rem] text-neutral-400 flex items-center gap-1.5">
        <Info size={10} className="flex-shrink-0" aria-hidden="true" />
        ACWR ≥ {minAcwr} indica sobrecarga. Atletas ordenados por risco
        decrescente. Dados atualizados a cada 4h.
      </div>
    </section>
  );
}
