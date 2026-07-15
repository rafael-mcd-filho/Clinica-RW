import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/loader";

export default function LoadingBookingRequest() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 md:px-6"
        aria-busy="true"
        aria-label="Carregando solicitação de agendamento"
      >
        <Card>
          <CardContent className="grid gap-5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-6 w-56 max-w-full" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </div>
              <Skeleton className="h-6 w-28" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Carregando os dados da sua solicitação...
        </p>
      </div>
    </main>
  );
}
