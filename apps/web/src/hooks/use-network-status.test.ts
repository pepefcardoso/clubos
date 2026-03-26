import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetworkStatus } from "./use-network-status";

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  setNavigatorOnLine(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useNetworkStatus", () => {
  it("returns isOnline: true when navigator.onLine is true", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it("returns isOnline: false when navigator.onLine is false on mount", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it("updates isOnline to false when the offline event fires", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("updates isOnline to true when the online event fires", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it("reflects multiple transitions correctly (online → offline → online)", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it("removes both event listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useNetworkStatus());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });

  it("adds event listeners on mount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useNetworkStatus());

    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
