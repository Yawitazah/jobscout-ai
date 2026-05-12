-- Add auto-rule columns to preferences if they don't already exist
alter table preferences
  add column if not exists auto_approve_rules jsonb default '[]'::jsonb,
  add column if not exists auto_reject_rules jsonb default '[]'::jsonb;
