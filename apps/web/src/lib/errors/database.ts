/**
 * Traduz o erro cru do Postgres/PostgREST para uma frase que a pessoa na tela
 * consegue agir em cima.
 *
 * Existe porque "permission denied for function phone_match_key" chegou a
 * aparecer dentro do formulário de cadastro de paciente: quem está atendendo
 * não tem como saber que aquilo é um `grant` faltando numa migration. Cada
 * ramo aqui diz o que aconteceu e o que fazer — quando a saída é aplicar
 * migration, o texto fala isso com todas as letras, porque é sempre o mesmo
 * conserto.
 *
 * O que não for reconhecido volta com o texto original: esconder um erro
 * desconhecido atrás de "algo deu errado" é pior do que mostrar o original
 * para quem for investigar.
 */
export type DatabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function databaseErrorMessage(
  error: DatabaseErrorLike | null | undefined,
  fallback = "Não foi possível concluir a operação.",
): string {
  if (!error) return fallback;
  const message = error.message ?? "";
  const code = error.code ?? "";

  // Estrutura que o banco ainda não tem: quase sempre migration pendente.
  const missingFunction = message.match(
    /function ([\w.]+)(?:\([^)]*\))? does not exist/i,
  );
  if (code === "42883" || missingFunction) {
    return `O banco não tem a função ${missingFunction?.[1] ?? "necessária"}. Aplique as migrations pendentes e tente de novo.`;
  }
  if (code === "42P01") {
    return "O banco não tem uma das tabelas usadas por esta tela. Aplique as migrations pendentes e tente de novo.";
  }
  if (code === "42703") {
    return "O banco não tem uma das colunas usadas por esta tela. Aplique as migrations pendentes e tente de novo.";
  }
  if (
    code === "PGRST202" ||
    message.includes("schema cache") ||
    message.includes("Could not find the function")
  ) {
    return "Esta operação depende de uma migration que ainda não foi aplicada no banco.";
  }

  // Permissão: separar o que é perfil do usuário do que é grant faltando.
  const deniedFunction = message.match(
    /permission denied for function ([\w.]+)/i,
  );
  if (deniedFunction) {
    return `O banco recusou a operação por falta de permissão na função ${deniedFunction[1]}. É uma migration de permissão pendente, não uma restrição do seu perfil.`;
  }
  const deniedRelation = message.match(
    /permission denied for (?:table|relation|schema|sequence) ([\w.]+)/i,
  );
  if (deniedRelation) {
    return `O banco recusou o acesso a ${deniedRelation[1]}. Verifique as permissões do seu perfil ou aplique as migrations pendentes.`;
  }
  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security policy")
  ) {
    return "Seu perfil não tem permissão para esta operação.";
  }

  // Violações de integridade.
  if (code === "23505" || message.includes("duplicate key")) {
    return "Já existe um registro com estes dados.";
  }
  if (code === "23503" || message.includes("violates foreign key")) {
    return "Um dos cadastros vinculados não existe mais. Recarregue a página e tente de novo.";
  }
  if (code === "23502" || message.includes("null value in column")) {
    return "Falta preencher um campo obrigatório.";
  }
  if (code === "23514" || message.includes("violates check constraint")) {
    return "Algum valor informado está fora do que o sistema aceita.";
  }
  if (code === "23P01" || message.includes("exclusion constraint")) {
    return "Este horário conflita com outro registro já existente.";
  }
  if (code === "22P02" || message.includes("invalid input syntax")) {
    return "Algum valor informado está em formato inválido.";
  }

  // Falha de transporte.
  if (
    code === "57014" ||
    message.includes("statement timeout") ||
    message.includes("canceling statement")
  ) {
    return "A consulta demorou demais e foi cancelada. Tente de novo com um período menor.";
  }
  if (
    message.includes("fetch failed") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("ECONNREFUSED")
  ) {
    return "Sem conexão com o banco de dados. Verifique a rede e tente de novo.";
  }

  return message || fallback;
}
