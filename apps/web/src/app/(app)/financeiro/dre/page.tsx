import { renderFinanceiroPage } from "../page";

export default async function DrePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFinanceiroPage("dre", props);
}
