"use client";

import { Download } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface ColumnInfo {
    name: string;
    required: boolean;
    format: string;
}

const COLUMNS: ColumnInfo[] = [
    { name: "nome", required: true, format: "2–120 caracteres" },
    { name: "cpf", required: true, format: "11 dígitos (com ou sem máscara)" },
    { name: "telefone", required: true, format: "10–11 dígitos (com ou sem máscara)" },
    { name: "email", required: false, format: "Formato válido de e-mail" },
    { name: "plano_id", required: false, format: "ID do plano cadastrado no sistema" },
    { name: "data_entrada", required: false, format: "YYYY-MM-DD ou DD/MM/YYYY" },
];

export function CsvTemplateDownload() {
    return (
        <div className="space-y-4">
            <a
                href={`${API_URL}/api/members/import/template`}
                download="template-socios.csv"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2 transition-colors"
                aria-label="Baixar template CSV para importação de sócios"
            >
                <Download size={15} aria-hidden="true" />
                Baixar template CSV
            </a>

            <details className="group">
                <summary className="cursor-pointer list-none text-sm text-neutral-500 hover:text-neutral-700 transition-colors select-none">
                    <span className="inline-flex items-center gap-1">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-transform group-open:rotate-90"
                            aria-hidden="true"
                        >
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        Ver colunas esperadas
                    </span>
                </summary>

                <div className="mt-3 rounded-md border border-neutral-200 overflow-hidden">
                    <table
                        className="w-full text-xs"
                        aria-label="Descrição das colunas do CSV de importação"
                    >
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                <th
                                    scope="col"
                                    className="px-3 py-2 text-left font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Coluna
                                </th>
                                <th
                                    scope="col"
                                    className="px-3 py-2 text-left font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Obrigatório
                                </th>
                                <th
                                    scope="col"
                                    className="px-3 py-2 text-left font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Formato aceito
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {COLUMNS.map((col, index) => (
                                <tr
                                    key={col.name}
                                    className={
                                        index < COLUMNS.length - 1
                                            ? "border-b border-neutral-100"
                                            : ""
                                    }
                                >
                                    <td className="px-3 py-2 font-mono font-medium text-neutral-800">
                                        {col.name}
                                    </td>
                                    <td className="px-3 py-2">
                                        {col.required ? (
                                            <span
                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-50 text-primary-700"
                                                aria-label="Obrigatório"
                                            >
                                                Sim
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-500"
                                                aria-label="Opcional"
                                            >
                                                Não
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-neutral-600">{col.format}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}