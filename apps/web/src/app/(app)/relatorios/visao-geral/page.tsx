import { ReportPage, type ReportsSearchParams } from "../report-page";

export default function ReportsOverviewPage({
  searchParams,
}: {
  searchParams?: ReportsSearchParams;
}) {
  return <ReportPage searchParams={searchParams} view="overview" />;
}
