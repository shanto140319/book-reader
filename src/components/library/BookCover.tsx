// A typographic cover generated from the title, until real covers arrive.
const PALETTES = [
  ["#2f4a43", "#1c2e29"],
  ["#7d3b25", "#4d2214"],
  ["#26314f", "#141a2e"],
  ["#5b3a5e", "#341f36"],
  ["#6b5a2e", "#3e3318"],
  ["#2e4f63", "#19303e"],
  ["#4a4a4a", "#262626"],
];

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

type Props = {
  title: string;
  label: string;
  /** Rendered first page (data URL). Without it, a typographic cover is generated from the title. */
  image?: string | null;
  mini?: boolean;
};

export function BookCover({ title, label, image, mini = false }: Props) {
  const [from, to] = PALETTES[hash(title) % PALETTES.length];
  return (
    <div
      className={`relative flex aspect-[2/3] w-full flex-col justify-between overflow-hidden text-white ${
        mini ? "rounded-r-[3px] rounded-l-[2px] shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)]" : "rounded-r-md rounded-l-sm p-4"
      }`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {/* generated cover: shown until (or instead of) the real one */}
      <span className={`absolute inset-y-0 w-px bg-white/15 ${mini ? "left-1" : "left-2"}`} />
      {!mini && (
        <>
          <span className="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,rgb(255_255_255/0.12),transparent_60%)]" />
          <span className="relative text-[10px] font-medium uppercase tracking-[0.2em] text-white/60">{label}</span>
          <span className="relative line-clamp-4 font-serif text-lg leading-snug sm:text-xl">{title}</span>
        </>
      )}

      {image && (
        <>
          {/* data URL from IndexedDB, so next/image's optimizer doesn't apply */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="absolute inset-0 size-full animate-fade-in bg-white object-cover object-top" />
          {/* book feel: spine shadow on the left, soft edge on the right, hairline border */}
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.22),rgb(0_0_0/0.05)_5%,transparent_9%,transparent_95%,rgb(0_0_0/0.06))]" />
          <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10" />
        </>
      )}
    </div>
  );
}
