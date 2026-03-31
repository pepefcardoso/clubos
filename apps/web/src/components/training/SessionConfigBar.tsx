"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { SessionConfig } from "@/hooks/use-attendance-session";
import type { SessionType } from "@/lib/db/types";

const SESSION_TYPES: Array<{ value: SessionType; label: string }> = [
    { value: "TRAINING", label: "Treino" },
    { value: "MATCH", label: "Jogo" },
    { value: "GYM", label: "Academia" },
    { value: "RECOVERY", label: "Recuperação" },
    { value: "OTHER", label: "Outro" },
];

interface SessionConfigBarProps {
    config: SessionConfig;
    onChange: (patch: Partial<SessionConfig>) => void;
    disabled?: boolean;
}

export function SessionConfigBar({
    config,
    onChange,
    disabled,
}: SessionConfigBarProps) {
    return (
        <div className="flex flex-wrap gap-3 px-4 py-3 bg-white border-b border-neutral-200">
            <div className="flex flex-col gap-1">
                <Label htmlFor="att-date" className="text-xs text-neutral-500">
                    Data
                </Label>
                <Input
                    id="att-date"
                    type="date"
                    value={config.date}
                    disabled={disabled}
                    onChange={(e) => onChange({ date: e.target.value })}
                    className="h-10 text-sm w-[148px]"
                    aria-label="Data da sessão"
                />
            </div>

            <div className="flex flex-col gap-1">
                <Label htmlFor="att-type" className="text-xs text-neutral-500">
                    Tipo
                </Label>
                <select
                    id="att-type"
                    value={config.sessionType}
                    disabled={disabled}
                    onChange={(e) =>
                        onChange({ sessionType: e.target.value as SessionType })
                    }
                    className="h-10 w-40 rounded border border-neutral-300 bg-white px-3 text-[0.9375rem] text-neutral-900
            transition-colors
            focus-visible:outline-none focus-visible:border-primary-500
            focus-visible:ring-2 focus-visible:ring-primary-500/20
            disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
                    aria-label="Tipo de sessão"
                >
                    {SESSION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-1">
                <Label
                    htmlFor="att-duration"
                    className="text-xs text-neutral-500"
                >
                    Duração (min)
                </Label>
                <Input
                    id="att-duration"
                    type="number"
                    min={10}
                    max={480}
                    step={5}
                    value={config.durationMinutes}
                    disabled={disabled}
                    onChange={(e) =>
                        onChange({ durationMinutes: Number(e.target.value) })
                    }
                    className="h-10 text-sm font-mono w-24"
                    aria-label="Duração da sessão em minutos"
                />
            </div>

            <div className="flex flex-col gap-1">
                <Label htmlFor="att-rpe" className="text-xs text-neutral-500">
                    RPE (1–10)
                </Label>
                <Input
                    id="att-rpe"
                    type="number"
                    min={1}
                    max={10}
                    value={config.rpe}
                    disabled={disabled}
                    onChange={(e) => onChange({ rpe: Number(e.target.value) })}
                    className="h-10 text-sm font-mono w-20"
                    aria-label="Percepção subjetiva de esforço de 1 a 10"
                />
            </div>
        </div>
    );
}