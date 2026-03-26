"use client";

import { useEffect, useState } from "react";

export type ServiceWorkerStatus =
  | "unsupported"
  | "loading"
  | "registered"
  | "update-available"
  | "error";

export interface ServiceWorkerState {
  status: ServiceWorkerStatus;
  /**
   * Sends a SKIP_WAITING message to the waiting SW and reloads the page.
   * Only has an effect when status === 'update-available'.
   */
  applyUpdate: () => void;
}

/**
 * Hook for monitoring the Service Worker lifecycle.
 *
 * Detects when a new version is available (new SW installed but waiting for
 * activation) and exposes a function to apply the update immediately.
 *
 * Used by PwaUpdateBanner to prompt the user when a new deploy is available.
 *
 * Lifecycle summary:
 *   loading        → SW support confirmed, waiting for registration
 *   registered     → SW active and controlling the page
 *   update-available → New SW installed and waiting; applyUpdate() available
 *   error          → SW registration failed
 *   unsupported    → navigator.serviceWorker not available (SSR / old browser)
 */
export function useServiceWorker(): ServiceWorkerState {
  const [status, setStatus] = useState<ServiceWorkerStatus>("loading");
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unsupported");
      return;
    }

    navigator.serviceWorker.ready
      .then((reg) => {
        setStatus("registered");

        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setStatus("update-available");
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(newWorker);
              setStatus("update-available");
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  /**
   * Tells the waiting SW to activate immediately (skipWaiting), which will
   * trigger the controllerchange event above and reload the page.
   */
  const applyUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  return { status, applyUpdate };
}
