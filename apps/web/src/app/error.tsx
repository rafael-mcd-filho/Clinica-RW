"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability/client";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError({
      digest: error.digest,
      message: error.message,
      source: "app.error",
    });
  }, [error]);

  return (
    <section className="rounded border border-red-200 bg-red-50 p-5 text-red-950">
      <AlertTriangle className="size-5" aria-hidden="true" />
      <h1 className="mt-4 text-base font-semibold">
        Não foi possível carregar esta página
      </h1>
      <p className="mt-1 text-sm text-red-800">
        O erro foi registrado. Tente novamente em alguns instantes.
      </p>
      <Button className="mt-4" type="button" onClick={() => unstable_retry()}>
        Tentar novamente
      </Button>
    </section>
  );
}
