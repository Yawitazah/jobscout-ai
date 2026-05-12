create table notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean default true,
  email_digest_time time default '08:00',
  email_timezone text default 'America/New_York',
  push_enabled boolean default false,
  push_subscription jsonb,
  channels jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  action_url text,
  related_application_id uuid references applications(id) on delete cascade,
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  read_at timestamptz,
  sent_email_at timestamptz,
  sent_push_at timestamptz,
  created_at timestamptz default now()
);

create index notif_user_unread_idx on notifications(user_id)
  where read_at is null;

alter table notification_preferences enable row level security;
alter table notifications enable row level security;

create policy "notification_preferences user-scoped" on notification_preferences
  for all to authenticated using (auth.uid() = user_id);

create policy "notifications user-scoped" on notifications
  for all to authenticated using (auth.uid() = user_id);
