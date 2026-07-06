# Ambientes

## Local

- Aplicacao: `http://localhost:3000`
- Supabase local: gerenciado pela CLI com `npx supabase start`
- Variaveis: `.env` na raiz e `apps/web/.env.local`

## Staging

- Uma instancia separada do Supabase deve ser criada antes do piloto.
- Deploy web separado da producao.
- Usar chaves, banco e storage exclusivos.
- Executar migrations com `npx supabase db push --linked`.
- Validar login, redefinicao de senha, RLS e impersonacao antes de promover.

## Producao

- Projeto Supabase exclusivo com backup diario e retencao minima inicial de 30 dias.
- Aplicacao web em deploy separado de staging.
- `SUPABASE_SERVICE_ROLE_KEY` disponivel apenas no runtime de servidor.
- TLS obrigatorio.
- Logs estruturados centralizados pelo provedor de deploy.
- Definir alertas para erros recorrentes antes do piloto pago.

## Checklist de promocao

1. Executar `npm run check`.
2. Executar `npx supabase migration list`.
3. Executar `npx supabase test db` no ambiente local.
4. Aplicar migrations em staging.
5. Validar as jornadas de login, recuperacao de senha e isolamento.
6. Aplicar migrations em producao.
