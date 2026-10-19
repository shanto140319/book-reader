type Props = {
  title?: string;
  label?: string;
  className?: string;
};

/** "Opening your book" loader: an open book with pages turning, plus an indeterminate bar. */
export function BookLoader({ title, label = "Opening your book", className = "min-h-dvh" }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-6 px-6 text-center ${className}`}
    >
      <div aria-hidden className="relative h-14 w-20 [perspective:420px]">
        {/* covers */}
        <span className="absolute inset-y-0 left-0 w-1/2 rounded-l-md bg-accent shadow-card" />
        <span className="absolute inset-y-0 right-0 w-1/2 rounded-r-md bg-accent shadow-card" />
        {/* page blocks */}
        <span className="absolute inset-y-1 left-1 right-1/2 rounded-l-sm bg-surface" />
        <span className="absolute inset-y-1 left-1/2 right-1 rounded-r-sm bg-surface" />
        {/* turning pages */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-y-1 left-1/2 right-1 origin-left animate-page-flip rounded-r-sm border-l border-border bg-surface-2 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
        {/* spine */}
        <span className="absolute inset-y-0.5 left-1/2 w-px -translate-x-1/2 bg-black/15" />
      </div>

      <div className="max-w-xs">
        {title && <p className="truncate font-serif text-lg">{title}</p>}
        <p className="mt-1 text-sm text-muted">{label}</p>
      </div>

      <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-accent motion-reduce:animate-none" />
      </div>
    </div>
  );
}
