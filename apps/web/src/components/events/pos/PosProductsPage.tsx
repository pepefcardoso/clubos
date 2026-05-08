"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { redirect } from "next/navigation";

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

const FormSchema = z.object({
    name: z.string().min(1, "Nome obrigatório").max(200),
    priceDisplay: z
        .string()
        .min(1, "Preço obrigatório")
        .refine((v) => !isNaN(parseFloat(v.replace(",", "."))), {
            message: "Preço inválido",
        }),
    category: z.string().max(80).optional(),
    stock: z
        .string()
        .optional()
        .transform((v) => (v === "" || v === undefined ? undefined : parseInt(v, 10)))
        .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), {
            message: "Estoque deve ser um número inteiro positivo",
        }),
});

type FormValues = z.input<typeof FormSchema>;

function toCents(displayValue: string): number {
    const normalized = displayValue.replace(",", ".");
    return Math.round(parseFloat(normalized) * 100);
}

function toCentsDisplay(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
}

export default function PosProductsPage() {
    const { user } = useAuth();

    if (user?.role !== "ADMIN") {
        redirect("/dashboard");
    }

    const clubId = user.clubId;
    const queryClient = useQueryClient();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<PosProductResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<PosProductResponse | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["pos-products", clubId],
        queryFn: () =>
            api
                .get<{ data: PosProductResponse[]; total: number }>(
                    `/clubs/${clubId}/pos-products`,
                )
                .then((r) => r.data),
    });

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ["pos-products", clubId] });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) =>
            api.post(`/clubs/${clubId}/pos-products`, payload),
        onSuccess: () => {
            toast({ title: "Produto criado com sucesso." });
            invalidate();
            setDialogOpen(false);
        },
        onError: (err: { response?: { data?: { message?: string } } }) => {
            toast({
                variant: "destructive",
                title: err.response?.data?.message ?? "Erro ao criar produto.",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({
            productId,
            payload,
        }: {
            productId: string;
            payload: Record<string, unknown>;
        }) => api.put(`/clubs/${clubId}/pos-products/${productId}`, payload),
        onSuccess: () => {
            toast({ title: "Produto atualizado com sucesso." });
            invalidate();
            setDialogOpen(false);
        },
        onError: (err: { response?: { data?: { message?: string } } }) => {
            toast({
                variant: "destructive",
                title: err.response?.data?.message ?? "Erro ao atualizar produto.",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (productId: string) =>
            api.delete(`/clubs/${clubId}/pos-products/${productId}`),
        onSuccess: () => {
            toast({ title: "Produto removido." });
            invalidate();
            setDeleteTarget(null);
        },
        onError: () => {
            toast({ variant: "destructive", title: "Erro ao remover produto." });
        },
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
    });

    function openCreate() {
        setEditTarget(null);
        reset({ name: "", priceDisplay: "", category: "", stock: "" });
        setDialogOpen(true);
    }

    function openEdit(product: PosProductResponse) {
        setEditTarget(product);
        reset({
            name: product.name,
            priceDisplay: toCentsDisplay(product.priceCents),
            category: product.category ?? "",
            stock: product.stock?.toString() ?? "",
        });
        setDialogOpen(true);
    }

    function onSubmit(values: FormValues) {
        const payload = {
            name: values.name,
            priceCents: toCents(values.priceDisplay),
            category: values.category || undefined,
            stock: values.stock,
        };

        if (editTarget) {
            updateMutation.mutate({ productId: editTarget.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Catálogo de Produtos — PDV</h1>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Novo produto
                </Button>
            </div>

            {isLoading ? (
                <p className="text-muted-foreground text-sm">Carregando produtos…</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Preço</TableHead>
                            <TableHead className="text-right">Estoque</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[80px]" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data?.data.map((product) => (
                            <TableRow key={product.id}>
                                <TableCell>{product.name}</TableCell>
                                <TableCell>{product.category ?? "—"}</TableCell>
                                <TableCell className="text-right font-mono">
                                    {formatBRL(product.priceCents)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {product.stock ?? "—"}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={product.isActive ? "default" : "secondary"}>
                                        {product.isActive ? "Ativo" : "Inativo"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Editar ${product.name}`}
                                            onClick={() => openEdit(product)}
                                        >
                                            <Pencil className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Excluir ${product.name}`}
                                            onClick={() => setDeleteTarget(product)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}

                        {data?.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                    Nenhum produto cadastrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editTarget ? "Editar produto" : "Novo produto"}
                        </DialogTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-4"
                            aria-label="Fechar"
                            onClick={() => setDialogOpen(false)}
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                    </DialogHeader>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                        <div className="space-y-1">
                            <Label htmlFor="name">Nome</Label>
                            <Input id="name" {...register("name")} />
                            {errors.name && (
                                <p className="text-sm text-destructive">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="priceDisplay">Preço (R$)</Label>
                            <Input
                                id="priceDisplay"
                                inputMode="decimal"
                                placeholder="0,00"
                                {...register("priceDisplay")}
                            />
                            {errors.priceDisplay && (
                                <p className="text-sm text-destructive">{errors.priceDisplay.message}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="category">Categoria (opcional)</Label>
                            <Input id="category" {...register("category")} />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="stock">Estoque (opcional)</Label>
                            <Input id="stock" type="number" min={0} {...register("stock")} />
                            {errors.stock && (
                                <p className="text-sm text-destructive">{errors.stock.message}</p>
                            )}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? "Salvando…" : "Salvar"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover produto</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja remover{" "}
                            <strong>{deleteTarget?.name}</strong>? O produto será
                            desativado e não aparecerá mais no PDV. Vendas anteriores não
                            serão afetadas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() =>
                                deleteTarget && deleteMutation.mutate(deleteTarget.id)
                            }
                        >
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}