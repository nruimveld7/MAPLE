create table if not exists xmas_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  label text not null,
  url text,
  quantity integer not null check (quantity > 0),
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_xmas_items_owner_order
  on xmas_items (owner_user_id, display_order);

create table if not exists xmas_shares (
  owner_user_id uuid not null,
  shared_with_user_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, shared_with_user_id),
  check (owner_user_id <> shared_with_user_id)
);

create index if not exists idx_xmas_shares_shared_with
  on xmas_shares (shared_with_user_id, is_active);

create table if not exists xmas_claims (
  item_id uuid not null references xmas_items(id) on delete cascade,
  claimant_user_id uuid not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, claimant_user_id)
);

create index if not exists idx_xmas_claims_claimant
  on xmas_claims (claimant_user_id);
