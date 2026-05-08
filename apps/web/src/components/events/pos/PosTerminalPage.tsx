"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Store,
    WifiOff,
    RefreshCw,
    AlertCircle,
    ShoppingBag,
    CheckCircle2,
    Clock,
    XCircle,
    Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { usePosTerminal, type PosProductItem } from "@/hooks/use-pos-terminal";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PosQueueEntry } from "@/lib/db/types";

function SyncBadge({ status }: { status: PosQueueEntry["syncStatus"] }) {
    const map: Record
    PosQueueEntry["syncStatus"],
        { icon: React.ReactNode; label: string; className: string }
        > = {
        pending: {
            icon: <Clock size={11} aria-hidden="true" />,
                label: "Pendente",
                    className: "bg-amber-50 text-amber-700",
    },
        syncing: {
            icon: <Loader2 size={11} className="animate-spin" aria-hidden="true" />,
                label: "Sincronizando",
                    className: "bg-primary-50 text-primary-700",
    },
        synced: {
            icon: <CheckCircle2 size={11} aria-hidden="true" />,
                label: "Sincronizado",
                    className: "bg-primary-50 text-primary-700",
    },
        error: {
            icon: <XCircle size={11} aria-hidden="true" />,
                label: "Erro",
                    className: "bg-red-50 text-red-700",
    },
    };

    const { icon, label, className } = map[status];

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                className,
            )}
        >
            {icon}
            {label}
        </span>
    );
}

function ProductCard({
    product,
    onSelect,
}: {
    product: PosProductItem;
    onSelect: (p: PosProductItem) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onSelect(product)}
            className="flex flex-col items-start gap-1.5 rounded-md border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-primary-400 hover:bg-primary-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            aria-label={`Selecionar ${product.name} — ${formatBRL(product.priceCents)}`}
        >
            {product.category && (
                <span className="text-xs text-neutral-400">{product.category}</span>
            )}
            <span className="text-[0.9375rem] font-semibold text-neutral-900 leading-snug">
                {product.name}
            </span>
            <span className="font-mono text-base font-bold text-primary-600">
                {formatBRL(product.priceCents)}
            </span>
            {product.stock !== null && (
                <span className="text-xs text-neutral-400 font-mono">
                    Estoque: {product.stock}
                </span>
            )}
        </button>
    );
}

function ConfirmSheet({
    product,
    onConfirm,
    onCancel,
    isPending,
}: {
    product: PosProductItem;
    onConfirm: (method: "CARD" | "PIX") => void;
    onCancel: () => void;
    isPending: boolean;
}) {
    const [method, setMethod] = useState<"CARD" | "PIX">("PIX");

    return (
        <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white border-t border-neutral-200 shadow-lg px-5 pt-5 pb-8 space-y-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-sheet-title"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs text-neutral-400 mb-0.5">Produto selecionado</p>
                    <h2
                        id="confirm-sheet-title"
                        className="text-base font-semibold text-neutral-900"
                    >
                        {product.name}
                    </h2>
                    <p className="font-mono text-xl font-bold text-primary-600 mt-0.5">
                        {formatBRL(product.priceCents)}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isPending}
                    className="mt-1 text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
                    aria-label="Cancelar seleção"
                >
                    <XCircle size={20} aria-hidden="true" />
                </button>
            </div>

            <div className="space-y-1.5">
                <p className="text-sm font-medium text-neutral-700">Forma de pagamento</p>
                <div
                    className="flex rounded-md border border-neutral-200 overflow-hidden"
                    role="group"
                    aria-label="Selecionar forma de pagamento"
                >
                    {(["PIX", "CARD"] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMethod(m)}
                            className={cn(
                                "flex-1 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40",
                                method === m
                                    ? "bg-primary-500 text-white"
                                    : "bg-white text-neutral-600 hover:bg-neutral-50",
                            )}
                            aria-pressed={method === m}
                        >
                            {m === "PIX" ? "PIX" : "Cartão"}
                        </button>
                    ))}
                </div>
            </div>

            <Button
                className="w-full"
                disabled={isPending}
                onClick={() => onConfirm(method)}
            >
                {isPending ? (
                    <span className="flex items-center gap-2">
                        <Spinner />
                        Registrando…
                    </span>
                ) : (
                    "Registrar venda"
                )}
            </Button>
        </div>
    );
}

