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

const PHOTO_BUCKET = "contact-photos";
/** Foto de perfil muda pouco; uma semana evita bater na Evolution à toa. */
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type ContactRow = {
  phone: string;
  photo_path: string | null;
  photo_checked_at: string | null;
};

/**
 * Foto do contato, servida do cache.
 *
 * Antes cada requisição fazia três idas à rede — montar a credencial da
 * Evolution, perguntar a URL da foto e baixar a imagem no CDN do WhatsApp —
 * mesmo que a mesma foto já tivesse sido baixada minutos antes por outro
 * usuário. Com dezenas de conversas na lista, era isso vezes dezenas a cada
 * cache frio do navegador.
 *
 * Agora a imagem é gravada no bucket na primeira visita e servida de lá; a
 * Evolution só é consultada de novo quando o registro passa de uma semana.
 * Contato sem foto também é registrado, senão o caso mais comum numa lista
 * grande continuaria batendo fora a cada visita.
 */
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
    .select("phone, photo_path, photo_checked_at")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle<ContactRow>();

  if (!contact?.phone) return noPhoto();

  const checkedAt = contact.photo_checked_at
    ? Date.parse(contact.photo_checked_at)
    : 0;
  const isFresh = Number.isFinite(checkedAt)
    ? Date.now() - checkedAt < REFRESH_AFTER_MS
    : false;

  if (isFresh) {
    // Conferido há pouco e sem foto: responde na hora, sem sair para a rede.
    if (!contact.photo_path) return noPhoto();
    const cached = await admin.storage
      .from(PHOTO_BUCKET)
      .download(contact.photo_path);
    if (cached.data) return photoResponse(cached.data);
  }

  try {
    const config = await getOrganizationEvolutionConfig(organizationId);
    if (!config) return noPhoto();

    const profileUrl = await getContactProfilePictureUrl(contact.phone, config);
    if (!profileUrl) return markWithoutPhoto(admin, organizationId, id);

    const image = await fetch(profileUrl, { cache: "no-store" });
    if (!image.ok) return markWithoutPhoto(admin, organizationId, id);

    const contentType = image.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await image.arrayBuffer());
    const path = `${organizationId}/${id}.jpg`;

    const { error: uploadError } = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });

    // Falha ao gravar não pode impedir a resposta: perde-se o cache desta vez,
    // não a foto.
    if (!uploadError) {
      await admin
        .from("whatsapp_contacts")
        .update({
          photo_path: path,
          photo_checked_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", id);
    }

    return photoResponse(new Blob([bytes], { type: contentType }));
  } catch {
    return noPhoto();
  }
}

async function markWithoutPhoto(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  contactId: string,
) {
  await admin
    .from("whatsapp_contacts")
    .update({ photo_path: null, photo_checked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", contactId);
  return noPhoto();
}

function photoResponse(body: Blob) {
  return new Response(body, {
    headers: {
      "Content-Type": body.type || "image/jpeg",
      "Cache-Control": "private, max-age=604800, stale-while-revalidate=86400",
      "Content-Disposition": "inline",
    },
  });
}

function noPhoto() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
