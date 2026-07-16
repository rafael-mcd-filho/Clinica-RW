import { renderFinanceiroPage } from "../page";

export default async function RepassesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFinanceiroPage("repasses", props);
}
