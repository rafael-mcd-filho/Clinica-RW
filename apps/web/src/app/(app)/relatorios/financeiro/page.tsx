import { ReportPage, type ReportsSearchParams } from "../report-page";

export default function FinancialReportsPage({
  searchParams,
}: {
  searchParams?: ReportsSearchParams;
}) {
  return <ReportPage searchParams={searchParams} view="financial" />;
}
