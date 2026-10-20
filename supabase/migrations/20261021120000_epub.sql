-- Pata: EPUB books. Run once in Supabase → SQL Editor, after the earlier migrations.

-- Book files may now also be EPUBs, stored as <user id>/<book id>.epub.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/epub+zip']
where id = 'books';

-- EPUB highlights are stored as a CFI range (where the words are in the book's text)
-- instead of boxes on a page, so their rects list is empty.
alter table public.highlights
  add column cfi text check (char_length(cfi) between 1 and 2000);

alter table public.highlights drop constraint highlights_rects_check;
alter table public.highlights add constraint highlights_rects_check check (
  jsonb_typeof(rects) = 'array'
  and jsonb_array_length(rects) <= 200
  and (cfi is not null or jsonb_array_length(rects) >= 1)
);
