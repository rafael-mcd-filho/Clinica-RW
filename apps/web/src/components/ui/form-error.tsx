"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function FormError({
  className,
  id,
  message,
}: {
  className?: string;
  id?: string;
  message?: string | null;
}) {
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) errorRef.current?.focus({ preventScroll: false });
  }, [message]);

  if (!message) return null;

  return (
    <p
      id={id}
      ref={errorRef}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      className={cn("text-sm text-destructive", className)}
    >
      {message}
    </p>
  );
}
