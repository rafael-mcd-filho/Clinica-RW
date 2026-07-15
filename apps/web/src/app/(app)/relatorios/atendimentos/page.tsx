import { ReportPage, type ReportsSearchParams } from "../report-page";

export default function AttendanceReportsPage({
  searchParams,
}: {
  searchParams?: ReportsSearchParams;
}) {
  return <ReportPage searchParams={searchParams} view="operational" />;
}
