create extension if not exists pgcrypto;

create table if not exists platform_apps (
  id text primary key,
  title text not null,
  endpoint text not null,
  image_url text,
  image_alt text,
  enabled boolean not null default true,
  show_when_locked boolean not null default true,
  admin_only boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_app_permissions (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references platform_apps(id) on delete cascade,
  permission text not null,
  label text not null,
  description text,
  is_required_for_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, permission)
);

insert into platform_apps (
  id,
  title,
  endpoint,
  image_url,
  image_alt,
  enabled,
  show_when_locked,
  admin_only,
  sort_order
)
values
  (
    'auth',
    'Auth Portal',
    '/auth/',
    'https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&q=80',
    'Abstract code and security interface',
    true,
    false,
    true,
    10
  ),
  (
    'platform',
    'Platform',
    '/platform/',
    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80',
    'Platform administration dashboard',
    true,
    false,
    true,
    15
  ),
  (
    'xmas',
    'Christmas Lists',
    '/xmas/',
    'https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80',
    'Christmas lights and ornaments',
    true,
    true,
    false,
    20
  ),
  (
    'workouts',
    'Workouts',
    '/workouts/',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
    'Gym equipment and weights',
    true,
    true,
    false,
    30
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
  updated_at = now();

insert into platform_app_permissions (
  app_id,
  permission,
  label,
  description,
  is_required_for_access
)
values
  (
    'auth',
    'auth.manage',
    'Manage Auth',
    'Allows access to the Auth Portal.',
    true
  ),
  (
    'platform',
    'platform.manage',
    'Manage Platform',
    'Allows access to the Platform app.',
    true
  ),
  (
    'xmas',
    'xmas.access',
    'Access Christmas Lists',
    'Allows access to the Christmas Lists app.',
    true
  ),
  (
    'workouts',
    'workouts.access',
    'Access Workouts',
    'Allows access to the Workouts app.',
    true
  )
on conflict (app_id, permission) do update set
  label = excluded.label,
  description = excluded.description,
  is_required_for_access = excluded.is_required_for_access,
  updated_at = now();
