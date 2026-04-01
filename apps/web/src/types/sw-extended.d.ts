/**
 * Extended Service Worker type declarations.
 *
 * The Background Sync API (SyncManager / SyncEvent) is not yet included in the
 * standard @types/serviceworker or TypeScript lib.webworker definitions as of
 * mid-2025. These declarations fill that gap for our sw.ts and workload-sync.ts.
 *
 * Spec: https://wicg.github.io/background-sync/spec/
 */

interface SyncEvent extends ExtendableEvent {
  /** The tag string passed to registration.sync.register(tag). */
  readonly tag: string;
  /**
   * True if the UA will not make further sync attempts for this tag after this event.
   * Use to escalate failure handling (e.g. notify the user).
   */
  readonly lastChance: boolean;
}

interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistration {
  readonly sync: SyncManager;
}

interface ServiceWorkerGlobalScope {
  addEventListener(
    type: "sync",
    listener: (event: SyncEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "sync",
    listener: (event: SyncEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}
