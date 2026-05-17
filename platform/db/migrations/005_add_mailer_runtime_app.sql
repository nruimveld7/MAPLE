insert into platform_apps (
  id,
  title,
  endpoint,
  image_url,
  image_alt,
  enabled,
  show_when_locked,
  show_in_catalog,
  admin_only,
  sort_order,
  app_type,
  absolute_path,
  is_public,
  required_permission
)
values
  (
    'mailer',
    'Mailer',
    '/mailer/',
    null,
    null,
    true,
    false,
    false,
    true,
    1000,
    'management',
    'mailer',
    false,
    'platform.manage'
  )
on conflict (id) do update set
  title = excluded.title,
  endpoint = excluded.endpoint,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  enabled = excluded.enabled,
  show_when_locked = excluded.show_when_locked,
  show_in_catalog = excluded.show_in_catalog,
  admin_only = excluded.admin_only,
  sort_order = excluded.sort_order,
  app_type = excluded.app_type,
  absolute_path = excluded.absolute_path,
  is_public = excluded.is_public,
  required_permission = excluded.required_permission,
  updated_at = now();
