insert into platform_apps (
  id,
  title,
  endpoint,
  image_url,
  image_alt,
  enabled,
  show_when_locked,
  admin_only,
  sort_order,
  app_type,
  absolute_path,
  is_public,
  required_permission
)
values
  (
    'landing',
    'Landing',
    '/',
    'https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1200&q=80',
    'Landing page interface preview',
    true,
    true,
    false,
    5,
    'management',
    'landing',
    true,
    null
  )
on conflict (id) do update set
  title = excluded.title,
  endpoint = excluded.endpoint,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  enabled = excluded.enabled,
  show_when_locked = excluded.show_when_locked,
  admin_only = excluded.admin_only,
  sort_order = excluded.sort_order,
  app_type = excluded.app_type,
  absolute_path = excluded.absolute_path,
  is_public = excluded.is_public,
  required_permission = excluded.required_permission,
  updated_at = now();
