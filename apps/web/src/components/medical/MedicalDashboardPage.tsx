"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessClinicalData } from "@/lib/role-utils";
import { AtRiskAthletesPanel } from "./AtRiskAthletesPanel";
import { InjuryLoadCorrelationPanel } from "./InjuryLoadCorrelationPanel";

/**
 * Main dashboard page for the FisioBase module (PHYSIO | ADMIN only).
 *
 * Enforces role guard client-side — redirects to /dashboard if the
 * authenticated user does not have clinical data access. The API independently
 * enforces ADMIN | PHYSIO on every endpoint this page calls.
 *
 * Layout:
 *   1. AtRiskAthletesPanel  — proactive prevention: athletes currently at risk
 *   2. InjuryLoadCorrelationPanel — retrospective: injuries that occurred in
 *      high-ACWR periods
 */
export function MedicalDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !canAccessClinicalData(user.role)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || !canAccessClinicalData(user.role)) {
    return null;
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Stethoscope
              size={20}
              className="text-primary-600"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Saúde dos Atletas
            </h1>
          </div>
          <p className="text-neutral-500 text-[0.9375rem]">
            Monitoramento de risco de lesão por sobrecarga de treino (ACWR) e
            histórico de ocorrências clínicas.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 mb-6 bg-primary-50 border border-primary-100 rounded-lg">
        <Info
          size={16}
          className="text-primary-600 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-xs text-primary-700 leading-relaxed">
          <strong>O que é o ACWR?</strong> O Índice de Carga Aguda:Crônica
          compara a carga dos últimos 7 dias com a média das últimas 4 semanas.
          Valores entre 0,8 e 1,3 indicam zona ótima. Acima de 1,3 há risco
          aumentado de lesão por sobrecarga — acima de 1,5 o risco é elevado. Os
          dados são atualizados automaticamente a cada 4 horas.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <AtRiskAthletesPanel minAcwr={1.3} />
        </div>

        <div className="xl:col-span-2">
          <InjuryLoadCorrelationPanel />
        </div>
      </div>
    </div>
  );
}
