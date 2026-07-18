export type AccessPermission = {
  id: string;
  code: string;
  category: string;
  description: string;
};

export type AccessProfile = {
  id: string;
  name: string;
  description: string | null;
  isSystemDefault: boolean;
  permissionIds: string[];
  userCount: number;
};

export type ResourceScope = {
  resourceType: "agenda" | "profissional" | "unidade" | "especialidade";
  resourceId: string | null;
  accessLevel: "read" | "write" | "full";
};

export type PermissionOverrideValue = {
  permissionId: string;
  granted: boolean;
};

export type CompanyAccessUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "invited" | "active" | "suspended";
  authUserId: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  profileIds: string[];
  profileNames: string[];
  professionalId: string | null;
  professionalName: string | null;
  overrides: PermissionOverrideValue[];
  scopes: ResourceScope[];
};

export type AccessProfessional = {
  id: string;
  name: string;
  userId: string | null;
  active: boolean;
};

export type AccessSchedule = {
  id: string;
  name: string;
  professionalId: string;
  unitId: string;
  active: boolean;
};

export type AccessUnit = {
  id: string;
  name: string;
  active: boolean;
};

export type AccessSpecialty = {
  id: string;
  name: string;
  active: boolean;
};

export type AccessAuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorName: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type CompanyAccessData = {
  currentUserId: string;
  users: CompanyAccessUser[];
  profiles: AccessProfile[];
  permissions: AccessPermission[];
  professionals: AccessProfessional[];
  schedules: AccessSchedule[];
  units: AccessUnit[];
  specialties: AccessSpecialty[];
  auditEvents: AccessAuditEvent[];
};

export type AccessActionState = {
  ok?: boolean;
  error?: string;
  link?: string;
};
