import { ReportPage, type ReportsSearchParams } from "../report-page";

export default function ClinicalReportsPage({
  searchParams,
}: {
  searchParams?: ReportsSearchParams;
}) {
  return <ReportPage searchParams={searchParams} view="clinical" />;
}
