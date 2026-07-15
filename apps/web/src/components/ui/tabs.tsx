"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
  href?: string;
};

export function Tabs({
  ariaLabel = "Seções",
  className,
  contentClassName,
  defaultTab,
  items,
  onValueChange,
  urlParam,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
  defaultTab?: string;
  items: TabItem[];
  onValueChange?: (value: string) => void;
  urlParam?: string;
  value?: string;
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
      next.set(urlParam, itemId);
      window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
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
    <div className={cn("min-w-0 w-full", className)}>
      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <div
          className="inline-flex min-w-max items-center gap-1 rounded-lg border border-border bg-muted p-1 shadow-[var(--shadow-soft)]"
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
                    className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span>{item.label}</span>
              </>
            );
            const tabClassName = cn(
              "relative inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-3.5 text-body-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2",
              isActive
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
      {activeItem?.content !== undefined ? (
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
  );
}
