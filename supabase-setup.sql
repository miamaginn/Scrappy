-- The Travel Shelf: run this once in your Supabase project's SQL Editor.

-- Books: one row per scrapbook. Everyone can read the ones marked public;
-- only the signed-in owner can see the rest, or add, change and delete.
create table if not exists public.books (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.books enable row level security;

create policy "Read public books, or your own" on public.books
  for select using (published or owner = auth.uid());
create policy "Add your own books" on public.books
  for insert to authenticated with check (owner = auth.uid());
create policy "Change your own books" on public.books
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Delete your own books" on public.books
  for delete to authenticated using (owner = auth.uid());

-- Photos and videos: a public bucket (files have long random names), up to 50 MB each.
-- Each person can only add or remove files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;

create policy "Upload to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Replace files in your own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Delete files in your own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
