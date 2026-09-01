import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import { getContactProfilePictureUrl } from "@/lib/whatsapp/evolution-client";

const allowedPermissions = [
  "atendimento.ver",
  "atendimento.atender",
  "atendimento.configurar",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !allowedPermissions.some((code) => context.permissionCodes.has(code))
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const organizationId = context.organization.id;
  const admin = createSupabaseAdminClient();
  const { data: contact } = await admin
    .from("whatsapp_contacts")
    .select("phone")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle<{ phone: string }>();

  if (!contact?.phone) {
    return noPhoto();
  }

  try {
    const config = await getOrganizationEvolutionConfig(organizationId);
    if (!config) return noPhoto();

    const profileUrl = await getContactProfilePictureUrl(contact.phone, config);
    if (!profileUrl) return noPhoto();

    const image = await fetch(profileUrl, { cache: "no-store" });
    if (!image.ok || !image.body) return noPhoto();

    return new Response(image.body, {
      headers: {
        "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=21600, stale-while-revalidate=86400",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return noPhoto();
  }
}

function noPhoto() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
