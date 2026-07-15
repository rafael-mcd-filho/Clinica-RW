"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesces bursts of Realtime events into a single route refresh. Refreshes
 * are postponed while the tab is hidden so background updates do not compete
 * with the next visible interaction.
 */
export function useCoalescedRouterRefresh({
  delay = 300,
  minimumInterval = 1_500,
}: {
  delay?: number;
  minimumInterval?: number;
} = {}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const lastRefreshRef = useRef(0);

  const runRefresh = useCallback(() => {
    if (document.visibilityState === "hidden") {
      pendingRef.current = true;
      return;
    }

    pendingRef.current = false;
    lastRefreshRef.current = Date.now();
    router.refresh();
  }, [router]);

  const scheduleRefresh = useCallback(() => {
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    const sinceLastRefresh = Date.now() - lastRefreshRef.current;
    const wait = Math.max(delay, minimumInterval - sinceLastRefresh);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runRefresh();
    }, wait);
  }, [delay, minimumInterval, runRefresh]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && pendingRef.current) {
        scheduleRefresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleRefresh]);

  return scheduleRefresh;
}
