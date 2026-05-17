alter table if exists platform_apps
  add column if not exists app_type text not null default 'applet',
  add column if not exists absolute_path text,
  add column if not exists is_public boolean not null default false,
  add column if not exists required_permission text;

update platform_apps
set
  app_type = case
    when id in ('auth', 'platform') then 'management'
    else 'applet'
  end,
  absolute_path = case
    when id in ('auth', 'platform') then id
    else 'applets/' || id
  end,
  is_public = false,
  required_permission = coalesce(
    required_permission,
    case
      when id = 'auth' then 'auth.manage'
      when id = 'platform' then 'platform.manage'
      else id || '.access'
    end
  )
where absolute_path is null
   or required_permission is null;

alter table if exists platform_apps
  alter column absolute_path set not null;

create unique index if not exists idx_platform_apps_absolute_path
  on platform_apps(absolute_path);

create index if not exists idx_platform_apps_app_type
  on platform_apps(app_type);
