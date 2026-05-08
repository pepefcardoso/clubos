"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, WifiOff, RefreshCw, CheckCircle2, Circle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useChecklist } from "@/hooks/use-checklist";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function ProgressBar({
    value,
    max,
    label,
}: {
    value: number;
    max: number;
    label: string;
}) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div
            className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={value}
            aria-valuemax={max}
            aria-label={label}
        >
            <div
                className="h-full rounded-full bg-primary-400 transition-all duration-300"
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

interface ChecklistItemRowProps {
    id: string;
    item: string;
    completed: boolean;
    completedAt: string | null;
    onToggle: (itemId: string, completed: boolean) => void;
}

function ChecklistItemRow({
    id,
    item,
    completed,
    completedAt,
    onToggle,
}: ChecklistItemRowProps) {
    return (
        <li className="flex items-start gap-3 py-2.5 border-b border-neutral-100 last:border-0">
            <button
                type="button"
                onClick={() => onToggle(id, !completed)}
                className={cn(
                    "mt-0.5 flex-shrink-0 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
                    completed
                        ? "text-primary-500 hover:text-primary-600"
                        : "text-neutral-300 hover:text-primary-400",
                )}
                aria-label={`${item} — ${completed ? "Concluído" : "Pendente"}. Toque para alternar.`}
            >
                {completed ? (
                    <CheckCircle2 size={20} aria-hidden="true" />
                ) : (
                    <Circle size={20} aria-hidden="true" />
                )}
            </button>

            <div className="flex-1 min-w-0">
                <p
                    className={cn(
                        "text-[0.9375rem] text-neutral-800 leading-snug",
                        completed && "line-through text-neutral-400",
                    )}
                >
                    {item}
                </p>
                {completed && completedAt && (
                    <p className="text-xs text-neutral-400 mt-0.5">
                        {formatDateTime(completedAt)}
                    </p>
                )}
            </div>
        </li>
    );
}

interface CategoryGroupProps {
    category: string;
    categoryId: string;
    items: Array<{
        id: string;
        item: string;
        completed: boolean;
        completedAt: string | null;
    }>;
    onToggle: (itemId: string, completed: boolean) => void;
}

function CategoryGroup({ category, categoryId, items, onToggle }: CategoryGroupProps) {
    const done = items.filter((i) => i.completed).length;
    const total = items.length;

    return (
        <section
            role="group"
            aria-labelledby={categoryId}
            className="bg-white rounded-md border border-neutral-200 overflow-hidden"
        >
            <div className="px-4 pt-3 pb-2 border-b border-neutral-100 bg-neutral-50">
                <div className="flex items-center justify-between mb-1.5">
                    <h2
                        id={categoryId}
                        className="text-xs font-semibold text-neutral-500 uppercase tracking-wide"
                    >
                        {category}
                    </h2>
                    <span
                        className={cn(
                            "text-xs font-mono font-medium tabular-nums",
                            done === total ? "text-primary-600" : "text-neutral-400",
                        )}
                        aria-label={`${done} de ${total} itens concluídos`}
                    >
                        {done}/{total}
                    </span>
                </div>
                <ProgressBar
                    value={done}
                    max={total}
                    label={`Progresso ${category}: ${done} de ${total}`}
                />
            </div>

            <ul className="px-4" aria-label={`Itens de ${category}`}>
                {items.map((item) => (
                    <ChecklistItemRow
                        key={item.id}
                        id={item.id}
                        item={item.item}
                        completed={item.completed}
                        completedAt={item.completedAt}
                        onToggle={onToggle}
                    />
                ))}
            </ul>
        </section>
    );
}

