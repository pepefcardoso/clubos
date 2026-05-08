"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Trash2, Plus, X, ShoppingBag, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface PosProductResponse {
    id: string;
    name: string;
    priceCents: number;
    category: string | null;
    stock: number | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface PosProductsListResponse {
    data: PosProductResponse[];
    total: number;
}

const FormSchema = z.object({
    name: z.string().min(1, "Nome obrigatório").max(200),
    priceDisplay: z
        .string()
        .min(1, "Preço obrigatório")
        .refine((v) => !isNaN(parseFloat(v.replace(",", "."))), {
            message: "Preço inválido",
        }),
    category: z.string().max(80).optional(),
    stock: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

function toCents(displayValue: string): number {
    const normalized = displayValue.replace(",", ".");
    return Math.round(parseFloat(normalized) * 100);
}

function toCentsDisplay(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
}

async function fetchPosProducts(
    clubId: string,
    token: string,
): Promise<PosProductsListResponse> {
    const res = await fetch(`${API_BASE}/api/clubs/${clubId}/pos-products`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Erro ao carregar produtos.");
    }
    return res.json() as Promise<PosProductsListResponse>;
}

async function createPosProduct(
    clubId: string,
    payload: Record<string, unknown>,
    token: string,
): Promise<PosProductResponse> {
    const res = await fetch(`${API_BASE}/api/clubs/${clubId}/pos-products`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Erro ao criar produto.");
    }
    return res.json() as Promise<PosProductResponse>;
}

async function updatePosProduct(
    clubId: string,
    productId: string,
    payload: Record<string, unknown>,
    token: string,
): Promise<PosProductResponse> {
    const res = await fetch(
        `${API_BASE}/api/clubs/${clubId}/pos-products/${productId}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify(payload),
        },
    );
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Erro ao atualizar produto.");
    }
    return res.json() as Promise<PosProductResponse>;
}

async function deletePosProduct(
    clubId: string,
    productId: string,
    token: string,
): Promise<void> {
    const res = await fetch(
        `${API_BASE}/api/clubs/${clubId}/pos-products/${productId}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
        },
    );
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Erro ao remover produto.");
    }
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${55 + ((i * 5 + j * 9) % 35)}%` }}
                            />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

function EmptyState({ onNew }: { onNew: () => void }) {
    return (
        <tr>
            <td colSpan={6}>
                <div className="py-16 text-center">
                    <ShoppingBag size={48} className="mx-auto text-neutral-300 mb-3" aria-hidden="true" />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">Nenhum produto cadastrado</p>
                    <p className="text-neutral-400 text-sm mt-1 mb-4">
                        Cadastre produtos para usar no ponto de venda.
                    </p>
                    <Button onClick={onNew} size="sm">
                        <Plus size={14} aria-hidden="true" />
                        Novo produto
                    </Button>
                </div>
            </td>
        </tr>
    );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                isActive
                    ? "bg-primary-50 text-primary-700"
                    : "bg-neutral-100 text-neutral-500",
            )}
        >
            {isActive ? "Ativo" : "Inativo"}
        </span>
    );
}

interface ProductFormModalProps {
    editTarget: PosProductResponse | null;
    onClose: () => void;
    onSubmit: (values: FormValues) => void;
    isPending: boolean;
}

function ProductFormModal({ editTarget, onClose, onSubmit, isPending }: ProductFormModalProps) {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: editTarget
            ? {
                name: editTarget.name,
                priceDisplay: toCentsDisplay(editTarget.priceCents),
                category: editTarget.category ?? "",
                stock: editTarget.stock?.toString() ?? "",
            }
            : { name: "", priceDisplay: "", category: "", stock: "" },
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2 id="product-modal-title" className="text-lg font-semibold text-neutral-900">
                        {editTarget ? "Editar produto" : "Novo produto"}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar modal"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="px-6 py-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="prod-name">
                                Nome <span className="text-danger" aria-hidden="true">*</span>
                            </Label>
                            <Input
                                id="prod-name"
                                {...register("name")}
                                disabled={isPending}
                                aria-invalid={!!errors.name}
                            />
                            {errors.name && (
                                <p className="text-sm text-danger" role="alert">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="prod-price">
                                Preço (R$) <span className="text-danger" aria-hidden="true">*</span>
                            </Label>
                            <div className="relative max-w-sm">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">
                                    R$
                                </span>
                                <Input
                                    id="prod-price"
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    className="pl-9 font-mono"
                                    {...register("priceDisplay")}
                                    disabled={isPending}
                                    aria-invalid={!!errors.priceDisplay}
                                />
                            </div>
                            {errors.priceDisplay && (
                                <p className="text-sm text-danger" role="alert">{errors.priceDisplay.message}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="prod-category">Categoria (opcional)</Label>
                            <Input
                                id="prod-category"
                                {...register("category")}
                                disabled={isPending}
                                className="max-w-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="prod-stock">Estoque (opcional)</Label>
                            <Input
                                id="prod-stock"
                                type="number"
                                min={0}
                                {...register("stock")}
                                disabled={isPending}
                                className="max-w-sm font-mono"
                            />
                            {errors.stock && (
                                <p className="text-sm text-danger" role="alert">{errors.stock.message}</p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? (
                                <span className="flex items-center gap-2">
                                    <Spinner />
                                    Salvando…
                                </span>
                            ) : (
                                "Salvar"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface DeleteProductDialogProps {
    product: PosProductResponse;
    onClose: () => void;
    onConfirm: () => void;
    isPending: boolean;
}

function DeleteProductDialog({ product, onClose, onConfirm, isPending }: DeleteProductDialogProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
            aria-describedby="delete-product-desc"
        >
            <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-danger flex-shrink-0" aria-hidden="true" />
                        <h2 id="delete-product-title" className="text-base font-semibold text-neutral-900">
                            Remover produto
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-6 py-5">
                    <p id="delete-product-desc" className="text-[0.9375rem] text-neutral-700">
                        Remover{" "}
                        <strong className="font-semibold text-neutral-900">{product.name}</strong>?
                        O produto será desativado e não aparecerá mais no PDV. Vendas anteriores não
                        serão afetadas.
                    </p>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button type="button" variant="danger" onClick={onConfirm} disabled={isPending}>
                        {isPending ? (
                            <span className="flex items-center gap-2">
                                <Spinner />
                                Removendo…
                            </span>
                        ) : (
                            "Remover produto"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function PosProductsPage() {
    const { user, getAccessToken } = useAuth();

    if (user?.role !== "ADMIN") {
        redirect("/dashboard");
    }

    const clubId = user.clubId;
    const queryClient = useQueryClient();
    const { toasts, pushSuccess, pushError } = useToasts();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<PosProductResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<PosProductResponse | null>(null);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["pos-products", clubId],
        queryFn: async () => {
            const token = await getAccessToken();
            if (!token) throw new Error("Não autenticado");
            return fetchPosProducts(clubId, token);
        },
    });

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ["pos-products", clubId] });

    const createMutation = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => {
            const token = await getAccessToken();
            if (!token) throw new Error("Não autenticado");
            return createPosProduct(clubId, payload, token);
        },
        onSuccess: () => {
            pushSuccess("Produto criado com sucesso.");
            invalidate();
            setDialogOpen(false);
        },
        onError: (err: Error) => {
            pushError(err.message);
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({
            productId,
            payload,
        }: {
            productId: string;
            payload: Record<string, unknown>;
        }) => {
            const token = await getAccessToken();
            if (!token) throw new Error("Não autenticado");
            return updatePosProduct(clubId, productId, payload, token);
        },
        onSuccess: () => {
            pushSuccess("Produto atualizado com sucesso.");
            invalidate();
            setDialogOpen(false);
        },
        onError: (err: Error) => {
            pushError(err.message);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (productId: string) => {
            const token = await getAccessToken();
            if (!token) throw new Error("Não autenticado");
            return deletePosProduct(clubId, productId, token);
        },
        onSuccess: () => {
            pushSuccess("Produto removido.");
            invalidate();
            setDeleteTarget(null);
        },
        onError: (err: Error) => {
            pushError(err.message);
            setDeleteTarget(null);
        },
    });

    function openCreate() {
        setEditTarget(null);
        setDialogOpen(true);
    }

    function openEdit(product: PosProductResponse) {
        setEditTarget(product);
        setDialogOpen(true);
    }

    function handleFormSubmit(values: FormValues) {
        const stockValue = values.stock === "" || values.stock === undefined
            ? undefined
            : parseInt(values.stock, 10);

        const payload: Record<string, unknown> = {
            name: values.name,
            priceCents: toCents(values.priceDisplay),
            category: values.category || undefined,
            stock: Number.isNaN(stockValue) ? undefined : stockValue,
        };

        if (editTarget) {
            updateMutation.mutate({ productId: editTarget.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                        Catálogo de Produtos — PDV
                    </h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Gerencie os produtos disponíveis no ponto de venda.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus size={16} aria-hidden="true" />
                    Novo produto
                </Button>
            </div>

            {isError && (
                <div
                    role="alert"
                    className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3"
                >
                    <p className="text-sm text-red-700">
                        Erro ao carregar produtos. Verifique sua conexão e tente novamente.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => refetch()}>
                        Tentar novamente
                    </Button>
                </div>
            )}

            <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Lista de produtos do PDV">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                {["Nome", "Categoria", "Status"].map((h) => (
                                    <th
                                        key={h}
                                        scope="col"
                                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                    >
                                        {h}
                                    </th>
                                ))}
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Preço
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Estoque
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Ações
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <SkeletonRows />
                            ) : !data || data.data.length === 0 ? (
                                <EmptyState onNew={openCreate} />
                            ) : (
                                data.data.map((product) => (
                                    <tr
                                        key={product.id}
                                        className={cn(
                                            "border-b border-neutral-100 hover:bg-neutral-50 transition-colors",
                                            !product.isActive && "opacity-60",
                                        )}
                                    >
                                        <td className="px-4 py-3 font-medium text-neutral-900">
                                            {product.name}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">
                                            {product.category ?? <span className="text-neutral-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <ActiveBadge isActive={product.isActive} />
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-neutral-700">
                                            {formatBRL(product.priceCents)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-neutral-600">
                                            {product.stock ?? <span className="text-neutral-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(product)}
                                                    className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                                                    aria-label={`Editar ${product.name}`}
                                                >
                                                    <Pencil size={15} aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteTarget(product)}
                                                    className="p-1.5 text-neutral-400 hover:text-danger transition-colors rounded"
                                                    aria-label={`Remover ${product.name}`}
                                                >
                                                    <Trash2 size={15} aria-hidden="true" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {dialogOpen && (
                <ProductFormModal
                    key={editTarget?.id ?? "new"}
                    editTarget={editTarget}
                    onClose={() => setDialogOpen(false)}
                    onSubmit={handleFormSubmit}
                    isPending={isPending}
                />
            )}

            {deleteTarget !== null && (
                <DeleteProductDialog
                    product={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
                    isPending={deleteMutation.isPending}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}