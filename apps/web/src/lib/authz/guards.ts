import { redirect } from "next/navigation";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";

export async function requireCompanyPermission(permissionCodes: string[]) {
  const context = await getRequestContext();
  const organization = context.organization;

  if (
    context.isSuperAdmin ||
    !organization ||
    !hasAnyPermission(context.permissionCodes, permissionCodes)
  ) {
    redirect("/dashboard");
  }

  return { ...context, organization };
}
