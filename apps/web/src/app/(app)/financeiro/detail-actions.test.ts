import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), server: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: mocks.context,
  hasAnyPermission: (codes: Set<string>, allowed: string[]) =>
    allowed.some((code) => codes.has(code)),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.server,
}));
vi.mock("@/lib/reports/time-zone", () => ({
  loadReportTimeZone: async () => "America/Fortaleza",
  zonedDateKey: () => "2026-09-27",
}));
import { loadFinancialDetails } from "./detail-actions";

const org = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
type Result = { data: unknown; error?: unknown; count?: number };
type Query = { table: string; filters: Array<[string, unknown]> };
let queries: Query[];
let results: Record<string, Result>;

function grant(...codes: string[]) {
  mocks.context.mockResolvedValue({
    organization: { id: org },
    effectiveUser: { id: user },
    permissionCodes: new Set(codes),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  results = {
    accounts_receivable: {
      data: {
        id,
        description: "Consulta",
        amount: 400,
        paid_amount: 100,
        due_date: "2026-09-20",
        status: "partial",
        patients: null,
        professionals: null,
        notes: "Parcela",
        financial_categories: null,
      },
    },
    payments: { data: [], count: 0 },
    payment_methods: { data: [{ id, name: "Pix" }] },
    professionals: { data: { id: "professional-id" } },
    professional_payouts: {
      data: {
        id,
        amount: 100,
        status: "pending",
        due_date: "2026-09-28",
        professionals: { name: "Dra. Maria" },
        paid_at: null,
      },
    },
  };
  mocks.server.mockResolvedValue({
    from(table: string) {
      const query = { table, filters: [] } as Query;
      queries.push(query);
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          query.filters.push([column, value]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        returns: () => Promise.resolve(results[table]),
        maybeSingle: () => Promise.resolve(results[table]),
      };
      return builder;
    },
  });
});

describe("financial detail authorization and balances", () => {
  it("does not query the database without finance permission", async () => {
    grant("paciente.ver");
    expect((await loadFinancialDetails("receivable", id)).error).toMatch(
      /permissão/,
    );
    expect(mocks.server).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers before querying", async () => {
    expect(
      (await loadFinancialDetails("receivable", "invalid")).error,
    ).toBeTruthy();
    expect(mocks.server).not.toHaveBeenCalled();
  });
  it("loads actual partial receipts and scopes every query to the clinic", async () => {
    grant("financeiro.receber_pagamento");
    const result = await loadFinancialDetails("receivable", id);
    expect(result.data).toMatchObject({
      amount: 400,
      paidAmount: 100,
      canSettle: true,
      today: "2026-09-27",
      paymentMethods: [{ name: "Pix" }],
    });
    expect(queries.length).toBe(3);
    for (const query of queries)
      expect(query.filters).toContainEqual(["organization_id", org]);
    expect(queries[0].filters).toContainEqual(["id", id]);
    expect(queries[1].filters).toContainEqual(["account_receivable_id", id]);
  });
  it("view-only access never exposes settlement action", async () => {
    grant("financeiro.ver_geral");
    expect((await loadFinancialDetails("receivable", id)).data?.canSettle).toBe(
      false,
    );
    expect(queries.some((q) => q.table === "payment_methods")).toBe(false);
  });
  it("paid and cancelled receivables cannot be settled", async () => {
    grant("financeiro.receber_pagamento");
    for (const status of ["paid", "cancelled", "written_off"]) {
      results.accounts_receivable.data = {
        ...(results.accounts_receivable.data as object),
        status,
      };
      expect(
        (await loadFinancialDetails("receivable", id)).data?.canSettle,
      ).toBe(false);
    }
  });
  it("missing record stops before fetching payment history", async () => {
    grant("financeiro.ver_geral");
    results.accounts_receivable = { data: null };
    expect((await loadFinancialDetails("receivable", id)).error).toMatch(
      /não encontrado/,
    );
    expect(queries).toHaveLength(1);
  });
  it("failed history is reported instead of showing an empty list", async () => {
    grant("financeiro.ver_geral");
    results.payments = { data: null, error: { code: "network" } };
    expect((await loadFinancialDetails("receivable", id)).error).toMatch(
      /recebimentos/,
    );
  });
  it("own-payout access adds professional ownership scope", async () => {
    grant("financeiro.ver_proprio_repasse");
    expect((await loadFinancialDetails("payout", id)).data?.canSettle).toBe(
      false,
    );
    expect(
      queries.find((q) => q.table === "professionals")?.filters,
    ).toContainEqual(["user_id", user]);
    expect(
      queries.find((q) => q.table === "professional_payouts")?.filters,
    ).toContainEqual(["professional_id", "professional-id"]);
    for (const query of queries)
      expect(query.filters).toContainEqual(["organization_id", org]);
  });
  it("own-payout access with no professional does not load a payout", async () => {
    grant("financeiro.ver_proprio_repasse");
    results.professionals = { data: null };
    expect((await loadFinancialDetails("payout", id)).error).toBeTruthy();
  });
  it("receivable permission cannot read accounts payable", async () => {
    grant("financeiro.receber_pagamento");
    expect((await loadFinancialDetails("payable", id)).error).toMatch(
      /permissão/,
    );
    expect(mocks.server).not.toHaveBeenCalled();
  });
});
