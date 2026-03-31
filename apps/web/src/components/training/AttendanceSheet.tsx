"use client";

import { ClipboardList, WifiOff, RefreshCw } from "lucide-react";
import { useAttendanceSession } from "@/hooks/use-attendance-session";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { SessionConfigBar } from "./SessionConfigBar";
import { AthleteRollCard } from "./AthleteRollCard";
import { AttendanceSummaryBar } from "./AttendanceSummaryBar";

function EmptyAthleteCache() {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
                <ClipboardList
                    size={32}
                    className="text-neutral-300"
                    aria-hidden="true"
                />
            </div>
            <p className="font-semibold text-neutral-600 text-[0.9375rem]">
                Nenhum atleta em cache
            </p>
            <p className="text-sm text-neutral-400 mt-1.5 max-w-xs leading-relaxed">
                Abra a lista de atletas enquanto estiver online para sincronizar o
                cadastro e poder fazer chamadas offline.
            </p>
        </div>
    );
}

function StatsStrip({
    present,
    absent,
    pending,
    total,
}: {
    present: number;
    absent: number;
    pending: number;
    total: number;
}) {
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;

    return (
        <div className="mx-4 my-3">
            <div
                className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden"
                role="progressbar"
                aria-valuenow={present}
                aria-valuemax={total}
                aria-label={`${pct}% marcados`}
            >
                <div
                    className="h-full rounded-full bg-primary-400 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <p className="text-[0.6875rem] text-neutral-400 mt-1 text-right tabular-nums">
                {total - pending} de {total} marcados
                {absent > 0 && ` · ${absent} ausente${absent !== 1 ? "s" : ""}`}
            </p>
        </div>
    );
}

export function AttendanceSheet() {
    const session = useAttendanceSession();
    const { isOnline } = useNetworkStatus();

    const isComplete = session.savedCount !== null;
    const isLoading = session.athletes.length === 0 && !session.isSaving && !isComplete;
    const isEmpty = isLoading;

    return (
        <div className="flex flex-col bg-neutral-50" style={{ minHeight: "calc(100dvh - 56px)" }}>
            <div className="px-4 pt-5 pb-1">
                <h1 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                    <ClipboardList
                        size={20}
                        className="text-primary-600 flex-shrink-0"
                        aria-hidden="true"
                    />
                    Chamada Digital
                </h1>
                <p className="text-sm text-neutral-500 mt-0.5 pl-7">
                    Registre a presença da sessão. Funciona offline.
                </p>
            </div>

            <SessionConfigBar
                config={session.config}
                onChange={session.updateConfig}
                disabled={isComplete || session.isSaving}
            />

            {!isOnline && (
                <div
                    role="alert"
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium"
                >
                    <WifiOff size={13} aria-hidden="true" />
                    Sem conexão — a chamada será sincronizada quando voltar online.
                </div>
            )}

            {isComplete && isOnline && (
                <div
                    role="status"
                    className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-b border-primary-100 text-primary-600 text-xs font-medium"
                >
                    <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                    Sincronizando registros com o servidor…
                </div>
            )}

            {!isEmpty && !isComplete && session.athletes.length > 0 && (
                <StatsStrip
                    present={session.presentCount}
                    absent={session.absentCount}
                    pending={session.pendingCount}
                    total={session.athletes.length}
                />
            )}

            <div className="flex-1 overflow-y-auto px-4 pb-4">
                {isEmpty ? (
                    <EmptyAthleteCache />
                ) : (
                    <div
                        role="list"
                        className="space-y-2.5"
                        aria-label="Lista de atletas para chamada"
                    >
                        {session.athletes.map((athlete) => (
                            <AthleteRollCard
                                key={athlete.athleteId}
                                athleteId={athlete.athleteId}
                                name={athlete.name}
                                status={athlete.status}
                                onStatusChange={session.setStatus}
                                disabled={isComplete || session.isSaving}
                            />
                        ))}
                    </div>
                )}
            </div>

            {!isEmpty && (
                <AttendanceSummaryBar
                    presentCount={session.presentCount}
                    absentCount={session.absentCount}
                    pendingCount={session.pendingCount}
                    totalCount={session.athletes.length}
                    isSaving={session.isSaving}
                    savedCount={session.savedCount}
                    onSave={session.save}
                    onReset={session.reset}
                    onMarkAllPresent={session.markAllPresent}
                />
            )}
        </div>
    );
}