function SkeletonCard() {
    return (
        <div className="bg-white rounded-md border border-neutral-200 p-4 space-y-3">
            <div className="h-3 w-24 bg-neutral-200 rounded animate-pulse" />
            <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3 items-center">
                        <div className="h-5 w-5 rounded-full bg-neutral-200 animate-pulse flex-shrink-0" />
                        <div
                            className="h-4 rounded bg-neutral-200 animate-pulse"
                            style={{ width: `${50 + (i * 17) % 40}%` }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

interface GameOpsChecklistProps {
    eventId: string;
}

export function GameOpsChecklist({ eventId }: GameOpsChecklistProps) {
    const { user } = useAuth();
    const { isOnline } = useNetworkStatus();
    const router = useRouter();

    const {
        isLoading,
        isError,
        errorMessage,
        byCategory,
        totalItems,
        completedItems,
        isSyncing,
        toggle,
        refetch,
    } = useChecklist(eventId);

    useEffect(() => {
        if (user && user.role !== "ADMIN") {
            router.replace("/events");
        }
    }, [user, router]);

    const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return (
        <div className="flex flex-col bg-neutral-50" style={{ minHeight: "calc(100dvh - 56px)" }}>
            <div className="px-4 pt-5 pb-3">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
                    aria-label="Voltar para eventos"
                >
                    <ArrowLeft size={15} aria-hidden="true" />
                    Voltar
                </button>

                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                            <ClipboardList
                                size={20}
                                className="text-primary-600 flex-shrink-0"
                                aria-hidden="true"
                            />
                            Checklist de Jogo
                        </h1>
                        <p className="text-sm text-neutral-500 mt-0.5 pl-7">
                            Gerencie as tarefas pré-jogo.
                        </p>
                    </div>

                    {!isLoading && !isError && totalItems > 0 && (
                        <div
                            className={cn(
                                "flex-shrink-0 rounded-full px-3 py-1 text-sm font-mono font-semibold tabular-nums",
                                completedItems === totalItems
                                    ? "bg-primary-50 text-primary-700"
                                    : "bg-neutral-100 text-neutral-600",
                            )}
                            aria-label={`${completedItems} de ${totalItems} itens concluídos`}
                        >
                            {completedItems}/{totalItems}
                        </div>
                    )}
                </div>

                {!isLoading && !isError && totalItems > 0 && (
                    <div className="mt-3 pl-7">
                        <ProgressBar
                            value={completedItems}
                            max={totalItems}
                            label={`Progresso geral: ${pct}% concluído`}
                        />
                        <p className="text-[0.6875rem] text-neutral-400 mt-1 text-right tabular-nums">
                            {pct}% concluído
                        </p>
                    </div>
                )}
            </div>

            {!isOnline && (
                <div
                    role="alert"
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-y border-amber-200 text-amber-700 text-xs font-medium"
                >
                    <WifiOff size={13} aria-hidden="true" />
                    Sem conexão — as alterações serão sincronizadas ao reconectar.
                </div>
            )}

            {isSyncing && isOnline && (
                <div
                    role="status"
                    className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-y border-primary-100 text-primary-600 text-xs font-medium"
                >
                    <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                    Sincronizando alterações offline…
                </div>
            )}

            <div className="flex-1 px-4 pb-6 space-y-3 mt-2">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
                ) : isError ? (
                    <div
                        role="alert"
                        className="flex flex-col items-center gap-3 py-16 text-center"
                    >
                        <ClipboardList size={48} className="text-neutral-300" aria-hidden="true" />
                        <p className="font-medium text-neutral-600">
                            {errorMessage ?? "Não foi possível carregar o checklist."}
                        </p>
                        <Button variant="secondary" size="sm" onClick={refetch}>
                            Tentar novamente
                        </Button>
                    </div>
                ) : Object.keys(byCategory).length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <ClipboardList size={48} className="text-neutral-300" aria-hidden="true" />
                        <p className="font-medium text-neutral-600">Nenhum item no checklist</p>
                        <p className="text-sm text-neutral-500">
                            O checklist será gerado automaticamente ao criar o evento.
                        </p>
                    </div>
                ) : (
                    Object.entries(byCategory).map(([category, items]) => {
                        const categoryId = `category-${category.toLowerCase().replace(/\s+/g, "-")}`;
                        return (
                            <CategoryGroup
                                key={category}
                                category={category}
                                categoryId={categoryId}
                                items={items}
                                onToggle={toggle}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
}