import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let _counter = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++_counter;

    setToasts((prev) => [...prev, { id, type, message }]);

    const timeouts: Record<ToastType, number> = {
      success: 4000,
      error: 6000,
      info: 8000,
    };

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, timeouts[type]);
  }, []);

  return {
    toasts,
    pushSuccess: (msg: string) => push("success", msg),
    pushError: (msg: string) => push("error", msg),
    pushInfo: (msg: string) => push("info", msg),
  };
}
