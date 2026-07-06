update public.platform_settings
set primary_color = '#4F46E5'
where id = true
  and upper(primary_color) in ('#2563EB', '#176B87');

