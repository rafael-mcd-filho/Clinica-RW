const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERATED_LOGO_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g|webp|svg)$/i;
const PUBLIC_BRANDING_PATH_PREFIX = "/storage/v1/object/public/branding/";

export function getOrganizationBrandingPrefix(
  organizationId: string,
): string | null {
  const normalizedOrganizationId = organizationId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedOrganizationId)) {
    return null;
  }

  return `organizations/${normalizedOrganizationId}`;
}

/**
 * Returns a Storage object path only when the URL is a generated organization
 * logo on the configured Supabase origin and in the public `branding` bucket.
 */
export function parseOrganizationLogoPublicUrl(
  logoUrl: string,
  organizationId: string,
  supabaseUrl: string,
): string | null {
  const organizationPrefix = getOrganizationBrandingPrefix(organizationId);
  if (!organizationPrefix) {
    return null;
  }

  try {
    const candidate = new URL(logoUrl);
    const expectedSupabaseUrl = new URL(supabaseUrl);

    if (candidate.origin !== expectedSupabaseUrl.origin) {
      return null;
    }

    if (!candidate.pathname.startsWith(PUBLIC_BRANDING_PATH_PREFIX)) {
      return null;
    }

    const objectPath = candidate.pathname.slice(
      PUBLIC_BRANDING_PATH_PREFIX.length,
    );
    const expectedPathPrefix = `${organizationPrefix}/`;
    if (!objectPath.startsWith(expectedPathPrefix)) {
      return null;
    }

    const fileName = objectPath.slice(expectedPathPrefix.length);
    if (!GENERATED_LOGO_FILE_PATTERN.test(fileName)) {
      return null;
    }

    return `${expectedPathPrefix}${fileName}`;
  } catch {
    return null;
  }
}
