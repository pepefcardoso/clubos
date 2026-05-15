"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ParentalConsentStatusResponse, RecordParentalConsentResponse } from "../../../../../packages/shared-types/src";

const formatCPF = (cpf: string) =>
    cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

interface Props {
    athleteId: string;
}

type Status = "idle" | "loading" | "submitting" | "done" | "error";

export function ParentalConsentAdminForm({ athleteId }: Props) {
    const guardianNameId = useId();
    const guardianCpfId = useId();
    const checkboxId = useId();
    const checkboxDescId = useId();

    const [status, setStatus] = useState<Status>("loading");
    const [existing, setExisting] = useState<ParentalConsentStatusResponse | null>(null);
    const [result, setResult] = useState<RecordParentalConsentResponse | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
    const [apiError, setApiError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const guardianNameRef = useRef<HTMLInputElement>(null);
    const guardianCpfRef = useRef<HTMLInputElement>(null);
    const consentCheckedRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch(`/api/athletes/${athleteId}/parental-consent`)
            .then((r) => r.json() as Promise<ParentalConsentStatusResponse>)
            .then((data) => {
                setExisting(data);
                setStatus(data.exists ? "done" : "idle");
            })
            .catch(() => setStatus("idle"));
    }, [athleteId]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setFieldErrors({});
        setApiError(null);

        const guardianName = guardianNameRef.current?.value.trim() ?? "";
        const rawCpf = guardianCpfRef.current?.value.replace(/\D/g, "") ?? "";
        const checked = consentCheckedRef.current?.checked ?? false;

        const errors: Partial<Record<string, string>> = {};
        if (guardianName.length < 2) errors["guardianName"] = "Informe o nome completo do responsável.";
        if (!/^\d{11}$/.test(rawCpf)) errors["guardianCpf"] = "Informe um CPF válido (11 dígitos).";
        if (!checked) errors["consent"] = "É necessário confirmar o consentimento para prosseguir.";

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        setStatus("submitting");

        try {
            const res = await fetch(`/api/athletes/${athleteId}/parental-consent`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guardianName, guardianCpf: rawCpf }),
            });

            if (!res.ok) {
                const body = (await res.json()) as { message?: string };
                setApiError(body.message ?? "Não foi possível registrar o consentimento. Tente novamente.");
                setStatus("idle");
                return;
            }

            const data = (await res.json()) as RecordParentalConsentResponse;
            setResult(data);
            setStatus("done");
        } catch {
            setApiError("Erro de rede. Verifique sua conexão e tente novamente.");
            setStatus("idle");
        }
    }

    function handleCopy() {
        const hash = result?.consentHash ?? existing?.consentId ?? "";
        navigator.clipboard.writeText(hash).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    if (status === "loading") {
        return (
            <div className="animate-pulse space-y-3 max-w-sm">
                <div className="h-4 bg-neutral-200 rounded w-48" />
                <div className="h-9 bg-neutral-200 rounded" />
                <div className="h-4 bg-neutral-200 rounded w-64" />
                <div className="h-9 bg-neutral-200 rounded" />
            </div>
        );
    }

    const consentId = result?.consentId ?? existing?.consentId;
    const consentHash = result?.consentHash;
    const recordedAt = result?.recordedAt ?? existing?.recordedAt;

    if (status === "done") {
        return (
            <div className="max-w-lg space-y-4">
                <div className="flex items-center gap-2">
                    <span className="rounded-full text-xs font-medium px-2.5 py-0.5 bg-primary-50 text-primary-700">
                        Consentimento registrado
                    </span>
                    {recordedAt && (
                        <span className="text-xs text-neutral-500">
                            em{" "}
                            {new Intl.DateTimeFormat("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            }).format(new Date(recordedAt))}
                        </span>
                    )}
                </div>

                {consentId && (
                    <div>
                        <p className="text-sm text-neutral-600 mb-1">ID do registro</p>
                        <p className="font-mono text-sm bg-neutral-100 rounded px-3 py-2 break-all">
                            {consentId}
                        </p>
                    </div>
                )}

                {consentHash && (
                    <div>
                        <p className="text-sm text-neutral-600 mb-1">Hash de integridade</p>
                        <div className="flex items-start gap-2">
                            <p className="font-mono text-xs bg-neutral-100 rounded px-3 py-2 break-all flex-1">
                                {consentHash}
                            </p>
                            <button
                                type="button"
                                onClick={handleCopy}
                                aria-label="Copiar hash de integridade"
                                className="border border-neutral-300 hover:bg-neutral-100 h-9 px-4 text-sm rounded shrink-0"
                            >
                                {copied ? "Copiado!" : "Copiar"}
                            </button>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                            Guarde este hash para fins de auditoria. O registro é imutável.
                        </p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-sm space-y-5" noValidate>
            <div className="space-y-1">
                <label htmlFor={guardianNameId} className="block text-sm font-medium text-neutral-700">
                    Nome do responsável legal <span className="text-danger">*</span>
                </label>
                <input
                    id={guardianNameId}
                    ref={guardianNameRef}
                    type="text"
                    autoComplete="name"
                    className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-primary-500 outline-none"
                    aria-required="true"
                    aria-describedby={fieldErrors["guardianName"] ? `${guardianNameId}-err` : undefined}
                />
                {fieldErrors["guardianName"] && (
                    <p id={`${guardianNameId}-err`} className="text-danger text-sm" role="alert">
                        {fieldErrors["guardianName"]}
                    </p>
                )}
            </div>

            <div className="space-y-1">
                <label htmlFor={guardianCpfId} className="block text-sm font-medium text-neutral-700">
                    CPF do responsável <span className="text-danger">*</span>
                </label>
                <input
                    id={guardianCpfId}
                    ref={guardianCpfRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="000.000.000-00"
                    className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-mono focus-visible:ring-2 focus-visible:ring-primary-500 outline-none"
                    aria-required="true"
                    aria-describedby={fieldErrors["guardianCpf"] ? `${guardianCpfId}-err` : undefined}
                    onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                        e.target.value = digits.length === 11 ? formatCPF(digits) : digits;
                    }}
                />
                {fieldErrors["guardianCpf"] && (
                    <p id={`${guardianCpfId}-err`} className="text-danger text-sm" role="alert">
                        {fieldErrors["guardianCpf"]}
                    </p>
                )}
            </div>

            <div className="space-y-1">
                <div className="flex items-start gap-2">
                    <input
                        id={checkboxId}
                        ref={consentCheckedRef}
                        type="checkbox"
                        className="mt-0.5 focus-visible:ring-2 focus-visible:ring-primary-500"
                        aria-required="true"
                        aria-describedby={checkboxDescId}
                    />
                    <label htmlFor={checkboxId} className="text-sm text-neutral-700 cursor-pointer">
                        Confirmo que o responsável legal forneceu consentimento expresso para que scouts
                        credenciados entrem em contato com o atleta.
                    </label>
                </div>
                <p id={checkboxDescId} className="text-xs text-neutral-500 ml-6">
                    Ao marcar, um registro imutável é criado com hash de integridade SHA-256. Esta ação não
                    pode ser desfeita.
                </p>
                {fieldErrors["consent"] && (
                    <p className="text-danger text-sm ml-6" role="alert">
                        {fieldErrors["consent"]}
                    </p>
                )}
            </div>

            {apiError && (
                <div
                    className="border-l-4 border-danger bg-red-50 px-4 py-3 rounded text-sm text-danger"
                    role="alert"
                >
                    {apiError}
                </div>
            )}

            <button
                type="submit"
                disabled={status === "submitting"}
                className="bg-primary-500 text-white hover:bg-primary-600 h-9 px-4 text-sm rounded disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
                {status === "submitting" ? (
                    <>
                        <span
                            className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                            aria-hidden="true"
                        />
                        Salvando…
                    </>
                ) : (
                    "Registrar consentimento"
                )}
            </button>
        </form>
    );
}