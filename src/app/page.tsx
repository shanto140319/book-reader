import { ArrowRight, BookOpen, Lock, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Logo } from "@/components/brand/Logo";
import { supabaseConfigured } from "@/lib/supabase/config";

const features = [
  {
    icon: MonitorSmartphone,
    title: "Resume anywhere",
    text: "Close the book on your laptop, open it on your phone at the same page.",
  },
  {
    icon: BookOpen,
    title: "PDF & EPUB",
    text: "Scroll or turn pages, with light, sepia and dark themes and adjustable text.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Your files live in your own locked shelf. Nobody else can see or open them.",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* soft background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-[640px] rounded-full bg-accent-soft opacity-70 blur-3xl"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo />
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-0">
        <section>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium tracking-wide text-muted backdrop-blur">
            <span className="size-1.5 rounded-full bg-accent" />
            Your private reading room
          </p>
          <h1 className="font-serif text-5xl font-medium leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Every book, right where you <em className="text-accent">left off</em>.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted text-pretty">
            Upload your PDFs and EPUBs once. Folio remembers your page and your reading settings on every device.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3">
            {supabaseConfigured ? (
              <GoogleButton />
            ) : (
              <Link
                href="/library"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg shadow-card transition hover:opacity-90 active:scale-[0.98]"
              >
                Open your library <ArrowRight className="size-4" />
              </Link>
            )}
            <p className="text-sm text-subtle">Free for friends &amp; family. Up to 1 GB of books each.</p>
          </div>
        </section>

        <BookShowcase />
      </main>

      <section className="relative border-t border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-3 sm:px-8">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <h2 className="mt-4 font-medium">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Decorative fan of book covers with a "resume" card. Pure CSS, no images. */
function BookShowcase() {
  return (
    <div aria-hidden className="relative mx-auto h-[400px] w-full max-w-[440px] select-none sm:h-[460px]">
      <Cover className="left-[4%] top-[14%] -rotate-[10deg] bg-gradient-to-br from-[#2f4a43] to-[#1c2e29]" title="The Quiet Sea" author="M. Hale" />
      <Cover className="right-[4%] top-[10%] rotate-[8deg] bg-gradient-to-br from-[#7d3b25] to-[#4d2214]" title="Northern Lights" author="A. Ivers" />
      <Cover className="left-1/2 top-[4%] z-10 -translate-x-1/2 bg-gradient-to-br from-[#26314f] to-[#141a2e]" title="A Field Guide to Wonder" author="J. Okafor" />

      <div className="absolute bottom-[4%] left-1/2 z-20 w-[86%] -translate-x-1/2 rounded-2xl border border-border bg-surface/90 p-4 shadow-card backdrop-blur-md">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <MonitorSmartphone className="size-3.5" /> Continue on phone
          </span>
          <span>2 min ago</span>
        </div>
        <p className="mt-2 font-serif text-lg">A Field Guide to Wonder</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-[37%] rounded-full bg-accent" />
          </div>
          <span className="text-xs tabular-nums text-muted">Page 142 · 37%</span>
        </div>
      </div>
    </div>
  );
}

function Cover({ className, title, author }: { className: string; title: string; author: string }) {
  return (
    <div
      className={`absolute flex h-[260px] w-[180px] flex-col justify-between rounded-r-lg rounded-l-sm p-5 text-white shadow-[0_24px_48px_-16px_rgb(0_0_0/0.45)] sm:h-[300px] sm:w-[205px] ${className}`}
    >
      {/* spine highlight */}
      <span className="absolute inset-y-0 left-2.5 w-px bg-white/15" />
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/60">{author}</span>
      <span className="font-serif text-2xl leading-tight">{title}</span>
    </div>
  );
}
