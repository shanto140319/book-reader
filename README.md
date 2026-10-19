# book-reader

Pata (পাতা, Bangla for "page"): a web reader for PDF (and soon EPUB) books that opens every book at the page where you stopped, on any device.

Built with Next.js (App Router), Tailwind CSS, react-pdf (PDF.js) and Supabase (planned for sign-in, storage and sync).

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Without Supabase keys the app runs in **local mode**: no sign-in, and books, covers and reading progress are stored in your browser (IndexedDB).
To connect Supabase, copy `.env.example` to `.env.local` and fill in the values, then run
[supabase/migrations/20261019120000_library.sql](supabase/migrations/20261019120000_library.sql) once in
Supabase → SQL Editor. It creates the `books`, `reading_progress` and `user_settings` tables, the private
`books` storage bucket, and Row Level Security so each user can only reach their own books.
With Supabase connected, books, covers, progress and reader settings are stored per account and
sync across devices; each browser keeps a cache of the files it has opened.

## Features so far

- Library with real covers (rendered from page 1), progress bars, drag-and-drop upload, delete
- PDF reader: lazy page rendering, resume at the last page, zoom (typed or stepped), fit width / fit page, side-margin trim
- Sidebar with table of contents, page thumbnails and reader settings

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run lint`: ESLint
