"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScoutSearchParams } from "@/lib/api/scout-search";

const POSITIONS = [
    "Goleiro",
    "Lateral Direito",
    "Lateral Esquerdo",
    "Zagueiro",
    "Volante",
    "Meia",
    "Atacante",
    "Ponta Direita",
    "Ponta Esquerda",
    "Centroavante",
];

const RTP_OPTIONS = [
    { value: "", label: "Todos" },
    { value: "AFASTADO", label: "Afastado" },
    { value: "RETORNO_PROGRESSIVO", label: "Retorno Progressivo" },
    { value: "LIBERADO", label: "Liberado" },
] as const;

type FilterValues = Omit<ScoutSearchParams, "page" | "limit">;

interface ScoutSearchFiltersProps {
    values: FilterValues;
    onChange: (next: Partial<FilterValues>) => void;
    onClear: () => void;
}

const inputCls =
    "flex h-9 w-full rounded border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50";

const selectCls = `${inputCls} pr-8 appearance-none`;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={htmlFor} className="text-xs font-medium text-neutral-600">
                {label}
            </label>
            {children}
        </div>
    );
}

export function ScoutSearchFilters({ values, onChange, onClear }: ScoutSearchFiltersProps) {
    const posId = useId();
    const minAgeId = useId();
    const maxAgeId = useId();
    const stateId = useId();
    const rtpId = useId();
    const minAcwrId = useId();
    const maxAcwrId = useId();

    const hasFilters = Object.values(values).some((v) => v !== undefined && v !== "");

    return (
        <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-3 items-end">
                <Field label="Posição" htmlFor={posId}>
                    <div className="relative">
                        <select
                            id={posId}
                            value={values.position ?? ""}
                            onChange={(e) => onChange({ position: e.target.value || undefined })}
                            className={selectCls}
                            style={{ minWidth: "160px" }}
                        >
                            <option value="">Todas</option>
                            {POSITIONS.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                        <Search
                            size={12}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                            aria-hidden="true"
                        />
                    </div>
                </Field>

                <Field label="Idade mín." htmlFor={minAgeId}>
                    <input
                        id={minAgeId}
                        type="number"
                        min={14}
                        max={60}
                        placeholder="14"
                        value={values.minAge ?? ""}
                        onChange={(e) =>
                            onChange({ minAge: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={inputCls}
                        style={{ width: "80px" }}
                    />
                </Field>

                <Field label="Idade máx." htmlFor={maxAgeId}>
                    <input
                        id={maxAgeId}
                        type="number"
                        min={14}
                        max={60}
                        placeholder="60"
                        value={values.maxAge ?? ""}
                        onChange={(e) =>
                            onChange({ maxAge: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={inputCls}
                        style={{ width: "80px" }}
                    />
                </Field>

                <Field label="Estado (UF)" htmlFor={stateId}>
                    <input
                        id={stateId}
                        type="text"
                        maxLength={2}
                        placeholder="SP"
                        value={values.state ?? ""}
                        onChange={(e) =>
                            onChange({ state: e.target.value.toUpperCase() || undefined })
                        }
                        className={inputCls}
                        style={{ width: "72px" }}
                    />
                </Field>

                <Field label="Status RTP" htmlFor={rtpId}>
                    <select
                        id={rtpId}
                        value={values.rtpStatus ?? ""}
                        onChange={(e) =>
                            onChange({
                                rtpStatus: (e.target.value as ScoutSearchParams["rtpStatus"]) || undefined,
                            })
                        }
                        className={selectCls}
                        style={{ minWidth: "180px" }}
                    >
                        {RTP_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </Field>

                <Field label="ACWR mín." htmlFor={minAcwrId}>
                    <input
                        id={minAcwrId}
                        type="number"
                        step={0.1}
                        min={0}
                        max={5}
                        placeholder="0.0"
                        value={values.minAcwr ?? ""}
                        onChange={(e) =>
                            onChange({ minAcwr: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={inputCls}
                        style={{ width: "88px" }}
                    />
                </Field>

                <Field label="ACWR máx." htmlFor={maxAcwrId}>
                    <input
                        id={maxAcwrId}
                        type="number"
                        step={0.1}
                        min={0}
                        max={5}
                        placeholder="5.0"
                        value={values.maxAcwr ?? ""}
                        onChange={(e) =>
                            onChange({ maxAcwr: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={inputCls}
                        style={{ width: "88px" }}
                    />
                </Field>

                {hasFilters && (
                    <div className="flex items-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClear}
                            aria-label="Limpar filtros"
                            className="text-neutral-500 hover:text-neutral-700"
                        >
                            <X size={14} aria-hidden="true" />
                            Limpar
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}