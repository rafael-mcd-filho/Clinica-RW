/**
 * Busca todas as linhas de uma consulta em páginas.
 *
 * O PostgREST do Supabase devolve no máximo 1.000 linhas por requisição (o
 * "Max rows" do projeto). Sem paginar, um relatório de uma clínica com mais
 * agendamentos que isso saía com números errados e sem aviso (Raio-X R1).
 * A consulta precisa de ordem estável (inclua `id` no fim) para as páginas
 * não repetirem nem pularem linhas.
 */
export async function fetchAllRows<T>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  { pageSize = 1000, maxRows = 100_000 } = {},
): Promise<{ data: T[]; error: unknown | null; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { data: rows, error, truncated: false };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize)
      return { data: rows, error: null, truncated: false };
  }
  return { data: rows, error: null, truncated: true };
}
