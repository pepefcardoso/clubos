"use client";

import { useEffect, useState } from "react";

export interface NetworkStatus {
  isOnline: boolean;
}

/**
 * Reactively tracks browser online/offline state.
 *
 * SSR-safe: initialises to `true` during server rendering so that components
 * don't flash a "you are offline" banner on hydration. The effect immediately
 * syncs to the real `navigator.onLine` value on mount.
 *
 * Relies on the native `window` 'online'/'offline' events which fire on
 * connectivity transitions. Event listeners are removed on unmount.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
