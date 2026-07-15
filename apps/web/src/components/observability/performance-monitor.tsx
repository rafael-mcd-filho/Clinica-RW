"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";

type PerformancePayload = {
  id: string;
  name: string;
  value: number;
  delta?: number;
  rating?: string;
  navigationType?: string;
  route: string;
};

function sendPerformanceMetric(payload: PerformancePayload) {
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        "/api/observability/web-vitals",
        new Blob([body], { type: "application/json" }),
      );
      if (queued) return;
    }

    void fetch("/api/observability/web-vitals", {
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    });
  } catch {
    // Performance reporting must never affect navigation.
  }
}

function reportWebVital(metric: {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating?: string;
  navigationType?: string;
}) {
  sendPerformanceMetric({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType,
    route: routeTemplate(window.location.pathname),
  });
}

export function PerformanceMonitor() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationStartRef = useRef<number | null>(null);
  const navigationIdRef = useRef(0);
  const navigationTimeoutRef = useRef<number | null>(null);
  const locationKey = `${pathname}?${searchParams.toString()}`;

  useReportWebVitals(reportWebVital);

  useEffect(() => {
    function beginNavigation() {
      navigationStartRef.current = performance.now();
      navigationIdRef.current += 1;
      if (navigationTimeoutRef.current) {
        window.clearTimeout(navigationTimeoutRef.current);
      }
      navigationTimeoutRef.current = window.setTimeout(() => {
        navigationStartRef.current = null;
        navigationTimeoutRef.current = null;
      }, 15_000);
    }

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }

      beginNavigation();
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", beginNavigation);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", beginNavigation);
      if (navigationTimeoutRef.current) {
        window.clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const startedAt = navigationStartRef.current;
    if (startedAt == null) return;
    const navigationId = navigationIdRef.current;

    let secondFrame: number | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (navigationId !== navigationIdRef.current) return;

        sendPerformanceMetric({
          id: `route-${Date.now()}-${navigationId}`,
          name: "ROUTE_CHANGE",
          value: performance.now() - startedAt,
          route: routeTemplate(pathname),
          navigationType: "navigate",
        });
        navigationStartRef.current = null;
        if (navigationTimeoutRef.current) {
          window.clearTimeout(navigationTimeoutRef.current);
          navigationTimeoutRef.current = null;
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame != null) cancelAnimationFrame(secondFrame);
    };
  }, [locationKey, pathname]);

  return null;
}

function routeTemplate(pathname: string) {
  return pathname
    .split("/")
    .map((segment) =>
      /^\d+$/.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        segment,
      )
        ? ":id"
        : segment,
    )
    .join("/");
}
