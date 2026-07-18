import "server-only";

import type { CompanyAccessData } from "./types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "invited" | "active" | "suspended";
  auth_user_id: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string;
  description: string | null;
  is_system_default: boolean;
};

type PermissionRow = {
  id: string;
  code: string;
  category: string;
  description: string;
};

type UserProfileRow = { user_id: string; profile_id: string };
type ProfilePermissionRow = { profile_id: string; permission_id: string };
type OverrideRow = { user_id: string; permission_id: string; granted: boolean };
type ScopeRow = {
  user_id: string;
  resource_type: "agenda" | "profissional" | "unidade" | "especialidade";
  resource_id: string | null;
  access_level: "read" | "write" | "full";
};
type ProfessionalRow = {
  id: string;
  name: string;
  user_id: string | null;
  active: boolean;
};
type ScheduleRow = {
  id: string;
  name: string;
  professional_id: string;
  unit_id: string;
  active: boolean;
};
type UnitRow = { id: string; name: string; active: boolean };
type SpecialtyRow = { id: string; name: string; active: boolean };
type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: unknown;
  created_at: string;
};
type ActorRow = { id: string; name: string };

export async function loadCompanyAccessData(
  organizationId: string,
  currentUserId: string,
): Promise<CompanyAccessData> {
  const supabase = await createSupabaseServerClient();
  const [
    usersResult,
    profilesResult,
    permissionsResult,
    professionalsResult,
    schedulesResult,
    unitsResult,
    specialtiesResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("app_users")
      .select("id, name, email, phone, status, auth_user_id, created_at")
      .eq("organization_id", organizationId)
      .eq("is_super_admin", false)
      .order("status")
      .order("name")
      .returns<UserRow[]>(),
    supabase
      .from("profiles")
      .select("id, name, description, is_system_default")
      .eq("organization_id", organizationId)
      .order("is_system_default", { ascending: false })
      .order("name")
      .returns<ProfileRow[]>(),
    supabase
      .from("permissions")
      .select("id, code, category, description")
      .order("category")
      .order("code")
      .returns<PermissionRow[]>(),
    supabase
      .from("professionals")
      .select("id, name, user_id, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<ProfessionalRow[]>(),
    supabase
      .from("schedules")
      .select("id, name, professional_id, unit_id, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<ScheduleRow[]>(),
    supabase
      .from("units")
      .select("id, name, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<UnitRow[]>(),
    supabase
      .from("specialties")
      .select("id, name, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<SpecialtyRow[]>(),
    supabase
      .from("audit_logs")
      .select(
        "id, actor_user_id, action, resource_type, resource_id, metadata, created_at",
      )
      .eq("organization_id", organizationId)
      .or(
        "action.like.user.%,action.like.profile.%,action.like.permission.%,action.like.scope.%,action.like.professional.user_link%",
      )
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<AuditRow[]>(),
  ]);

  const firstError = [
    usersResult.error,
    profilesResult.error,
    permissionsResult.error,
    professionalsResult.error,
    schedulesResult.error,
    unitsResult.error,
    specialtiesResult.error,
    auditResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const users = usersResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const userIds = users.map((user) => user.id);
  const profileIds = profiles.map((profile) => profile.id);

  const [
    userProfilesResult,
    profilePermissionsResult,
    overridesResult,
    scopesResult,
  ] = await Promise.all([
    userIds.length
      ? supabase
          .from("user_profiles")
          .select("user_id, profile_id")
          .in("user_id", userIds)
          .returns<UserProfileRow[]>()
      : Promise.resolve({ data: [] as UserProfileRow[], error: null }),
    profileIds.length
      ? supabase
          .from("profile_permissions")
          .select("profile_id, permission_id")
          .in("profile_id", profileIds)
          .returns<ProfilePermissionRow[]>()
      : Promise.resolve({ data: [] as ProfilePermissionRow[], error: null }),
    userIds.length
      ? supabase
          .from("user_permission_overrides")
          .select("user_id, permission_id, granted")
          .in("user_id", userIds)
          .returns<OverrideRow[]>()
      : Promise.resolve({ data: [] as OverrideRow[], error: null }),
    userIds.length
      ? supabase
          .from("resource_scopes")
          .select("user_id, resource_type, resource_id, access_level")
          .eq("organization_id", organizationId)
          .in("user_id", userIds)
          .returns<ScopeRow[]>()
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
  ]);

  const relationError = [
    userProfilesResult.error,
    profilePermissionsResult.error,
    overridesResult.error,
    scopesResult.error,
  ].find(Boolean);
  if (relationError) throw new Error(relationError.message);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const profileIdsByUser = groupValues(
    userProfilesResult.data ?? [],
    (row) => row.user_id,
    (row) => row.profile_id,
  );
  const permissionIdsByProfile = groupValues(
    profilePermissionsResult.data ?? [],
    (row) => row.profile_id,
    (row) => row.permission_id,
  );
  const overridesByUser = groupItems(
    overridesResult.data ?? [],
    (row) => row.user_id,
  );
  const scopesByUser = groupItems(
    scopesResult.data ?? [],
    (row) => row.user_id,
  );
  const professionalByUser = new Map(
    (professionalsResult.data ?? [])
      .filter((professional) => professional.user_id)
      .map((professional) => [professional.user_id as string, professional]),
  );
  const userCountByProfile = new Map<string, number>();
  for (const row of userProfilesResult.data ?? []) {
    userCountByProfile.set(
      row.profile_id,
      (userCountByProfile.get(row.profile_id) ?? 0) + 1,
    );
  }

  const actorIds = [
    ...new Set(
      (auditResult.data ?? [])
        .map((event) => event.actor_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: actors } = actorIds.length
    ? await supabase
        .from("app_users")
        .select("id, name")
        .in("id", actorIds)
        .returns<ActorRow[]>()
    : { data: [] as ActorRow[] };
  const actorNameById = new Map(
    (actors ?? []).map((actor) => [actor.id, actor.name]),
  );

  return {
    currentUserId,
    permissions: permissionsResult.data ?? [],
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.description,
      isSystemDefault: profile.is_system_default,
      permissionIds: permissionIdsByProfile.get(profile.id) ?? [],
      userCount: userCountByProfile.get(profile.id) ?? 0,
    })),
    users: users.map((user) => {
      const assignedProfileIds = profileIdsByUser.get(user.id) ?? [];
      const professional = professionalByUser.get(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        authUserId: user.auth_user_id,
        lastSignInAt: null,
        createdAt: user.created_at,
        profileIds: assignedProfileIds,
        profileNames: assignedProfileIds
          .map((profileId) => profileById.get(profileId)?.name)
          .filter((name): name is string => Boolean(name)),
        professionalId: professional?.id ?? null,
        professionalName: professional?.name ?? null,
        overrides: (overridesByUser.get(user.id) ?? []).map((override) => ({
          permissionId: override.permission_id,
          granted: override.granted,
        })),
        scopes: (scopesByUser.get(user.id) ?? []).map((scope) => ({
          resourceType: scope.resource_type,
          resourceId: scope.resource_id,
          accessLevel: scope.access_level,
        })),
      };
    }),
    professionals: (professionalsResult.data ?? []).map((professional) => ({
      id: professional.id,
      name: professional.name,
      userId: professional.user_id,
      active: professional.active,
    })),
    schedules: (schedulesResult.data ?? []).map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      professionalId: schedule.professional_id,
      unitId: schedule.unit_id,
      active: schedule.active,
    })),
    units: unitsResult.data ?? [],
    specialties: specialtiesResult.data ?? [],
    auditEvents: (auditResult.data ?? []).map((event) => ({
      id: event.id,
      action: event.action,
      resourceType: event.resource_type,
      resourceId: event.resource_id,
      actorName: event.actor_user_id
        ? (actorNameById.get(event.actor_user_id) ?? "Suporte da plataforma")
        : "Sistema",
      createdAt: event.created_at,
      metadata: asRecord(event.metadata),
    })),
  };
}

function groupValues<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => string,
) {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const groupKey = key(row);
    map.set(groupKey, [...(map.get(groupKey) ?? []), value(row)]);
  }
  return map;
}

function groupItems<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    map.set(groupKey, [...(map.get(groupKey) ?? []), row]);
  }
  return map;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
