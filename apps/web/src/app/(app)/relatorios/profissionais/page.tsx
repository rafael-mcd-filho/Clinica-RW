import { ReportPage, type ReportsSearchParams } from "../report-page";

export default function ProfessionalReportsPage({
  searchParams,
}: {
  searchParams?: ReportsSearchParams;
}) {
  return <ReportPage searchParams={searchParams} view="professionals" />;
}
