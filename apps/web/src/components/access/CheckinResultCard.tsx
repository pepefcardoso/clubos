import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Clock,
    WifiOff,
} from "lucide-react";
import type { ScanResult } from "@/hooks/use-ticket-scanner";

interface CheckinResultCardProps {
    result: ScanResult;
}

interface StateConfig {
    containerClass: string;
    iconClass: string;
    Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
    label: string;
}

const STATE_CONFIG: Record<ScanResult["type"], StateConfig> = {
    success: {
        containerClass:
            "bg-primary-50 border border-primary-300 text-primary-800",
        iconClass: "text-primary-600",
        Icon: CheckCircle,
        label: "Liberado",
    },
    duplicate: {
        containerClass:
            "bg-amber-50 border border-amber-300 text-amber-800",
        iconClass: "text-amber-600",
        Icon: AlertTriangle,
        label: "Já utilizado",
    },
    invalid: {
        containerClass: "bg-red-50 border border-red-300 text-red-800",
        iconClass: "text-red-600",
        Icon: XCircle,
        label: "Inválido",
    },
    queued: {
        containerClass:
            "bg-neutral-100 border border-neutral-300 text-neutral-700",
        iconClass: "text-neutral-500",
        Icon: Clock,
        label: "Na fila offline",
    },
    error: {
        containerClass: "bg-red-50 border border-red-300 text-red-800",
        iconClass: "text-red-600",
        Icon: WifiOff,
        label: "Erro de conexão",
    },
};

/**
 * Displays the outcome of a QR Code scan.
 *
 * Every state carries both an icon AND a text label — color is never the sole
 * conveyor of meaning, satisfying [UI-A11Y] and WCAG 1.4.1.
 *
 * Auto-dismiss (3 s timeout) is handled by `useTicketScanner`; this component
 * is purely presentational.
 */
export function CheckinResultCard({ result }: CheckinResultCardProps) {
    const config = STATE_CONFIG[result.type];
    const { Icon } = config;

    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={[
                "flex items-start gap-3 rounded-md p-4 shadow-md",
                config.containerClass,
            ].join(" ")}
        >
            <Icon
                size={24}
                className={["mt-0.5 shrink-0", config.iconClass].join(" ")}
                aria-hidden={true}
            />

            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{config.label}</p>

                <p className="mt-0.5 text-sm">{result.message}</p>

                {result.type === "success" && result.data && (
                    <p className="mt-1 font-mono text-xs opacity-70">
                        #{result.data.ticketId.slice(-8).toUpperCase()}
                    </p>
                )}
            </div>
        </div>
    );
}