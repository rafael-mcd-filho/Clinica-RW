import { renderFinanceiroPage } from "../page";

export default async function MovimentacoesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFinanceiroPage("movimentacoes", props);
}
