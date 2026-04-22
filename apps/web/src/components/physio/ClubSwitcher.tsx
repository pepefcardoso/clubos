"use client";

import { useState } from "react";
import { ChevronDown, Building2, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhysioClubs, useSwitchPhysioClub } from "@/hooks/use-physio-clubs";
import { useAuthContext } from "@/contexts/auth.context";

/**
 * Dropdown club switcher for PHYSIO users who have access to multiple clubs.
 *
 * Renders nothing when:
 *   - The user is not PHYSIO
 *   - The PHYSIO only has access to one club
 *   - Clubs are still loading
 *
 * On club selection:
 *   1. Calls POST /api/physio/switch-club to get a new access token.
 *   2. Calls AuthProvider.switchClub to update in-memory state.
 *   3. React Query cache is cleared (stale club data removed).
 *   4. Page remains in place — only the JWT clubId changes.
 */
export function ClubSwitcher() {
    const { user } = useAuthContext();
    const [open, setOpen] = useState(false);

    const { data: clubs, isLoading } = usePhysioClubs();

    const { switchClub } = useAuthContextSwitchClub();

    const switchMutation = useSwitchPhysioClub({
        onTokenReceived: switchClub,
    });

    if (!user || user.role !== "PHYSIO") return null;
    if (isLoading || !clubs || clubs.length <= 1) return null;

    const activeClub = clubs.find((c) => c.clubId === user.clubId) ?? clubs[0]!;
    const otherClubs = clubs.filter((c) => c.clubId !== user.clubId);

    const handleSwitch = async (targetClubId: string) => {
        if (switchMutation.isPending) return;
        setOpen(false);
        try {
            await switchMutation.mutateAsync(targetClubId);
        } catch {
            // Error is surfaced via switchMutation.error; no toast here
        }
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={switchMutation.isPending}
                className={cn(
                    "flex items-center gap-2 rounded-md border border-neutral-200 bg-white",
                    "px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm",
                    "hover:bg-neutral-50 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                )}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Clube ativo: ${activeClub.clubName}. Clique para trocar.`}
            >
                <Building2 size={14} className="text-primary-600 flex-shrink-0" aria-hidden />

                {switchMutation.isPending ? (
                    <span className="flex items-center gap-1.5">
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                        <span className="text-neutral-500">Trocando…</span>
                    </span>
                ) : (
                    <>
                        <span className="max-w-[140px] truncate">{activeClub.clubName}</span>
                        <ChevronDown
                            size={14}
                            className={cn(
                                "text-neutral-400 flex-shrink-0 transition-transform duration-150",
                                open && "rotate-180",
                            )}
                            aria-hidden
                        />
                    </>
                )}
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        aria-hidden
                        onClick={() => setOpen(false)}
                    />

                    <div
                        role="listbox"
                        aria-label="Selecionar clube"
                        className={cn(
                            "absolute left-0 top-full z-50 mt-1 min-w-[200px] max-w-[280px]",
                            "rounded-md border border-neutral-200 bg-white shadow-lg",
                            "overflow-hidden",
                        )}
                    >
                        <div className="px-3 py-2 border-b border-neutral-100">
                            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-neutral-400">
                                Clubes vinculados
                            </p>
                        </div>

                        <ul className="py-1">
                            <li
                                role="option"
                                aria-selected="true"
                                className="flex items-center gap-2.5 px-3 py-2.5 bg-primary-50"
                            >
                                <Building2 size={14} className="text-primary-600 flex-shrink-0" aria-hidden />
                                <span className="flex-1 text-sm font-medium text-primary-800 truncate">
                                    {activeClub.clubName}
                                </span>
                                <Check size={14} className="text-primary-600 flex-shrink-0" aria-hidden />
                            </li>

                            {otherClubs.map((club) => (
                                <li key={club.clubId} role="option" aria-selected="false">
                                    <button
                                        type="button"
                                        onClick={() => handleSwitch(club.clubId)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-left",
                                            "hover:bg-neutral-50 transition-colors",
                                            "focus-visible:outline-none focus-visible:bg-neutral-50",
                                        )}
                                    >
                                        <Building2 size={14} className="text-neutral-400 flex-shrink-0" aria-hidden />
                                        <span className="flex-1 text-sm text-neutral-700 truncate">
                                            {club.clubName}
                                        </span>
                                        {!club.isPrimary && (
                                            <span className="text-[0.6rem] font-medium text-neutral-400 uppercase tracking-wide flex-shrink-0">
                                                Extra
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Reads the `switchClub` method from AuthContext.
 * Defined here to keep ClubSwitcher self-contained.
 * AuthProvider must expose switchClub (see auth.context.tsx changes in docs).
 */
function useAuthContextSwitchClub(): { switchClub: (token: string) => void } {
    const ctx = useAuthContext();
    const switchClub = (newToken: string) => {
        if ("switchClub" in ctx && typeof ctx.switchClub === "function") {
            (ctx as typeof ctx & { switchClub: (t: string) => void }).switchClub(
                newToken,
            );
        }
    };
    return { switchClub };
}