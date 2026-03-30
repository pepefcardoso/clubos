"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ShieldAlert } from "lucide-react";
import { verifyMemberCard, type VerifyCardResponse } from "@/lib/api/member-card";

const STATUS_LABELS: Record<string, string> = {
    ACTIVE: "Sócio Ativo",
    INACTIVE: "Sócio Inativo",
    OVERDUE: "Sócio Inadimplente",
};

const STATUS_CONFIG: Record<
    string,
    { containerClass: string; badgeClass: string; icon: React.ReactNode }
> = {
    ACTIVE: {
        containerClass: "bg-primary-50",
        badgeClass: "bg-primary-50 text-primary-700",
        icon: (
            <CheckCircle2
                size={32}
                className="text-primary-600"
                aria-hidden="true"
            />
        ),
    },
    INACTIVE: {
        containerClass: "bg-neutral-100",
        badgeClass: "bg-neutral-100 text-neutral-600",
        icon: (
            <ShieldAlert size={32} className="text-neutral-500" aria-hidden="true" />
        ),
    },
    OVERDUE: {
        containerClass: "bg-amber-50",
        badgeClass: "bg-amber-50 text-amber-700",
        icon: (
            <ShieldAlert size={32} className="text-amber-600" aria-hidden="true" />
        ),
    },
};

/**
 * Renders the result of a card token verification.
 *
 * This component is rendered inside a `<Suspense>` boundary in the page
 * because it uses `useSearchParams()` (Next.js 14 App Router requirement).
 *
 * Flow:
 *   1. Extract `?token=` from URL
 *   2. Call the public `/api/public/verify-member-card` endpoint
 *   3. Show loading → success or failure UI
 *
 * The backend always returns HTTP 200; `valid: false` indicates any failure.
 */
export function VerificationResult() {
    const params = useSearchParams();
    const token = params.get("token");

    const [phase, setPhase] = useState<"loading" | "done">(token ? "loading" : "done");
    const [result, setResult] = useState<VerifyCardResponse | null>(
        token ? null : { valid: false, reason: "Token não informado." }
    );

    useEffect(() => {
        if (!token) return;

        let isMounted = true;

        verifyMemberCard(token)
            .then((r) => {
                if (isMounted) {
                    setResult(r);
                    setPhase("done");
                }
            })
            .catch(() => {
                if (isMounted) {
                    setResult({ valid: false, reason: "Erro de conexão ao verificar carteirinha." });
                    setPhase("done");
                }
            });

        return () => {
            isMounted = false;
        };
    }, [token]);

    if (phase === "loading") {
        return (
            <div
                className="flex flex-col items-center gap-3"
                aria-live="polite"
                aria-label="Verificando carteirinha"
            >
                <Loader2
                    size={36}
                    className="text-primary-500 animate-spin"
                    aria-hidden="true"
                />
                <p className="text-neutral-500 text-sm">Verificando carteirinha…</p>
            </div>
        );
    }

    if (!result?.valid) {
        return (
            <div className="flex flex-col items-center gap-5 max-w-xs text-center">
                <div
                    className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center"
                    aria-hidden="true"
                >
                    <XCircle size={32} className="text-danger" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-neutral-900">
                        Carteirinha Inválida
                    </h1>
                    <p className="text-sm text-neutral-500 mt-2">
                        {result?.reason ?? "Esta carteirinha não é válida."}
                    </p>
                </div>
                <div className="text-xs text-neutral-400 border border-neutral-200 rounded-md px-4 py-3 bg-white">
                    Se você acredita que isso é um erro, solicite uma nova carteirinha ao
                    responsável do clube.
                </div>
            </div>
        );
    }

    const statusLabel =
        STATUS_LABELS[result.memberStatus ?? ""] ?? result.memberStatus;
    const statusCfg =
        STATUS_CONFIG[result.memberStatus ?? ""] ?? STATUS_CONFIG["INACTIVE"]!;

    return (
        <div
            className="flex flex-col items-center gap-6 max-w-xs text-center"
            role="main"
            aria-label={`Verificação bem-sucedida para ${result.memberName}`}
        >
            <div
                className={`w-16 h-16 rounded-full flex items-center justify-center ${statusCfg.containerClass}`}
                aria-hidden="true"
            >
                {statusCfg.icon}
            </div>

            <div>
                <h1 className="text-2xl font-bold text-neutral-900 font-mono">
                    {result.memberName}
                </h1>
                <p className="text-sm font-medium text-neutral-600 mt-1">
                    {result.clubName}
                </p>

                <span
                    className={`inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full ${statusCfg.badgeClass}`}
                >
                    {statusLabel}
                </span>
            </div>

            {result.verifiedAt && (
                <p className="text-xs text-neutral-400">
                    Verificado em{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                    }).format(new Date(result.verifiedAt))}
                </p>
            )}

            <p className="text-[0.625rem] text-neutral-300 uppercase tracking-wider">
                Verificado por ClubOS
            </p>
        </div>
    );
}