update public.platform_settings
set primary_color = '#0054C2'
where id = true
  and upper(primary_color) in ('#176B87', '#2563EB', '#4F46E5');
