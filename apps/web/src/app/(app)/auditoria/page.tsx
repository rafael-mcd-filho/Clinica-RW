import Link from "next/link";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";
import {
  AuditLogTable,
  type AuditLogItem,
  type JsonValue,
} from "./audit-log-table";
import { ClockCounterClockwise as History } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePickerInput } from "@/components/ui/date-picker-input";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrEmpty(value: string | undefined) {
  return value && uuidPattern.test(value) ? value : "";
}

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
  hideImpersonation: boolean;
  page: number;
  actor?: string;
  patient?: string;
  action?: string;
}) {
  const search = new URLSearchParams();
  if (params.organizationId) search.set("empresa", params.organizationId);
  if (params.actor) search.set("usuario", params.actor);
  if (params.patient) search.set("paciente", params.patient);
  if (params.action) search.set("acao", params.action);
  if (params.dateFrom) search.set("de", params.dateFrom);
  if (params.dateTo) search.set("ate", params.dateTo);
  if (params.hideImpersonation) search.set("ocultar_impersonacao", "1");
  if (params.page > 1) search.set("pagina", String(params.page));
  const query = search.toString();
  return query ? `/auditoria?${query}` : "/auditoria";
}

export default async function AuditoriaPage({ searchParams }: PageProps) {
  const context = await getRequestContext();
  // Super admin vê a plataforma toda; o admin da clínica (empresa ou
  // acessos), só a própria clínica — a RLS de audit_logs já garante isso.
  const isClinicAdmin =
    !context.isSuperAdmin &&
    Boolean(context.organization) &&
    (context.permissionCodes.has("config.geral") ||
      context.permissionCodes.has("config.usuarios"));
  if (!context.isSuperAdmin && !isClinicAdmin) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const organizationId = isClinicAdmin
    ? (context.organization?.id ?? "")
    : (firstParam(params.empresa) ?? "");
  const actorFilter = uuidOrEmpty(firstParam(params.usuario));
  const patientFilter = uuidOrEmpty(firstParam(params.paciente));
  const actionFilter = (firstParam(params.acao) ?? "").trim().slice(0, 80);
  const dateFrom = normalizeDate(firstParam(params.de));
  const dateTo = normalizeDate(firstParam(params.ate));
  const hideImpersonation = firstParam(params.ocultar_impersonacao) === "1";
  const requestedPage = Number(firstParam(params.pagina) ?? "1");
  const currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createSupabaseServerClient();
  const { data: allOrganizations } = isClinicAdmin
    ? { data: [] as OrganizationRow[] }
    : await supabase
        .from("organizations")
        .select("id, name")
        .order("name")
        .returns<OrganizationRow[]>();

  const validOrganization = isClinicAdmin
    ? organizationId
    : organizationId &&
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
  if (hideImpersonation) {
    query = query.not("action", "like", "impersonation.%");
  }
  if (actorFilter) {
    query = query.eq("actor_user_id", actorFilter);
  }
  if (patientFilter) {
    // Tudo do paciente: alterações no cadastro e leituras do prontuário.
    query = query.or(
      `resource_id.eq.${patientFilter},metadata->>patient_id.eq.${patientFilter}`,
    );
  }
  if (actionFilter) {
    query = query.like("action", `${actionFilter}%`);
  }

  const { data: auditRows, error, count } = await query.returns<AuditRow[]>();
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total > 0 && currentPage > totalPages) {
    redirect(
      buildHref({
        organizationId: isClinicAdmin ? "" : validOrganization,
        dateFrom,
        dateTo,
        hideImpersonation,
        actor: actorFilter,
        patient: patientFilter,
        action: actionFilter,
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
  const [{ data: organizationUsers }, { data: filteredPatient }] =
    await Promise.all([
      isClinicAdmin && context.organization
        ? supabase
            .from("app_users")
            .select("id, name")
            .eq("organization_id", context.organization.id)
            .order("name")
            .returns<ActorRow[]>()
        : Promise.resolve({ data: [] as ActorRow[] }),
      patientFilter
        ? supabase
            .from("patients")
            .select("full_name, social_name")
            .eq("id", patientFilter)
            .maybeSingle<{ full_name: string; social_name: string | null }>()
        : Promise.resolve({
            data: null as {
              full_name: string;
              social_name: string | null;
            } | null,
          }),
    ]);
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
      ? (actorNames.get(audit.actor_user_id) ?? "Usuário")
      : "Sistema",
    action: audit.action,
    resourceType: audit.resource_type,
    resourceId: audit.resource_id,
    createdAt: audit.created_at,
    metadata: audit.metadata ?? {},
  }));

  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = Math.min(from + rows.length, total);
  const filterParams = {
    organizationId: isClinicAdmin ? "" : validOrganization,
    dateFrom,
    dateTo,
    hideImpersonation,
    actor: actorFilter,
    patient: patientFilter,
    action: actionFilter,
  };
  const previousHref = buildHref({
    ...filterParams,
    page: Math.max(1, safePage - 1),
  });
  const nextHref = buildHref({ ...filterParams, page: safePage + 1 });

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={History}
        title="Auditoria"
        description={
          isClinicAdmin
            ? "Quem alterou e quem abriu o quê na clínica."
            : "Ações sensíveis registradas para rastreabilidade."
        }
      />

      <form
        action="/auditoria"
        className={cn(
          "grid gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:items-end",
          isClinicAdmin
            ? "md:grid-cols-[1fr_1fr_18rem_auto_auto]"
            : "md:grid-cols-[1fr_18rem_auto_auto]",
        )}
      >
        {patientFilter ? (
          <input type="hidden" name="paciente" value={patientFilter} />
        ) : null}
        {isClinicAdmin ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              Usuário
              <Select
                name="usuario"
                defaultValue={actorFilter}
                allowEmptyOption
              >
                <option value="">Todos os usuários</option>
                {(organizationUsers ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Tipo de evento
              <Select name="acao" defaultValue={actionFilter} allowEmptyOption>
                <option value="">Todos</option>
                <option value="clinical_record.viewed">
                  Acessos ao prontuário
                </option>
                <option value="patient">Pacientes</option>
                <option value="appointments">Agenda</option>
                <option value="encounter">Atendimentos e anexos</option>
                <option value="clinical_documents">Documentos clínicos</option>
                <option value="impersonation">Suporte da plataforma</option>
              </Select>
            </label>
          </>
        ) : (
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
        )}

        <label className="grid gap-2 text-sm font-medium">
          Período
          <DateRangePickerInput
            fromName="de"
            toName="ate"
            defaultFrom={dateFrom}
            defaultTo={dateTo}
          />
        </label>

        <Button type="submit" size="lg">
          Filtrar
        </Button>
        <Button asChild type="button" variant="secondary" size="lg">
          <Link href="/auditoria">Limpar</Link>
        </Button>

        {patientFilter ? (
          <p className="text-body-sm text-secondary-foreground md:col-span-full">
            Mostrando o histórico de{" "}
            <span className="font-semibold">
              {filteredPatient?.social_name ||
                filteredPatient?.full_name ||
                "um paciente"}
            </span>
            : alterações no cadastro e acessos ao prontuário.{" "}
            <Link
              href={buildHref({ ...filterParams, patient: "", page: 1 })}
              className="font-medium text-primary hover:underline"
            >
              Ver todos
            </Link>
          </p>
        ) : null}
        <div className="md:col-span-full">
          <Checkbox
            name="ocultar_impersonacao"
            value="1"
            defaultChecked={hideImpersonation}
            label="Ocultar início/fim de impersonação de suporte"
          />
        </div>
      </form>

      <section className="app-list-table-lg overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="app-list-row hidden grid-cols-[1.35fr_0.95fr_0.9fr_0.65fr_5rem] gap-4 border-b border-border bg-muted px-5 py-3 text-xs font-semibold text-foreground lg:grid">
          <span className="app-list-cell">Evento</span>
          <span className="app-list-cell">Empresa</span>
          <span className="app-list-cell">Responsável</span>
          <span className="app-list-cell">Data</span>
          <span className="app-list-cell">Detalhes</span>
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
                Página {safePage} de {totalPages}
              </span>
              {safePage < totalPages ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={nextHref}>Próxima</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                  className="cursor-not-allowed"
                >
                  Próxima
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
