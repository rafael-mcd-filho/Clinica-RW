do $$
begin
  if (select count(*) from public.app_users where is_super_admin) > 1 then
    raise exception 'Only one Super Admin is allowed.';
  end if;
end;
$$;

create unique index if not exists app_users_single_super_admin_key
on public.app_users ((true))
where is_super_admin;

comment on index public.app_users_single_super_admin_key
is 'Guarantees exactly one SaaS Super Admin account can exist.';
