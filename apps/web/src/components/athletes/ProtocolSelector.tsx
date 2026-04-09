"use client";

import { useState, useMemo } from "react";
import { ChevronRight, Clock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    useInjuryProtocols,
    type InjuryProtocolSummary,
} from "@/hooks/use-injury-protocols";
import { ProtocolDetailDrawer } from "./ProtocolDetailDrawer";

const GRADE_BADGE: Record<string, string> = {
    GRADE_1: "bg-primary-50 text-primary-700",
    GRADE_2: "bg-amber-50 text-amber-700",
    GRADE_3: "bg-orange-50 text-orange-700",
    COMPLETE: "bg-red-50 text-red-700",
};

const GRADE_SHORT: Record<string, string> = {
    GRADE_1: "G-I",
    GRADE_2: "G-II",
    GRADE_3: "G-III",
    COMPLETE: "Completa",
};

const GRADE_OPTIONS = [
    { value: "", label: "Todos os graus" },
    { value: "GRADE_1", label: "Grau I — Leve" },
    { value: "GRADE_2", label: "Grau II — Moderado" },
    { value: "GRADE_3", label: "Grau III — Grave" },
    { value: "COMPLETE", label: "Ruptura Completa" },
] as const;

export interface ProtocolSelectorProps {
    /** Currently selected protocol ID (controlled) */
    value: string | null;
    /** Called with protocol ID or null (clear selection) */
    onChange: (protocolId: string | null) => void;
    /** Pre-filter by structure (e.g. from injury form's structure field) */
    initialStructureFilter?: string;
    /** Pre-filter by grade (e.g. from injury form's grade field) */
    initialGradeFilter?: string;
    disabled?: boolean;
    /** Show inline validation error */
    error?: string;
}

function SkeletonList() {
    return (
        <div className="space-y-1.5" aria-hidden="true">
            {[...Array(5)].map((_, i) => (
                <div
                    key={i}
                    className="h-14 rounded border border-neutral-100 bg-neutral-50 animate-pulse"
                    style={{ animationDelay: `${i * 60}ms` }}
                />
            ))}
        </div>
    );
}

interface ProtocolRowProps {
    protocol: InjuryProtocolSummary;
    isSelected: boolean;
    disabled: boolean;
    onSelect: (id: string) => void;
    onViewDetail: (id: string) => void;
}

function ProtocolRow({
    protocol,
    isSelected,
    disabled,
    onSelect,
    onViewDetail,
}: ProtocolRowProps) {
    return (
        <div
            role="radio"
            aria-checked={isSelected}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded border cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                "transition-colors",
                isSelected
                    ? "border-primary-300 bg-primary-50"
                    : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
                disabled && "opacity-50 cursor-not-allowed",
            )}
            onClick={() => !disabled && onSelect(protocol.id)}
            onKeyDown={(e) => {
                if (!disabled && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(protocol.id);
                }
            }}
        >
            <div
                className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                    isSelected
                        ? "border-primary-500 bg-primary-500"
                        : "border-neutral-300",
                )}
                aria-hidden="true"
            >
                {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p
                    className={cn(
                        "text-sm font-medium truncate",
                        isSelected ? "text-primary-800" : "text-neutral-800",
                    )}
                >
                    {protocol.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span
                        className={cn(
                            "text-[0.6875rem] font-medium rounded-full px-1.5 py-0 leading-5",
                            GRADE_BADGE[protocol.grade] ?? "bg-neutral-100 text-neutral-600",
                        )}
                    >
                        {GRADE_SHORT[protocol.grade] ?? protocol.grade}
                    </span>
                    <span className="flex items-center gap-0.5 text-[0.6875rem] text-neutral-400">
                        <Clock size={9} aria-hidden="true" />
                        {protocol.durationDays}d
                    </span>
                </div>
            </div>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onViewDetail(protocol.id);
                }}
                className={cn(
                    "flex items-center gap-0.5 text-xs flex-shrink-0 rounded px-1.5 py-1",
                    "text-neutral-400 hover:text-primary-600 hover:bg-primary-50",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                )}
                aria-label={`Ver detalhes do protocolo ${protocol.name}`}
                tabIndex={disabled ? -1 : 0}
            >
                <span className="hidden sm:inline text-[0.6875rem]">Detalhes</span>
                <ChevronRight size={12} aria-hidden="true" />
            </button>
        </div>
    );
}