function SaleRow({ entry }: { entry: PosQueueEntry }) {
    return (
        <li className="flex items-center justify-between gap-3 py-2.5 border-b border-neutral-100 last:border-0">
            <div className="min-w-0">
                <p className="text-[0.9375rem] text-neutral-800 truncate">
                    {entry.productName}
                </p>
                <SyncBadge status={entry.syncStatus} />
            </div>
            <span className="font-mono text-sm font-semibold text-neutral-700 flex-shrink-0">
                {formatBRL(entry.amountCents)}
            </span>
        </li>
    );
}

interface PosTerminalPageProps {
    eventId: string;
}

export function PosTerminalPage({ eventId }: PosTerminalPageProps) {
    const { user } = useAuth();
    const { isOnline } = useNetworkStatus();
    const router = useRouter();

    const {
        products,
        productsLoading,
        entries,
        totalSalesCents,
        pendingCount,
        isSyncing,
        syncError,
        submit,
        flush,
    } = usePosTerminal(eventId);

    const [selected, setSelected] = useState<PosProductItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user && user.role !== "ADMIN" && user.role !== "TREASURER") {
            router.replace("/dashboard");
        }
    }, [user, router]);

    async function handleConfirm(method: "CARD" | "PIX") {
        if (!selected) return;
        setIsSubmitting(true);
        try {
            await submit(selected, method);
            setSelected(null);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex flex-col min-h-dvh bg-neutral-50">
            <header className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                        <Store size={16} className="text-white" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-white font-bold text-base leading-tight truncate">
                            PDV
                        </h1>
                        <p className="text-neutral-400 text-xs font-mono truncate">{eventId}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {!isOnline && (
                        <span
                            className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold"
                            role="status"
                            aria-live="polite"
                        >
                            <WifiOff size={13} aria-hidden />
                            Offline
                        </span>
                    )}
                    {isOnline && pendingCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={flush}
                            disabled={isSyncing}
                            className="text-xs text-primary-300 hover:text-white hover:bg-neutral-700 h-7 px-2"
                            aria-label={`Sincronizar ${pendingCount} venda${pendingCount !== 1 ? "s" : ""} pendente${pendingCount !== 1 ? "s" : ""}`}
                        >
                            {isSyncing ? <Spinner size={12} /> : <RefreshCw size={12} aria-hidden />}
                            {pendingCount}
                        </Button>
                    )}
                </div>
            </header>

            {syncError && (
                <div
                    role="alert"
                    className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b border-red-800 text-red-300 text-xs font-medium flex-shrink-0"
                >
                    <AlertCircle size={13} aria-hidden />
                    {syncError}
                </div>
            )}

            {!isOnline && (
                <div
                    role="status"
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium flex-shrink-0"
                >
                    <WifiOff size={13} aria-hidden />
                    Sem conexão — as vendas serão sincronizadas ao reconectar.
                </div>
            )}

            <div className="px-4 pt-4 pb-2 flex-shrink-0">
                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                    Produtos
                </h2>

                {productsLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-24 rounded-md bg-neutral-200 animate-pulse"
                                style={{ animationDelay: `${i * 80}ms` }}
                            />
                        ))}
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <ShoppingBag size={40} className="text-neutral-300" aria-hidden />
                        <p className="font-medium text-neutral-600 text-sm">
                            Nenhum produto ativo
                        </p>
                        <p className="text-xs text-neutral-400">
                            Cadastre produtos no catálogo do PDV para começar a vender.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {products.map((p) => (
                            <ProductCard key={p.id} product={p} onSelect={setSelected} />
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 px-4 pt-4 pb-8 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                        Vendas da sessão
                    </h2>
                    {entries.length > 0 && (
                        <span className="font-mono text-sm font-bold text-neutral-700">
                            {formatBRL(totalSalesCents)}
                        </span>
                    )}
                </div>

                {entries.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-6">
                        Nenhuma venda registrada ainda.
                    </p>
                ) : (
                    <ul className="bg-white rounded-md border border-neutral-200 px-4">
                        {entries.map((e) => (
                            <SaleRow key={e.localId} entry={e} />
                        ))}
                    </ul>
                )}
            </div>

            {selected && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/30"
                        onClick={() => !isSubmitting && setSelected(null)}
                        aria-hidden="true"
                    />
                    <ConfirmSheet
                        product={selected}
                        onConfirm={handleConfirm}
                        onCancel={() => setSelected(null)}
                        isPending={isSubmitting}
                    />
                </>
            )}
        </div>
    );
}