-- ============================================================
-- JobScout AI — initial schema
-- Paste this entire file into the Supabase SQL editor and run.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id               uuid        primary key references auth.users (id) on delete cascade,
  email            text        unique not null,
  full_name        text,
  phone            text,
  location         text,
  summary          text,
  experience       jsonb       not null default '[]'::jsonb,
  education        jsonb       not null default '[]'::jsonb,
  skills           jsonb       not null default '[]'::jsonb,
  certifications   jsonb       not null default '[]'::jsonb,
  projects         jsonb       not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.preferences (
  user_id             uuid        primary key references auth.users (id) on delete cascade,
  target_titles       text[]      not null default '{}',
  target_locations    jsonb       not null default '[]'::jsonb,
  work_modes          text[]      not null default '{}',
  salary_min          numeric,
  salary_max          numeric,
  industries          text[]      not null default '{}',
  deal_breakers       jsonb       not null default '[]'::jsonb,
  auto_approve_rules  jsonb       not null default '[]'::jsonb,
  auto_reject_rules   jsonb       not null default '[]'::jsonb,
  automation_level    text        not null default 'review'
                        check (automation_level in ('manual', 'review', 'auto')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ────────────────────────────────────────────────────────────
-- 2. updated_at TRIGGER
-- ────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger preferences_set_updated_at
  before update on public.preferences
  for each row execute function public.set_updated_at();


-- ────────────────────────────────────────────────────────────
-- 3. ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.profiles   enable row level security;
alter table public.preferences enable row level security;

-- profiles: users may only touch their own row
create policy "profiles: own row select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: own row insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: own row update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: own row delete"
  on public.profiles for delete
  using (auth.uid() = id);

-- preferences: users may only touch their own row
create policy "preferences: own row select"
  on public.preferences for select
  using (auth.uid() = user_id);

create policy "preferences: own row insert"
  on public.preferences for insert
  with check (auth.uid() = user_id);

create policy "preferences: own row update"
  on public.preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "preferences: own row delete"
  on public.preferences for delete
  using (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 4. AUTO-CREATE PROFILE ON SIGN-UP
-- ────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

-- Drop and recreate so re-running the file is idempotent
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
