create extension if not exists pgcrypto;

create table if not exists workouts_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
