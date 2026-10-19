import type { Metadata } from "next";
import { Suspense } from "react";
import { BookLoader } from "@/components/reader/BookLoader";
import { ReaderLoader } from "@/components/reader/ReaderLoader";

export const metadata: Metadata = { title: "Reading" };

// `params` is a Promise in Next.js 15+. Awaiting it makes this part dynamic,
// so (with Cache Components) it goes inside <Suspense>.
export default function ReadPage({ params }: PageProps<"/read/[bookId]">) {
  return (
    <Suspense fallback={<BookLoader />}>
      <Reader params={params} />
    </Suspense>
  );
}

async function Reader({ params }: { params: PageProps<"/read/[bookId]">["params"] }) {
  const { bookId } = await params;
  return <ReaderLoader bookId={bookId} />;
}
