import { renderFinanceiroPage } from "../page";

export default async function ContasAPagarPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFinanceiroPage("a-pagar", props);
}
