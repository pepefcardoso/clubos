"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AuthApiError } from "@/lib/auth";

const loginSchema = z.object({
    email: z.string().email("Informe um e-mail válido"),
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
                setServerError("E-mail ou senha inválidos. Verifique suas credenciais.");
            } else {
                setServerError("Erro de conexão. Tente novamente em instantes.");
            }
        }
    }

    return (
        <div className="w-full max-w-sm">
            <div
                style={{
                    background: "white",
                    border: "1px solid #e8e6e0",
                    borderRadius: "12px",
                    boxShadow:
                        "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)",
                    padding: "40px 36px",
                }}
            >
                <div style={{ marginBottom: "32px", textAlign: "center" }}>
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "52px",
                            height: "52px",
                            borderRadius: "12px",
                            background: "#2d7d2d",
                            marginBottom: "16px",
                        }}
                    >
                        <ShieldCheck size={28} color="white" strokeWidth={1.75} />
                    </div>
                    <h1
                        style={{
                            fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
                            fontSize: "1.375rem",
                            fontWeight: 700,
                            color: "#171410",
                            letterSpacing: "-0.02em",
                            marginBottom: "4px",
                        }}
                    >
                        ClubOS
                    </h1>
                    <p
                        style={{
                            fontSize: "0.875rem",
                            color: "#78746a",
                        }}
                    >
                        Entre com suas credenciais para continuar
                    </p>
                </div>

                {serverError && (
                    <div
                        role="alert"
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: "8px",
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            marginBottom: "20px",
                        }}
                    >
                        <span style={{ fontSize: "0.8rem", color: "#b91c1c", lineHeight: "1.5" }}>
                            {serverError}
                        </span>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label
                            htmlFor="email"
                            style={{
                                fontSize: "0.8125rem",
                                fontWeight: 500,
                                color: "#3d3a33",
                            }}
                        >
                            E-mail <span style={{ color: "#c0392b" }}>*</span>
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="tesoureiro@clube.com"
                            disabled={isSubmitting}
                            aria-invalid={!!errors.email}
                            aria-describedby={errors.email ? "email-error" : undefined}
                            {...register("email")}
                            style={{
                                height: "40px",
                                padding: "0 12px",
                                borderRadius: "6px",
                                border: errors.email ? "1.5px solid #c0392b" : "1px solid #d1cec6",
                                fontSize: "0.9375rem",
                                color: "#171410",
                                background: isSubmitting ? "#fafaf8" : "white",
                                outline: "none",
                                transition: "border-color 0.15s",
                                fontFamily: "inherit",
                            }}
                            onFocus={(e) => {
                                if (!errors.email) e.currentTarget.style.borderColor = "#2d7d2d";
                            }}
                            onBlur={(e) => {
                                if (!errors.email) e.currentTarget.style.borderColor = "#d1cec6";
                            }}
                        />
                        {errors.email && (
                            <span
                                id="email-error"
                                role="alert"
                                style={{ fontSize: "0.8rem", color: "#c0392b" }}
                            >
                                {errors.email.message}
                            </span>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label
                            htmlFor="password"
                            style={{
                                fontSize: "0.8125rem",
                                fontWeight: 500,
                                color: "#3d3a33",
                            }}
                        >
                            Senha <span style={{ color: "#c0392b" }}>*</span>
                        </label>
                        <div style={{ position: "relative" }}>
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                disabled={isSubmitting}
                                aria-invalid={!!errors.password}
                                aria-describedby={errors.password ? "password-error" : undefined}
                                {...register("password")}
                                style={{
                                    width: "100%",
                                    height: "40px",
                                    padding: "0 40px 0 12px",
                                    borderRadius: "6px",
                                    border: errors.password ? "1.5px solid #c0392b" : "1px solid #d1cec6",
                                    fontSize: "0.9375rem",
                                    color: "#171410",
                                    background: isSubmitting ? "#fafaf8" : "white",
                                    outline: "none",
                                    transition: "border-color 0.15s",
                                    fontFamily: "inherit",
                                    boxSizing: "border-box",
                                }}
                                onFocus={(e) => {
                                    if (!errors.password) e.currentTarget.style.borderColor = "#2d7d2d";
                                }}
                                onBlur={(e) => {
                                    if (!errors.password) e.currentTarget.style.borderColor = "#d1cec6";
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                disabled={isSubmitting}
                                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                                style={{
                                    position: "absolute",
                                    right: "10px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "#78746a",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0",
                                }}
                            >
                                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                        </div>
                        {errors.password && (
                            <span
                                id="password-error"
                                role="alert"
                                style={{ fontSize: "0.8rem", color: "#c0392b" }}
                            >
                                {errors.password.message}
                            </span>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            height: "40px",
                            borderRadius: "6px",
                            background: isSubmitting ? "#4d9e4d" : "#2d7d2d",
                            color: "white",
                            fontSize: "0.9375rem",
                            fontWeight: 600,
                            border: "none",
                            cursor: isSubmitting ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            transition: "background 0.15s",
                            fontFamily: "inherit",
                            marginTop: "4px",
                        }}
                        onMouseEnter={(e) => {
                            if (!isSubmitting) e.currentTarget.style.background = "#236023";
                        }}
                        onMouseLeave={(e) => {
                            if (!isSubmitting) e.currentTarget.style.background = "#2d7d2d";
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
                                Entrando…
                            </>
                        ) : (
                            "Entrar"
                        )}
                    </button>
                </form>
            </div>

            <p
                style={{
                    textAlign: "center",
                    fontSize: "0.75rem",
                    color: "#a8a49a",
                    marginTop: "20px",
                }}
            >
                Acesso restrito. Em caso de problemas, contate o administrador do clube.
            </p>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}