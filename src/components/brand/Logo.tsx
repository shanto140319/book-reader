/**
 * Pata (পাতা) means both "page" and "leaf" in Bangla, so the mark is a leaf.
 * Same drawing as src/app/icon.svg (the favicon), but coloured by the theme.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-8 shadow-card" />
      <span className="flex items-baseline gap-1.5">
        <span className="font-serif text-xl font-semibold tracking-tight">Pata</span>
        <span lang="bn" className="font-bangla text-sm text-subtle">
          পাতা
        </span>
      </span>
    </span>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`rounded-lg ${className}`} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-accent" />
      <path d="M12 52l6-6" className="stroke-accent-ink" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M17 47C17 28 28 17 48 16C47 36 36 47 17 47Z" className="fill-accent-ink" />
      <path d="M18 46L38 26" className="stroke-accent" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
