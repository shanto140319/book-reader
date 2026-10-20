-- Pata: text highlights in PDF books. Run once in Supabase → SQL Editor, after the library migration.
-- Same security model: Row Level Security, "only rows where user_id is me".

create table public.highlights (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page        integer not null check (page > 0),
  -- [{ page, x, y, w, h }, …] as fractions of the page, so they fit any zoom or screen
  rects       jsonb not null check (jsonb_typeof(rects) = 'array' and jsonb_array_length(rects) between 1 and 200),
  text        text not null check (char_length(text) <= 5000),
  color       text not null check (color in ('yellow', 'green', 'blue', 'pink', 'purple')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index highlights_book_id_idx on public.highlights (book_id);
create index highlights_user_id_idx on public.highlights (user_id);

alter table public.highlights enable row level security;

create policy "Read own highlights" on public.highlights
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own highlights" on public.highlights
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );
create policy "Update own highlights" on public.highlights
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own highlights" on public.highlights
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Once made, only the color can change (the text and position stay what was selected).
revoke update on public.highlights from anon, authenticated;
grant update (color, updated_at) on public.highlights to authenticated;
