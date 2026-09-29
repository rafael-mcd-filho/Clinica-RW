"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useId, useState } from "react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
  href?: string;
  urlValue?: string | null;
};

const TabsNavigationContext = createContext<((nextTab: string) => void) | null>(
  null,
);

export function Tabs({
  ariaLabel = "Seções",
  className,
  contentClassName,
  defaultTab,
  iconOnly = false,
  items,
  keepMounted = false,
  onValueChange,
  urlParam,
  value,
  variant = "default",
}: {
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
  defaultTab?: string;
  iconOnly?: boolean;
  items: TabItem[];
  /** Mantém os painéis inativos montados (só escondidos). Necessário quando
      as abas guardam formulários: desmontar descartava o que já tinha sido
      digitado e não salvo ao trocar de aba. */
  keepMounted?: boolean;
  onValueChange?: (value: string) => void;
  urlParam?: string;
  value?: string;
  /** "card": barra branca de largura total, aba ativa em azul-claro com
      sublinhado (ficha do paciente). */
  variant?: "default" | "card";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const instanceId = useId().replaceAll(":", "");
  const [internalActiveTab, setInternalActiveTab] = useState(
    defaultTab ?? items[0]?.id,
  );
  const requestedUrlTab = urlParam ? searchParams.get(urlParam) : null;
  const activeTab =
    value ??
    (requestedUrlTab && items.some((item) => item.id === requestedUrlTab)
      ? requestedUrlTab
      : internalActiveTab);
  const activeItem =
    items.find((item) => item.id === activeTab) ?? items[0] ?? null;

  function tabId(itemId: string) {
    return `${instanceId}-tab-${itemId}`;
  }

  function panelId(itemId: string) {
    return `${instanceId}-tabpanel-${itemId}`;
  }

  function selectTab(itemId: string) {
    setInternalActiveTab(itemId);
    onValueChange?.(itemId);

    if (urlParam) {
      const next = new URLSearchParams(searchParams.toString());
      const item = items.find((candidate) => candidate.id === itemId);
      const urlValue = item?.urlValue === undefined ? itemId : item.urlValue;

      if (urlValue) {
        next.set(urlParam, urlValue);
      } else {
        next.delete(urlParam);
      }

      const query = next.toString();
      window.history.replaceState(
        null,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
    }
  }

  function focusTab(index: number) {
    const item = items[(index + items.length) % items.length];
    if (item) {
      const element = document.getElementById(tabId(item.id));
      element?.focus();

      if (item.href) {
        element?.click();
      } else {
        selectTab(item.id);
      }
    }
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(items.length - 1);
    }
  }

  return (
    <TabsNavigationContext.Provider value={selectTab}>
      {/* No "card" a barra é um contêiner: abas e conteúdo se ajustam à
          largura real da área (com o menu lateral aberto ela é bem menor
          que a tela). */}
      <div
        className={cn(
          "min-w-0 w-full",
          variant === "card" && "@container",
          className,
        )}
      >
        <div
          className={cn(
            "max-w-full",
            variant === "card"
              ? // Rola quando não cabe (celular), sem a barra de rolagem
                // embaixo da barra de abas.
                "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : iconOnly
                ? "overflow-hidden pb-1"
                : "overflow-x-auto overscroll-x-contain pb-1",
          )}
        >
          <div
            className={cn(
              "items-center gap-1 rounded-lg border border-border p-1 shadow-[var(--shadow-soft)]",
              variant === "card"
                ? "flex w-max min-w-full bg-card p-1.5"
                : "inline-flex bg-muted",
              variant !== "card" && (iconOnly ? "w-full min-w-0" : "min-w-max"),
            )}
            role="tablist"
            aria-label={ariaLabel}
            aria-orientation="horizontal"
          >
            {items.map((item, index) => {
              const isActive = activeItem?.id === item.id;

              const content = (
                <>
                  {item.icon ? (
                    <span
                      className={cn(
                        "size-4 shrink-0 items-center justify-center [&_svg]:size-4",
                        // Na barra "card" estreita, só o texto: as sete abas
                        // cabem sem rolagem.
                        variant === "card" ? "hidden @4xl:flex" : "flex",
                      )}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className={iconOnly ? "sr-only" : undefined}>
                    {item.label}
                  </span>
                </>
              );
              const tabClassName = cn(
                "relative inline-flex h-10 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-md border px-3.5 text-body-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2",
                iconOnly && "min-w-0 flex-1 px-2",
                variant === "card"
                  ? isActive
                    ? "border-transparent bg-primary-muted px-2.5 text-primary after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary @5xl:px-5"
                    : "border-transparent px-2.5 text-secondary-foreground hover:bg-muted hover:text-foreground @5xl:px-5"
                  : isActive
                    ? "border-border-strong bg-card text-foreground shadow-[var(--shadow-soft)] after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary"
                    : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
              );

              return item.href ? (
                <Link
                  key={item.id}
                  id={tabId(item.id)}
                  href={item.href}
                  role="tab"
                  aria-controls={panelId(item.id)}
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  title={iconOnly ? item.label : undefined}
                  tabIndex={isActive ? 0 : -1}
                  scroll={false}
                  prefetch={false}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={tabClassName}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.id}
                  id={tabId(item.id)}
                  type="button"
                  role="tab"
                  aria-controls={panelId(item.id)}
                  aria-selected={isActive}
                  title={iconOnly ? item.label : undefined}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    selectTab(item.id);
                  }}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={tabClassName}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
        {keepMounted ? (
          items.map((item) =>
            item.content !== undefined ? (
              <div
                key={item.id}
                id={panelId(item.id)}
                role="tabpanel"
                aria-labelledby={tabId(item.id)}
                tabIndex={0}
                hidden={item.id !== activeItem?.id}
                className={cn("min-w-0 w-full pt-5", contentClassName)}
              >
                {item.content}
              </div>
            ) : null,
          )
        ) : activeItem?.content !== undefined ? (
          <div
            id={panelId(activeItem.id)}
            role="tabpanel"
            aria-labelledby={tabId(activeItem.id)}
            tabIndex={0}
            className={cn("min-w-0 w-full pt-5", contentClassName)}
          >
            {activeItem.content}
          </div>
        ) : null}
      </div>
    </TabsNavigationContext.Provider>
  );
}

export function TabSelectionButton({
  onClick,
  scrollToTop = false,
  value,
  ...props
}: React.ComponentPropsWithoutRef<"button"> & {
  value: string;
  /** Volta ao topo ao trocar de aba (atalhos no meio da página). */
  scrollToTop?: boolean;
}) {
  const selectTab = useContext(TabsNavigationContext);

  return (
    <button
      type="button"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          selectTab?.(value);
          if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
    />
  );
}
