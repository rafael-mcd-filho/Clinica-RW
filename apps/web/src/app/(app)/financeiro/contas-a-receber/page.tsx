import { renderFinanceiroPage } from "../page";

export default async function ContasAReceberPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFinanceiroPage("a-receber", props);
}
