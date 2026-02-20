"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import {
    apiLogin,
    apiLogout,
    apiRefresh,
    AuthApiError,
    type AuthUser,
} from "@/lib/auth";

interface AuthState {
    accessToken: string | null;
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** Returns a fresh access token, refreshing via cookie if needed. */
    getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
    const router = useRouter();
    const [state, setState] = useState<AuthState>({
        accessToken: null,
        user: null,
        isLoading: true,
        isAuthenticated: false,
    });

    const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

    const setAuthenticated = useCallback((accessToken: string, user: AuthUser) => {
        setState({ accessToken, user, isLoading: false, isAuthenticated: true });
    }, []);

    const clearAuth = useCallback(() => {
        setState({ accessToken: null, user: null, isLoading: false, isAuthenticated: false });
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            try {
                const { accessToken } = await apiRefresh();
                if (cancelled) return;
                const user = decodeUserFromToken(accessToken);
                if (user) {
                    setAuthenticated(accessToken, user);
                } else {
                    clearAuth();
                }
            } catch {
                if (!cancelled) clearAuth();
            }
        }

        bootstrap();
        return () => {
            cancelled = true;
        };
    }, [setAuthenticated, clearAuth]);

    const login = useCallback(
        async (email: string, password: string) => {
            const { accessToken, user } = await apiLogin(email, password);
            setAuthenticated(accessToken, user);
            router.push("/dashboard");
        },
        [setAuthenticated, router],
    );

    const logout = useCallback(async () => {
        try {
            await apiLogout(state.accessToken ?? undefined);
        } catch {
            // best-effort
        }
        clearAuth();
        router.push("/login");
    }, [state.accessToken, clearAuth, router]);

    const refresh = useCallback(async (): Promise<string | null> => {
        if (refreshPromiseRef.current) return refreshPromiseRef.current;

        const promise = apiRefresh()
            .then(({ accessToken }) => {
                const user = decodeUserFromToken(accessToken);
                if (user) {
                    setAuthenticated(accessToken, user);
                    return accessToken;
                }
                clearAuth();
                return null;
            })
            .catch(() => {
                clearAuth();
                return null;
            })
            .finally(() => {
                refreshPromiseRef.current = null;
            });

        refreshPromiseRef.current = promise;
        return promise;
    }, [setAuthenticated, clearAuth]);

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        if (state.accessToken) return state.accessToken;
        return refresh();
    }, [state.accessToken, refresh]);

    return (
        <AuthContext.Provider
            value={{ ...state, login, logout, getAccessToken }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used inside <AuthProvider>");
    return ctx;
}

/**
 * Decodes the JWT payload without verifying the signature.
 * Signature verification happens on the server; here we only need user metadata.
 */
function decodeUserFromToken(token: string): AuthUser | null {
    try {
        const [, payloadB64] = token.split(".");
        if (!payloadB64) return null;
        const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(json) as {
            sub?: string;
            clubId?: string;
            role?: string;
            email?: string;
            type?: string;
        };

        if (
            payload.type !== "access" ||
            !payload.sub ||
            !payload.clubId ||
            !payload.role
        ) {
            return null;
        }

        return {
            id: payload.sub,
            email: payload.email ?? "",
            role: payload.role as AuthUser["role"],
            clubId: payload.clubId,
        };
    } catch {
        return null;
    }
}

export { AuthApiError };