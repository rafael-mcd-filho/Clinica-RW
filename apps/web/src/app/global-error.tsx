"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability/client";

export default function GlobalError({
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
      source: "app.global-error",
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        {/* Renderiza sem o CSS global (o layout raiz falhou); estilos inline garantem legibilidade. */}
        <main
          style={{
            display: "grid",
            gap: "0.75rem",
            justifyItems: "start",
            maxWidth: "28rem",
            margin: "4rem auto",
            padding: "0 1.5rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Hi Clinic</h1>
          <p style={{ margin: 0, color: "slategray" }}>
            Não foi possível carregar a aplicação.
          </p>
          <Button type="button" onClick={() => unstable_retry()}>
            Tentar novamente
          </Button>
        </main>
      </body>
    </html>
  );
}
