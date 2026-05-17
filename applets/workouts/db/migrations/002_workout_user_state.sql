create table if not exists workout_user_state (
  user_id uuid primary key,
  exercises jsonb not null default '[]'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_user_state_updated_at
  on workout_user_state (updated_at desc);
