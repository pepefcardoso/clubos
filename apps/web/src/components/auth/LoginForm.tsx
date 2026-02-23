"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AuthApiError } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const loginSchema = z.object({
    email: z.email("Informe um e-mail válido"),
    password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

type LoginFields = z.infer<typeof loginSchema>;

export function LoginForm() {
    const { login } = useAuth();
    const [showPassword, setShowPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginFields>({
        resolver: zodResolver(loginSchema),
        mode: "onBlur",
    });

    async function onSubmit(data: LoginFields) {
        setServerError(null);
        try {
            await login(data.email, data.password);
        } catch (err) {
            if (err instanceof AuthApiError && err.statusCode === 401) {
                setServerError(
                    "E-mail ou senha inválidos. Verifique suas credenciais.",
                );
            } else {
                setServerError("Erro de conexão. Tente novamente em instantes.");
            }
        }
    }

    return (
        <div className="w-full max-w-sm">
            <Card>
                <CardHeader className="items-center pb-6 text-center">
                    <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-primary-500">
                        <ShieldCheck size={28} className="text-white" strokeWidth={1.75} />
                    </div>
                    <CardTitle>ClubOS</CardTitle>
                    <CardDescription>
                        Entre com suas credenciais para continuar
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {serverError && (
                        <div
                            role="alert"
                            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                        >
                            {serverError}
                        </div>
                    )}

                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        noValidate
                        className="space-y-5"
                    >
                        <div className="space-y-1.5">
                            <Label htmlFor="email">
                                E-mail{" "}
                                <span className="text-danger" aria-hidden="true">
                                    *
                                </span>
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="tesoureiro@clube.com"
                                disabled={isSubmitting}
                                aria-invalid={!!errors.email}
                                aria-describedby={errors.email ? "email-error" : undefined}
                                aria-required="true"
                                {...register("email")}
                            />
                            {errors.email && (
                                <p
                                    id="email-error"
                                    role="alert"
                                    className="text-sm text-danger"
                                >
                                    {errors.email.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password">
                                Senha{" "}
                                <span className="text-danger" aria-hidden="true">
                                    *
                                </span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    disabled={isSubmitting}
                                    aria-invalid={!!errors.password}
                                    aria-describedby={
                                        errors.password ? "password-error" : undefined
                                    }
                                    aria-required="true"
                                    className={cn("pr-10", errors.password && "border-danger")}
                                    {...register("password")}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    disabled={isSubmitting}
                                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 disabled:opacity-50"
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                            {errors.password && (
                                <p
                                    id="password-error"
                                    role="alert"
                                    className="text-sm text-danger"
                                >
                                    {errors.password.message}
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="mt-1 w-full"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Entrando…
                                </>
                            ) : (
                                "Entrar"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <p className="mt-5 text-center text-xs text-neutral-400">
                Acesso restrito. Em caso de problemas, contate o administrador do clube.
            </p>
        </div>
    );
}