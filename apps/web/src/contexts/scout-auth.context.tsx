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
    apiScoutLogin,
    apiScoutLogout,
    apiScoutRefresh,
    ScoutAuthApiError,
    type ScoutAuthUser,
} from "@/lib/scout-auth";

interface ScoutAuthState {
    accessToken: string | null;
    scout: ScoutAuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
}

interface ScoutAuthContextValue extends ScoutAuthState {
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    getAccessToken: () => Promise<string | null>;
}

const ScoutAuthContext = createContext<ScoutAuthContextValue | null>(null);

export function ScoutAuthProvider({ children }: React.PropsWithChildren) {
    const router = useRouter();
    const [state, setState] = useState<ScoutAuthState>({
        accessToken: null,
        scout: null,
        isLoading: true,
        isAuthenticated: false,
    });

    const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

    const setAuthenticated = useCallback(
        (accessToken: string, scout: ScoutAuthUser) => {
            setState({ accessToken, scout, isLoading: false, isAuthenticated: true });
        },
        [],
    );

    const clearAuth = useCallback(() => {
        setState({ accessToken: null, scout: null, isLoading: false, isAuthenticated: false });
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            try {
                const { accessToken } = await apiScoutRefresh();
                if (cancelled) return;
                const scout = decodeScoutFromToken(accessToken);
                if (scout) {
                    setAuthenticated(accessToken, scout);
                } else {
                    clearAuth();
                }
            } catch {
                if (!cancelled) clearAuth();
            }
        }

        bootstrap();
        return () => { cancelled = true; };
    }, [setAuthenticated, clearAuth]);

    const login = useCallback(
        async (email: string, password: string) => {
            const { accessToken, scout } = await apiScoutLogin(email, password);
            setAuthenticated(accessToken, scout);
            router.push("/scout/search");
        },
        [setAuthenticated, router],
    );

    const logout = useCallback(async () => {
        try {
            await apiScoutLogout(state.accessToken ?? undefined);
        } catch {
            // best-effort
        }
        clearAuth();
        router.push("/scout-login");
    }, [state.accessToken, clearAuth, router]);

    const refresh = useCallback(async (): Promise<string | null> => {
        if (refreshPromiseRef.current) return refreshPromiseRef.current;

        const promise = apiScoutRefresh()
            .then(({ accessToken }) => {
                const scout = decodeScoutFromToken(accessToken);
                if (scout) {
                    setAuthenticated(accessToken, scout);
                    return accessToken;
                }
                clearAuth();
                return null;
            })
            .catch(() => { clearAuth(); return null; })
            .finally(() => { refreshPromiseRef.current = null; });

        refreshPromiseRef.current = promise;
        return promise;
    }, [setAuthenticated, clearAuth]);

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        if (state.accessToken) return state.accessToken;
        return refresh();
    }, [state.accessToken, refresh]);

    return (
        <ScoutAuthContext.Provider value={{ ...state, login, logout, getAccessToken }}>
            {children}
        </ScoutAuthContext.Provider>
    );
}

export function useScoutAuthContext(): ScoutAuthContextValue {
    const ctx = useContext(ScoutAuthContext);
    if (!ctx) throw new Error("useScoutAuthContext must be used inside <ScoutAuthProvider>");
    return ctx;
}

export { ScoutAuthApiError };

/**
 * Decodes JWT payload without signature verification.
 * [SEC-AUTH] Validates role=SCOUT and clubId=null — rejects any token where
 * clubId is non-null (which would indicate a club-user token, not a scout token).
 */
function decodeScoutFromToken(token: string): ScoutAuthUser | null {
    try {
        const [, payloadB64] = token.split(".");
        if (!payloadB64) return null;
        const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(json) as {
            sub?: string;
            clubId?: string | null;
            role?: string;
            type?: string;
        };

        if (
            payload.type !== "access" ||
            payload.role !== "SCOUT" ||
            !payload.sub ||
            payload.clubId !== null
        ) {
            return null;
        }

        return { id: payload.sub, name: "", email: "" };
    } catch {
        return null;
    }
}