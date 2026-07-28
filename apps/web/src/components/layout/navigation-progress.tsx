"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Barra de progresso de topo mostrada durante navegações client-side.
// Complementa os loading.tsx: dá feedback imediato mesmo enquanto o
// Server Component da rota ainda está resolvendo (auth, permissões, dados),
// que é justamente a janela em que a tela parecia "travada".
//
// A detecção de início espelha a do performance-monitor (clique em âncora
// interna + popstate); a de fim usa a troca de pathname/searchParams.

const SHOW_DELAY_MS = 120; // não pisca em navegação instantânea (prefetch)
const TRICKLE_MS = 200;
const FADE_MS = 200;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const runningRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);
  const trickleRef = useRef<number | null>(null);

  const clearPending = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
    if (trickleRef.current !== null) {
      window.clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  }, []);

  useEffect(() => {
    function begin() {
      if (runningRef.current) return;
      runningRef.current = true;

      const showTimer = window.setTimeout(() => {
        visibleRef.current = true;
        setVisible(true);
        setProgress(0.08);
        trickleRef.current = window.setInterval(() => {
          // avança desacelerando; nunca completa sozinho (para em 90%)
          setProgress((p) =>
            p >= 0.9 ? p : Math.min(0.9, p + (1 - p) * 0.06),
          );
        }, TRICKLE_MS);
      }, SHOW_DELAY_MS);
      timeoutsRef.current.push(showTimer);
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

      begin();
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", begin);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", begin);
      clearPending();
    };
  }, [clearPending]);

  useEffect(() => {
    // A rota mudou: navegação concluída.
    if (!runningRef.current) return;
    runningRef.current = false;
    clearPending();

    if (!visibleRef.current) {
      // Navegação foi rápida demais para a barra chegar a aparecer.
      setProgress(0);
      return;
    }

    setProgress(1);
    const hideTimer = window.setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
      const resetTimer = window.setTimeout(() => setProgress(0), FADE_MS);
      timeoutsRef.current.push(resetTimer);
    }, FADE_MS);
    timeoutsRef.current.push(hideTimer);
  }, [locationKey, clearPending]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms var(--ease-out)`,
      }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--primary)]"
        style={{
          width: `${progress * 100}%`,
          transition: `width ${TRICKLE_MS}ms var(--ease-out)`,
        }}
      />
    </div>
  );
}
