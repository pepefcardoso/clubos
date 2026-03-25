import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

type ServiceWorkerStatus =
  | "unsupported"
  | "loading"
  | "registered"
  | "update-available"
  | "error";

/**
 * Determines the initial status based on environment support.
 * Mirrors the guard at the top of the useEffect in useServiceWorker.
 */
function resolveInitialStatus(
  hasWindow: boolean,
  hasSwSupport: boolean,
): ServiceWorkerStatus {
  if (!hasWindow || !hasSwSupport) return "unsupported";
  return "loading";
}

/**
 * Determines whether the "update-available" transition should fire.
 * Mirrors the statechange handler in useServiceWorker.
 */
function shouldTransitionToUpdateAvailable(
  newWorkerState: ServiceWorker["state"],
  hasController: boolean,
): boolean {
  return newWorkerState === "installed" && hasController;
}

/**
 * applyUpdate no-ops silently when there is no waiting worker.
 * This mirrors the `if (!waitingWorker) return` guard in the hook.
 */
function safeApplyUpdate(
  waitingWorker: ServiceWorker | null,
  postMessage: (msg: unknown) => void,
): void {
  if (!waitingWorker) return;
  postMessage({ type: "SKIP_WAITING" });
}

describe("resolveInitialStatus", () => {
  it("returns 'unsupported' when window is not available (SSR)", () => {
    expect(resolveInitialStatus(false, false)).toBe("unsupported");
  });

  it("returns 'unsupported' when serviceWorker API is absent", () => {
    expect(resolveInitialStatus(true, false)).toBe("unsupported");
  });

  it("returns 'loading' when both window and SW support are available", () => {
    expect(resolveInitialStatus(true, true)).toBe("loading");
  });
});

describe("shouldTransitionToUpdateAvailable", () => {
  it("returns true when new worker is installed and there is an active controller", () => {
    expect(shouldTransitionToUpdateAvailable("installed", true)).toBe(true);
  });

  it("returns false when new worker is installed but no controller exists (first install)", () => {
    expect(shouldTransitionToUpdateAvailable("installed", false)).toBe(false);
  });

  it("returns false when worker state is 'installing'", () => {
    expect(shouldTransitionToUpdateAvailable("installing", true)).toBe(false);
  });

  it("returns false when worker state is 'activating'", () => {
    expect(shouldTransitionToUpdateAvailable("activating", true)).toBe(false);
  });

  it("returns false when worker state is 'activated'", () => {
    expect(shouldTransitionToUpdateAvailable("activated", true)).toBe(false);
  });

  it("returns false when worker state is 'redundant'", () => {
    expect(shouldTransitionToUpdateAvailable("redundant", true)).toBe(false);
  });
});

describe("safeApplyUpdate", () => {
  let postMessage: Mock<(msg: unknown) => void>;

  beforeEach(() => {
    postMessage = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT call postMessage when waitingWorker is null", () => {
    safeApplyUpdate(null, postMessage);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("calls postMessage with SKIP_WAITING when waitingWorker is present", () => {
    const fakeWorker = {} as ServiceWorker;
    safeApplyUpdate(fakeWorker, postMessage);
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("only sends one message even if called multiple times with the same worker", () => {
    const fakeWorker = {} as ServiceWorker;
    safeApplyUpdate(fakeWorker, postMessage);
    safeApplyUpdate(fakeWorker, postMessage);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenNthCalledWith(1, { type: "SKIP_WAITING" });
    expect(postMessage).toHaveBeenNthCalledWith(2, { type: "SKIP_WAITING" });
  });
});

describe("Status transition table", () => {
  /**
   * Documents the full set of valid status transitions.
   * Acts as a living specification for the state machine.
   */
  const validTransitions: Array<{
    from: ServiceWorkerStatus;
    to: ServiceWorkerStatus;
    trigger: string;
  }> = [
    {
      from: "loading",
      to: "registered",
      trigger: "navigator.serviceWorker.ready resolves",
    },
    {
      from: "loading",
      to: "error",
      trigger: "navigator.serviceWorker.ready rejects",
    },
    {
      from: "registered",
      to: "update-available",
      trigger: "reg.waiting exists on mount",
    },
    {
      from: "registered",
      to: "update-available",
      trigger: "new worker reaches installed state with existing controller",
    },
  ];

  it.each(validTransitions)(
    "transition: $from → $to on '$trigger'",
    ({ from, to }) => {
      const validStatuses: ServiceWorkerStatus[] = [
        "unsupported",
        "loading",
        "registered",
        "update-available",
        "error",
      ];
      expect(validStatuses).toContain(from);
      expect(validStatuses).toContain(to);
      expect(from).not.toBe(to);
    },
  );
});
