import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !["atendimento.ver", "atendimento.atender", "atendimento.configurar"].some(
      (code) => context.permissionCodes.has(code),
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: message } = await admin
    .from("whatsapp_messages")
    .select("media_url, media_mime_type")
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .maybeSingle<{
      media_url: string | null;
      media_mime_type: string | null;
    }>();
  if (!message?.media_url)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await admin.storage
    .from("whatsapp-media")
    .download(message.media_url);
  if (error || !data)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type":
        message.media_mime_type ?? data.type ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
    },
  });
}
