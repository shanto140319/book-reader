import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader, AppHeaderSkeleton } from "@/components/app/AppHeader";
import { LocalLibrary } from "@/components/library/LocalLibrary";

export const metadata: Metadata = { title: "Library" };

// With Cache Components on, anything that reads cookies (the signed-in user)
// must sit inside <Suspense>. The rest of the page is sent instantly and the
// fallback shows until the user-specific part is ready.
export default function LibraryPage() {
  return (
    <>
      <Suspense fallback={<AppHeaderSkeleton />}>
        <AppHeader />
      </Suspense>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        <LocalLibrary />
      </main>
    </>
  );
}