/**
 * ProtocolSelector — controlled combobox-style selector for FIFA Medical
 * injury protocols. Used in MedicalRecordFormModal and the RTP upsert form.
 *
 * Features:
 *   - Pre-filtered by structure/grade when provided as initial props
 *   - Live text filter over the loaded list (no extra API calls)
 *   - "Nenhum protocolo" option to clear the selection
 *   - Inline "Detalhes" button opens ProtocolDetailDrawer
 */
export function ProtocolSelector({
    value,
    onChange,
    initialStructureFilter,
    initialGradeFilter,
    disabled = false,
    error,
}: ProtocolSelectorProps) {
    const [structureFilter] = useState(initialStructureFilter ?? "");
    const [gradeFilter, setGradeFilter] = useState(initialGradeFilter ?? "");
    const [textFilter, setTextFilter] = useState("");
    const [detailProtocolId, setDetailProtocolId] = useState<string | null>(null);

    const { data: protocols, isLoading, isError } = useInjuryProtocols({
        structure: structureFilter || undefined,
        grade: gradeFilter || undefined,
        enabled: !disabled,
    });

    const filtered = useMemo(() => {
        if (!protocols) return [];
        if (!textFilter.trim()) return protocols;
        const q = textFilter.toLowerCase();
        return protocols.filter(
            (p) =>
                p.name.toLowerCase().includes(q) ||
                p.structure.toLowerCase().includes(q),
        );
    }, [protocols, textFilter]);

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={textFilter}
                        onChange={(e) => setTextFilter(e.target.value)}
                        placeholder="Buscar protocolo..."
                        disabled={disabled}
                        className={cn(
                            "w-full h-8 pl-8 pr-3 rounded border border-neutral-300 bg-white",
                            "text-sm text-neutral-900 placeholder:text-neutral-400",
                            "focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20",
                            "disabled:bg-neutral-50 disabled:text-neutral-400",
                        )}
                        aria-label="Buscar protocolo por nome ou estrutura"
                    />
                </div>

                <select
                    value={gradeFilter}
                    onChange={(e) => setGradeFilter(e.target.value)}
                    disabled={disabled}
                    className={cn(
                        "h-8 rounded border border-neutral-300 bg-white px-2 text-sm text-neutral-900",
                        "focus-visible:outline-none focus-visible:border-primary-500",
                        "disabled:bg-neutral-50 disabled:text-neutral-400",
                    )}
                    aria-label="Filtrar por grau"
                >
                    {GRADE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            <div
                role="radiogroup"
                aria-label="Selecionar protocolo de reabilitação"
                className={cn(
                    "border border-neutral-200 rounded-md overflow-hidden",
                    "max-h-64 overflow-y-auto",
                    disabled && "opacity-60",
                )}
            >
                <div
                    role="radio"
                    aria-checked={value === null}
                    tabIndex={disabled ? -1 : 0}
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 border-b border-neutral-100 cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500",
                        "transition-colors",
                        value === null
                            ? "bg-neutral-50"
                            : "bg-white hover:bg-neutral-50",
                        disabled && "cursor-not-allowed",
                    )}
                    onClick={() => !disabled && onChange(null)}
                    onKeyDown={(e) => {
                        if (!disabled && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            onChange(null);
                        }
                    }}
                >
                    <div
                        className={cn(
                            "w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                            value === null ? "border-primary-500 bg-primary-500" : "border-neutral-300",
                        )}
                        aria-hidden="true"
                    >
                        {value === null && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                    </div>
                    <span className="text-sm text-neutral-500 italic">
                        Nenhum protocolo
                    </span>
                </div>

                <div className="p-1.5 space-y-1">
                    {isLoading && <SkeletonList />}

                    {isError && (
                        <p className="text-sm text-neutral-500 text-center py-4">
                            Não foi possível carregar os protocolos.
                        </p>
                    )}

                    {!isLoading && !isError && filtered.length === 0 && (
                        <p className="text-sm text-neutral-400 text-center py-4">
                            {textFilter
                                ? `Nenhum protocolo encontrado para "${textFilter}".`
                                : "Nenhum protocolo disponível."}
                        </p>
                    )}

                    {filtered.map((protocol) => (
                        <ProtocolRow
                            key={protocol.id}
                            protocol={protocol}
                            isSelected={value === protocol.id}
                            disabled={disabled}
                            onSelect={onChange}
                            onViewDetail={setDetailProtocolId}
                        />
                    ))}
                </div>
            </div>

            {error && (
                <p className="text-sm text-danger" role="alert">
                    {error}
                </p>
            )}

            {detailProtocolId && (
                <ProtocolDetailDrawer
                    protocolId={detailProtocolId}
                    onClose={() => setDetailProtocolId(null)}
                />
            )}
        </div>
    );
}