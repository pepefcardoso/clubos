import { CheckCircle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Toast } from "@/hooks/use-toasts";

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null;

    return (
        <div
            aria-live="polite"
            aria-atomic="false"
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="status"
                    className={cn(
                        "flex items-start gap-3 min-w-[300px] max-w-sm rounded-md border-l-4 bg-white px-4 py-3 shadow-lg transition-all animate-in fade-in slide-in-from-right-4",
                        toast.type === "success" && "border-green-500",
                        toast.type === "error" && "border-red-500",
                        toast.type === "info" && "border-blue-500"
                    )}
                >
                    {toast.type === "success" && (
                        <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" aria-hidden />
                    )}
                    {toast.type === "error" && (
                        <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" aria-hidden />
                    )}
                    {toast.type === "info" && (
                        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" aria-hidden />
                    )}

                    <p className="text-sm text-neutral-700 break-words leading-relaxed">
                        {toast.message}
                    </p>
                </div>
            ))}
        </div>
    );
}