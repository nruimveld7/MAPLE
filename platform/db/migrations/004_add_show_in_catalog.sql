alter table if exists platform_apps
  add column if not exists show_in_catalog boolean not null default true;

update platform_apps
set show_in_catalog = false,
    image_url = null,
    image_alt = null,
    updated_at = now()
where id = 'landing';
