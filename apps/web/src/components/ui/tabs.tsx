"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type TabItem = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export function Tabs({
  defaultTab,
  items,
}: {
  defaultTab?: string;
  items: TabItem[];
}) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? items[0]?.id);
  const activeItem = items.find((item) => item.id === activeTab);

  function focusTab(index: number) {
    const item = items[(index + items.length) % items.length];
    if (item) {
      setActiveTab(item.id);
      document.getElementById(`tab-${item.id}`)?.focus();
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
    <div>
      <div
        className="flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-controls={`tabpanel-${item.id}`}
            aria-selected={activeTab === item.id}
            tabIndex={activeTab === item.id ? 0 : -1}
            onClick={() => setActiveTab(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
              activeTab === item.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeItem ? (
        <div
          id={`tabpanel-${activeItem.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeItem.id}`}
          className="py-4"
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}
