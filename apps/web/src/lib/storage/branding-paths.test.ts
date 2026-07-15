import { describe, expect, it } from "vitest";
import {
  getOrganizationBrandingPrefix,
  parseOrganizationLogoPublicUrl,
} from "./branding-paths";

const ORGANIZATION_ID = "13f9f162-8e2f-4b67-9410-3f611c158abb";
const OTHER_ORGANIZATION_ID = "92b0641a-477b-46a7-8ba2-d35edc39b5a2";
const FILE_ID = "f75ee45a-57a3-4f29-89bf-49cd51b789cf";
const SUPABASE_URL = "https://project.supabase.co";

function publicLogoUrl(organizationId = ORGANIZATION_ID) {
  return `${SUPABASE_URL}/storage/v1/object/public/branding/organizations/${organizationId}/${FILE_ID}.png`;
}

describe("organization branding paths", () => {
  it("builds a tenant-scoped prefix only for a valid organization UUID", () => {
    expect(getOrganizationBrandingPrefix(ORGANIZATION_ID)).toBe(
      `organizations/${ORGANIZATION_ID}`,
    );
    expect(getOrganizationBrandingPrefix("../other-company")).toBeNull();
    expect(getOrganizationBrandingPrefix("")).toBeNull();
  });

  it("accepts a generated public branding URL for the same organization", () => {
    expect(
      parseOrganizationLogoPublicUrl(
        publicLogoUrl(),
        ORGANIZATION_ID,
        SUPABASE_URL,
      ),
    ).toBe(`organizations/${ORGANIZATION_ID}/${FILE_ID}.png`);
  });

  it("rejects a logo belonging to another organization", () => {
    expect(
      parseOrganizationLogoPublicUrl(
        publicLogoUrl(OTHER_ORGANIZATION_ID),
        ORGANIZATION_ID,
        SUPABASE_URL,
      ),
    ).toBeNull();
  });

  it.each([
    `https://attacker.example/storage/v1/object/public/branding/organizations/${ORGANIZATION_ID}/${FILE_ID}.png`,
    `${SUPABASE_URL}/storage/v1/object/public/other/organizations/${ORGANIZATION_ID}/${FILE_ID}.png`,
    `${SUPABASE_URL}/storage/v1/object/sign/branding/organizations/${ORGANIZATION_ID}/${FILE_ID}.png`,
    `${SUPABASE_URL}/storage/v1/object/public/branding/org/${FILE_ID}.png`,
    `${SUPABASE_URL}/storage/v1/object/public/branding/organizations/${ORGANIZATION_ID}/nested/${FILE_ID}.png`,
    `${SUPABASE_URL}/storage/v1/object/public/branding/organizations/${ORGANIZATION_ID}/custom-name.png`,
    "not-a-url",
  ])("rejects an unsafe or unscoped URL: %s", (logoUrl) => {
    expect(
      parseOrganizationLogoPublicUrl(logoUrl, ORGANIZATION_ID, SUPABASE_URL),
    ).toBeNull();
  });
});
