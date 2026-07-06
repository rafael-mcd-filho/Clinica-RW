# Supabase

Esta pasta guarda a configuracao e as migrations versionadas do banco.

## Uso local

```bash
supabase start
supabase db reset
npx supabase test db
```

As migrations devem ser incrementais e revisaveis. Tabelas multi-tenant sensiveis precisam nascer com `organization_id`, RLS habilitado e testes de isolamento.
