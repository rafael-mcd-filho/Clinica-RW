-- Private storage for inbound WhatsApp media.
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

do $$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_contacts', 'conversation_tags'] loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and pg_publication_tables.tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- Atomically claim an unassigned conversation. A concurrent attendant only
-- succeeds when they already own it; no last-write-wins reassignment.
create or replace function public.claim_whatsapp_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_claimed boolean;
begin
  if v_user_id is null or v_organization_id is null
     or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  update public.whatsapp_conversations
     set assigned_user_id = v_user_id,
         status = 'open'
   where id = p_conversation_id
     and organization_id = v_organization_id
     and (assigned_user_id is null or assigned_user_id = v_user_id)
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_whatsapp_conversation(uuid) from public;
grant execute on function public.claim_whatsapp_conversation(uuid) to authenticated;
