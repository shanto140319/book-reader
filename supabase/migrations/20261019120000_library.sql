-- Pata: library, reading progress and reader settings, one private shelf per user.
-- Run once in Supabase → SQL Editor (or `supabase db push` with the Supabase CLI).
--
-- Security model: every table has Row Level Security, and every policy is
-- "only rows where user_id is me". Book files live in a private storage bucket
-- under a folder named after the user's id, with the same rule.

-- ─── Books ──────────────────────────────────────────────────────────────────

create table public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  author      text check (char_length(author) <= 300),
  file_type   text not null check (file_type in ('pdf', 'epub')),
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 52428800), -- 50 MB
  page_count  integer check (page_count > 0),
  pdf_trim    real check (pdf_trim between 0 and 0.25),
  cover       text check (char_length(cover) <= 200000), -- small WebP data URL of page 1
  created_at  timestamptz not null default now()
);

create index books_user_id_idx on public.books (user_id);

alter table public.books enable row level security;

create policy "Read own books" on public.books
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own books" on public.books
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own books" on public.books
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own books" on public.books
  for delete to authenticated using ((select auth.uid()) = user_id);

-- After upload only these columns may change (not size_bytes, which the quota relies on).
revoke update on public.books from anon, authenticated;
grant update (title, author, page_count, pdf_trim, cover) on public.books to authenticated;

-- 1 GB of books per user.
create function public.enforce_library_quota() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select coalesce(sum(size_bytes), 0) from public.books where user_id = new.user_id) + new.size_bytes > 1073741824 then
    raise exception 'library_full';
  end if;
  return new;
end;
$$;

create trigger books_quota before insert on public.books
  for each row execute function public.enforce_library_quota();

-- ─── Reading progress ───────────────────────────────────────────────────────

create table public.reading_progress (
  book_id     uuid primary key references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position    text not null check (char_length(position) <= 1000), -- PDF: page number. EPUB: CFI.
  percent     real not null check (percent between 0 and 100),
  updated_at  timestamptz not null default now()
);

create index reading_progress_user_id_idx on public.reading_progress (user_id);

alter table public.reading_progress enable row level security;

create policy "Read own progress" on public.reading_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own progress" on public.reading_progress
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );
create policy "Update own progress" on public.reading_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Latest wins: a save from a device that was offline (older updated_at) never
-- overwrites a newer position from another device. Runs as the caller, so RLS applies.
create function public.save_progress(p_book_id uuid, p_position text, p_percent real, p_updated_at timestamptz)
returns void
language sql security invoker set search_path = '' as $$
  insert into public.reading_progress (book_id, user_id, position, percent, updated_at)
  values (p_book_id, (select auth.uid()), p_position, p_percent, p_updated_at)
  on conflict (book_id) do update
    set position = excluded.position, percent = excluded.percent, updated_at = excluded.updated_at
    where public.reading_progress.updated_at < excluded.updated_at;
$$;

revoke execute on function public.save_progress from public, anon;
grant execute on function public.save_progress to authenticated;

-- ─── Reader settings ────────────────────────────────────────────────────────

create table public.user_settings (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  reader_prefs  jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Read own settings" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own settings" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own settings" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ─── Book files (Storage) ───────────────────────────────────────────────────
-- Private bucket; files are stored as <user id>/<book id>.pdf.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "Read own book files" on storage.objects
  for select to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own book files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own book files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
