# Observabilidade

## Padrao atual

O app web registra eventos tecnicos em JSON com:

- `timestamp`
- `level`
- `event`
- `service`
- contexto tecnico minimizado

O endpoint `/api/observability/client-error` recebe erros do navegador e os
encaminha para o log estruturado do servidor.

## Regras

- Nao registrar payload clinico.
- Nao registrar prontuario, documento, token, senha ou chave.
- Evitar CPF, telefone e endereco.
- Usar IDs tecnicos apenas quando necessarios para investigacao.
- Centralizar os logs no provedor de deploy.

## Evolucao controlada

Antes do piloto pago, conectar o stream JSON a Sentry, OpenTelemetry ou
ferramenta equivalente com alertas para erros recorrentes.
