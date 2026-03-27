"use client";

import { Input } from "@/components/ui/input";
import { EXPENSE_CATEGORIES, CATEGORY_LABELS, type ExpenseCategory } from "@/lib/api/expenses";

type CategoryFilter = ExpenseCategory | "";

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
    { value: "", label: "Todas as categorias" },
    ...EXPENSE_CATEGORIES.map((c) => ({ value: c as CategoryFilter, label: CATEGORY_LABELS[c] })),
];

interface ExpensesFiltersProps {
    month: string;
    category: CategoryFilter;
    onMonthChange: (v: string) => void;
    onCategoryChange: (v: CategoryFilter) => void;
}

export function ExpensesFilters({
    month,
    category,
    onMonthChange,
    onCategoryChange,
}: ExpensesFiltersProps) {
    return (
        <div className="flex flex-wrap gap-3 items-center">
            <Input
                type="month"
                value={month}
                onChange={(e) => onMonthChange(e.target.value)}
                className="w-44"
                aria-label="Filtrar por mês"
            />
            <select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value as CategoryFilter)}
                className="h-9 w-52 rounded border border-neutral-300 bg-white px-3 py-1
          text-[0.9375rem] text-neutral-900 transition-colors
          focus-visible:outline-none focus-visible:border-primary-500
          focus-visible:ring-2 focus-visible:ring-primary-500/20
          disabled:cursor-not-allowed disabled:bg-neutral-50"
                aria-label="Filtrar por categoria"
            >
                {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}