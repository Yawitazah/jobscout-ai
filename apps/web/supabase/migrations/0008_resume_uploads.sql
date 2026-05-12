-- Resume uploads table
create table if not exists resume_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text,
  file_size bigint,
  mime_type text,
  status text not null default 'uploaded',
  extracted_text text,
  created_at timestamptz default now()
);

alter table resume_uploads enable row level security;

create policy "resume_uploads user-scoped"
  on resume_uploads for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage bucket for resumes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy "resumes owner upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes owner read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
