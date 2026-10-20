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
Supabase → SQL Editor, then [supabase/migrations/20261020120000_highlights.sql](supabase/migrations/20261020120000_highlights.sql).
They create the `books`, `reading_progress`, `user_settings` and `highlights` tables, the private
`books` storage bucket, and Row Level Security so each user can only reach their own books.
With Supabase connected, books, covers, progress and reader settings are stored per account and
sync across devices; each browser keeps a cache of the files it has opened.

## Features so far

- Library with real covers (rendered from page 1), progress bars, drag-and-drop upload, delete
- PDF reader: lazy page rendering, resume at the last page, zoom (typed or stepped), fit width / fit page, side-margin trim
- Highlights: select text, pick one of 5 colours; tap a highlight to recolour, copy or remove it
- Bangla translation: select text (or tap a highlight) and press বাংলা. Needs a free Gemini key, see below
- Read aloud: the speaker button reads the selected English text with the device's own voice (0.75× / 1× / 1.25×), free and offline
- Sidebar with table of contents, page thumbnails, a list of highlights and reader settings

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run lint`: ESLint

## Bangla translation (optional)

Translation uses Google Gemini's free tier, which needs only a Google account (no card):

1. Open https://aistudio.google.com/apikey and click **Create API key**.
2. Add it to `.env.local` as `GEMINI_API_KEY=...` (and to your hosting provider's environment variables), then restart `npm run dev`.

The key stays on the server: the reader calls `/api/translate`, which only answers signed-in users and translates up to 2,000 characters at a time. Free-tier limits are per day; on the free tier Google may use the text to improve its models.
