create table generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_job_id uuid references user_jobs(id) on delete cascade,
  document_type text not null check (document_type in ('resume','cover_letter')),
  content_json jsonb not null,
  content_text text not null,
  storage_path_docx text,
  storage_path_pdf text,
  generation_model text,
  verification_status text default 'pending' check (verification_status in
    ('pending','passed','failed_review','user_approved')),
  verification_notes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  approved_at timestamptz
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_job_id uuid not null references user_jobs(id) on delete cascade,
  resume_doc_id uuid references generated_documents(id),
  cover_letter_doc_id uuid references generated_documents(id),
  status text default 'draft' check (status in
    ('draft','ready_to_submit','submitting','submitted','submit_failed','withdrawn')),
  submission_method text check (submission_method in
    ('agent_auto','agent_assisted','manual')),
  submission_log jsonb default '[]'::jsonb,
  confirmation_number text,
  confirmation_email text,
  screenshot_paths text[] default '{}',
  form_responses jsonb default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, user_job_id)
);

create table application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null,
  question_text text,
  answer text,
  updated_at timestamptz default now(),
  unique (user_id, question_key)
);

create index applications_user_status_idx on applications(user_id, status);
create index generated_docs_user_job_idx on generated_documents(user_job_id);

alter table generated_documents enable row level security;
alter table applications enable row level security;
alter table application_answers enable row level security;

create policy "docs are user-scoped" on generated_documents
  for all to authenticated using (auth.uid() = user_id);

create policy "applications are user-scoped" on applications
  for all to authenticated using (auth.uid() = user_id);

create policy "answers are user-scoped" on application_answers
  for all to authenticated using (auth.uid() = user_id);
