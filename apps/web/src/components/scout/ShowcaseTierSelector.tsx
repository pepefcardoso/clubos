"use client";

import { AlertTriangle } from "lucide-react";
import type { ShowcaseTier } from "../../../../../packages/shared-types/src/index.js";
import { cn } from "@/lib/utils";

interface ShowcaseTierSelectorProps {
    value: ShowcaseTier;
    onChange: (tier: ShowcaseTier) => void;
    hasAcwrData: boolean;
    disabled?: boolean;
}

const TIERS: Array<{
    value: ShowcaseTier;
    label: string;
    description: string;
    features: string[];
}> = [
        {
            value: "FREE",
            label: "Free",
            description: "Perfil básico visível para scouts",
            features: ["Nome e posição", "Status RTP", "Idade"],
        },
        {
            value: "PREMIUM",
            label: "Premium",
            description: "Perfil completo com dados analíticos",
            features: ["Tudo do Free", "ACWR e curva de carga", "Avaliações técnicas", "Vídeos"],
        },
    ];

export function ShowcaseTierSelector({
    value,
    onChange,
    hasAcwrData,
    disabled = false,
}: ShowcaseTierSelectorProps) {
    const showLongitudinalWarning = value === "PREMIUM" && !hasAcwrData;

    return (
        <div className="space-y-3">
            <div
                className="grid grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Selecionar tier do showcase"
            >
                {TIERS.map((tier) => {
                    const isSelected = value === tier.value;
                    const inputId = `tier-${tier.value.toLowerCase()}`;

                    return (
                        <label
                            key={tier.value}
                            htmlFor={inputId}
                            className={cn(
                                "relative flex flex-col gap-2 rounded-md border p-4 cursor-pointer transition-colors",
                                isSelected
                                    ? "border-primary-500 bg-primary-50"
                                    : "border-neutral-200 bg-white hover:border-neutral-300",
                                disabled && "cursor-not-allowed opacity-60",
                            )}
                        >
                            <input
                                type="radio"
                                id={inputId}
                                name="showcase-tier"
                                value={tier.value}
                                checked={isSelected}
                                onChange={() => onChange(tier.value)}
                                disabled={disabled}
                                className="sr-only"
                                aria-describedby={`tier-${tier.value.toLowerCase()}-desc`}
                            />

                            <div className="flex items-center justify-between">
                                <span
                                    className={cn(
                                        "text-sm font-semibold",
                                        isSelected
                                            ? "text-primary-700"
                                            : "text-neutral-800",
                                    )}
                                >
                                    {tier.label}
                                </span>
                                <span
                                    className={cn(
                                        "rounded-full text-xs font-medium px-2.5 py-0.5",
                                        isSelected
                                            ? "bg-primary-100 text-primary-700"
                                            : "bg-neutral-100 text-neutral-600",
                                    )}
                                    aria-label={`Tier ${tier.label}`}
                                >
                                    {tier.label}
                                </span>
                            </div>

                            <p
                                id={`tier-${tier.value.toLowerCase()}-desc`}
                                className="text-xs text-neutral-500 leading-relaxed"
                            >
                                {tier.description}
                            </p>

                            <ul className="space-y-1" aria-label={`Recursos incluídos no tier ${tier.label}`}>
                                {tier.features.map((f) => (
                                    <li
                                        key={f}
                                        className="flex items-center gap-1.5 text-xs text-neutral-600"
                                    >
                                        <span
                                            className={cn(
                                                "w-1 h-1 rounded-full flex-shrink-0",
                                                isSelected
                                                    ? "bg-primary-500"
                                                    : "bg-neutral-400",
                                            )}
                                            aria-hidden="true"
                                        />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            {isSelected && (
                                <span
                                    className="absolute top-3 right-3 w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center"
                                    aria-hidden="true"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>

            {showLongitudinalWarning && (
                <div
                    role="note"
                    className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded text-amber-700 text-xs leading-relaxed"
                >
                    <AlertTriangle
                        size={13}
                        className="flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                    />
                    Dados longitudinais insuficientes podem impedir a publicação PREMIUM
                    (mínimo 180 dias de registros de treino).
                </div>
            )}
        </div>
    );
}