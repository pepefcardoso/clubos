"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatBRL, parsePriceToCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SectorRow {
    name: string;
    capacity: string;
    priceCents: string;
}

export interface SectorRowError {
    name?: string;
    capacity?: string;
    priceCents?: string;
}

interface EditableSectorsTableProps {
    mode: "create";
    rows: SectorRow[];
    errors: SectorRowError[];
    disabled: boolean;
    onChange: (rows: SectorRow[]) => void;
}

interface ReadonlySectorRow {
    id: string;
    name: string;
    capacity: number;
    sold: number;
    priceCents: number;
}

interface ReadonlySectorsTableProps {
    mode: "view";
    rows: ReadonlySectorRow[];
}

type EventSectorsTableProps = EditableSectorsTableProps | ReadonlySectorsTableProps;

function EditableTable({
    rows,
    errors,
    disabled,
    onChange,
}: Omit<EditableSectorsTableProps, "mode">) {
    const update = (index: number, field: keyof SectorRow, value: string) => {
        const next = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
        onChange(next);
    };

    const add = () =>
        onChange([...rows, { name: "", capacity: "", priceCents: "" }]);

    const remove = (index: number) =>
        onChange(rows.filter((_, i) => i !== index));

    return (
        <div className="space-y-2">
            <div className="rounded border border-neutral-200 overflow-hidden">
                <table className="w-full text-sm" aria-label="Setores do evento">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                Setor
                            </th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide w-28">
                                Capacidade
                            </th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide w-36">
                                Preço
                            </th>
                            <th scope="col" className="px-3 py-2 w-10" aria-label="Remover" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => {
                            const err = errors[i] ?? {};
                            const preview = parsePriceToCents(row.priceCents);
                            return (
                                <tr key={i} className="border-b border-neutral-100 last:border-0">
                                    <td className="px-3 py-2">
                                        <Input
                                            id={`sector-name-${i}`}
                                            aria-label={`Nome do setor ${i + 1}`}
                                            value={row.name}
                                            maxLength={100}
                                            disabled={disabled}
                                            placeholder="Ex: Arquibancada"
                                            aria-invalid={!!err.name}
                                            onChange={(e) => update(i, "name", e.target.value)}
                                            className={cn(err.name && "border-danger")}
                                        />
                                        {err.name && (
                                            <p className="text-xs text-danger mt-1" role="alert">{err.name}</p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <Input
                                            id={`sector-capacity-${i}`}
                                            aria-label={`Capacidade do setor ${i + 1}`}
                                            inputMode="numeric"
                                            value={row.capacity}
                                            disabled={disabled}
                                            placeholder="500"
                                            aria-invalid={!!err.capacity}
                                            onChange={(e) => update(i, "capacity", e.target.value.replace(/\D/g, ""))}
                                            className={cn("font-mono", err.capacity && "border-danger")}
                                        />
                                        {err.capacity && (
                                            <p className="text-xs text-danger mt-1" role="alert">{err.capacity}</p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">
                                                R$
                                            </span>
                                            <Input
                                                id={`sector-price-${i}`}
                                                aria-label={`Preço do setor ${i + 1}`}
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={row.priceCents}
                                                disabled={disabled}
                                                placeholder="0,00"
                                                aria-invalid={!!err.priceCents}
                                                onChange={(e) => update(i, "priceCents", e.target.value)}
                                                className={cn("pl-8 font-mono", err.priceCents && "border-danger")}
                                            />
                                        </div>
                                        {row.priceCents !== "" && preview >= 0 && (
                                            <p className="text-xs text-neutral-400 font-mono mt-1" aria-live="polite">
                                                {formatBRL(preview)}
                                            </p>
                                        )}
                                        {err.priceCents && (
                                            <p className="text-xs text-danger mt-1" role="alert">{err.priceCents}</p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {rows.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => remove(i)}
                                                disabled={disabled}
                                                className="text-neutral-400 hover:text-danger transition-colors disabled:opacity-50"
                                                aria-label={`Remover setor ${i + 1}`}
                                            >
                                                <Trash2 size={14} aria-hidden="true" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <button
                type="button"
                onClick={add}
                disabled={disabled || rows.length >= 20}
                className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Plus size={14} aria-hidden="true" />
                Adicionar setor
            </button>
        </div>
    );
}

function ReadonlyTable({ rows }: Omit<ReadonlySectorsTableProps, "mode">) {
    return (
        <div className="rounded border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm" aria-label="Setores do evento">
                <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                            Setor
                        </th>
                        <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">
                            Preço
                        </th>
                        <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">
                            Vendidos / Cap.
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id} className="border-b border-neutral-100 last:border-0">
                            <td className="px-3 py-2 text-neutral-800">{row.name}</td>
                            <td className="px-3 py-2 text-right font-mono text-neutral-700">
                                {formatBRL(row.priceCents)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-neutral-600">
                                {row.sold} / {row.capacity}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function EventSectorsTable(props: EventSectorsTableProps) {
    if (props.mode === "view") {
        return <ReadonlyTable rows={props.rows} />;
    }
    return (
        <EditableTable
            rows={props.rows}
            errors={props.errors}
            disabled={props.disabled}
            onChange={props.onChange}
        />
    );
}

export function validateSectors(rows: SectorRow[]): SectorRowError[] {
    return rows.map((row) => {
        const err: SectorRowError = {};
        if (!row.name.trim()) err.name = "Informe o nome do setor";
        else if (row.name.trim().length > 100) err.name = "Máximo 100 caracteres";

        const cap = parseInt(row.capacity, 10);
        if (!row.capacity) err.capacity = "Informe a capacidade";
        else if (isNaN(cap) || cap <= 0) err.capacity = "Capacidade deve ser maior que zero";

        if (row.priceCents === "") err.priceCents = "Informe o preço (0 para gratuito)";
        else {
            const cents = parsePriceToCents(row.priceCents);
            if (isNaN(cents) || cents < 0) err.priceCents = "Preço inválido";
        }
        return err;
    });
}

export function sectorsHaveErrors(errors: SectorRowError[]): boolean {
    return errors.some((e) => e.name || e.capacity || e.priceCents);
}