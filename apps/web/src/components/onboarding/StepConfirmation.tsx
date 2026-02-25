"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Hash, ImageIcon, Loader2 } from "lucide-react";
import { createClub, ApiError } from "@/lib/api/clubs";
import { formatCnpjDisplay, type ClubDataValues } from "./wizard.types";

interface StepConfirmationProps {
    clubData: ClubDataValues;
    logoPreviewUrl: string | null;
    onBack: () => void;
}

type SubmitState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "conflict" }
    | { status: "error"; message: string };

export function StepConfirmation({
    clubData,
    logoPreviewUrl,
    onBack,
}: StepConfirmationProps) {
    const router = useRouter();
    const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
    const [successToast, setSuccessToast] = useState(false);
    const [errorToast, setErrorToast] = useState<string | null>(null);

    async function handleSubmit() {
        setSubmitState({ status: "loading" });
        setSuccessToast(false);
        setErrorToast(null);

        try {
            await createClub({
                name: clubData.name,
                slug: clubData.slug,
                cnpj: clubData.cnpj && clubData.cnpj !== "" ? clubData.cnpj : undefined,
            });

            setSuccessToast(true);
            setTimeout(() => {
                router.push("/login");
            }, 1500);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setSubmitState({ status: "conflict" });
            } else {
                const message =
                    err instanceof ApiError
                        ? err.message
                        : "Não foi possível criar o clube. Tente novamente.";
                setErrorToast(message);
                setSubmitState({ status: "idle" });

                setTimeout(() => setErrorToast(null), 6000);
            }
        }
    }

    const isLoading = submitState.status === "loading" || successToast;

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-neutral-900">Confirmar informações</h2>
                <p className="text-sm text-neutral-500">
                    Revise os dados antes de criar seu clube.
                </p>
            </div>

            <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 flex items-center justify-center text-neutral-400">
                        <ImageIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                            Logo
                        </p>
                        {logoPreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={logoPreviewUrl}
                                alt="Logo do clube"
                                className="w-10 h-10 rounded-full object-cover border border-neutral-200 mt-1"
                            />
                        ) : (
                            <p className="text-sm text-neutral-400 italic mt-0.5">
                                Nenhum logo selecionado
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 flex items-center justify-center text-neutral-400">
                        <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                            Nome do clube
                        </p>
                        <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                            {clubData.name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 flex items-center justify-center text-neutral-400">
                        <Hash className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                            Identificador
                        </p>
                        <p className="text-sm font-mono text-neutral-900 mt-0.5">{clubData.slug}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                            clubos.com.br/{clubData.slug}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 flex items-center justify-center text-neutral-400">
                        <span className="text-xs font-bold text-neutral-400">CN</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                            CNPJ
                        </p>
                        <p className="text-sm font-mono text-neutral-900 mt-0.5">
                            {clubData.cnpj && clubData.cnpj.length === 14
                                ? formatCnpjDisplay(clubData.cnpj)
                                : <span className="text-neutral-400 italic not-italic font-sans font-normal text-sm">Não informado</span>}
                        </p>
                    </div>
                </div>
            </div>

            {submitState.status === "conflict" && (
                <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Este slug já está em uso.{" "}
                    <button
                        type="button"
                        onClick={onBack}
                        className="font-semibold underline hover:no-underline"
                    >
                        Volte
                    </button>{" "}
                    e escolha um identificador diferente.
                </div>
            )}

            <div className="flex items-center gap-3 pt-2">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isLoading}
                    className="h-9 px-4 text-sm font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                </button>

                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="h-9 px-5 text-sm font-medium rounded bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {successToast ? "Redirecionando…" : "Criando clube…"}
                        </>
                    ) : (
                        "Criar clube"
                    )}
                </button>
            </div>

            {successToast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg bg-white border-l-4 border-primary-500 shadow-lg px-4 py-3 text-sm text-neutral-800 animate-in slide-in-from-bottom-2">
                    <span className="font-medium">Clube criado com sucesso!</span>
                    <span className="text-neutral-400">Redirecionando…</span>
                </div>
            )}

            {errorToast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg bg-white border-l-4 border-danger shadow-lg px-4 py-3 text-sm text-neutral-800 animate-in slide-in-from-bottom-2 max-w-sm">
                    <span className="font-medium text-danger">Erro</span>
                    <span className="text-neutral-600">{errorToast}</span>
                </div>
            )}
        </div>
    );
}