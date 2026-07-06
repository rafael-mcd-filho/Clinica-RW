import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { notFound } from "next/navigation";
import {
  ReceiptDocument,
  type ReceiptPdfData,
} from "@/lib/pdf/receipt-document";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PaymentRow = {
  id: string;
  organization_id: string;
  account_receivable_id: string;
  payment_method_id: string;
  amount: number;
  paid_at: string;
};

type ReceivableRow = {
  id: string;
  patient_id: string;
  professional_id: string | null;
  description: string;
  amount: number;
};

type PatientRow = {
  full_name: string;
  social_name: string | null;
  cpf: string | null;
};

type ProfessionalRow = {
  name: string;
};

type PaymentMethodRow = {
  name: string;
};

type ClinicRow = ReceiptPdfData["clinic"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from("payments")
    .select(
      "id, organization_id, account_receivable_id, payment_method_id, amount, paid_at",
    )
    .eq("id", id)
    .maybeSingle<PaymentRow>();

  if (!payment) notFound();

  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, patient_id, professional_id, description, amount")
    .eq("organization_id", payment.organization_id)
    .eq("id", payment.account_receivable_id)
    .single<ReceivableRow>();

  if (!receivable) notFound();

  const [patientResult, professionalResult, methodResult, clinicResult] =
    await Promise.all([
      supabase
        .from("patients")
        .select("full_name, social_name, cpf")
        .eq("organization_id", payment.organization_id)
        .eq("id", receivable.patient_id)
        .single<PatientRow>(),
      receivable.professional_id
        ? supabase
            .from("professionals")
            .select("name")
            .eq("organization_id", payment.organization_id)
            .eq("id", receivable.professional_id)
            .maybeSingle<ProfessionalRow>()
        : Promise.resolve({ data: null }),
      supabase
        .from("payment_methods")
        .select("name")
        .eq("organization_id", payment.organization_id)
        .eq("id", payment.payment_method_id)
        .single<PaymentMethodRow>(),
      supabase
        .from("clinics")
        .select("trade_name, legal_name, document, phone, email, city, state")
        .eq("organization_id", payment.organization_id)
        .maybeSingle<ClinicRow>(),
    ]);

  if (!patientResult.data || !methodResult.data) notFound();

  const pdfBytes = await renderToBuffer(
    createElement(ReceiptDocument, {
      data: {
        clinic: clinicResult.data,
        methodName: methodResult.data.name,
        patient: patientResult.data,
        payment,
        professionalName: professionalResult.data?.name ?? null,
        receivable,
      },
    }),
  );

  const body = new Uint8Array(pdfBytes).buffer;

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${payment.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
