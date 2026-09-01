import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MediaRouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: MediaRouteContext) {
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
  const buffer = await data.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type":
        message.media_mime_type ?? data.type ?? "application/octet-stream",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
    },
  });
}

export async function HEAD(request: Request, context: MediaRouteContext) {
  const response = await GET(request, context);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
