"use client";

import { useSyncExternalStore } from "react";

export interface NetworkStatus {
  isOnline: boolean;
}

const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);

  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

const getSnapshot = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

const getServerSnapshot = () => {
  return true;
};

/**
 * Reactively tracks browser online/offline state.
 *
 * SSR-safe: initialises to `true` during server rendering so that components
 * don't flash a "you are offline" banner on hydration.
 *
 * Relies on the native `window` 'online'/'offline' events which fire on
 * connectivity transitions.
 */
export function useNetworkStatus(): NetworkStatus {
  const isOnline = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return { isOnline };
}
