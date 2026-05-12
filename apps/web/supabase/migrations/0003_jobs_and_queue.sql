-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  industry text,
  size_estimate text,
  logo_url text,
  description text,
  source_platform text,
  source_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_platform, source_id)
);

-- Jobs
create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  source_platform text not null,
  source_id text not null,
  source_url text not null,
  title text not null,
  location text,
  work_mode text,
  remote_eligibility text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text default 'USD',
  description text,
  requirements jsonb default '[]'::jsonb,
  skills_required text[] default '{}',
  seniority_level text,
  posted_at timestamptz,
  fetched_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  is_active boolean default true,
  dedupe_hash text not null,
  raw_data jsonb,
  unique (source_platform, source_id)
);

create index jobs_dedupe_hash_idx on jobs(dedupe_hash);
create index jobs_posted_at_idx on jobs(posted_at desc);
create index jobs_active_idx on jobs(is_active) where is_active = true;

-- Per-user queue items
create table user_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100),
  match_reasons jsonb default '[]'::jsonb,
  deal_breakers_hit text[] default '{}',
  status text default 'pending' check (status in
    ('pending','approved','rejected','saved','expired','applied')),
  decision_source text check (decision_source in ('manual','auto')),
  scored_at timestamptz default now(),
  reviewed_at timestamptz,
  unique (user_id, job_id)
);

create index user_jobs_pending_idx on user_jobs(user_id, score desc)
  where status = 'pending';

-- Scout run log
create table scout_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text default 'running' check (status in ('running','complete','failed')),
  jobs_fetched integer default 0,
  jobs_scored integer default 0,
  jobs_queued integer default 0,
  error_message text,
  sources_used text[] default '{}'
);

-- RLS
alter table companies enable row level security;
alter table jobs enable row level security;
alter table user_jobs enable row level security;
alter table scout_runs enable row level security;

create policy "companies are readable" on companies
  for select to authenticated using (true);
create policy "jobs are readable" on jobs
  for select to authenticated using (true);

create policy "user_jobs are user-scoped" on user_jobs
  for all to authenticated using (auth.uid() = user_id);
create policy "scout_runs are user-scoped" on scout_runs
  for all to authenticated using (auth.uid() = user_id);
