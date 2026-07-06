import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AuditLogTable,
  type AuditLogItem,
  type JsonValue,
} from "./audit-log-table";
import { Button } from "@/components/ui/button";
import { DateRangePickerInput } from "@/components/ui/date-picker-input";
import { Select } from "@/components/ui/field";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AuditRow = {
  id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: JsonValue;
  created_at: string;
};

type ActorRow = {
  id: string;
  name: string;
};

type OrganizationRow = {
  id: string;
  name: string;
};

const pageSize = 25;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return value;
}

function startOfLocalDayIso(value: string) {
  return new Date(`${value}T00:00:00-03:00`).toISOString();
}

function endOfLocalDayIso(value: string) {
  return new Date(`${value}T23:59:59.999-03:00`).toISOString();
}

function buildHref(params: {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}) {
  const search = new URLSearchParams();
  if (params.organizationId) search.set("empresa", params.organizationId);
  if (params.dateFrom) search.set("de", params.dateFrom);
  if (params.dateTo) search.set("ate", params.dateTo);
  if (params.page > 1) search.set("pagina", String(params.page));
  const query = search.toString();
  return query ? `/auditoria?${query}` : "/auditoria";
}

export default async function AuditoriaPage({ searchParams }: PageProps) {
  const context = await getRequestContext();
  if (!context.isSuperAdmin) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const organizationId = firstParam(params.empresa) ?? "";
  const dateFrom = normalizeDate(firstParam(params.de));
  const dateTo = normalizeDate(firstParam(params.ate));
  const requestedPage = Number(firstParam(params.pagina) ?? "1");
  const currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createSupabaseServerClient();
  const { data: allOrganizations } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name")
    .returns<OrganizationRow[]>();

  const validOrganization =
    organizationId &&
    (allOrganizations ?? []).some(
      (organization) => organization.id === organizationId,
    )
      ? organizationId
      : "";

  let query = supabase
    .from("audit_logs")
    .select(
      "id, organization_id, actor_user_id, action, resource_type, resource_id, metadata, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (validOrganization) {
    query = query.eq("organization_id", validOrganization);
  }
  if (dateFrom) {
    query = query.gte("created_at", startOfLocalDayIso(dateFrom));
  }
  if (dateTo) {
    query = query.lte("created_at", endOfLocalDayIso(dateTo));
  }

  const { data: auditRows, error, count } = await query.returns<AuditRow[]>();
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total > 0 && currentPage > totalPages) {
    redirect(
      buildHref({
        organizationId: validOrganization,
        dateFrom,
        dateTo,
        page: totalPages,
      }),
    );
  }
  const safePage = currentPage;
  const actorIds = [
    ...new Set(
      (auditRows ?? [])
        .map((audit) => audit.actor_user_id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];
  const organizationIds = [
    ...new Set(
      (auditRows ?? [])
        .map((audit) => audit.organization_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: actors }, { data: pageOrganizations }] = await Promise.all([
    actorIds.length
      ? supabase
          .from("app_users")
          .select("id, name")
          .in("id", actorIds)
          .returns<ActorRow[]>()
      : Promise.resolve({ data: [] as ActorRow[] }),
    organizationIds.length
      ? supabase
          .from("organizations")
          .select("id, name")
          .in("id", organizationIds)
          .returns<OrganizationRow[]>()
      : Promise.resolve({ data: [] as OrganizationRow[] }),
  ]);

  const actorNames = new Map(
    (actors ?? []).map((actor) => [actor.id, actor.name]),
  );
  const organizationNames = new Map(
    (pageOrganizations ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );

  const rows: AuditLogItem[] = (auditRows ?? []).map((audit) => ({
    id: audit.id,
    organizationId: audit.organization_id,
    organizationName: audit.organization_id
      ? (organizationNames.get(audit.organization_id) ?? "Empresa")
      : "Plataforma",
    actorUserId: audit.actor_user_id,
    actorName: audit.actor_user_id
      ? (actorNames.get(audit.actor_user_id) ?? "Usuario")
      : "Sistema",
    action: audit.action,
    resourceType: audit.resource_type,
    resourceId: audit.resource_id,
    createdAt: audit.created_at,
    metadata: audit.metadata ?? {},
  }));

  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = Math.min(from + rows.length, total);
  const previousHref = buildHref({
    organizationId: validOrganization,
    dateFrom,
    dateTo,
    page: Math.max(1, safePage - 1),
  });
  const nextHref = buildHref({
    organizationId: validOrganization,
    dateFrom,
    dateTo,
    page: safePage + 1,
  });

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Auditoria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acoes sensiveis registradas para rastreabilidade.
        </p>
      </section>

      <form
        action="/auditoria"
        className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:grid-cols-[1fr_18rem_auto_auto] md:items-end"
      >
        <label className="grid gap-2 text-sm font-medium">
          Empresa
          <Select
            name="empresa"
            defaultValue={validOrganization}
            allowEmptyOption
          >
            <option value="">Todas as empresas</option>
            {(allOrganizations ?? []).map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Periodo
          <DateRangePickerInput
            fromName="de"
            toName="ate"
            defaultFrom={dateFrom}
            defaultTo={dateTo}
          />
        </label>

        <Button type="submit">Filtrar</Button>
        <Button asChild type="button" variant="secondary">
          <Link href="/auditoria">Limpar</Link>
        </Button>
      </form>

      <section className="animate-panel-enter overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="hidden grid-cols-[1.35fr_0.95fr_0.9fr_0.65fr_2.25rem] gap-4 border-b border-border bg-muted px-5 py-3 text-xs font-medium uppercase text-muted-foreground md:grid">
          <span className="text-center">Evento</span>
          <span className="text-center">Empresa</span>
          <span className="text-center">Responsavel</span>
          <span className="text-center">Data</span>
          <span className="sr-only">Detalhes</span>
        </div>

        {error ? (
          <div className="px-5 py-8 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <AuditLogTable rows={rows} />
        )}

        {!error ? (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>
              {total
                ? `Mostrando ${rangeStart}-${rangeEnd} de ${total} logs`
                : "Nenhum log encontrado"}
            </span>
            <div className="flex items-center gap-2">
              {safePage > 1 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={previousHref}>Anterior</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                  className="cursor-not-allowed"
                >
                  Anterior
                </Button>
              )}
              <span className="px-2 text-xs tabular-nums">
                Pagina {safePage} de {totalPages}
              </span>
              {safePage < totalPages ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={nextHref}>Proxima</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                  className="cursor-not-allowed"
                >
                  Proxima
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
