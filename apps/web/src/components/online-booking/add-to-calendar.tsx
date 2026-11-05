import { CalendarPlus, GoogleLogo } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Raio-X O4: salvar a consulta no calendário. Os dois links vão ao servidor,
 * que monta o evento pelo token de acompanhamento.
 */
export function AddToCalendar({
  token,
  className,
}: {
  token: string;
  className?: string;
}) {
  const base = `/agendar/acompanhar/${token}`;
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      <Button asChild variant="secondary" className="w-full">
        <a href={`${base}/google-agenda`} target="_blank" rel="noreferrer">
          <GoogleLogo className="size-4" aria-hidden="true" />
          Google Agenda
        </a>
      </Button>
      <Button asChild variant="secondary" className="w-full">
        <a href={`${base}/calendario.ics`} download="consulta.ics">
          <CalendarPlus className="size-4" aria-hidden="true" />
          Calendário do celular
        </a>
      </Button>
    </div>
  );
}
