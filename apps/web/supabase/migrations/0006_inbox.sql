-- Expand applications.status check constraint for Phase 5 statuses
alter table applications
  drop constraint if exists applications_status_check;

alter table applications
  add constraint applications_status_check check (status in (
    'draft','ready_to_submit','submitting','submitted','submit_failed','withdrawn',
    'interview_proposed','interview_scheduled','closed_rejected','offer_received'
  ));

-- Email account connections (per user, per provider)
create table email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email_address text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  history_id text,
  last_synced_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (user_id, email_address)
);

-- Ingested messages
create table inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references email_connections(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,
  provider_message_id text not null,
  thread_id text,
  from_address text not null,
  from_name text,
  to_address text not null,
  subject text,
  snippet text,
  body_text text,
  body_html text,
  received_at timestamptz not null,
  classification text check (classification in (
    'unclassified','application_ack','interview_request','interview_followup',
    'request_info','rejection','offer','withdrawn','irrelevant','unknown')),
  classification_confidence text check (classification_confidence in ('low','medium','high')),
  classified_at timestamptz,
  extracted_data jsonb default '{}'::jsonb,
  user_action text check (user_action in ('seen','archived','dismissed')),
  user_action_at timestamptz,
  created_at timestamptz default now(),
  unique (connection_id, provider_message_id)
);

create index inbox_classification_idx on inbox_messages(user_id, classification);
create index inbox_application_idx on inbox_messages(application_id);
create index inbox_received_idx on inbox_messages(received_at desc);

-- Interviews
create table interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  source_message_id uuid references inbox_messages(id) on delete set null,
  round_name text,
  round_number integer,
  scheduled_at timestamptz,
  duration_minutes integer,
  format text check (format in ('phone','video','onsite','take_home','unknown')),
  meeting_link text,
  interviewer_names text[] default '{}',
  interviewer_emails text[] default '{}',
  preparation_notes text,
  status text default 'scheduled' check (status in (
    'proposed','scheduled','completed','cancelled','no_show','reschedule_requested')),
  outcome text,
  calendar_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index interviews_user_scheduled_idx on interviews(user_id, scheduled_at);

-- Application events (timeline)
create table application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  event_type text not null,
  event_data jsonb default '{}'::jsonb,
  occurred_at timestamptz default now(),
  created_by text default 'system' check (created_by in ('system','user'))
);

create index app_events_app_idx on application_events(application_id, occurred_at desc);

-- RLS
alter table email_connections enable row level security;
alter table inbox_messages enable row level security;
alter table interviews enable row level security;
alter table application_events enable row level security;

create policy "email_connections user-scoped" on email_connections
  for all to authenticated using (auth.uid() = user_id);
create policy "inbox_messages user-scoped" on inbox_messages
  for all to authenticated using (auth.uid() = user_id);
create policy "interviews user-scoped" on interviews
  for all to authenticated using (auth.uid() = user_id);
create policy "events user-scoped" on application_events
  for all to authenticated using (auth.uid() = user_id);

-- Trigger: insert application_events row on application status changes
create or replace function log_application_event()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    insert into application_events(user_id, application_id, event_type, event_data)
    values (new.user_id, new.id, 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$ language plpgsql;

create trigger applications_status_event after update on applications
  for each row execute function log_application_event();
