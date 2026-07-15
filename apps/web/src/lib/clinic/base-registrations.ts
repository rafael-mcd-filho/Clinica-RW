import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationSettingsRow = {
  id: string;
  organization_id: string;
  timezone: string;
  locale: string;
  automatic_mode: boolean;
  onboarding_completed_at: string | null;
};

export type ClinicRow = {
  id: string;
  organization_id: string;
  trade_name: string;
  legal_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export type BaseRow = {
  id: string;
  name: string;
  active: boolean;
};

export type UnitRow = BaseRow & {
  code: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export type RoomRow = BaseRow & {
  unit_id: string;
  description: string | null;
};

export type EquipmentRow = BaseRow & {
  unit_id: string | null;
  description: string | null;
};

export type SpecialtyRow = BaseRow & {
  cbo_code: string | null;
};

export type ProfessionalRow = BaseRow & {
  user_id: string | null;
  specialty_id: string | null;
  council_type: string | null;
  council_number: string | null;
  council_state: string | null;
};

export type ProcedureRow = BaseRow & {
  code: string | null;
  duration_minutes: number;
  base_price: number;
};

export type ProcedureCostRow = {
  id: string;
  procedure_id: string;
  name: string;
  cost_type: "commission" | "location_fee" | "other";
  calculation_type: "fixed" | "percentage";
  value: number;
  active: boolean;
};

export type PaymentMethodRow = BaseRow & {
  method_type:
    | "cash"
    | "pix"
    | "credit_card"
    | "debit_card"
    | "bank_transfer"
    | "other";
};

export type PaymentMethodFeeRow = {
  id: string;
  payment_method_id: string;
  name: string;
  calculation_type: "fixed" | "percentage";
  value: number;
  active: boolean;
};

export type HealthInsuranceRow = BaseRow & {
  document: string | null;
};

export type PriceTableRow = BaseRow & {
  health_insurance_id: string | null;
};

export type PriceTableItemRow = {
  id: string;
  price_table_id: string;
  procedure_id: string;
  price: number;
};

export type BusinessHourRow = {
  id: string;
  unit_id: string | null;
  professional_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  active: boolean;
};

export type AppUserOption = {
  id: string;
  name: string;
  email: string;
};

export type CompanySettingsData = {
  organization: { id: string; name: string; mode: "solo" | "clinic" };
  settings: OrganizationSettingsRow;
  clinic: ClinicRow;
  units: UnitRow[];
  rooms: RoomRow[];
  equipment: EquipmentRow[];
  specialties: SpecialtyRow[];
  professionals: ProfessionalRow[];
  procedures: ProcedureRow[];
  procedureCosts: ProcedureCostRow[];
  paymentMethods: PaymentMethodRow[];
  paymentMethodFees: PaymentMethodFeeRow[];
  healthInsurances: HealthInsuranceRow[];
  priceTables: PriceTableRow[];
  priceTableItems: PriceTableItemRow[];
  businessHours: BusinessHourRow[];
  users: AppUserOption[];
};

export async function getCompanySettingsData(
  organization: CompanySettingsData["organization"],
): Promise<CompanySettingsData> {
  const supabase = await createSupabaseServerClient();
  const organizationId = organization.id;

  const [
    settingsResult,
    clinicResult,
    unitsResult,
    roomsResult,
    equipmentResult,
    specialtiesResult,
    professionalsResult,
    proceduresResult,
    procedureCostsResult,
    paymentMethodsResult,
    paymentMethodFeesResult,
    healthInsurancesResult,
    priceTablesResult,
    priceTableItemsResult,
    businessHoursResult,
    usersResult,
  ] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "id, organization_id, timezone, locale, automatic_mode, onboarding_completed_at",
      )
      .eq("organization_id", organizationId)
      .single<OrganizationSettingsRow>(),
    supabase
      .from("clinics")
      .select(
        "id, organization_id, trade_name, legal_name, document, phone, email, postal_code, address_line, address_number, address_complement, district, city, state",
      )
      .eq("organization_id", organizationId)
      .single<ClinicRow>(),
    supabase
      .from("units")
      .select(
        "id, name, code, phone, email, postal_code, address_line, address_number, address_complement, district, city, state, active",
      )
      .eq("organization_id", organizationId)
      .order("name")
      .returns<UnitRow[]>(),
    supabase
      .from("rooms")
      .select("id, unit_id, name, description, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<RoomRow[]>(),
    supabase
      .from("equipment")
      .select("id, unit_id, name, description, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<EquipmentRow[]>(),
    supabase
      .from("specialties")
      .select("id, name, cbo_code, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<SpecialtyRow[]>(),
    supabase
      .from("professionals")
      .select(
        "id, user_id, specialty_id, name, council_type, council_number, council_state, active",
      )
      .eq("organization_id", organizationId)
      .order("name")
      .returns<ProfessionalRow[]>(),
    supabase
      .from("procedures")
      .select("id, name, code, duration_minutes, base_price, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<ProcedureRow[]>(),
    supabase
      .from("procedure_costs")
      .select(
        "id, procedure_id, name, cost_type, calculation_type, value, active",
      )
      .eq("organization_id", organizationId)
      .order("created_at")
      .returns<ProcedureCostRow[]>(),
    supabase
      .from("payment_methods")
      .select("id, name, method_type, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<PaymentMethodRow[]>(),
    supabase
      .from("payment_method_fees")
      .select("id, payment_method_id, name, calculation_type, value, active")
      .eq("organization_id", organizationId)
      .order("created_at")
      .returns<PaymentMethodFeeRow[]>(),
    supabase
      .from("health_insurances")
      .select("id, name, document, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<HealthInsuranceRow[]>(),
    supabase
      .from("price_tables")
      .select("id, name, health_insurance_id, active")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<PriceTableRow[]>(),
    supabase
      .from("price_table_items")
      .select("id, price_table_id, procedure_id, price")
      .eq("organization_id", organizationId)
      .order("created_at")
      .returns<PriceTableItemRow[]>(),
    supabase
      .from("business_hours")
      .select(
        "id, unit_id, professional_id, weekday, start_time, end_time, lunch_start_time, lunch_end_time, active",
      )
      .eq("organization_id", organizationId)
      .order("weekday")
      .returns<BusinessHourRow[]>(),
    supabase
      .from("app_users")
      .select("id, name, email")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name")
      .returns<AppUserOption[]>(),
  ]);

  const firstError = [
    settingsResult,
    clinicResult,
    unitsResult,
    roomsResult,
    equipmentResult,
    specialtiesResult,
    professionalsResult,
    proceduresResult,
    procedureCostsResult,
    paymentMethodsResult,
    paymentMethodFeesResult,
    healthInsurancesResult,
    priceTablesResult,
    priceTableItemsResult,
    businessHoursResult,
    usersResult,
  ].find((result) => result.error)?.error;

  if (firstError || !settingsResult.data || !clinicResult.data) {
    throw new Error(
      firstError?.message ?? "Configurações da empresa não foram encontradas.",
    );
  }

  return {
    organization,
    settings: settingsResult.data,
    clinic: clinicResult.data,
    units: unitsResult.data ?? [],
    rooms: roomsResult.data ?? [],
    equipment: equipmentResult.data ?? [],
    specialties: specialtiesResult.data ?? [],
    professionals: professionalsResult.data ?? [],
    procedures: proceduresResult.data ?? [],
    procedureCosts: procedureCostsResult.data ?? [],
    paymentMethods: paymentMethodsResult.data ?? [],
    paymentMethodFees: paymentMethodFeesResult.data ?? [],
    healthInsurances: healthInsurancesResult.data ?? [],
    priceTables: priceTablesResult.data ?? [],
    priceTableItems: priceTableItemsResult.data ?? [],
    businessHours: businessHoursResult.data ?? [],
    users: usersResult.data ?? [],
  };
}
