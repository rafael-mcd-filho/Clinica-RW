/**
 * Rascunho de resposta por IA (Claude) para o atendimento — modelo híbrido:
 * a IA sugere, o humano revisa e envia.
 *
 * Chamada única à Messages API via fetch (sem adicionar dependência do SDK).
 * Modelo claude-opus-4-8, sem thinking (resposta curta e de baixa latência);
 * o system exige "apenas o texto da mensagem" para evitar que o modelo escreva
 * raciocínio na resposta visível.
 */
export type ConversationTurn = {
  role: "patient" | "clinic";
  text: string;
};

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = [
  "Você é um atendente de uma clínica de saúde no Brasil, respondendo pacientes pelo WhatsApp.",
  "Escreva a próxima resposta da clínica em português do Brasil: curta, cordial e profissional.",
  "",
  "Regras obrigatórias:",
  "- Responda APENAS com o texto exato da mensagem a ser enviada. Sem aspas, sem rótulos, sem comentários, sem explicar seu raciocínio.",
  "- Seja acolhedor e objetivo.",
  "- NÃO invente informações que você não tem (horários livres, valores, disponibilidade, resultados). Se faltar um dado, faça uma pergunta breve ou peça que o paciente aguarde a confirmação da equipe.",
  "- NÃO faça diagnóstico nem dê orientação clínica.",
].join("\n");

export async function draftReply(turns: ConversationTurn[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY ausente. Configure em apps/web/.env.local.",
    );
  }

  const transcript = turns
    .map(
      (turn) =>
        `${turn.role === "patient" ? "Paciente" : "Clínica"}: ${turn.text}`,
    )
    .join("\n");

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Conversa até agora:\n${transcript}\n\nEscreva a próxima resposta da clínica.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Anthropic API: ${response.status} ${detail.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();

  if (!text) {
    throw new Error("A IA não retornou uma sugestão.");
  }
  return text;
}
