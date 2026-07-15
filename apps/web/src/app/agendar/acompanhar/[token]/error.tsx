"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportClientError } from "@/lib/observability/client";

export default function BookingRequestError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    reportClientError({
      digest: error.digest,
      message: error.message,
      source: "public-booking.manage.error",
    });
  }, [error]);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6">
      <Card className="mx-auto w-full max-w-xl">
        <CardContent className="grid justify-items-center gap-3 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold">
            Não foi possível abrir a solicitação
          </h1>
          <p className="text-sm text-muted-foreground">
            Verifique sua conexão e tente carregar os dados novamente.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
