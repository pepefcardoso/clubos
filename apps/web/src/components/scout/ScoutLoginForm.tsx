"use client";

import { useState, useId } from "react";
import { useScoutAuthContext, ScoutAuthApiError } from "@/contexts/scout-auth.context";

export function ScoutLoginForm() {
    const { login } = useScoutAuthContext();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const emailId = useId();
    const passwordId = useId();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            await login(email, password);
        } catch (err) {
            setError(
                err instanceof ScoutAuthApiError
                    ? err.message
                    : "Não foi possível autenticar. Tente novamente.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-1">
                <label
                    htmlFor={emailId}
                    className="block text-sm font-medium text-neutral-700"
                >
                    E-mail <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    required
                    aria-required="true"
                    aria-invalid={!!error}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full max-w-sm rounded border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
                />
            </div>

            <div className="space-y-1">
                <label
                    htmlFor={passwordId}
                    className="block text-sm font-medium text-neutral-700"
                >
                    Senha <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <input
                    id={passwordId}
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-required="true"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full max-w-sm rounded border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
                />
            </div>

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="h-9 w-full max-w-sm rounded bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
                {isLoading ? "Entrando…" : "Entrar"}
            </button>
        </form>
    );
}