# book-reader

Folio: a web reader for PDF (and soon EPUB) books that opens every book at the page where you stopped, on any device.

Built with Next.js (App Router), Tailwind CSS, react-pdf (PDF.js) and Supabase (planned for sign-in, storage and sync).

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Without Supabase keys the app runs in **local mode**: no sign-in, and books, covers and reading progress are stored in your browser (IndexedDB).
To connect Supabase later, copy `.env.example` to `.env.local` and fill in the values.

## Features so far

- Library with real covers (rendered from page 1), progress bars, drag-and-drop upload, delete
- PDF reader: lazy page rendering, resume at the last page, zoom (typed or stepped), fit width / fit page, side-margin trim
- Sidebar with table of contents, page thumbnails and reader settings

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run lint`: ESLint
