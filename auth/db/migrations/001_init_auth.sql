create extension if not exists pgcrypto;

create table if not exists users (
	id uuid primary key default gen_random_uuid(),
	email text not null unique,
	password_hash text not null,
	first_name text not null,
	last_name text not null,
	is_active boolean not null default true,
	is_admin boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists sessions (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references users(id) on delete cascade,
	token_hash text not null unique,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	revoked_at timestamptz,
	last_seen_at timestamptz
);

create index if not exists idx_sessions_user_id
	on sessions (user_id);

create index if not exists idx_sessions_token_hash
	on sessions (token_hash);

create index if not exists idx_sessions_active
	on sessions (expires_at)
	where revoked_at is null;

create table if not exists invites (
	id uuid primary key default gen_random_uuid(),
	email text not null,
	code_hash text not null unique,
	created_by uuid references users(id) on delete set null,
	used_by uuid references users(id) on delete set null,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	sent_at timestamptz,
	used_at timestamptz,
	revoked_at timestamptz,
	email_error text
);

create index if not exists idx_invites_email
	on invites (lower(email));

create index if not exists idx_invites_active
	on invites (expires_at)
	where used_at is null and revoked_at is null;

create table if not exists app_registry (
	id text primary key,
	title text not null,
	endpoint text not null,
	image_url text,
	image_alt text,
	public_access boolean not null default false,
	required_permission text,
	show_when_locked boolean not null default false,
	admin_only boolean not null default false,
	enabled boolean not null default true,
	sort_order int not null default 100,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists user_app_permissions (
	user_id uuid not null references users(id) on delete cascade,
	app_id text not null references app_registry(id) on delete cascade,
	permission text not null default 'access',
	granted_by uuid references users(id) on delete set null,
	granted_at timestamptz not null default now(),
	revoked_at timestamptz,
	primary key (user_id, app_id, permission)
);

create index if not exists idx_user_app_permissions_user_id
	on user_app_permissions (user_id);

create index if not exists idx_user_app_permissions_app_id
	on user_app_permissions (app_id);

insert into app_registry (
	id,
	title,
	endpoint,
	image_url,
	image_alt,
	public_access,
	required_permission,
	show_when_locked,
	admin_only,
	enabled,
	sort_order
)
values
	(
		'auth',
		'Auth Portal',
		'/auth/',
		'https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&q=80',
		'Abstract code and security interface',
		false,
		'auth.manage',
		false,
		true,
		true,
		10
	),
	(
		'xmas',
		'Christmas Lists',
		'/xmas/',
		'https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80',
		'Christmas lights and ornaments',
		false,
		'xmas.access',
		true,
		false,
		true,
		20
	),
	(
		'workouts',
		'Workouts',
		'/workouts/',
		'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
		'Gym equipment and weights',
		false,
		'workouts.access',
		true,
		false,
		true,
		30
	)
on conflict (id) do update set
	title = excluded.title,
	endpoint = excluded.endpoint,
	image_url = excluded.image_url,
	image_alt = excluded.image_alt,
	public_access = excluded.public_access,
	required_permission = excluded.required_permission,
	show_when_locked = excluded.show_when_locked,
	admin_only = excluded.admin_only,
	enabled = excluded.enabled,
	sort_order = excluded.sort_order,
	updated_at = now();
